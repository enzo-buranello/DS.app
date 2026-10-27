# Figma — pont local

DS-Studio communique avec **Figma Desktop** sur la même machine, sans compte ni
API distante :

```
App (navigateur) ──HTTP──▶ serveur DS-Studio ──WebSocket 127.0.0.1:3055──▶ plugin (ui.html) ──▶ code.js (API Figma)
```

- Serveur : `app/server/figmaBridge.ts` (WebSocket minimal sans dépendance).
  Écoute uniquement sur 127.0.0.1 ; accepte l'origine « null » (iframe de plugin)
  et refuse toute page web ; un seul plugin à la fois (une reconnexion remplace
  la précédente) ; délai de 10 s par commande. Port : `FIGMA_BRIDGE_PORT`
  (3055 par défaut). Un port occupé n'empêche pas l'app de démarrer.
- Protocole : `app/shared/figmaProtocol.ts` (commandes et paramètres validés).
- Client unique côté app : `app/client/figma.ts` (`useFigmaStatus`, `runFigma`),
  réutilisable par le bouton Exporter.
- Interface : indicateur « Figma : déconnecté / en attente du plugin / connecté ·
  fichier » dans la barre principale ; un clic ouvre le panneau de test des
  commandes avec le résultat JSON. Le bouton Exporter envoie le Design system ou
  l'aperçu, avec progression et annulation.
- Export : `app/shared/figmaExport.ts` (schéma du payload, partagé avec le
  plugin), `app/client/figmaSerialize.ts` (rendu réel → nœuds, valeurs liées
  aux tokens), tâche suivie et annulable côté serveur (`/api/figma/export`).
- Plugin : [figma-plugin/README.md](../figma-plugin/README.md).

## État

**IMPLEMENTED, TESTED** avec un plugin simulé (même protocole) : `npm test`,
`npm run test:e2e`. **Non vérifié** dans Figma Desktop tant que la procédure du
plugin n'a pas été suivie. Commandes de base vérifiées dans Figma Desktop ;
export vérifié en partie seulement (voir l'historique de la PR).
