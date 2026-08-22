#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const LEDGER_PATH = path.join(process.cwd(), 'docs', 'dev-ledger.md');

function fail(message) {
  console.error(`[ledger] ${message}`);
  process.exit(1);
}

function readLedger() {
  if (!fs.existsSync(LEDGER_PATH)) fail('docs/dev-ledger.md was not found.');
  return fs.readFileSync(LEDGER_PATH, 'utf8');
}

function sectionRange(markdown, header) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex(line => line.trim().toLowerCase() === `## ${header}`.toLowerCase());
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i].startsWith('## ')) {
      end = i;
      break;
    }
  }
  return { lines, start, end };
}

function parseEntries(markdown) {
  const range = sectionRange(markdown, 'Entries');
  if (!range) return [];
  const body = range.lines.slice(range.start + 1, range.end);
  const entries = [];
  let i = 0;
  while (i < body.length) {
    const header = body[i] || '';
    const match = header.match(/^### \[(\d{4}-\d{2}-\d{2})\]\s+(.+?)\s+\(Status:\s*(Planned|Draft|Complete)\s*\)\s*$/);
    if (!match) {
      i += 1;
      continue;
    }
    const entry = { date: match[1], title: match[2], status: match[3], body: [] };
    i += 1;
    while (i < body.length && !(body[i] || '').startsWith('### ')) {
      entry.body.push(body[i]);
      i += 1;
    }
    entries.push(entry);
  }
  return entries;
}

function buildMessage(entries) {
  if (!entries.length) return '';
  const subject = entries.length === 1 ? `release: ${entries[0].title}` : `release: ${entries.length} completed ledger entries`;
  const details = entries.map(entry => [
    `Entry: ${entry.title} (${entry.date})`,
    '',
    entry.body.join('\n').trim() || '(no details)'
  ].join('\n'));
  return [subject, '', details.join('\n\n---\n\n')].join('\n');
}

function main() {
  const command = process.argv[2] || 'message';
  const entries = parseEntries(readLedger());
  const complete = entries.filter(entry => entry.status === 'Complete');

  if (command === 'list') {
    if (!entries.length) {
      console.log('No ledger entries found.');
      return;
    }
    entries.forEach(entry => console.log(`${entry.status.padEnd(8)} ${entry.date} ${entry.title}`));
    return;
  }

  if (command === 'message') {
    const message = buildMessage(complete);
    console.log(message || 'No Complete entries found in docs/dev-ledger.md.');
    return;
  }

  fail(`Unknown command: ${command}`);
}

main();
