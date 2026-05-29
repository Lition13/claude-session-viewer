#!/usr/bin/env node
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const electronPkgDir = path.dirname(require.resolve('electron/package.json'));

/**
 * Resolve the Electron binary path. When the package's postinstall step is
 * interrupted (a common failure on slow networks — the binary is a ~150MB
 * download), `electron/path.txt` is missing and `require('electron')` throws a
 * cryptic ENOENT. Detect that here and run Electron's own installer once so the
 * CLI self-heals instead of crashing.
 */
function resolveElectron() {
  try {
    return require('electron');
  } catch (err) {
    if (err && err.code !== 'ENOENT') throw err;
    return null;
  }
}

const installScript = path.join(electronPkgDir, 'install.js');

/** Run Electron's installer once with the given extra env; returns true on success. */
function runInstall(extraEnv) {
  const result = spawnSync(process.execPath, [installScript], {
    stdio: 'inherit',
    cwd: electronPkgDir,
    env: { ...process.env, ...extraEnv },
  });
  if (result.status !== 0) return false;
  // Clear the require cache so the freshly written path.txt is picked up.
  delete require.cache[require.resolve('electron')];
  const p = resolveElectron();
  return Boolean(p && fs.existsSync(p));
}

let electron = resolveElectron();
if (!electron || !fs.existsSync(electron)) {
  console.error('Electron binary not found — finishing installation (one-time, ~150MB download)...');

  // Attempt 1: default source (github.com), unless the user already set a mirror.
  let ok = runInstall({});

  // Attempt 2: fall back to the npmmirror CDN. The default GitHub download is
  // frequently blocked or rate-limited in some regions; this mirror is widely
  // reachable. Respect an existing ELECTRON_MIRROR if the user set one.
  if (!ok && !process.env.ELECTRON_MIRROR) {
    console.error('Default download failed — retrying via mirror (npmmirror.com)...');
    ok = runInstall({ ELECTRON_MIRROR: 'https://npmmirror.com/mirrors/electron/' });
  }

  if (!ok) {
    console.error(
      '\nFailed to install the Electron runtime.\n' +
        'Check your network/proxy, then retry. If you are behind a firewall, set a mirror:\n' +
        '  ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" \\\n' +
        `    node "${installScript}"\n` +
        '(on Windows PowerShell: $env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"; node "' +
        installScript +
        '")\n'
    );
    process.exit(1);
  }
  electron = resolveElectron();
}

const appPath = path.join(__dirname, '..');
const child = spawn(electron, [appPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
  windowsHide: false,
});

child.on('close', (code) => process.exit(code ?? 0));
