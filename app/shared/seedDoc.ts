import type { TokenKey } from './model.js';
import {
  DOC_VERSION,
  type Doc,
  type DocNode,
  type Length,
  type Paint,
  type Props,
} from './doc.js';

// Document de départ : le catalogue et les deux écrans de l'aperçu d'origine,
// décrits en nœuds. Les comportements (réservation, onglets, formulaire)
// sont des composants interactifs : une interaction change la variante.
// Les tailles dérivées (corps × 0,875…) n'existent pas en token : valeurs
// libres, signalées « hors token » dans le panneau.
type Extra = Partial<Omit<DocNode, 'id' | 'type' | 'name' | 'parent'>>;

const tk = (token: TokenKey) => ({ token }) as Length;
const px = (v: number) => ({ px: v });
const col = (token: TokenKey, opacity = 1) =>
  ({ token, opacity }) as Extract<Paint, { type: 'solid' }>['color'];
const solid = (token: TokenKey, opacity = 1): Paint => ({
  type: 'solid',
  color: col(token, opacity),
  visible: true,
});
const pad = (y: Length, x: Length = y) => ({
  top: y,
  right: x,
  bottom: y,
  left: x,
});
const radius = (r: Length) => ({
  topLeft: r,
  topRight: r,
  bottomRight: r,
  bottomLeft: r,
});
const border = (token: TokenKey = 'color.border', opacity = 1) => ({
  color: col(token, opacity),
  weight: 1,
  style: 'solid' as const,
  align: 'inside' as const,
  visible: true,
});

// Styles réutilisés (équivalents des anciennes classes .ds-*).
const S = {
  label: {
    text: {
      size: px(10),
      weight: 650,
      letterSpacing: 1.3,
      color: col('color.muted'),
    },
  },
  kicker: {
    text: {
      size: px(10),
      weight: 650,
      letterSpacing: 1,
      color: col('color.brand'),
    },
  },
  h3: {
    text: {
      size: px(19.2),
      weight: 700,
      lineHeight: { ratio: 1.35 },
      color: col('color.text'),
    },
  },
  small: { text: { size: px(14), color: col('color.muted') } },
  card: {
    layout: {
      mode: 'vertical',
      gap: tk('space.sm'),
      padding: pad(tk('space.lg')),
      alignCross: 'start',
    },
    stroke: border(),
    radius: radius(tk('radius.control')),
    fills: [solid('color.surface')],
  },
  badge: {
    layout: { mode: 'horizontal', padding: pad(px(4), px(8)) },
    stroke: border(),
    radius: radius(px(20)),
    text: { size: px(10), color: col('color.brand') },
  },
} satisfies Record<string, Props>;

class Builder {
  nodes: Record<string, DocNode> = {};
  add(
    parent: string | null,
    id: string,
    type: DocNode['type'],
    name: string,
    extra: Extra = {},
  ) {
    if (this.nodes[id]) throw new Error(`Id en double : ${id}`);
    this.nodes[id] = {
      id,
      type,
      name,
      parent,
      props: {},
      ...extra,
      children: [],
    };
    if (parent) this.nodes[parent].children.push(id);
    return id;
  }
  text(
    parent: string,
    id: string,
    name: string,
    characters: string,
    props: Props = {},
    extra: Extra = {},
  ) {
    return this.add(parent, id, 'text', name, {
      characters,
      props,
      ...extra,
    });
  }
}

// Largeur des composants de contenu (carte, formulaire, navigation) : tient
// dans une colonne du catalogue ; les instances de l'aperçu sont en Fill.
const COMPONENT_WIDTH = 360;
const VARIANTS = {
  primary: { name: 'Principal', label: 'Action principale' },
  secondary: { name: 'Secondaire', label: 'Secondaire' },
  danger: { name: 'Danger', label: 'Supprimer' },
} as const;
function buttonProps(v: keyof typeof VARIANTS): Props {
  const base: Props = {
    layout: {
      mode: 'horizontal',
      alignMain: 'center',
      alignCross: 'center',
      padding: pad(tk('space.sm'), tk('space.md')),
    },
    radius: radius(tk('radius.control')),
    size: { minHeight: 44 },
    layer: { cursor: 'pointer' },
  };
  if (v === 'secondary')
    return {
      ...base,
      fills: [solid('color.surface')],
      stroke: border('color.brand'),
      text: { color: col('color.brand') },
    };
  return {
    ...base,
    fills: [solid(v === 'danger' ? 'color.danger' : 'color.brand')],
    stroke: border('color.brand', 0),
    text: { color: col('color.onBrand') },
  };
}

function buttons(b: Builder, parent: string) {
  const set = b.add(parent, 'button', 'component-set', 'Button', {
    props: { layout: { mode: 'horizontal', wrap: true, gap: tk('space.sm') } },
  });
  for (const disabled of [false, true])
    for (const v of Object.keys(VARIANTS) as (keyof typeof VARIANTS)[]) {
      const id = `button/${v}${disabled ? '-disabled' : ''}`;
      b.add(
        set,
        id,
        'component',
        `${VARIANTS[v].name}${disabled ? ' · Désactivé' : ''}`,
        {
          variant: {
            Variante: VARIANTS[v].name,
            État: disabled ? 'Désactivé' : 'Défaut',
          },
          props: disabled
            ? {
                ...buttonProps(v),
                layer: { opacity: 0.45, cursor: 'not-allowed' },
              }
            : buttonProps(v),
          states: disabled
            ? undefined
            : v === 'danger'
              ? undefined
              : {
                  hover: {
                    fills: [
                      solid(
                        v === 'primary' ? 'color.brandHover' : 'color.canvas',
                      ),
                    ],
                  },
                },
          semantics: { tag: 'button', buttonType: 'button', disabled },
          componentProps: {
            Texte: {
              type: 'text',
              default: disabled ? 'Indisponible' : VARIANTS[v].label,
            },
          },
        },
      );
      b.text(
        id,
        `${id}/label`,
        'Texte',
        '',
        {},
        {
          semantics: { tag: 'span' },
          bind: { characters: 'Texte' },
        },
      );
    }
}
const button = (
  b: Builder,
  parent: string,
  id: string,
  text: string,
  extra: Extra = {},
  component = 'button/primary',
) =>
  b.add(parent, id, 'instance', 'Button', {
    componentId: component,
    propValues: { Texte: text },
    ...extra,
  });

function bookingCards(b: Builder, parent: string) {
  const set = b.add(
    parent,
    'booking-card-set',
    'component-set',
    'Carte réservation',
    {
      props: { layout: { mode: 'vertical', gap: tk('space.md') } },
    },
  );
  for (const booked of [false, true]) {
    const id = booked ? 'booking-card-booked' : 'booking-card';
    b.add(set, id, 'component', 'Carte réservation', {
      variant: { Réservé: booked ? 'Oui' : 'Non' },
      props: {
        ...S.card,
        size: { width: { mode: 'fixed', px: COMPONENT_WIDTH } },
      },
      semantics: { tag: 'article' },
    });
    b.text(id, `${id}/kicker`, 'Surtitre', 'ATELIER · 45 MIN', S.kicker);
    b.text(id, `${id}/title`, 'Titre', 'Faire moins, mais mieux.', S.h3, {
      semantics: { tag: 'h3' },
    });
    b.text(
      id,
      `${id}/body`,
      'Texte',
      'Un atelier pour imaginer des services plus attentifs au quotidien.',
      S.small,
      { semantics: { tag: 'p' } },
    );
    const meta = b.add(id, `${id}/meta`, 'frame', 'Infos', {
      props: {
        layout: {
          mode: 'horizontal',
          wrap: true,
          gap: 'auto',
          rowGap: tk('space.sm'),
          alignCross: 'center',
        },
        size: { width: { mode: 'fill' } },
        text: { size: px(11) },
      },
    });
    const badge = b.add(meta, `${id}/badge`, 'frame', 'Badge', {
      props: S.badge,
      semantics: { tag: 'span' },
    });
    b.text(
      badge,
      `${id}/badge-text`,
      'Texte',
      '6 places disponibles',
      {},
      {
        semantics: { tag: 'span' },
      },
    );
    b.text(
      meta,
      `${id}/price`,
      'Prix',
      'Gratuit',
      {},
      {
        semantics: { tag: 'span' },
      },
    );
    button(
      b,
      id,
      `${id}/cta`,
      booked ? 'Réservation confirmée ✓' : 'Réserver une place',
      {
        interactions: [
          {
            trigger: 'click',
            action: {
              type: 'change-to',
              variant: { Réservé: booked ? 'Non' : 'Oui' },
            },
          },
        ],
      },
    );
    b.text(
      id,
      `${id}/feedback`,
      'Retour',
      booked ? 'Inscription de démonstration, aucune donnée envoyée.' : '',
      { text: { size: px(11), color: col('color.success') } },
      { semantics: { tag: 'span', role: 'status' } },
    );
  }
}

const inputProps: Props = {
  fills: [solid('color.surface')],
  stroke: border(),
  radius: radius(tk('radius.control')),
  layout: { mode: 'horizontal', padding: pad(tk('space.sm'), tk('space.md')) },
  size: { width: { mode: 'fill' }, minHeight: 44 },
  text: { color: col('color.text') },
};
function forms(b: Builder, parent: string) {
  const set = b.add(parent, 'form-set', 'component-set', 'Formulaire', {
    props: { layout: { mode: 'vertical', gap: tk('space.lg') } },
  });
  for (const sent of [false, true]) {
    const id = sent ? 'form-sent' : 'form';
    b.add(set, id, 'component', 'Formulaire', {
      variant: { Envoyé: sent ? 'Oui' : 'Non' },
      props: {
        layout: { mode: 'vertical', gap: tk('space.md') },
        size: { width: { mode: 'fixed', px: COMPONENT_WIDTH } },
      },
      semantics: { tag: 'form' },
      interactions: [
        {
          trigger: 'submit',
          action: { type: 'change-to', variant: { Envoyé: 'Oui' } },
        },
      ],
    });
    const fields = [
      ['name', 'Votre prénom', 'text', 'Camille', true, false],
      ['email', 'Adresse e-mail', 'email', 'camille@example.com', true, false],
      ['off', 'Champ désactivé', 'text', 'Non disponible', false, true],
    ] as const;
    for (const [key, label, input, placeholder, required, disabled] of fields) {
      const f = b.add(id, `${id}/${key}`, 'frame', label, {
        props: {
          layout: { mode: 'vertical', gap: tk('space.sm') },
          text: { size: px(12.8) },
        },
        semantics: { tag: 'label' },
      });
      b.text(
        f,
        `${id}/${key}-label`,
        'Libellé',
        label,
        {},
        {
          semantics: { tag: 'span' },
        },
      );
      b.add(f, `${id}/${key}-input`, 'field', 'Champ', {
        field: { input, placeholder, required, disabled },
        props: inputProps,
        states: {
          disabled: { fills: [solid('color.canvas')], layer: { opacity: 0.6 } },
          invalid: { stroke: border('color.danger') },
        },
      });
    }
    const check = b.add(id, `${id}/terms`, 'frame', 'Conditions', {
      props: {
        layout: {
          mode: 'horizontal',
          gap: tk('space.sm'),
          alignCross: 'center',
        },
        text: { size: px(12.8) },
      },
      semantics: { tag: 'label' },
    });
    b.add(check, `${id}/terms-input`, 'field', 'Case', {
      field: { input: 'checkbox', required: true },
      props: {
        size: {
          width: { mode: 'fixed', px: 18 },
          height: { mode: 'fixed', px: 18 },
        },
        fills: [solid('color.brand')],
      },
    });
    b.text(
      check,
      `${id}/terms-label`,
      'Libellé',
      'J’accepte les conditions de démonstration',
      {},
      { semantics: { tag: 'span' } },
    );
    button(b, id, `${id}/submit`, 'S’inscrire', {
      semantics: { buttonType: 'submit' },
    });
    b.text(
      id,
      `${id}/status`,
      'Message',
      sent ? 'Merci ! Démonstration locale, aucune inscription réelle.' : '',
      { text: { size: px(12), color: col('color.muted') } },
      { semantics: { tag: 'p', role: 'status' } },
    );
  }
}

const TABS = [
  ['discover', 'Découvrir', 'Des idées à explorer près de chez vous.'],
  ['favorites', 'Favoris', 'Vos ateliers favoris apparaîtront ici.'],
  ['profile', 'Profil', 'Votre espace personnel de démonstration.'],
] as const;
function navigations(b: Builder, parent: string) {
  const set = b.add(parent, 'navigation-set', 'component-set', 'Navigation', {
    props: { layout: { mode: 'vertical', gap: tk('space.md') } },
  });
  for (const [active, activeName, context] of TABS) {
    const id = active === 'discover' ? 'navigation' : `navigation-${active}`;
    b.add(set, id, 'component', 'Navigation', {
      variant: { Onglet: activeName },
      props: {
        layout: { mode: 'vertical', gap: tk('space.sm') },
        size: { width: { mode: 'fixed', px: COMPONENT_WIDTH } },
      },
      semantics: { tag: 'nav', ariaLabel: 'Navigation du scénario' },
    });
    const tabs = b.add(id, `${id}/tabs`, 'frame', 'Onglets', {
      props: {
        layout: { mode: 'horizontal', wrap: true, gap: tk('space.sm') },
      },
    });
    for (const [key, name] of TABS) {
      const on = key === active;
      const tab = b.add(tabs, `${id}/${key}`, 'frame', name, {
        props: {
          layout: {
            mode: 'horizontal',
            alignCross: 'center',
            padding: pad(tk('space.sm')),
          },
          radius: radius(tk('radius.control')),
          size: { minHeight: 44 },
          text: {
            size: px(12.8),
            color: col(on ? 'color.onBrand' : 'color.muted'),
          },
          fills: on ? [solid('color.brand')] : [],
          layer: { cursor: 'pointer' },
        },
        semantics: {
          tag: 'button',
          buttonType: 'button',
          ...(on ? { ariaCurrent: 'page' as const } : {}),
        },
        interactions: [
          {
            trigger: 'click',
            action: { type: 'change-to', variant: { Onglet: name } },
          },
        ],
      });
      b.text(
        tab,
        `${id}/${key}-label`,
        'Texte',
        name,
        {},
        {
          semantics: { tag: 'span' },
        },
      );
    }
    b.text(
      id,
      `${id}/context`,
      'Contexte',
      context,
      { text: { size: px(11), color: col('color.muted') } },
      { semantics: { tag: 'p', ariaLive: 'polite' } },
    );
  }
}

function section(b: Builder, parent: string, id: string, label: string) {
  const s = b.add(parent, id, 'frame', label, {
    props: {
      layout: {
        mode: 'vertical',
        gap: tk('space.sm'),
        padding: pad(tk('space.lg')),
      },
      stroke: border(),
      radius: radius(tk('radius.control')),
    },
    semantics: { tag: 'section' },
  });
  b.text(s, `${id}.label`, 'Libellé', label, S.label, {
    semantics: { className: 'section-label' },
  });
  return s;
}

// En-tête, navigation, contenu et pied communs aux deux écrans.
function screen(b: Builder, id: string, name: string, nav: string) {
  b.add(null, `screen.${id}`, 'frame', name, {
    props: {
      layout: { mode: 'vertical' },
      fills: [solid('color.canvas')],
      size: { width: { mode: 'fill' } },
    },
  });
  const head = b.add(`screen.${id}`, `${id}.header`, 'frame', 'En-tête', {
    props: {
      layout: {
        mode: 'horizontal',
        gap: 'auto',
        alignCross: 'center',
        padding: pad(tk('space.lg')),
      },
      fills: [solid('color.surface')],
      stroke: { ...border(), weight: { top: 0, right: 0, bottom: 1, left: 0 } },
    },
    semantics: { tag: 'header' },
  });
  const logo = b.add(head, `${id}.logo`, 'frame', 'Logo', {
    props: {
      layout: { mode: 'horizontal', gap: px(2), alignCross: 'start' },
      text: { color: col('color.brand'), weight: 700 },
    },
    semantics: { tag: 'strong' },
  });
  b.text(
    logo,
    `${id}.logo-name`,
    'Nom',
    'lisière',
    {
      text: { size: px(24), letterSpacing: -1, lineHeight: { ratio: 1.5 } },
    },
    { semantics: { tag: 'span' } },
  );
  b.text(
    logo,
    `${id}.logo-mark`,
    'Marque',
    '®',
    { text: { size: px(12) } },
    {
      semantics: { tag: 'span' },
    },
  );
  const city = b.add(head, `${id}.city`, 'frame', 'Badge', {
    props: S.badge,
    semantics: { tag: 'span' },
  });
  b.text(
    city,
    `${id}.city-text`,
    'Texte',
    'Bordeaux',
    {},
    {
      semantics: { tag: 'span' },
    },
  );
  b.add(`screen.${id}`, nav, 'instance', 'Navigation', {
    componentId: 'navigation',
    props: {
      layout: { padding: pad(tk('space.md'), tk('space.lg')) },
      fills: [solid('color.surface')],
      size: { width: { mode: 'fill' } },
    },
  });
  const main = b.add(`screen.${id}`, `${id}.main`, 'frame', 'Contenu', {
    props: {
      layout: {
        mode: 'vertical',
        gap: tk('space.md'),
        padding: pad(tk('space.lg')),
      },
    },
    semantics: { tag: 'main' },
  });
  b.text(main, `${id}.kicker`, 'Surtitre', 'LE QUOTIDIEN, AUTREMENT', S.label, {
    semantics: { className: 'section-label' },
  });
  b.text(
    main,
    `${id}.title`,
    'Titre',
    'De petites idées.\nDe vrais liens.',
    {
      text: {
        size: { token: 'font.heading' },
        weight: 700,
        lineHeight: { ratio: 1.22 },
        letterSpacing: -0.7,
        color: col('color.text'),
      },
    },
    { semantics: { tag: 'h1' } },
  );
  b.text(
    main,
    `${id}.intro`,
    'Introduction',
    'Des ateliers pour apprendre, partager et se rencontrer.',
    S.small,
    { semantics: { tag: 'p' } },
  );
  return main;
}
function footer(b: Builder, id: string) {
  const f = b.add(`screen.${id}`, `${id}.footer`, 'frame', 'Pied de page', {
    props: {
      layout: {
        mode: 'vertical',
        padding: pad(tk('space.md'), tk('space.lg')),
      },
      text: { size: px(10), color: col('color.muted') },
    },
    semantics: { tag: 'footer' },
  });
  b.text(
    f,
    `${id}.footer-text`,
    'Texte',
    'lisière · Design System d’exemple fictif',
  );
}

export function seedDoc(): Doc {
  const b = new Builder();
  const page = b.add(null, 'components', 'page', 'Composants', {
    props: { layout: { mode: 'vertical', gap: tk('space.lg') } },
  });
  const actions = section(b, page, 'catalogue.actions', '01 / ACTIONS');
  b.text(
    actions,
    'catalogue.actions.title',
    'Titre',
    'Un langage commun.',
    S.h3,
    {
      semantics: { tag: 'h3' },
    },
  );
  b.text(
    actions,
    'catalogue.actions.intro',
    'Introduction',
    'Les mêmes tokens, du composant à l’écran.',
    { text: { color: col('color.muted') } },
    { semantics: { tag: 'p' } },
  );
  buttons(b, actions);
  b.text(
    actions,
    'catalogue.actions.caption',
    'Légende',
    'Survolez, utilisez Tab et activez les boutons. Focus et états natifs inclus.',
    { text: { size: px(12), color: col('color.muted') } },
    { semantics: { tag: 'p' } },
  );
  bookingCards(b, section(b, page, 'catalogue.contents', '02 / CONTENUS'));
  forms(b, section(b, page, 'catalogue.input', '03 / SAISIE'));
  navigations(b, section(b, page, 'catalogue.nav', '04 / NAVIGATION'));

  const cards = screen(b, 'cards', 'Découvrir', 'nav');
  const grid = b.add(cards, 'cards.grid', 'frame', 'Grille', {
    props: {
      layout: { mode: 'horizontal', wrap: true, gap: tk('space.md') },
      size: { width: { mode: 'fill' } },
    },
    semantics: { className: 'scenario-grid' },
  });
  const cell = { width: { mode: 'fill' as const }, minWidth: 260 };
  b.add(grid, 'cards.booking', 'instance', 'Carte réservation', {
    componentId: 'booking-card',
    props: { size: cell },
  });
  const rhythm = b.add(grid, 'cards.rhythm', 'frame', 'Carte rythme', {
    props: { ...S.card, size: cell },
    semantics: { tag: 'article' },
  });
  b.text(rhythm, 'cards.rhythm.kicker', 'Surtitre', 'À VOTRE RYTHME', S.kicker);
  b.text(
    rhythm,
    'cards.rhythm.title',
    'Titre',
    'Un quartier qui inspire.',
    S.h3,
    {
      semantics: { tag: 'h3' },
    },
  );
  b.text(
    rhythm,
    'cards.rhythm.body',
    'Texte',
    'Explorez vos prochaines rencontres.',
    S.small,
    { semantics: { tag: 'p' } },
  );
  button(
    b,
    rhythm,
    'cards.rhythm.cta',
    'Voir les ateliers',
    {
      interactions: [
        {
          trigger: 'click',
          action: { type: 'navigate', screen: 'screen.form' },
        },
      ],
    },
    'button/secondary',
  );
  footer(b, 'cards');

  const signup = screen(b, 'form', 'Inscription', 'form.nav');
  const card = b.add(signup, 'form.card', 'frame', 'Carte', {
    props: { ...S.card, layout: { ...S.card.layout, alignCross: 'stretch' } },
    semantics: { tag: 'div' },
  });
  b.text(
    card,
    'form.card.title',
    'Titre',
    'Rejoignez le mouvement.',
    {
      text: { size: px(24), weight: 700, color: col('color.text') },
    },
    { semantics: { tag: 'h2' } },
  );
  b.add(card, 'form.signup', 'instance', 'Formulaire', {
    componentId: 'form',
    props: { size: { width: { mode: 'fill' } } },
  });
  footer(b, 'form');
  return {
    version: DOC_VERSION,
    components: 'components',
    screens: ['screen.cards', 'screen.form'],
    nodes: b.nodes,
  };
}
