import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { promises as fs } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';
import type { Preview, Target } from '../shared/build.js';
import { listFiles } from './generate.js';

// Aperçu du code généré. Web : serveur de développement du projet (statique
// pour HTML/CSS), un par projet. SwiftUI : compilation pour le simulateur
// iOS, puis capture de l'écran.

const exec = promisify(execFile);
type Server = { out: string; url: string; stop: () => void };
const servers = new Map<string, Server>();

const freePort = () =>
  new Promise<number>((ok) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address() as net.AddressInfo;
      s.close(() => ok(port));
    });
  });

async function ready(url: string, proc?: ChildProcess) {
  for (let i = 0; i < 240; i++) {
    if (proc && proc.exitCode !== null) break;
    if (
      await fetch(url).then(
        (r) => r.ok,
        () => false,
      )
    )
      return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Aperçu indisponible');
}

const types: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.json': 'application/json',
};

async function staticServer(out: string): Promise<Server> {
  const port = await freePort();
  const server = http.createServer(async (req, res) => {
    let rel = decodeURIComponent(new URL(req.url!, 'http://x').pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(out, path.normalize(rel));
    if (!file.startsWith(out + path.sep)) return res.writeHead(404).end();
    try {
      const body = await fs.readFile(file);
      res.writeHead(200, {
        'content-type': types[path.extname(file)] ?? 'text/plain',
        'cache-control': 'no-store',
      });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((ok) => server.listen(port, '127.0.0.1', ok));
  return { out, url: `http://127.0.0.1:${port}/`, stop: () => server.close() };
}

async function devServer(out: string, target: Target): Promise<Server> {
  const has = (f: string) =>
    fs.stat(path.join(out, f)).then(
      () => true,
      () => false,
    );
  if (!(await has('package.json'))) throw new Error('Aucun projet');
  if (!(await has('node_modules')))
    await exec('npm', ['install'], { cwd: out, timeout: 300_000 });
  const port = await freePort();
  const args =
    target === 'next'
      ? ['-p', String(port), '-H', '127.0.0.1']
      : ['--port', String(port), '--strictPort', '--host', '127.0.0.1'];
  const proc = spawn('npm', ['run', 'dev', '--', ...args], {
    cwd: out,
    stdio: 'ignore',
    detached: true,
  });
  const url = `http://127.0.0.1:${port}/`;
  const stop = () => {
    // Le groupe entier : npm et le serveur qu'il a lancé.
    try {
      process.kill(-proc.pid!);
    } catch {}
  };
  try {
    await ready(url, proc);
  } catch (e) {
    stop();
    throw e;
  }
  return { out, url, stop };
}

/** Aperçu web : démarré au besoin, gardé tant que la cible ne change pas. */
export async function webPreview(
  dir: string,
  out: string,
  target: Target,
): Promise<Preview> {
  const cur = servers.get(dir);
  if (cur?.out === out) return { url: cur.url };
  cur?.stop();
  servers.delete(dir);
  const s =
    target === 'html' ? await staticServer(out) : await devServer(out, target);
  servers.set(dir, s);
  return { url: s.url };
}

export function stopPreviews() {
  for (const s of servers.values()) s.stop();
  servers.clear();
}

const BUNDLE = 'studio.preview.app';
const simctl = (...args: string[]) =>
  exec('xcrun', ['simctl', ...args], { timeout: 120_000 });

/** Un iPhone démarré : celui qui tourne, sinon le premier disponible. */
async function device() {
  const { stdout } = await simctl('list', 'devices', 'available', '-j');
  const all = Object.values(
    JSON.parse(stdout).devices as Record<
      string,
      { udid: string; name: string; state: string }[]
    >,
  ).flat();
  const booted = all.find((d) => d.state === 'Booted');
  if (booted) return booted.udid;
  const phone = all.find((d) => d.name.startsWith('iPhone'));
  if (!phone) throw new Error('Aucun simulateur');
  await simctl('boot', phone.udid);
  return phone.udid;
}

/**
 * SwiftUI : compile les sources pour le simulateur (swiftc, sans projet
 * Xcode), installe, lance, puis renvoie une capture de l'écran.
 */
export async function swiftPreview(dir: string, out: string): Promise<Preview> {
  const sources = (await listFiles(out))
    .filter((f) => f.endsWith('.swift'))
    .map((f) => path.join(out, f));
  if (!sources.length) throw new Error('Aucun fichier Swift');
  const work = path.join(dir, '.studio', 'preview');
  const bundle = path.join(work, 'App.app');
  await fs.rm(bundle, { recursive: true, force: true });
  await fs.mkdir(bundle, { recursive: true });
  const arch = process.arch === 'arm64' ? 'arm64' : 'x86_64';
  await exec(
    'xcrun',
    [
      '--sdk',
      'iphonesimulator',
      'swiftc',
      '-target',
      `${arch}-apple-ios17.0-simulator`,
      '-parse-as-library',
      '-o',
      path.join(bundle, 'App'),
      ...sources,
    ],
    { timeout: 300_000 },
  );
  await fs.writeFile(
    path.join(bundle, 'Info.plist'),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>${BUNDLE}</string>
<key>CFBundleExecutable</key><string>App</string>
<key>CFBundleName</key><string>Aperçu</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>1</string>
<key>CFBundleShortVersionString</key><string>1.0</string>
<key>MinimumOSVersion</key><string>17.0</string>
<key>CFBundleSupportedPlatforms</key><array><string>iPhoneSimulator</string></array>
<key>UIDeviceFamily</key><array><integer>1</integer><integer>2</integer></array>
<key>UILaunchScreen</key><dict/>
</dict></plist>`,
  );
  await fs
    .cp(path.join(out, 'Assets'), bundle, { recursive: true })
    .catch(() => {});
  await exec('codesign', ['--force', '-s', '-', bundle]);
  const udid = await device();
  await simctl('install', udid, bundle);
  await simctl('launch', '--terminate-running-process', udid, BUNDLE);
  await new Promise((r) => setTimeout(r, 2500));
  const shot = path.join(work, 'screen.png');
  await simctl('io', udid, 'screenshot', shot);
  return {
    image: `data:image/png;base64,${(await fs.readFile(shot)).toString('base64')}`,
  };
}

/** Ciblage dans l'aperçu web : un clic choisit un élément (contour fin),
 * Échap annule ; le choix remonte à l'app par postMessage. */
export const PICK = `(() => {
  if (window.__studio) return;
  window.__studio = true;
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;outline:1px solid #111;box-shadow:0 0 0 3px rgba(17,17,17,.12);display:none';
  document.documentElement.appendChild(box);
  let sel = null;
  const place = () => {
    if (!sel || !sel.isConnected) return void (box.style.display = 'none');
    const r = sel.getBoundingClientRect();
    Object.assign(box.style, { display: 'block', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
  };
  const css = (el) => {
    const parts = [];
    while (el && el.nodeType === 1 && el !== document.body && el !== document.documentElement) {
      let p = el.tagName.toLowerCase();
      if (el.id) { parts.unshift(p + '#' + CSS.escape(el.id)); break; }
      const same = [...el.parentElement.children].filter((c) => c.tagName === el.tagName);
      if (same.length > 1) p += ':nth-of-type(' + (same.indexOf(el) + 1) + ')';
      parts.unshift(p);
      el = el.parentElement;
    }
    return parts.join(' > ') || 'body';
  };
  const send = () => parent.postMessage({ studio: 'pick', pick: sel && {
    selector: css(sel),
    html: sel.outerHTML.slice(0, 800),
    text: (sel.innerText || '').trim().slice(0, 200),
  } }, '*');
  addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); sel = e.target; place(); send(); }, true);
  addEventListener('keydown', (e) => { if (e.key === 'Escape') { sel = null; place(); send(); } }, true);
  addEventListener('scroll', place, true);
  addEventListener('resize', place);
  addEventListener('message', (e) => { if (e.data && e.data.studio === 'clear') { sel = null; place(); } });
})();`;
