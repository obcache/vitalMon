#!/usr/bin/env node
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const packageJson = require(path.join(root, 'package.json'));
const scriptPath = path.join(root, 'installer', 'vitals-monitor.iss');
const outputDir = path.join(root, 'release', 'inno');

function findCompiler() {
  const candidates = [
    process.env.INNO_SETUP_COMPILER,
    process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Inno Setup 6', 'ISCC.exe'),
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Inno Setup 6', 'ISCC.exe')
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate));
}

const compiler = findCompiler();
if (!compiler) {
  console.error('[inno] Inno Setup 6 was not found. Install it or set INNO_SETUP_COMPILER to ISCC.exe.');
  process.exit(1);
}

const stagingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vitals-monitor-package-'));
const sourceDir = path.join(stagingRoot, 'win-unpacked');
const builderCli = require.resolve('electron-builder/out/cli/cli.js');

try {
  console.log(`[inno] Packaging Vitals Monitor ${packageJson.version}`);
  const packageResult = cp.spawnSync(
    process.execPath,
    [builderCli, '--win', 'dir', `--config.directories.output=${stagingRoot}`],
    { cwd: root, stdio: 'inherit', shell: false }
  );

  if (packageResult.error) {
    throw packageResult.error;
  }
  if (packageResult.status !== 0 || !fs.existsSync(sourceDir)) {
    process.exitCode = packageResult.status || 1;
  } else {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`[inno] Compiling installer to ${outputDir}`);
    const compileResult = cp.spawnSync(
      compiler,
      [
        `/DMyAppVersion=${packageJson.version}`,
        `/DMyAppSource=${sourceDir}`,
        `/O${outputDir}`,
        scriptPath
      ],
      { cwd: root, stdio: 'inherit', shell: false }
    );

    if (compileResult.error) {
      throw compileResult.error;
    }
    process.exitCode = compileResult.status ?? 1;
  }
} catch (error) {
  console.error(`[inno] ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
} finally {
  fs.rmSync(stagingRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 250 });
}
