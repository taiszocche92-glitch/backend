# Script simplificado para criar secrets no Google Secret Manager
# Execute este script no PowerShell para configurar os secrets uma vez

$PROJECT_ID = "revalida-companion"

Write-Host "🔐 Configurando Google Secret Manager para o projeto: $PROJECT_ID" -ForegroundColor Green

# Definir o projeto ativo
gcloud config set project $PROJECT_ID

# Habilitar a API do Secret Manager
Write-Host "📝 Habilitando API do Secret Manager..." -ForegroundColor Blue
gcloud services enable secretmanager.googleapis.com

Write-Host ""
Write-Host "📋 Vamos criar os 4 secrets necessários:" -ForegroundColor Yellow
Write-Host ""

# 1. FIREBASE_CLIENT_EMAIL
Write-Host "1️⃣ Digite o FIREBASE_CLIENT_EMAIL:" -ForegroundColor Cyan
Write-Host "   (exemplo: firebase-adminsdk-fbsvc@revalida-companion.iam.gserviceaccount.com)" -ForegroundColor Gray
$CLIENT_EMAIL = Read-Host

if ($CLIENT_EMAIL) {
    try {
        echo $CLIENT_EMAIL | gcloud secrets create firebase-client-email --data-file=- --replication-policy="automatic"
        Write-Host "✅ Secret firebase-client-email criado" -ForegroundColor Green
    } catch {
        Write-Host "⚠️  Secret firebase-client-email já existe" -ForegroundColor Yellow
    }
}

Write-Host ""

# 2. FIREBASE_PROJECT_ID
Write-Host "2️⃣ Digite o FIREBASE_PROJECT_ID:" -ForegroundColor Cyan
Write-Host "   (exemplo: revalida-companion)" -ForegroundColor Gray
$PROJECT_ID_VALUE = Read-Host

if ($PROJECT_ID_VALUE) {
    try {
        echo $PROJECT_ID_VALUE | gcloud secrets create firebase-project-id --data-file=- --replication-policy="automatic"
        Write-Host "✅ Secret firebase-project-id criado" -ForegroundColor Green
    } catch {
        Write-Host "⚠️  Secret firebase-project-id já existe" -ForegroundColor Yellow
    }
}

Write-Host ""

# 3. FIREBASE_STORAGE_BUCKET
Write-Host "3️⃣ Digite o FIREBASE_STORAGE_BUCKET:" -ForegroundColor Cyan
Write-Host "   (exemplo: revalida-companion.firebasestorage.app)" -ForegroundColor Gray
$STORAGE_BUCKET = Read-Host

if ($STORAGE_BUCKET) {
    try {
        echo $STORAGE_BUCKET | gcloud secrets create firebase-storage-bucket --data-file=- --replication-policy="automatic"
        Write-Host "✅ Secret firebase-storage-bucket criado" -ForegroundColor Green
    } catch {
        Write-Host "⚠️  Secret firebase-storage-bucket já existe" -ForegroundColor Yellow
    }
}

Write-Host ""

# 4. FIREBASE_PRIVATE_KEY
Write-Host "4️⃣ Para a FIREBASE_PRIVATE_KEY:" -ForegroundColor Cyan
Write-Host "   Vá para: https://console.firebase.google.com/project/$PROJECT_ID/settings/serviceaccounts/adminsdk" -ForegroundColor Blue
Write-Host "   1. Clique em 'Generate new private key'" -ForegroundColor Gray
Write-Host "   2. Abra o arquivo JSON baixado" -ForegroundColor Gray
Write-Host "   3. Copie APENAS o valor da chave 'private_key' (incluindo -----BEGIN/END-----)" -ForegroundColor Gray
Write-Host ""
Write-Host "Cole a chave privada completa e pressione Enter:" -ForegroundColor Cyan

$PRIVATE_KEY = Read-Host

if ($PRIVATE_KEY) {
    try {
        echo $PRIVATE_KEY | gcloud secrets create firebase-private-key --data-file=- --replication-policy="automatic"
        Write-Host "✅ Secret firebase-private-key criado" -ForegroundColor Green
    } catch {
        Write-Host "⚠️  Secret firebase-private-key já existe" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "🔐 Verificando secrets criados:" -ForegroundColor Blue
gcloud secrets list

Write-Host ""
Write-Host "✅ Configuração concluída!" -ForegroundColor Green
Write-Host "🎯 Próximo passo: Execute .\scripts\deploy-with-secrets.ps1" -ForegroundColor Yellow
