#!/bin/zsh
# Deja el Mac mirando cada 10 minutos si Flow tiene artículos de LinkedIn en cola y, si los hay,
# los publica con el robot (abre Chrome solo cuando hay algo que publicar).
# Para quitarlo: ./instalar-publicador.command --quitar
DIR="$(cd "$(dirname "$0")" && pwd)"
ETIQUETA="es.aeternalflow.publicar-linkedin"
PLIST="$HOME/Library/LaunchAgents/$ETIQUETA.plist"

launchctl bootout "gui/$(id -u)/$ETIQUETA" 2>/dev/null
if [[ "$1" == "--quitar" ]]; then
  rm -f "$PLIST"
  echo "Quitado: el Mac ya no publica artículos solo."
  read -k1 "?Pulsa una tecla para cerrar…"
  exit 0
fi

if [[ ! -f "$DIR/.robot-token" ]]; then
  echo "Falta $DIR/.robot-token (la misma clave que usa el robot de estadísticas)."
  read -k1 "?Pulsa una tecla para cerrar…"
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$ETIQUETA</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>export PATH="/usr/local/bin:/opt/homebrew/bin:\$HOME/.npm-global/bin:\$PATH"; cd "$DIR" &amp;&amp; node robot.mjs --publicar &gt;&gt; robot.log 2&gt;&amp;1</string>
  </array>
  <key>StartInterval</key><integer>600</integer>
  <key>RunAtLoad</key><true/>
</dict>
</plist>
PLIST

launchctl bootstrap "gui/$(id -u)" "$PLIST" && echo "Listo: cada 10 minutos el Mac publica en LinkedIn los artículos que Flow tenga en cola." \
  || echo "No se pudo activar. Mira $PLIST"
read -k1 "?Pulsa una tecla para cerrar…"
