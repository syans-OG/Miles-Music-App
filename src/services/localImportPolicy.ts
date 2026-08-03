export const MAX_LOCAL_AUDIO_FILE_BYTES = 128 * 1024 * 1024;
export const MAX_LOCAL_IMPORT_FILES = 50;

const SUPPORTED_AUDIO_EXTENSION = /\.(mp3|wav|flac|m4a|aac|ogg)$/i;

interface LocalAudioCandidate {
  name: string;
  size: number;
  type: string;
}

export const getLocalAudioRejection = (file: LocalAudioCandidate): string | null => {
  const hasSupportedType = file.type.startsWith('audio/') || SUPPORTED_AUDIO_EXTENSION.test(file.name);
  if (!hasSupportedType) return 'format tidak didukung';
  if (file.size > MAX_LOCAL_AUDIO_FILE_BYTES) return 'ukuran melebihi 128 MB';
  return null;
};

export const selectLocalAudioFiles = <T extends LocalAudioCandidate>(files: T[]) => {
  const selected = files.slice(0, MAX_LOCAL_IMPORT_FILES);
  const accepted = selected.filter((file) => getLocalAudioRejection(file) === null);
  return {
    accepted,
    rejectedCount: files.length - selected.length + selected.length - accepted.length,
  };
};

export const formatLocalImportNotice = (added: number, duplicates: number, rejected: number) => {
  const details = [
    duplicates > 0 ? `${duplicates} duplikat` : null,
    rejected > 0 ? `${rejected} ditolak` : null,
  ].filter(Boolean);
  if (added === 0) return details.length > 0 ? details.join(', ') : 'Tidak ada lagu yang ditambahkan';
  return `${added} lagu ditambahkan${details.length > 0 ? `, ${details.join(', ')}` : ''}`;
};
