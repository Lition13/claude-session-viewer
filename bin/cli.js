#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');
const electron = require('electron');

const appPath = path.join(__dirname, '..');
const child = spawn(electron, [appPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
  windowsHide: false,
});

child.on('close', (code) => process.exit(code ?? 0));
