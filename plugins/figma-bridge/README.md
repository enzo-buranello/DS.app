# DS-Studio Bridge — plugin Figma local

Relie un fichier Figma à DS-Studio sur votre Mac. Aucun jeton Figma, aucun compte
payant : le plugin tourne dans Figma Desktop et parle uniquement à
`http://127.0.0.1:4310`. Il n'agit que lorsque vous cliquez.

## Installer (une fois)

1. Ouvrez **Figma Desktop** (le navigateur ne charge pas les plugins locaux).
2. Menu **Plugins > Development > Import plugin from manifest…**
3. Choisissez `plugins/figma-bridge/manifest.json` dans ce dépôt.
4. Lancez-le : **Plugins > Development > DS-Studio Bridge**.
5. Collez le **code d'appairage** affiché dans DS-Studio (panneau _Figma_),
   puis **Enregistrer et tester**.

## Importer depuis Figma

1. Sélectionnez éventuellement des composants (12 max) à importer en image.
2. Plugin > **Importer** : variables locales (couleur, nombre, texte), styles
   couleur, styles texte et sélection en PNG.
3. DS-Studio > Figma > **Actualiser** : vérifiez la correspondance de chaque
   élément avec un token, puis **Proposer**. Le diff habituel s'ouvre : rien
   n'est écrit avant « Valider et enregistrer ».

Limites du schéma v1 : polices limitées à system-ui, Arial, Georgia, Verdana ;
dimensions entre 0 et 128 px ; seuls les 18 tokens existants sont modifiables.

## Importer des composants depuis DS-Studio (lien direct)

Tant que le plugin est ouvert et appairé, il s'annonce à DS-Studio toutes les
secondes (« Lien direct actif ») avec le nom du fichier ouvert et ses pages.

1. DS-Studio > Paramètres > **Import Figma** : choisissez la page.
2. Cochez les composants ou component sets, puis **Importer**.
3. Chaque variante devient un composant DS-Studio rattaché à son set ; les
   couleurs, rayons, espacements et tailles de texte sont liés aux tokens quand
   la variable ou la valeur correspond. Un ré-import met à jour sans dupliquer.

Seul le fichier ouvert dans Figma Desktop est accessible : aucun jeton, aucune
liste des fichiers du compte. Une URL collée sert à vérifier la cible.

## Exporter depuis DS-Studio (lien direct, natif)

Bouton **↗ Exporter** (en-tête, et barre de la fenêtre d'aperçu) : choisissez
la page cible (par défaut celle d'Import Figma), puis :

- **Design system** : variables de la collection « DS-Studio », composants
  (bouton, carte, formulaire, navigation, composants créés) et component sets
  avec variantes, en auto-layout ; un bouton contenu dans la carte est une
  instance du variant.
- **Aperçu actuel** : l'écran à la largeur et au scénario affichés, en frames
  auto-layout ; chaque composant DS reconnu devient une instance du composant
  déjà exporté sur la page, ou d'un composant créé à cette occasion.

Chaque élément créé porte un identifiant (pluginData `dsStudioKey`) : un
ré-export met à jour les mêmes nœuds (les instances restent liées) au lieu de
dupliquer. Les variables sont relues après écriture.

## Exporter vers Figma (ancien flux, depuis le plugin)

1. DS-Studio > Figma > **Préparer l'export Figma** (choisissez les largeurs).
2. Plugin > **Prévisualiser** : liste des variables créées ou modifiées et
   des écrans.
3. **Appliquer dans Figma** : le plugin relit DS-Studio, refuse si les tokens
   ont changé depuis la prévisualisation, puis :
   - crée ou met à jour la collection de variables **DS-Studio**
     (`color/brand`, `space/md`…) ;
   - dessine les écrans sur la page **DS-Studio** en frames natives :
     auto-layout pour les conteneurs flex, couleurs, rayons, espacements et
     tailles de texte liés aux variables quand la valeur correspond ;
   - remplace un écran du même nom au lieu de le dupliquer ;
   - relit les variables et signale tout écart.

Les polices système (`system-ui`) sont dessinées en **Inter**. Les formes
complexes (ombres, dégradés, icônes SVG) ne sont pas reproduites.
