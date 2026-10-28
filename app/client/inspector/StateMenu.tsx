import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  CaretDown,
  Circle,
  CursorClick,
  HandPointing,
  Prohibit,
  Target,
  WarningCircle,
} from '@phosphor-icons/react';
import type { StateName } from '../../shared/doc.js';

type Choice = StateName | 'base';
// Deux familles : interaction, puis conditions (séparées par une ligne).
const ITEMS: readonly (readonly [Choice, string, ReactNode, 0 | 1])[] = [
  ['base', 'Défaut', <Circle />, 0],
  ['hover', 'Survol', <HandPointing />, 0],
  ['pressed', 'Appuyé', <CursorClick />, 0],
  ['focus', 'Focus', <Target />, 0],
  ['disabled', 'Désactivé', <Prohibit />, 1],
  ['invalid', 'Invalide', <WarningCircle />, 1],
];

/**
 * Menu déroulant d'état : bouton compact (état courant + chevron), carte
 * superposée au contenu. Clavier : flèches, Début/Fin, Entrée, Échap.
 */
export function StateMenu({
  value,
  onChange,
  withInvalid,
  modified,
}: {
  value: StateName | null;
  onChange: (s: StateName | null) => void;
  withInvalid: boolean;
  /** États qui ont des réglages propres (badge « Modifié »). */
  modified: ReadonlySet<StateName>;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const items = ITEMS.filter(([v]) => v !== 'invalid' || withInvalid);
  const current = items.find(([v]) => v === (value ?? 'base')) ?? items[0];

  useEffect(() => {
    if (!open) return;
    const active = box.current?.querySelector<HTMLElement>(
      '[aria-checked="true"]',
    );
    active?.focus();
    const outside = (e: PointerEvent) =>
      !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const pick = (v: Choice) => {
    onChange(v === 'base' ? null : v);
    close();
  };
  return (
    <div className="state-menu" ref={box}>
      <button
        ref={trigger}
        type="button"
        className="state-trigger"
        aria-label={`État : ${current[1]}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen(!open)}
      >
        {current[2]}
        {current[1]}
        <CaretDown />
      </button>
      {open && (
        <div
          className="menu"
          role="menu"
          id={menuId}
          aria-label="État"
          onKeyDown={(e) => {
            const list = [
              ...e.currentTarget.querySelectorAll<HTMLElement>(
                '[role="menuitemradio"]',
              ),
            ];
            const i = list.indexOf(document.activeElement as HTMLElement);
            const go = (j: number) =>
              list[(j + list.length) % list.length]?.focus();
            if (e.key === 'ArrowDown') go(i + 1);
            else if (e.key === 'ArrowUp') go(i - 1);
            else if (e.key === 'Home') go(0);
            else if (e.key === 'End') go(list.length - 1);
            else if (e.key === 'Escape' || e.key === 'Tab') close();
            else return;
            e.preventDefault();
          }}
        >
          {items.map(([v, label, icon, family], i) => (
            <div key={v} role="none">
              {i > 0 && family !== items[i - 1][3] && (
                <div className="menu-separator" role="separator" />
              )}
              <button
                type="button"
                role="menuitemradio"
                aria-checked={v === current[0]}
                className="menu-item"
                tabIndex={-1}
                onClick={() => pick(v)}
              >
                {icon}
                <span>{label}</span>
                {v !== 'base' && modified.has(v) && (
                  <span className="badge">Modifié</span>
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
