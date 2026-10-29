# DS-Studio

Concevoir un design system, des pages et des contenus, puis générer le code
de l'application dans un dossier local. Mac, Windows et Linux.

## Lancer

Prérequis : [Node.js 22](https://nodejs.org) (LTS).

```bash
npm install
npm start
```

`npm run dev` recharge l'interface à chaque modification.

Sur Mac, `npm run build && npm run app` installe `DS-Studio.app` dans
`~/Applications`, une seule fois : elle se lance depuis le Finder ou le Dock,
sans terminal, sur le dernier build. Après une modification, `npm run build`
suffit.

## Projet

Chaque projet vit dans un dossier choisi par le designer. Tout le projet est
dans `<dossier>/.studio/project.json` : c'est la seule source de vérité, le
code est généré à partir de lui. Transmettre le dossier suffit pour reprendre
le projet sur une autre machine (bouton « Ouvrir » de l'accueil).

## Modules

1. **Design system** : fondations (couleurs claires et sombres, typographies,
   espacements, arrondis, ombres) et composants avec leurs états ; création
   par l'IA, à la main, ou import Figma.
2. **Pages** : pages libres ou en flux, formats bureau / tablette / mobile.
3. **Contenus** : collections simples, affichées par des listes.
4. **Code** : React + Tailwind, Next.js, HTML/CSS ou SwiftUI, générés dans
   `<dossier>/code/<cible>`. Seul ce qui a changé est régénéré.

## IA

L'IA utilise la connexion Claude Code de la machine : installer
[Claude Code](https://claude.com/claude-code) et s'y connecter une fois.

## Code source

- `app/main/` : processus Electron (fenêtre, dossiers, lecture et écriture,
  historique, agents Design et Développement, import Figma).
- `app/shared/` : schéma du projet et contrat entre interface et processus.
- `app/ui/` : interface React.
- `scripts/run.mjs` : `start`, `dev` et `build`.

## Vérifier

```bash
npm run check && npm test && npm run test:e2e
```
