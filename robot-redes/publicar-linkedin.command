#!/bin/zsh
# Publica ya en LinkedIn los artículos que Flow tiene en cola (sin esperar al aviso de cada 10 min).
# Se abre un Chrome: si te pide entrar en LinkedIn, inicia sesión tú y el robot sigue solo.
export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.npm-global/bin:$PATH"
cd "$(dirname "$0")" || exit 1
node robot.mjs --publicar 2>&1 | tee -a robot.log
echo
read -k1 "?Pulsa una tecla para cerrar…"
