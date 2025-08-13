#!/bin/bash
# Scripts para gerenciar ambientes de desenvolvimento

echo "🚀 Iniciando Backend Local para Desenvolvimento"
echo "📡 Servidor rodará em: http://localhost:3000"
echo "🔧 Ambiente: LOCAL"
echo ""

# Instala dependências se necessário
if [ ! -d "node_modules" ]; then
    echo "📦 Instalando dependências..."
    npm install
fi

# Inicia o servidor local
echo "🏃 Iniciando servidor..."
npm start
