import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const workflowPath = join(process.cwd(), '.github', 'workflows', 'release.yml');

describe('release download links', () => {
  it('matches every generated v1.0.6 asset name', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const links = [...workflow.matchAll(/\]\((https:\/\/github\.com\/[^)]+)\)/g)].map((match) =>
      match[1].replaceAll('__VERSION__', '1.0.6'),
    );
    const linkedAssets = links.map((link) => link.split('/').at(-1));

    expect(linkedAssets).toEqual([
      'Miles_1.0.6_x64-setup.exe',
      'Miles_1.0.6_x64_en-US.msi',
      'Miles_1.0.6_aarch64.dmg',
      'Miles_1.0.6_x64.dmg',
      'Miles_1.0.6_amd64.deb',
      'Miles_1.0.6_amd64.AppImage',
    ]);
  });
});
