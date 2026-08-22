#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const TODO_PATH = path.join(process.cwd(), 'docs', 'planning', 'To-do.md');

function fail(message) {
  console.error(`[todo] ${message}`);
  process.exit(1);
}

function readTodo() {
  if (!fs.existsSync(TODO_PATH)) fail('docs/planning/To-do.md was not found.');
  return fs.readFileSync(TODO_PATH, 'utf8');
}

function listTasks() {
  const lines = readTodo().split(/\r?\n/);
  const tasks = lines
    .map((line, index) => ({ line, index: index + 1 }))
    .filter(item => /^\s*-\s+\[[ xX]\]\s+/.test(item.line));
  if (!tasks.length) {
    console.log('No tasks found.');
    return;
  }
  tasks.forEach(item => console.log(`${String(item.index).padStart(4)} ${item.line.trim()}`));
}

function addTask(text) {
  if (!text || !text.trim()) fail('Task text is required.');
  const content = readTodo();
  const taskLine = `- [ ] ${text.trim()}`;
  const marker = '## Next Actions';
  const lines = content.split(/\r?\n/);
  const idx = lines.findIndex(line => line.trim() === marker);
  if (idx === -1) {
    fs.appendFileSync(TODO_PATH, `\n${taskLine}\n`, 'utf8');
    return;
  }
  let insertAt = idx + 1;
  while (insertAt < lines.length && lines[insertAt].trim() === '') insertAt += 1;
  lines.splice(insertAt, 0, taskLine);
  fs.writeFileSync(TODO_PATH, `${lines.join('\n')}\n`, 'utf8');
}

function main() {
  const [command = 'list', ...rest] = process.argv.slice(2);
  if (command === 'list') return listTasks();
  if (command === 'add') return addTask(rest.join(' '));
  fail(`Unknown command: ${command}`);
}

main();
