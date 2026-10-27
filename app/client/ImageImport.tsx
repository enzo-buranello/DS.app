import { useEffect, useRef, useState } from 'react';
import type { DSComponent } from '../shared/component.js';
import {
  draftToComponent,
  IMAGE_MEDIA_TYPES,
  MAX_IMAGE_BYTES,
} from '../shared/componentDraft.js';
import type { Tokens } from '../shared/model.js';
import { request } from './api.js';
import { ComponentView, DSProvider } from './DesignSystem.js';
import { svgToDraft } from './svgImport.js';

type Phase =
  | { kind: 'idle' }
  | { kind: 'loading'; message: string }
  | { kind: 'error'; message: string }
  | { kind: 'preview'; component: DSComponent };
const SVG = 'image/svg+xml';
const ACCEPT = [...IMAGE_MEDIA_TYPES, SVG].join(',');

// URL data: (la CSP de l'app autorise data: pour les images, pas blob:).
const dataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Lecture du fichier impossible.'));
    reader.readAsDataURL(file);
  });

// Image → composant modifiable : SVG converti ici, image matricielle analysée par Claude.
export default function ImageImport({
  tokens,
  onCreate,
}: {
  tokens: Tokens;
  onCreate: (component: DSComponent) => Promise<unknown>;
}) {
  const [file, setFile] = useState<File>();
  const [source, setSource] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);
  // Cmd+V : seulement une image du presse-papiers, jamais un collage dans un champ.
  useEffect(() => {
    const paste = (e: ClipboardEvent) => {
      const image = Array.from(e.clipboardData?.files ?? []).find((f) =>
        f.type.startsWith('image/'),
      );
      if (!image) return;
      e.preventDefault();
      void analyse(image);
    };
    window.addEventListener('paste', paste);
    return () => window.removeEventListener('paste', paste);
  }, [tokens]);

  async function analyse(next: File) {
    controller.current?.abort();
    setFile(next);
    if (
      next.type !== SVG &&
      !(IMAGE_MEDIA_TYPES as readonly string[]).includes(next.type)
    )
      return setPhase({
        kind: 'error',
        message: 'Format non supporté : PNG, JPG, WebP ou SVG attendu.',
      });
    if (next.size > MAX_IMAGE_BYTES)
      return setPhase({
        kind: 'error',
        message: 'Image trop lourde (4 Mo maximum).',
      });
    try {
      const url = await dataUrl(next);
      setSource(url);
      if (next.type === SVG) {
        setPhase({ kind: 'loading', message: 'Conversion du SVG…' });
        const draft = svgToDraft(await next.text(), next.name);
        return setPhase({
          kind: 'preview',
          component: draftToComponent(draft, tokens, crypto.randomUUID()),
        });
      }
      setPhase({ kind: 'loading', message: 'Analyse de l’image par Claude…' });
      const abort = new AbortController();
      controller.current = abort;
      const r = await request<{ component: DSComponent }>(
        'import/image',
        { mediaType: next.type, data: url.split(',')[1] ?? '' },
        abort.signal,
      );
      setPhase({ kind: 'preview', component: r.component });
    } catch (e) {
      if (controller.current?.signal.aborted) return;
      setPhase({ kind: 'error', message: (e as Error).message });
    }
  }

  return (
    <div className="image-import">
      <div
        className="dropzone"
        data-dragging={dragging}
        role="button"
        tabIndex={0}
        aria-label="Déposer une image (PNG, JPG, WebP, SVG), parcourir ou coller avec Cmd+V"
        onClick={() => input.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            input.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const dropped = e.dataTransfer.files[0];
          if (dropped) void analyse(dropped);
        }}
      >
        <span>Glisser une image ici</span>
        <small>ou parcourir · Cmd+V · PNG, JPG, WebP, SVG · 4 Mo max</small>
      </div>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        hidden
        aria-label="Choisir une image"
        onChange={(e) => {
          const picked = e.target.files?.[0];
          e.target.value = '';
          if (picked) void analyse(picked);
        }}
      />
      {phase.kind === 'loading' && (
        <p className="token-hint" role="status">
          {phase.message}
        </p>
      )}
      {phase.kind === 'error' && (
        <p className="error" role="alert">
          {phase.message}
        </p>
      )}
      {phase.kind === 'preview' && file && (
        <section className="import-preview" aria-label="Aperçu de l’import">
          <figure>
            <img src={source} alt={`Image source : ${file.name}`} />
            <figcaption>Source</figcaption>
          </figure>
          <figure>
            <DSProvider tokens={tokens}>
              <div className="import-result">
                <ComponentView component={phase.component} />
              </div>
            </DSProvider>
            <figcaption>{phase.component.name}</figcaption>
          </figure>
          <div className="control-row">
            <button
              type="button"
              className="studio-primary"
              onClick={() =>
                void onCreate(phase.component).then(
                  () => {
                    setPhase({ kind: 'idle' });
                    setFile(undefined);
                  },
                  (e) =>
                    setPhase({ kind: 'error', message: (e as Error).message }),
                )
              }
            >
              Créer
            </button>
            <button type="button" onClick={() => void analyse(file)}>
              Réessayer
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
