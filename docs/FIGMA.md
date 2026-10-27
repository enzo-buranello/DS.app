# Figma — export depuis DS-Studio

Le bouton **↗ Exporter** (barre principale et barre de la fenêtre d'aperçu) est le
seul point d'entrée Figma de l'app. Deux pièces travaillent ensemble :

- **OAuth + API REST Figma** (lecture seule) : qui vous êtes, nom, pages et droits
  du fichier choisi.
- **Plugin local « DS-Studio Bridge »** (écriture) : l'API REST ne crée pas de
  nœuds, c'est donc le plugin, ouvert sur ce fichier dans Figma Desktop, qui écrit.

## 1. Créer l'app OAuth Figma (une fois)

1. Ouvrez <https://www.figma.com/developers/apps> et cliquez **Create a new app**.
2. Nom : par exemple « DS-Studio (local) ». Choisissez votre équipe.
3. **Redirect URL** : `http://127.0.0.1:4310/api/figma/oauth/callback`
   (remplacez 4310 si vous lancez DS-Studio avec un autre `PORT`).
4. **Scopes** : `current_user:read` et `file_content:read`, rien d'autre.
5. Laissez l'app en **brouillon** (draft) : elle suffit pour votre propre compte.
   Une app **privée** est nécessaire pour d'autres membres de l'équipe.
6. Copiez le **Client ID** et le **Client secret** dans `.env` à la racine du
   projet (fichier ignoré par Git, voir `.env.example`) :

   ```
   FIGMA_CLIENT_ID=…
   FIGMA_CLIENT_SECRET=…
   ```

7. Relancez DS-Studio. Seules ces deux clés sont lues dans `.env`.

Ne commitez jamais `.env`. Si le secret a fuité, régénérez-le sur la page de l'app.

## 2. Plugin (une fois)

Figma Desktop › Plugins › Development › **Import plugin from manifest…** ›
`plugins/figma-bridge/manifest.json`. Détails : [plugins/figma-bridge/README.md](../plugins/figma-bridge/README.md).

## 3. Exporter

1. **Exporter › Se connecter à Figma** : un onglet s'ouvre sur figma.com,
   autorisez, puis revenez à DS-Studio.
2. Collez le **lien du fichier** cible, **Charger**, puis choisissez la **page**.
   Le dernier fichier et la dernière page sont mémorisés.
3. Dans Figma Desktop, ouvrez ce fichier et lancez **DS-Studio Bridge** ; collez le
   code d'appairage affiché par DS-Studio. Le plugin indique « Lien direct actif ».
4. Choisissez **Design system** ou **Aperçu actuel**.

- **Design system** : collection de variables « DS-Studio » (un token = une
  variable), composants et component sets avec variantes (bouton), auto layout
  conservé ; un bouton dans la carte est une instance du variant.
- **Aperçu actuel** : l'écran affiché (largeur, scénario) en frames auto layout ;
  chaque composant DS reconnu devient une instance du composant déjà exporté sur
  la page, ou d'un composant créé à cette occasion.

**Mise à jour sans doublon** : chaque nœud créé porte un identifiant
(`pluginData` `dsStudioKey`) et DS-Studio conserve la correspondance
clé → id de nœud par fichier (`.ds-studio/figma/exports.json`). Un ré-export met à
jour les mêmes nœuds ; les instances déjà posées restent liées.

## Erreurs signalées

| Situation                                | Message                                        |
| ---------------------------------------- | ---------------------------------------------- |
| App OAuth absente de `.env`              | « Connexion Figma non configurée… »            |
| Pas de session, ou refresh refusé        | « Non connecté à Figma » / « Session expirée » |
| Plugin fermé ou mauvais code             | « Plugin non lancé » / « non connecté »        |
| Plugin lancé sur un autre fichier        | « Fichier non ouvert dans Figma : ouvrez … »   |
| Fichier en lecture seule (rôle `viewer`) | « Droits insuffisants… »                       |
| Page supprimée entre-temps               | « Page introuvable… »                          |

## Sécurité

- PKCE (S256) et `state` à usage unique (10 min) ; le retour OAuth est la seule
  route acceptée depuis un autre site.
- Token stocké dans le **trousseau macOS** (commande `security`, secret transmis
  par l'entrée standard, jamais en argument). Ailleurs : `.ds-studio/figma/oauth.json`
  en 0600, hors Git. Il n'est jamais renvoyé au navigateur.
- Rafraîchissement automatique 5 min avant expiration ; un refresh refusé efface
  la session. **Se déconnecter** efface le token local.
- Le plugin s'authentifie par le code d'appairage ; il n'écrit que sur demande
  (clic « Exporter ») et relit les variables après écriture.

## État

**IMPLEMENTED, TESTED** avec un faux serveur Figma (OAuth, REST) et un plugin
simulé (`npm test`, `npm run test:e2e`). **Non vérifié** avec un vrai compte Figma
tant que le parcours ci-dessus n'a pas été fait dans Figma Desktop.
