# DS-Studio Bridge — plugin Figma local

Écrit dans Figma ce que DS-Studio exporte. Le plugin tourne dans Figma Desktop et
parle uniquement à `http://127.0.0.1:4310`. Il n'écrit que lorsque vous cliquez
« Exporter » dans DS-Studio. La connexion à votre compte Figma (OAuth) et le choix
du fichier se font dans DS-Studio : voir [docs/FIGMA.md](../../docs/FIGMA.md).

## Installer (une fois)

1. Ouvrez **Figma Desktop** (le navigateur ne charge pas les plugins locaux).
2. Menu **Plugins > Development > Import plugin from manifest…**
3. Choisissez `plugins/figma-bridge/manifest.json` dans ce dépôt.

## Utiliser

1. Ouvrez dans Figma Desktop le fichier choisi dans DS-Studio.
2. Lancez **Plugins > Development > DS-Studio Bridge**.
3. Collez le **code d'appairage** affiché dans le menu Exporter de DS-Studio, puis
   **Enregistrer et tester**. Le plugin affiche « Lien direct actif ».
4. Laissez-le ouvert et exportez depuis DS-Studio.

## Ce que le plugin écrit

- Collection de variables **DS-Studio** (`color/brand`, `space/md`…), relue après
  écriture.
- Composants et component sets avec variantes, en auto layout ; écrans en frames
  auto layout avec instances des composants.
- Chaque nœud créé porte `pluginData` `dsStudioKey` ; DS-Studio conserve aussi son
  id. Un ré-export met à jour les mêmes nœuds au lieu de dupliquer.

Les polices système (`system-ui`) sont dessinées en **Inter**. Ombres, dégradés et
icônes SVG du catalogue ne sont pas reproduits.
