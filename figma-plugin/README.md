# DS-Studio Bridge — plugin Figma de développement

Relie Figma Desktop à DS-Studio sur cet ordinateur, par WebSocket local
(`ws://localhost:3055`). Aucun compte, aucun jeton, aucun accès Internet.

## Installer (une fois)

1. Lancez DS-Studio (`npm start`) : le pont écoute sur 127.0.0.1:3055.
2. Ouvrez un fichier dans **Figma Desktop** (le navigateur ne charge pas les plugins locaux).
3. **Plugins › Development › Import plugin from manifest…** › `figma-plugin/manifest.json`.
4. **Plugins › Development › DS-Studio Bridge** : le plugin affiche « Connecté à DS-Studio ».
5. Dans DS-Studio, l'indicateur passe à « Figma : connecté · nom du fichier ».

## Fonctionnement

- `ui.html` ouvre le WebSocket, relaie les commandes vers `code.js` et renvoie les
  réponses ; il se reconnecte seul si DS-Studio redémarre.
- `code.js` exécute les commandes avec l'API Plugin : `ping`, `get_document_info`,
  `get_selection`, `get_node`, `create_frame`, `set_text`, `delete_node`.
- Protocole : `{ id, command, params }` → `{ id, ok, result | error }` ; délai côté
  app : 10 s.

Le port 3055 est fixé par `manifest.json` (`devAllowedDomains`) et `ui.html`. Pour
un autre port : changez-le dans ces deux fichiers et lancez DS-Studio avec
`FIGMA_BRIDGE_PORT`.
