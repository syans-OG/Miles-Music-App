#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const tauriRoot = path.join(projectRoot, 'src-tauri');
const binariesDirectory = path.join(tauriRoot, 'binaries');
const manifestsDirectory = path.join(tauriRoot, 'sidecars');

function getHostTarget() {
  const platform = os.platform();
  const architecture = os.arch();

  if (platform === 'win32' && architecture === 'x64') return 'x86_64-pc-windows-msvc';
  if (platform === 'darwin' && architecture === 'arm64') return 'aarch64-apple-darwin';
  if (platform === 'darwin' && architecture === 'x64') return 'x86_64-apple-darwin';
  if (platform === 'linux' && architecture === 'x64') return 'x86_64-unknown-linux-gnu';
  throw new Error(`Unsupported host platform: ${platform} ${architecture}`);
}

function sha256(contents) {
  return crypto.createHash('sha256').update(contents).digest('hex');
}

function sha256File(filePath) {
  return sha256(fs.readFileSync(filePath));
}

function assertHash(actual, expected, label) {
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`${label} checksum mismatch. Expected ${expected}, received ${actual}.`);
  }
}

function readManifest(target) {
  const manifestPath = path.join(manifestsDirectory, `${target}.json`);
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Unsupported sidecar target: ${target}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const extension = target.includes('windows') ? '.exe' : '';
  if (manifest.schemaVersion !== 1 || manifest.target !== target || manifest.binaries?.length !== 2) {
    throw new Error(`Invalid sidecar manifest for ${target}`);
  }

  for (const id of ['yt-dlp', 'deno']) {
    const matches = manifest.binaries.filter((binary) => binary.id === id);
    const binary = matches[0];
    const expectedFileName = `binaries/${id}-${target}${extension}`;
    const expectedRuntimeName = `${id}${extension}`;
    const source = new URL(binary?.downloadUrl ?? '');
    const hashesAreValid = [binary?.publisherAssetSha256, binary?.sha256].every(
      (value) => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value),
    );

    if (
      matches.length !== 1 ||
      !binary.version ||
      source.protocol !== 'https:' ||
      source.hostname !== 'github.com' ||
      !hashesAreValid ||
      binary.fileName !== expectedFileName ||
      binary.runtimeFileName !== expectedRuntimeName
    ) {
      throw new Error(`Invalid ${id} metadata for ${target}`);
    }
  }

  return manifest;
}

async function downloadFile(url, destination) {
  console.log(`Downloading ${url}...`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed with ${response.status} ${response.statusText}: ${url}`);
  }
  const contents = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destination, contents);
  return contents;
}

function extractZip(archivePath, destination) {
  fs.mkdirSync(destination, { recursive: true });
  if (os.platform() === 'win32') {
    execFileSync('tar', ['-xf', archivePath, '-C', destination], { stdio: 'inherit' });
  } else {
    execFileSync('unzip', ['-o', archivePath, '-d', destination], { stdio: 'inherit' });
  }
}

async function installBinary(binary, temporaryDirectory, isWindows) {
  const destination = path.resolve(tauriRoot, binary.fileName);
  if (path.dirname(destination) !== binariesDirectory) {
    throw new Error(`Unsafe sidecar destination: ${binary.fileName}`);
  }
  if (fs.existsSync(destination) && sha256File(destination) === binary.sha256.toLowerCase()) {
    console.log(`Verified existing ${binary.id} ${binary.version}.`);
    return;
  }

  const assetName = path.basename(new URL(binary.downloadUrl).pathname);
  const assetPath = path.join(temporaryDirectory, assetName);
  const assetContents = await downloadFile(binary.downloadUrl, assetPath);
  assertHash(sha256(assetContents), binary.publisherAssetSha256, `${binary.id} publisher asset`);

  let executablePath = assetPath;
  if (path.extname(assetName).toLowerCase() === '.zip') {
    const extractDirectory = path.join(temporaryDirectory, `${binary.id}-extracted`);
    extractZip(assetPath, extractDirectory);
    executablePath = path.join(extractDirectory, binary.runtimeFileName);
    if (!fs.existsSync(executablePath)) {
      throw new Error(`${binary.runtimeFileName} was not found in the verified archive.`);
    }
  }

  assertHash(sha256File(executablePath), binary.sha256, `${binary.id} executable`);
  fs.copyFileSync(executablePath, destination);
  if (!isWindows) fs.chmodSync(destination, 0o755);
  console.log(`Installed and verified ${binary.id} ${binary.version}.`);
}

async function main() {
  const target = process.env.TAURI_TARGET || getHostTarget();
  const manifest = readManifest(target);
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'miles-sidecars-'));
  fs.mkdirSync(binariesDirectory, { recursive: true });

  console.log(`Preparing sidecars for ${target}...`);
  try {
    for (const binary of manifest.binaries) {
      await installBinary(binary, temporaryDirectory, target.includes('windows'));
    }
    console.log(`Prepared and verified all sidecars for ${target}.`);
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('Failed to prepare sidecars:', error);
  process.exitCode = 1;
});
