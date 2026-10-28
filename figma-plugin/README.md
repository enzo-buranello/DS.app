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
  typo), styles de texte et d'effets ;
- composants et component sets avec variantes ; chaque état (survol, appuyé,
  focus, désactivé, invalide) devient une variante « Interaction=… » ;
  propriétés de composant (texte, booléen, échange d'instance) liées à leurs
  calques ;
- propriétés natives lues dans le document de nœuds (format d'export v2) :
  fonds empilés (couleur, dégradé, image), contours (par côté, alignement,
  tirets), effets (ombres, flous), auto layout (retour à la ligne, inversion
  de l'empilement), tailles hug/fill/fixe et limites, position absolue et
  contraintes, rotation, opacité, fusion, rognage, lissage des coins,
  typographie complète ; liaisons aux variables (fonds, contours, ombres,
  rayons, gap, padding, taille et police) ;
- planches Couleurs, Typographie, Espacements et Composants ; l'aperçu en frames
  auto layout avec des instances (overrides et valeurs de propriétés).

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
