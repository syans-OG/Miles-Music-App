import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AlertTriangle, ArrowLeft, Check, Clock, Disc, Download, Flame, FolderHeart, FolderPlus, GripVertical, Heart, ListChecks, ListMusic, ListOrdered, MoreHorizontal, Pencil, Play, Plus, Repeat, Search, Settings, Shuffle, Sparkles, Trash2, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { usePlayerStore, getSongDownloadVideoId } from '../stores/usePlayerStore';
import { Playlist, Song } from '../types/player';
import { getDisplayCoverUrl, handleCoverImageError } from '../utils/coverImage';
import { getFloatingMenuPosition } from '../utils/floatingMenuPosition';
import { SettingsPanel } from './SettingsDialog';
import { DownloadActivity } from './DownloadActivity';

interface EditSongDialogProps {
  song: Song;
  onClose: () => void;
  onSave: (updates: Pick<Song, 'title' | 'artist' | 'album'>) => void;
}

const EditSongDialog: React.FC<EditSongDialogProps> = ({ song, onClose, onSave }) => {
  const [title, setTitle] = useState(song.title);
  const [artist, setArtist] = useState(song.artist);
  const [album, setAlbum] = useState(song.album ?? '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !artist.trim()) return;
    onSave({
      title: title.trim(),
      artist: artist.trim(),
      album: album.trim() || undefined,
    });
  };

  return (
    <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/75 p-6 backdrop-blur-sm">
      <form onSubmit={handleSubmit} className="w-full rounded-2xl border border-white/10 bg-[#11141c] p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-bold text-white">Edit Song Info</h4>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-2.5">
          <div>
            <label className="text-[10px] font-semibold text-slate-400">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white outline-none focus:border-amber-400" autoFocus />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-400">Artist</label>
            <input value={artist} onChange={(e) => setArtist(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white outline-none focus:border-amber-400" />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-400">Album</label>
            <input value={album} onChange={(e) => setAlbum(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white outline-none focus:border-amber-400" />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/10">Cancel</button>
          <button type="submit" className="rounded-xl bg-amber-400 px-3.5 py-1.5 text-xs font-bold text-dark-900 shadow-md hover:bg-amber-300">Save</button>
        </div>
      </form>
    </div>
  );
};

interface RenamePlaylistDialogProps {
  playlist: Playlist;
  onClose: () => void;
  onSave: (newName: string) => void;
}

const RenamePlaylistDialog: React.FC<RenamePlaylistDialogProps> = ({ playlist, onClose, onSave }) => {
  const [name, setName] = useState(playlist.name);
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave(name.trim());
  };

  return (
    <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/75 p-6 backdrop-blur-sm">
      <form onSubmit={handleSubmit} className="w-full rounded-2xl border border-white/10 bg-[#11141c] p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-bold text-white">Rename Playlist</h4>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <div>
          <label className="text-[10px] font-semibold text-slate-400">Playlist Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white outline-none focus:border-indigo-400" autoFocus />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/10">Cancel</button>
          <button type="submit" disabled={!name.trim()} className="rounded-xl bg-indigo-500 px-3.5 py-1.5 text-xs font-bold text-white shadow-md hover:bg-indigo-400 disabled:opacity-40">Save</button>
        </div>
      </form>
    </div>
  );
};

interface CreatePlaylistDialogProps {
  onClose: () => void;
  onCreate: (name: string) => void;
}

const CreatePlaylistDialog: React.FC<CreatePlaylistDialogProps> = ({ onClose, onCreate }) => {
  const [name, setName] = useState('');
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate(name.trim());
  };

  return (
    <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/75 p-6 backdrop-blur-sm">
      <form onSubmit={handleSubmit} className="w-full rounded-2xl border border-white/10 bg-[#11141c] p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-bold text-white">Create Playlist</h4>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <div>
          <label className="text-[10px] font-semibold text-slate-400">Playlist Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Favorite Jams" className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white outline-none focus:border-indigo-400" autoFocus />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/10">Cancel</button>
          <button type="submit" className="rounded-xl bg-indigo-500 px-3.5 py-1.5 text-xs font-bold text-white shadow-md hover:bg-indigo-400">Create</button>
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
        <img src={getDisplayCoverUrl(song.coverUrl, 96)} onError={handleCoverImageError} alt="" loading="lazy" decoding="async" className="h-10 w-10 rounded-full object-cover" />
        <div className="min-w-0 flex-1"><h4 className="truncate text-sm font-bold text-white">Add to Playlist</h4><p className="truncate text-[10px] text-slate-400">{song.title}</p></div>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
      </div>
      <div className="max-h-[190px] space-y-1 overflow-y-auto pr-1">
        {playlists.map((playlist) => {
          const included = playlist.songs.some((item) => item.id === song.id);
          return (
            <button key={playlist.id} type="button" onClick={() => onToggle(playlist.id)} className="flex w-full items-center gap-2.5 rounded-xl border border-white/5 bg-white/5 p-2 text-left hover:bg-white/10">
              <img src={getDisplayCoverUrl(playlist.songs[0]?.coverUrl || playlist.coverUrl, 96)} onError={handleCoverImageError} alt="" loading="lazy" decoding="async" className="h-8 w-8 rounded-lg object-cover" />
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

interface BatchAddToPlaylistDialogProps {
  count: number;
  playlists: Playlist[];
  onSelect: (playlistId: string) => void;
  onCreate: () => void;
  onClose: () => void;
}

const BatchAddToPlaylistDialog: React.FC<BatchAddToPlaylistDialogProps> = ({ count, playlists, onSelect, onCreate, onClose }) => (
  <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/75 p-6 backdrop-blur-sm">
    <div className="w-full rounded-2xl border border-white/10 bg-[#11141c] p-4 shadow-2xl">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-bold text-white">Add to Playlist</h4>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
      </div>
      <p className="mb-2 text-[10px] text-slate-400">Add {count} selected songs to a playlist (existing songs are skipped).</p>
      <div className="max-h-[190px] space-y-1 overflow-y-auto pr-1">
        {playlists.map((playlist) => (
          <button key={playlist.id} type="button" onClick={() => onSelect(playlist.id)} className="flex w-full items-center gap-2.5 rounded-xl border border-white/5 bg-white/5 p-2 text-left hover:bg-white/10">
            <img src={getDisplayCoverUrl(playlist.songs[0]?.coverUrl || playlist.coverUrl, 96)} onError={handleCoverImageError} alt="" loading="lazy" decoding="async" className="h-8 w-8 rounded-lg object-cover" />
            <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-white">{playlist.name}</span>
            <span className="text-[10px] tabular-nums text-slate-500">{playlist.songs.length} songs</span>
          </button>
        ))}
        {playlists.length === 0 && <p className="py-5 text-center text-[11px] text-slate-500">No playlists created yet.</p>}
      </div>
      <button type="button" onClick={onCreate} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-indigo-400/30 py-2 text-[11px] font-semibold text-indigo-300 hover:bg-indigo-400/10"><Plus className="h-3.5 w-3.5" /> New Playlist</button>
    </div>
  </div>
);

interface PlaylistSortableRowProps {
  song: Song;
  index: number;
  isCurrent: boolean;
  onPlay: () => void;
  onRemove: () => void;
}

const PlaylistSortableRow: React.FC<PlaylistSortableRowProps> = ({ song, index, isCurrent, onPlay, onRemove }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: song.id });
  return (
    <div
      ref={setNodeRef}
      onClick={onPlay}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group/song flex cursor-pointer items-center gap-2 rounded-xl border p-1.5 transition-all ${
        isDragging ? 'z-10 opacity-30' : ''
      } ${
        isCurrent
          ? 'border-indigo-400/40 bg-indigo-400/15 font-semibold'
          : 'border-white/5 bg-white/[0.03] hover:border-white/10 hover:bg-white/[0.07]'
      }`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="cursor-grab rounded p-0.5 text-slate-600 hover:bg-white/10 hover:text-slate-300 active:cursor-grabbing"
        title="Seret untuk mengubah urutan"
        aria-label={`Atur ulang ${song.title}`}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <span className={`w-4 text-center font-mono text-[9px] ${isCurrent ? 'font-bold text-indigo-300' : 'text-slate-500'}`}>
        {isCurrent ? '▶' : index + 1}
      </span>
      <img
        src={getDisplayCoverUrl(song.coverUrl, 96)}
        onError={handleCoverImageError}
        alt=""
        loading="lazy"
        decoding="async"
        className="h-8 w-8 flex-shrink-0 rounded-lg object-cover"
      />
      <div className="min-w-0 flex-1">
        <p className={`truncate text-[11px] ${isCurrent ? 'text-indigo-200' : 'text-white'}`}>
          {song.title}
        </p>
        <p className="truncate text-[9px] text-slate-500">{song.artist}</p>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="rounded p-1 text-slate-500 opacity-0 transition-opacity hover:bg-rose-500/20 hover:text-rose-300 group-hover/song:opacity-100"
        title="Remove from playlist"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

interface QueueSortableRowProps {
  song: Song;
  index: number;
  isCurrent: boolean;
  measureRef: (node: HTMLDivElement | null) => void;
  onPlay: () => void;
  onRemove: () => void;
  positionStyle?: React.CSSProperties;
}

const QueueSortableRow: React.FC<QueueSortableRowProps> = ({ song, index, isCurrent, measureRef, onPlay, onRemove, positionStyle }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: song.id });
  return (
    <div ref={measureRef} data-index={index} style={positionStyle} className="absolute left-0 top-0 w-full">
      <div
        ref={setNodeRef}
        onClick={onPlay}
        style={{ transform: CSS.Transform.toString(transform), transition }}
        className={`group/queue flex cursor-pointer items-center gap-2 rounded-xl border p-1.5 transition-colors ${
          isDragging ? 'z-10 opacity-30' : ''
        } ${isCurrent ? 'border-emerald-400/30 bg-emerald-400/10' : 'border-transparent bg-white/[0.04] hover:bg-white/[0.08]'}`}
      >
        <button
          type="button"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="cursor-grab rounded p-1 text-slate-600 hover:bg-white/10 hover:text-slate-300 active:cursor-grabbing"
          title="Seret untuk mengubah urutan"
          aria-label={`Atur ulang ${song.title}`}
        >
          <GripVertical className="h-3 w-3" />
        </button>
        <span className={`w-4 text-center text-[9px] font-mono ${isCurrent ? 'text-emerald-300' : 'text-slate-600'}`}>{isCurrent ? '▶' : index + 1}</span>
        <img src={getDisplayCoverUrl(song.coverUrl, 96)} onError={handleCoverImageError} alt="" loading="lazy" decoding="async" className="h-8 w-8 flex-shrink-0 rounded-lg object-cover" />
        <div className="min-w-0 flex-1"><p className={`truncate text-[11px] font-semibold ${isCurrent ? 'text-emerald-200' : 'text-white'}`}>{song.title}</p><p className="truncate text-[9px] text-slate-500">{song.artist}</p></div>
        <button type="button" onClick={(e) => { e.stopPropagation(); onRemove(); }} disabled={isCurrent} className="rounded p-1 text-slate-500 hover:bg-rose-500/10 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-20" title={isCurrent ? 'Now playing' : 'Remove'}><X className="h-3 w-3" /></button>
      </div>
    </div>
  );
};

interface AddSongsModalProps {
  playlist: Playlist;
  library: Song[];
  onToggle: (songId: string) => void;
  onClose: () => void;
}

const AddSongsToPlaylistModal: React.FC<AddSongsModalProps> = ({ playlist, library, onToggle, onClose }) => {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return library;
    return library.filter((s) => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q));
  }, [library, search]);

  return (
    <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <div className="flex max-h-[350px] w-full flex-col rounded-2xl border border-white/10 bg-[#11141c] p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-bold text-white">Add Songs to “{playlist.name}”</h4>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="mb-2.5 flex h-7 items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2">
          <Search className="h-3 w-3 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search songs in library..."
            className="w-full bg-transparent text-[11px] text-white outline-none placeholder:text-slate-500"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-slate-400 hover:text-white">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* List of library songs with Checkbox */}
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {filtered.map((song) => {
            const included = playlist.songs.some((s) => s.id === song.id);
            return (
              <div
                key={song.id}
                onClick={() => onToggle(song.id)}
                className={`flex cursor-pointer items-center gap-2.5 rounded-xl p-1.5 transition-colors ${
                  included ? 'border border-indigo-400/30 bg-indigo-500/10' : 'bg-white/[0.04] hover:bg-white/[0.08]'
                }`}
              >
                <img
                  src={getDisplayCoverUrl(song.coverUrl, 96)}
                  onError={handleCoverImageError}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-8 w-8 rounded-lg object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-[11px] font-semibold ${included ? 'text-indigo-200' : 'text-white'}`}>
                    {song.title}
                  </p>
                  <p className="truncate text-[9px] text-slate-400">{song.artist}</p>
                </div>
                <div className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                  included ? 'border-indigo-400 bg-indigo-500 text-white' : 'border-white/20 text-transparent'
                }`}>
                  <Check className="h-3 w-3" />
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="py-8 text-center text-[11px] text-slate-500">No songs found.</p>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-3 flex w-full items-center justify-center rounded-xl bg-indigo-500 py-1.5 text-xs font-semibold text-white shadow-md hover:bg-indigo-600 active:scale-[0.98]"
        >
          Done
        </button>
      </div>
    </div>
  );
};

interface CdActionMenuProps {
  song: Song;
  anchor: HTMLButtonElement;
  onClose: () => void;
  onEdit: () => void;
  onAddToPlaylist: () => void;
  onDelete: () => void;
  onDownload: () => void;
  onRemoveOffline: () => void;
}

const CdActionMenu: React.FC<CdActionMenuProps> = ({
  song,
  anchor,
  onClose,
  onEdit,
  onAddToPlaylist,
  onDelete,
  onDownload,
  onRemoveOffline,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;

    const bounds = menu.getBoundingClientRect();
    setPosition(getFloatingMenuPosition(
      anchor.getBoundingClientRect(),
      { width: bounds.width, height: bounds.height },
      { width: window.innerWidth, height: window.innerHeight },
    ));
    menu.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }, [anchor]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !anchor.contains(target)) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      onClose();
      window.requestAnimationFrame(() => anchor.focus());
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [anchor, onClose]);

  const runAction = (action: () => void) => {
    action();
    onClose();
  };

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={`Actions for ${song.title}`}
      className="fixed z-[120] w-32 overflow-hidden rounded-xl border border-white/10 bg-[#171923] p-1 text-left shadow-2xl"
      style={{
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        visibility: position ? 'visible' : 'hidden',
      }}
    >
      <button role="menuitem" type="button" onClick={() => runAction(onEdit)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-slate-200 hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none">
        <Pencil className="h-3 w-3 text-amber-300" /> Edit
      </button>
      <button role="menuitem" type="button" onClick={() => runAction(onAddToPlaylist)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-indigo-200 hover:bg-indigo-400/10 focus-visible:bg-indigo-400/10 focus-visible:outline-none">
        <ListMusic className="h-3 w-3 text-indigo-300" /> To Playlist
      </button>
      {song.offline || getSongDownloadVideoId(song) ? (
        song.offline ? (
          <button role="menuitem" type="button" onClick={() => runAction(onRemoveOffline)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-amber-300 hover:bg-amber-400/10 focus-visible:bg-amber-400/10 focus-visible:outline-none">
            <Trash2 className="h-3 w-3" /> Hapus Unduhan
          </button>
        ) : (
          <button role="menuitem" type="button" onClick={() => runAction(onDownload)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-amber-200 hover:bg-amber-400/10 focus-visible:bg-amber-400/10 focus-visible:outline-none">
            <Download className="h-3 w-3 text-amber-300" /> Download
          </button>
        )
      ) : null}
      <button role="menuitem" type="button" onClick={() => runAction(onDelete)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-rose-300 hover:bg-rose-500/10 focus-visible:bg-rose-500/10 focus-visible:outline-none">
        <Trash2 className="h-3 w-3" /> Delete
      </button>
    </div>,
    document.body,
  );
};

interface PlaylistActionMenuProps {
  anchor: HTMLButtonElement;
  canPlay: boolean;
  onShuffle: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onClose: () => void;
}

const PlaylistActionMenu: React.FC<PlaylistActionMenuProps> = ({
  anchor,
  canPlay,
  onShuffle,
  onDownload,
  onDelete,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu || !anchor) return;

    const bounds = menu.getBoundingClientRect();
    setPosition(getFloatingMenuPosition(
      anchor.getBoundingClientRect(),
      { width: bounds.width, height: bounds.height },
      { width: window.innerWidth, height: window.innerHeight },
    ));
    menu.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }, [anchor]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !anchor.contains(target)) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      onClose();
      window.requestAnimationFrame(() => anchor.focus());
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [anchor, onClose]);

  const runAction = (action: () => void) => {
    action();
    onClose();
  };

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="Playlist actions"
      className="fixed z-[120] w-36 overflow-hidden rounded-xl border border-white/10 bg-[#171923] p-1 text-left shadow-2xl"
      style={{
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        visibility: position ? 'visible' : 'hidden',
      }}
    >
      <button role="menuitem" type="button" onClick={() => runAction(onShuffle)} disabled={!canPlay} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-slate-200 hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40">
        <Shuffle className="h-3 w-3 text-slate-300" /> Shuffle Play
      </button>
      <button role="menuitem" type="button" onClick={() => runAction(onDownload)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-amber-200 hover:bg-amber-400/10 focus-visible:bg-amber-400/10 focus-visible:outline-none">
        <Download className="h-3 w-3 text-amber-300" /> Download Playlist
      </button>
      <button role="menuitem" type="button" onClick={() => runAction(onDelete)} disabled={!canPlay} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-rose-300 hover:bg-rose-500/10 focus-visible:bg-rose-500/10 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40">
        <Trash2 className="h-3 w-3" /> Delete Playlist
      </button>
    </div>,
    document.body,
  );
};

export const MusicDrawer: React.FC = () => {

  const [cdMenu, setCdMenu] = useState<{ song: Song; anchor: HTMLButtonElement } | null>(null);
  const [playlistMenu, setPlaylistMenu] = useState<{ anchor: HTMLButtonElement } | null>(null);
  const [editingSong, setEditingSong] = useState<Song | null>(null);
  const [deletingSong, setDeletingSong] = useState<Song | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreatePlaylistOpen, setIsCreatePlaylistOpen] = useState(false);
  const [playlistSong, setPlaylistSong] = useState<Song | null>(null);
  const [isBatchAddOpen, setIsBatchAddOpen] = useState(false);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedSongIds, setSelectedSongIds] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [isAddSongsOpen, setIsAddSongsOpen] = useState(false);
  const [playlistToDelete, setPlaylistToDelete] = useState<Playlist | null>(null);
  const [renamingPlaylist, setRenamingPlaylist] = useState<Playlist | null>(null);

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
    downloadTask,
    enqueueDownloads,
    removeOfflineDownload,
    topSongs,
    queue,
    playbackQueue,
    playSong,
    playSongList,
    playPlaylist,
    removeFromPlaybackQueue,
    reorderPlaybackQueue,
    shufflePlaybackQueue,
    toggleQueueRepeat,
    clearPlaybackQueue,
    queueEndBehavior,
    currentSong,
    addMultipleLocalSongs,
    updateSongMetadata,
    toggleFavorite,
    createPlaylist,
    renamePlaylist,
    toggleSongInPlaylist,
    addSongsToPlaylist,
    reorderPlaylistSongs,
    deletePlaylist,
    deleteSong,
    deleteMultipleSongs,
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
    downloadTask: state.downloadTask,
    enqueueDownloads: state.enqueueDownloads,
    removeOfflineDownload: state.removeOfflineDownload,
    topSongs: state.topSongs,
    queue: state.queue,
    playbackQueue: state.playbackQueue,
    playSong: state.playSong,
    playSongList: state.playSongList,
    playPlaylist: state.playPlaylist,
    removeFromPlaybackQueue: state.removeFromPlaybackQueue,
    reorderPlaybackQueue: state.reorderPlaybackQueue,
    shufflePlaybackQueue: state.shufflePlaybackQueue,
    toggleQueueRepeat: state.toggleQueueRepeat,
    clearPlaybackQueue: state.clearPlaybackQueue,
    queueEndBehavior: state.queueEndBehavior,
    currentSong: state.currentSong,
    addMultipleLocalSongs: state.addMultipleLocalSongs,
    updateSongMetadata: state.updateSongMetadata,
    toggleFavorite: state.toggleFavorite,
    createPlaylist: state.createPlaylist,
    renamePlaylist: state.renamePlaylist,
    toggleSongInPlaylist: state.toggleSongInPlaylist,
    addSongsToPlaylist: state.addSongsToPlaylist,
    reorderPlaylistSongs: state.reorderPlaylistSongs,
    deletePlaylist: state.deletePlaylist,
    deleteSong: state.deleteSong,
    deleteMultipleSongs: state.deleteMultipleSongs,
    libraryNotice: state.libraryNotice,
    clearLibraryNotice: state.clearLibraryNotice,
    isSettingsOpen: state.isSettingsOpen,
    setSettingsOpen: state.setSettingsOpen,
  })));

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cdScrollRef = useRef<HTMLDivElement>(null);
  const queueScrollRef = useRef<HTMLDivElement>(null);

  const downloadingSongId = downloadTask?.status === 'downloading'
    ? downloadTask.currentSongId
    : null;

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handlePlaylistDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || !managedPlaylist) return;
    if (active.id === over.id) return;
    const oldIndex = managedPlaylist.songs.findIndex((song) => song.id === active.id);
    const newIndex = managedPlaylist.songs.findIndex((song) => song.id === over.id);
    if (oldIndex >= 0 && newIndex >= 0) reorderPlaylistSongs(managedPlaylist.id, oldIndex, newIndex);
  };

  const handleQueueDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    if (active.id === over.id) return;
    const oldIndex = playbackQueue.findIndex((song) => song.id === active.id);
    const newIndex = playbackQueue.findIndex((song) => song.id === over.id);
    if (oldIndex >= 0 && newIndex >= 0) reorderPlaybackQueue(oldIndex, newIndex);
  };

  const handleBatchAddSelect = (playlistId: string) => {
    const ids = Array.from(selectedSongIds);
    addSongsToPlaylist(playlistId, ids);
    setIsBatchAddOpen(false);
    setIsSelectMode(false);
    setSelectedSongIds(new Set());
  };

  useEffect(() => {
    if (!libraryNotice) return;
    const timeout = window.setTimeout(clearLibraryNotice, 2800);
    return () => window.clearTimeout(timeout);
  }, [libraryNotice, clearLibraryNotice]);

  useEffect(() => {
    setCdMenu(null);
  }, [drawerTab, isSettingsOpen, cdSubTab]);

  const filteredCDs = useMemo(() => {
    let songs = cdSubTab === 'favorites'
      ? queue.filter((song) => song.isFavorite)
      : cdSubTab === 'recent'
        ? [...queue].filter((song) => song.lastPlayed).sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0))
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

      <DownloadActivity />

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
                  <button
                    type="button"
                    onClick={() => setIsSearchOpen(true)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-400 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white"
                    title="Search songs"
                    aria-label="Search songs"
                  >
                    <Search className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSelectMode(!isSelectMode);
                      setSelectedSongIds(new Set());
                    }}
                    className={`flex h-7 w-7 items-center justify-center rounded-lg border transition-all ${
                      isSelectMode
                        ? 'border-amber-400/40 bg-amber-400/20 text-amber-300 shadow-sm'
                        : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/20 hover:bg-white/10 hover:text-white'
                    }`}
                    title={isSelectMode ? 'Cancel Select' : 'Select multiple songs to delete'}
                    aria-label="Select multiple songs"
                  >
                    <ListChecks className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/20 text-amber-300 transition-all hover:bg-amber-500/30 hover:text-amber-200 active:scale-95 shadow-sm"
                    title="Import local music files"
                    aria-label="Import local music files"
                  >
                    <FolderPlus className="h-3.5 w-3.5 text-amber-400" />
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Grid Content: Pure Circular CD Discs + Text Directly Underneath (Frameless User Sketch) */}
          <div ref={cdScrollRef} className="relative h-[285px] overflow-y-auto overscroll-contain px-1 pt-2 pr-2 pb-4">
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
                    {filteredCDs.slice(virtualRow.index * 3, virtualRow.index * 3 + 3).map((song) => {
                      const isSelected = selectedSongIds.has(song.id);
                      return (
                        <div
                          key={song.id}
                          onClick={() => {
                            if (isSelectMode) {
                              setSelectedSongIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(song.id)) next.delete(song.id);
                                else next.add(song.id);
                                return next;
                              });
                            } else {
                              playSongList(filteredCDs, filteredCDs.findIndex((s) => s.id === song.id));
                            }
                          }}
                          className="pure-cd-container group/cd relative cursor-pointer flex flex-col items-center text-center"
                        >
                          {/* Selection Checkbox Overlay */}
                          {isSelectMode ? (
                            <div className={`absolute left-0 top-0 z-40 flex h-6 w-6 items-center justify-center rounded-full border shadow-md transition-all ${
                              isSelected ? 'border-amber-400 bg-amber-400 text-dark-900 font-bold' : 'border-white/40 bg-black/70 text-transparent'
                            }`}>
                              <Check className="h-3.5 w-3.5 stroke-[3]" />
                            </div>
                          ) : (
                            <>
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
                                  const anchor = event.currentTarget;
                                  setCdMenu((current) => current?.song.id === song.id ? null : { song, anchor });
                                }}
                                className={`absolute right-0 top-0 z-40 rounded-lg bg-black/60 p-1 text-slate-300 shadow-md transition-all hover:bg-white hover:text-dark-900 group-hover/cd:opacity-100 ${cdMenu?.song.id === song.id ? 'opacity-100' : 'opacity-0'}`}
                                aria-label={`Menu ${song.title}`}
                                aria-haspopup="menu"
                                aria-expanded={cdMenu?.song.id === song.id}
                              >
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}

                          {/* Offline / Download Status Ring (Ring A) — outside the rotating disc */}
                          {(song.offline || downloadingSongId === song.id) && (
                            <div
                              className="pure-cd-download-ring"
                              aria-hidden="true"
                            />
                          )}

                          {/* TOP: Pure Circular CD Disc */}
                          <div className={`pure-cd-disc vinyl-grooves relative flex items-center justify-center shadow-xl transition-transform ${isSelected ? 'ring-2 ring-amber-400 scale-[0.96]' : ''}`}>
                            <img
                              src={getDisplayCoverUrl(song.coverUrl, 128)}
                              onError={handleCoverImageError}
                              alt={song.title}
                              loading="lazy"
                              decoding="async"
                              className="w-full h-full object-cover opacity-90 group-hover/cd:opacity-100 transition-opacity"
                            />

                            {/* Center Spindle Hole */}
                            <div className="pure-cd-center-hole" />

                            {/* Hover Play Icon Overlay */}
                            {!isSelectMode && (
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/cd:opacity-100 transition-opacity flex items-center justify-center z-20">
                                <div className="w-7 h-7 rounded-full bg-white text-dark-900 flex items-center justify-center shadow-lg">
                                  <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                                </div>
                              </div>
                            )}
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
                      );
                    })}
                  </div>
                ))}
              </div>
            )}

            {/* Floating Multi-Select Action Bar */}
            {isSelectMode && (
              <div className="sticky bottom-0 left-0 right-0 z-50 flex items-center justify-between rounded-xl border border-white/15 bg-dark-900/95 p-2 shadow-2xl backdrop-blur-md">
                <div className="flex items-center gap-2">
                  <span className="rounded-lg bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                    {selectedSongIds.size} Selected
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedSongIds.size === filteredCDs.length) setSelectedSongIds(new Set());
                      else setSelectedSongIds(new Set(filteredCDs.map((s) => s.id)));
                    }}
                    className="rounded-lg px-2 py-0.5 text-[10px] font-medium text-slate-300 hover:bg-white/10"
                  >
                    {selectedSongIds.size === filteredCDs.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => { setIsSelectMode(false); setSelectedSongIds(new Set()); }}
                    className="rounded-lg px-2 py-0.5 text-[10px] text-slate-400 hover:bg-white/10 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const ids = Array.from(selectedSongIds);
                      setIsSelectMode(false);
                      setSelectedSongIds(new Set());
                      void enqueueDownloads(ids);
                    }}
                    disabled={selectedSongIds.size === 0}
                    title="Download Offline"
                    aria-label="Download Offline"
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-400/90 text-dark-900 shadow-md hover:bg-amber-300 active:scale-95 disabled:opacity-30"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsBatchAddOpen(true)}
                    disabled={selectedSongIds.size === 0}
                    title="Add to Playlist"
                    aria-label="Add to Playlist"
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500 text-white shadow-md hover:bg-indigo-600 active:scale-95 disabled:opacity-30"
                  >
                    <FolderPlus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmBulkDelete(true)}
                    disabled={selectedSongIds.size === 0}
                    title="Delete Selected"
                    aria-label="Delete Selected"
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-500 text-white shadow-md hover:bg-rose-600 active:scale-95 disabled:opacity-30"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Confirm Bulk Delete Dialog */}
          {confirmBulkDelete && (
            <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm">
              <div className="w-full rounded-2xl border border-rose-500/30 bg-[#161318] p-4 shadow-2xl">
                <div className="mb-2 flex items-center gap-2 text-rose-400">
                  <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                  <h4 className="text-sm font-bold text-white">Delete {selectedSongIds.size} Songs?</h4>
                </div>
                <p className="text-[11px] text-slate-400">
                  Are you sure you want to remove {selectedSongIds.size} selected songs from your library and playlists? This action cannot be undone.
                </p>
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmBulkDelete(false)}
                    className="rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/10"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const ids = Array.from(selectedSongIds);
                      setConfirmBulkDelete(false);
                      setIsSelectMode(false);
                      setSelectedSongIds(new Set());
                      await deleteMultipleSongs(ids);
                    }}
                    className="rounded-xl bg-rose-500 px-3.5 py-1.5 text-xs font-bold text-white shadow-lg hover:bg-rose-600 active:scale-95"
                  >
                    Delete All
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Batch Add to Playlist Dialog */}
          {isBatchAddOpen && (
            <BatchAddToPlaylistDialog
              count={selectedSongIds.size}
              playlists={playlists}
              onSelect={handleBatchAddSelect}
              onCreate={() => setIsCreatePlaylistOpen(true)}
              onClose={() => setIsBatchAddOpen(false)}
            />
          )}
        </div>
      )}

      {/* CATEGORY 2: PLAYLIST */}
      {!isSettingsOpen && drawerTab === 'playlist' && (
        <div className="h-[317px] space-y-2.5">
          {!managedPlaylist ? (
            /* 2.1 Playlist Collection Overview */
            <>
              <div className="flex items-center justify-between px-1">
                <div>
                  <p className="text-[11px] font-semibold text-slate-300">Your Collection</p>
                  <p className="text-[9px] text-slate-500">{playlists.length} playlists</p>
                </div>
                <button
                  type="button"
                  onClick={() => { setPlaylistSong(null); setIsCreatePlaylistOpen(true); }}
                  className="flex items-center gap-1 rounded-lg border border-indigo-400/30 bg-indigo-400/10 px-2 py-1 text-[10px] font-semibold text-indigo-300 hover:bg-indigo-400/20 active:scale-95"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>New Playlist</span>
                </button>
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
                      <img
                        src={getDisplayCoverUrl(playlist.songs[0]?.coverUrl || playlist.coverUrl, 96)}
                        onError={handleCoverImageError}
                        alt={playlist.name}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover transition-transform group-hover/playlist:scale-105"
                      />
                      {playlist.songs.length > 0 && (
                        <span
                          onClick={(event) => { event.stopPropagation(); playPlaylist(playlist.id); }}
                          className="absolute inset-0 flex items-center justify-center bg-black/35 text-white opacity-0 transition-opacity group-hover/playlist:opacity-100"
                        >
                          <Play className="h-4 w-4 fill-current" />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h5 className="truncate text-[11px] font-bold text-white transition-colors group-hover/playlist:text-indigo-300">
                        {playlist.name}
                      </h5>
                      <p className="mt-0.5 truncate text-[9px] text-slate-500">
                        {playlist.songs.length} songs · {playlist.curator}
                      </p>
                      <span className="mt-1 inline-flex items-center gap-1 text-[9px] text-slate-400">
                        <ListMusic className="h-2.5 w-2.5" /> View tracks
                      </span>
                    </div>
                  </button>
                ))}
                {playlists.length === 0 && (
                  <div className="col-span-2 flex h-[250px] flex-col items-center justify-center text-center">
                    <ListMusic className="mb-2 h-8 w-8 text-slate-600" />
                    <p className="text-xs font-semibold text-slate-300">No playlists yet</p>
                    <p className="mt-1 text-[10px] text-slate-500">Create your first playlist to organize your music.</p>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* 2.2 Direction 1: Studio Hero Inset (Playlist Detail View) */
            <div className="flex h-full flex-col">
              {/* Hero Header */}
              <div className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/5 p-2.5 shadow-md backdrop-blur-sm">
                <button
                  type="button"
                  onClick={() => selectPlaylist(null)}
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition-colors hover:bg-white/15 hover:text-white"
                  title="Back to Playlists"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-xl border border-white/10 shadow-sm">
                  <img
                    src={getDisplayCoverUrl(managedPlaylist.songs[0]?.coverUrl || managedPlaylist.coverUrl, 96)}
                    onError={handleCoverImageError}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h4 className="truncate text-xs font-bold text-white">{managedPlaylist.name}</h4>
                    <button
                      type="button"
                      onClick={() => setRenamingPlaylist(managedPlaylist)}
                      className="rounded p-0.5 text-slate-400 hover:bg-white/10 hover:text-white"
                      title="Rename Playlist"
                      aria-label="Rename Playlist"
                    >
                      <Pencil className="h-2.5 w-2.5" />
                    </button>
                  </div>
                  <p className="truncate text-[9px] text-slate-400">
                    {managedPlaylist.songs.length} songs · {managedPlaylist.curator}
                  </p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => playPlaylist(managedPlaylist.id)}
                    disabled={managedPlaylist.songs.length === 0}
                    className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500 text-emerald-950 shadow-lg shadow-emerald-500/20 transition-all hover:bg-emerald-400 active:scale-95 disabled:opacity-30 disabled:shadow-none"
                    title="Play All"
                  >
                    <Play className="ml-0.5 h-4 w-4 fill-current" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAddSongsOpen(true)}
                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-indigo-400/30 bg-indigo-400/20 text-indigo-300 shadow-sm transition-all hover:bg-indigo-400/30 active:scale-95"
                    title="Add Songs to Playlist"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      const anchor = event.currentTarget;
                      setPlaylistMenu((current) => current ? null : { anchor });
                    }}
                    className={`flex h-8 w-8 items-center justify-center rounded-xl border transition-all active:scale-95 ${playlistMenu ? 'border-white/30 bg-white text-dark-900 shadow-sm' : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white hover:text-dark-900'}`}
                    title="Playlist Actions"
                    aria-label="Playlist Actions"
                    aria-haspopup="menu"
                    aria-expanded={!!playlistMenu}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Tracks List (Strictly shows tracks in this playlist) */}
              <div className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-1">
                <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handlePlaylistDragEnd}>
                  <SortableContext items={managedPlaylist.songs.map((song) => song.id)} strategy={verticalListSortingStrategy}>
                    {managedPlaylist.songs.map((song, index) => (
                      <PlaylistSortableRow
                        key={song.id}
                        song={song}
                        index={index}
                        isCurrent={currentSong?.id === song.id}
                        onPlay={() => playSongList(managedPlaylist.songs, index)}
                        onRemove={() => toggleSongInPlaylist(managedPlaylist.id, song.id)}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
                {managedPlaylist.songs.length === 0 && (
                  <div className="flex h-[210px] flex-col items-center justify-center text-center">
                    <ListMusic className="mb-2 h-7 w-7 text-slate-600" />
                    <p className="text-xs font-semibold text-slate-300">Playlist is empty</p>
                    <p className="mt-0.5 text-[10px] text-slate-500">No tracks added to this playlist yet.</p>
                    <button
                      type="button"
                      onClick={() => setIsAddSongsOpen(true)}
                      className="mt-3 flex items-center gap-1.5 rounded-xl bg-indigo-500 px-3 py-1.5 text-[11px] font-semibold text-white shadow-md hover:bg-indigo-600 active:scale-95"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Add Songs</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* CATEGORY 3: PLAYBACK QUEUE */}
      {!isSettingsOpen && drawerTab === 'queue' && (
        <div className="h-[317px] space-y-3">
          <div className="flex items-center justify-between px-1">
            <div>
              <p className="text-[11px] font-semibold text-slate-300">Now Playing & Up Next</p>
              <p className="text-[9px] text-slate-500">{playbackQueue.length} songs in queue</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={toggleQueueRepeat}
                className={`flex h-7 w-7 items-center justify-center rounded-lg border transition-all ${
                  queueEndBehavior === 'repeat-queue'
                    ? 'border-amber-400/40 bg-amber-400/20 text-amber-300 shadow-sm'
                    : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/20 hover:bg-white/10 hover:text-white'
                }`}
                title={queueEndBehavior === 'repeat-queue' ? 'Repeat Queue: On' : 'Repeat Queue: Off'}
                aria-label="Toggle Repeat Queue"
              >
                <Repeat className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={shufflePlaybackQueue}
                disabled={playbackQueue.length <= 1}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-400 transition-all hover:border-white/20 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                title="Shuffle Upcoming Queue"
                aria-label="Shuffle Queue"
              >
                <Shuffle className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={clearPlaybackQueue}
                disabled={playbackQueue.length <= (currentSong ? 1 : 0)}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-400 transition-all hover:border-rose-400/30 hover:bg-rose-500/15 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-30"
                title="Clear Queue"
                aria-label="Clear Queue"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div ref={queueScrollRef} className="h-[280px] overflow-y-auto overscroll-contain pr-1">
            {playbackQueue.length > 0 && (
              <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleQueueDragEnd}>
                <SortableContext items={playbackQueue.map((song) => song.id)} strategy={verticalListSortingStrategy}>
                  <div className="relative w-full" style={{ height: queueVirtualizer.getTotalSize() }}>
                    {queueVirtualizer.getVirtualItems().map((virtualItem) => {
                      const index = virtualItem.index;
                      const song = playbackQueue[index];
                      if (!song) return null;
                      const isCurrent = currentSong?.id === song.id;
                      return (
                        <QueueSortableRow
                          key={virtualItem.key}
                          song={song}
                          index={index}
                          isCurrent={isCurrent}
                          measureRef={queueVirtualizer.measureElement}
                          onPlay={() => playSong(song)}
                          onRemove={() => removeFromPlaybackQueue(song.id)}
                          positionStyle={{ transform: `translateY(${virtualItem.start}px)` }}
                        />
                      );
                    })}
                  </div>
                </SortableContext>
              </DndContext>
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
                      onError={handleCoverImageError}
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

      {isAddSongsOpen && managedPlaylist && (
        <AddSongsToPlaylistModal
          key={`add-songs-${managedPlaylist.id}`}
          playlist={managedPlaylist}
          library={queue}
          onToggle={(songId) => toggleSongInPlaylist(managedPlaylist.id, songId)}
          onClose={() => setIsAddSongsOpen(false)}
        />
      )}

      {playlistToDelete && (
        <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm">
          <div className="w-full rounded-2xl border border-rose-500/30 bg-[#161318] p-4 text-center shadow-2xl">
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-rose-500/10 text-rose-300">
              <Trash2 className="h-5 w-5" />
            </div>
            <h4 className="text-sm font-bold text-white">Delete Playlist?</h4>
            <p className="mt-1 text-[11px] text-slate-400">
              Are you sure you want to delete “{playlistToDelete.name}”? The songs inside will remain in your library.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => setPlaylistToDelete(null)}
                className="rounded-xl px-3.5 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  deletePlaylist(playlistToDelete.id);
                  setPlaylistToDelete(null);
                  selectPlaylist(null);
                }}
                className="rounded-xl bg-rose-500 px-4 py-1.5 text-xs font-bold text-white shadow-lg hover:bg-rose-600 active:scale-95"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {isCreatePlaylistOpen && (
        <CreatePlaylistDialog
          onClose={() => { setIsCreatePlaylistOpen(false); setIsBatchAddOpen(false); }}
          onCreate={(name) => {
            const playlistId = createPlaylist(name);
            if (playlistSong) toggleSongInPlaylist(playlistId, playlistSong.id);
            if (isBatchAddOpen) {
              addSongsToPlaylist(playlistId, Array.from(selectedSongIds));
              setIsSelectMode(false);
              setSelectedSongIds(new Set());
            }
            setPlaylistSong(null);
            setIsBatchAddOpen(false);
            setIsCreatePlaylistOpen(false);
            selectPlaylist(playlistId);
          }}
        />
      )}

      {renamingPlaylist && (
        <RenamePlaylistDialog
          playlist={renamingPlaylist}
          onClose={() => setRenamingPlaylist(null)}
          onSave={(newName) => {
            renamePlaylist(renamingPlaylist.id, newName);
            setRenamingPlaylist(null);
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

      {playlistMenu && (
        <PlaylistActionMenu
          anchor={playlistMenu.anchor}
          canPlay={(managedPlaylist?.songs.length ?? 0) > 0}
          onShuffle={() => {
            if (!managedPlaylist || managedPlaylist.songs.length === 0) return;
            const shuffled = [...managedPlaylist.songs];
            for (let i = shuffled.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            playSongList(shuffled, 0);
          }}
          onDownload={() => {
            if (managedPlaylist) void enqueueDownloads(managedPlaylist.songs.map((song) => song.id));
          }}
          onDelete={() => {
            if (managedPlaylist) setPlaylistToDelete(managedPlaylist);
          }}
          onClose={() => setPlaylistMenu(null)}
        />
      )}

      {cdMenu && (
        <CdActionMenu
          song={cdMenu.song}
          anchor={cdMenu.anchor}
          onClose={() => setCdMenu(null)}
          onEdit={() => setEditingSong(cdMenu.song)}
          onAddToPlaylist={() => setPlaylistSong(cdMenu.song)}
          onDelete={() => setDeletingSong(cdMenu.song)}
          onDownload={() => { void enqueueDownloads([cdMenu.song.id]); }}
          onRemoveOffline={() => { void removeOfflineDownload(cdMenu.song.id); }}
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
