# DS-Studio — instructions communes

Lire README.md, puis workspace/PFE.md, DESIGN_RULES.md et DECISIONS.md.

- `.studio/project.json` est la seule source de vérité d'un projet. Son schéma
  est dans `app/shared/project.ts` : les styles ne contiennent que des
  identifiants de tokens, jamais de valeur.
- L'interface ne lit que les tokens `--ui-*` de `app/ui/styles.css`.
- Labels de 1 à 3 mots, aucun texte d'aide, aucun jargon. Une seule façon de
  faire chaque chose.
- Les modifications de l'IA s'appliquent sur le canevas puis se valident par
  « Garder » ou « Annuler » ; l'historique permet toujours de revenir.
- Vérifier : `npm run check`, `npm test`, `npm run test:e2e`.
- Ne rien publier, pousser ou déployer sans demande explicite.
