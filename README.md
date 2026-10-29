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

## Projet

Chaque projet vit dans un dossier choisi par le designer. Tout le projet est
dans `<dossier>/.studio/project.json` : c'est la seule source de vérité, le
code est généré à partir de lui. Transmettre le dossier suffit pour reprendre
le projet sur une autre machine (bouton « Ouvrir » de l'accueil).

## Code source

- `app/main/` : processus Electron (fenêtre, dossiers, lecture et écriture).
- `app/shared/` : schéma du projet et contrat entre interface et processus.
- `app/ui/` : interface React.
- `scripts/run.mjs` : `start`, `dev` et `build`.

## Vérifier

```bash
npm run check && npm test && npm run test:e2e
```
