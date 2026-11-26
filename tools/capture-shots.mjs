// Takes the entry's screenshots: serves game/, opens each scene listed in shots.json in headless
// Chromium (Playwright), waits until the page flags the frame ready, and saves a 1280x720 JPEG
// into screenshots/. Usage: node tools/capture-shots.mjs [scene-name ...] [--out dir]
// Needs playwright-core and a Chromium; PLAYWRIGHT_CORE points at the package if not installed here.
import { createServer } from 'node:http';
import { readFileSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outDir = resolve(outIndex >= 0 ? args[outIndex + 1] : join(here, 'screenshots'));
const only = args.filter((a, i) => !a.startsWith('--') && (outIndex < 0 || i !== outIndex + 1));
const { chromium } = await import(process.env.PLAYWRIGHT_CORE ? pathToFileURL(process.env.PLAYWRIGHT_CORE).href : 'playwright-core');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain' };
const root = join(here, 'game');
const server = createServer((req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = join(root, path);
  try {
    statSync(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  } catch { res.writeHead(404).end(); }
}).listen(0);
const port = server.address().port;

const shots = JSON.parse(readFileSync(join(here, 'shots.json'), 'utf8'));
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
mkdirSync(outDir, { recursive: true });
for (const shot of shots) {
  if (only.length && !only.some((o) => shot.name.includes(o))) continue;
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', (r) => { if (!r.url().startsWith(`http://localhost:${port}`)) errors.push('network: ' + r.url()); });
  await page.goto(`http://localhost:${port}/${shot.query}`, { waitUntil: 'commit', timeout: 300000 });
  await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 300000 }).catch(() => errors.push('timeout'));
  const buffer = await page.screenshot({ type: 'jpeg', quality: 86, timeout: 300000 });
  writeFileSync(join(outDir, shot.name), buffer);
  console.log(shot.name, `${Math.round(buffer.length / 1024)} KiB`, errors.length ? errors.join(' | ') : 'ok');
  await page.close();
}
await browser.close();
server.close();
