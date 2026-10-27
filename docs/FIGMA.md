# Figma : source de vérité réelle, pas intégration simulée

**V3 : pont par plugin local — IMPLEMENTED, PARTIAL.** Voir
[plugins/figma-bridge](../plugins/figma-bridge/README.md). Le plugin, lancé par
l'utilisateur dans Figma Desktop, importe variables, styles et sélection, et
exporte les écrans en frames natives liées à une collection de variables.
Testé : routes HTTP, appairage, validation des données, sérialisation des
écrans dans Chromium, et logique du plugin contre une imitation de l'API Figma.
**Non testé dans Figma réel** depuis ce dépôt : à vérifier au premier usage.

Garanties : appairage par code révocable, origine « null » seule acceptée sur
`/plugin/figma/*`, import soumis au diff humain, export prévisualisé puis
appliqué seulement si les tokens n'ont pas changé, relecture après écriture.
Aucun jeton Figma, aucun MCP Figma dans l'agent de discussion.

Le reste de ce document décrit l'ancienne approche V2 (sans plugin).

La [documentation Figma officielle du serveur distant](https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/)
indique que seuls les clients du catalogue autorisé peuvent se connecter. Un
nouveau client doit passer par la procédure d’admission. DS-Studio n’est pas déclaré
client autorisé. Ne jamais usurper un client, extraire un jeton, réutiliser une session
Codex ou recopier des cookies pour contourner cette restriction.

## Parcours réaliste aujourd’hui

1. Garder votre DS réel dans Figma et identifier son périmètre de travail.
2. Exporter volontairement des données non sensibles par un moyen autorisé dont
   vous contrôlez les droits. Ne pas confondre un export de composants avec leur
   comportement responsive dans du code.
3. Convertir explicitement les tokens vers le [format local](TOKENS.md), puis importer
   le fichier dans DS-Studio et accepter le diff. V2 ne fournit pas ce convertisseur.
4. Tester vos décisions localement. Exporter les tokens courants pour documenter un
   rapprochement manuel avec Figma. L’export ne modifie pas votre fichier Figma.

Le JSON local constitue le mode autonome démontré, pas une synchronisation bidirectionnelle.
Les plans, limites et droits d’édition réels devront être contrôlés pour chaque étudiant.
Pas de polling automatique Figma prévu et aucune gratuité permanente promise.

## Intégration future : contrat, pas code opérationnel

`connectors/figma/contract.ts` sépare lecture, proposition et application validée.
Une réalisation doit :

- Employer un client officiellement autorisé et l’OAuth officiel propre à l’étudiant.
  Tester d’abord une lecture minimale d’un **fichier de test explicitement autorisé**.
- Définir une liste autorisée de fichier et variables, avec une révision de départ.
  Échouer si la cible, les droits ou la révision diffèrent.
- Préparer un diff structuré, afficher l’impact et obtenir une validation humaine
  liée au hash de la proposition, à la cible et à la révision, à usage unique.
- Recontrôler les droits et la révision juste avant l’écriture, limiter l’opération,
  relire les valeurs après exécution et garder une trace d’audit sans secret.
- En cas de timeout, relire avant toute nouvelle tentative pour ne pas doubler une
  écriture. Prévoir refus, annulation, révocation et restauration sur une copie.

L’agent de discussion ne doit jamais disposer simultanément d’un MCP Figma libre.
Un simple skill « demande confirmation » ne constitue pas une barrière. Conserver
les outils distants derrière le contrôleur, ou rester non connecté si le fournisseur
ne permet pas ce contrôle. Le contrat TypeScript ne met pas en œuvre ces garanties.

Le serveur officiel dispose d’outils d’écriture ; ne pas supposer qu’un accès MCP
est en lecture seule. Les [outils officiels](https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/)
et les [droits et limites](https://developers.figma.com/docs/figma-mcp-server/rate-limits-access/)
seront à relire lors de la connexion, car ils peuvent évoluer.
