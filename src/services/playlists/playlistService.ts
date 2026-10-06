import { addPlaylistItem, createPlaylist, createPlaylistWithVideo, deletePlaylist, getPlaylist, getPlaylistItems, listPlaylists, removePlaylistItem, reorderPlaylistItem, setLastUsedPlaylistId, updatePlaylistName } from './playlistRepository';
import db, { type PlaylistItem } from '../../db';

export async function saveVideoToPlaylist(
  videoId: string,
  title?: string,
  playlistId?: string,
): Promise<{ playlistId: string; added: boolean }> {
  let target = playlistId;
  if (!target) {
    const settings = await db.settings.get('main');
    target = settings?.lastUsedPlaylistId;
  }
  if (!target) throw new Error('PLAYLIST_SELECTION_REQUIRED');
  const result = await addPlaylistItem(target, videoId, { titleSnapshot: title });
  if (result.added) await setLastUsedPlaylistId(target);
  return { playlistId: target, added: result.added };
}

export async function createAndSaveVideo(
  name: string,
  videoId: string,
  title?: string,
): Promise<{ playlistId: string; item: PlaylistItem }> {
  const created = await createPlaylistWithVideo(name, videoId, { titleSnapshot: title });
  await setLastUsedPlaylistId(created.playlist.id);
  return { playlistId: created.playlist.id, item: created.item };
}

export {
  addPlaylistItem,
  createPlaylist,
  createPlaylistWithVideo,
  deletePlaylist,
  getPlaylist,
  getPlaylistItems,
  listPlaylists,
  removePlaylistItem,
  reorderPlaylistItem,
  setLastUsedPlaylistId,
  updatePlaylistName,
};

