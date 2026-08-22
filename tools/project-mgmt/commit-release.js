#!/usr/bin/env node
const cp = require('child_process');
const path = require('path');

const root = process.cwd();

function run(command, args, options = {}) {
  const result = cp.spawnSync(command, args, { cwd: root, stdio: options.capture ? 'pipe' : 'inherit', shell: false, encoding: 'utf8' });
  if (result.status !== 0 && !options.allowFailure) process.exit(result.status || 1);
  return result;
}

function currentVersion() {
  return require(path.join(root, 'package.json')).version;
}

function hasRemote() {
  const result = run('git', ['remote'], { capture: true, allowFailure: true });
  return result.status === 0 && result.stdout.trim().length > 0;
}

function ledgerMessage() {
  const result = run(process.execPath, [path.join(root, 'tools', 'project-mgmt', 'ledger.js'), 'message'], { capture: true, allowFailure: true });
  const text = (result.stdout || '').trim();
  if (!text || text.startsWith('No Complete entries')) return null;
  return text.split(/\r?\n/)[0];
}

function main() {
  const raw = process.argv.slice(2);
  const first = (raw[0] || '').toLowerCase();
  const mode = ['major', 'minor', 'patch'].includes(first) ? first : 'patch';
  const messageArgs = mode === first ? raw.slice(1) : raw;
  run(process.execPath, [path.join(root, 'tools', 'project-mgmt', 'version-bump.js'), mode]);
  const version = currentVersion();
  const message = messageArgs.join(' ').trim() || ledgerMessage() || `release: v${version}`;
  run('git', ['add', '-A']);
  run('git', ['commit', '-m', message]);
  if (hasRemote()) run('git', ['push']);
}

main();
