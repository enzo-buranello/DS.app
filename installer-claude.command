#!/bin/bash
# Connexion de Claude Code (binaire du projet : tools/claude/claude). Aucun sudo.
cd "$(dirname "$0")"
BIN="./tools/claude/claude"
pkill -f "claude-.*-darwin-.* install" 2>/dev/null
xattr -d com.apple.quarantine "$BIN" 2>/dev/null
echo "== Version =="
"$BIN" --version || { echo "ÉCHEC : copie ce message à Claude."; read -n 1 -s -r -p "Touche pour fermer."; exit 1; }
echo
echo "== Connexion : connecte-toi dans le navigateur, puis tape /exit =="
"$BIN"
echo
echo "Terminé. Clique « Redémarrer » dans le lanceur DS-Studio."
read -n 1 -s -r -p "Appuie sur une touche pour fermer."
