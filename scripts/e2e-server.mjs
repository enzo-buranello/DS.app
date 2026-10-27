import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { startFakeFigma } from './fake-figma.mjs';
const dir = await mkdtemp(path.join(tmpdir(), 'ds-e2e-'));
// Faux Figma (OAuth + REST) : l'app ne contacte jamais le vrai Figma en test.
const figma = await startFakeFigma(4319);
const child = spawn(
  process.execPath,
  ['--import', 'tsx', 'app/server/index.ts'],
  {
    env: {
      ...process.env,
      PORT: '4318',
      DS_STUDIO_DATA_DIR: dir,
      // Faux CLI Claude : réponses déterministes, aucun appel réseau.
      DS_CLAUDE_BIN: path.resolve('tests/fixtures/fake-claude.mjs'),
      FIGMA_CLIENT_ID: 'test',
      FIGMA_CLIENT_SECRET: 'test',
      FIGMA_OAUTH_URL: `${figma.url}/oauth`,
      FIGMA_API_BASE: figma.url,
      // Jamais le trousseau de la machine en test.
      DS_FIGMA_TOKEN_STORE: 'file',
    },
    stdio: 'inherit',
  },
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => child.kill('SIGTERM'));
child.on('exit', async (code) => {
  await figma.close();
  await rm(dir, { recursive: true, force: true });
  process.exit(code ?? 0);
});
