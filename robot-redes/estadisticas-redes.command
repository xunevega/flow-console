#!/bin/zsh
# Lee las estadísticas de Instagram y LinkedIn y se las pasa a Flow.
# Se abre un Chrome: si te pide entrar, inicia sesión tú y el robot sigue solo.
export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.npm-global/bin:$PATH"
cd "$(dirname "$0")" || exit 1
node robot.mjs "$@" 2>&1 | tee -a robot.log
echo
read -k1 "?Pulsa una tecla para cerrar…"
