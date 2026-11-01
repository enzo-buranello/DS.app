import { useState } from 'react';
import {
  providerLabels,
  providers,
  type Auth,
  type Provider,
} from '../shared/account.js';

const api = window.studio;

const lines: Record<string, string> = {
  'auth:key': 'Clé refusée',
  'auth:network': 'Connexion impossible',
  'auth:vault': 'Trousseau indisponible',
  'auth:claude-missing': 'Claude Code introuvable',
  'auth:claude': 'Connexion impossible',
  'auth:code': 'Code refusé',
  'auth:out': 'Connexion requise',
  'auth:vision': 'Images non prises en charge',
  'auth:figma': 'Compte Claude requis',
};

const line = (e: unknown) => {
  const text = String(e);
  const code = Object.keys(lines).find((k) => text.includes(k));
  return code ? lines[code] : 'Connexion impossible';
};

// Écran de connexion : cinq fournisseurs, une clé ou le navigateur pour
// Claude. Aucun secret ne revient ici après validation.
export function AuthScreen(props: { onDone: (a: Auth) => void }) {
  const [provider, setProvider] = useState<Provider | null>(null);
  const [key, setKey] = useState('');
  const [code, setCode] = useState('');
  const [open, setOpen] = useState(false);
  const [withKey, setWithKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = (p: Provider) => {
    if (busy) return;
    setProvider(p);
    setKey('');
    setCode('');
    setOpen(false);
    setWithKey(false);
    setError(null);
  };

  const submit = async () => {
    if (!provider || !key.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      props.onDone(await api.authKey(provider, key.trim()));
    } catch (e) {
      setError(line(e));
      setBusy(false);
    }
  };

  const browser = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.authClaude();
      setOpen(true);
    } catch (e) {
      setError(line(e));
    }
    setBusy(false);
  };

  const finish = async () => {
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      props.onDone(await api.authClaudeCode(code.trim()));
    } catch (e) {
      setError(line(e));
      setBusy(false);
    }
  };

  const cancel = () => {
    setOpen(false);
    setCode('');
    setError(null);
    setBusy(false);
  };

  return (
    <main className="auth">
      <section className="auth-card" aria-label="Connexion">
        <h1>Connexion</h1>
        <div className="auth-providers">
          {providers.map((p) => (
            <button
              key={p}
              type="button"
              className="ghost"
              aria-pressed={provider === p}
              disabled={busy}
              onClick={() => choose(p)}
            >
              {providerLabels[p]}
            </button>
          ))}
        </div>
        {provider && (
          <div className="auth-panel">
            {provider === 'anthropic' && !withKey ? (
              open ? (
                <form
                  className="auth-panel"
                  aria-label="Claude : code"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void finish();
                  }}
                >
                  <label className="field">
                    Code
                    <input
                      autoComplete="off"
                      spellCheck={false}
                      autoFocus
                      value={code}
                      disabled={busy}
                      onChange={(e) => setCode(e.target.value)}
                    />
                  </label>
                  <div className="row">
                    <button
                      className="studio-primary"
                      disabled={busy || !code.trim()}
                    >
                      {busy ? 'Connexion…' : 'Continuer'}
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      disabled={busy}
                      onClick={cancel}
                    >
                      Annuler
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <button
                    type="button"
                    className="studio-primary"
                    disabled={busy}
                    onClick={browser}
                  >
                    {busy ? 'Connexion…' : 'Se connecter'}
                  </button>
                  {!busy && (
                    <button
                      type="button"
                      className="ghost auth-link"
                      onClick={() => setWithKey(true)}
                    >
                      Avec une clé
                    </button>
                  )}
                </>
              )
            ) : (
              <form
                className="auth-panel"
                aria-label={`${providerLabels[provider]} : clé`}
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit();
                }}
              >
                <label className="field">
                  Clé
                  <input
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    autoFocus
                    value={key}
                    disabled={busy}
                    onChange={(e) => setKey(e.target.value)}
                  />
                </label>
                <div className="row">
                  <button
                    className="studio-primary"
                    disabled={busy || !key.trim()}
                  >
                    {busy ? 'Connexion…' : 'Continuer'}
                  </button>
                  {provider === 'anthropic' && (
                    <button
                      type="button"
                      className="ghost auth-link"
                      onClick={() => {
                        setWithKey(false);
                        setKey('');
                        setError(null);
                      }}
                    >
                      Se connecter
                    </button>
                  )}
                </div>
              </form>
            )}
            {error && (
              <p className="error" role="status">
                {error}
              </p>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
