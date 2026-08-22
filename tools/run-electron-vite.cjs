const { spawn } = require('node:child_process');
const path = require('node:path');

const mode = process.argv[2] || 'dev';
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const cliPath = path.join(__dirname, '..', 'node_modules', 'electron-vite', 'dist', 'cli.js');

const child = spawn(process.execPath, [cliPath, mode], {
  env,
  stdio: 'inherit'
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
