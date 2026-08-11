import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scenario = process.argv[2];

function emitFixture(name) {
  const path = new URL(`./${name}`, import.meta.url);
  process.stdout.write(readFileSync(path, 'utf8'));
}

switch (scenario) {
  case 'playlist-success':
    emitFixture('playlist-success.json');
    break;
  case 'track-success':
    emitFixture('track-success.json');
    break;
  case 'spotify-match-success':
    emitFixture('spotify-match-success.json');
    break;
  case 'malformed':
    process.stdout.write('{"broken":');
    break;
  case 'oversized':
    process.stdout.write(JSON.stringify({ payload: 'x'.repeat(2 * 1024 * 1024) }));
    break;
  case 'exit-error':
    process.stderr.write('fixture extractor failure');
    process.exitCode = 23;
    break;
  case 'private-error':
    process.stderr.write('ERROR: Private video. Sign in if you have been granted access');
    process.exitCode = 1;
    break;
  case 'age-error':
    process.stderr.write('ERROR: Sign in to confirm your age. This video may be inappropriate');
    process.exitCode = 1;
    break;
  case 'unavailable-error':
    process.stderr.write('ERROR: Video unavailable. This video has been removed');
    process.exitCode = 1;
    break;
  case 'timeout':
    setInterval(() => {}, 1_000);
    break;
  case 'child-timeout':
    {
    const child = spawn(process.execPath, [fileURLToPath(new URL('./fake-child.mjs', import.meta.url))], {
      stdio: 'ignore',
    });
    const markerPath = process.argv[3];
    if (markerPath) writeFileSync(markerPath, String(child.pid));
    setInterval(() => {}, 1_000);
    break;
    }
  case 'flaky': {
    const markerPath = process.argv[3];
    if (!markerPath || existsSync(markerPath)) {
      emitFixture('track-success.json');
      break;
    }
    writeFileSync(markerPath, 'failed-once');
    process.stderr.write('fixture transient failure');
    process.exitCode = 75;
    break;
  }
  default:
    process.stderr.write(`unknown fixture scenario: ${scenario ?? '<missing>'}`);
    process.exitCode = 64;
}
