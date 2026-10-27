import { checkAdminAuth, corsHeaders } from '../lib/cors';
import { CHANNELS_LATEST_MERGED, CUSTOM_CATEGORIES, channelArchiveKey } from '../lib/kv-keys';
import {
  CONTENT_CENTERS, CONTENT_CATEGORY_TAG_ALIASES, CONTENT_TAXONOMY_VERSION,
  LEGACY_CATEGORY_IDS, LEGACY_CATEGORY_TO_CENTER, OPT_IN_CATEGORY_DEFINITIONS,
  SONG_VARIANT_CATEGORIES, isVideoOnlyCategory,
} from '../../shared/contentTaxonomy';
import { classifySongVariantForCandidate, isLikelySongContentTitle, MUSIC_CLASSIFICATION_VERSION } from '../../shared/musicClassification';
import { evaluateShortsPolicy, SHORTS_POLICY_VERSION } from '../../shared/shortsPolicy';
import { VIDEO_SAFETY_REVIEW_VERSION, AUTO_REVIEW_BATCH_SIZE, isAutoReviewCategory, isHighConfidenceSafeAssessment, isHighConfidencePolicyViolation, startPublicYouTubeVideosSafetyInteraction, pollPublicYouTubeVideosSafetyInteraction, deletePublicYouTubeVideosSafetyInteraction, type VideoSafetyBatchResult, type VideoSafetyProviderDiagnostic } from '../lib/catalog-auto-review';
import { getJpegDimensions, parseIsoDuration } from '../lib/helpers';
import { fetchVideos } from '../lib/youtube-api';
import type { Env } from '../lib/types';
import { AUTO_REVIEW_SHADOW_SAMPLE_LIMIT, remainingShadowSampleSlots } from '../lib/catalog-auto-review-scheduling';

const now = () => new Date().toISOString();
const ALL_IDS = ['all', ...CONTENT_CENTERS.map(c => c.id), ...OPT_IN_CATEGORY_DEFINITIONS.map(c => c.id), ...SONG_VARIANT_CATEGORIES.map(c => c.id)];
const SYSTEM_IDS = new Set<string>([...ALL_IDS, ...LEGACY_CATEGORY_IDS]);
const POLICY_VERSION = CONTENT_TAXONOMY_VERSION + '|' + MUSIC_CLASSIFICATION_VERSION + '|' + SHORTS_POLICY_VERSION + '|' + VIDEO_SAFETY_REVIEW_VERSION;
const AUTO_REVIEW_DEFAULT_DAILY_VIDEO_LIMIT = 2000;
const AUTO_REVIEW_MAX_DAILY_VIDEO_LIMIT = 10000;
const AUTO_REVIEW_DEFAULT_DAILY_SECONDS_LIMIT = 8 * 60 * 60;
const AUTO_REVIEW_MAX_DAILY_SECONDS_LIMIT = 72 * 60 * 60;
const AUTO_REVIEW_MAX_VIDEO_SECONDS = 1800;
const AUTO_REVIEW_ENQUEUE_WINDOW_VIDEOS = 500;
const AUTO_REVIEW_RATE_LIMIT_PAUSE_MS = 24 * 60 * 60 * 1000;
const json = (data: unknown, status = 200, cache = 'no-store') => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache } });
async function persistAutoReviewProviderDiagnostic(env:Env, diagnostic:VideoSafetyProviderDiagnostic):Promise<void>{
 if(!env.CATALOG_DB)return;
 await env.CATALOG_DB.prepare("INSERT INTO catalog_config(config_key,config_value,updated_at) VALUES ('auto_review_last_provider_diagnostic',?,?) ON CONFLICT(config_key) DO UPDATE SET config_value=excluded.config_value,updated_at=excluded.updated_at")
  .bind(JSON.stringify(diagnostic),diagnostic.timestamp||now()).run().catch(()=>undefined);
}
function parseAutoReviewDiagnostic(value:unknown):VideoSafetyProviderDiagnostic|null{
 try{const parsed=JSON.parse(String(value||'null'));return parsed&&typeof parsed==='object'&&typeof parsed.outcome==='string'?parsed as VideoSafetyProviderDiagnostic:null;}catch{return null;}
}

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
 const sourceId=String(b.sourceId||'');
 if(!sourceId)throw new Error('missing_source_id');
 const offset=Math.max(0,Number(b.offset)||0);
 const pageSize=Math.max(10,Math.min(100,Number(b.pageSize)||100));
 const jobId=String(b.jobId||('legacy-migration:'+sourceId));
 const source=await env.CATALOG_DB.prepare('SELECT default_category_hints_json,source_type,title,history_depth_limit FROM sources WHERE source_id=?').bind(sourceId).first<any>();
 let hints:string[]=[];
 try{hints=JSON.parse(String(source?.default_category_hints_json||'[]'));}catch{}
 const historyDepth=Math.max(1,Math.min(200,Number(source?.history_depth_limit)||200));
 // Archives are maintained newest-first by mergeAndStoreKVArchive. Migrate only the configured recent window;
 // do not pull unbounded legacy history into the new catalog on rebuilds.
 const archive=(await getArchive(env,sourceId)).slice(0,historyDepth);
 const page=archive.slice(offset,offset+pageSize),ts=now(),writes:any[]=[],enrich:string[]=[];
 for(const v of page){
  const id=String(v?.videoId||v?.id||'').trim();
  if(!id)continue;
  // Copy stable IDs and curator-owned source hints only. Old cached YouTube fields
  // are intentionally not promoted to fresh metadata in the new catalog.
  writes.push(env.CATALOG_DB.prepare(
   "INSERT INTO videos (video_id,title,published_at,primary_category_id,secondary_tags_json,format,music_variant,music_classification_json,shorts_check_status,review_status,review_reason,review_evidence_json,policy_version,last_seen_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(video_id) DO UPDATE SET title='Metadata refresh pending',published_at=NULL,primary_category_id=NULL,format=NULL,music_variant='STANDARD_OR_UNSPECIFIED',music_classification_json=NULL,shorts_check_status='SHORTS_UNKNOWN',shorts_check_evidence_json=NULL,review_status='CANDIDATE',review_reason='awaiting_metadata_refresh',review_evidence_json=excluded.review_evidence_json,policy_version=excluded.policy_version,metadata_checked_at=NULL,metadata_refresh_queued_at=NULL,duration_seconds=NULL,frame_width=NULL,frame_height=NULL,shorts_path_signal=0,last_seen_at=excluded.last_seen_at,updated_at=excluded.updated_at WHERE videos.reviewed_at IS NULL AND videos.review_status NOT IN ('APPROVED','REJECTED') AND (videos.metadata_checked_at IS NULL OR datetime(videos.metadata_checked_at)<=datetime('now','-20 days'))"
  ).bind(id,'Metadata refresh pending',null,null,JSON.stringify(hints),null,'STANDARD_OR_UNSPECIFIED',null,'SHORTS_UNKNOWN','CANDIDATE','awaiting_metadata_refresh',JSON.stringify({sourceId,migratedFrom:'CHANNELS_ARCHIVE',taxonomyVersion:CONTENT_TAXONOMY_VERSION,importedAt:ts}),POLICY_VERSION,ts,ts,ts));
  writes.push(env.CATALOG_DB.prepare('INSERT OR IGNORE INTO video_sources(video_id,source_id,discovered_at,source_type) VALUES (?,?,?,?)').bind(id,sourceId,ts,String(source?.source_type||'channel')));
  if(offset===0&&enrich.length<10)enrich.push(id);
 }
 for(let i=0;i<writes.length;i+=40)await env.CATALOG_DB.batch(writes.slice(i,i+40));
 const next=offset+pageSize,more=next<archive.length;
 await env.CATALOG_DB.prepare("INSERT INTO ingest_jobs(job_id,source_id,job_type,status,cursor_json,payload_json,attempts,queued_at,started_at,completed_at,updated_at) VALUES (?,?,?,?,?,?,0,?,?,?,?) ON CONFLICT(job_id) DO UPDATE SET status=excluded.status,cursor_json=excluded.cursor_json,started_at=COALESCE(ingest_jobs.started_at,excluded.started_at),completed_at=excluded.completed_at,updated_at=excluded.updated_at,last_error=NULL").bind(jobId,sourceId,'MIGRATE_SOURCE_PAGE',more?'QUEUED':'SUCCEEDED',JSON.stringify({offset:more?next:archive.length,pageSize,total:archive.length}),JSON.stringify({sourceTitle:String(source?.title||sourceId)}),ts,ts,more?null:ts,ts).run();
 if(offset===0&&enrich.length&&env.CATALOG_PROCESSING_QUEUE){
  const cfg=await env.CATALOG_DB.prepare('SELECT config_value FROM catalog_config WHERE config_key=?').bind('shorts_pilot_sources').first<any>();
  let pilot:string[]=[];try{pilot=JSON.parse(String(cfg?.config_value||'[]'));}catch{}
  if(pilot.includes(sourceId)){
   await env.CATALOG_DB.batch(enrich.map(id=>env.CATALOG_DB!.prepare('UPDATE videos SET metadata_refresh_queued_at=? WHERE video_id=?').bind(ts,id)));
   await env.CATALOG_PROCESSING_QUEUE.send({type:'ENRICH_VIDEO_BATCH',ids:enrich,sourceId,pilot:true},{contentType:'json'});
  }
 }
 if(more){
  if(!env.CATALOG_DISCOVERY_QUEUE)throw new Error('discovery_queue_unavailable');
  await env.CATALOG_DISCOVERY_QUEUE.send({type:'MIGRATE_SOURCE_PAGE',sourceId,offset:next,pageSize,jobId},{contentType:'json'});
 }else await env.CATALOG_DB.prepare('UPDATE sources SET last_successful_scan_at=?,updated_at=? WHERE source_id=?').bind(ts,ts,sourceId).run();
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
 const rawIds:any[]=Array.isArray(b.ids)?b.ids:[];
 const ids:string[]=Array.from(new Set<string>(rawIds.map((x:any)=>String(x||'').trim()).filter((x:string)=>Boolean(x)))).slice(0,20);
 if(!ids.length)return;
 const placeholders=ids.map(()=>'?').join(',');
 const stored=await env.CATALOG_DB.prepare('SELECT video_id,title,published_at,duration_seconds,review_status,reviewed_at,policy_version,primary_category_id,secondary_tags_json,format,music_variant,music_classification_json,review_reason,review_evidence_json,metadata_checked_at,auto_reviewed_at,auto_review_queued_at FROM videos WHERE video_id IN ('+placeholders+')').bind(...ids).all<any>();
 const storedById=new Map<string,any>((stored.results||[]).map((v:any)=>[String(v.video_id),v]));
 const upstream=await fetchVideos({apiKey:env.YOUTUBE_API_KEY.trim(),ids,part:'contentDetails,snippet'});
 if(!upstream.ok)throw new Error('youtube_metadata_http_'+upstream.status);
 const payload:any=await upstream.json();
 const found=new Map<string,any>((Array.isArray(payload.items)?payload.items:[]).map((v:any)=>[String(v.id||''),v] as [string,any]));
 const ts=now(),writes:any[]=[];
 for(const id of ids){
  const current=storedById.get(id);
  if(!current)continue;
  const item=found.get(id);
  if(!item){
   const keepRejected=current.review_status==='REJECTED';
   writes.push(env.CATALOG_DB.prepare("UPDATE videos SET title='Video unavailable',published_at=NULL,primary_category_id=NULL,format=NULL,music_variant='STANDARD_OR_UNSPECIFIED',music_classification_json=NULL,shorts_check_status='SHORTS_UNKNOWN',shorts_check_evidence_json=NULL,review_status=?,review_reason=?,review_evidence_json=NULL,policy_version=?,reviewed_at=?,metadata_checked_at=?,metadata_refresh_queued_at=NULL,auto_review_queued_at=NULL,auto_reviewed_at=CASE WHEN review_status='REJECTED' THEN auto_reviewed_at ELSE NULL END,duration_seconds=NULL,frame_width=NULL,frame_height=NULL,shorts_path_signal=0,last_seen_at=?,updated_at=? WHERE video_id=?").bind(
    keepRejected?'REJECTED':'UNAVAILABLE',keepRejected?'manual_rejection':'not_returned_by_youtube_metadata_api',POLICY_VERSION,keepRejected?current.reviewed_at:null,ts,ts,ts,id
   ));
   continue;
  }
  const title=String(item.snippet?.title||'').trim()||'Untitled video';
  const published=String(item.snippet?.publishedAt||'');
  const duration=typeof item.contentDetails?.duration==='string'?parseIsoDuration(item.contentDetails.duration):null;
  const dims=await getJpegDimensions('https://i.ytimg.com/vi/'+id+'/frame0.jpg');
  const decision=evaluateShortsPolicy({durationSeconds:duration,thumbnailIsPortrait:dims?dims.height>dims.width:null,publishedAt:published});
  const shortsPathProbe=b.pilot===true?await probeShortsPath(id):null;
  const evidence={...decision,thumbnailDimensions:dims?{width:dims.width,height:dims.height}:null,shortsPathProbe,metadataCheckedAt:ts};
  const shorts=decision.status==='SHORTS_LIKELY'?'SHORTS':decision.status==='LONG_FORM_LIKELY'?'NOT_SHORTS':decision.status==='NEEDS_REVIEW'?'NEEDS_REVIEW':'SHORTS_UNKNOWN';
  const hints=(()=>{try{const parsed=JSON.parse(String(current.secondary_tags_json||'[]'));return Array.isArray(parsed)?parsed.map((x:any)=>String(x)):[];}catch{return [];}})();
  const classification=classify(title,hints);
  const metadataUnchanged=Boolean(current.metadata_checked_at)&&String(current.title||'')===title&&String(current.published_at||'')===String(published||'')&&Number(current.duration_seconds)===Number(duration);
  const policyUnchanged=String(current.policy_version||'')===POLICY_VERSION;
  const wasApproved=current.review_status==='APPROVED',wasRejected=current.review_status==='REJECTED';
  const eligibleForAutoReview=shorts==='NOT_SHORTS'&&duration!==null&&duration>=120&&Boolean(classification.categoryId)&&isAutoReviewCategory(classification.categoryId);
  const retainApproval=wasApproved&&metadataUnchanged&&policyUnchanged&&shorts==='NOT_SHORTS'&&duration!==null&&duration>0;
  const review=wasRejected?'REJECTED':retainApproval?'APPROVED':shorts==='SHORTS'?'SHORT_BLOCKED':eligibleForAutoReview?'CANDIDATE':'NEEDS_REVIEW';
  const reason=wasRejected?'manual_rejection':retainApproval?null:shorts==='SHORTS'?'shorts_policy_block':wasApproved&&!policyUnchanged?'policy_version_changed_requires_review':wasApproved&&!metadataUnchanged?'youtube_metadata_changed_requires_review':shorts!=='NOT_SHORTS'?'shorts_policy_unresolved':duration===null||duration<=0?'duration_unknown':eligibleForAutoReview?'auto_review_pending':'auto_review_scope_excluded';
  const primaryCategory=retainApproval||wasRejected?current.primary_category_id:classification.categoryId;
  const format=retainApproval||wasRejected?current.format:classification.format;
  const musicVariant=retainApproval||wasRejected?String(current.music_variant||'STANDARD_OR_UNSPECIFIED'):(classification.music?.variant||'STANDARD_OR_UNSPECIFIED');
  const musicJson=retainApproval||wasRejected?current.music_classification_json:(classification.music?JSON.stringify(classification.music):null);
  const reviewedAt=retainApproval||wasRejected?current.reviewed_at:null;
  const autoReviewedAt=retainApproval||wasRejected?current.auto_reviewed_at:null;
  const reviewEvidence=retainApproval||wasRejected?current.review_evidence_json:JSON.stringify({metadataRefreshedAt:ts,source:'youtube_videos_list',taxonomyVersion:CONTENT_TAXONOMY_VERSION});
  writes.push(env.CATALOG_DB.prepare('UPDATE videos SET title=?,published_at=?,primary_category_id=?,format=?,music_variant=?,music_classification_json=?,shorts_check_status=?,shorts_check_evidence_json=?,review_status=?,review_reason=?,review_evidence_json=?,policy_version=?,reviewed_at=?,metadata_checked_at=?,metadata_refresh_queued_at=NULL,auto_reviewed_at=?,auto_review_queued_at=NULL,duration_seconds=?,frame_width=NULL,frame_height=NULL,shorts_path_signal=0,last_seen_at=?,updated_at=? WHERE video_id=?').bind(
   title,published||null,primaryCategory,format,musicVariant,musicJson,shorts,JSON.stringify(evidence),review,reason,reviewEvidence,POLICY_VERSION,reviewedAt,ts,autoReviewedAt,duration,ts,ts,id
  ));
 }
 for(let i=0;i<writes.length;i+=30)await env.CATALOG_DB.batch(writes.slice(i,i+30));
 await scheduleCatalogAutoReview(env);
}


type CatalogAutoReviewMode = 'off' | 'shadow' | 'enforce';
interface CatalogAutoReviewSettings {
 mode: CatalogAutoReviewMode;
 dailyVideoLimit: number;
 dailyVideoSecondsLimit: number;
 pauseUntil: string | null;
}
async function getCatalogAutoReviewSettings(env:Env):Promise<CatalogAutoReviewSettings>{
 if(!env.CATALOG_DB)return {mode:'off',dailyVideoLimit:AUTO_REVIEW_DEFAULT_DAILY_VIDEO_LIMIT,dailyVideoSecondsLimit:AUTO_REVIEW_DEFAULT_DAILY_SECONDS_LIMIT,pauseUntil:null};
 const q=await env.CATALOG_DB.prepare("SELECT config_key,config_value FROM catalog_config WHERE config_key IN ('auto_review_mode','auto_review_daily_video_limit','auto_review_daily_seconds_limit','auto_review_pause_until')").all<any>();
 const cfg=Object.fromEntries((q.results||[]).map((row:any)=>[String(row.config_key),String(row.config_value)]));
 const rawMode=String(cfg.auto_review_mode||'off');
 const rawVideos=Number(cfg.auto_review_daily_video_limit||AUTO_REVIEW_DEFAULT_DAILY_VIDEO_LIMIT);
 const rawSeconds=Number(cfg.auto_review_daily_seconds_limit||AUTO_REVIEW_DEFAULT_DAILY_SECONDS_LIMIT);
 return {
  mode:rawMode==='shadow'||rawMode==='enforce'?rawMode:'off',
  dailyVideoLimit:Number.isFinite(rawVideos)?Math.max(1,Math.min(AUTO_REVIEW_MAX_DAILY_VIDEO_LIMIT,Math.floor(rawVideos))):AUTO_REVIEW_DEFAULT_DAILY_VIDEO_LIMIT,
  dailyVideoSecondsLimit:Number.isFinite(rawSeconds)?Math.max(120,Math.min(AUTO_REVIEW_MAX_DAILY_SECONDS_LIMIT,Math.floor(rawSeconds))):AUTO_REVIEW_DEFAULT_DAILY_SECONDS_LIMIT,
  pauseUntil:cfg.auto_review_pause_until||null,
 };
}
async function getCatalogAutoReviewMode(env:Env):Promise<CatalogAutoReviewMode>{
 return (await getCatalogAutoReviewSettings(env)).mode;
}
type AutoReviewScheduleOutcome =
 | 'scheduled'|'mode_off'|'not_configured'|'bindings_unavailable'|'paused'|'budget_exhausted'
 | 'no_eligible_video'|'sample_limit_reached'|'enqueue_window_full'|'reservation_race'|'send_failed'|'lock_busy'|'scheduler_error';
type AutoReviewScheduleResult = {
 scheduleOutcome:AutoReviewScheduleOutcome;
 timestamp:string;
 eligibleCount:number|null;
 scheduledCount:number;
 batchesSent:number;
 shadowSampleLimit:number|null;
 shadowReservedCount:number|null;
};
function makeAutoReviewScheduleResult(scheduleOutcome:AutoReviewScheduleOutcome,extra:Partial<AutoReviewScheduleResult>={}):AutoReviewScheduleResult{
 return {scheduleOutcome,timestamp:now(),eligibleCount:null,scheduledCount:0,batchesSent:0,shadowSampleLimit:null,shadowReservedCount:null,...extra};
}
async function persistAutoReviewScheduleResult(env:Env,result:AutoReviewScheduleResult):Promise<void>{
 if(!env.CATALOG_DB)return;
 await env.CATALOG_DB.prepare("INSERT INTO catalog_config(config_key,config_value,updated_at) VALUES ('auto_review_last_schedule',?,?) ON CONFLICT(config_key) DO UPDATE SET config_value=excluded.config_value,updated_at=excluded.updated_at")
  .bind(JSON.stringify(result),result.timestamp).run().catch(()=>undefined);
}
async function scheduleCatalogAutoReview(env:Env):Promise<AutoReviewScheduleResult>{
 if(!env.CATALOG_DB)return makeAutoReviewScheduleResult('bindings_unavailable');
 const lockToken=crypto.randomUUID(),lockAt=now();
 const lock=await env.CATALOG_DB.prepare("INSERT INTO catalog_config(config_key,config_value,updated_at) VALUES ('auto_review_scheduler_lock',?,?) ON CONFLICT(config_key) DO UPDATE SET config_value=excluded.config_value,updated_at=excluded.updated_at WHERE datetime(catalog_config.updated_at)<=datetime('now','-2 minutes') RETURNING config_value").bind(lockToken,lockAt).first<any>();
 if(!lock)return makeAutoReviewScheduleResult('lock_busy');
 let result:AutoReviewScheduleResult;
 try{
  result=await scheduleCatalogAutoReviewLocked(env);
 }catch{
  result=makeAutoReviewScheduleResult('scheduler_error');
 }finally{
  await env.CATALOG_DB.prepare("DELETE FROM catalog_config WHERE config_key='auto_review_scheduler_lock' AND config_value=?").bind(lockToken).run().catch(()=>undefined);
 }
 await persistAutoReviewScheduleResult(env,result);
 return result;
}
async function scheduleCatalogAutoReviewLocked(env:Env):Promise<AutoReviewScheduleResult>{
 if(!env.CATALOG_DB)return makeAutoReviewScheduleResult('bindings_unavailable');
 const settings=await getCatalogAutoReviewSettings(env);
 if(settings.mode==='off')return makeAutoReviewScheduleResult('mode_off');
 if(settings.pauseUntil&&Date.parse(settings.pauseUntil)>Date.now())return makeAutoReviewScheduleResult('paused');
 if(!env.CATALOG_PROCESSING_QUEUE)return makeAutoReviewScheduleResult('bindings_unavailable');
 if(!env.GEMINI_API_KEY)return makeAutoReviewScheduleResult('not_configured');

 await env.CATALOG_DB.prepare("UPDATE videos SET auto_review_queued_at=NULL WHERE auto_review_queued_at IS NOT NULL AND datetime(auto_review_queued_at)<=datetime('now','-1 day') AND auto_reviewed_at IS NULL").run();

 const usage=await env.CATALOG_DB.prepare("SELECT scanned_count,scanned_video_seconds FROM catalog_auto_review_usage WHERE usage_date=date('now')").first<any>();
 const pending=await env.CATALOG_DB.prepare("SELECT COUNT(*) AS count,COALESCE(SUM(duration_seconds),0) AS seconds FROM videos WHERE auto_review_queued_at IS NOT NULL AND datetime(auto_review_queued_at)>datetime('now','-1 day') AND auto_reviewed_at IS NULL").first<any>();
 const scannedCount=Number(usage?.scanned_count||0),scannedSeconds=Number(usage?.scanned_video_seconds||0);
 const pendingCount=Number(pending?.count||0),pendingSeconds=Number(pending?.seconds||0);
 const secondsLeft=settings.dailyVideoSecondsLimit-scannedSeconds-pendingSeconds;
 let shadowReservedCount:number|null=null,shadowRemainingSlots=Number.POSITIVE_INFINITY;
 if(settings.mode==='shadow'){
  const [shadowRows,reservedRow,failedReservations]=await Promise.all([
   env.CATALOG_DB.prepare("SELECT COUNT(*) AS count FROM videos WHERE auto_reviewed_at IS NOT NULL AND json_extract(review_evidence_json,'$.autoReview.mode')='shadow'").first<any>(),
   env.CATALOG_DB.prepare("SELECT config_value FROM catalog_config WHERE config_key='auto_review_shadow_reserved_count'").first<any>(),
   env.CATALOG_DB.prepare("SELECT COUNT(*) AS count FROM videos WHERE review_reason IN ('auto_review_provider_unavailable','auto_review_provider_auth_failed','auto_review_provider_request_invalid','auto_review_invalid_model_output','auto_review_video_not_accessible','auto_review_rate_limited') AND auto_reviewed_at IS NULL").first<any>(),
  ]);
  // Retry attempts consume daily usage, but do not reserve additional unique Shadow sample slots.
  // Use unique video rows, completed Shadow rows, pending reservations, and the persistent counter;
  // never derive unique sample slots from cumulative attempt usage.
  const historicalFloor=Math.max(Number(shadowRows?.count||0)+pendingCount,Number(failedReservations?.count||0));
  const savedCount=reservedRow?Number(reservedRow.config_value):0;
  shadowReservedCount=Math.max(Number.isFinite(savedCount)?Math.floor(savedCount):0,historicalFloor);
  if(!reservedRow||savedCount<shadowReservedCount){
   await env.CATALOG_DB.prepare("INSERT INTO catalog_config(config_key,config_value,updated_at) VALUES ('auto_review_shadow_reserved_count',?,?) ON CONFLICT(config_key) DO UPDATE SET config_value=excluded.config_value,updated_at=excluded.updated_at").bind(String(shadowReservedCount),now()).run();
  }
  shadowRemainingSlots=remainingShadowSampleSlots(shadowReservedCount,AUTO_REVIEW_SHADOW_SAMPLE_LIMIT);
  if(shadowRemainingSlots<=0)return makeAutoReviewScheduleResult('sample_limit_reached',{shadowSampleLimit:AUTO_REVIEW_SHADOW_SAMPLE_LIMIT,shadowReservedCount});
 }
 const dailySlots=settings.dailyVideoLimit-scannedCount-pendingCount;
 const queueSlots=AUTO_REVIEW_ENQUEUE_WINDOW_VIDEOS-pendingCount;
 if(secondsLeft<120||dailySlots<=0)return makeAutoReviewScheduleResult('budget_exhausted',{shadowSampleLimit:settings.mode==='shadow'?AUTO_REVIEW_SHADOW_SAMPLE_LIMIT:null,shadowReservedCount});
 if(queueSlots<=0)return makeAutoReviewScheduleResult('enqueue_window_full',{shadowSampleLimit:settings.mode==='shadow'?AUTO_REVIEW_SHADOW_SAMPLE_LIMIT:null,shadowReservedCount});
 const slots=Math.min(dailySlots,queueSlots,shadowRemainingSlots);
 if(slots<=0)return makeAutoReviewScheduleResult(settings.mode==='shadow'?'sample_limit_reached':'budget_exhausted',{shadowSampleLimit:settings.mode==='shadow'?AUTO_REVIEW_SHADOW_SAMPLE_LIMIT:null,shadowReservedCount});

 const eligibleWhere="review_status IN ('CANDIDATE','NEEDS_REVIEW') AND reviewed_at IS NULL AND metadata_checked_at>=datetime('now','-20 days') AND shorts_check_status='NOT_SHORTS' AND duration_seconds BETWEEN 120 AND ? AND primary_category_id IN ('learn','science_discovery','stories_programs','arts_crafts','nature_life','music_songs') AND auto_reviewed_at IS NULL AND auto_review_queued_at IS NULL AND (review_reason IS NULL OR review_reason NOT IN ('auto_review_provider_unavailable','auto_review_provider_auth_failed','auto_review_provider_request_invalid','auto_review_rate_limited','auto_review_invalid_model_output','auto_review_video_not_accessible','auto_review_daily_budget_wait') OR updated_at<=datetime('now','-1 day') OR (review_reason='auto_review_daily_budget_wait' AND date(updated_at)<date('now')))";
 const eligibleRow=await env.CATALOG_DB.prepare("SELECT COUNT(*) AS count FROM videos WHERE "+eligibleWhere).bind(AUTO_REVIEW_MAX_VIDEO_SECONDS).first<any>();
 const eligibleCount=Number(eligibleRow?.count||0);
 if(eligibleCount<=0)return makeAutoReviewScheduleResult('no_eligible_video',{eligibleCount:0,shadowSampleLimit:settings.mode==='shadow'?AUTO_REVIEW_SHADOW_SAMPLE_LIMIT:null,shadowReservedCount});
 const q=await env.CATALOG_DB.prepare("SELECT video_id,duration_seconds FROM videos WHERE "+eligibleWhere+" ORDER BY published_at DESC,video_id LIMIT ?").bind(AUTO_REVIEW_MAX_VIDEO_SECONDS,Math.min(slots,AUTO_REVIEW_ENQUEUE_WINDOW_VIDEOS)).all<any>();
 const selected:any[]=[];let reservedSeconds=0;
 for(const row of q.results||[]){
  const seconds=Number(row.duration_seconds||0);
  if(seconds<120||seconds>AUTO_REVIEW_MAX_VIDEO_SECONDS||reservedSeconds+seconds>secondsLeft)continue;
  selected.push({videoId:String(row.video_id),seconds});reservedSeconds+=seconds;
  if(selected.length>=slots)break;
 }
 if(!selected.length)return makeAutoReviewScheduleResult('budget_exhausted',{eligibleCount,shadowSampleLimit:settings.mode==='shadow'?AUTO_REVIEW_SHADOW_SAMPLE_LIMIT:null,shadowReservedCount});
 const queuedAt=now();
 const placeholders=selected.map(()=>'?').join(',');
 const reserved=await env.CATALOG_DB.prepare("UPDATE videos SET auto_review_queued_at=?,updated_at=? WHERE video_id IN ("+placeholders+") AND auto_review_queued_at IS NULL AND auto_reviewed_at IS NULL AND reviewed_at IS NULL AND review_status IN ('CANDIDATE','NEEDS_REVIEW') RETURNING video_id,duration_seconds").bind(queuedAt,queuedAt,...selected.map((row:any)=>row.videoId)).all<any>();
 const rows=(reserved.results||[]).map((row:any)=>({videoId:String(row.video_id),seconds:Number(row.duration_seconds||0)}));
 if(!rows.length)return makeAutoReviewScheduleResult('reservation_race',{eligibleCount,shadowSampleLimit:settings.mode==='shadow'?AUTO_REVIEW_SHADOW_SAMPLE_LIMIT:null,shadowReservedCount});
 if(settings.mode==='shadow'){
  shadowReservedCount=(shadowReservedCount||0)+rows.length;
  await env.CATALOG_DB.prepare("INSERT INTO catalog_config(config_key,config_value,updated_at) VALUES ('auto_review_shadow_reserved_count',?,?) ON CONFLICT(config_key) DO UPDATE SET config_value=excluded.config_value,updated_at=excluded.updated_at").bind(String(shadowReservedCount),now()).run();
 }
 const messages:any[]=[];
 for(let i=0;i<rows.length;i+=AUTO_REVIEW_BATCH_SIZE)messages.push({body:{type:'AUTO_REVIEW_VIDEO_BATCH',videoIds:rows.slice(i,i+AUTO_REVIEW_BATCH_SIZE).map(row=>row.videoId)},contentType:'json'});
 let scheduledCount=0,batchesSent=0;
 try{
  for(let i=0;i<messages.length;i+=100){
   const chunk=messages.slice(i,i+100);
   await env.CATALOG_PROCESSING_QUEUE.sendBatch(chunk);
   for(const message of chunk){batchesSent++;scheduledCount+=Array.isArray(message.body?.videoIds)?message.body.videoIds.length:0;}
  }
 }catch{
  const ids=rows.map(row=>row.videoId);
  for(let i=0;i<ids.length;i+=100)await env.CATALOG_DB.batch(ids.slice(i,i+100).map(id=>env.CATALOG_DB!.prepare('UPDATE videos SET auto_review_queued_at=NULL,updated_at=? WHERE video_id=? AND auto_reviewed_at IS NULL').bind(now(),id)));
  return makeAutoReviewScheduleResult('send_failed',{eligibleCount,scheduledCount,batchesSent,shadowSampleLimit:settings.mode==='shadow'?AUTO_REVIEW_SHADOW_SAMPLE_LIMIT:null,shadowReservedCount});
 }
 return makeAutoReviewScheduleResult('scheduled',{eligibleCount,scheduledCount,batchesSent,shadowSampleLimit:settings.mode==='shadow'?AUTO_REVIEW_SHADOW_SAMPLE_LIMIT:null,shadowReservedCount});
}
function autoReviewErrorReason(error: string): string {
 if(error==='provider_rate_limited')return 'auto_review_rate_limited';
 if(error==='video_not_accessible')return 'auto_review_video_not_accessible';
 if(error==='invalid_model_output')return 'auto_review_invalid_model_output';
 if(error==='provider_auth_failed')return 'auto_review_provider_auth_failed';
 if(error==='provider_request_invalid')return 'auto_review_provider_request_invalid';
 return 'auto_review_provider_unavailable';
}
async function markAutoReviewBatchFailure(env:Env,videoIds:string[],error:string):Promise<void>{
 if(!env.CATALOG_DB)return;
 const reason=autoReviewErrorReason(error);
 if(error==='provider_rate_limited'){
  const pauseUntil=new Date(Date.now()+AUTO_REVIEW_RATE_LIMIT_PAUSE_MS).toISOString();
  await env.CATALOG_DB.prepare("INSERT INTO catalog_config(config_key,config_value,updated_at) VALUES ('auto_review_pause_until',?,?) ON CONFLICT(config_key) DO UPDATE SET config_value=excluded.config_value,updated_at=excluded.updated_at").bind(pauseUntil,now()).run();
 }
 const ids=[...new Set(videoIds)].slice(0,AUTO_REVIEW_BATCH_SIZE);
 if(ids.length)await env.CATALOG_DB.batch(ids.map(id=>env.CATALOG_DB!.prepare("UPDATE videos SET auto_review_queued_at=NULL,review_status='NEEDS_REVIEW',review_reason=?,updated_at=? WHERE video_id=? AND reviewed_at IS NULL AND review_status IN ('CANDIDATE','NEEDS_REVIEW')").bind(reason,now(),id)));
}

async function applyAutoReviewCompletedBatch(
 env:Env,
 videoSnapshots:Array<{videoId:string;category:string;duration:number;metadataCheckedAt:string}>,
 scan:Extract<VideoSafetyBatchResult,{ok:true}>,
 modeAtStart:'shadow'|'enforce',
):Promise<void>{
 if(!env.CATALOG_DB)return;
 const ids=[...new Set(videoSnapshots.map(row=>String(row.videoId||'')).filter(Boolean))].slice(0,AUTO_REVIEW_BATCH_SIZE);
 if(!ids.length)return;
 const placeholders=ids.map(()=>'?').join(',');
 const q=await env.CATALOG_DB.prepare('SELECT video_id,title,primary_category_id,duration_seconds,shorts_check_status,review_status,reviewed_at,metadata_checked_at,review_evidence_json,auto_review_queued_at,auto_reviewed_at FROM videos WHERE video_id IN ('+placeholders+')').bind(...ids).all<any>();
 const byId=new Map<string,any>((q.results||[]).map((v:any)=>[String(v.video_id),v]));
 const assessments=new Map(scan.assessments.map(item=>[item.videoId,item.assessment]));
 const ts=now(),updates:any[]=[],cleanups:any[]=[];
 const liveSettings=await getCatalogAutoReviewSettings(env);
 // Turning enforcement off while an interaction is running must never allow a late automatic decision.
 if(modeAtStart==='enforce'&&liveSettings.mode!=='enforce'){
  for(const id of ids)cleanups.push(env.CATALOG_DB.prepare("UPDATE videos SET auto_review_queued_at=NULL,review_reason='auto_review_mode_changed_before_completion',updated_at=? WHERE video_id=? AND auto_reviewed_at IS NULL").bind(ts,id));
  if(cleanups.length)await env.CATALOG_DB.batch(cleanups);
  await scheduleCatalogAutoReview(env);
  return;
 }
 for(const snapshot of videoSnapshots){
  const id=String(snapshot.videoId),video=byId.get(id),assessment=assessments.get(id);
  if(!video)continue;
  if(video.reviewed_at||['APPROVED','REJECTED','UNAVAILABLE','SHORT_BLOCKED'].includes(String(video.review_status||''))){
   if(video.auto_review_queued_at)cleanups.push(env.CATALOG_DB.prepare('UPDATE videos SET auto_review_queued_at=NULL,updated_at=? WHERE video_id=?').bind(ts,id));
   continue;
  }
  const unchanged=String(video.primary_category_id||'')===snapshot.category
   &&Number(video.duration_seconds||0)===snapshot.duration
   &&String(video.metadata_checked_at||'')===snapshot.metadataCheckedAt
   &&video.shorts_check_status==='NOT_SHORTS'
   &&!video.auto_reviewed_at;
  if(!unchanged||!assessment){
   cleanups.push(env.CATALOG_DB.prepare("UPDATE videos SET auto_review_queued_at=NULL,review_reason='auto_review_metadata_changed_during_scan',updated_at=? WHERE video_id=? AND auto_reviewed_at IS NULL AND reviewed_at IS NULL AND review_status IN ('CANDIDATE','NEEDS_REVIEW')").bind(ts,id));
   continue;
  }
  const category=snapshot.category,duration=snapshot.duration;
  const safe=isHighConfidenceSafeAssessment(assessment,category,duration);
  const violation=isHighConfidencePolicyViolation(assessment);
  let evidence:any={};try{evidence=JSON.parse(String(video.review_evidence_json||'{}'));}catch{}
  evidence.autoReview={mode:modeAtStart,model:scan.model,policyVersion:scan.policyVersion,verdict:assessment.verdict,confidence:assessment.confidence,category:assessment.category,ageAppropriate:assessment.ageAppropriate,contentCoverage:assessment.contentCoverage,audioCoverage:assessment.audioCoverage,policyFlags:assessment.policyFlags,evidenceTimestamps:assessment.evidenceTimestamps,summary:assessment.summary,scannedAt:ts};
  const where="WHERE video_id=? AND reviewed_at IS NULL AND review_status IN ('CANDIDATE','NEEDS_REVIEW') AND shorts_check_status='NOT_SHORTS' AND duration_seconds=? AND primary_category_id=? AND metadata_checked_at=? AND auto_reviewed_at IS NULL";
  if(modeAtStart==='shadow'){
   updates.push(env.CATALOG_DB.prepare("UPDATE videos SET auto_reviewed_at=?,auto_review_queued_at=NULL,review_reason='auto_review_shadow_observation',review_evidence_json=?,updated_at=? "+where).bind(ts,JSON.stringify(evidence),ts,id,duration,category,snapshot.metadataCheckedAt));
  }else if(safe){
   evidence.decision='automated_approval';
   updates.push(env.CATALOG_DB.prepare("UPDATE videos SET review_status='APPROVED',primary_category_id=?,review_reason=NULL,review_evidence_json=?,policy_version=?,reviewed_at=?,auto_reviewed_at=?,auto_review_queued_at=NULL,updated_at=? "+where).bind(category,JSON.stringify(evidence),POLICY_VERSION,ts,ts,ts,id,duration,category,snapshot.metadataCheckedAt));
  }else if(violation){
   evidence.decision='automated_rejection';
   updates.push(env.CATALOG_DB.prepare("UPDATE videos SET review_status='REJECTED',review_reason='auto_review_policy_violation',review_evidence_json=?,policy_version=?,reviewed_at=?,auto_reviewed_at=?,auto_review_queued_at=NULL,updated_at=? "+where).bind(JSON.stringify(evidence),POLICY_VERSION,ts,ts,ts,id,duration,category,snapshot.metadataCheckedAt));
  }else{
   evidence.decision='needs_review';
   updates.push(env.CATALOG_DB.prepare("UPDATE videos SET review_status='NEEDS_REVIEW',review_reason=?,review_evidence_json=?,policy_version=?,auto_reviewed_at=?,auto_review_queued_at=NULL,updated_at=? "+where).bind(assessment.verdict==='UNSAFE'?'auto_review_safety_uncertain':'auto_review_inconclusive',JSON.stringify(evidence),POLICY_VERSION,ts,ts,id,duration,category,snapshot.metadataCheckedAt));
  }
 }
 const statements=[...cleanups,...updates];
 for(let i=0;i<statements.length;i+=40)await env.CATALOG_DB.batch(statements.slice(i,i+40));
 await scheduleCatalogAutoReview(env);
}

async function queueAutoReviewPoll(env:Env,payload:any,delaySeconds=10):Promise<void>{
 if(!env.CATALOG_PROCESSING_QUEUE)throw new Error('processing_queue_unavailable');
 await env.CATALOG_PROCESSING_QUEUE.send({...payload,type:'AUTO_REVIEW_POLL_INTERACTION'},{contentType:'json',delaySeconds});
}

async function autoReviewVideoBatch(env:Env,b:any):Promise<void>{
 if(!env.CATALOG_DB)return;
 const ids=Array.from(new Set<string>((Array.isArray(b?.videoIds)?b.videoIds:[b?.videoId]).map((value:any)=>String(value||'').trim()).filter((x:string)=>Boolean(x)))).slice(0,AUTO_REVIEW_BATCH_SIZE);
 if(!ids.length)return;
 const placeholders=ids.map(()=>'?').join(',');
 const q=await env.CATALOG_DB.prepare('SELECT video_id,title,primary_category_id,duration_seconds,shorts_check_status,review_status,reviewed_at,metadata_checked_at,review_evidence_json,auto_review_queued_at FROM videos WHERE video_id IN ('+placeholders+')').bind(...ids).all<any>();
 const byId=new Map<string,any>((q.results||[]).map((v:any)=>[String(v.video_id),v]));
 const ts=now(),settings=await getCatalogAutoReviewSettings(env);
 const updateQueueMarker=async(reason?:string)=>{
  await env.CATALOG_DB!.batch(ids.map(id=>env.CATALOG_DB!.prepare(reason
   ?"UPDATE videos SET auto_review_queued_at=NULL,review_reason=?,updated_at=? WHERE video_id=? AND auto_reviewed_at IS NULL"
   :"UPDATE videos SET auto_review_queued_at=NULL,updated_at=? WHERE video_id=? AND auto_reviewed_at IS NULL")
   .bind(...(reason?[reason,now(),id]:[now(),id]))));
 };
 if(settings.pauseUntil&&Date.parse(settings.pauseUntil)>Date.now()){await updateQueueMarker('auto_review_rate_limited');return;}
 if(settings.mode==='off'||!env.GEMINI_API_KEY){await updateQueueMarker('auto_review_not_configured');return;}
 const eligible:any[]=[];
 for(const id of ids){
  const video=byId.get(id);if(!video)continue;
  if(video.reviewed_at||['APPROVED','REJECTED','UNAVAILABLE','SHORT_BLOCKED'].includes(String(video.review_status||''))){
   await env.CATALOG_DB.prepare('UPDATE videos SET auto_review_queued_at=NULL,updated_at=? WHERE video_id=?').bind(now(),id).run();continue;
  }
  const category=String(video.primary_category_id||''),duration=Number(video.duration_seconds||0);
  if(video.shorts_check_status!=='NOT_SHORTS'||duration<120||duration>AUTO_REVIEW_MAX_VIDEO_SECONDS||!isAutoReviewCategory(category)||!video.metadata_checked_at||Date.now()-Date.parse(String(video.metadata_checked_at))>=20*24*60*60*1000){
   await env.CATALOG_DB.prepare("UPDATE videos SET auto_review_queued_at=NULL,review_status='NEEDS_REVIEW',review_reason='auto_review_scope_excluded',updated_at=? WHERE video_id=?").bind(now(),id).run();continue;
  }
  eligible.push({videoId:id,title:String(video.title||''),category,duration,metadataCheckedAt:String(video.metadata_checked_at),video});
 }
 if(!eligible.length){await updateQueueMarker();await scheduleCatalogAutoReview(env);return;}
 const totalSeconds=eligible.reduce((total,row)=>total+row.duration,0);
 const reserved=await env.CATALOG_DB.prepare("INSERT INTO catalog_auto_review_usage (usage_date,scanned_count,scanned_video_seconds,updated_at) VALUES (date('now'),?,?,?) ON CONFLICT(usage_date) DO UPDATE SET scanned_count=scanned_count+excluded.scanned_count,scanned_video_seconds=scanned_video_seconds+excluded.scanned_video_seconds,updated_at=excluded.updated_at WHERE scanned_count+excluded.scanned_count<=? AND scanned_video_seconds+excluded.scanned_video_seconds<=? RETURNING usage_date").bind(eligible.length,totalSeconds,ts,settings.dailyVideoLimit,settings.dailyVideoSecondsLimit).first<any>();
 if(!reserved){await updateQueueMarker('auto_review_daily_budget_wait');return;}
 const start=await startPublicYouTubeVideosSafetyInteraction(env.GEMINI_API_KEY,eligible.map(row=>({videoId:row.videoId,title:row.title,expectedCategory:row.category})));
 if(start.ok===false){
  const diagnostic:VideoSafetyProviderDiagnostic={...start.diagnostic,outcome:'failed',timestamp:now(),error:start.error,videoCount:eligible.length,diagnosticOnly:false};
  await persistAutoReviewProviderDiagnostic(env,diagnostic);
  await markAutoReviewBatchFailure(env,eligible.map(row=>row.videoId),start.error);
  return;
 }
 const videoSnapshots=eligible.map(row=>({videoId:row.videoId,category:row.category,duration:row.duration,metadataCheckedAt:row.metadataCheckedAt}));
 const pendingDiagnostic:VideoSafetyProviderDiagnostic={outcome:'pending',stage:'interaction',timestamp:now(),model:start.model,videoCount:eligible.length,interactionId:start.interactionId,interactionStatus:start.status,diagnosticOnly:false,message:'Gemini accepted the background review request; results are pending.'};
 await persistAutoReviewProviderDiagnostic(env,pendingDiagnostic);
 try{
  await queueAutoReviewPoll(env,{interactionId:start.interactionId,videoIds:eligible.map(row=>row.videoId),videoSnapshots,modeAtStart:settings.mode,diagnosticOnly:false,pollAttempt:0});
 }catch{
  await deletePublicYouTubeVideosSafetyInteraction(env.GEMINI_API_KEY,start.interactionId);
  await persistAutoReviewProviderDiagnostic(env,{...pendingDiagnostic,outcome:'failed',timestamp:now(),error:'provider_unavailable',message:'Could not enqueue the background interaction poll.',interactionStatus:'poll_enqueue_failed'});
  await markAutoReviewBatchFailure(env,eligible.map(row=>row.videoId),'provider_unavailable');
 }
}

async function pollAutoReviewInteraction(env:Env,b:any):Promise<void>{
 if(!env.CATALOG_DB)return;
 const interactionId=String(b.interactionId||'').trim();
 const ids=Array.from(new Set<string>((Array.isArray(b.videoIds)?b.videoIds:[]).map((value:any)=>String(value||'').trim()).filter(Boolean))).slice(0,AUTO_REVIEW_BATCH_SIZE);
 const diagnosticOnly=b.diagnosticOnly===true;
 const failDiagnosticOnly=async(diagnostic:VideoSafetyProviderDiagnostic)=>{
  await persistAutoReviewProviderDiagnostic(env,{...diagnostic,outcome:'failed',timestamp:now(),diagnosticOnly:true});
 };
 if(!interactionId||!ids.length||!env.GEMINI_API_KEY){
  const diagnostic:VideoSafetyProviderDiagnostic={outcome:'failed',stage:'interaction',timestamp:now(),model:'gemini-3.8-flash',error:'provider_unavailable',videoCount:ids.length,diagnosticOnly,message:'The background review poll is missing its interaction ID, video IDs, or provider key.'};
  await persistAutoReviewProviderDiagnostic(env,diagnostic);
  if(!diagnosticOnly)await markAutoReviewBatchFailure(env,ids,'provider_unavailable');
  return;
 }
 const poll=await pollPublicYouTubeVideosSafetyInteraction(env.GEMINI_API_KEY,interactionId,ids);
 const attempt=Math.max(0,Math.floor(Number(b.pollAttempt)||0));
 if(poll.ok&&poll.pending){
  if(attempt>=59){
   await deletePublicYouTubeVideosSafetyInteraction(env.GEMINI_API_KEY,interactionId);
   const diagnostic:VideoSafetyProviderDiagnostic={...poll.diagnostic,outcome:'failed',timestamp:now(),error:'provider_unavailable',diagnosticOnly,interactionStatus:'timeout',message:'Gemini background interaction exceeded the 10-minute polling window.'};
   await persistAutoReviewProviderDiagnostic(env,diagnostic);
   if(!diagnosticOnly)await markAutoReviewBatchFailure(env,ids,'provider_unavailable');
   return;
  }
  await persistAutoReviewProviderDiagnostic(env,{...poll.diagnostic,outcome:'pending',timestamp:now(),diagnosticOnly});
  const next={...b,pollAttempt:attempt+1};
  await queueAutoReviewPoll(env,next,10);
  return;
 }
 await deletePublicYouTubeVideosSafetyInteraction(env.GEMINI_API_KEY,interactionId);
 if(poll.ok===false){
  const diagnostic:VideoSafetyProviderDiagnostic={...poll.diagnostic,outcome:'failed',timestamp:now(),error:poll.error,interactionId,diagnosticOnly};
  if(diagnosticOnly)await failDiagnosticOnly(diagnostic);
  else{
   await persistAutoReviewProviderDiagnostic(env,diagnostic);
   await markAutoReviewBatchFailure(env,ids,poll.error);
  }
  return;
 }
 const successDiagnostic:VideoSafetyProviderDiagnostic={outcome:'success',stage:'response',timestamp:now(),model:poll.model,httpStatus:200,videoCount:ids.length,diagnosticOnly,interactionStatus:'completed',message:diagnosticOnly?'Gemini completed a valid one-video diagnostic. No review result was saved.':'Gemini completed the requested video review interaction.'};
 await persistAutoReviewProviderDiagnostic(env,successDiagnostic);
 if(diagnosticOnly)return;
 const snapshots=Array.isArray(b.videoSnapshots)?b.videoSnapshots:[];
 await applyAutoReviewCompletedBatch(env,snapshots,poll,b.modeAtStart==='enforce'?'enforce':'shadow');
}

export async function scheduleCatalogMetadataRefresh(env:Env):Promise<void>{
 if(!env.CATALOG_DB)return;
 // Hard-delete expired API-derived metadata even if the YouTube key/queue is unavailable.
 await env.CATALOG_DB.prepare("UPDATE videos SET title='Metadata refresh pending',published_at=NULL,primary_category_id=NULL,format=NULL,music_variant='STANDARD_OR_UNSPECIFIED',music_classification_json=NULL,shorts_check_status='SHORTS_UNKNOWN',shorts_check_evidence_json=NULL,review_status=CASE WHEN review_status='REJECTED' THEN 'REJECTED' ELSE 'CANDIDATE' END,review_reason=CASE WHEN review_status='REJECTED' THEN 'manual_rejection' ELSE 'metadata_expired' END,review_evidence_json=CASE WHEN review_status='REJECTED' THEN review_evidence_json ELSE NULL END,policy_version=?,reviewed_at=CASE WHEN review_status='REJECTED' THEN reviewed_at ELSE NULL END,metadata_checked_at=NULL,metadata_refresh_queued_at=NULL,auto_review_queued_at=NULL,auto_reviewed_at=CASE WHEN review_status='REJECTED' THEN auto_reviewed_at ELSE NULL END,duration_seconds=NULL,frame_width=NULL,frame_height=NULL,shorts_path_signal=0,updated_at=? WHERE metadata_checked_at IS NOT NULL AND datetime(metadata_checked_at)<=datetime('now','-30 days')").bind(POLICY_VERSION,now()).run();
 await env.CATALOG_DB.prepare("UPDATE catalog_generation_items SET payload_json='{}' WHERE generation_id IN (SELECT generation_id FROM catalog_generations WHERE status IN ('FAILED','RETIRED') AND datetime(created_at)<=datetime('now','-1 hour'))").run();
 if(!env.CATALOG_PROCESSING_QUEUE||!env.YOUTUBE_API_KEY){await scheduleCatalogAutoReview(env);await scheduleCatalogGenerationRefresh(env);return;}
 const result=await env.CATALOG_DB.prepare("SELECT video_id FROM videos WHERE review_status!='REJECTED' AND (metadata_checked_at IS NULL OR datetime(metadata_checked_at)<=datetime('now','-20 days')) AND (metadata_refresh_queued_at IS NULL OR datetime(metadata_refresh_queued_at)<=datetime('now','-1 day')) ORDER BY COALESCE(metadata_checked_at,'1970-01-01T00:00:00Z'),video_id LIMIT 4000").all<any>();
 const ids=(result.results||[]).map((row:any)=>String(row.video_id||'')).filter(Boolean);
 if(ids.length){
  const queuedAt=now();
  for(let i=0;i<ids.length;i+=100)await env.CATALOG_DB.batch(ids.slice(i,i+100).map(id=>env.CATALOG_DB!.prepare('UPDATE videos SET metadata_refresh_queued_at=? WHERE video_id=?').bind(queuedAt,id)));
  try{
   for(let i=0;i<ids.length;i+=20)await env.CATALOG_PROCESSING_QUEUE.send({type:'ENRICH_VIDEO_BATCH',ids:ids.slice(i,i+20),scheduledRefresh:true},{contentType:'json'});
  }catch(error){
   for(let i=0;i<ids.length;i+=100)await env.CATALOG_DB.batch(ids.slice(i,i+100).map(id=>env.CATALOG_DB!.prepare('UPDATE videos SET metadata_refresh_queued_at=NULL WHERE video_id=?').bind(id)));
   throw error;
  }
 }
 await scheduleCatalogAutoReview(env);
 await scheduleCatalogGenerationRefresh(env);
}

async function enqueueApprovedGeneration(env:Env,minimumDefaultItems:number,sourceGeneration:string):Promise<any>{
 if(!env.CATALOG_DB||!env.CHANNELS_ARCHIVE||!env.CATALOG_PROCESSING_QUEUE)return {ok:false,error:'catalog_bindings_unavailable'};
 const count=await env.CATALOG_DB.prepare("SELECT COUNT(DISTINCT video_id) AS count FROM videos WHERE review_status='APPROVED' AND reviewed_at IS NOT NULL AND shorts_check_status='NOT_SHORTS' AND duration_seconds>0 AND metadata_checked_at>=datetime('now','-20 days') AND primary_category_id IS NOT NULL AND primary_category_id!='gaming'").first<any>();
 const approved=Number(count?.count||0);
 if(approved<minimumDefaultItems)return {ok:false,error:'insufficient_approved_content',approvedCount:approved,minimum:minimumDefaultItems};
 const floor=await env.CATALOG_DB.prepare("SELECT MIN(metadata_checked_at) AS floor FROM videos WHERE review_status='APPROVED' AND reviewed_at IS NOT NULL AND shorts_check_status='NOT_SHORTS' AND duration_seconds>0 AND metadata_checked_at>=datetime('now','-20 days') AND primary_category_id IS NOT NULL").first<any>();
 const gen='g'+Date.now().toString(36),ts=now();
 await env.CATALOG_DB.prepare("INSERT INTO catalog_generations(generation_id,status,created_at,item_count,manifest_json,source_generation_id) VALUES (?,'BUILDING',?,?,?,?)").bind(gen,ts,approved,JSON.stringify({expectedPages:0,writtenPages:0,createdAt:ts,taxonomyVersion:CONTENT_TAXONOMY_VERSION,metadataCheckedAtFloor:String(floor?.floor||ts)}),sourceGeneration).run();
 const sql="WITH base AS (SELECT v.video_id,v.title,v.published_at,v.primary_category_id,v.format,v.music_variant,v.music_classification_json,v.duration_seconds,v.metadata_checked_at,COALESCE((SELECT vs.source_id FROM video_sources vs WHERE vs.video_id=v.video_id ORDER BY vs.discovered_at LIMIT 1),'') AS source_id,COALESCE((SELECT s.title FROM video_sources vs JOIN sources s ON s.source_id=vs.source_id WHERE vs.video_id=v.video_id ORDER BY vs.discovered_at LIMIT 1),'YoungTube') AS source_title FROM videos v WHERE v.review_status='APPROVED' AND v.reviewed_at IS NOT NULL AND v.shorts_check_status='NOT_SHORTS' AND v.duration_seconds>0 AND v.metadata_checked_at>=datetime('now','-20 days') AND v.primary_category_id IS NOT NULL), expanded AS (SELECT *,'all' AS public_category_id FROM base WHERE primary_category_id!='gaming' UNION ALL SELECT *,primary_category_id AS public_category_id FROM base UNION ALL SELECT *,'music_songs' AS public_category_id FROM base WHERE format='SONG_OR_NASHEED' AND primary_category_id NOT IN ('music_songs','music_songs_no_music','gaming')), ranked AS (SELECT *,ROW_NUMBER() OVER(PARTITION BY public_category_id ORDER BY published_at DESC,video_id) AS rn FROM expanded) INSERT INTO catalog_generation_items(generation_id,video_id,public_category_id,page_number,position,payload_json) SELECT ?,video_id,public_category_id,CAST((rn-1)/100 AS INTEGER),((rn-1)%100),json_object('videoId',video_id,'title',title,'publishedAt',published_at,'sourceId',source_id,'sourceTitle',source_title,'primaryCategoryId',primary_category_id,'format',format,'musicVariant',music_variant,'musicClassificationJson',music_classification_json,'videoDuration',duration_seconds,'metadataCheckedAt',metadata_checked_at) FROM ranked";
 await env.CATALOG_DB.prepare(sql).bind(gen).run();
 const pageRows=await env.CATALOG_DB.prepare('SELECT public_category_id,MAX(page_number)+1 AS page_count FROM catalog_generation_items WHERE generation_id=? GROUP BY public_category_id').bind(gen).all<any>();
 const jobs:any[]=[];
 for(const row of pageRows.results||[])for(let page=0;page<Number(row.page_count||0);page++)jobs.push({body:{type:'PUBLISH_GENERATION_PAGE',generationId:gen,categoryId:String(row.public_category_id),pageNumber:page},contentType:'json'});
 if(!jobs.length){await env.CATALOG_DB.prepare("UPDATE catalog_generations SET status='FAILED',error='no_generation_items' WHERE generation_id=?").bind(gen).run();return {ok:false,error:'no_generation_items',generationId:gen};}
 const detail=await env.CATALOG_DB.prepare('SELECT manifest_json FROM catalog_generations WHERE generation_id=?').bind(gen).first<any>();
 let manifest:any={};try{manifest=JSON.parse(String(detail?.manifest_json||'{}'));}catch{}
 manifest.expectedPages=jobs.length;
 await env.CATALOG_DB.prepare('UPDATE catalog_generations SET manifest_json=? WHERE generation_id=?').bind(JSON.stringify(manifest),gen).run();
 for(let i=0;i<jobs.length;i+=100)await env.CATALOG_PROCESSING_QUEUE.sendBatch(jobs.slice(i,i+100));
 return {ok:true,generationId:gen,approvedVideos:approved,pagesQueued:jobs.length,activeGenerationUnchanged:true};
}

async function scheduleCatalogGenerationRefresh(env:Env):Promise<void>{
 if(!env.CATALOG_DB||!env.CHANNELS_ARCHIVE||!env.CATALOG_PROCESSING_QUEUE)return;
 const mode=await env.CATALOG_DB.prepare("SELECT config_value FROM catalog_config WHERE config_key='catalog_mode'").first<any>();
 if(String(mode?.config_value||'')!=='published')return;
 const building=await env.CATALOG_DB.prepare("SELECT generation_id,created_at FROM catalog_generations WHERE status='BUILDING' ORDER BY created_at DESC LIMIT 1").first<any>();
 if(building){
  if(Date.now()-Date.parse(String(building.created_at||''))<60*60*1000)return;
  await env.CATALOG_DB.prepare("UPDATE catalog_generations SET status='FAILED',error='build_timeout' WHERE generation_id=? AND status='BUILDING'").bind(String(building.generation_id)).run();
  await env.CATALOG_DB.prepare("UPDATE catalog_generation_items SET payload_json='{}' WHERE generation_id=?").bind(String(building.generation_id)).run();
 }
 const active=await env.CATALOG_DB.prepare("SELECT generation_id,activated_at,manifest_json FROM catalog_generations WHERE status='ACTIVE' ORDER BY activated_at DESC LIMIT 1").first<any>();
 if(!active)return;
 const currentRows=await env.CATALOG_DB.prepare("SELECT video_id FROM videos WHERE review_status='APPROVED' AND reviewed_at IS NOT NULL AND shorts_check_status='NOT_SHORTS' AND duration_seconds>0 AND metadata_checked_at>=datetime('now','-20 days') AND primary_category_id IS NOT NULL AND primary_category_id!='gaming'").all<any>();
 const activeRows=await env.CATALOG_DB.prepare("SELECT video_id FROM catalog_generation_items WHERE generation_id=? AND public_category_id='all'").bind(String(active.generation_id)).all<any>();
 const current=new Set((currentRows.results||[]).map((x:any)=>String(x.video_id)));
 const existing=new Set((activeRows.results||[]).map((x:any)=>String(x.video_id)));
 let manifest:any={};try{manifest=JSON.parse(String(active.manifest_json||'{}'));}catch{}
 const floorTime=Date.parse(String(manifest.metadataCheckedAtFloor||''));
 const floorExpired=!Number.isFinite(floorTime)||Date.now()-floorTime>=20*24*60*60*1000;
 const changed=current.size!==existing.size||[...current].some(id=>!existing.has(id));
 if(!changed&&!floorExpired)return;
 await enqueueApprovedGeneration(env,1,String(active.generation_id));
}

async function publishPage(env:Env,b:any):Promise<void>{
 if(!env.CATALOG_DB||!env.CHANNELS_ARCHIVE)throw new Error('catalog_bindings_unavailable');
 const gen=String(b.generationId||''),cat=String(b.categoryId||''),page=Math.max(0,Number(b.pageNumber)||0);
 if(!gen||!SYSTEM_IDS.has(cat))throw new Error('invalid_generation_page');
 const prior=await env.CATALOG_DB.prepare('SELECT status FROM catalog_generation_page_jobs WHERE generation_id=? AND category_id=? AND page_number=?').bind(gen,cat,page).first<any>();
 if(prior?.status==='SUCCEEDED')return;
 const rows=await env.CATALOG_DB.prepare('SELECT payload_json FROM catalog_generation_items WHERE generation_id=? AND public_category_id=? AND page_number=? ORDER BY position').bind(gen,cat,page).all<any>();
 const items=(rows.results||[]).map((x:any)=>{try{return JSON.parse(String(x.payload_json));}catch{return null;}}).filter(Boolean);
 const checks=items.map((item:any)=>Date.parse(String(item.metadataCheckedAt||'')));
 if(items.length>0&&(checks.some((v:number)=>!Number.isFinite(v))||checks.some((v:number)=>Date.now()-v>=30*24*60*60*1000)))throw new Error('catalog_page_metadata_stale');
 const expiresAt=items.length>0?Math.floor(Math.min(...checks)/1000)+30*24*60*60:Math.floor(Date.now()/1000)+30*24*60*60;
 if(expiresAt<=Math.floor(Date.now()/1000)+60)throw new Error('catalog_page_metadata_expiring');
 await env.CHANNELS_ARCHIVE.put('yt:v2:feed:'+cat+':g'+gen+':p'+page,JSON.stringify({mode:'published',schemaVersion:2,generationId:gen,categoryId:cat,page,pageSize:100,itemCount:items.length,items}),{expiration:expiresAt});
 const inserted=await env.CATALOG_DB.prepare('INSERT OR IGNORE INTO catalog_generation_page_jobs(generation_id,category_id,page_number,status,updated_at) VALUES (?,?,?,?,?)').bind(gen,cat,page,'SUCCEEDED',now()).run();
 if(Number(inserted.meta?.changes||0)>0)await env.CATALOG_DB.prepare('UPDATE catalog_generations SET manifest_json=json_set(manifest_json,"$.writtenPages",COALESCE(json_extract(manifest_json,"$.writtenPages"),0)+1) WHERE generation_id=? AND status="BUILDING"').bind(gen).run();
 const g=await env.CATALOG_DB.prepare('SELECT status,item_count,manifest_json FROM catalog_generations WHERE generation_id=?').bind(gen).first<any>();
 if(!g||g.status!=='BUILDING')return;
 let state:any={};try{state=JSON.parse(String(g.manifest_json||'{}'));}catch{}
 if(Number(state.writtenPages||0)<Number(state.expectedPages||0))return;
 const cr=await env.CATALOG_DB.prepare('SELECT public_category_id,COUNT(*) AS item_count,MAX(page_number)+1 AS page_count FROM catalog_generation_items WHERE generation_id=? GROUP BY public_category_id ORDER BY public_category_id').bind(gen).all<any>();
 const manifest={schemaVersion:2,generationId:gen,taxonomyVersion:CONTENT_TAXONOMY_VERSION,createdAt:state.createdAt||now(),metadataCheckedAtFloor:state.metadataCheckedAtFloor||now(),totalApprovedVideos:Number(g.item_count||0),categories:(cr.results||[]).map((x:any)=>({id:x.public_category_id,itemCount:Number(x.item_count||0),pageCount:Number(x.page_count||0)}))};
 await env.CHANNELS_ARCHIVE.put('yt:v2:category-manifest:g'+gen,JSON.stringify(manifest));
 await env.CHANNELS_ARCHIVE.put('yt:v2:active-generation',gen);
 await env.CATALOG_DB.prepare("UPDATE catalog_generations SET status='RETIRED',retired_at=? WHERE status='ACTIVE'").bind(now()).run();
 await env.CATALOG_DB.prepare("UPDATE catalog_generations SET status='ACTIVE',activated_at=? WHERE generation_id=?").bind(now(),gen).run();
 await env.CATALOG_DB.prepare("INSERT INTO catalog_config(config_key,config_value,updated_at) VALUES ('active_generation',?,?) ON CONFLICT(config_key) DO UPDATE SET config_value=excluded.config_value,updated_at=excluded.updated_at").bind(gen,now()).run();
 await env.CATALOG_DB.prepare("INSERT INTO catalog_config(config_key,config_value,updated_at) VALUES ('catalog_mode','published',?) ON CONFLICT(config_key) DO UPDATE SET config_value=excluded.config_value,updated_at=excluded.updated_at").bind(now()).run();
 // KV is the published feed cache. Do not retain a second copy of API-derived titles/dates there.
 await env.CATALOG_DB.prepare("UPDATE catalog_generation_items SET payload_json='{}' WHERE generation_id=?").bind(gen).run();
}

async function startRebuild(env:Env):Promise<Response>{
 if(!env.CATALOG_DB||!env.CHANNELS_ARCHIVE||!env.CATALOG_DISCOVERY_QUEUE)return json({error:'catalog_bindings_unavailable',bindings:{kv:Boolean(env.CHANNELS_ARCHIVE),d1:Boolean(env.CATALOG_DB),discoveryQueue:Boolean(env.CATALOG_DISCOVERY_QUEUE),processingQueue:Boolean(env.CATALOG_PROCESSING_QUEUE)}},503);
 const raw=await env.CHANNELS_ARCHIVE.get(CHANNELS_LATEST_MERGED);
 if(!raw)return json({error:'legacy_catalog_missing'},409);
 let channels:any[];
 try{channels=JSON.parse(raw);}catch{return json({error:'legacy_catalog_invalid_json'},500);}
 if(!Array.isArray(channels)||channels.length<10)return json({error:'legacy_catalog_failed_validation',sourceCount:Array.isArray(channels)?channels.length:0},409);
 await seedCategories(env);
 const sourceCount=await upsertSources(env,channels),pilot:string[]=[];
 const seen=new Set<string>();
 for(const id of CONTENT_CENTERS.map(c=>c.id)){
  const match=channels.find(x=>x?.sourceId&&!seen.has(String(x.sourceId))&&categoryHints(x).includes(id));
  if(match){pilot.push(String(match.sourceId));seen.add(String(match.sourceId));}
 }
 for(const channel of channels){
  if(pilot.length>=20)break;
  const id=String(channel?.sourceId||'');
  if(id&&!seen.has(id)){pilot.push(id);seen.add(id);}
 }
 const ts=now();
 await env.CATALOG_DB.prepare("INSERT INTO catalog_config(config_key,config_value,updated_at) VALUES ('shorts_pilot_sources',?,?) ON CONFLICT(config_key) DO UPDATE SET config_value=excluded.config_value,updated_at=excluded.updated_at").bind(JSON.stringify(pilot.slice(0,20)),ts).run();
 const active=String(await env.CHANNELS_ARCHIVE.get('yt:v2:active-generation')||'legacy-kv');
 const desiredMode=active==='legacy-kv'?'shadow':'published';
 if(desiredMode==='shadow'){
  await env.CATALOG_DB.prepare("INSERT INTO catalog_config(config_key,config_value,updated_at) VALUES ('catalog_mode','shadow',?) ON CONFLICT(config_key) DO UPDATE SET config_value=excluded.config_value,updated_at=excluded.updated_at").bind(ts).run();
 }else{
  await env.CATALOG_DB.prepare("INSERT INTO catalog_config(config_key,config_value,updated_at) VALUES ('catalog_mode','published',?) ON CONFLICT(config_key) DO UPDATE SET config_value=excluded.config_value,updated_at=excluded.updated_at").bind(ts).run();
 }
 const prior=await env.CATALOG_DB.prepare("SELECT job_id,status FROM ingest_jobs WHERE job_id LIKE 'legacy-migration:%'").all<any>();
 const statuses=new Map((prior.results||[]).map((x:any)=>[String(x.job_id),String(x.status)]));
 const todo=channels.filter(channel=>channel?.sourceId&&statuses.get('legacy-migration:'+String(channel.sourceId))!=='SUCCEEDED');
 const statements=todo.map(channel=>{
  const id=String(channel.sourceId),job='legacy-migration:'+id;
  return env.CATALOG_DB!.prepare("INSERT INTO ingest_jobs(job_id,source_id,job_type,status,cursor_json,payload_json,attempts,queued_at,updated_at) VALUES (?,?,?,?,?,?,0,?,?) ON CONFLICT(job_id) DO UPDATE SET status='QUEUED',cursor_json=excluded.cursor_json,attempts=0,last_error=NULL,queued_at=excluded.queued_at,updated_at=excluded.updated_at WHERE ingest_jobs.status!='SUCCEEDED'").bind(job,id,'MIGRATE_SOURCE_PAGE','QUEUED',JSON.stringify({offset:0,pageSize:100,total:Math.min(200,Array.isArray(channel.videos)?channel.videos.length:0)}),JSON.stringify({sourceTitle:String(channel.title||channel.name||id)}),ts,ts);
 });
 for(let i=0;i<statements.length;i+=40)await env.CATALOG_DB.batch(statements.slice(i,i+40));
 const messages=todo.map(channel=>({body:{type:'MIGRATE_SOURCE_PAGE',sourceId:String(channel.sourceId),offset:0,pageSize:100,jobId:'legacy-migration:'+String(channel.sourceId)},contentType:'json' as const}));
 for(let i=0;i<messages.length;i+=100)await env.CATALOG_DISCOVERY_QUEUE.sendBatch(messages.slice(i,i+100));
 return json({ok:true,mode:desiredMode,sourceCount,queuedSources:messages.length,alreadyMigratedSources:channels.length-messages.length,shortsPilotSources:Math.min(20,pilot.length),taxonomyVersion:CONTENT_TAXONOMY_VERSION,activeGenerationUnchanged:true,message:'Legacy KV remains active until the first catalog generation has completely published; imported videos require fresh YouTube metadata, Shorts checks, and manual approval.'},202);
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
 if(path==='/api/catalog/v2/feed'&&method==='GET'){
  const cat=String(url.searchParams.get('category')||'all');
  if(!SYSTEM_IDS.has(cat))return json({error:'unknown_category'},400);
  if(!env.CHANNELS_ARCHIVE||!env.CATALOG_DB)return json({error:'catalog_bindings_unavailable'},503);
  const active=String(await env.CHANNELS_ARCHIVE.get('yt:v2:active-generation')||'legacy-kv');
  const gen=String(url.searchParams.get('generation')||active);
  if(gen==='legacy-kv')return json({mode:'shadow',generationId:gen,categoryId:cat,items:[],page:0,pageCount:0});
  if(gen!==active)return json({error:'generation_not_active'},409);
  const page=Math.max(0,Math.min(10000,parseInt(url.searchParams.get('page')||'0',10)||0));
  const raw=await env.CHANNELS_ARCHIVE.get('yt:v2:feed:'+cat+':g'+gen+':p'+page);
  if(!raw)return json({mode:'published',schemaVersion:2,generationId:gen,categoryId:cat,page,pageSize:100,itemCount:0,items:[]},200,'public, max-age=15, s-maxage=30');
  let envelope:any;
  try{envelope=JSON.parse(raw);}catch{return json({error:'catalog_page_corrupt'},500);}
  if(envelope?.mode!=='published'||envelope?.generationId!==gen||!Array.isArray(envelope.items))return json({error:'catalog_page_contract_mismatch'},500);
  const ids=[...new Set<string>(envelope.items.map((item:any)=>String(item?.videoId||'').trim()).filter((id:string)=>Boolean(id)))];
  if(!ids.length)return json({mode:'published',schemaVersion:2,generationId:gen,categoryId:cat,page,pageSize:100,itemCount:0,items:[]},200,'public, max-age=15, s-maxage=30');
  const marks=ids.map(()=>'?').join(',');
  const eligible=await env.CATALOG_DB.prepare(
   "SELECT v.video_id,v.title,v.published_at,v.primary_category_id,v.format,v.music_variant,v.music_classification_json,v.duration_seconds,v.metadata_checked_at,v.review_status,v.shorts_check_status,(SELECT vs.source_id FROM video_sources vs JOIN sources s ON s.source_id=vs.source_id WHERE vs.video_id=v.video_id ORDER BY vs.discovered_at LIMIT 1) AS source_id,(SELECT s.title FROM video_sources vs JOIN sources s ON s.source_id=vs.source_id WHERE vs.video_id=v.video_id ORDER BY vs.discovered_at LIMIT 1) AS source_title FROM videos v WHERE v.video_id IN ("+marks+") AND v.review_status='APPROVED' AND v.reviewed_at IS NOT NULL AND v.shorts_check_status='NOT_SHORTS' AND v.duration_seconds>0 AND v.metadata_checked_at>=datetime('now','-30 days')"
  ).bind(...ids).all<any>();
  const current=new Map<string,any>((eligible.results||[]).map((row:any)=>[String(row.video_id),row]));
  const items:any[]=[];
  for(const old of envelope.items){
   const id=String(old?.videoId||'').trim(),row=current.get(id);
   if(!row)continue;
   const primary=String(row.primary_category_id||'');
   if(cat==='all'&&primary==='gaming')continue;
   if(cat!=='all'&&cat!=='music_songs'&&primary!==cat)continue;
   if(cat==='music_songs'&&primary!=='music_songs'&&!(String(row.format||'')==='SONG_OR_NASHEED'&&primary!=='music_songs_no_music'&&primary!=='gaming'))continue;
   items.push({
    ...old,videoId:id,title:String(row.title||''),publishedAt:row.published_at||null,
    sourceId:String(row.source_id||old.sourceId||''),sourceTitle:String(row.source_title||old.sourceTitle||'YoungTube'),
    primaryCategoryId:row.primary_category_id||null,format:row.format||null,
    musicVariant:row.music_variant||'STANDARD_OR_UNSPECIFIED',musicClassificationJson:row.music_classification_json||null,
    videoDuration:Number(row.duration_seconds),metadataCheckedAt:String(row.metadata_checked_at)
   });
  }
  return json({mode:'published',schemaVersion:2,generationId:gen,categoryId:cat,page,pageSize:100,itemCount:items.length,items},200,'public, max-age=15, s-maxage=30');
 }
 if(path==='/api/admin/catalog/status'&&method==='GET'){if(!checkAdminAuth(req,env))return json({error:'unauthorized'},401);if(!env.CATALOG_DB)return json({error:'d1_unavailable'},503);const q=await Promise.all([
  env.CATALOG_DB.prepare('SELECT COUNT(*) AS count FROM content_categories WHERE active=1').first<any>(),env.CATALOG_DB.prepare('SELECT COUNT(*) AS count FROM sources').first<any>(),env.CATALOG_DB.prepare('SELECT COUNT(*) AS count FROM videos').first<any>(),env.CATALOG_DB.prepare("SELECT COUNT(*) AS count FROM videos WHERE review_status='CANDIDATE'").first<any>(),env.CATALOG_DB.prepare("SELECT COUNT(*) AS count FROM videos WHERE review_status='NEEDS_REVIEW'").first<any>(),env.CATALOG_DB.prepare("SELECT COUNT(*) AS count FROM videos WHERE review_status='APPROVED' AND shorts_check_status='NOT_SHORTS' AND duration_seconds>0 AND metadata_checked_at>=datetime('now','-20 days')").first<any>(),env.CATALOG_DB.prepare("SELECT COUNT(*) AS count FROM videos WHERE metadata_checked_at>=datetime('now','-30 days')").first<any>(),env.CATALOG_DB.prepare('SELECT status,COUNT(*) AS count FROM ingest_jobs GROUP BY status').all<any>(),env.CATALOG_DB.prepare("SELECT config_key,config_value FROM catalog_config WHERE config_key IN ('catalog_mode','shorts_pilot_sources','auto_review_mode','auto_review_shadow_reserved_count','auto_review_last_schedule','auto_review_last_provider_diagnostic','auto_review_shadow_retry_count')").all<any>()]);
  const quota=await env.CATALOG_DB.prepare("SELECT scanned_count,scanned_video_seconds FROM catalog_auto_review_usage WHERE usage_date=date('now')").first<any>();
  const shadowCount=await env.CATALOG_DB.prepare("SELECT COUNT(*) AS count FROM videos WHERE auto_reviewed_at IS NOT NULL AND json_extract(review_evidence_json,'$.autoReview.mode')='shadow'").first<any>();
  const autoReviewSettings=await getCatalogAutoReviewSettings(env);
  const cfg=Object.fromEntries((q[8]?.results||[]).map((x:any)=>[x.config_key,x.config_value]));let pilots:any[]=[];try{pilots=JSON.parse(String(cfg.shorts_pilot_sources||'[]'));}catch{}let lastSchedule:any=null;try{lastSchedule=JSON.parse(String(cfg.auto_review_last_schedule||'null'));}catch{}const lastProviderDiagnostic=parseAutoReviewDiagnostic(cfg.auto_review_last_provider_diagnostic);const shadowRetryCount=Math.max(0,Math.floor(Number(cfg.auto_review_shadow_retry_count)||0));const storedShadowReserved=Number(cfg.auto_review_shadow_reserved_count);const failedShadowRows=await env.CATALOG_DB.prepare("SELECT COUNT(*) AS count,MAX(updated_at) AS latestUpdatedAt FROM videos WHERE review_reason IN ('auto_review_provider_unavailable','auto_review_provider_auth_failed','auto_review_provider_request_invalid','auto_review_invalid_model_output','auto_review_video_not_accessible','auto_review_rate_limited') AND auto_reviewed_at IS NULL AND auto_review_queued_at IS NULL AND reviewed_at IS NULL AND shorts_check_status='NOT_SHORTS' AND duration_seconds BETWEEN 120 AND ? AND metadata_checked_at>=datetime('now','-20 days') AND primary_category_id IN ('learn','science_discovery','stories_programs','arts_crafts','nature_life','music_songs')").bind(AUTO_REVIEW_MAX_VIDEO_SECONDS).first<any>();const failedShadowSampleCount=Number(failedShadowRows?.count||0);const diagnosticAfterFailure=Boolean(lastProviderDiagnostic?.outcome==='success'&&Date.parse(String(lastProviderDiagnostic.timestamp||''))>Date.parse(String(failedShadowRows?.latestUpdatedAt||'')));const shadowReservedCount=Number.isFinite(storedShadowReserved)?Math.max(0,Math.floor(storedShadowReserved)):Number(shadowCount?.count||0);const canRetryFailedShadowSample=autoReviewSettings.mode==='shadow'&&Boolean(env.GEMINI_API_KEY)&&shadowReservedCount>=AUTO_REVIEW_SHADOW_SAMPLE_LIMIT&&Number(shadowCount?.count||0)<AUTO_REVIEW_SHADOW_SAMPLE_LIMIT&&failedShadowSampleCount>0&&shadowRetryCount<1&&diagnosticAfterFailure;return json({ok:true,schemaVersion:2,taxonomyVersion:CONTENT_TAXONOMY_VERSION,mode:String(cfg.catalog_mode||'shadow'),autoReview:{mode:autoReviewSettings.mode,providerConfigured:Boolean(env.GEMINI_API_KEY),dailyVideoLimit:autoReviewSettings.dailyVideoLimit,dailyVideoSecondsLimit:autoReviewSettings.dailyVideoSecondsLimit,dailyVideoHours:Math.round(autoReviewSettings.dailyVideoSecondsLimit/3600),maxDailyVideoHours:72,batchSize:AUTO_REVIEW_BATCH_SIZE,maxVideoSeconds:AUTO_REVIEW_MAX_VIDEO_SECONDS,pauseUntil:autoReviewSettings.pauseUntil,scannedToday:Number(quota?.scanned_count||0),scannedVideoSecondsToday:Number(quota?.scanned_video_seconds||0),shadowSampleCount:Number(shadowCount?.count||0),shadowSampleLimit:AUTO_REVIEW_SHADOW_SAMPLE_LIMIT,shadowReservedCount,lastSchedule,lastProviderDiagnostic,failedShadowSampleCount,shadowRetryCount,canRetryFailedShadowSample},activeGeneration:env.CHANNELS_ARCHIVE?String(await env.CHANNELS_ARCHIVE.get('yt:v2:active-generation')||'legacy-kv'):'legacy-kv',bindings:{kv:Boolean(env.CHANNELS_ARCHIVE),d1:Boolean(env.CATALOG_DB),discoveryQueue:Boolean(env.CATALOG_DISCOVERY_QUEUE),processingQueue:Boolean(env.CATALOG_PROCESSING_QUEUE)},counts:{categories:Number(q[0]?.count||0),sources:Number(q[1]?.count||0),videos:Number(q[2]?.count||0),candidates:Number(q[3]?.count||0),needsReview:Number(q[4]?.count||0),approvedNonShorts:Number(q[5]?.count||0),metadataChecked:Number(q[6]?.count||0),pilotSources:pilots.length},jobs:q[7]?.results||[]});}
 if(path==='/api/admin/catalog/start-rebuild'&&method==='POST'){if(!checkAdminAuth(req,env))return json({error:'unauthorized'},401);return startRebuild(env);}
 if(path==='/api/admin/catalog/review-queue'&&method==='GET'){if(!checkAdminAuth(req,env))return json({error:'unauthorized'},401);if(!env.CATALOG_DB)return json({error:'d1_unavailable'},503);const limit=Math.max(1,Math.min(100,Number(url.searchParams.get('limit'))||30));const q=await env.CATALOG_DB.prepare("SELECT v.video_id,v.title,v.published_at,v.primary_category_id,v.music_variant,v.music_classification_json,v.shorts_check_status,v.review_status,v.review_reason,v.duration_seconds,v.frame_width,v.frame_height,v.metadata_checked_at,v.auto_reviewed_at,v.auto_review_queued_at,v.review_evidence_json,(SELECT s.title FROM video_sources vs JOIN sources s ON s.source_id=vs.source_id WHERE vs.video_id=v.video_id ORDER BY vs.discovered_at LIMIT 1) AS source_title FROM videos v WHERE v.review_status IN ('CANDIDATE','NEEDS_REVIEW') ORDER BY v.published_at DESC,v.video_id LIMIT ?").bind(limit).all<any>();return json({items:q.results||[]});}
 if(path==='/api/admin/catalog/review'&&method==='POST'){if(!checkAdminAuth(req,env))return json({error:'unauthorized'},401);if(!env.CATALOG_DB)return json({error:'d1_unavailable'},503);const b:any=await req.json().catch(()=>null),id=String(b?.videoId||'').trim(),action=String(b?.action||'').toLowerCase();if(!id||!['approve','reject'].includes(action))return json({error:'invalid_review_request'},400);const v=await env.CATALOG_DB.prepare('SELECT * FROM videos WHERE video_id=?').bind(id).first<any>();if(!v)return json({error:'video_not_found'},404);const ts=now();if(action==='reject'){await env.CATALOG_DB.prepare("UPDATE videos SET review_status='REJECTED',review_reason='manual_rejection',reviewed_at=?,updated_at=? WHERE video_id=?").bind(ts,ts,id).run();return json({ok:true,videoId:id,reviewStatus:'REJECTED'});}const cat=String(b.primaryCategoryId||'').trim();if(!SYSTEM_IDS.has(cat)||cat==='all')return json({error:'invalid_category_id'},400);if(b.safetyReviewConfirmed!==true)return json({error:'manual_content_review_required'},400);if(v.shorts_check_status!=='NOT_SHORTS')return json({error:'shorts_not_cleared',status:v.shorts_check_status},409);if(!Number.isFinite(Number(v.duration_seconds))||Number(v.duration_seconds)<=0)return json({error:'duration_unknown'},409);if(!v.metadata_checked_at||Date.now()-Date.parse(String(v.metadata_checked_at))>=20*24*60*60*1000)return json({error:'metadata_refresh_required'},409);if(cat==='music_songs_no_music'){let m:any=null;try{m=JSON.parse(String(v.music_classification_json||'null'));}catch{}if(m?.publicCategory!=='music_songs_no_music'||m?.matchedField!=='title'||m?.confidence!=='HIGH')return json({error:'explicit_no_music_title_claim_required'},409);}await env.CATALOG_DB.prepare("UPDATE videos SET primary_category_id=?,review_status='APPROVED',review_reason=NULL,review_evidence_json=?,reviewed_at=?,updated_at=? WHERE video_id=?").bind(cat,JSON.stringify({decision:'manual_approval',safetyReviewConfirmed:true,safetyReviewConfirmedAt:ts,taxonomyVersion:CONTENT_TAXONOMY_VERSION,shortsPolicyVersion:SHORTS_POLICY_VERSION}),ts,ts,id).run();return json({ok:true,videoId:id,reviewStatus:'APPROVED',primaryCategoryId:cat});}
 if(path==='/api/admin/catalog/auto-review-budget'&&method==='POST'){
  if(!checkAdminAuth(req,env))return json({error:'unauthorized'},401);
  if(!env.CATALOG_DB)return json({error:'d1_unavailable'},503);
  const b:any=await req.json().catch(()=>null);
  const hours=Number(b?.dailyVideoHours);
  if(![8,24,72].includes(hours))return json({error:'invalid_daily_video_hours',allowed:[8,24,72]},400);
  if(hours>8&&b?.paidTierConfirmed!==true)return json({error:'paid_tier_confirmation_required',requiredConfirmation:true},409);
  const rawLimit=Number(b?.dailyVideoLimit||AUTO_REVIEW_DEFAULT_DAILY_VIDEO_LIMIT);
  if(!Number.isFinite(rawLimit)||rawLimit<1||rawLimit>AUTO_REVIEW_MAX_DAILY_VIDEO_LIMIT)return json({error:'invalid_daily_video_limit',minimum:1,maximum:AUTO_REVIEW_MAX_DAILY_VIDEO_LIMIT},400);
  const ts=now(),dailyVideoLimit=Math.floor(rawLimit),dailyVideoSecondsLimit=hours*3600;
  await env.CATALOG_DB.batch([
   env.CATALOG_DB.prepare("INSERT INTO catalog_config(config_key,config_value,updated_at) VALUES ('auto_review_daily_video_limit',?,?) ON CONFLICT(config_key) DO UPDATE SET config_value=excluded.config_value,updated_at=excluded.updated_at").bind(String(dailyVideoLimit),ts),
   env.CATALOG_DB.prepare("INSERT INTO catalog_config(config_key,config_value,updated_at) VALUES ('auto_review_daily_seconds_limit',?,?) ON CONFLICT(config_key) DO UPDATE SET config_value=excluded.config_value,updated_at=excluded.updated_at").bind(String(dailyVideoSecondsLimit),ts),
  ]);
  const settings=await getCatalogAutoReviewSettings(env);
  if(settings.mode!=='off'&&env.GEMINI_API_KEY)await scheduleCatalogAutoReview(env);
  return json({ok:true,dailyVideoLimit:settings.dailyVideoLimit,dailyVideoSecondsLimit:settings.dailyVideoSecondsLimit,dailyVideoHours:Math.round(settings.dailyVideoSecondsLimit/3600),providerConfigured:Boolean(env.GEMINI_API_KEY),batchSize:AUTO_REVIEW_BATCH_SIZE});
 }
 if(path==='/api/admin/catalog/auto-review-diagnostic'&&method==='POST'){
  if(!checkAdminAuth(req,env))return json({error:'unauthorized'},401);
  if(!env.CATALOG_DB)return json({error:'d1_unavailable'},503);
  if(!env.CATALOG_PROCESSING_QUEUE)return json({error:'processing_queue_unavailable'},503);
  const settings=await getCatalogAutoReviewSettings(env);
  if(settings.mode!=='shadow')return json({error:'diagnostic_requires_shadow_mode',mode:settings.mode},409);
  if(!env.GEMINI_API_KEY)return json({error:'gemini_api_key_not_configured'},409);
  if(settings.pauseUntil&&Date.parse(settings.pauseUntil)>Date.now())return json({error:'provider_pause_active',pauseUntil:settings.pauseUntil},409);
  const lockToken=crypto.randomUUID(),lockAt=now();
  const diagnosticLock=await env.CATALOG_DB.prepare("INSERT INTO catalog_config(config_key,config_value,updated_at) VALUES ('auto_review_provider_diagnostic_lock',?,?) ON CONFLICT(config_key) DO UPDATE SET config_value=excluded.config_value,updated_at=excluded.updated_at WHERE datetime(catalog_config.updated_at)<=datetime('now','-2 minutes') RETURNING config_value").bind(lockToken,lockAt).first<any>();
  if(!diagnosticLock)return json({error:'provider_diagnostic_already_running'},409);
  try{
   const previousDiagnostic=await env.CATALOG_DB.prepare("SELECT config_value,updated_at FROM catalog_config WHERE config_key='auto_review_last_provider_diagnostic'").first<any>();
   let previousParsed:any=null;try{previousParsed=JSON.parse(String(previousDiagnostic?.config_value||'null'));}catch{}
   if(previousParsed?.outcome==='pending'&&Date.now()-Date.parse(String(previousParsed.timestamp||previousDiagnostic?.updated_at||''))<12*60*1000){
    return json({error:'provider_diagnostic_already_running',diagnostic:previousParsed},409);
   }
   const failed=await env.CATALOG_DB.prepare("SELECT video_id,title,primary_category_id,duration_seconds FROM videos WHERE review_reason IN ('auto_review_provider_unavailable','auto_review_provider_auth_failed','auto_review_provider_request_invalid','auto_review_invalid_model_output','auto_review_video_not_accessible','auto_review_rate_limited') AND auto_reviewed_at IS NULL AND auto_review_queued_at IS NULL AND reviewed_at IS NULL AND shorts_check_status='NOT_SHORTS' AND duration_seconds BETWEEN 120 AND ? AND metadata_checked_at>=datetime('now','-20 days') AND primary_category_id IN ('learn','science_discovery','stories_programs','arts_crafts','nature_life','music_songs') ORDER BY updated_at DESC,video_id LIMIT 1").bind(AUTO_REVIEW_MAX_VIDEO_SECONDS).first<any>();
   if(!failed)return json({error:'no_failed_shadow_video_available_for_diagnostic'},409);
   const duration=Number(failed.duration_seconds||0);
   const quota=await env.CATALOG_DB.prepare("SELECT scanned_count,scanned_video_seconds FROM catalog_auto_review_usage WHERE usage_date=date('now')").first<any>();
   if(Number(quota?.scanned_count||0)+1>settings.dailyVideoLimit||Number(quota?.scanned_video_seconds||0)+duration>settings.dailyVideoSecondsLimit)return json({error:'daily_budget_exhausted'},409);
   const quotaReserved=await env.CATALOG_DB.prepare("INSERT INTO catalog_auto_review_usage (usage_date,scanned_count,scanned_video_seconds,updated_at) VALUES (date('now'),1,?,?) ON CONFLICT(usage_date) DO UPDATE SET scanned_count=scanned_count+1,scanned_video_seconds=scanned_video_seconds+excluded.scanned_video_seconds,updated_at=excluded.updated_at WHERE scanned_count+1<=? AND scanned_video_seconds+excluded.scanned_video_seconds<=? RETURNING usage_date").bind(duration,now(),settings.dailyVideoLimit,settings.dailyVideoSecondsLimit).first<any>();
   if(!quotaReserved)return json({error:'daily_budget_exhausted'},409);
   const started=await startPublicYouTubeVideosSafetyInteraction(env.GEMINI_API_KEY,[{videoId:String(failed.video_id),title:String(failed.title||''),expectedCategory:String(failed.primary_category_id||'')}]);
   if(started.ok===false){
    const diagnostic:VideoSafetyProviderDiagnostic={...started.diagnostic,outcome:'failed',timestamp:now(),error:started.error,videoCount:1,diagnosticOnly:true};
    await persistAutoReviewProviderDiagnostic(env,diagnostic);
    return json({ok:false,error:started.error,diagnostic,diagnosticOnly:true,reviewResultSaved:false,shadowCountUnchanged:true,modeUnchanged:true},200);
   }
   const diagnostic:VideoSafetyProviderDiagnostic={outcome:'pending',stage:'interaction',timestamp:now(),model:started.model,videoCount:1,diagnosticOnly:true,interactionId:started.interactionId,interactionStatus:started.status,message:'Gemini accepted the diagnostic request. The interaction will be polled asynchronously; no review result will be saved.'};
   await persistAutoReviewProviderDiagnostic(env,diagnostic);
   try{
    await queueAutoReviewPoll(env,{interactionId:started.interactionId,videoIds:[String(failed.video_id)],diagnosticOnly:true,pollAttempt:0},10);
   }catch{
    await deletePublicYouTubeVideosSafetyInteraction(env.GEMINI_API_KEY,started.interactionId);
    const errorDiagnostic:VideoSafetyProviderDiagnostic={...diagnostic,outcome:'failed',timestamp:now(),error:'provider_unavailable',interactionStatus:'poll_enqueue_failed',message:'Failed to enqueue the background diagnostic poll.'};
    await persistAutoReviewProviderDiagnostic(env,errorDiagnostic);
    return json({ok:false,error:'diagnostic_poll_enqueue_failed',diagnostic:errorDiagnostic,diagnosticOnly:true,reviewResultSaved:false,shadowCountUnchanged:true,modeUnchanged:true},503);
   }
   return json({ok:true,pending:true,diagnostic,diagnosticOnly:true,reviewResultSaved:false,shadowCountUnchanged:true,modeUnchanged:true},202);
  }finally{
   await env.CATALOG_DB.prepare("DELETE FROM catalog_config WHERE config_key='auto_review_provider_diagnostic_lock' AND config_value=?").bind(lockToken).run().catch(()=>undefined);
  }
 }
 if(path==='/api/admin/catalog/auto-review-retry-failed-shadow'&&method==='POST'){
  if(!checkAdminAuth(req,env))return json({error:'unauthorized'},401);
  if(!env.CATALOG_DB||!env.CATALOG_PROCESSING_QUEUE)return json({error:'catalog_bindings_unavailable'},503);
  const settings=await getCatalogAutoReviewSettings(env);
  if(settings.mode!=='shadow')return json({error:'retry_requires_shadow_mode',mode:settings.mode},409);
  if(!env.GEMINI_API_KEY)return json({error:'gemini_api_key_not_configured'},409);
  if(settings.pauseUntil&&Date.parse(settings.pauseUntil)>Date.now())return json({error:'provider_pause_active',pauseUntil:settings.pauseUntil},409);
  const cfg=await env.CATALOG_DB.prepare("SELECT config_key,config_value FROM catalog_config WHERE config_key IN ('auto_review_shadow_reserved_count','auto_review_shadow_retry_count','auto_review_last_provider_diagnostic')").all<any>();
  const cfgMap=Object.fromEntries((cfg.results||[]).map((row:any)=>[String(row.config_key),String(row.config_value)]));
  const reservedCount=Math.max(0,Math.floor(Number(cfgMap.auto_review_shadow_reserved_count)||0));
  const retryCount=Math.max(0,Math.floor(Number(cfgMap.auto_review_shadow_retry_count)||0));
  const providerDiagnostic=parseAutoReviewDiagnostic(cfgMap.auto_review_last_provider_diagnostic);
  if(reservedCount<AUTO_REVIEW_SHADOW_SAMPLE_LIMIT)return json({error:'shadow_sample_not_fully_reserved',reservedCount,required:AUTO_REVIEW_SHADOW_SAMPLE_LIMIT},409);
  if(retryCount>=1)return json({error:'failed_shadow_sample_retry_already_used',retryCount},409);
  if(providerDiagnostic?.outcome!=='success')return json({error:'provider_diagnostic_not_successful'},409);
  const shadow=await env.CATALOG_DB.prepare("SELECT COUNT(*) AS count FROM videos WHERE auto_reviewed_at IS NOT NULL AND json_extract(review_evidence_json,'$.autoReview.mode')='shadow'").first<any>();
  if(Number(shadow?.count||0)>=AUTO_REVIEW_SHADOW_SAMPLE_LIMIT)return json({error:'shadow_sample_already_completed',shadowSampleCount:Number(shadow?.count||0)},409);
  const lockToken=crypto.randomUUID(),lockAt=now();
  const lock=await env.CATALOG_DB.prepare("INSERT INTO catalog_config(config_key,config_value,updated_at) VALUES ('auto_review_shadow_retry_lock',?,?) ON CONFLICT(config_key) DO UPDATE SET config_value=excluded.config_value,updated_at=excluded.updated_at WHERE datetime(catalog_config.updated_at)<=datetime('now','-2 minutes') RETURNING config_value").bind(lockToken,lockAt).first<any>();
  if(!lock)return json({error:'shadow_retry_lock_busy'},409);
  try{
   const failedRows=await env.CATALOG_DB.prepare("SELECT video_id,duration_seconds FROM videos WHERE review_reason IN ('auto_review_provider_unavailable','auto_review_provider_auth_failed','auto_review_provider_request_invalid','auto_review_invalid_model_output','auto_review_video_not_accessible','auto_review_rate_limited') AND auto_reviewed_at IS NULL AND auto_review_queued_at IS NULL AND reviewed_at IS NULL AND shorts_check_status='NOT_SHORTS' AND duration_seconds BETWEEN 120 AND ? AND metadata_checked_at>=datetime('now','-20 days') AND primary_category_id IN ('learn','science_discovery','stories_programs','arts_crafts','nature_life','music_songs') ORDER BY updated_at DESC,video_id LIMIT ?").bind(AUTO_REVIEW_MAX_VIDEO_SECONDS,AUTO_REVIEW_SHADOW_SAMPLE_LIMIT).all<any>();
   const ids=Array.from(new Set<string>((failedRows.results||[]).map((row:any)=>String(row.video_id||'')).filter(Boolean))).slice(0,AUTO_REVIEW_SHADOW_SAMPLE_LIMIT);
   if(!ids.length)return json({error:'no_failed_shadow_videos_to_retry'},409);
   const seconds=(failedRows.results||[]).filter((row:any)=>ids.includes(String(row.video_id))).reduce((total:number,row:any)=>total+Number(row.duration_seconds||0),0);
   const quota=await env.CATALOG_DB.prepare("SELECT scanned_count,scanned_video_seconds FROM catalog_auto_review_usage WHERE usage_date=date('now')").first<any>();
   if(Number(quota?.scanned_count||0)+ids.length>settings.dailyVideoLimit||Number(quota?.scanned_video_seconds||0)+seconds>settings.dailyVideoSecondsLimit)return json({error:'daily_budget_exhausted',retryVideos:ids.length,retrySeconds:seconds},409);
   const queuedAt=now(),marks=ids.map(()=>'?').join(',');
   const reserved=await env.CATALOG_DB.prepare("UPDATE videos SET auto_review_queued_at=?,updated_at=? WHERE video_id IN ("+marks+") AND auto_review_queued_at IS NULL AND auto_reviewed_at IS NULL AND reviewed_at IS NULL AND review_reason IN ('auto_review_provider_unavailable','auto_review_provider_auth_failed','auto_review_provider_request_invalid','auto_review_invalid_model_output','auto_review_video_not_accessible','auto_review_rate_limited') RETURNING video_id,duration_seconds").bind(queuedAt,queuedAt,...ids).all<any>();
   const reservedRows=(reserved.results||[]) as any[];
   const reservedIds=reservedRows.map((row:any)=>String(row.video_id));
   if(!reservedIds.length)return json({error:'no_failed_shadow_videos_to_retry'},409);
   await env.CATALOG_DB.prepare("INSERT INTO catalog_config(config_key,config_value,updated_at) VALUES ('auto_review_shadow_retry_count','1',?) ON CONFLICT(config_key) DO UPDATE SET config_value='1',updated_at=excluded.updated_at").bind(now()).run();
   const retrySchedule={scheduleOutcome:'scheduled',timestamp:now(),eligibleCount:ids.length,scheduledCount:reservedIds.length,batchesSent:1,shadowSampleLimit:AUTO_REVIEW_SHADOW_SAMPLE_LIMIT,shadowReservedCount:reservedCount,attemptType:'retry_failed_sample'};
   try{
    await env.CATALOG_PROCESSING_QUEUE.sendBatch([{body:{type:'AUTO_REVIEW_VIDEO_BATCH',videoIds:reservedIds},contentType:'json'}]);
   }catch{
    await env.CATALOG_DB.batch(reservedIds.map(id=>env.CATALOG_DB!.prepare("UPDATE videos SET auto_review_queued_at=NULL,updated_at=? WHERE video_id=? AND auto_reviewed_at IS NULL").bind(now(),id)));
    const failedSchedule={...retrySchedule,scheduleOutcome:'send_failed',scheduledCount:0,batchesSent:0,timestamp:now()};
    await env.CATALOG_DB.prepare("INSERT INTO catalog_config(config_key,config_value,updated_at) VALUES ('auto_review_last_schedule',?,?) ON CONFLICT(config_key) DO UPDATE SET config_value=excluded.config_value,updated_at=excluded.updated_at").bind(JSON.stringify(failedSchedule),failedSchedule.timestamp).run().catch(()=>undefined);
    return json({error:'shadow_retry_send_failed',schedule:failedSchedule},503);
   }
   await env.CATALOG_DB.prepare("INSERT INTO catalog_config(config_key,config_value,updated_at) VALUES ('auto_review_last_schedule',?,?) ON CONFLICT(config_key) DO UPDATE SET config_value=excluded.config_value,updated_at=excluded.updated_at").bind(JSON.stringify(retrySchedule),retrySchedule.timestamp).run();
   return json({ok:true,schedule:retrySchedule,reusedExistingReservations:true,uniqueShadowReservationCountUnchanged:true},202);
  }finally{
   await env.CATALOG_DB.prepare("DELETE FROM catalog_config WHERE config_key='auto_review_shadow_retry_lock' AND config_value=?").bind(lockToken).run().catch(()=>undefined);
  }
 }
 if(path==='/api/admin/catalog/auto-review-mode'&&method==='POST'){
  if(!checkAdminAuth(req,env))return json({error:'unauthorized'},401);
  if(!env.CATALOG_DB)return json({error:'d1_unavailable'},503);
  const b:any=await req.json().catch(()=>null),mode=String(b?.mode||'').toLowerCase();
  if(!['off','shadow','enforce'].includes(mode))return json({error:'invalid_auto_review_mode'},400);
  if(mode!=='off'&&!env.GEMINI_API_KEY)return json({error:'gemini_api_key_not_configured'},409);
  if(mode==='enforce'){
   if(b?.sampleAuditConfirmed!==true)return json({error:'sample_audit_confirmation_required'},409);
   const shadow=await env.CATALOG_DB.prepare("SELECT COUNT(*) AS count FROM videos WHERE auto_reviewed_at IS NOT NULL AND json_extract(review_evidence_json,'$.autoReview.mode')='shadow'").first<any>();
   if(Number(shadow?.count||0)<10)return json({error:'minimum_shadow_sample_not_met',required:10,observed:Number(shadow?.count||0)},409);
  }
  const prior=await env.CATALOG_DB.prepare("SELECT config_value FROM catalog_config WHERE config_key='auto_review_mode'").first<any>();
  await env.CATALOG_DB.prepare("INSERT INTO catalog_config(config_key,config_value,updated_at) VALUES ('auto_review_mode',?,?) ON CONFLICT(config_key) DO UPDATE SET config_value=excluded.config_value,updated_at=excluded.updated_at").bind(mode,now()).run();
  if(mode==='enforce'){
   await env.CATALOG_DB.prepare("UPDATE videos SET auto_reviewed_at=NULL,auto_review_queued_at=NULL,updated_at=? WHERE reviewed_at IS NULL AND json_extract(review_evidence_json,'$.autoReview.mode')='shadow'").bind(now()).run();
  }
  const schedule=await scheduleCatalogAutoReview(env);
  const settings=await getCatalogAutoReviewSettings(env);return json({ok:true,autoReviewMode:mode,providerConfigured:Boolean(env.GEMINI_API_KEY),dailyVideoLimit:settings.dailyVideoLimit,dailyVideoSecondsLimit:settings.dailyVideoSecondsLimit,dailyVideoHours:Math.round(settings.dailyVideoSecondsLimit/3600),batchSize:AUTO_REVIEW_BATCH_SIZE,sampleAuditRequired:mode==='enforce',schedule});
 }
 if(path==='/api/admin/catalog/publish-generation'&&method==='POST'){
  if(!checkAdminAuth(req,env))return json({error:'unauthorized'},401);
  if(!env.CATALOG_DB||!env.CHANNELS_ARCHIVE||!env.CATALOG_PROCESSING_QUEUE)return json({error:'catalog_bindings_unavailable'},503);
  const active=String(await env.CHANNELS_ARCHIVE.get('yt:v2:active-generation')||'legacy-kv');
  const result=await enqueueApprovedGeneration(env,10,active);
  if(!result.ok)return json(result,409);
  return json(result,202);
 }
 return null;
}
export async function handleCatalogV2QueueBatch(batch:any,env:Env):Promise<void>{
 for(const message of batch.messages||[]){try{const b=message.body||{};if(b.type==='MIGRATE_SOURCE_PAGE')await migratePage(env,b);else if(b.type==='ENRICH_VIDEO_BATCH')await enrichBatch(env,b);else if(b.type==='AUTO_REVIEW_VIDEO_BATCH')await autoReviewVideoBatch(env,b);else if(b.type==='AUTO_REVIEW_VIDEO')await autoReviewVideoBatch(env,{videoIds:[b.videoId]});else if(b.type==='AUTO_REVIEW_POLL_INTERACTION')await pollAutoReviewInteraction(env,b);else if(b.type==='PUBLISH_GENERATION_PAGE')await publishPage(env,b);else console.warn('Unknown catalog queue message');message.ack();}catch(e){const text=e instanceof Error?e.message:'catalog_queue_error';try{if(env.CATALOG_DB&&message.body?.jobId)await env.CATALOG_DB.prepare("UPDATE ingest_jobs SET status='RETRYING',attempts=attempts+1,last_error=?,updated_at=? WHERE job_id=? AND status!='SUCCEEDED'").bind(text.slice(0,500),now(),String(message.body.jobId)).run();}catch{}console.error('Catalog queue failed',text);message.retry({delaySeconds:Math.min(300,15*Math.max(1,Number(message.attempts||1)))});}}
}
