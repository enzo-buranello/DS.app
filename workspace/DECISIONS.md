# Journal de décisions du projet

## V1 — Starter

React permet d’employer exactement les mêmes composants dans le catalogue et
le viewport isolé. Le backend HTTP Node utilise la bibliothèque standard ; Zod
valide les entrées et les fichiers. Vite compile le frontend. Pas d’Electron,
base distante, Figma ou LLM obligatoire.

Codex propose du JSON sans outils ; le contrôleur est l’unique auteur des changements
locaux validés. Claude et Gemini ne sont pas activés sans qualification.

## 2026-10-28 — Modes Édition / Test et écriture directe

Problème : modifier un élément demandait de passer par le diff et un bouton
« Valider et enregistrer », ce qui casse le geste « je clique, je règle ».

Options explorées : garder le diff pour tout ; panneau direct mais diff pour le
LLM ; écriture directe partout.

Décision : écriture directe partout (panneau contextuel, édition du texte,
« Appliquer au composant », prompt sur la sélection ou global). Chaque écriture
reste journalisée (révision de tokens avec sa source, `edits.json` pour les
maîtres et overrides) et Cmd+Z / Cmd+Maj+Z annulent les gestes de la session.
Cela remplace, pour ces gestes, la règle « diff avant acceptation ». Le
formulaire Tokens d'« Autres réglages » et l'annulation par l'historique gardent
leur diff. Le contrôleur reste seul auteur des écritures : avec un élément
sélectionné, il recalcule le périmètre et refuse une réponse du LLM qui
toucherait autre chose.

Preuves : tests `edits.test.ts`, `figma-export.test.ts` (override d'instance) et
e2e « mode Édition ». Parcours fait à la main sur 127.0.0.1:4310 avec Claude.

Limite connue : la pile Cmd+Z vit dans l'onglet et se perd au rechargement ;
l'historique des tokens reste, celui de `edits.json` n'a pas de journal.

## 2026-10-28 — Document de nœuds (phase A de l'inspecteur « à la Figma »)

Problème : l'édition passait par sept champs choisis au cas par cas
(`editableFields`), posés en style inline sur des composants React codés en
dur. On ne pouvait que surcharger l'existant, et le fond inline masquait le
hover du bouton.

Options explorées : étendre la liste de champs ; garder les composants React
et générer seulement leurs styles ; décrire tout le DS en nœuds génériques.

Décision : un document de nœuds (`app/shared/doc.ts`, Zod, stockage à plat
id → nœud) avec propriétés groupées comme le panneau Design de Figma (calque,
position, dimensions, auto-layout, rayons, fonds, contour, effets, typo),
états (hover, pressed, focus, disabled, invalid), composants, component sets,
instances (variante, propriétés, overrides par chemin) et interactions de
prototype (naviguer, changer de variante). Une seule traduction nœud → CSS
(`nodeCss.ts`), rendue en feuille de style par nœud : les états sont des
règles distinctes, le hover n'est plus masqué. Le catalogue et les deux
écrans sont un document de départ (`seedDoc.ts`) ; la réservation, les
onglets et le formulaire sont des composants interactifs. Écriture par
geste en nœuds entiers (`/api/doc/ops`), refusée (409) si un nœud a changé
entre-temps. La pile Cmd+Z est enregistrée dans `history.json` : elle survit
au rechargement (limite de l'entrée précédente levée). « Appliquer au
composant » reporte style, états, texte et lien ; seuls la variante choisie,
la taille et la position restent propres à l'instance.

Migration : au premier lancement, `edits.json` est rejoué sur le document de
départ. Un texte identique à celui affiché n'est pas migré. `edits.json` et
`components.json` ne sont ni modifiés ni supprimés.

Preuves : `tests/nodes.test.ts` (CSS par propriété, instances, variantes,
cohérence de l'arbre), `tests/edits.test.ts` (migration, conflit, historique,
agent), e2e « mode Édition » (hover après override, Cmd+Z après rechargement).

Limites connues : les tailles dérivées (corps × 0,875…) n'ont pas de token et
deviennent des valeurs libres signalées ; l'agrandissement du titre au-delà de
700 px est perdu (pas de points de rupture) ; la rotation CSS ne change pas
l'encombrement dans l'auto-layout ; le lissage des coins est stocké sans rendu
CSS. Les composants créés restent dans `components.json` jusqu'à la phase B.

## 2026-10-28 — Inspecteur complet (phase B)

Problème : le panneau ne proposait que sept champs, et les composants créés
avaient leur propre éditeur et leur propre fichier.

Décision : un inspecteur générique (`app/client/inspector/`) dont les
sections dépendent du type de nœud : calque, instance (variante,
propriétés, overrides), composant, contenu, champ, position, dimensions,
auto-layout, rayons, fonds empilés (couleur, dégradés, image), contour,
effets empilés, typographie, interaction, élément HTML. Chaque champ lié à
un token propose « Détacher » et signale une valeur libre ; les nombres
acceptent flèches (Maj ×10), glisser sur le libellé et expressions (`16*2`,
analyseur sans `eval`). Un sélecteur d'état (survol, appuyé, focus,
désactivé, invalide) dirige les réglages vers cet état et le montre sur le
canevas. Sur une instance, une pastille marque chaque valeur locale et la
ramène à celle du composant. L'écriture passe par `shared/edit.ts` (nœud ou
override) et reste groupée par geste. Les composants créés et ceux importés
d'une image deviennent des nœuds de la section « Mes composants » ;
`components.json` est importé une fois et n'est plus écrit. Les images de
fond sont stockées dans `.ds-studio/assets/`, nommées par empreinte, et leur
format est vérifié.

Preuves : `tests/inspector.test.ts`, `tests/edits.test.ts` (import des
composants, images), e2e « créer un composant » (chaque section),
« inspecteur sur une instance », « importer une image ».

Limites connues : pas encore de multi-sélection (« Mixte », phase D) ;
l'opacité d'une image de fond et le lissage des coins ne sont pas rendus en
CSS ; un contour par côté centré ou extérieur est approché.

## 2026-10-28 — Calques et structure (phase C)

Problème : on pouvait régler chaque élément mais pas construire : ni
ajouter, ni déplacer, ni créer de composant ou d'écran.

Décision : un panneau Calques en mode Édition (arbre de la page ou de
l'écran courant, synchronisé avec le canevas ; renommer, masquer,
verrouiller, glisser-déposer pour réordonner ou imbriquer) et des opérations
pures (`shared/docOps.ts`) : insérer cadre, texte, rectangle, image ou
instance (F, T, R), supprimer, dupliquer (Cmd+D), copier/coller (Cmd+C/V,
presse-papiers interne), grouper (Cmd+G), auto-layout (Maj+A). « Créer un
composant » (Cmd+Alt+K) range le maître dans « Mes composants » et laisse
une instance à sa place, comme Figma. Variantes (le component set se crée
au besoin), propriétés de composant liées à un calque (texte, visibilité,
échange d'instance), détacher une instance (les instances imbriquées
restent des instances). Écrans : créer, renommer, dupliquer, supprimer ; la
liste des écrans fait partie du geste annulable et un lien vers un écran
supprimé est retiré. Un composant encore utilisé ne peut pas être supprimé.

Preuves : `tests/structure.test.ts` (chaque opération, document toujours
valide), e2e « calques et structure ».

Limites connues : une seule sélection à la fois (multi-sélection en
phase D) ; renommer une valeur de variante ne met pas à jour les instances
qui la visaient ; le presse-papiers reste interne à l'onglet.

## 2026-10-28 — Manipulations du canevas (phase D)

Problème : le canevas ne servait qu'à sélectionner un calque à la fois ;
taille, position et ordre se réglaient seulement au clavier dans le panneau.

Décision : la couche de sélection (toujours sans injection dans le DOM des
composants, canevas `inert`) gère aussi les gestes, comme Figma.
Multi-sélection par Maj+clic (canevas et Calques) et par rectangle tracé
depuis un calque non sélectionné (parmi les calques de son niveau) ;
l'inspecteur montre alors les réglages communs (calque, position,
dimensions, espacement, rayon, fond, typographie), « Mixte » quand les
valeurs diffèrent, et écrit sur tous en un geste. Les commandes de
structure (dupliquer, supprimer, grouper, composant…) portent sur toute la
sélection. Poignées de redimensionnement (Maj ou « verrouiller le ratio »
gardent les proportions ; l'axe touché passe en taille fixe ; un texte
passe en hauteur auto). Glisser un calque absolu le déplace selon ses
contraintes (Maj : un axe ; flèches : 1 px, Maj 10 px) ; glisser un enfant
d'auto-layout le réordonne avec un trait d'insertion. Alt montre les
distances entre la sélection et le calque survolé (ou son parent) ; le
survol d'un auto-layout sélectionné montre ses marges et écarts. La
géométrie est dans `shared/canvas.ts` (pure, testée) ; chaque geste est une
seule entrée Cmd+Z. Un geste qui revient à sa valeur de départ n'écrit plus
rien (une entrée d'annulation vide masquait la vraie).

Preuves : `tests/canvas.test.ts`, e2e « canevas ».

Limites connues : pas de magnétisme (snapping) ni de repères d'alignement
pendant le déplacement ; les poignées n'apparaissent pas en
multi-sélection ; la poignée gauche d'un calque ancré à droite ou centré ne
déplace pas son origine ; la recherche du calque sous le pointeur parcourt
encore tous les calques (sans index), suffisant pour la taille actuelle du
document.

## 2026-10-28 — Agent et export Figma sur le modèle de nœuds (phase E)

Problème : l'agent ne connaissait que sept champs historiques, et l'export
Figma relisait le DOM (`getComputedStyle`) en devinant les tokens par
valeur ; ni l'un ni l'autre ne voyait le document de nœuds.

Décision — agent : avec un élément sélectionné, le contrôleur transmet son
périmètre (l'élément et ses descendants rendus, 60 nœuds au plus) et
accepte des patchs `nodes: [{ key, props, states, characters }]`, validés
par les schémas Zod du document (`shared/agentPatch.ts`). Une clé hors du
périmètre, une valeur invalide, un texte sur un calque qui n'en est pas un
ou un patch de nœud sans sélection : 422, rien n'est écrit. Les patchs d'une
même instance deviennent ses overrides, en une écriture annulable. L'ancien
`patch` par champs reste accepté.

Décision — export : format v2 (`EXPORT_VERSION = 2`), construit depuis le
document (`shared/figmaScene.ts`, pur et testé) ; le rendu ne sert plus qu'à
mesurer positions et tailles. Fonds empilés (couleur, dégradés, image
envoyée en base64), contours par côté avec alignement et tirets, effets
(ombres, flous) et styles d'effet, auto layout avec retour à la ligne et
inversion de l'empilement, hug/fill/fixe et limites, position absolue et
contraintes, rotation, opacité, fusion, rognage, lissage, typographie
complète (casse, décoration, troncature, lignes max, interlignage en % ou
px). Les tokens sont liés exactement (`setBoundVariable`,
`setBoundVariableForPaint`, `setBoundVariableForEffect`). Propriétés de
composant (texte, booléen, échange) créées sur le set et liées aux calques ;
une instance reçoit ses valeurs par `setProperties`. Chaque état devient
une variante « Interaction=… » du set. Sur une instance, seuls les calques
qui diffèrent du composant sont des overrides (appariés dans l'ordre des
calques). Les ids d'export (composants, sets, écrans) ne changent pas : un
fichier exporté avant reste mis à jour sur place.

Preuves : `tests/edits.test.ts` (agent sur le modèle de nœuds),
`tests/figma-scene.test.ts`, `tests/figma-export.test.ts` (« export v2 »,
fausse API Plugin), e2e « exporter vers Figma ». Le rendu dans Figma Desktop
reste à vérifier à la main.

Limites connues : le curseur et la sémantique HTML n'ont pas d'équivalent
Figma ; les arrêts d'un dégradé ne sont pas liés aux variables, et son
angle ignore les proportions du calque ; le fond d'un calque texte n'est pas
exporté (un texte Figma n'a pas de fond) ; les interactions de prototype ne
sont pas exportées ; un état touche tous les calques du composant à la fois
(une variante par état, pas par calque) ; les tirets « pointillés » sont
approchés.

## 2026-10-28 — Versions en présence (serveur, onglet, plugin)

Problème : trois pannes de la même famille. Un serveur démarré avant une
mise à jour du code servait la nouvelle interface sans ses routes
(« l'application peine à s'ouvrir ») ; un onglet ouvert avant une
recompilation envoyait l'ancien format d'export ; un plugin resté ouvert
dans Figma garde son ancien code.

Décision : chaque partie compare sa version avant de dialoguer.
`app/server/version.ts` relève au démarrage une empreinte du code serveur
(`app/server`, `app/shared`, `connectors`, `scripts/runtime.mjs`) et la
compare ensuite ; `/api/version` publie le bundle de `dist/` et cet état,
`/_studio/health` le donne au lanceur. Le lanceur relance proprement un
serveur périmé (au démarrage, à l'ouverture, ou par « Démarrer » qui
redevient cliquable) au lieu de le réutiliser. L'onglet compare son bundle
toutes les 20 s et au retour sur la fenêtre : un bandeau propose
« Recharger » (les écritures en attente partent d'abord), ou demande de
relancer le serveur ; un serveur sans `/api/version` est périmé. Le plugin
annonce son format d'export : un plugin ancien est refusé avant l'envoi,
avec la marche à suivre, et un plugin récent refuse un format ancien.

Preuves : `tests/version.test.ts`, `tests/figma-bridge.test.ts` (plugin
ancien), `tests/figma-export.test.ts` (format refusé), e2e « versions »,
`tests/launcher.test.mjs` (serveur périmé relancé).

Limite connue : un serveur lancé à la main (`npm start`) n'est pas relancé
automatiquement ; le bandeau le signale. Le rechargement reste un clic :
l'onglet n'est jamais rechargé sans l'étudiant.

## 2026-10-28 — Refonte du chrome : noir, blanc, gris

Problème : le chrome de l'atelier mêlait 129 couleurs en dur, des glyphes
comme icônes et des textes d'aide redondants ; l'inspecteur listait ses
réglages dans l'ordre d'implémentation, tous dépliés.

Décision : le chrome ne lit que des tokens `--ui-*` (`app/client/styles.css`,
`:root`) : couleurs neutres, états désaturés, rayons, espacements sur 4 px,
typo Geist (4 tailles, 2 graisses), ombres quasi invisibles. Icônes Phosphor
Regular 16 px. Le DS de l'étudiant (catalogue, iframe) garde ses propres
variables. L'inspecteur suit l'ordre Composant → Contenu → Mise en page →
Dimensions → Typographie → Position → Apparence → Fond → Contour → Effets →
Interaction → Avancé ; les paquets de détail sont repliés et l'état
ouvert/replié est retenu. Les libellés affichés sont courts (`short`), le nom
accessible reste complet et contient le texte visible. Les champs ont une
bordure #949494 (3:1) ; le gris secondaire est #6E6E6E (AA sur le fond).

Preuves : `npm run check`, e2e mis à jour (libellés et paquets repliés).

Limite connue : les paquets repliés demandent un clic de plus ; la sélection
du canevas est noire, donc moins visible sur un DS très sombre.

## 2026-10-28 — Trois zones et vocabulaire courant

Problème : panneau flottant étroit, douze paquets et un jargon de designer
(padding, auto-layout, token, instance) rendaient la création d'un
composant opaque pour un non-spécialiste.

Décision : la page se divise en trois zones intégrées : édition à gauche
(Composants/Écrans, Modifier/Tester, éléments), aperçu au centre, paramètres
à droite (40-50 % de la largeur) avec un seul bouton principal en bas. L'inspecteur
passe à cinq groupes (Contenu, Disposition, Texte, Style, Avancé replié), sans
lignes ni textes d'aide ; les libellés utilisent des mots courants. L'état se
choisit dans un menu déroulant, seul élément superposé avec les menus Figma.
Le brief devient « Projet ».

Preuves : e2e mis à jour (libellés, menu d'état, réglages d'écran).

Limite connue : la note sur l'envoi du brief à Codex a été retirée de
l'interface ; la règle reste dans START_HERE.md.

## 2026-10-28 — Cibles mobile, tablette, web et extension

Problème : l'atelier vise des applications web, mobiles, tablettes et des
extensions, mais l'aperçu ne proposait que trois largeurs de téléphone et un
« Desktop » à 1024 px.

Décision : quatre tailles d'écran nommées par cible : Mobile 375, Tablette
768, Ordinateur 1280, Extension 360 × 600 (fenêtre d'extension de
navigateur). Pour un élément seul, le nom modifiable sert de titre du
panneau ; un texte affiche le groupe Texte avant la Disposition ; les
limites de taille passent dans Avancé ; l'historique parle de
« modifications » plutôt que de révisions.

Preuves : e2e mis à jour (tailles d'écran, libellés).

## À compléter par l’étudiant

Date, problème, options explorées, décision, preuves et limite connue.

## 2026-10-29 — Refonte : CMS de conception, du design system au code

Problème : l'atelier était un starter de tokens à clés fixes, avec un modèle de
nœuds copié de Figma, un pont plugin et trois connecteurs IA. Trop lourd pour
le grand public et impossible de créer un design system libre.

Décision : app Electron (Mac, Windows, Linux ; un clone, `npm install`,
`npm start`). Un projet = un dossier local avec `.studio/project.json` comme
seule source de vérité. Quatre modules : Design system, Pages, Contenus, Code.
Mise en page en flux uniquement (Bloc, Texte, Image, Composant, Liste), styles
par format bureau / tablette / mobile, uniquement en tokens. Couleurs clair et
sombre. IA via la connexion Claude Code existante, deux rôles : Design et
Développement. Vérification humaine conservée sous forme « Garder / Annuler »
après application sur le canevas, plus un historique d'instantanés.

Supprimé : pont et plugin Figma, connecteurs Codex et Gemini, chat, tokens v1,
document v2, lanceurs, scripts de qualification, docs V2, design system et
écrans d'exemple.

Preuves (phase 1) : tests unitaires du stockage, e2e Electron (créer,
renommer, changer de dossier, revenir à l'accueil).

## 2026-10-29 — Phase 2 : design system, création et import

Décision : l'agent Design passe par le Claude Agent SDK avec la connexion
Claude Code existante, sans aucun outil, et renvoie le design system complet
en sortie structurée (schéma Zod converti en JSON Schema). Le résultat est
validé (schéma et références vers les fondations) avant d'être écrit, puis
s'affiche avec « Garder / Annuler ». Import Figma : endpoints `styles`,
`components`, puis `nodes` sur ces seuls identifiants ; arbre réduit avant
l'agent ; cache dans `.studio/cache/figma.json`. Token chiffré par le
trousseau du système (safeStorage), jamais dans le projet. Export JSON des
variables accepté à la place ou en plus du lien.

Limite connue : un composant se crée par l'IA ou l'import ; l'édition à la
main de sa structure arrive avec l'éditeur d'éléments (phase 3). Une
génération complète prend environ 90 s.

Preuves : génération réelle sur un projet vide (17 couleurs, 9 styles de
texte, 8 composants, références valides), conservée comme fixture ; tests
unitaires (références, import Figma simulé) ; e2e (saisie, IA annulée puis
gardée, états, thème sombre).

## 2026-10-29 — Fenêtre adaptée à l'écran et dossiers d'éléments

Problème : sur un petit écran, la fenêtre dépassait et le panneau de
paramètres était coupé ; un grand design system devenait une longue liste.

Décision : la fenêtre s'ouvre à la taille de l'écran ; les panneaux suivent
la largeur (220 à 360 px) et chaque zone défile verticalement. Les dossiers
se créent par le nom : « Primaire/500 » range l'élément dans « Primaire »,
sur toutes les familles et sur plusieurs niveaux. La liste les replie, la
planche les titre ; l'agent Design range ses éléments de la même façon.

Preuves : e2e à 1000 × 640 (paramètres visibles, liste qui défile, dossier
créé par renommage).

## 2026-10-29 — Phase 3 : pages, canevas et Structure

Décision : les calques façon Figma sont remplacés par une « Structure » :
cinq sortes d'éléments (Bloc, Texte, Image, Composant ; Liste viendra avec les
contenus), en flux, nommés d'après leur contenu. On ajoute dans le bloc
sélectionné (sinon juste après), on réordonne en glissant, on duplique ou
supprime (boutons ou clavier). Le canevas affiche un format à la fois
(Bureau 1280, Tablette 768, Mobile 375) ; une valeur réglée hors bureau ne
vaut que pour ce format et un point permet de la retirer. Les paramètres ne
proposent que des tokens. Le même éditeur sert aux composants : un état
autre que « Par défaut » n'enregistre que des différences de style. Les
images choisies sont copiées dans `.studio/assets/`.

Preuves : tests unitaires des opérations sur l'arbre ; e2e (page, bloc,
texte, valeur mobile rétablie, déplacement, image locale affichée, instance
supprimée au clavier, texte et survol d'un composant modifiés).
