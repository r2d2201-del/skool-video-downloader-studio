#!/bin/bash
launchctl load -w ~/Library/LaunchAgents/com.cinematic.skoolserver.plist 2>/dev/null || true
echo "⚡ Servidor Cinematic Skool Downloader iniciado en segundo plano."
sleep 2
