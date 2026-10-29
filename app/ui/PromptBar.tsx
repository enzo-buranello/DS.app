import { useRef, useState } from 'react';
import { ArrowUp, ImageSquare, X } from '@phosphor-icons/react';

// Barre IA : aucune conversation. En cours, puis Garder / Annuler, ou une
// seule ligne en cas d'échec. Des images peuvent accompagner l'instruction :
// bouton, glisser-déposer ou collage.
export type AiState =
  | { status: 'idle' }
  | { status: 'busy' | 'error'; message?: string }
  | { status: 'review'; entry: string };

const read = (files: Iterable<File>) =>
  Promise.all(
    [...files]
      .filter((f) => f.type.startsWith('image/'))
      .map(
        (f) =>
          new Promise<string>((ok) => {
            const r = new FileReader();
            r.onload = () => ok(r.result as string);
            r.readAsDataURL(f);
          }),
      ),
  );

export function PromptBar(props: {
  state: AiState;
  placeholder: string;
  onSubmit: (text: string, images: string[]) => void;
  onKeep: () => void;
  onUndo: (entry: string) => void;
}) {
  const [text, setText] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [over, setOver] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const { state } = props;
  const busy = state.status === 'busy';
  const add = async (files: Iterable<File>) => {
    const urls = await read(files);
    if (urls.length) setImages((list) => [...list, ...urls]);
  };
  if (state.status === 'review')
    return (
      <div className="prompt-bar">
        <span className="prompt-status">Modifié</span>
        <button className="ghost" onClick={() => props.onUndo(state.entry)}>
          Annuler
        </button>
        <button className="studio-primary" onClick={props.onKeep}>
          Garder
        </button>
      </div>
    );
  return (
    <form
      className="prompt-bar"
      data-over={over || undefined}
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim() || busy) return;
        props.onSubmit(text.trim(), images);
        setText('');
        setImages([]);
      }}
      onDragOver={(e) => {
        if (busy || !e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!busy) void add(e.dataTransfer.files);
      }}
    >
      {images.length > 0 && (
        <ul className="prompt-images" aria-label="Images jointes">
          {images.map((src, i) => (
            <li key={i}>
              <img src={src} alt="" />
              <button
                type="button"
                className="dismiss"
                aria-label="Retirer l’image"
                onClick={() => setImages(images.filter((_, j) => j !== i))}
              >
                <X />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="prompt-row">
        <button
          type="button"
          className="icon-btn"
          aria-label="Joindre une image"
          disabled={busy}
          onClick={() => file.current?.click()}
        >
          <ImageSquare />
        </button>
        <input
          ref={file}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          hidden
          aria-label="Images"
          onChange={(e) => {
            void add(e.target.files ?? []);
            e.target.value = '';
          }}
        />
        <input
          aria-label="Instruction"
          placeholder={
            busy
              ? (state.message ?? 'En cours')
              : state.status === 'error'
                ? (state.message ?? 'Impossible d’appliquer la modification')
                : props.placeholder
          }
          className={state.status === 'error' ? 'error' : undefined}
          value={text}
          disabled={busy}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            if (e.clipboardData.files.length) {
              e.preventDefault();
              void add(e.clipboardData.files);
            }
          }}
        />
        <button
          className="icon-btn studio-primary"
          aria-label="Envoyer"
          disabled={busy || !text.trim()}
        >
          <ArrowUp />
        </button>
      </div>
    </form>
  );
}
