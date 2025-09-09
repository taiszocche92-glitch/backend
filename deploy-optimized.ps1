<#
PowerShell wrapper para build/push/deploy do backend (compatível com Windows PowerShell / PowerShell Core).
Uso:
  cd backend
  .\deploy-optimized.ps1 -ProjectId revalida-companion -ServiceName revalida-backend
#>
param(
  [string]$ProjectId = "revalida-companion",
  [string]$ServiceName = "revalida-backend",
  [string]$Region = "southamerica-east1",
  [switch]$BuildOnly,
  [switch]$UseSecrets,
  [string]$FrontendUrl = ""
)

$ErrorActionPreference = 'Stop'

$IMAGE_NAME = "gcr.io/$ProjectId/$ServiceName"
$timestamp = (Get-Date).ToString('yyyyMMdd-HHmmss')

Write-Host "[INFO] IMAGE_NAME = $IMAGE_NAME"
Write-Host "[INFO] timestamp = $timestamp"

# Habilitar BuildKit para Docker
$env:DOCKER_BUILDKIT = "1"

# Build da imagem
Write-Host "[INFO] Iniciando build Docker..."

# Detectar suporte a flags avançadas do docker (ex.: --target)
Write-Host "[INFO] Verificando suporte do Docker a flags avançadas..."
$dockerHelp = & docker build --help 2>&1
$supportsTarget = $false
if ($dockerHelp -match '--target') { $supportsTarget = $true }

if ($supportsTarget) {
  # Argumentos para build avançado (multi-stage, cache)
  $buildArgs = @('build','--target','production','--build-arg','BUILDKIT_INLINE_CACHE=1','--cache-from',"$($IMAGE_NAME):latest",'-t',"$($IMAGE_NAME):latest",'-t',"$($IMAGE_NAME):$timestamp",'.')
} else {
  Write-Warning "[WARNING] Docker aparenta não suportar '--target' neste ambiente. Usando fallback de build simples."
  $buildArgs = @('build','-t',"$($IMAGE_NAME):latest",'-t',"$($IMAGE_NAME):$timestamp",'.')
}

Write-Host "[INFO] docker $($buildArgs -join ' ')"

# Tentar executar o build; se falhar, tentar fallback simples
& docker @buildArgs
if ($LASTEXITCODE -ne 0) {
  Write-Warning "[WARN] docker build falhou com código $LASTEXITCODE"
  if ($supportsTarget) {
    Write-Host "[INFO] Tentando fallback de build simples sem --target e sem cache-from..."
    $fallbackArgs = @('build','-t',"$($IMAGE_NAME):latest",'-t',"$($IMAGE_NAME):$timestamp",'.')
    Write-Host "[INFO] docker $($fallbackArgs -join ' ')"
    & docker @fallbackArgs
    if ($LASTEXITCODE -ne 0) {
      Write-Error "Fallback docker build retornou código $LASTEXITCODE"
      exit $LASTEXITCODE
    }
  } else {
    Write-Error "docker build falhou e não há fallback disponível"
    exit $LASTEXITCODE
  }
}

Write-Host "[SUCCESS] Imagem construída: $($IMAGE_NAME):$timestamp"

if ($BuildOnly) {
  Write-Host "[INFO] Opção BuildOnly ativada. Encerrando apos build.";
  exit 0
}

# Configurar docker para usar credenciais gcloud
Write-Host "[INFO] Configurando credenciais docker via gcloud..."
& gcloud auth configure-docker --quiet

# Push da imagem latest
Write-Host "[INFO] Enviando imagem para GCR: $IMAGE_NAME:latest"
$pushProcess = Start-Process -FilePath docker -ArgumentList @("push","$($IMAGE_NAME):latest") -NoNewWindow -Wait -PassThru
if ($pushProcess.ExitCode -ne 0) {
    Write-Error "docker push retornou código $($pushProcess.ExitCode)"
    exit $pushProcess.ExitCode
}

Write-Host "[SUCCESS] Imagem enviada para GCR"

# Deploy via gcloud (mantive o comportamento do script bash original)
Write-Host "[INFO] Iniciando deploy no Cloud Run (substitui servic e via cloud-run-config.yaml se existir...)"
if (-Not (Test-Path -Path "cloud-run-config.yaml")) {
    Write-Error "Arquivo cloud-run-config.yaml não encontrado no diretório atual"
    exit 1
}

# Deploy usando imagem publicada (mais compatível com flags de env e autenticação)
if (Test-Path -Path "cloud-run-config.yaml") {
  Write-Host "[INFO] Encontrado cloud-run-config.yaml; usando 'gcloud run deploy' apontando para a imagem publicada"
}

# Construir argumentos adicionais para deploy
$deployArgs = @(
  'run','deploy',$ServiceName,
  '--image',"$($IMAGE_NAME):latest",
  '--region',$Region,
  '--platform','managed',
  '--allow-unauthenticated'
)

if ($FrontendUrl -and $FrontendUrl.Trim().Length -gt 0) {
  $deployArgs += @('--set-env-vars',"OPTIMIZE_MEMORY=true,MAX_CONNECTIONS=50,FRONTEND_URL=$FrontendUrl")
} else {
  $deployArgs += @('--set-env-vars',"OPTIMIZE_MEMORY=true,MAX_CONNECTIONS=50")
}

if ($UseSecrets) {
  Write-Host "[INFO] Uso de secrets ativado: adicionando --set-secrets FIREBASE_SA_JSON=FIREBASE_SA_JSON:latest"
  $deployArgs += @('--set-secrets','FIREBASE_SA_JSON=FIREBASE_SA_JSON:latest')
}

$deployArgs += @('--quiet')

Write-Host "[INFO] Executando: gcloud $($deployArgs -join ' ')"
& gcloud @deployArgs

Write-Host "[WARN] NODE_ENV não foi forçado para 'production' no deploy para evitar falha caso as credenciais do Firebase não estejam configuradas. Se desejar rodar em produção, configure os segredos FIREBASE_* no Cloud Run (Secret Manager) antes de definir NODE_ENV=production."

Write-Host "[SUCCESS] Deploy solicitado via gcloud run deploy. Aguarde o Cloud Run propagar a nova revisão."

# Opcional: validar health check
try {
  $serviceUrl = & gcloud run services describe $ServiceName --region $Region --format="value(status.url)"
  if ($serviceUrl) {
    Write-Host "[INFO] Verificando health: $serviceUrl/health"
    Invoke-WebRequest -Uri ($serviceUrl + "/health") -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
    Write-Host "[SUCCESS] Health check OK"
  }
} catch {
  Write-Warning "Não foi possível verificar health automaticamente: $($_.Exception.Message)"
}

Write-Host "[DONE] deploy-optimized.ps1 finalizado"
