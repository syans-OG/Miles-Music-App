#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const tauriRoot = path.join(projectRoot, 'src-tauri');
const binariesDir = path.join(tauriRoot, 'binaries');

if (!fs.existsSync(binariesDir)) {
  fs.mkdirSync(binariesDir, { recursive: true });
}

function getTargetTriple() {
  const platform = os.platform();
  const arch = os.arch();

  if (platform === 'win32') {
    return 'x86_64-pc-windows-msvc';
  } else if (platform === 'darwin') {
    return arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
  } else if (platform === 'linux') {
    return arch === 'arm64' ? 'aarch64-unknown-linux-gnu' : 'x86_64-unknown-linux-gnu';
  }
  throw new Error(`Unsupported platform: ${platform} ${arch}`);
}

const targetTriple = process.env.TAURI_TARGET || getTargetTriple();
const isWindows = targetTriple.includes('windows');
const ext = isWindows ? '.exe' : '';

const YTDLP_VERSION = '2026.07.04';
const DENO_VERSION = '2.9.4';

function getYtDlpDownloadUrl(target) {
  if (target.includes('windows')) {
    return `https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/yt-dlp.exe`;
  }
  return `https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/yt-dlp`;
}

function getDenoDownloadUrl(target) {
  return `https://github.com/denoland/deno/releases/download/v${DENO_VERSION}/deno-${target}.zip`;
}

async function downloadFile(url, destPath) {
  console.log(`Downloading ${url}...`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
  return buffer;
}

async function setupSidecars() {
  console.log(`Setting up sidecars for target: ${targetTriple}`);

  const ytdlpDest = path.join(binariesDir, `yt-dlp-${targetTriple}${ext}`);
  const denoDest = path.join(binariesDir, `deno-${targetTriple}${ext}`);
  const ytdlpFallback = path.join(binariesDir, `yt-dlp${ext}`);
  const denoFallback = path.join(binariesDir, `deno${ext}`);

  // 1. Setup yt-dlp
  if (!fs.existsSync(ytdlpDest)) {
    const ytdlpUrl = getYtDlpDownloadUrl(targetTriple);
    await downloadFile(ytdlpUrl, ytdlpDest);
    if (!isWindows) {
      fs.chmodSync(ytdlpDest, 0o755);
    }
    console.log(`✓ yt-dlp verified at ${ytdlpDest}`);
  } else {
    console.log(`✓ yt-dlp already exists at ${ytdlpDest}`);
  }

  // Also ensure non-target-prefixed copy exists for tests/dev
  if (!fs.existsSync(ytdlpFallback)) {
    fs.copyFileSync(ytdlpDest, ytdlpFallback);
    if (!isWindows) {
      fs.chmodSync(ytdlpFallback, 0o755);
    }
  }

  // 2. Setup Deno
  if (!fs.existsSync(denoDest)) {
    const denoUrl = getDenoDownloadUrl(targetTriple);
    const tempZip = path.join(os.tmpdir(), `deno-${targetTriple}-${Date.now()}.zip`);
    await downloadFile(denoUrl, tempZip);

    const tempExtract = path.join(os.tmpdir(), `deno-extract-${Date.now()}`);
    fs.mkdirSync(tempExtract, { recursive: true });

    if (isWindows) {
      execSync(`powershell -command "Expand-Archive -Path '${tempZip}' -DestinationPath '${tempExtract}' -Force"`);
    } else {
      execSync(`unzip -o "${tempZip}" -d "${tempExtract}"`);
    }

    const extractedBinary = path.join(tempExtract, `deno${ext}`);
    fs.copyFileSync(extractedBinary, denoDest);
    if (!isWindows) {
      fs.chmodSync(denoDest, 0o755);
    }

    // Cleanup temp
    try {
      fs.unlinkSync(tempZip);
      fs.rmSync(tempExtract, { recursive: true, force: true });
    } catch {}

    console.log(`✓ Deno verified at ${denoDest}`);
  } else {
    console.log(`✓ Deno already exists at ${denoDest}`);
  }

  // Also ensure non-target-prefixed copy exists for tests/dev
  if (!fs.existsSync(denoFallback)) {
    fs.copyFileSync(denoDest, denoFallback);
    if (!isWindows) {
      fs.chmodSync(denoFallback, 0o755);
    }
  }

  console.log('✓ All sidecars successfully prepared for Tauri bundle.');
}

setupSidecars().catch((err) => {
  console.error('Failed to setup sidecars:', err);
  process.exit(1);
});
