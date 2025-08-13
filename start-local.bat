@echo off
REM Scripts para gerenciar ambientes de desenvolvimento

echo 🚀 Iniciando Backend Local para Desenvolvimento
echo 📡 Servidor rodará em: http://localhost:3000
echo 🔧 Ambiente: LOCAL
echo.

REM Instala dependências se necessário
if not exist "node_modules" (
    echo 📦 Instalando dependências...
    npm install
)

REM Inicia o servidor local
echo 🏃 Iniciando servidor...
npm start
