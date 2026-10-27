# DS-Studio Bridge — plugin Figma de développement

Relie Figma Desktop à DS-Studio sur cet ordinateur, par WebSocket local
(`ws://localhost:3055`). Aucun compte, aucun jeton, aucun accès Internet.

## Installer (une fois)

1. Lancez DS-Studio (`npm start`) : le pont écoute sur 127.0.0.1:3055.
2. Ouvrez un fichier dans **Figma Desktop** (le navigateur ne charge pas les plugins locaux).
3. **Plugins › Development › Import plugin from manifest…** › `figma-plugin/manifest.json`.
4. **Plugins › Development › DS-Studio Bridge** : le plugin affiche « Connecté à DS-Studio ».
5. Dans DS-Studio, l'indicateur passe à « Figma : connecté · nom du fichier ».

## Exporter depuis DS-Studio

Bouton **↗ Exporter** (barre principale ou barre d'aperçu) : choisissez
« Design system » ou « Aperçu actuel », puis la page cible (courante, existante
ou nouvelle). Le plugin écrit des éléments Figma natifs :

- variables de la collection « DS-Studio » (couleurs, espacements, rayons,
  typo), styles de texte et d'ombre ;
- composants et component sets avec variantes, en auto layout, propriétés liées
  aux variables (fond, rayon, gap, padding, taille de texte) ;
- planches Couleurs, Typographie, Espacements et Composants ; l'aperçu en frames
  auto layout avec des instances des composants.

Chaque élément porte `pluginData` `dsStudioId` : un ré-export met à jour sur
place et ne crée que le manquant. Un élément qui n'existe plus dans l'app est
signalé dans le rapport, jamais supprimé.

## Modifier le plugin

Le code est en TypeScript dans `src/` et partage le schéma d'export avec l'app
(`app/shared/figmaExport.ts`). `npm run build:plugin` (inclus dans
`npm run build`) produit `code.js`, à garder versionné.

## Fonctionnement

- `ui.html` ouvre le WebSocket, relaie les commandes vers `code.js` et renvoie les
  réponses ; il se reconnecte seul si DS-Studio redémarre.
- `code.js` exécute les commandes avec l'API Plugin : `ping`, `get_document_info`,
  `get_selection`, `get_node`, `create_frame`, `set_text`, `delete_node`, et
  l'export (`export_chunk`, `export_design_system`, `export_preview`, `cancel`).
- Protocole : `{ id, command, params }` → `{ id, ok, result | error }`, plus
  `{ id, progress }` pendant un export ; délai côté app : 10 s (120 s pour un
  export, envoyé par lots de 256 Ko, annulable).

Le port 3055 est fixé par `manifest.json` (`devAllowedDomains`) et `ui.html`. Pour
un autre port : changez-le dans ces deux fichiers et lancez DS-Studio avec
`FIGMA_BRIDGE_PORT`.
