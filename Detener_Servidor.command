#!/bin/bash
launchctl unload ~/Library/LaunchAgents/com.cinematic.skoolserver.plist 2>/dev/null || true
lsof -ti :4545 | xargs kill -9 2>/dev/null || true
echo "🛑 Servidor Cinematic Skool Downloader detenido."
sleep 2
