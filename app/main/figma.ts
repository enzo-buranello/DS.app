import { query, type Query } from '@anthropic-ai/claude-agent-sdk';

// Import Figma : serveur MCP distant officiel de Figma, branché sur l'agent.
// L'autorisation (OAuth) passe par Claude Code, qui garde la session dans le
// trousseau du système ; jamais dans le projet.

/** Fichier et, s'il y en a un, nœud visé (page ou frame) d'un lien Figma. */
export function parseLink(url: string) {
  const fileKey = url.match(
    /figma\.com\/(?:file|design|proto)\/([A-Za-z0-9]+)/,
  )?.[1];
  if (!fileKey) return null;
  const node = url.match(/[?&]node-id=([0-9]+[-:][0-9]+)/)?.[1];
  return { fileKey, ...(node && { nodeId: node.replace('-', ':') }) };
}
export type FigmaLink = NonNullable<ReturnType<typeof parseLink>>;

export const figmaServer = {
  figma: {
    type: 'http' as const,
    url: 'https://mcp.figma.com/mcp',
    alwaysLoad: true,
  },
};
// Seuls les outils de lecture de Figma ; aucune écriture dans le fichier.
export const figmaTools = [
  'whoami',
  'create_session',
  'get_metadata',
  'get_variable_defs',
  'get_design_context',
  'get_screenshot',
  'get_libraries',
  'search_design_system',
].map((t) => `mcp__figma__${t}`);
// Les connecteurs claude.ai du compte ne sont pas chargés.
export const figmaEnv = {
  ...process.env,
  ENABLE_CLAUDEAI_MCP_SERVERS: 'false',
};

const fake = () => process.env.STUDIO_FAKE_FIGMA;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Session sans tour du modèle : sert à lire l'état ou à autoriser.
async function session<T>(fn: (q: Query) => Promise<T>) {
  let release!: () => void;
  const hold = new Promise<void>((r) => (release = r));
  const q = query({
    prompt: (async function* () {
      await hold;
    })(),
    options: {
      tools: [],
      settingSources: [],
      mcpServers: figmaServer,
      env: figmaEnv,
    },
  });
  try {
    return await fn(q);
  } finally {
    release();
    q.close();
  }
}
async function status(q: Query) {
  for (let i = 0; i < 20; i++) {
    const s = (await q.mcpServerStatus()).find((s) => s.name === 'figma');
    if (s && s.status !== 'pending') return s.status;
    await sleep(500);
  }
  return 'failed';
}

let connected = false;
/** Vrai si le compte Figma est connecté ; mémorisé jusqu'au prochain refus. */
export async function figmaConnected() {
  if (fake()) return true;
  connected ||= await session(async (q) => (await status(q)) === 'connected');
  return connected;
}
export function figmaExpired() {
  connected = false;
}

/** Ouvre l'autorisation dans le navigateur et attend son retour. */
export async function connectFigma(open: (url: string) => void) {
  if (fake()) return true;
  connected = await session(async (q) => {
    if ((await status(q)) === 'connected') return true;
    const auth = q as Query & {
      mcpAuthenticate(name: string): Promise<{ authUrl?: string }>;
    };
    const { authUrl } = await auth.mcpAuthenticate('figma');
    if (!authUrl) return false;
    open(authUrl);
    for (let i = 0; i < 300; i++) {
      await sleep(1000);
      const s = (await q.mcpServerStatus()).find((s) => s.name === 'figma');
      if (s?.status === 'connected') return true;
    }
    return false;
  });
  return connected;
}
