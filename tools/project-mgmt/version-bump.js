#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const root = process.cwd();
const packagePath = path.join(root, 'package.json');

function fail(message) {
  console.error(`[version-bump] ${message}`);
  process.exit(1);
}

function parse(version) {
  const match = String(version || '').trim().match(/^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function main() {
  const mode = String(process.argv[2] || 'patch').toLowerCase();
  if (!['patch', 'minor', 'major'].includes(mode)) fail('Use patch, minor, or major.');
  if (!fs.existsSync(packagePath)) fail('package.json not found.');
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const current = parse(pkg.version);
  if (!current) fail(`Invalid package.json version: ${pkg.version}`);
  if (mode === 'major') {
    current.major += 1;
    current.minor = 0;
    current.patch = 0;
  } else if (mode === 'minor') {
    current.minor += 1;
    current.patch = 0;
  } else {
    current.patch += 1;
  }
  const next = `${current.major}.${current.minor}.${current.patch}`;
  cp.execFileSync(process.execPath, [path.join(root, 'tools', 'project-mgmt', 'version-sync.js'), '--set', next], { stdio: 'inherit' });
  console.log(`[version-bump] ${pkg.version} -> ${next}`);
}

main();
