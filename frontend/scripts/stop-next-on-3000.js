/**
 * If something is listening on port 3000 and it looks like a prior `next dev`,
 * stop it so this project can bind to 3000 (avoids opening localhost:3000 while Next moved to 3002).
 */
const { execSync } = require('child_process');

function main() {
  if (process.platform !== 'win32') {
    return;
  }
  try {
    const pidOut = execSync(
      'powershell -NoProfile -Command "$c = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($c) { $c.OwningProcess }"',
      { encoding: 'utf8' }
    ).trim();
    if (!pidOut) return;
    const pid = parseInt(pidOut, 10);
    if (!Number.isFinite(pid)) return;

    const cmdOut = execSync(
      `powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}').CommandLine"`,
      { encoding: 'utf8' }
    );
    const cmd = cmdOut.toLowerCase();
    const looksLikeNext =
      cmd.includes('next') &&
      (cmd.includes('start-server') ||
        cmd.includes('next\\\\dist\\\\bin') ||
        cmd.includes('next/dist/bin'));

    if (looksLikeNext) {
      console.log(`[dev] Stopping prior Next.js on port 3000 (PID ${pid})`);
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'inherit' });
    }
  } catch {
    /* ignore */
  }
}

main();
