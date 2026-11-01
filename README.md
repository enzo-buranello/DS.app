# Studio

Concevoir un design system, des pages et des contenus, puis générer le code
de l'application dans un dossier local. Mac, Windows et Linux.

Dépôt : <https://github.com/enzo-buranello/DS.app>

## Installer sur une autre machine

Prérequis : **Node.js 22.12 ou plus récent** et `git`. Le premier
`npm install` télécharge Electron (environ 100 Mo).

```bash
git clone https://github.com/enzo-buranello/DS.app.git
cd DS.app
node -v      # doit afficher v22.12.0 ou plus
npm ci       # ou npm install
git config core.hooksPath .githooks   # garde-fou anti-secrets
npm start
```

Si `node -v` affiche 20 ou moins :

```bash
nvm install 22 && nvm use 22          # nvm
brew install node@22                  # macOS, Homebrew
```

Aucun `.env`, aucune clé, aucun réglage au build. Au premier lancement,
Studio demande un compte LLM : une clé API (Claude, ChatGPT, DeepSeek,
Mistral ou OpenRouter) ou Claude dans le navigateur. Le compte est gardé
chiffré dans le trousseau du système, hors du projet.

Le dépôt ne contient ni compte, ni clé, ni projet : chaque personne branche
le sien. Si la machine a déjà une session Claude Code connectée, Studio la
réutilise — c'est le compte de cette personne, pas celui du dépôt.

### App du Finder (macOS)

```bash
npm run build
npm run app     # une seule fois : installe ~/Applications/Studio.app
```

Ensuite, `npm run build` suffit après une modification. L'app installée lit
`dist/` : si `npm run build` n'a jamais tourné, elle ne s'ouvre pas.
Windows et Linux : `npm start`.

### Si ça ne démarre pas

| Symptôme | Cause | Solution |
| --- | --- | --- |
| « Studio demande Node 22.12… » | Node trop ancien | `nvm install 22 && nvm use 22` |
| Fenêtre blanche, ou app du Finder qui ne s'ouvre pas | `dist/` absent | `npm run build` |
| Écran « Connexion » | Aucun compte LLM | Coller une clé, ou « Se connecter » avec Claude |
| macOS redemande le trousseau | App réinstallée, signature changée | Autoriser l'accès |
| `npm run app` refuse | Réservé à macOS | Utiliser `npm start` |

Après un changement de code, quitter complètement l'app (Cmd+Q) avant de la
rouvrir : macOS réactive sinon l'ancienne fenêtre.

## Projet

Chaque projet vit dans un dossier choisi par le designer. Tout le projet est
dans `<dossier>/.studio/project.json` : c'est la seule source de vérité, le
code est généré à partir de lui. Transmettre le dossier suffit pour reprendre
le projet sur une autre machine (bouton « Ouvrir » de l'accueil).

## Modules

1. **Design system** : fondations (couleurs claires et sombres, typographies,
   espacements, arrondis, ombres) et composants avec leurs états ; création
   par l'IA, à la main, ou import Figma.
2. **Pages** : pages en flux ou en cadre libre, formats bureau / tablette /
   mobile.
3. **Contenus** : collections simples, affichées par des listes.
4. **Code** : une cible à la fois — React + Tailwind, Next.js, HTML/CSS ou
   SwiftUI — générée dans `<dossier>/code/<cible>`. Seul ce qui a changé est
   régénéré.

## IA

Au lancement, Studio demande un compte : une clé API (Claude, ChatGPT,
DeepSeek, Mistral ou OpenRouter), ou Claude dans le navigateur par Claude Code.
Chaque appel part du poste et consomme le quota de l'utilisateur. Le compte est
global, hors projet ; les clés sont chiffrées par le trousseau du système.

Claude garde l'agent complet (questions, avis, étapes, import Figma). Les
autres fournisseurs font le design system et le code, sans ces options.

Sur l'accueil, « Que voulez-vous créer ? » crée un projet complet ; le
dossier de travail n'est demandé qu'à la première génération du code. Dans
le projet, la barre du bas agit sur tout le projet (design system, pages,
contenus et code) ou, avec un élément sélectionné, sur lui seul. L'IA peut
poser un QCM avant d'agir, montre ses étapes, puis donne un avis.
Paramètres : questions et avis désactivables, compte et clés d'API du code
généré (gardées dans le trousseau du système).

## Code source

- `app/main/` : processus Electron (fenêtre, dossiers, lecture et écriture,
  historique, compte LLM et coffre, agents Design, Développement et
  transversal, fournisseurs compatibles OpenAI, import Figma, clés d'API).
- `app/shared/` : schéma du projet, contrat entre interface et processus,
  compte et fournisseurs.
- `app/ui/` : interface React.
- `tests/` : tests unitaires et e2e ; `tests/live/` appelle réellement Claude,
  hors CI.
- `workspace/` : contexte (`PROJECT.md`), décisions et règles de conception.
- `scripts/run.mjs` : `start`, `dev` et `build` ; `scripts/install-app.mjs` :
  app Mac.

## Pour un agent IA

Lire `AGENTS.md` (carte du code, commandes, règles) et `workspace/PROJECT.md`
(contexte produit) avant de modifier. Vérifier avec :

```bash
npm run check && npm test && npm run test:e2e
```

`npm run test:e2e` construit `dist/` puis lance Playwright. Les specs posent
`STUDIO_FAKE_AUTH` : aucun compte réel n'est nécessaire. Ne jamais committer
`node_modules/`, `dist/`, un jeton ou une clé.
