#!/bin/sh
set -e

echo "🔍 Iniciando verificação de pré-requisitos..."

# Verificar se os arquivos do projeto existem
echo "📄 Verificando arquivos do projeto..."
if [ ! -f "server.js" ]; then
  echo "❌ ERRO: server.js não encontrado no diretório de trabalho $(pwd)"
  exit 1
fi
echo "✅ server.js encontrado"

if [ ! -f "cache.js" ]; then
  echo "❌ ERRO: cache.js não encontrado no diretório de trabalho $(pwd)"
  exit 1
fi
echo "✅ cache.js encontrado"

if [ ! -f "utils/fix-cors-cloud-run.js" ]; then
  echo "❌ ERRO: utils/fix-cors-cloud-run.js não encontrado no diretório de trabalho $(pwd)"
  exit 1
fi
echo "✅ utils/fix-cors-cloud-run.js encontrado"

# Verificar se node_modules existe e contém as dependências
echo "📦 Verificando node_modules..."
if [ ! -d "node_modules" ]; then
  echo "❌ ERRO: node_modules não encontrado. As dependências não foram instaladas."
  echo "    Verifique o estágio de build do Dockerfile."
  exit 1
fi
echo "✅ node_modules encontrado"

# Verificar se as dependências principais existem
echo "🔧 Verificando dependências npm principais..."
if [ ! -d "node_modules/dotenv" ]; then
  echo "❌ ERRO: módulo 'dotenv' não encontrado em node_modules/"
  exit 1
fi
echo "✅ dotenv encontrado"

if [ ! -d "node_modules/express" ]; then
  echo "❌ ERRO: módulo 'express' não encontrado em node_modules/"
  exit 1
fi
echo "✅ express encontrado"

if [ ! -d "node_modules/socket.io" ]; then
  echo "❌ ERRO: módulo 'socket.io' não encontrado em node_modules/"
  exit 1
fi
echo "✅ socket.io encontrado"

if [ ! -d "node_modules/cors" ]; then
  echo "❌ ERRO: módulo 'cors' não encontrado em node_modules/"
  exit 1
fi
echo "✅ cors encontrado"

if [ ! -d "node_modules/firebase-admin" ]; then
  echo "❌ ERRO: módulo 'firebase-admin' não encontrado em node_modules/"
  exit 1
fi
echo "✅ firebase-admin encontrado"

echo "🎉 Todos os pré-requisitos verificados com sucesso!"
echo "🚀 Iniciando o servidor..."

# Executar o comando original
exec "$@"