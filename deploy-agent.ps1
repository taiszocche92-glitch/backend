# Script para fazer deploy do agente assistente no Windows
Write-Host "🚀 Deploy do Agente Assistente - Backend" -ForegroundColor Cyan
Write-Host "======================================"

# Navegar para a pasta backend
Set-Location backend

# Verificar se estamos em um repositório git
if (-not (Test-Path ".git")) {
    Write-Host "❌ Esta pasta não é um repositório Git" -ForegroundColor Red
    Write-Host "💡 Inicialize com: git init" -ForegroundColor Yellow
    exit 1
}

Write-Host "📋 Status atual do repositório:" -ForegroundColor Yellow
git status

Write-Host "`n📝 Arquivos do agente que serão commitados:" -ForegroundColor Cyan
Write-Host "   - routes/agent.js (novo)"
Write-Host "   - server.js (modificado)"
Write-Host "   - package.json (dependências)"
Write-Host "   - .gitignore (proteger credenciais)"
Write-Host "   - DEPLOY_GUIDE.md (documentação)"

Write-Host "`n🔒 Verificando se credenciais estão protegidas..." -ForegroundColor Yellow
$gitignoreContent = Get-Content .gitignore -ErrorAction SilentlyContinue
if ($gitignoreContent -contains "*firebase-adminsdk*.json") {
    Write-Host "✅ Credenciais do Firebase protegidas no .gitignore" -ForegroundColor Green
} else {
    Write-Host "⚠️  Adicionando proteção para credenciais..." -ForegroundColor Yellow
    Add-Content .gitignore "*firebase-adminsdk*.json"
}

Write-Host "`n📦 Adicionando arquivos..." -ForegroundColor Yellow
git add routes/agent.js
git add server.js
git add package.json
git add .gitignore
git add DEPLOY_GUIDE.md

Write-Host "✅ Arquivos adicionados ao staging" -ForegroundColor Green

Write-Host "`n💬 Fazendo commit..." -ForegroundColor Yellow
git commit -m "feat: Adicionar agente assistente inteligente

- Implementar endpoint /api/agent/query
- Suporte a consultas de estações, usuários, avaliações
- Configuração para deploy em nuvem com variáveis de ambiente
- Proteção de credenciais Firebase
- Documentação de deploy incluída"

Write-Host "✅ Commit realizado" -ForegroundColor Green

Write-Host "`n🚀 Fazendo push para deploy..." -ForegroundColor Cyan
Write-Host "   Isso irá disparar o deploy automático na nuvem..."

$confirm = Read-Host "Confirma o push? (y/N)"
if ($confirm -eq "y" -or $confirm -eq "Y" -or $confirm -eq "yes") {
    git push origin main
    Write-Host "✅ Push realizado! Deploy em andamento..." -ForegroundColor Green
    
    Write-Host "`n📋 Próximos passos:" -ForegroundColor Cyan
    Write-Host "   1. Aguardar deploy na nuvem"
    Write-Host "   2. Configurar variáveis de ambiente do Firebase"
    Write-Host "   3. Testar endpoint: https://seu-backend.app/api/agent/query"
    Write-Host "   4. Atualizar URL no frontend se necessário"
    
    Write-Host "`n📖 Documentação completa: .\DEPLOY_GUIDE.md" -ForegroundColor Yellow
} else {
    Write-Host "❌ Push cancelado" -ForegroundColor Red
    Write-Host "💡 Execute o push manualmente quando estiver pronto: git push origin main" -ForegroundColor Yellow
}

Write-Host "`n🎉 Deploy do agente concluído!" -ForegroundColor Green
