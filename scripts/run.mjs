// npm start | npm run dev | npm run build — une seule entrée, sur tous les systèmes.
import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 12)) {
  console.error(
    'DS-Studio demande Node 22.12 ou plus récent : https://nodejs.org',
  );
  process.exit(1);
}
const { build, createServer } = await import('vite');
const { default: electron } = await import('electron');
const mode = process.argv[2];

const node = (entry, output) =>
  build({
    logLevel: 'warn',
    build: {
      ssr: entry,
      outDir: 'dist',
      emptyOutDir: false,
      target: 'node22',
      rollupOptions: { external: ['electron'], output },
    },
  });

await rm('dist', { recursive: true, force: true });
let url;
if (mode === 'dev') {
  const server = await createServer({ base: './' });
  await server.listen();
  url = server.resolvedUrls.local[0];
} else {
  await build({ base: './', logLevel: 'warn', build: { outDir: 'dist/ui' } });
}
await node('app/main/main.ts', { entryFileNames: 'main.js' });
await node('app/main/preload.ts', {
  format: 'cjs',
  entryFileNames: 'preload.cjs',
});
if (mode === 'build') process.exit(0);

const child = spawn(electron, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, ...(url && { STUDIO_DEV_URL: url }) },
});
child.on('exit', (code) => process.exit(code ?? 0));
