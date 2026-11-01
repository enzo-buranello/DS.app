// Compte LLM global de l'utilisateur : quatre familles de fournisseurs et
// deux protocoles. Aucune clé ne transite par l'interface.

export const providers = [
  'anthropic',
  'openai',
  'deepseek',
  'mistral',
  'openrouter',
] as const;
export type Provider = (typeof providers)[number];

/** session : Claude Code déjà connecté ; key : clé collée ; browser : OAuth. */
export type AuthMethod = 'session' | 'key' | 'browser';
export type Auth = { provider: Provider; method: AuthMethod };

/** Nom affiché, sans jargon. */
export const providerLabels: Record<Provider, string> = {
  anthropic: 'Claude',
  openai: 'ChatGPT',
  deepseek: 'DeepSeek',
  mistral: 'Mistral',
  openrouter: 'OpenRouter',
};

export type Protocol = 'anthropic-sdk' | 'openai-compatible';
export type ProviderInfo = {
  baseUrl: string;
  /** Vide pour Anthropic : le SDK choisit son modèle. */
  defaultModel: string;
  vision: boolean;
  protocol: Protocol;
  /** Où valider une clé sans consommer de tokens. */
  check: string;
};

// Identifiants relevés dans la documentation le 2026-10-30. Les modèles
// changent vite : cette table est le seul endroit à mettre à jour.
export const providerTable: Record<Provider, ProviderInfo> = {
  anthropic: {
    baseUrl: 'https://api.anthropic.com',
    defaultModel: '',
    vision: true,
    protocol: 'anthropic-sdk',
    check: 'https://api.anthropic.com/v1/models',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-6.1-sol',
    vision: true,
    protocol: 'openai-compatible',
    check: 'https://api.openai.com/v1/models',
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-v4-pro',
    vision: false,
    protocol: 'openai-compatible',
    check: 'https://api.deepseek.com/models',
  },
  mistral: {
    baseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-large-4',
    vision: true,
    protocol: 'openai-compatible',
    check: 'https://api.mistral.ai/v1/models',
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-6.1-sol',
    vision: true,
    protocol: 'openai-compatible',
    check: 'https://openrouter.ai/api/v1/key',
  },
};

export const isProvider = (v: unknown): v is Provider =>
  typeof v === 'string' && (providers as readonly string[]).includes(v);

export const isAuthMethod = (v: unknown): v is AuthMethod =>
  v === 'session' || v === 'key' || v === 'browser';

/** Modèle retenu : celui de l'entrée, sinon celui du fournisseur. */
export const modelFor = (provider: Provider, model?: string) =>
  model?.trim() || providerTable[provider].defaultModel;
