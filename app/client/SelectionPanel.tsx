import type { ReactNode } from 'react';
import { X } from '@phosphor-icons/react';
import { fontFamilies } from '../shared/component.js';
import type { TokenKey, Tokens, TokenValue } from '../shared/model.js';
import type { Selection } from './selection.js';

const KIND: Record<Selection['kind'], string> = {
  token: 'Élément du thème',
  master: 'Composant maître',
  instance: 'Copie de composant',
  node: 'Élément',
};

// Panneau de la sélection : en-tête, éditeur de token, ou inspecteur (children).
export function SelectionPanel({
  selection,
  tokens,
  onToken,
  onClose,
  done,
  children,
}: {
  selection: Selection;
  tokens: Tokens;
  onToken: (key: TokenKey, value: TokenValue) => void;
  onClose: () => void;
  /** Bouton principal « Terminer » (multi-sélection ; le token l'a d'office). */
  done?: boolean;
  children?: ReactNode;
}) {
  const s = selection;
  function tokenEditor() {
    const key = s.id as TokenKey;
    const t = tokens[key];
    if (t.$type === 'fontFamily')
      return (
        <label className="field">
          Valeur
          <select
            value={String(t.$value)}
            onChange={(e) => onToken(key, e.target.value)}
          >
            {fontFamilies.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
      );
    if (t.$type === 'dimension')
      return (
        <label className="field">
          Valeur (px)
          <input
            type="number"
            min={0}
            max={128}
            value={Number(t.$value)}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (e.target.value !== '' && n >= 0 && n <= 128) onToken(key, n);
            }}
          />
        </label>
      );
    return (
      <div className="control-row">
        <input
          className="color-picker"
          type="color"
          aria-label="Couleur du token"
          value={String(t.$value)}
          onChange={(e) => onToken(key, e.target.value)}
        />
        <label className="field">
          Valeur
          <input
            aria-label="Valeur hex du token"
            defaultValue={String(t.$value)}
            key={String(t.$value)}
            maxLength={7}
            onChange={(e) =>
              /^#[0-9a-fA-F]{6}$/.test(e.target.value) &&
              onToken(key, e.target.value)
            }
          />
        </label>
      </div>
    );
  }
  return (
    <section
      className="settings-section selection-panel"
      aria-labelledby="selection-title"
    >
      <div className="section-head">
        <div>
          <span className="muted">{KIND[s.kind]}</span>
          <h3 id="selection-title">{s.name}</h3>
        </div>
        <button
          type="button"
          className="dismiss"
          aria-label="Désélectionner"
          onClick={onClose}
        >
          <X />
        </button>
      </div>
      {s.kind === 'token' ? tokenEditor() : children}
      {(done || s.kind === 'token') && (
        <div className="panel-cta">
          <button type="button" className="studio-primary" onClick={onClose}>
            Terminer
          </button>
        </div>
      )}
    </section>
  );
}
