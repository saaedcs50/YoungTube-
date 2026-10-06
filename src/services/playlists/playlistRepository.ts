import db, { type ChildPlaylist, type PlaylistItem } from '../../db';

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function listPlaylists(): Promise<ChildPlaylist[]> {
  return db.childPlaylists.orderBy('updatedAt').reverse().toArray();
}

export async function getPlaylist(playlistId: string): Promise<ChildPlaylist | undefined> {
  return db.childPlaylists.get(playlistId);
}

export async function getPlaylistItems(playlistId: string): Promise<PlaylistItem[]> {
  return db.childPlaylistItems.where('playlistId').equals(playlistId).sortBy('position');
}

export async function createPlaylist(
  name: string,
  options: Partial<Pick<ChildPlaylist, 'description' | 'kind' | 'ownerType' | 'ownerId' | 'visibility'> & { videoId?: never }> = {},
): Promise<ChildPlaylist> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('PLAYLIST_NAME_REQUIRED');
  const now = Date.now();
  const playlist: ChildPlaylist = {
    id: createId('playlist'),
    name: trimmed,
    createdAt: now,
    updatedAt: now,
    kind: options.kind ?? 'regular',
    ownerType: options.ownerType ?? 'local_child',
    ownerId: options.ownerId ?? 'local',
    visibility: options.visibility ?? 'private',
    description: options.description?.trim() || undefined,
  };
  await db.childPlaylists.add(playlist);
  return playlist;
}

export async function createPlaylistWithVideo(
  name: string,
  videoId: string,
  metadata: Pick<PlaylistItem, 'titleSnapshot' | 'thumbnailSnapshot' | 'channelIdSnapshot'> = {},
): Promise<{ playlist: ChildPlaylist; item: PlaylistItem }> {
  const trimmed = name.trim();
  const cleanVideoId = videoId.trim();
  if (!trimmed) throw new Error('PLAYLIST_NAME_REQUIRED');
  if (!cleanVideoId) throw new Error('VIDEO_ID_REQUIRED');
  const now = Date.now();
  const playlist: ChildPlaylist = {
    id: createId('playlist'),
    name: trimmed,
    createdAt: now,
    updatedAt: now,
    kind: 'regular',
    ownerType: 'local_child',
    ownerId: 'local',
    visibility: 'private',
  };
  const item: PlaylistItem = {
    id: createId('playlist-item'),
    playlistId: playlist.id,
    videoId: cleanVideoId,
    position: 0,
    addedAt: now,
    addedByType: 'child',
    addedById: 'local',
    ...metadata,
  };
  await db.transaction('rw', db.childPlaylists, db.childPlaylistItems, async () => {
    await db.childPlaylists.add(playlist);
    await db.childPlaylistItems.add(item);
  });
  return { playlist, item };
}

export async function addPlaylistItem(
  playlistId: string,
  videoId: string,
  metadata: Partial<Pick<PlaylistItem, 'titleSnapshot' | 'thumbnailSnapshot' | 'channelIdSnapshot' | 'addedByType' | 'addedById'>> = {},
): Promise<{ item: PlaylistItem; added: boolean }> {
  const cleanVideoId = videoId.trim();
  if (!cleanVideoId) throw new Error('VIDEO_ID_REQUIRED');
  return db.transaction('rw', db.childPlaylists, db.childPlaylistItems, async () => {
    const playlist = await db.childPlaylists.get(playlistId);
    if (!playlist) throw new Error('PLAYLIST_NOT_FOUND');
    const existing = await db.childPlaylistItems
      .where('[playlistId+videoId]')
      .equals([playlistId, cleanVideoId])
      .first();
    if (existing) return { item: existing, added: false };
    const count = await db.childPlaylistItems.where('playlistId').equals(playlistId).count();
    const item: PlaylistItem = {
      id: createId('playlist-item'),
      playlistId,
      videoId: cleanVideoId,
      position: count,
      addedAt: Date.now(),
      addedByType: metadata.addedByType ?? 'child',
      addedById: metadata.addedById ?? 'local',
      ...metadata,
    };
    await db.childPlaylistItems.add(item);
    await db.childPlaylists.update(playlistId, { updatedAt: Date.now() });
    return { item, added: true };
  });
}

export async function removePlaylistItem(playlistId: string, itemId: string): Promise<void> {
  await db.transaction('rw', db.childPlaylists, db.childPlaylistItems, async () => {
    const item = await db.childPlaylistItems.get(itemId);
    if (!item || item.playlistId !== playlistId) throw new Error('ITEM_NOT_FOUND');
    await db.childPlaylistItems.delete(itemId);
    const remaining = await db.childPlaylistItems.where('playlistId').equals(playlistId).sortBy('position');
    await db.childPlaylistItems.bulkPut(remaining.map((row, index) => ({ ...row, position: index })));
    await db.childPlaylists.update(playlistId, { updatedAt: Date.now() });
  });
}

export async function reorderPlaylistItem(playlistId: string, itemId: string, targetPosition: number): Promise<void> {
  await db.transaction('rw', db.childPlaylists, db.childPlaylistItems, async () => {
    const items = await db.childPlaylistItems.where('playlistId').equals(playlistId).sortBy('position');
    const from = items.findIndex((item) => item.id === itemId);
    if (from < 0) throw new Error('ITEM_NOT_FOUND');
    const target = Math.max(0, Math.min(Math.trunc(targetPosition), items.length - 1));
    const [moved] = items.splice(from, 1);
    items.splice(target, 0, moved);
    await db.childPlaylistItems.bulkPut(items.map((row, index) => ({ ...row, position: index })));
    await db.childPlaylists.update(playlistId, { updatedAt: Date.now() });
  });
}

export async function updatePlaylistName(playlistId: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('PLAYLIST_NAME_REQUIRED');
  await db.childPlaylists.update(playlistId, { name: trimmed, updatedAt: Date.now() });
}

export async function deletePlaylist(playlistId: string): Promise<void> {
  await db.transaction('rw', db.childPlaylists, db.childPlaylistItems, async () => {
    await db.childPlaylistItems.where('playlistId').equals(playlistId).delete();
    await db.childPlaylists.delete(playlistId);
  });
}

export async function setLastUsedPlaylistId(playlistId: string | undefined): Promise<void> {
  const settings = await db.settings.get('main');
  if (!settings) return;
  await db.settings.put({ ...settings, lastUsedPlaylistId: playlistId });
}

