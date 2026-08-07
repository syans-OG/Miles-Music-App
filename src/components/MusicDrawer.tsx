import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AlertTriangle, Check, ChevronDown, ChevronUp, Clock, Disc, Flame, FolderHeart, FolderPlus, Heart, ListMusic, ListOrdered, ListPlus, MoreHorizontal, Pencil, Play, Plus, Save, Search, Settings, Sparkles, Trash2, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { usePlayerStore } from '../stores/usePlayerStore';
import { Playlist, Song } from '../types/player';
import { getDisplayCoverUrl } from '../utils/coverImage';
import { SettingsPanel } from './SettingsDialog';

interface EditSongDialogProps {
  song: Song;
  onClose: () => void;
  onSave: (updates: Pick<Song, 'title' | 'artist' | 'album'>) => void;
}

const EditSongDialog: React.FC<EditSongDialogProps> = ({ song, onClose, onSave }) => {
  const [title, setTitle] = useState(song.title);
  const [artist, setArtist] = useState(song.artist);
  const [album, setAlbum] = useState(song.album ?? '');

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const cleanTitle = title.trim();
    const cleanArtist = artist.trim();
    if (!cleanTitle || !cleanArtist) return;
    onSave({ title: cleanTitle, artist: cleanArtist, album: album.trim() || undefined });
  };

  return (
    <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/75 p-6 backdrop-blur-sm">
      <form onSubmit={handleSubmit} className="w-full rounded-2xl border border-white/10 bg-[#11141c] p-4 shadow-2xl">
        <div className="mb-4 flex items-center gap-3">
          <img src={getDisplayCoverUrl(song.coverUrl, 96)} alt="" loading="lazy" decoding="async" className="h-12 w-12 rounded-full object-cover" />
          <div className="min-w-0 flex-1">
            <h4 className="truncate text-sm font-bold text-white">Edit Song Info</h4>
            <p className="truncate text-[10px] text-slate-400">Changes are saved without modifying original audio files</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2.5">
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Title
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} autoFocus className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-normal normal-case tracking-normal text-white outline-none focus:border-amber-400/60" />
          </label>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Artist
            <input value={artist} onChange={(event) => setArtist(event.target.value)} maxLength={120} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-normal normal-case tracking-normal text-white outline-none focus:border-amber-400/60" />
          </label>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Album
            <input value={album} onChange={(event) => setAlbum(event.target.value)} maxLength={120} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-normal normal-case tracking-normal text-white outline-none focus:border-amber-400/60" />
          </label>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl bg-white/5 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10">Cancel</button>
          <button type="submit" disabled={!title.trim() || !artist.trim()} className="flex items-center gap-1.5 rounded-xl bg-amber-400 px-3 py-2 text-xs font-bold text-dark-900 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40">
            <Save className="h-3.5 w-3.5" /> Save
          </button>
        </div>
      </form>
    </div>
  );
};

const CreatePlaylistDialog: React.FC<{ onClose: () => void; onCreate: (name: string) => void }> = ({ onClose, onCreate }) => {
  const [name, setName] = useState('');
  return (
    <div className="absolute inset-0 z-[80] flex items-center justify-center bg-black/75 p-7 backdrop-blur-sm">
      <form onSubmit={(event) => { event.preventDefault(); if (name.trim()) onCreate(name); }} className="w-full rounded-2xl border border-indigo-400/20 bg-[#11141c] p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold text-white">New Playlist</h4>
            <p className="mt-0.5 text-[10px] text-slate-400">Create a playlist without copying audio files</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} autoFocus placeholder="Playlist Name" className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-white outline-none placeholder:text-slate-500 focus:border-indigo-400/60" />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl bg-white/5 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10">Cancel</button>
          <button type="submit" disabled={!name.trim()} className="flex items-center gap-1.5 rounded-xl bg-indigo-400 px-3 py-2 text-xs font-bold text-dark-900 hover:bg-indigo-300 disabled:opacity-40"><Plus className="h-3.5 w-3.5" /> Create</button>
        </div>
      </form>
    </div>
  );
};

interface SongPlaylistDialogProps {
  song: Song;
  playlists: Playlist[];
  onToggle: (playlistId: string) => void;
  onCreate: () => void;
  onClose: () => void;
}

const SongPlaylistDialog: React.FC<SongPlaylistDialogProps> = ({ song, playlists, onToggle, onCreate, onClose }) => (
  <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/75 p-6 backdrop-blur-sm">
    <div className="w-full rounded-2xl border border-white/10 bg-[#11141c] p-4 shadow-2xl">
      <div className="mb-3 flex items-center gap-3">
        <img src={getDisplayCoverUrl(song.coverUrl, 96)} alt="" loading="lazy" decoding="async" className="h-10 w-10 rounded-full object-cover" />
        <div className="min-w-0 flex-1"><h4 className="truncate text-sm font-bold text-white">Add to Playlist</h4><p className="truncate text-[10px] text-slate-400">{song.title}</p></div>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
      </div>
      <div className="max-h-[190px] space-y-1 overflow-y-auto pr-1">
        {playlists.map((playlist) => {
          const included = playlist.songs.some((item) => item.id === song.id);
          return (
            <button key={playlist.id} type="button" onClick={() => onToggle(playlist.id)} className="flex w-full items-center gap-2.5 rounded-xl border border-white/5 bg-white/5 p-2 text-left hover:bg-white/10">
              <img src={getDisplayCoverUrl(playlist.coverUrl, 96)} alt="" loading="lazy" decoding="async" className="h-8 w-8 rounded-lg object-cover" />
              <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-white">{playlist.name}</span>
              <span className={`flex h-5 w-5 items-center justify-center rounded-md border ${included ? 'border-indigo-300 bg-indigo-400 text-dark-900' : 'border-white/20 text-transparent'}`}><Check className="h-3 w-3" /></span>
            </button>
          );
        })}
        {playlists.length === 0 && <p className="py-5 text-center text-[11px] text-slate-500">No playlists created yet.</p>}
      </div>
      <button type="button" onClick={onCreate} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-indigo-400/30 py-2 text-[11px] font-semibold text-indigo-300 hover:bg-indigo-400/10"><Plus className="h-3.5 w-3.5" /> New Playlist</button>
    </div>
  </div>
);

interface PlaylistManagerDialogProps {
  playlist: Playlist;
  library: Song[];
  onToggle: (songId: string) => void;
  onPlay: (song: Song) => void;
  onDelete: () => void;
  onClose: () => void;
}

const PlaylistManagerDialog: React.FC<PlaylistManagerDialogProps> = ({ playlist, library, onToggle, onPlay, onDelete, onClose }) => {
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/75 p-5 backdrop-blur-sm">
      <div className="flex max-h-[360px] w-full flex-col rounded-2xl border border-white/10 bg-[#11141c] p-4 shadow-2xl">
        <div className="mb-3 flex items-center gap-3">
          <img src={getDisplayCoverUrl(playlist.coverUrl, 96)} alt="" loading="lazy" decoding="async" className="h-11 w-11 rounded-xl object-cover" />
          <div className="min-w-0 flex-1"><h4 className="truncate text-sm font-bold text-white">{playlist.name}</h4><p className="text-[10px] text-slate-400">{playlist.songs.length} songs</p></div>
          <button type="button" onClick={() => setConfirmDelete(true)} className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-300" title="Delete playlist"><Trash2 className="h-4 w-4" /></button>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Select songs</p>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {library.map((song) => {
            const included = playlist.songs.some((item) => item.id === song.id);
            return (
              <div key={song.id} className="flex items-center gap-2 rounded-xl bg-white/[0.04] p-1.5 hover:bg-white/[0.08]">
                <button type="button" onClick={() => onPlay(song)} className="relative h-8 w-8 flex-shrink-0 overflow-hidden rounded-lg"><img src={getDisplayCoverUrl(song.coverUrl, 96)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /><span className="absolute inset-0 flex items-center justify-center bg-black/35 text-white"><Play className="h-3 w-3 fill-current" /></span></button>
                <div className="min-w-0 flex-1"><p className="truncate text-[11px] font-semibold text-white">{song.title}</p><p className="truncate text-[9px] text-slate-500">{song.artist}</p></div>
                <button type="button" onClick={() => onToggle(song.id)} className={`flex h-6 w-6 items-center justify-center rounded-lg border ${included ? 'border-indigo-300 bg-indigo-400 text-dark-900' : 'border-white/15 text-slate-500 hover:border-white/30'}`}><Check className="h-3.5 w-3.5" /></button>
              </div>
            );
          })}
          {library.length === 0 && <p className="py-8 text-center text-[11px] text-slate-500">Library is empty.</p>}
        </div>
        {confirmDelete && (
          <div className="mt-3 flex items-center justify-between rounded-xl border border-rose-400/20 bg-rose-500/10 p-2">
            <span className="text-[10px] text-rose-200">Delete this playlist?</span>
            <div className="flex gap-1"><button type="button" onClick={() => setConfirmDelete(false)} className="rounded-lg px-2 py-1 text-[10px] text-slate-300 hover:bg-white/10">Cancel</button><button type="button" onClick={onDelete} className="rounded-lg bg-rose-500 px-2 py-1 text-[10px] font-bold text-white">Delete</button></div>
          </div>
        )}
      </div>
    </div>
  );
};

export const MusicDrawer: React.FC = () => {

  const [menuSongId, setMenuSongId] = useState<string | null>(null);
  const [editingSong, setEditingSong] = useState<Song | null>(null);
  const [deletingSong, setDeletingSong] = useState<Song | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreatePlaylistOpen, setIsCreatePlaylistOpen] = useState(false);
  const [playlistSong, setPlaylistSong] = useState<Song | null>(null);

  const {
    toggleDrawer,
    drawerTab,
    setDrawerTab,
    cdSubTab,
    setCdSubTab,
    playlists,
    selectedPlaylistId,
    selectPlaylist,
    youtubeImportTask,
    dismissYoutubeTask,
    topSongs,
    queue,
    playbackQueue,
    playSong,
    playPlaylist,
    addToPlaybackQueue,
    playNextFromQueue,
    removeFromPlaybackQueue,
    movePlaybackQueueItem,
    clearPlaybackQueue,
    currentSong,
    addMultipleLocalSongs,
    updateSongMetadata,
    toggleFavorite,
    createPlaylist,
    toggleSongInPlaylist,
    deletePlaylist,
    deleteSong,
    libraryNotice,
    clearLibraryNotice,
    isSettingsOpen,
    setSettingsOpen,
  } = usePlayerStore(useShallow((state) => ({
    toggleDrawer: state.toggleDrawer,
    drawerTab: state.drawerTab,
    setDrawerTab: state.setDrawerTab,
    cdSubTab: state.cdSubTab,
    setCdSubTab: state.setCdSubTab,
    playlists: state.playlists,
    selectedPlaylistId: state.selectedPlaylistId,
    selectPlaylist: state.selectPlaylist,
    youtubeImportTask: state.youtubeImportTask,
    dismissYoutubeTask: state.dismissYoutubeTask,
    topSongs: state.topSongs,
    queue: state.queue,
    playbackQueue: state.playbackQueue,
    playSong: state.playSong,
    playPlaylist: state.playPlaylist,
    addToPlaybackQueue: state.addToPlaybackQueue,
    playNextFromQueue: state.playNextFromQueue,
    removeFromPlaybackQueue: state.removeFromPlaybackQueue,
    movePlaybackQueueItem: state.movePlaybackQueueItem,
    clearPlaybackQueue: state.clearPlaybackQueue,
    currentSong: state.currentSong,
    addMultipleLocalSongs: state.addMultipleLocalSongs,
    updateSongMetadata: state.updateSongMetadata,
    toggleFavorite: state.toggleFavorite,
    createPlaylist: state.createPlaylist,
    toggleSongInPlaylist: state.toggleSongInPlaylist,
    deletePlaylist: state.deletePlaylist,
    deleteSong: state.deleteSong,
    libraryNotice: state.libraryNotice,
    clearLibraryNotice: state.clearLibraryNotice,
    isSettingsOpen: state.isSettingsOpen,
    setSettingsOpen: state.setSettingsOpen,
  })));

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cdScrollRef = useRef<HTMLDivElement>(null);
  const queueScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!libraryNotice) return;
    const timeout = window.setTimeout(clearLibraryNotice, 2800);
    return () => window.clearTimeout(timeout);
  }, [libraryNotice, clearLibraryNotice]);

  const filteredCDs = useMemo(() => {
    let songs = cdSubTab === 'favorites'
      ? queue.filter((song) => song.isFavorite)
      : cdSubTab === 'recent'
        ? [...queue].sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0))
        : queue;

    const query = searchQuery.trim().toLocaleLowerCase();
    if (query) {
      songs = songs.filter((song) =>
        song.title.toLocaleLowerCase().includes(query)
        || song.artist.toLocaleLowerCase().includes(query)
        || song.album?.toLocaleLowerCase().includes(query)
      );
    }
    return songs;
  }, [cdSubTab, queue, searchQuery]);

  const cdRowCount = Math.ceil(filteredCDs.length / 3);
  const cdVirtualizer = useVirtualizer({
    count: cdRowCount,
    getScrollElement: () => cdScrollRef.current,
    estimateSize: () => 130,
    gap: 12,
    overscan: 1,
    getItemKey: (index) => filteredCDs[index * 3]?.id ?? index,
  });
  const queueVirtualizer = useVirtualizer({
    count: playbackQueue.length,
    getScrollElement: () => queueScrollRef.current,
    estimateSize: () => 44,
    gap: 4,
    overscan: 2,
    getItemKey: (index) => playbackQueue[index]?.id ?? index,
  });

  const managedPlaylist = selectedPlaylistId
    ? playlists.find((playlist) => playlist.id === selectedPlaylistId) ?? null
    : null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addMultipleLocalSongs(e.target.files);
      e.target.value = '';
    }
  };

  // Helper to format real-time total listened seconds into "Xs listened", "Xm listened", or "Xh Ym listened"
  const formatListeningTime = (listenedSec: number = 0) => {
    const totalSec = Math.floor(listenedSec);
    if (totalSec < 60) {
      return `${totalSec}s listened`;
    }
    const totalMin = Math.floor(totalSec / 60);
    const hours = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m listened`;
    }
    return `${mins}m listened`;
  };

  return (
    /* Bottom Box (Physical Cabinet Drawer): Inset width (400px vs 440px top box) attached directly underneath top console */
    <div className="w-[400px] self-center bg-dark-900/95 rounded-b-3xl p-4 border-x border-b border-white/10 drawer-cabinet-shadow animate-drawer-pull -mt-2 z-10 relative overflow-hidden">

      {libraryNotice && (
        <div className="absolute left-1/2 top-12 z-[60] max-w-[340px] -translate-x-1/2 rounded-xl border border-amber-400/25 bg-[#171923]/95 px-3 py-2 text-center text-[10px] font-semibold text-amber-200 shadow-xl">
          {libraryNotice}
        </div>
      )}

      {youtubeImportTask?.status === 'success' && youtubeImportTask.report && (
        <div className="absolute bottom-3 left-1/2 z-[90] w-[356px] -translate-x-1/2 overflow-hidden rounded-xl border border-white/12 bg-[#11141c] shadow-2xl">
          <div className="flex items-center border-b border-white/10 px-3 py-2">
            <Check className="mr-2 h-3.5 w-3.5 text-emerald-300" />
            <p className="min-w-0 flex-1 truncate text-[10px] font-semibold text-white">{youtubeImportTask.message}</p>
            <button type="button" onClick={dismissYoutubeTask} className="rounded p-1 text-slate-500 hover:bg-white/10 hover:text-white" aria-label="Close import report"><X className="h-3.5 w-3.5" /></button>
          </div>
          <div className="grid grid-cols-4 divide-x divide-white/10 border-b border-white/10">
            {[
              ['Added', youtubeImportTask.report.added],
              ['Duplicates', youtubeImportTask.report.duplicates],
              ['Skipped', youtubeImportTask.report.skipped],
              ['100 Limit', youtubeImportTask.report.truncated ? 'Yes' : '—'],
            ].map(([label, value]) => (
              <div key={label} className="px-2 py-1.5">
                <strong className="block font-mono text-[11px] text-white">{value}</strong>
                <span className="text-[8px] uppercase tracking-wider text-slate-500">{label}</span>
              </div>
            ))}
          </div>
          {youtubeImportTask.report.skippedItems.length > 0 && (
            <div className="max-h-20 space-y-1 overflow-y-auto px-3 py-2">
              {youtubeImportTask.report.skippedItems.map((item, index) => (
                <div key={`${item.title}-${index}`} className="flex gap-2 text-[9px]">
                  <span className="min-w-0 flex-1 truncate text-slate-300">{item.title}</span>
                  <span className="flex-shrink-0 text-rose-300">{item.reason}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Hidden File Input for Audio File Picker */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        multiple
        accept="audio/*,.mp3,.wav,.flac,.m4a,.aac,.ogg"
        className="hidden"
      />

      {/* Top Drawer Pull Lip Line (Physical Shadow Accent) */}
      <div className="w-16 h-1 bg-white/20 rounded-full mx-auto -mt-1 mb-3 shadow-inner opacity-70" />

      {/* Main Header: primary music navigation, utility action, and drawer close */}
      <div className="mb-3 flex items-center gap-2 border-b border-white/10 pb-3">
        <div className="grid min-w-0 flex-1 grid-cols-4 gap-1 rounded-2xl border border-white/5 bg-white/5 p-1">
          {/* CD Category Tab */}
          <button
            onClick={() => { setSettingsOpen(false); setDrawerTab('cd'); }}
            className={`flex min-w-0 items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-amber-300/50 active:scale-[0.98] ${
              drawerTab === 'cd' && !isSettingsOpen
                ? 'bg-white text-dark-900 shadow-md font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Disc className={`h-3 w-3 flex-shrink-0 ${drawerTab === 'cd' && !isSettingsOpen ? 'text-amber-500' : ''}`} />
            <span>CD</span>
          </button>

          {/* Playlist Category Tab */}
          <button
            onClick={() => { setSettingsOpen(false); setDrawerTab('playlist'); }}
            className={`flex min-w-0 items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-amber-300/50 active:scale-[0.98] ${
              drawerTab === 'playlist' && !isSettingsOpen
                ? 'bg-white text-dark-900 shadow-md font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <FolderHeart className={`h-3 w-3 flex-shrink-0 ${drawerTab === 'playlist' && !isSettingsOpen ? 'text-amber-500' : ''}`} />
            <span>Playlist</span>
          </button>

          {/* Queue Category Tab (Positioned BEFORE TOP) */}
          <button
            onClick={() => { setSettingsOpen(false); setDrawerTab('queue'); }}
            className={`flex min-w-0 items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-amber-300/50 active:scale-[0.98] ${
              drawerTab === 'queue' && !isSettingsOpen
                ? 'bg-white text-dark-900 shadow-md font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ListOrdered className={`h-3 w-3 flex-shrink-0 ${drawerTab === 'queue' && !isSettingsOpen ? 'text-amber-500' : ''}`} />
            <span>Queue</span>
          </button>

          {/* TOP Category Tab (Matching Standard Pill Design) */}
          <button
            onClick={() => { setSettingsOpen(false); setDrawerTab('top'); }}
            className={`flex min-w-0 items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-amber-300/50 active:scale-[0.98] ${
              drawerTab === 'top' && !isSettingsOpen
                ? 'bg-white text-dark-900 shadow-md font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Flame className={`h-3 w-3 flex-shrink-0 ${drawerTab === 'top' && !isSettingsOpen ? 'text-amber-500 fill-amber-500' : 'text-amber-500/80'}`} />
            <span>TOP</span>
          </button>

        </div>        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border transition-colors focus-visible:ring-2 focus-visible:ring-amber-300/50 active:scale-[0.96] ${isSettingsOpen ? 'border-white bg-white text-dark-900 shadow-md' : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/20 hover:bg-white/10 hover:text-white'}`}
          title="Open Settings"
          aria-label="Open Settings"
          aria-pressed={isSettingsOpen}
        >
          <Settings className={`h-4 w-4 ${isSettingsOpen ? 'text-amber-500' : ''}`} strokeWidth={1.8} />
        </button>

        <button
          onClick={() => { setSettingsOpen(false); toggleDrawer(); }}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-amber-300/50 active:scale-[0.96]"
          title="Close Drawer"
          aria-label="Close Drawer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {isSettingsOpen && <SettingsPanel />}

      {/* CATEGORY 1: CD (With Sub-Categories: ALL, Recent, Favorites + Import MP3 Button) */}
      {!isSettingsOpen && drawerTab === 'cd' && (
        <div className="h-[317px] space-y-3">
          {/* Sub-Category Pills & Import MP3 Button */}
          <div className="flex items-center justify-between px-1">
            {isSearchOpen ? (
              <div className="flex h-[25px] w-full items-center gap-1.5 rounded-xl border border-amber-400/30 bg-white/5 px-2">
                <Search className="h-3.5 w-3.5 flex-shrink-0 text-amber-300" />
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search title, artist, or album..."
                  autoFocus
                  className="min-w-0 flex-1 bg-transparent text-[11px] text-white outline-none placeholder:text-slate-500"
                />
                {searchQuery && <span className="text-[9px] text-slate-500">{filteredCDs.length}</span>}
                <button type="button" onClick={() => { setSearchQuery(''); setIsSearchOpen(false); }} className="rounded p-0.5 text-slate-400 hover:text-white" aria-label="Close search">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setCdSubTab('all')} className={`px-2.5 py-0.5 rounded-lg text-[11px] font-medium transition-all ${cdSubTab === 'all' ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40 font-semibold' : 'bg-white/5 text-slate-400 hover:text-slate-200'}`}>ALL</button>
                  <button onClick={() => setCdSubTab('recent')} className={`px-2.5 py-0.5 rounded-lg text-[11px] font-medium transition-all ${cdSubTab === 'recent' ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40 font-semibold' : 'bg-white/5 text-slate-400 hover:text-slate-200'}`}>Recent</button>
                  <button onClick={() => setCdSubTab('favorites')} className={`px-2.5 py-0.5 rounded-lg text-[11px] font-medium transition-all ${cdSubTab === 'favorites' ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40 font-semibold' : 'bg-white/5 text-slate-400 hover:text-slate-200'}`}>Favorites</button>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => setIsSearchOpen(true)} className="rounded-lg border border-white/10 bg-white/5 p-1 text-slate-400 transition-colors hover:text-white" title="Search songs">
                    <Search className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/20 px-1.5 py-1 text-[10px] font-semibold text-amber-300 transition-all hover:bg-amber-500/30 active:scale-95" title="Add local music files">
                    <FolderPlus className="h-3.5 w-3.5 text-amber-400" />
                    <span>Import</span>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Grid Content: Pure Circular CD Discs + Text Directly Underneath (Frameless User Sketch) */}
          <div ref={cdScrollRef} className="h-[280px] overflow-y-auto overscroll-contain px-1 pt-2 pr-2">
            {filteredCDs.length === 0 && (
              <div className="flex h-[250px] flex-col items-center justify-center text-center">
                {cdSubTab === 'favorites' && !searchQuery ? <Heart className="mb-2 h-7 w-7 text-slate-600" /> : <Search className="mb-2 h-7 w-7 text-slate-600" />}
                <p className="text-xs font-semibold text-slate-300">{cdSubTab === 'favorites' && !searchQuery ? 'No favorite songs yet' : 'No songs found'}</p>
                <p className="mt-1 max-w-[220px] text-[10px] text-slate-500">{cdSubTab === 'favorites' && !searchQuery ? 'Click the heart icon on any CD to save it here.' : 'Try searching for another title, artist, or album.'}</p>
              </div>
            )}
            {filteredCDs.length > 0 && (
              <div className="relative w-full" style={{ height: cdVirtualizer.getTotalSize() }}>
                {cdVirtualizer.getVirtualItems().map((virtualRow) => (
                  <div
                    key={virtualRow.key}
                    className="absolute left-0 top-0 grid w-full grid-cols-3 gap-x-3"
                    style={{ height: 130, transform: `translateY(${virtualRow.start}px)` }}
                  >
                    {filteredCDs.slice(virtualRow.index * 3, virtualRow.index * 3 + 3).map((song) => (
                      <div
                        key={song.id}
                        onClick={() => playSong(song)}
                        className="pure-cd-container group/cd relative cursor-pointer flex flex-col items-center text-center"
                      >
                <button
                  type="button"
                  onClick={(event) => { event.stopPropagation(); toggleFavorite(song.id); }}
                  className={`absolute left-0 top-0 z-40 rounded-lg p-1 shadow-md transition-all ${song.isFavorite ? 'bg-rose-500 text-white opacity-100' : 'bg-black/60 text-slate-300 opacity-0 hover:bg-rose-500 hover:text-white group-hover/cd:opacity-100'}`}
                  aria-label={song.isFavorite ? `Remove ${song.title} from Favorites` : `Add ${song.title} to Favorites`}
                >
                  <Heart className={`h-3.5 w-3.5 ${song.isFavorite ? 'fill-current' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setMenuSongId((current) => current === song.id ? null : song.id);
                  }}
                  className="absolute right-0 top-0 z-40 rounded-lg bg-black/60 p-1 text-slate-300 opacity-0 shadow-md transition-all hover:bg-white hover:text-dark-900 group-hover/cd:opacity-100"
                  aria-label={`Menu ${song.title}`}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>

                {menuSongId === song.id && (
                  <div onClick={(event) => event.stopPropagation()} className="absolute right-0 top-7 z-50 w-28 overflow-hidden rounded-xl border border-white/10 bg-[#171923] p-1 text-left shadow-2xl">
                    <button type="button" onClick={() => { setEditingSong(song); setMenuSongId(null); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-slate-200 hover:bg-white/10">
                      <Pencil className="h-3 w-3 text-amber-300" /> Edit
                    </button>
                    <button type="button" onClick={() => { setPlaylistSong(song); setMenuSongId(null); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-indigo-200 hover:bg-indigo-400/10">
                      <ListMusic className="h-3 w-3 text-indigo-300" /> To Playlist
                    </button>
                    <button type="button" onClick={() => { playNextFromQueue(song.id); setMenuSongId(null); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-emerald-200 hover:bg-emerald-400/10">
                      <Play className="h-3 w-3 text-emerald-300" /> Play Next
                    </button>
                    <button type="button" onClick={() => { addToPlaybackQueue(song.id); setMenuSongId(null); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-sky-200 hover:bg-sky-400/10">
                      <ListPlus className="h-3 w-3 text-sky-300" /> To Queue
                    </button>
                    <button type="button" onClick={() => { setDeletingSong(song); setMenuSongId(null); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-rose-300 hover:bg-rose-500/10">
                      <Trash2 className="h-3 w-3" /> Delete
                    </button>
                  </div>
                )}

                {/* TOP: Pure Circular CD Disc */}
                <div className="pure-cd-disc vinyl-grooves relative flex items-center justify-center shadow-xl">
                  <img
                    src={getDisplayCoverUrl(song.coverUrl, 128)}
                    alt={song.title}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover opacity-90 group-hover/cd:opacity-100 transition-opacity"
                  />

                  {/* Center Spindle Hole */}
                  <div className="pure-cd-center-hole" />

                  {/* Hover Play Icon Overlay */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/cd:opacity-100 transition-opacity flex items-center justify-center z-20">
                    <div className="w-7 h-7 rounded-full bg-white text-dark-900 flex items-center justify-center shadow-lg">
                      <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                    </div>
                  </div>
                </div>

                {/* BOTTOM: Text Information (Line 1: Title, Line 2: Artist) */}
                <div className="mt-2 w-full">
                  <h5 className="text-[11px] font-bold text-white truncate group-hover/cd:text-amber-300 transition-colors font-sans px-0.5">
                    {song.title}
                  </h5>
                  <p className="text-[10px] text-slate-400 truncate mt-0.5">
                    {song.artist}
                  </p>
                </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* CATEGORY 2: PLAYLIST */}
      {!isSettingsOpen && drawerTab === 'playlist' && (
        <div className="h-[317px] space-y-3">
          <div className="flex items-center justify-between px-1">
            <div><p className="text-[11px] font-semibold text-slate-300">Your Collection</p><p className="text-[9px] text-slate-500">{playlists.length} playlists</p></div>
            <button type="button" onClick={() => { setPlaylistSong(null); setIsCreatePlaylistOpen(true); }} className="flex items-center gap-1 rounded-lg border border-indigo-400/30 bg-indigo-400/10 px-2 py-1 text-[10px] font-semibold text-indigo-300 hover:bg-indigo-400/20"><Plus className="h-3.5 w-3.5" /> New Playlist</button>
          </div>
          <div className="grid h-[280px] grid-cols-2 auto-rows-[66px] gap-2.5 overflow-y-auto overscroll-contain pr-1">
            {playlists.map((playlist) => (
              <button
                type="button"
                key={playlist.id}
                onClick={() => selectPlaylist(playlist.id)}
                className="group/playlist flex items-center gap-2.5 rounded-2xl border border-white/5 bg-white/5 p-2 text-left transition-all hover:border-indigo-400/25 hover:bg-white/10"
              >
                <div className="relative h-11 w-11 flex-shrink-0 overflow-hidden rounded-xl border border-white/10">
                  <img src={getDisplayCoverUrl(playlist.coverUrl, 96)} alt={playlist.name} loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform group-hover/playlist:scale-105" />
                  {playlist.songs.length > 0 && <span onClick={(event) => { event.stopPropagation(); playPlaylist(playlist.id); }} className="absolute inset-0 flex items-center justify-center bg-black/35 text-white opacity-0 transition-opacity group-hover/playlist:opacity-100"><Play className="h-4 w-4 fill-current" /></span>}
                </div>
                <div className="min-w-0 flex-1">
                  <h5 className="truncate text-[11px] font-bold text-white transition-colors group-hover/playlist:text-indigo-300">{playlist.name}</h5>
                  <p className="mt-0.5 truncate text-[9px] text-slate-500">{playlist.songs.length} songs · {playlist.curator}</p>
                  <span className="mt-1 inline-flex items-center gap-1 text-[9px] text-slate-400"><ListMusic className="h-2.5 w-2.5" /> Manage</span>
                </div>
              </button>
            ))}
            {playlists.length === 0 && (
              <div className="col-span-2 flex h-[250px] flex-col items-center justify-center text-center"><ListMusic className="mb-2 h-8 w-8 text-slate-600" /><p className="text-xs font-semibold text-slate-300">No playlists yet</p><p className="mt-1 text-[10px] text-slate-500">Create your first playlist to organize your music.</p></div>
            )}
          </div>
        </div>
      )}

      {/* CATEGORY 3: PLAYBACK QUEUE */}
      {!isSettingsOpen && drawerTab === 'queue' && (
        <div className="h-[317px] space-y-3">
          <div className="flex items-center justify-between px-1">
            <div><p className="text-[11px] font-semibold text-slate-300">Now Playing & Up Next</p><p className="text-[9px] text-slate-500">{playbackQueue.length} songs in queue</p></div>
            <button type="button" onClick={clearPlaybackQueue} disabled={playbackQueue.length <= (currentSong ? 1 : 0)} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold text-slate-400 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35">Clear</button>
          </div>
          <div ref={queueScrollRef} className="h-[280px] overflow-y-auto overscroll-contain pr-1">
            {playbackQueue.length > 0 && (
              <div className="relative w-full" style={{ height: queueVirtualizer.getTotalSize() }}>
                {queueVirtualizer.getVirtualItems().map((virtualItem) => {
                  const index = virtualItem.index;
                  const song = playbackQueue[index];
                  if (!song) return null;
                  const isCurrent = currentSong?.id === song.id;
                  return (
                    <div
                      key={virtualItem.key}
                      ref={queueVirtualizer.measureElement}
                      data-index={index}
                      onClick={() => playSong(song)}
                      className={`group/queue absolute left-0 top-0 flex w-full cursor-pointer items-center gap-2 rounded-xl border p-1.5 transition-colors ${isCurrent ? 'border-emerald-400/30 bg-emerald-400/10' : 'border-transparent bg-white/[0.04] hover:bg-white/[0.08]'}`}
                      style={{ transform: `translateY(${virtualItem.start}px)` }}
                    >
                  <span className={`w-4 text-center text-[9px] font-mono ${isCurrent ? 'text-emerald-300' : 'text-slate-600'}`}>{isCurrent ? '▶' : index + 1}</span>
                  <img src={getDisplayCoverUrl(song.coverUrl, 96)} alt="" loading="lazy" decoding="async" className="h-8 w-8 flex-shrink-0 rounded-lg object-cover" />
                  <div className="min-w-0 flex-1"><p className={`truncate text-[11px] font-semibold ${isCurrent ? 'text-emerald-200' : 'text-white'}`}>{song.title}</p><p className="truncate text-[9px] text-slate-500">{song.artist}</p></div>
                  <div onClick={(event) => event.stopPropagation()} className="flex items-center opacity-0 transition-opacity group-hover/queue:opacity-100">
                    <button type="button" onClick={() => movePlaybackQueueItem(song.id, 'up')} disabled={index === 0} className="rounded p-1 text-slate-500 hover:bg-white/10 hover:text-white disabled:opacity-20" title="Move Up"><ChevronUp className="h-3 w-3" /></button>
                    <button type="button" onClick={() => movePlaybackQueueItem(song.id, 'down')} disabled={index === playbackQueue.length - 1} className="rounded p-1 text-slate-500 hover:bg-white/10 hover:text-white disabled:opacity-20" title="Move Down"><ChevronDown className="h-3 w-3" /></button>
                    <button type="button" onClick={() => removeFromPlaybackQueue(song.id)} disabled={isCurrent} className="rounded p-1 text-slate-500 hover:bg-rose-500/10 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-20" title={isCurrent ? 'Now playing' : 'Remove'}><X className="h-3 w-3" /></button>
                  </div>
                    </div>
                  );
                })}
              </div>
            )}
            {playbackQueue.length === 0 && (
              <div className="flex h-[250px] flex-col items-center justify-center text-center"><ListOrdered className="mb-2 h-8 w-8 text-slate-600" /><p className="text-xs font-semibold text-slate-300">Queue is empty</p><p className="mt-1 max-w-[220px] text-[10px] text-slate-500">Double click any song or use the CD menu to add songs to Queue.</p></div>
            )}
          </div>
        </div>
      )}

      {/* CATEGORY 4: TOP (Songs Analytics with Hours/Minutes Listened & Play Count - TOP 5 Cards Layout) */}
      {!isSettingsOpen && drawerTab === 'top' && (
        <div className="h-[317px] overflow-y-auto space-y-2 pr-1 py-0.5">
          {topSongs.length > 0 ? (
            topSongs.slice(0, 5).map((song, index) => {
              const isTop1 = index === 0;
              const isTop2 = index === 1;
              const isTop3 = index === 2;
              const isCurrentlyPlaying = currentSong?.id === song.id;

              return (
                <div
                  key={song.id}
                  onClick={() => playSong(song)}
                  className={`group flex cursor-pointer items-center justify-between rounded-2xl border p-2.5 transition-all hover:bg-white/10 active:scale-[0.98] ${
                    isCurrentlyPlaying
                      ? 'border-amber-400/40 bg-amber-400/10 font-bold'
                      : isTop1
                        ? 'border-amber-400/30 bg-gradient-to-r from-amber-500/15 via-white/[0.06] to-white/[0.04]'
                        : isTop2
                          ? 'border-slate-300/20 bg-white/5'
                          : isTop3
                            ? 'border-amber-700/25 bg-white/5'
                            : 'border-white/5 bg-white/5'
                  }`}
                >
                  {/* Left Side: Rank Badge, Artwork Cover, Title & Artist */}
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    <div
                      className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg font-mono text-[10px] font-bold shadow-sm ${
                        isTop1
                          ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-dark-900 shadow-amber-500/30'
                          : isTop2
                            ? 'bg-slate-300 text-dark-900'
                            : isTop3
                              ? 'bg-amber-700/90 text-amber-100'
                              : 'bg-white/10 text-slate-400'
                      }`}
                    >
                      #{index + 1}
                    </div>

                    <img
                      src={getDisplayCoverUrl(song.coverUrl, 96)}
                      alt={song.title}
                      loading="lazy"
                      decoding="async"
                      className="h-10 w-10 flex-shrink-0 rounded-xl border border-white/10 object-cover"
                    />

                    <div className="min-w-0">
                      <h5 className="flex items-center gap-1.5 truncate text-xs font-bold text-white">
                        <span className="truncate">{song.title}</span>
                        {isTop1 && <Sparkles className="h-3.5 w-3.5 flex-shrink-0 fill-amber-400 text-amber-400" />}
                      </h5>
                      <p className="truncate text-[10px] text-slate-400">{song.artist}</p>
                    </div>
                  </div>

                  {/* Right Side: Analytics Stats (Play Count & Listening Duration) */}
                  <div className="flex flex-shrink-0 flex-col items-end gap-1 font-mono text-[10px]">
                    <div className="flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-amber-300 font-semibold">
                      <Flame className="h-3 w-3 fill-amber-400/30 text-amber-400" />
                      <span>{song.playCount} plays</span>
                    </div>

                    <span className="flex items-center gap-1 text-[9px] text-slate-400">
                      <Clock className="h-2.5 w-2.5 text-slate-500" />
                      <span>{formatListeningTime(song.listenedSeconds)}</span>
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <Flame className="mb-2 h-8 w-8 text-slate-600" />
              <p className="text-xs font-semibold text-slate-300">No Top Songs yet</p>
              <p className="mt-1 max-w-[220px] text-[10px] text-slate-500">Play songs to view your most listened tracks analytics.</p>
            </div>
          )}
        </div>
      )}

      {playlistSong && (
        <SongPlaylistDialog
          song={playlistSong}
          playlists={playlists}
          onToggle={(playlistId) => toggleSongInPlaylist(playlistId, playlistSong.id)}
          onCreate={() => setIsCreatePlaylistOpen(true)}
          onClose={() => setPlaylistSong(null)}
        />
      )}

      {managedPlaylist && (
        <PlaylistManagerDialog
          key={managedPlaylist.id}
          playlist={managedPlaylist}
          library={queue}
          onToggle={(songId) => toggleSongInPlaylist(managedPlaylist.id, songId)}
          onPlay={(song) => playPlaylist(managedPlaylist.id, song.id)}
          onDelete={() => {
            deletePlaylist(managedPlaylist.id);
            selectPlaylist(null);
          }}
          onClose={() => selectPlaylist(null)}
        />
      )}

      {isCreatePlaylistOpen && (
        <CreatePlaylistDialog
          onClose={() => setIsCreatePlaylistOpen(false)}
          onCreate={(name) => {
            const playlistId = createPlaylist(name);
            if (playlistSong) toggleSongInPlaylist(playlistId, playlistSong.id);
            setPlaylistSong(null);
            setIsCreatePlaylistOpen(false);
            selectPlaylist(playlistId);
          }}
        />
      )}

      {editingSong && (
        <EditSongDialog
          key={editingSong.id}
          song={editingSong}
          onClose={() => setEditingSong(null)}
          onSave={(updates) => {
            updateSongMetadata(editingSong.id, updates);
            setEditingSong(null);
          }}
        />
      )}

      {deletingSong && (
        <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/75 p-7 backdrop-blur-sm">
          <div className="w-full rounded-2xl border border-rose-400/20 bg-[#11141c] p-5 text-center shadow-2xl">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-rose-500/10 text-rose-300">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <h4 className="text-sm font-bold text-white">Delete song?</h4>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
              “{deletingSong.title}” will be removed from your library{deletingSong.source.kind === 'local' && deletingSong.source.managed ? ' along with application storage files.' : '.'}
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <button type="button" onClick={() => setDeletingSong(null)} className="rounded-xl bg-white/5 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10">Cancel</button>
              <button type="button" onClick={async () => { await deleteSong(deletingSong.id); setDeletingSong(null); }} className="flex items-center gap-1.5 rounded-xl bg-rose-500 px-3 py-2 text-xs font-bold text-white hover:bg-rose-400">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
