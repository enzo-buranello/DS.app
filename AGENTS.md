# Studio — guide des agents

Lire `workspace/PROJECT.md` (contexte), `workspace/DESIGN_RULES.md` (règles de
conception) et `workspace/DECISIONS.md` (choix et limites) avant de modifier.

## Démarrer

Dépôt : <https://github.com/enzo-buranello/DS.app>

Installer sur une nouvelle machine (macOS, Windows, Linux) :

```bash
git clone https://github.com/enzo-buranello/DS.app.git
cd DS.app
node -v                 # 22.12 ou plus ; sinon npm start s'arrête
npm ci                  # télécharge Electron (~100 Mo)
npm start
```

Si `node -v` est inférieur à 22.12 : `nvm install 22 && nvm use 22`, ou
`brew install node@22`. Aucun `.env`, aucune clé, aucun réglage au build :
le compte LLM se saisit au premier lancement.

Raccourcis : `npm run dev` recharge l'interface ; `npm run build` compile
dans `dist/` ; `npm run app` installe l'app Mac dans `~/Applications` (macOS
seulement, après un build).

L'app installée charge `dist/main.js` : après un nettoyage ou une suppression
de `dist/`, lancer `npm run build` avant de l'ouvrir. Après un changement de
code, quitter complètement l'app (Cmd+Q) : macOS réactive sinon l'ancienne
fenêtre.

Premier lancement : l'écran « Connexion » demande un compte. Soit une clé
API (Claude, ChatGPT, DeepSeek, Mistral, OpenRouter), soit « Se connecter »
avec Claude : la page s'ouvre dans le navigateur, on colle le code affiché
dans le champ « Code ». Le jeton va dans le trousseau du système.

Pour les tests et les captures, `STUDIO_FAKE_AUTH=in` saute l'écran (jamais
en usage réel) ; les specs e2e le posent déjà.

## Carte du code

| Dossier       | Rôle                                                                                                                                                                                               |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/main/`   | Processus Electron : fenêtre, dossiers, lecture/écriture, historique, compte LLM et coffre, agents (Design, Développement, transversal), fournisseurs compatibles OpenAI, Figma, clés du trousseau |
| `app/shared/` | Schéma Zod du projet, contrat interface ↔ processus principal, compte et fournisseurs, logique pure (nœuds, instances, contenus, empreintes, renommage, dossiers)                                  |
| `app/ui/`     | Interface React : connexion, modules Design system, Pages, Contenus, Code, inspecteur, barre IA, historique                                                                                        |
| `tests/`      | Unitaires (`node:test`) et e2e Playwright Electron ; `tests/live/` = vrais appels Claude, hors CI                                                                                                  |
| `scripts/`    | `run.mjs` (start/dev/build), `install-app.mjs` (app Mac)                                                                                                                                           |
| `workspace/`  | Contexte, décisions, règles ; `workspace/archives/` = anciennes données V1, ignorées par git                                                                                                       |

Entrées : `app/main/main.ts` (processus principal), `app/main/preload.ts`
(pont), `app/ui/App.tsx` (coquille et modules), `app/shared/project.ts`
(schéma).

## Règles non négociables

1. `<dossier>/.studio/project.json` est la seule source de vérité. Son schéma
   est `app/shared/project.ts`. Les styles ne contiennent que des identifiants
   de tokens, jamais de valeurs.
2. L'interface ne lit que les tokens `--ui-*` de `app/ui/styles.css`.
3. Libellés de 1 à 3 mots, aucun texte d'aide, aucun jargon, une seule façon
   de faire chaque chose. Interface en français.
4. Une modification de l'IA s'applique sur le canevas puis se valide par
   « Garder » ou « Annuler » ; l'historique permet toujours de revenir. Seule
   l'app écrit le projet, après validation du schéma et des références.
5. Valider toute entrée au boundary (Zod). Aucun secret dans le projet : les
   clés vont dans le trousseau du système.
6. Ne rien publier, pousser ou déployer sans demande explicite. Ne pas
   supprimer l'historique ni les décisions.

## Vérifier

```bash
npm run check && npm test && npm run test:e2e
```

Les tests live (`tests/live/`) appellent réellement Claude et consomment du
quota : `npx playwright test -c tests/live/playwright.config.ts`.

## Où changer quoi

- **Champ de style** : `styleSchema` et `styleKinds` dans
  `app/shared/project.ts`, puis l'inspecteur (`app/ui/Editor.tsx`), le rendu
  (`app/ui/render.tsx`) et les tests.
- **Nouveau module** : entrée dans `modules` (`app/ui/App.tsx`), composant
  dédié, panneaux gauche/droite et barre IA.
- **Nouvelle cible de code** : `targets` dans `app/shared/project.ts`,
  `app/main/generate.ts`, `app/main/guard.ts` et `app/ui/Code.tsx`.
- **Nouvel outil de l'agent** : outil dans `app/main/orchestrator.ts` (schéma
  Zod), câblage dans `app/main/main.ts`, test dans
  `tests/orchestrator.test.ts`.
- **Nouvel appel interface ↔ processus** : `app/shared/api.ts`,
  `app/main/preload.ts`, `ipcMain.handle` dans `app/main/main.ts`, puis l'UI.
- **Nouveau type de contenu** : `app/shared/content.ts`,
  `app/shared/project.ts` (`fieldTypes`), `app/ui/Content.tsx` et le rendu.
- **Nouveau fournisseur LLM** : `app/shared/account.ts` (table), validation
  dans `app/main/account.ts`, et `app/main/compat.ts` pour un protocole
  compatible OpenAI. Claude reste le seul chemin avec outils et Figma.

## Conventions

- Code et commentaires en français, phrases courtes, pas de commentaire qui
  répète le code. Un commentaire explique seulement le pourquoi.
- Logique pure dans `app/shared/`, effets et accès disque dans `app/main/`.
- Toute logique non triviale laisse un test unitaire ; tout parcours visible
  laisse un test e2e.
- Pas de nouvelle dépendance sans nécessité démontrée.
- Pas de refactor massif ni de renommage global sans demande.

## Ne pas faire

- Écrire une valeur en dur dans le chrome de l'interface.
- Mettre une clé, un jeton ou un secret dans `project.json`, l'historique, un
  journal, une URL ou le DOM.
- Ajouter un texte d'aide, une infobulle explicative ou un second chemin pour
  la même action.
- Laisser une écriture de l'IA sans relecture Garder / Annuler.
- Modifier `workspace/archives/` : c'est une archive locale, pas du code.
