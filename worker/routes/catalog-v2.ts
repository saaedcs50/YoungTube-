import { checkAdminAuth, corsHeaders } from '../lib/cors';
import { CHANNELS_LATEST_MERGED, CUSTOM_CATEGORIES, channelArchiveKey } from '../lib/kv-keys';
import {
  CONTENT_CENTERS, CONTENT_CATEGORY_TAG_ALIASES, CONTENT_TAXONOMY_VERSION,
  LEGACY_CATEGORY_IDS, LEGACY_CATEGORY_TO_CENTER, OPT_IN_CATEGORY_DEFINITIONS,
  SONG_VARIANT_CATEGORIES, isVideoOnlyCategory,
} from '../../shared/contentTaxonomy';
import { classifySongVariantForCandidate, isLikelySongContentTitle, MUSIC_CLASSIFICATION_VERSION } from '../../shared/musicClassification';
import { evaluateShortsPolicy, SHORTS_POLICY_VERSION } from '../../shared/shortsPolicy';
import { getJpegDimensions, parseIsoDuration } from '../lib/helpers';
import { fetchVideos } from '../lib/youtube-api';
import type { Env } from '../lib/types';

const now = () => new Date().toISOString();
const ALL_IDS = ['all', ...CONTENT_CENTERS.map(c => c.id), ...OPT_IN_CATEGORY_DEFINITIONS.map(c => c.id), ...SONG_VARIANT_CATEGORIES.map(c => c.id)];
const SYSTEM_IDS = new Set<string>([...ALL_IDS, ...LEGACY_CATEGORY_IDS]);
const POLICY_VERSION = CONTENT_TAXONOMY_VERSION + '|' + MUSIC_CLASSIFICATION_VERSION + '|' + SHORTS_POLICY_VERSION;
const json = (data: unknown, status = 200, cache = 'no-store') => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache } });

function list(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.categories)) return value.categories;
  if (value && Array.isArray(value.items)) return value.items;
  return [];
}
function builtins(): any[] {
  return [
    { id:'all', name:'كل الفيديوهات', label:'كل الفيديوهات', icon:'✨', emoji:'✨', order:0, scope:'both', categoryType:'system', sourceSelectable:false, requiresFamilyOptIn:false, editable:false, deletable:false },
    ...CONTENT_CENTERS.map((c,i)=>({id:c.id,name:c.label,label:c.label,icon:c.emoji,emoji:c.emoji,order:i+1,description:c.description,scope:'source',categoryType:'center',sourceSelectable:true,requiresFamilyOptIn:false,editable:false,deletable:false,launchTier:c.launchTier})),
    ...OPT_IN_CATEGORY_DEFINITIONS.map((c,i)=>({id:c.id,name:c.label,label:c.label,icon:c.emoji,emoji:c.emoji,order:CONTENT_CENTERS.length+i+1,description:c.description,scope:'source',categoryType:'opt_in',sourceSelectable:true,requiresFamilyOptIn:true,editable:false,deletable:false,launchTier:c.launchTier})),
    ...SONG_VARIANT_CATEGORIES.map((c,i)=>({id:c.id,name:c.label,label:c.label,icon:c.emoji,emoji:c.emoji,order:CONTENT_CENTERS.length+OPT_IN_CATEGORY_DEFINITIONS.length+i+1,description:c.description,scope:'video',categoryType:'video_variant',sourceSelectable:false,requiresFamilyOptIn:false,editable:false,deletable:false})),
  ];
}
function shape(c:any,i:number):any {
  const id=String(c.id||c.categoryId||'').trim(), label=String(c.label||c.name||id).trim();
  const scope=String(c.scope||(isVideoOnlyCategory(id)?'video':'source'));
  const type=String(c.categoryType||c.category_type||(id==='gaming'?'opt_in':isVideoOnlyCategory(id)?'video_variant':'custom'));
  return {id,name:label,label,icon:String(c.icon||c.emoji||'🌟'),emoji:String(c.emoji||c.icon||'🌟'),order:Number(c.order??c.sort_order??i+1),description:String(c.description||''),scope,categoryType:type,
    sourceSelectable:c.sourceSelectable!==undefined?Boolean(c.sourceSelectable):Number(c.source_selectable??(scope==='video'?0:1))===1,
    requiresFamilyOptIn:c.requiresFamilyOptIn!==undefined?Boolean(c.requiresFamilyOptIn):Number(c.requires_family_opt_in??(id==='gaming'?1:0))===1,
    editable:type==='custom',deletable:type==='custom',launchTier:String(c.launchTier||c.launch_tier||'P1')};
}
async function getCategories(env:Env):Promise<any[]> {
  let base=builtins();
  if(env.CATALOG_DB){try{const r=await env.CATALOG_DB.prepare('SELECT id,label,emoji,description,category_type,scope,source_selectable,requires_family_opt_in,launch_tier,sort_order FROM content_categories WHERE active=1 ORDER BY sort_order,id').all<any>();if((r.results||[]).length>=CONTENT_CENTERS.length)base=[builtins()[0],...(r.results||[]).map(shape)];}catch(e){console.warn('D1 categories fallback',String(e));}}
  if(env.CHANNELS_ARCHIVE){try{const raw=await env.CHANNELS_ARCHIVE.get(CUSTOM_CATEGORIES),seen=new Set(base.map(x=>x.id));base.push(...list(raw?JSON.parse(raw):[]).map(shape).filter(c=>c.id&&!seen.has(c.id)&&!SYSTEM_IDS.has(c.id)));}catch{}}
  return base.sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
}
async function readCustom(env:Env):Promise<any[]>{if(!env.CHANNELS_ARCHIVE)throw new Error('kv_unavailable');const raw=await env.CHANNELS_ARCHIVE.get(CUSTOM_CATEGORIES);return list(raw?JSON.parse(raw):[]);}
function categoryHints(source:any):string[]{
  const raw=source?.categories??source?.category, values=Array.isArray(raw)?raw:typeof raw==='string'?raw.split(/[,،]+/):[], out:string[]=[];
  for(const v of values){const tag=String(v||'').trim().toLowerCase();if(!tag||tag==='calm')continue;
    if(tag==='gaming'||tag==='games'||tag==='video_games'||tag==='digital_games'){out.push('gaming');continue;}
    if(Object.prototype.hasOwnProperty.call(LEGACY_CATEGORY_TO_CENTER,tag)){const id=LEGACY_CATEGORY_TO_CENTER[tag];if(id)out.push(id);continue;}
    for(const [id,aliases] of Object.entries(CONTENT_CATEGORY_TAG_ALIASES)){if((aliases as readonly string[]).some(a=>a.toLowerCase()===tag)){out.push(id);break;}}
  }
  return [...new Set(out)];
}
async function seedCategories(env:Env):Promise<void>{
  if(!env.CATALOG_DB)throw new Error('d1_unavailable');const ts=now();
  const stmts=builtins().filter(c=>c.id!=='all').map(c=>env.CATALOG_DB!.prepare('INSERT INTO content_categories (id,label,emoji,description,category_type,scope,source_selectable,requires_family_opt_in,launch_tier,taxonomy_version,sort_order,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET label=excluded.label,emoji=excluded.emoji,description=excluded.description,category_type=excluded.category_type,scope=excluded.scope,source_selectable=excluded.source_selectable,requires_family_opt_in=excluded.requires_family_opt_in,launch_tier=excluded.launch_tier,taxonomy_version=excluded.taxonomy_version,sort_order=excluded.sort_order,active=1,updated_at=excluded.updated_at').bind(c.id,c.label,c.emoji,c.description,c.categoryType,c.scope,c.sourceSelectable?1:0,c.requiresFamilyOptIn?1:0,c.launchTier||'P1',CONTENT_TAXONOMY_VERSION,c.order,1,ts,ts));
  for(let i=0;i<stmts.length;i+=40)await env.CATALOG_DB.batch(stmts.slice(i,i+40));
}
async function upsertSources(env:Env,channels:any[]):Promise<number>{
 if(!env.CATALOG_DB)throw new Error('d1_unavailable');const ts=now();
 const stmts=channels.filter(c=>c?.sourceId).map(c=>env.CATALOG_DB!.prepare('INSERT INTO sources (source_id,source_type,title,source_url,source_class,default_category_hints_json,ingest_mode,source_status,history_depth_limit,last_successful_scan_at,last_discovered_at,next_scan_at,page_token,acceptance_rate,failure_rate,metadata_checked_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source_id) DO UPDATE SET source_type=excluded.source_type,title=excluded.title,source_url=excluded.source_url,default_category_hints_json=excluded.default_category_hints_json,updated_at=excluded.updated_at').bind(String(c.sourceId),['channel','playlist','video'].includes(String(c.sourceType))?String(c.sourceType):'channel',String(c.title||c.name||c.originalName||c.sourceId),String(c.link||''),'CURATED',JSON.stringify(categoryHints(c)),'RECENT_ONLY','ACTIVE',200,null,c.lastUpdated||null,ts,null,null,null,ts,ts,ts));
 for(let i=0;i<stmts.length;i+=40)await env.CATALOG_DB.batch(stmts.slice(i,i+40));return stmts.length;
}
async function getArchive(env:Env,sourceId:string):Promise<any[]>{
 if(!env.CHANNELS_ARCHIVE)throw new Error('kv_unavailable');
 const direct=await env.CHANNELS_ARCHIVE.get(channelArchiveKey(sourceId));if(direct){try{const v=JSON.parse(direct);if(Array.isArray(v))return v;}catch{}}
 const raw=await env.CHANNELS_ARCHIVE.get(CHANNELS_LATEST_MERGED);if(!raw)return [];const channels=JSON.parse(raw);if(!Array.isArray(channels))return [];
 const source=channels.find((c:any)=>String(c?.sourceId||'')===sourceId);return Array.isArray(source?.videos)?source.videos:[];
}
function classify(title:string,hints:string[]):any{
 const music=classifySongVariantForCandidate({title,sourceCategoryHints:hints});
 if(music)return {categoryId:music.publicCategory,format:'SONG_OR_NASHEED',music};
 if(isLikelySongContentTitle(title))return {categoryId:'music_songs',format:'SONG_OR_NASHEED',music:null};
 const topics=[...new Set(hints.filter(id=>CONTENT_CENTERS.some(c=>c.id===id)&&id!=='music_songs'))];
 return {categoryId:topics.length===1?topics[0]:null,format:null,music:null};
}
async function migratePage(env:Env,b:any):Promise<void>{
 if(!env.CATALOG_DB||!env.CHANNELS_ARCHIVE)throw new Error('catalog_bindings_unavailable');
 const sourceId=String(b.sourceId||'');if(!sourceId)throw new Error('missing_source_id');
 const offset=Math.max(0,Number(b.offset)||0),pageSize=Math.max(10,Math.min(100,Number(b.pageSize)||100)),jobId=String(b.jobId||('legacy-migration:'+sourceId));
 const source=await env.CATALOG_DB.prepare('SELECT default_category_hints_json,source_type,title FROM sources WHERE source_id=?').bind(sourceId).first<any>();
 let hints:string[]=[];try{hints=JSON.parse(String(source?.default_category_hints_json||'[]'));}catch{}
 const archive=await getArchive(env,sourceId),page=archive.slice(offset,offset+pageSize),ts=now(),writes:any[]=[],enrich:string[]=[];
 for(const v of page){const id=String(v?.videoId||v?.id||'').trim(),title=String(v?.title||'').trim();if(!id||!title)continue;
  const result=classify(title,hints),published=String(v?.publishedAt||v?.published_at||'');
  writes.push(env.CATALOG_DB.prepare("INSERT INTO videos (video_id,title,published_at,primary_category_id,secondary_tags_json,format,music_variant,music_classification_json,shorts_check_status,review_status,review_reason,review_evidence_json,policy_version,last_seen_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(video_id) DO UPDATE SET title=excluded.title,published_at=COALESCE(excluded.published_at,videos.published_at),primary_category_id=COALESCE(videos.primary_category_id,excluded.primary_category_id),secondary_tags_json=excluded.secondary_tags_json,format=COALESCE(videos.format,excluded.format),music_variant=excluded.music_variant,music_classification_json=COALESCE(videos.music_classification_json,excluded.music_classification_json),last_seen_at=excluded.last_seen_at,updated_at=excluded.updated_at WHERE videos.reviewed_at IS NULL AND videos.review_status!='APPROVED'").bind(id,title,published||null,result.categoryId,JSON.stringify(hints),result.format,result.music?.variant||'STANDARD_OR_UNSPECIFIED',result.music?JSON.stringify(result.music):null,'SHORTS_UNKNOWN','CANDIDATE','legacy_requires_metadata_and_manual_review',JSON.stringify({sourceId,migratedFrom:'CHANNELS_ARCHIVE',taxonomyVersion:CONTENT_TAXONOMY_VERSION,importedAt:ts}),POLICY_VERSION,ts,ts,ts));
  writes.push(env.CATALOG_DB.prepare('INSERT OR IGNORE INTO video_sources(video_id,source_id,discovered_at,source_type) VALUES (?,?,?,?)').bind(id,sourceId,ts,String(source?.source_type||'channel')));
  if(offset===0&&enrich.length<10)enrich.push(id);
 }
 for(let i=0;i<writes.length;i+=40)await env.CATALOG_DB.batch(writes.slice(i,i+40));
 const next=offset+pageSize,more=next<archive.length;
 await env.CATALOG_DB.prepare("INSERT INTO ingest_jobs(job_id,source_id,job_type,status,cursor_json,payload_json,attempts,queued_at,started_at,completed_at,updated_at) VALUES (?,?,?,?,?,?,0,?,?,?,?) ON CONFLICT(job_id) DO UPDATE SET status=excluded.status,cursor_json=excluded.cursor_json,started_at=COALESCE(ingest_jobs.started_at,excluded.started_at),completed_at=excluded.completed_at,updated_at=excluded.updated_at,last_error=NULL").bind(jobId,sourceId,'MIGRATE_SOURCE_PAGE',more?'QUEUED':'SUCCEEDED',JSON.stringify({offset:more?next:archive.length,pageSize,total:archive.length}),JSON.stringify({sourceTitle:String(source?.title||sourceId)}),ts,ts,more?null:ts,ts).run();
 if(offset===0&&enrich.length&&env.CATALOG_PROCESSING_QUEUE){const cfg=await env.CATALOG_DB.prepare('SELECT config_value FROM catalog_config WHERE config_key=?').bind('shorts_pilot_sources').first<any>();let pilot:string[]=[];try{pilot=JSON.parse(String(cfg?.config_value||'[]'));}catch{}if(pilot.includes(sourceId))await env.CATALOG_PROCESSING_QUEUE.send({type:'ENRICH_VIDEO_BATCH',ids:enrich,sourceId,pilot:true},{contentType:'json'});}
 if(more){if(!env.CATALOG_DISCOVERY_QUEUE)throw new Error('discovery_queue_unavailable');await env.CATALOG_DISCOVERY_QUEUE.send({type:'MIGRATE_SOURCE_PAGE',sourceId,offset:next,pageSize,jobId},{contentType:'json'});}
 else await env.CATALOG_DB.prepare('UPDATE sources SET last_successful_scan_at=?,updated_at=? WHERE source_id=?').bind(ts,ts,sourceId).run();
}
async function probeShortsPath(videoId:string):Promise<any>{
 const target='https://www.youtube.com/shorts/'+encodeURIComponent(videoId);
 try{
  const response=await fetch(target,{method:'GET',redirect:'manual',headers:{Range:'bytes=0-0','User-Agent':'Mozilla/5.0 YoungTube-Catalog-Probe'}});
  const location=response.headers.get('location');
  let locationPath:string|null=null;
  try{locationPath=location?new URL(location,target).pathname:null;}catch{}
  const evidence={probeVersion:'youtube-shorts-path-probe-v1',status:response.status,locationPath,contentType:response.headers.get('content-type'),testedAt:now(),usedForDecision:false};
  try{await response.body?.cancel();}catch{}
  return evidence;
 }catch{
  return {probeVersion:'youtube-shorts-path-probe-v1',status:null,locationPath:null,error:'probe_failed',testedAt:now(),usedForDecision:false};
 }
}
async function enrichBatch(env:Env,b:any):Promise<void>{
 if(!env.CATALOG_DB||!env.YOUTUBE_API_KEY)throw new Error('metadata_bindings_unavailable');
 const rawIds:any[]=Array.isArray(b.ids)?b.ids:[];const ids:string[]=Array.from(new Set<string>(rawIds.map((x:any)=>String(x||'').trim()).filter((x:string)=>Boolean(x)))).slice(0,10);if(!ids.length)return;
 const upstream=await fetchVideos({apiKey:env.YOUTUBE_API_KEY.trim(),ids,part:'contentDetails,snippet'});if(!upstream.ok)throw new Error('youtube_metadata_http_'+upstream.status);
 const payload:any=await upstream.json();const found=new Map<string,any>((Array.isArray(payload.items)?payload.items:[]).map((v:any)=>[String(v.id||''),v] as [string,any]));const ts=now(),writes:any[]=[];
 for(const id of ids){const item=found.get(id);if(!item){writes.push(env.CATALOG_DB.prepare("UPDATE videos SET review_status='UNAVAILABLE',review_reason='youtube_metadata_unavailable',metadata_checked_at=?,updated_at=? WHERE video_id=? AND reviewed_at IS NULL").bind(ts,ts,id));continue;}
  const duration=typeof item.contentDetails?.duration==='string'?parseIsoDuration(item.contentDetails.duration):null,published=String(item.snippet?.publishedAt||''),dims=await getJpegDimensions('https://i.ytimg.com/vi/'+id+'/frame0.jpg');
  const decision=evaluateShortsPolicy({durationSeconds:duration,thumbnailIsPortrait:dims ? dims.height > dims.width : null,publishedAt:published});
  const shortsPathProbe=b.pilot===true?await probeShortsPath(id):null;
  const evidence={...decision,thumbnailDimensions:dims?{width:dims.width,height:dims.height}:null,shortsPathProbe};
  const shorts=decision.status==='SHORTS_LIKELY'?'SHORTS':decision.status==='LONG_FORM_LIKELY'?'NOT_SHORTS':decision.status==='NEEDS_REVIEW'?'NEEDS_REVIEW':'SHORTS_UNKNOWN';
  const review=shorts==='SHORTS'?'SHORT_BLOCKED':'NEEDS_REVIEW',reason=shorts==='SHORTS'?'shorts_policy_block':shorts==='NOT_SHORTS'?'awaiting_manual_content_review':'shorts_policy_unresolved';
  writes.push(env.CATALOG_DB.prepare('UPDATE videos SET published_at=COALESCE(?,published_at),duration_seconds=?,frame_width=?,frame_height=?,shorts_check_status=?,shorts_check_evidence_json=?,shorts_path_signal=0,review_status=?,review_reason=?,policy_version=?,metadata_checked_at=?,updated_at=? WHERE video_id=? AND reviewed_at IS NULL').bind(published||null,duration,null,null,shorts,JSON.stringify(evidence),review,reason,POLICY_VERSION,ts,ts,id));
 }
 for(let i=0;i<writes.length;i+=30)await env.CATALOG_DB.batch(writes.slice(i,i+30));
}
async function publishPage(env:Env,b:any):Promise<void>{
 if(!env.CATALOG_DB||!env.CHANNELS_ARCHIVE)throw new Error('catalog_bindings_unavailable');
 const gen=String(b.generationId||''),cat=String(b.categoryId||''),page=Math.max(0,Number(b.pageNumber)||0);if(!gen||!SYSTEM_IDS.has(cat))throw new Error('invalid_generation_page');
 const prior=await env.CATALOG_DB.prepare('SELECT status FROM catalog_generation_page_jobs WHERE generation_id=? AND category_id=? AND page_number=?').bind(gen,cat,page).first<any>();if(prior?.status==='SUCCEEDED')return;
 const rows=await env.CATALOG_DB.prepare('SELECT payload_json FROM catalog_generation_items WHERE generation_id=? AND public_category_id=? AND page_number=? ORDER BY position').bind(gen,cat,page).all<any>();
 const items=(rows.results||[]).map((x:any)=>{try{return JSON.parse(String(x.payload_json));}catch{return null;}}).filter(Boolean);
 await env.CHANNELS_ARCHIVE.put('yt:v2:feed:'+cat+':g'+gen+':p'+page,JSON.stringify({schemaVersion:2,generationId:gen,categoryId:cat,page,pageSize:100,itemCount:items.length,items}));
 const inserted=await env.CATALOG_DB.prepare('INSERT OR IGNORE INTO catalog_generation_page_jobs(generation_id,category_id,page_number,status,updated_at) VALUES (?,?,?,?,?)').bind(gen,cat,page,'SUCCEEDED',now()).run();
 if(Number(inserted.meta?.changes||0)>0)await env.CATALOG_DB.prepare('UPDATE catalog_generations SET manifest_json=json_set(manifest_json,"$.writtenPages",COALESCE(json_extract(manifest_json,"$.writtenPages"),0)+1) WHERE generation_id=? AND status="BUILDING"').bind(gen).run();
 const g=await env.CATALOG_DB.prepare('SELECT status,item_count,manifest_json FROM catalog_generations WHERE generation_id=?').bind(gen).first<any>();if(!g||g.status!=='BUILDING')return;
 let state:any={};try{state=JSON.parse(String(g.manifest_json||'{}'));}catch{}if(Number(state.writtenPages||0)<Number(state.expectedPages||0))return;
 const cr=await env.CATALOG_DB.prepare('SELECT public_category_id,COUNT(*) AS item_count,MAX(page_number)+1 AS page_count FROM catalog_generation_items WHERE generation_id=? GROUP BY public_category_id ORDER BY public_category_id').bind(gen).all<any>();
 const manifest={schemaVersion:2,generationId:gen,taxonomyVersion:CONTENT_TAXONOMY_VERSION,createdAt:state.createdAt||now(),totalApprovedVideos:Number(g.item_count||0),categories:(cr.results||[]).map((c:any)=>({id:c.public_category_id,itemCount:Number(c.item_count||0),pageCount:Number(c.page_count||0)}))};
 await env.CHANNELS_ARCHIVE.put('yt:v2:category-manifest:g'+gen,JSON.stringify(manifest));
 await env.CHANNELS_ARCHIVE.put('yt:v2:active-generation',gen);
 await env.CATALOG_DB.prepare("UPDATE catalog_generations SET status='RETIRED',retired_at=? WHERE status='ACTIVE'").bind(now()).run();
 await env.CATALOG_DB.prepare("UPDATE catalog_generations SET status='ACTIVE',activated_at=? WHERE generation_id=?").bind(now(),gen).run();
 await env.CATALOG_DB.prepare("INSERT INTO catalog_config(config_key,config_value,updated_at) VALUES ('active_generation',?,?) ON CONFLICT(config_key) DO UPDATE SET config_value=excluded.config_value,updated_at=excluded.updated_at").bind(gen,now()).run();
 await env.CATALOG_DB.prepare("INSERT INTO catalog_config(config_key,config_value,updated_at) VALUES ('catalog_mode','published',?) ON CONFLICT(config_key) DO UPDATE SET config_value=excluded.config_value,updated_at=excluded.updated_at").bind(now()).run();
}
async function startRebuild(env:Env):Promise<Response>{
 if(!env.CATALOG_DB||!env.CHANNELS_ARCHIVE||!env.CATALOG_DISCOVERY_QUEUE)return json({error:'catalog_bindings_unavailable',bindings:{kv:Boolean(env.CHANNELS_ARCHIVE),d1:Boolean(env.CATALOG_DB),discoveryQueue:Boolean(env.CATALOG_DISCOVERY_QUEUE),processingQueue:Boolean(env.CATALOG_PROCESSING_QUEUE)}},503);
 const raw=await env.CHANNELS_ARCHIVE.get(CHANNELS_LATEST_MERGED);if(!raw)return json({error:'legacy_catalog_missing'},409);
 let channels:any[];try{channels=JSON.parse(raw);}catch{return json({error:'legacy_catalog_invalid_json'},500);}if(!Array.isArray(channels)||channels.length<10)return json({error:'legacy_catalog_failed_validation',sourceCount:Array.isArray(channels)?channels.length:0},409);
 await seedCategories(env);const sourceCount=await upsertSources(env,channels),pilot:string[]=[];
 const seen=new Set<string>();for(const id of CONTENT_CENTERS.map(c=>c.id)){const c=channels.find(x=>x?.sourceId&&!seen.has(String(x.sourceId))&&categoryHints(x).includes(id));if(c){pilot.push(String(c.sourceId));seen.add(String(c.sourceId));}}
 for(const c of channels){if(pilot.length>=20)break;const id=String(c?.sourceId||'');if(id&&!seen.has(id)){pilot.push(id);seen.add(id);}}
 const ts=now();await env.CATALOG_DB.prepare("INSERT INTO catalog_config(config_key,config_value,updated_at) VALUES ('shorts_pilot_sources',?,?) ON CONFLICT(config_key) DO UPDATE SET config_value=excluded.config_value,updated_at=excluded.updated_at").bind(JSON.stringify(pilot.slice(0,20)),ts).run();
 await env.CATALOG_DB.prepare("INSERT INTO catalog_config(config_key,config_value,updated_at) VALUES ('catalog_mode','shadow',?) ON CONFLICT(config_key) DO UPDATE SET config_value=excluded.config_value,updated_at=excluded.updated_at").bind(ts).run();
 const old=await env.CATALOG_DB.prepare("SELECT job_id,status FROM ingest_jobs WHERE job_id LIKE 'legacy-migration:%'").all<any>(),status=new Map((old.results||[]).map((x:any)=>[String(x.job_id),String(x.status)]));
 const todo=channels.filter(c=>c?.sourceId&&status.get('legacy-migration:'+String(c.sourceId))!=='SUCCEEDED');
 const statements=todo.map(c=>{const id=String(c.sourceId),job='legacy-migration:'+id;return env.CATALOG_DB!.prepare("INSERT INTO ingest_jobs(job_id,source_id,job_type,status,cursor_json,payload_json,attempts,queued_at,updated_at) VALUES (?,?,?,?,?,?,0,?,?) ON CONFLICT(job_id) DO UPDATE SET status='QUEUED',cursor_json=excluded.cursor_json,attempts=0,last_error=NULL,queued_at=excluded.queued_at,updated_at=excluded.updated_at WHERE ingest_jobs.status!='SUCCEEDED'").bind(job,id,'MIGRATE_SOURCE_PAGE','QUEUED',JSON.stringify({offset:0,pageSize:100,total:Array.isArray(c.videos)?c.videos.length:0}),JSON.stringify({sourceTitle:String(c.title||c.name||id)}),ts,ts);});
 for(let i=0;i<statements.length;i+=40)await env.CATALOG_DB.batch(statements.slice(i,i+40));
 const msgs=todo.map(c=>({body:{type:'MIGRATE_SOURCE_PAGE',sourceId:String(c.sourceId),offset:0,pageSize:100,jobId:'legacy-migration:'+String(c.sourceId)},contentType:'json' as const}));
 for(let i=0;i<msgs.length;i+=100)await env.CATALOG_DISCOVERY_QUEUE.sendBatch(msgs.slice(i,i+100));
 return json({ok:true,mode:'shadow',sourceCount,queuedSources:msgs.length,alreadyMigratedSources:channels.length-msgs.length,shortsPilotSources:Math.min(20,pilot.length),taxonomyVersion:CONTENT_TAXONOMY_VERSION,message:'Legacy KV remains active; migrated video rows are unapproved candidates.'},202);
}
export async function handleCatalogV2Routes(req:Request,env:Env,url:URL):Promise<Response|null>{
 const path=url.pathname,method=req.method.toUpperCase();
 if((path==='/api/categories'||path==='/api/admin/categories')&&method==='GET'){if(path==='/api/admin/categories'&&!checkAdminAuth(req,env))return json({error:'unauthorized'},401);return json(await getCategories(env),200,path==='/api/admin/categories'?'no-store':'public, max-age=120, s-maxage=300');}
 if(path==='/api/admin/categories'&&(method==='POST'||method==='PUT')){
  if(!checkAdminAuth(req,env))return json({error:'unauthorized'},401);if(!env.CHANNELS_ARCHIVE)return json({error:'kv_unavailable'},503);
  const b:any=await req.json().catch(()=>null);if(!b||typeof b!=='object')return json({error:'invalid_json'},400);const action=String(b.action||'').toLowerCase(),current=await readCustom(env);
  if(['save','add','update','upsert'].includes(action)){const x=b.category||b.item||b,id=String(x.id||x.categoryId||'').trim(),label=String(x.label||x.name||'').trim();if(!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(id)||id==='all')return json({error:'invalid_category_id'},400);if(SYSTEM_IDS.has(id))return json({error:'system_category_immutable',categoryId:id},409);if(!label||label.length>80)return json({error:'invalid_category_label'},400);const cat={id,name:label,label,icon:String(x.icon||x.emoji||'🌟'),emoji:String(x.emoji||x.icon||'🌟'),order:Number(x.order||current.length+1),description:String(x.description||'').slice(0,500)};const idx=current.findIndex(c=>String(c.id||c.categoryId||'')===id);if(idx>=0)current[idx]={...current[idx],...cat};else current.push(cat);await env.CHANNELS_ARCHIVE.put(CUSTOM_CATEGORIES,JSON.stringify(current));return json({ok:true,category:shape({...cat,categoryType:'custom'},cat.order)});}
  if(['delete','remove'].includes(action)){const id=String(b.id||b.categoryId||b.category?.id||'').trim();if(!id)return json({error:'missing_category_id'},400);if(SYSTEM_IDS.has(id))return json({error:'system_category_immutable',categoryId:id},409);const next=current.filter(c=>String(c.id||c.categoryId||'')!==id);await env.CHANNELS_ARCHIVE.put(CUSTOM_CATEGORIES,JSON.stringify(next));return json({ok:true,id,deleted:next.length!==current.length});}
  if(action==='reorder'){const requested=Array.isArray(b.categories)?b.categories:[],orders=new Map(requested.filter((c:any)=>c&&!SYSTEM_IDS.has(String(c.id||c.categoryId||''))).map((c:any,i:number)=>[String(c.id||c.categoryId),i+1]));const next=current.map(c=>{const id=String(c.id||c.categoryId||'');return orders.has(id)?{...c,order:orders.get(id)}:c;});await env.CHANNELS_ARCHIVE.put(CUSTOM_CATEGORIES,JSON.stringify(next));return json({ok:true,categories:await getCategories(env)});}
  return json({error:'unsupported_category_action'},400);
 }
 if(path==='/api/catalog/v2/manifest'&&method==='GET'){const active=env.CHANNELS_ARCHIVE?String(await env.CHANNELS_ARCHIVE.get('yt:v2:active-generation')||'legacy-kv'):'legacy-kv';let manifest:any=null;if(active!=='legacy-kv'&&env.CHANNELS_ARCHIVE){const raw=await env.CHANNELS_ARCHIVE.get('yt:v2:category-manifest:g'+active);try{manifest=raw?JSON.parse(raw):null;}catch{}}return json({schemaVersion:2,taxonomyVersion:CONTENT_TAXONOMY_VERSION,mode:manifest?'published':'shadow',activeGeneration:active,manifest},200,'public, max-age=30, s-maxage=60');}
 if(path==='/api/catalog/v2/feed'&&method==='GET'){const cat=String(url.searchParams.get('category')||'all');if(!SYSTEM_IDS.has(cat))return json({error:'unknown_category'},400);const active=env.CHANNELS_ARCHIVE?String(await env.CHANNELS_ARCHIVE.get('yt:v2:active-generation')||'legacy-kv'):'legacy-kv',gen=String(url.searchParams.get('generation')||active);if(gen==='legacy-kv')return json({mode:'shadow',generationId:gen,categoryId:cat,items:[],page:0,pageCount:0});const page=Math.max(0,Math.min(10000,parseInt(url.searchParams.get('page')||'0',10)||0));if(!env.CHANNELS_ARCHIVE)return json({error:'kv_unavailable'},503);const raw=await env.CHANNELS_ARCHIVE.get('yt:v2:feed:'+cat+':g'+gen+':p'+page);if(!raw)return json({mode:'published',generationId:gen,categoryId:cat,items:[],page,pageCount:0});try{return json(JSON.parse(raw),200,'public, max-age=30, s-maxage=60');}catch{return json({error:'catalog_page_corrupt'},500);}}
 if(path==='/api/admin/catalog/status'&&method==='GET'){if(!checkAdminAuth(req,env))return json({error:'unauthorized'},401);if(!env.CATALOG_DB)return json({error:'d1_unavailable'},503);const q=await Promise.all([
  env.CATALOG_DB.prepare('SELECT COUNT(*) AS count FROM content_categories WHERE active=1').first<any>(),env.CATALOG_DB.prepare('SELECT COUNT(*) AS count FROM sources').first<any>(),env.CATALOG_DB.prepare('SELECT COUNT(*) AS count FROM videos').first<any>(),env.CATALOG_DB.prepare("SELECT COUNT(*) AS count FROM videos WHERE review_status='CANDIDATE'").first<any>(),env.CATALOG_DB.prepare("SELECT COUNT(*) AS count FROM videos WHERE review_status='NEEDS_REVIEW'").first<any>(),env.CATALOG_DB.prepare("SELECT COUNT(*) AS count FROM videos WHERE review_status='APPROVED' AND shorts_check_status='NOT_SHORTS' AND duration_seconds>0").first<any>(),env.CATALOG_DB.prepare("SELECT COUNT(*) AS count FROM videos WHERE metadata_checked_at IS NOT NULL").first<any>(),env.CATALOG_DB.prepare('SELECT status,COUNT(*) AS count FROM ingest_jobs GROUP BY status').all<any>(),env.CATALOG_DB.prepare("SELECT config_key,config_value FROM catalog_config WHERE config_key IN ('catalog_mode','shorts_pilot_sources')").all<any>()]);
  const cfg=Object.fromEntries((q[8]?.results||[]).map((x:any)=>[x.config_key,x.config_value]));let pilots:any[]=[];try{pilots=JSON.parse(String(cfg.shorts_pilot_sources||'[]'));}catch{}return json({ok:true,schemaVersion:2,taxonomyVersion:CONTENT_TAXONOMY_VERSION,mode:String(cfg.catalog_mode||'shadow'),activeGeneration:env.CHANNELS_ARCHIVE?String(await env.CHANNELS_ARCHIVE.get('yt:v2:active-generation')||'legacy-kv'):'legacy-kv',bindings:{kv:Boolean(env.CHANNELS_ARCHIVE),d1:Boolean(env.CATALOG_DB),discoveryQueue:Boolean(env.CATALOG_DISCOVERY_QUEUE),processingQueue:Boolean(env.CATALOG_PROCESSING_QUEUE)},counts:{categories:Number(q[0]?.count||0),sources:Number(q[1]?.count||0),videos:Number(q[2]?.count||0),candidates:Number(q[3]?.count||0),needsReview:Number(q[4]?.count||0),approvedNonShorts:Number(q[5]?.count||0),metadataChecked:Number(q[6]?.count||0),pilotSources:pilots.length},jobs:q[7]?.results||[]});}
 if(path==='/api/admin/catalog/start-rebuild'&&method==='POST'){if(!checkAdminAuth(req,env))return json({error:'unauthorized'},401);return startRebuild(env);}
 if(path==='/api/admin/catalog/review-queue'&&method==='GET'){if(!checkAdminAuth(req,env))return json({error:'unauthorized'},401);if(!env.CATALOG_DB)return json({error:'d1_unavailable'},503);const limit=Math.max(1,Math.min(100,Number(url.searchParams.get('limit'))||30));const q=await env.CATALOG_DB.prepare("SELECT v.video_id,v.title,v.published_at,v.primary_category_id,v.music_variant,v.music_classification_json,v.shorts_check_status,v.review_status,v.review_reason,v.duration_seconds,v.frame_width,v.frame_height,(SELECT s.title FROM video_sources vs JOIN sources s ON s.source_id=vs.source_id WHERE vs.video_id=v.video_id ORDER BY vs.discovered_at LIMIT 1) AS source_title FROM videos v WHERE v.review_status IN ('CANDIDATE','NEEDS_REVIEW') ORDER BY v.published_at DESC,v.video_id LIMIT ?").bind(limit).all<any>();return json({items:q.results||[]});}
 if(path==='/api/admin/catalog/review'&&method==='POST'){if(!checkAdminAuth(req,env))return json({error:'unauthorized'},401);if(!env.CATALOG_DB)return json({error:'d1_unavailable'},503);const b:any=await req.json().catch(()=>null),id=String(b?.videoId||'').trim(),action=String(b?.action||'').toLowerCase();if(!id||!['approve','reject'].includes(action))return json({error:'invalid_review_request'},400);const v=await env.CATALOG_DB.prepare('SELECT * FROM videos WHERE video_id=?').bind(id).first<any>();if(!v)return json({error:'video_not_found'},404);const ts=now();if(action==='reject'){await env.CATALOG_DB.prepare("UPDATE videos SET review_status='REJECTED',review_reason='manual_rejection',reviewed_at=?,updated_at=? WHERE video_id=?").bind(ts,ts,id).run();return json({ok:true,videoId:id,reviewStatus:'REJECTED'});}const cat=String(b.primaryCategoryId||'').trim();if(!SYSTEM_IDS.has(cat)||cat==='all')return json({error:'invalid_category_id'},400);if(v.shorts_check_status!=='NOT_SHORTS')return json({error:'shorts_not_cleared',status:v.shorts_check_status},409);if(!Number.isFinite(Number(v.duration_seconds))||Number(v.duration_seconds)<=0)return json({error:'duration_unknown'},409);if(cat==='music_songs_no_music'){let m:any=null;try{m=JSON.parse(String(v.music_classification_json||'null'));}catch{}if(m?.publicCategory!=='music_songs_no_music'||m?.matchedField!=='title'||m?.confidence!=='HIGH')return json({error:'explicit_no_music_title_claim_required'},409);}await env.CATALOG_DB.prepare("UPDATE videos SET primary_category_id=?,review_status='APPROVED',review_reason=NULL,review_evidence_json=?,reviewed_at=?,updated_at=? WHERE video_id=?").bind(cat,JSON.stringify({decision:'manual_approval',taxonomyVersion:CONTENT_TAXONOMY_VERSION,shortsPolicyVersion:SHORTS_POLICY_VERSION}),ts,ts,id).run();return json({ok:true,videoId:id,reviewStatus:'APPROVED',primaryCategoryId:cat});}
 if(path==='/api/admin/catalog/publish-generation'&&method==='POST'){if(!checkAdminAuth(req,env))return json({error:'unauthorized'},401);if(!env.CATALOG_DB||!env.CHANNELS_ARCHIVE||!env.CATALOG_PROCESSING_QUEUE)return json({error:'catalog_bindings_unavailable'},503);const c=await env.CATALOG_DB.prepare("SELECT COUNT(DISTINCT video_id) AS count FROM videos WHERE review_status='APPROVED' AND shorts_check_status='NOT_SHORTS' AND duration_seconds>0 AND primary_category_id IS NOT NULL").first<any>(),approved=Number(c?.count||0);if(approved<10)return json({error:'insufficient_approved_content',approvedCount:approved,minimum:10},409);const gen='g'+Date.now().toString(36),ts=now();await env.CATALOG_DB.prepare("INSERT INTO catalog_generations(generation_id,status,created_at,item_count,manifest_json,source_generation_id) VALUES (?,'BUILDING',?,?,?,'legacy-kv')").bind(gen,ts,approved,JSON.stringify({expectedPages:0,writtenPages:0,createdAt:ts,taxonomyVersion:CONTENT_TAXONOMY_VERSION})).run();const sql="WITH base AS (SELECT v.video_id,v.title,v.published_at,v.primary_category_id,v.format,v.music_variant,v.music_classification_json,v.duration_seconds,COALESCE((SELECT vs.source_id FROM video_sources vs WHERE vs.video_id=v.video_id ORDER BY vs.discovered_at LIMIT 1),'') AS source_id,COALESCE((SELECT s.title FROM video_sources vs JOIN sources s ON s.source_id=vs.source_id WHERE vs.video_id=v.video_id ORDER BY vs.discovered_at LIMIT 1),'YoungTube') AS source_title FROM videos v WHERE v.review_status='APPROVED' AND v.shorts_check_status='NOT_SHORTS' AND v.duration_seconds>0 AND v.primary_category_id IS NOT NULL), expanded AS (SELECT *,'all' AS public_category_id FROM base WHERE primary_category_id!='gaming' UNION ALL SELECT *,primary_category_id AS public_category_id FROM base UNION ALL SELECT *,'music_songs' AS public_category_id FROM base WHERE format='SONG_OR_NASHEED' AND primary_category_id NOT IN ('music_songs','music_songs_no_music')), ranked AS (SELECT *,ROW_NUMBER() OVER(PARTITION BY public_category_id ORDER BY published_at DESC,video_id) AS rn FROM expanded) INSERT INTO catalog_generation_items(generation_id,video_id,public_category_id,page_number,position,payload_json) SELECT ?,video_id,public_category_id,CAST((rn-1)/100 AS INTEGER),((rn-1)%100),json_object('videoId',video_id,'title',title,'publishedAt',published_at,'sourceId',source_id,'sourceTitle',source_title,'primaryCategoryId',primary_category_id,'format',format,'musicVariant',music_variant,'musicClassificationJson',music_classification_json,'videoDuration',duration_seconds) FROM ranked";await env.CATALOG_DB.prepare(sql).bind(gen).run();const pages=await env.CATALOG_DB.prepare('SELECT public_category_id,MAX(page_number)+1 AS page_count FROM catalog_generation_items WHERE generation_id=? GROUP BY public_category_id').bind(gen).all<any>(),jobs:any[]=[];for(const row of pages.results||[])for(let page=0;page<Number(row.page_count||0);page++)jobs.push({body:{type:'PUBLISH_GENERATION_PAGE',generationId:gen,categoryId:String(row.public_category_id),pageNumber:page},contentType:'json'});if(!jobs.length){await env.CATALOG_DB.prepare("UPDATE catalog_generations SET status='FAILED',error='no_generation_items' WHERE generation_id=?").bind(gen).run();return json({error:'no_generation_items'},409);}const row=await env.CATALOG_DB.prepare('SELECT manifest_json FROM catalog_generations WHERE generation_id=?').bind(gen).first<any>();let m:any={};try{m=JSON.parse(String(row?.manifest_json||'{}'));}catch{}m.expectedPages=jobs.length;await env.CATALOG_DB.prepare('UPDATE catalog_generations SET manifest_json=? WHERE generation_id=?').bind(JSON.stringify(m),gen).run();for(let i=0;i<jobs.length;i+=100)await env.CATALOG_PROCESSING_QUEUE.sendBatch(jobs.slice(i,i+100));return json({ok:true,generationId:gen,approvedVideos:approved,pagesQueued:jobs.length,activeGenerationUnchanged:true},202);}
 return null;
}
export async function handleCatalogV2QueueBatch(batch:any,env:Env):Promise<void>{
 for(const message of batch.messages||[]){try{const b=message.body||{};if(b.type==='MIGRATE_SOURCE_PAGE')await migratePage(env,b);else if(b.type==='ENRICH_VIDEO_BATCH')await enrichBatch(env,b);else if(b.type==='PUBLISH_GENERATION_PAGE')await publishPage(env,b);else console.warn('Unknown catalog queue message');message.ack();}catch(e){const text=e instanceof Error?e.message:'catalog_queue_error';try{if(env.CATALOG_DB&&message.body?.jobId)await env.CATALOG_DB.prepare("UPDATE ingest_jobs SET status='RETRYING',attempts=attempts+1,last_error=?,updated_at=? WHERE job_id=? AND status!='SUCCEEDED'").bind(text.slice(0,500),now(),String(message.body.jobId)).run();}catch{}console.error('Catalog queue failed',text);message.retry({delaySeconds:Math.min(300,15*Math.max(1,Number(message.attempts||1)))});}}
}
