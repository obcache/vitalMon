#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = process.cwd();

function readJsonVersion(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')).version || null;
  } catch {
    return null;
  }
}

function readTextVersion(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').trim() || null;
  } catch {
    return null;
  }
}

function walk(dir, callback) {
  if (!fs.existsSync(dir)) return;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'dist', 'build', 'release'].includes(item.name)) continue;
    const full = path.join(dir, item.name);
    if (item.isDirectory()) walk(full, callback);
    else callback(full);
  }
}

const rows = [];
walk(root, filePath => {
  const rel = path.relative(root, filePath).replace(/\\/g, '/');
  const base = path.basename(filePath).toLowerCase();
  let version = null;
  if (base === 'package.json') version = readJsonVersion(filePath);
  else if (base === 'version' || base === 'version.txt') version = readTextVersion(filePath);
  if (version) rows.push({ rel, version });
});

if (!rows.length) {
  console.log('No version files found.');
} else {
  rows.forEach(row => console.log(`${row.rel}: ${row.version}`));
}
