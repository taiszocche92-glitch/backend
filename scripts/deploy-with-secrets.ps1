# Script PowerShell para fazer deploy do backend no Cloud Run usando Secret Manager
# Este script substitui as variáveis de ambiente por secrets seguros

$PROJECT_ID = "revalida-companion"
$SERVICE_NAME = "revalida-backend"
$REGION = "southamerica-east1"
$IMAGE_NAME = "gcr.io/$PROJECT_ID/$SERVICE_NAME"

Write-Host "Iniciando deploy do backend com Secret Manager..." -ForegroundColor Green
Write-Host "   Projeto: $PROJECT_ID" -ForegroundColor Blue
Write-Host "   Servico: $SERVICE_NAME" -ForegroundColor Blue
Write-Host "   Regiao: $REGION" -ForegroundColor Blue
Write-Host ""

# Verificar se estamos no diretório correto
if (-not (Test-Path "package.json")) {
    Write-Host "❌ Execute este script no diretório backend/" -ForegroundColor Red
    exit 1
}

# Verificar se o Docker está rodando
try {
    docker version | Out-Null
} catch {
    Write-Host "❌ Docker não está rodando. Inicie o Docker Desktop primeiro." -ForegroundColor Red
    exit 1
}

# Verificar se os secrets existem
$null = $null
Write-Host "Verificando se os secrets existem..." -ForegroundColor Blue
$secrets = @("firebase-private-key", "firebase-client-email", "firebase-project-id", "firebase-storage-bucket")

foreach ($secret in $secrets) {
    try {
        gcloud secrets describe $secret --project=$PROJECT_ID 2>$null | Out-Null
    Write-Host "Secret $secret encontrado" -ForegroundColor Green
    } catch {
    Write-Host "Secret $secret nao encontrado. Execute setup-secrets.ps1 primeiro." -ForegroundColor Red
        exit 1
    }
}

# Build da imagem Docker
Write-Host ""
Write-Host "Construindo imagem Docker..." -ForegroundColor Blue
docker build -t $IMAGE_NAME .

if ($LASTEXITCODE -ne 0) {
    Write-Host "Erro ao construir a imagem Docker" -ForegroundColor Red
    exit 1
}

# Push da imagem para o Container Registry
Write-Host ""
Write-Host "Enviando imagem para o Container Registry..." -ForegroundColor Blue
docker push $IMAGE_NAME

if ($LASTEXITCODE -ne 0) {
    Write-Host "Erro ao enviar a imagem" -ForegroundColor Red
    exit 1
}

# Deploy no Cloud Run com secrets
Write-Host ""
Write-Host "Fazendo deploy no Cloud Run com Secret Manager..." -ForegroundColor Blue

gcloud run deploy $SERVICE_NAME `
    --image $IMAGE_NAME `
    --platform managed `
    --region $REGION `
    --allow-unauthenticated `
    --service-account "cloud-run-sa@$PROJECT_ID.iam.gserviceaccount.com" `
    --set-env-vars "NODE_ENV=production" `
    --set-secrets "FIREBASE_PRIVATE_KEY=firebase-private-key:latest" `
    --set-secrets "FIREBASE_CLIENT_EMAIL=firebase-client-email:latest" `
    --set-secrets "FIREBASE_PROJECT_ID=firebase-project-id:latest" `
    --set-secrets "FIREBASE_STORAGE_BUCKET=firebase-storage-bucket:latest" `
    --memory "1Gi" `
    --cpu "1" `
    --min-instances "0" `
    --max-instances "10" `
    --concurrency "80" `
    --timeout "300s" `
    --port "3000"

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Deploy concluido com sucesso!" -ForegroundColor Green
    Write-Host ""
    
    # Obter a URL do serviço
    $serviceUrl = gcloud run services describe $SERVICE_NAME --platform managed --region $REGION --format "value(status.url)"
    Write-Host "URL do servico: $serviceUrl" -ForegroundColor Cyan
    Write-Host ""
    
    # Testar o endpoint de health
    Write-Host "Testando endpoint de saude..." -ForegroundColor Blue
    Start-Sleep -Seconds 5
    
    try {
        $healthResponse = Invoke-RestMethod -Uri "$serviceUrl/health" -Method GET -TimeoutSec 10
    Write-Host "Servico esta saudavel!" -ForegroundColor Green
    Write-Host "   Status: $($healthResponse.status)" -ForegroundColor White
    Write-Host "   Uptime: $($healthResponse.uptime) segundos" -ForegroundColor White
    } catch {
    Write-Host "Aviso: Nao foi possivel testar o endpoint de saude" -ForegroundColor Yellow
    Write-Host "   Erro: $($_.Exception.Message)" -ForegroundColor Yellow
    }
    
    Write-Host ""
    Write-Host "Proximos passos:" -ForegroundColor Green
    Write-Host "   1. Atualizar o frontend com a nova URL: $serviceUrl"
    Write-Host "   2. Testar a integracao completa"
    Write-Host "   3. Monitorar logs: gcloud logs tail $SERVICE_NAME --region=$REGION"
    
} else {
    Write-Host ""
    Write-Host "Erro no deploy. Verifique os logs acima." -ForegroundColor Red
    exit 1
}
