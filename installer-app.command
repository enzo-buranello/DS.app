#!/bin/bash
# DS-Studio en app perso : serveur lancé en silence à l'ouverture de session
# (LaunchAgent), puis icône Dock via Safari. Aucun sudo.
set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"
# Même recherche que le lanceur : premier Node >= 22.12 trouvé (PATH, nvm, Homebrew…).
. "$ROOT/launcher/find-node.sh"
if find_node; then NODE="$DS_NODE"; else
  # Repli : le Node de ton terminal, celui qui fait déjà tourner `npm start`.
  NODE="$(command -v node || true)"
  [ -z "$NODE" ] && { echo "ÉCHEC : node introuvable."; read -n 1 -s; exit 1; }
  echo "Attention : Node < 22.12 (recommandé : mettre à jour Node LTS)."
fi
echo "Node utilisé : $NODE ($("$NODE" -v))"
LABEL="com.dsstudio.server"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/DS-Studio.log"
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
: > "$LOG"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>$NODE</string><string>$ROOT/node_modules/tsx/dist/cli.mjs</string><string>$ROOT/app/server/index.ts</string>
  </array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>$(dirname "$NODE"):/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><false/>
  <key>Nice</key><integer>10</integer>
  <key>ProcessType</key><string>Background</string>
  <key>LowPriorityIO</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
PL
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Démarrage du serveur…"
for i in $(seq 1 15); do
  curl -s -o /dev/null http://127.0.0.1:4310/ && break; sleep 1
done
if curl -s -o /dev/null http://127.0.0.1:4310/; then
  echo "OK : serveur actif, démarré une fois par ouverture de session (pas de relance auto)."
  open -a Safari http://127.0.0.1:4310
  echo
  echo "Dans Safari : menu Fichier > Ajouter au Dock… > Ajouter."
  echo "Ensuite, ouvre DS-Studio depuis le Dock."
else
  echo "ÉCHEC : le serveur ne répond pas. Dernières lignes du journal :"
  tail -20 "$LOG"
  echo "Copie ce message à Claude."
fi
echo
echo "Désinstaller : launchctl bootout gui/\$(id -u)/$LABEL && rm \"$PLIST\""
read -n 1 -s -r -p "Appuie sur une touche pour fermer."
