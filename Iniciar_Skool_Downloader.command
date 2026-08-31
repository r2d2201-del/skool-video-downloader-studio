#!/bin/bash
# ==========================================
# Lanzador de 1 Clic - Skool Video Downloader
# ==========================================

cd "$(dirname "$0")"
echo "======================================================="
echo "⚡ Iniciando Motor Local de Skool Video Downloader..."
echo "======================================================="

# Verificar si Python 3 está disponible
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 no está instalado. Por favor instala Python 3."
    read -p "Presiona Enter para salir..."
    exit 1
fi

# Lanzar el servidor en segundo plano
python3 scripts/server.py
