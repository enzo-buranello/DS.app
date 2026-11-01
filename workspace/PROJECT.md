# Studio — contexte du projet

## Le produit

Studio est un CMS de conception : on part d'un design system, on compose
des pages, on remplit des contenus, puis on génère le code d'une application.
Application de bureau Electron (Mac, Windows, Linux), React 19 et TypeScript.

Public : un designer non technique. L'interface évite le jargon, montre peu de
choses à la fois, et l'IA fait le travail technique.

Statut : projet personnel, en démonstration. Ce n'est plus un sujet de PFE.

## Périmètre

- Interface seulement : pas de backend, pas de base distante, pas de
  déploiement. L'accès à l'IA passe par un compte LLM global, une clé ou
  Claude dans le navigateur.
- Un projet = un dossier local ; tout tient dans `<dossier>/.studio/project.json`.
- L'IA utilise le compte de l'utilisateur : Claude par la session Claude Code
  ou une clé ; ChatGPT, DeepSeek, Mistral et OpenRouter par une clé. Chaque
  appel part du poste et consomme son quota.
- Le code généré va dans `<dossier>/code/<cible>`.

## Décisions produit en vigueur

- `project.json` est la seule source de vérité ; les styles ne contiennent que
  des identifiants de tokens.
- Pages en flux ou en cadre libre, avec des réglages par format bureau,
  tablette et mobile.
- Une seule cible de code active à la fois ; le choix reste ouvert.
- L'IA a deux portées : tout le projet (agent transversal à outils) ou
  l'élément sélectionné (agent Design). Ses changements s'appliquent sur le
  canevas puis se gardent ou s'annulent ; l'historique permet toujours de
  revenir.
- Import Figma par lien, via le serveur MCP officiel de Figma.

## Ce qui compte dans une modification

- Des libellés de 1 à 3 mots, aucun texte d'aide, une seule façon de faire
  chaque chose.
- Des couleurs neutres, des tokens `--ui-*` pour tout le chrome.
- Un focus clavier visible et des contrastes lisibles.
- Ne rien publier, pousser ou déployer sans demande explicite.

## Lire ensuite

`README.md` pour lancer, `AGENTS.md` pour travailler dans le code,
`workspace/DECISIONS.md` pour l'historique des choix et les limites connues,
`workspace/DESIGN_RULES.md` pour les règles de conception.
