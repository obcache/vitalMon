#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const root = process.cwd();

function exists(filePath) {
  try { return fs.existsSync(filePath); } catch { return false; }
}

function writeIfChanged(filePath, content) {
  const previous = exists(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
  if (previous === content) return false;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  return true;
}

function updateJsonVersion(filePath, version) {
  if (!exists(filePath)) return false;
  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (json.version === version) return false;
  json.version = version;
  return writeIfChanged(filePath, `${JSON.stringify(json, null, 2)}\n`);
}

function updateLockVersion(filePath, version) {
  if (!exists(filePath)) return false;
  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  let changed = false;
  if (json.version && json.version !== version) {
    json.version = version;
    changed = true;
  }
  if (json.packages && json.packages[''] && json.packages[''].version !== version) {
    json.packages[''].version = version;
    changed = true;
  }
  return changed && writeIfChanged(filePath, `${JSON.stringify(json, null, 2)}\n`);
}

function updateTextVersion(filePath, version) {
  if (!exists(filePath)) return false;
  return writeIfChanged(filePath, `${version}\n`);
}

function updateInnoVersion(filePath, version) {
  if (!exists(filePath)) return false;
  const src = fs.readFileSync(filePath, 'utf8');
  let next = src.replace(/(#define\s+MyAppVersion\s+")[^"]+(")/g, `$1${version}$2`);
  next = next.replace(/(^\s*AppVersion\s*=\s*)[^\r\n]+/gmi, `$1${version}`);
  next = next.replace(/(^\s*VersionInfoVersion\s*=\s*)[^\r\n]+/gmi, `$1${version}`);
  return next !== src && writeIfChanged(filePath, next);
}

function walk(dir, callback) {
  if (!exists(dir)) return;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'dist', 'build', 'release'].includes(item.name)) continue;
    const full = path.join(dir, item.name);
    if (item.isDirectory()) walk(full, callback);
    else callback(full);
  }
}

function main() {
  const args = process.argv.slice(2);
  const requested = args[0] === '--set' ? args[1] : args[0];
  const packagePath = path.join(root, 'package.json');
  if (!exists(packagePath)) {
    console.error('[version-sync] package.json not found.');
    process.exit(1);
  }
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const version = String(requested || pkg.version || '').trim();
  if (!SEMVER_RE.test(version)) {
    console.error(`[version-sync] Invalid semver: ${version}`);
    process.exit(1);
  }

  const touched = [];
  walk(root, filePath => {
    const rel = path.relative(root, filePath).replace(/\\/g, '/');
    const base = path.basename(filePath).toLowerCase();
    let changed = false;
    if (base === 'package.json') changed = updateJsonVersion(filePath, version);
    else if (base === 'package-lock.json') changed = updateLockVersion(filePath, version);
    else if (base === 'version' || base === 'version.txt') changed = updateTextVersion(filePath, version);
    else if (base.endsWith('.iss')) changed = updateInnoVersion(filePath, version);
    if (changed) touched.push(rel);
  });

  console.log(`[version-sync] Version: ${version}`);
  if (touched.length) touched.forEach(file => console.log(` - ${file}`));
  else console.log('[version-sync] No files changed.');
}

main();
