#!/bin/bash

# Script para fazer deploy do agente assistente
echo "🚀 Deploy do Agente Assistente - Backend"
echo "======================================"

# Navegar para a pasta backend
cd backend

# Verificar se estamos em um repositório git
if [ ! -d ".git" ]; then
    echo "❌ Esta pasta não é um repositório Git"
    echo "💡 Inicialize com: git init"
    exit 1
fi

echo "📋 Status atual do repositório:"
git status

echo -e "\n📝 Arquivos do agente que serão commitados:"
echo "   - routes/agent.js (novo)"
echo "   - server.js (modificado)"
echo "   - package.json (dependências)"
echo "   - .gitignore (proteger credenciais)"
echo "   - DEPLOY_GUIDE.md (documentação)"

echo -e "\n🔒 Verificando se credenciais estão protegidas..."
if grep -q "*firebase-adminsdk*.json" .gitignore; then
    echo "✅ Credenciais do Firebase protegidas no .gitignore"
else
    echo "⚠️  Adicionando proteção para credenciais..."
    echo "*firebase-adminsdk*.json" >> .gitignore
fi

echo -e "\n📦 Adicionando arquivos..."
git add routes/agent.js
git add server.js
git add package.json
git add .gitignore
git add DEPLOY_GUIDE.md

echo "✅ Arquivos adicionados ao staging"

echo -e "\n💬 Fazendo commit..."
git commit -m "feat: Adicionar agente assistente inteligente

- Implementar endpoint /api/agent/query
- Suporte a consultas de estações, usuários, avaliações
- Configuração para deploy em nuvem com variáveis de ambiente
- Proteção de credenciais Firebase
- Documentação de deploy incluída"

echo "✅ Commit realizado"

echo -e "\n🚀 Fazendo push para deploy..."
echo "   Isso irá disparar o deploy automático na nuvem..."

read -p "Confirma o push? (y/N): " confirm
if [[ $confirm == [yY] || $confirm == [yY][eE][sS] ]]; then
    git push origin main
    echo "✅ Push realizado! Deploy em andamento..."
    
    echo -e "\n📋 Próximos passos:"
    echo "   1. Aguardar deploy na nuvem"
    echo "   2. Configurar variáveis de ambiente do Firebase"
    echo "   3. Testar endpoint: https://seu-backend.app/api/agent/query"
    echo "   4. Atualizar URL no frontend se necessário"
    
    echo -e "\n📖 Documentação completa: ./DEPLOY_GUIDE.md"
else
    echo "❌ Push cancelado"
    echo "💡 Execute o push manualmente quando estiver pronto: git push origin main"
fi

echo -e "\n🎉 Deploy do agente concluído!"
