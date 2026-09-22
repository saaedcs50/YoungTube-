import channelsSeed from '../../channels_seed.json';
import { corsHeaders, checkAdminAuth } from '../lib/cors';
import { getTodayDateUtc } from '../lib/helpers';
import {
  GLOBAL_BLOCKS,
  ANNOUNCEMENTS,
  CUSTOM_CATEGORIES,
  CHANNELS_LATEST_MERGED,
  RSS_REFRESH_CURSOR,
} from '../lib/kv-keys';
import { Env } from '../lib/types';

export async function handleAdminContentRoutes(
  request: Request,
  env: Env,
  url: URL
): Promise<Response | null> {
  // 1. POST /api/admin/blocks
  if (url.pathname === '/api/admin/blocks' && request.method === 'POST') {
    if (!checkAdminAuth(request, env)) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid or missing Bearer ADMIN_KEY' }),
        { status: 401, headers: corsHeaders }
      );
    }

    let body: any = {};
    try {
      body = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: corsHeaders }
      );
    }

    if (!env.CHANNELS_ARCHIVE) {
      return new Response(
        JSON.stringify({ error: 'KV binding CHANNELS_ARCHIVE is not available' }),
        { status: 500, headers: corsHeaders }
      );
    }

    let blocks: { channelIds: string[]; playlistIds: string[]; updatedAt: number } = {
      channelIds: [],
      playlistIds: [],
      updatedAt: Date.now(),
    };
    try {
      const raw = await env.CHANNELS_ARCHIVE.get(GLOBAL_BLOCKS);
      if (raw) {
        blocks = { ...blocks, ...JSON.parse(raw) };
      }
    } catch {}

    const { action, type, id, channelIds, playlistIds } = body;

    if (Array.isArray(channelIds)) {
      blocks.channelIds = Array.from(
        new Set(channelIds.map((s: any) => String(s).trim()).filter(Boolean))
      );
    }
    if (Array.isArray(playlistIds)) {
      blocks.playlistIds = Array.from(
        new Set(playlistIds.map((s: any) => String(s).trim()).filter(Boolean))
      );
    }

    if (action && id) {
      const cleanId = String(id).trim();
      const targetList = type === 'playlist' ? 'playlistIds' : 'channelIds';
      if (action === 'add') {
        if (!blocks[targetList].includes(cleanId)) {
          blocks[targetList].push(cleanId);
        }
      } else if (action === 'remove' || action === 'delete') {
        blocks[targetList] = blocks[targetList].filter((x) => x !== cleanId);
      }
    }

    blocks.updatedAt = Date.now();
    await env.CHANNELS_ARCHIVE.put(GLOBAL_BLOCKS, JSON.stringify(blocks));

    return new Response(
      JSON.stringify({
        success: true,
        blocks,
        message: 'Global blocks updated successfully',
      }),
      { status: 200, headers: corsHeaders }
    );
  }

  // 2. POST /api/admin/announcements
  if (url.pathname === '/api/admin/announcements' && request.method === 'POST') {
    if (!checkAdminAuth(request, env)) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid or missing Bearer ADMIN_KEY' }),
        { status: 401, headers: corsHeaders }
      );
    }

    let body: any = {};
    try {
      body = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: corsHeaders }
      );
    }

    if (!env.CHANNELS_ARCHIVE) {
      return new Response(
        JSON.stringify({ error: 'KV binding CHANNELS_ARCHIVE is not available' }),
        { status: 500, headers: corsHeaders }
      );
    }

    let existingList: any[] = [];
    try {
      const raw = await env.CHANNELS_ARCHIVE.get(ANNOUNCEMENTS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) existingList = parsed;
        else if (parsed && Array.isArray(parsed.announcements)) existingList = parsed.announcements;
      }
    } catch {}

    if (Array.isArray(body)) {
      existingList = body;
    } else if (body.action === 'delete' && body.id) {
      existingList = existingList.filter((a) => a.id !== body.id);
    } else if (body.id) {
      const idx = existingList.findIndex((a) => a.id === body.id);
      const newAnn = {
        id: body.id,
        title: body.title || '',
        body: body.body || '',
        severity: body.severity || 'info',
        active: body.active !== false,
        createdAt: body.createdAt || Date.now(),
        updatedAt: Date.now(),
      };
      if (idx >= 0) {
        existingList[idx] = newAnn;
      } else {
        existingList.unshift(newAnn);
      }
    } else if (Array.isArray(body.announcements)) {
      existingList = body.announcements;
    }

    existingList = existingList.slice(0, 10);
    await env.CHANNELS_ARCHIVE.put(ANNOUNCEMENTS, JSON.stringify(existingList));

    return new Response(
      JSON.stringify({
        success: true,
        announcements: existingList,
        message: 'Announcements updated successfully',
      }),
      { status: 200, headers: corsHeaders }
    );
  }

  // 3. POST/PUT /api/admin/categories or /api/categories
  if (
    (url.pathname === '/api/admin/categories' || url.pathname === '/api/categories') &&
    (request.method === 'POST' || request.method === 'PUT')
  ) {
    if (!checkAdminAuth(request, env)) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid or missing Bearer ADMIN_KEY' }),
        { status: 401, headers: corsHeaders }
      );
    }

    try {
      const body: any = await request.json();

      const defaultCategories = [
        { id: 'quran', name: 'قرآن كريم وأذكار', label: 'قرآن كريم وأذكار', emoji: '🕌', icon: '🕌', order: 1, description: 'تلاوات خاشعة وأذكار يومية وقصص الأنبياء' },
        { id: 'stories', name: 'قصص وحكايات', label: 'قصص وحكايات', emoji: '📖', icon: '📖', order: 2, description: 'قصص ممتعة ومغامرات هادفة ومسلية' },
        { id: 'cartoons', name: 'كرتون وأناشيد', label: 'كرتون وأناشيد', emoji: '📺', icon: '📺', order: 3, description: 'أناشيد كرتونية وبرامج رسوم متحركة مبهجة' },
        { id: 'education', name: 'تعليم ولغات', label: 'تعليم ولغات', emoji: '💡', icon: '💡', order: 4, description: 'حروف وأرقام وتعلم اللغات والمفاهيم الأساسية' },
        { id: 'science', name: 'علوم واستكشاف', label: 'علوم واستكشاف', emoji: '🔬', icon: '🔬', order: 5, description: 'تجارب علمية واستكشاف العالم الطبيعي' },
        { id: 'crafts', name: 'رسم وفنون', label: 'رسم وفنون', emoji: '🎨', icon: '🎨', order: 6, description: 'تعلم الرسم والتلوين والأشغال اليدوية المبتكرة' },
        { id: 'sports', name: 'حركة ورياضة', label: 'حركة ورياضة', emoji: '⚽', icon: '⚽', order: 7, description: 'تمارين وألعاب حركية وتحديات رياضية ممتعة' },
        { id: 'gaming', name: 'ألعاب مناسبة', label: 'ألعاب مناسبة', emoji: '🎮', icon: '🎮', order: 8, description: 'ألعاب ذكاء ومرح عائلي مناسبة للأطفال' },
        { id: 'cooking', name: 'طبخ الصغار', label: 'طبخ الصغار', emoji: '🍳', icon: '🍳', order: 9, description: 'وصفات لذيذة وسهلة للأطفال' },
        { id: 'calm', name: 'هدوء واسترخاء', label: 'هدوء واسترخاء', emoji: '🌙', icon: '🌙', order: 10, description: 'موسيقى هادئة وقصص ما قبل النوم' },
      ];

      let currentList: any[] = [];
      if (env.CHANNELS_ARCHIVE) {
        try {
          const raw = await env.CHANNELS_ARCHIVE.get(CUSTOM_CATEGORIES);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) currentList = parsed;
            else if (parsed && Array.isArray(parsed.categories) && parsed.categories.length > 0) currentList = parsed.categories;
            else if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) currentList = parsed.items;
          }
        } catch {}
      }
      if (currentList.length === 0) {
        currentList = defaultCategories;
      }

      const normalizeCategory = (c: any, defaultOrder: number) => {
        const id = String(c.id || c.categoryId || '').trim();
        const label = String(c.label || c.name || id).trim();
        const name = String(c.name || c.label || id).trim();
        const emoji = String(c.emoji || c.icon || '🌟').trim();
        const icon = String(c.icon || c.emoji || '🌟').trim();
        const order = typeof c.order === 'number' ? c.order : defaultOrder;
        const description = String(c.description || '').trim();
        return { id, name, label, icon, emoji, order, description };
      };

      const action = body?.action ? String(body.action).toLowerCase() : undefined;

      if (action === 'save' || action === 'add' || action === 'update' || action === 'upsert') {
        const catInput = body.category || body.item || body;
        const targetId = String(catInput.id || catInput.categoryId || '').trim();
        if (!targetId) {
          return new Response(JSON.stringify({ error: 'Missing category id' }), {
            status: 400,
            headers: corsHeaders,
          });
        }

        const normalizedCat = normalizeCategory(catInput, currentList.length + 1);
        const existingIdx = currentList.findIndex((c: any) => String(c.id || c.categoryId) === targetId);

        if (existingIdx >= 0) {
          currentList[existingIdx] = { ...currentList[existingIdx], ...normalizedCat };
        } else {
          currentList.push(normalizedCat);
        }

        if (env.CHANNELS_ARCHIVE) {
          await env.CHANNELS_ARCHIVE.put(CUSTOM_CATEGORIES, JSON.stringify(currentList));
        }

        return new Response(JSON.stringify({ ok: true, category: normalizedCat }), {
          status: 200,
          headers: corsHeaders,
        });
      }

      if (action === 'delete' || action === 'remove') {
        const targetId = String(body.id || body.categoryId || (body.category && (body.category.id || body.category.categoryId)) || '').trim();
        if (!targetId) {
          return new Response(JSON.stringify({ error: 'Missing category id to delete' }), {
            status: 400,
            headers: corsHeaders,
          });
        }

        currentList = currentList.filter((c: any) => String(c.id || c.categoryId) !== targetId);

        if (env.CHANNELS_ARCHIVE) {
          await env.CHANNELS_ARCHIVE.put(CUSTOM_CATEGORIES, JSON.stringify(currentList));
        }

        return new Response(JSON.stringify({ ok: true, deletedId: targetId }), {
          status: 200,
          headers: corsHeaders,
        });
      }

      if (action === 'reorder') {
        if (Array.isArray(body.categories) && body.categories.length > 0) {
          currentList = body.categories.map((c: any, idx: number) => normalizeCategory(c, idx + 1));
        } else if (Array.isArray(body.categoryIds) && body.categoryIds.length > 0) {
          const idOrderMap = new Map<string, number>();
          body.categoryIds.forEach((id: string, idx: number) => idOrderMap.set(String(id).trim(), idx + 1));
          currentList = currentList
            .map((c: any, idx: number) => {
              const id = String(c.id || c.categoryId).trim();
              const newOrder = idOrderMap.has(id) ? idOrderMap.get(id)! : 999 + idx;
              return normalizeCategory({ ...c, order: newOrder }, newOrder);
            })
            .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
        }

        if (env.CHANNELS_ARCHIVE) {
          await env.CHANNELS_ARCHIVE.put(CUSTOM_CATEGORIES, JSON.stringify(currentList));
        }

        return new Response(JSON.stringify({ ok: true, categories: currentList }), {
          status: 200,
          headers: corsHeaders,
        });
      }

      let listToSave: any[] = [];
      if (Array.isArray(body)) {
        listToSave = body;
      } else if (body && Array.isArray(body.categories)) {
        listToSave = body.categories;
      } else if (body && Array.isArray(body.items)) {
        listToSave = body.items;
      } else {
        return new Response(JSON.stringify({ error: 'Invalid request payload for categories' }), {
          status: 400,
          headers: corsHeaders,
        });
      }

      const normalizedFull = listToSave.map((c: any, idx: number) => normalizeCategory(c, idx + 1));

      if (env.CHANNELS_ARCHIVE) {
        await env.CHANNELS_ARCHIVE.put(CUSTOM_CATEGORIES, JSON.stringify(normalizedFull));
      }

      return new Response(JSON.stringify({ ok: true, count: normalizedFull.length, categories: normalizedFull }), {
        status: 200,
        headers: corsHeaders,
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err?.message || 'Failed to process categories' }), {
        status: 400,
        headers: corsHeaders,
      });
    }
  }

  // 4. GET /api/admin/status
  if (url.pathname === '/api/admin/status' && request.method === 'GET') {
    if (!checkAdminAuth(request, env)) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid or missing Bearer ADMIN_KEY' }),
        { status: 401, headers: corsHeaders }
      );
    }

    let channelsCount = 0;
    let cursor = 0;
    const globalBlocksCount = { channels: 0, playlists: 0 };
    let activeAnnouncementsCount = 0;

    if (env.CHANNELS_ARCHIVE) {
      try {
        const rawMerged = await env.CHANNELS_ARCHIVE.get(CHANNELS_LATEST_MERGED);
        if (rawMerged) {
          const list = JSON.parse(rawMerged);
          if (Array.isArray(list)) channelsCount = list.length;
        }
      } catch {}

      try {
        const rawCursor = await env.CHANNELS_ARCHIVE.get(RSS_REFRESH_CURSOR);
        if (rawCursor) cursor = parseInt(rawCursor, 10) || 0;
      } catch {}

      try {
        const rawBlocks = await env.CHANNELS_ARCHIVE.get(GLOBAL_BLOCKS);
        if (rawBlocks) {
          const b = JSON.parse(rawBlocks);
          globalBlocksCount.channels = Array.isArray(b.channelIds) ? b.channelIds.length : 0;
          globalBlocksCount.playlists = Array.isArray(b.playlistIds) ? b.playlistIds.length : 0;
        }
      } catch {}

      try {
        const rawAnn = await env.CHANNELS_ARCHIVE.get(ANNOUNCEMENTS);
        if (rawAnn) {
          const a = JSON.parse(rawAnn);
          if (Array.isArray(a)) {
            activeAnnouncementsCount = a.filter((x: any) => x.active !== false).length;
          }
        }
      } catch {}
    }

    return new Response(
      JSON.stringify({
        status: 'ok',
        worker: 'youngtube-worker',
        version: '2.0.0',
        channelsCount,
        cursor,
        globalBlocksCount,
        activeAnnouncementsCount,
        hasYoutubeApiKey: Boolean(env.YOUTUBE_API_KEY),
        hasAdminKey: Boolean(env.ADMIN_KEY),
        todayUtc: getTodayDateUtc(),
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: corsHeaders }
    );
  }

  return null;
}
