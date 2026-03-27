/* Remove .next before dev — Node's rmSync often fails on OneDrive (EINVAL readlink); PowerShell works. */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const nextDir = path.join(root, '.next');

if (!fs.existsSync(nextDir)) process.exit(0);

if (process.platform === 'win32') {
  execSync(
    'powershell -NoProfile -Command "if (Test-Path .next) { Remove-Item -LiteralPath .next -Recurse -Force }"',
    { cwd: root, stdio: 'inherit' }
  );
} else {
  fs.rmSync(nextDir, { recursive: true, force: true });
}
