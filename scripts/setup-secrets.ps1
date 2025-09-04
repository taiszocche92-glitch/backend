# Script PowerShell para configurar secrets no Google Secret Manager
# Execute este script uma vez para criar os secrets

$PROJECT_ID = "revalida-companion"
$REGION = "southamerica-east1"

Write-Host "🔐 Configurando Google Secret Manager para o projeto: $PROJECT_ID" -ForegroundColor Green

# Verificar se o gcloud está instalado
try {
    gcloud version | Out-Null
} catch {
    Write-Host "❌ gcloud CLI não encontrado. Instale primeiro:" -ForegroundColor Red
    Write-Host "   https://cloud.google.com/sdk/docs/install"
    exit 1
}

# Verificar se o usuário está logado
try {
    $activeAccount = gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>$null
    if (-not $activeAccount -or $activeAccount.Trim() -eq "") {
        Write-Host "❌ Você precisa fazer login no gcloud primeiro:" -ForegroundColor Red
        Write-Host "   gcloud auth login" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host "❌ Erro ao verificar autenticação. Verifique se gcloud está instalado." -ForegroundColor Red
    exit 1
}

# Definir o projeto ativo
gcloud config set project $PROJECT_ID

# Habilitar a API do Secret Manager
Write-Host "📝 Habilitando API do Secret Manager..." -ForegroundColor Blue
gcloud services enable secretmanager.googleapis.com

Write-Host ""
Write-Host "🔑 IMPORTANTE: Você precisará dos seguintes valores do Firebase:" -ForegroundColor Yellow
Write-Host "   1. FIREBASE_PRIVATE_KEY (chave privada do service account)"
Write-Host "   2. FIREBASE_CLIENT_EMAIL (email do service account)"
Write-Host "   3. FIREBASE_PROJECT_ID (ID do projeto)"
Write-Host "   4. FIREBASE_STORAGE_BUCKET (bucket do storage)"
Write-Host ""

# Função para criar secret
function Create-Secret {
    param(
        [string]$SecretName,
        [string]$DisplayName,
        [string]$Value
    )
    
    if ($Value) {
        try {
            $Value | gcloud secrets create $SecretName --data-file=- --replication-policy="automatic" 2>$null
            Write-Host "✅ Secret $SecretName criado" -ForegroundColor Green
        } catch {
            Write-Host "⚠️  Secret $SecretName já existe ou erro ao criar" -ForegroundColor Yellow
        }
    }
}

# Obter valores dos secrets
Write-Host "📧 Digite o FIREBASE_CLIENT_EMAIL:" -ForegroundColor Cyan
$FIREBASE_CLIENT_EMAIL = Read-Host

Write-Host "🆔 Digite o FIREBASE_PROJECT_ID:" -ForegroundColor Cyan
$FIREBASE_PROJECT_ID_VALUE = Read-Host

Write-Host "🪣 Digite o FIREBASE_STORAGE_BUCKET:" -ForegroundColor Cyan
$FIREBASE_STORAGE_BUCKET = Read-Host

Write-Host "🔑 Para a FIREBASE_PRIVATE_KEY, abra o arquivo JSON do service account e cole a chave privada completa:" -ForegroundColor Yellow
Write-Host "   (incluindo -----BEGIN PRIVATE KEY----- e -----END PRIVATE KEY-----)" -ForegroundColor Yellow
Write-Host "Cole aqui e pressione Enter duas vezes quando terminar:" -ForegroundColor Cyan

$lines = @()
do {
    $line = Read-Host
    if ($line) {
        $lines += $line
    }
} while ($line -or $lines.Count -eq 0)

$FIREBASE_PRIVATE_KEY = $lines -join "`n"

# Criar os secrets
Create-Secret "firebase-client-email" "Firebase Client Email" $FIREBASE_CLIENT_EMAIL
Create-Secret "firebase-project-id" "Firebase Project ID" $FIREBASE_PROJECT_ID_VALUE
Create-Secret "firebase-storage-bucket" "Firebase Storage Bucket" $FIREBASE_STORAGE_BUCKET
Create-Secret "firebase-private-key" "Firebase Private Key" $FIREBASE_PRIVATE_KEY

Write-Host ""
Write-Host "🔐 Listando secrets criados:" -ForegroundColor Blue
gcloud secrets list --filter="name~firebase"

Write-Host ""
Write-Host "🎯 Próximos passos:" -ForegroundColor Green
Write-Host "   1. Execute o script deploy-with-secrets.ps1 para fazer deploy"
Write-Host "   2. Ou use o comando gcloud run deploy com as configurações de secrets"
Write-Host ""
Write-Host "✅ Configuração do Secret Manager concluída!" -ForegroundColor Green
