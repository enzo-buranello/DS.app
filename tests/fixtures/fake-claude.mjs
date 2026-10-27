#!/usr/bin/env node
// Faux CLI Claude pour les tests : aucun appel réseau, réponses déterministes.
// Vision : PNG → brouillon valide ; JPEG → JSON hors schéma ; WebP → texte non JSON.
const args = process.argv.slice(2);
if (args.includes('--version')) {
  console.log('0.0.0 (simulation)');
  process.exit(0);
}
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (input += c));
process.stdin.on('end', () => {
  const stream = args.includes('stream-json');
  if (!stream) {
    console.log(
      JSON.stringify({
        type: 'result',
        result: JSON.stringify({ message: 'Simulation.', changes: [] }),
        num_turns: 1,
      }),
    );
    return;
  }
  const message = JSON.parse(input.trim().split('\n')[0]);
  const image = message.message.content.find((c) => c.type === 'image');
  const draft = {
    name: 'Bouton capturé',
    width: 132,
    height: 44,
    sizing: { x: 'hug', y: 'hug' },
    layout: {
      direction: 'horizontal',
      gap: 8,
      padding: [8, 16, 8, 16],
      align: 'center',
      distribute: 'center',
    },
    fill: { hex: '#3256C2', opacity: 1 },
    stroke: null,
    radius: [10, 10, 10, 10],
    shadow: null,
    layers: [
      { type: 'icon', glyph: '→' },
      {
        type: 'text',
        text: 'Valider',
        color: { hex: '#FFFFFF', opacity: 1 },
        fontFamily: 'Inter',
        fontSize: 16,
        fontWeight: 650,
        lineHeight: 1.5,
      },
    ],
  };
  const result =
    image.source.media_type === 'image/webp'
      ? 'Je vois un bouton bleu.'
      : image.source.media_type === 'image/jpeg'
        ? JSON.stringify({ name: '', layers: 'aucun' })
        : '```json\n' + JSON.stringify(draft) + '\n```';
  console.log(JSON.stringify({ type: 'system', subtype: 'init' }));
  console.log(
    JSON.stringify({ type: 'result', is_error: false, result, num_turns: 1 }),
  );
});
