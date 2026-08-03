import { describe, expect, it } from 'vitest';

import {
  getLocalAudioRejection,
  MAX_LOCAL_AUDIO_FILE_BYTES,
  MAX_LOCAL_IMPORT_FILES,
  selectLocalAudioFiles,
} from '../services/localImportPolicy';

const audioFile = (size: number, name = 'track.mp3') => ({ name, size, type: 'audio/mpeg' });

describe('local audio import policy', () => {
  it('accepts a 55 MB hour-long audio file and the 128 MB boundary', () => {
    expect(getLocalAudioRejection(audioFile(55 * 1024 * 1024))).toBeNull();
    expect(getLocalAudioRejection(audioFile(MAX_LOCAL_AUDIO_FILE_BYTES))).toBeNull();
  });

  it('rejects oversized and unsupported files', () => {
    expect(getLocalAudioRejection(audioFile(MAX_LOCAL_AUDIO_FILE_BYTES + 1)))
      .toBe('ukuran melebihi 128 MB');
    expect(getLocalAudioRejection({ name: 'notes.txt', size: 12, type: 'text/plain' }))
      .toBe('format tidak didukung');
  });

  it('accepts no more than 50 files from one selection', () => {
    const result = selectLocalAudioFiles(Array.from({ length: 55 }, (_, index) => audioFile(1024, `${index}.mp3`)));

    expect(result.accepted).toHaveLength(MAX_LOCAL_IMPORT_FILES);
    expect(result.rejectedCount).toBe(5);
  });
});
