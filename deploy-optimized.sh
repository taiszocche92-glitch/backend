#!/bin/bash

# Script de Deploy Otimizado para Backend Node.js - Cloud Run
# Otimizações implementadas: minScale=0, cache inteligente, health checks

set -e  # Parar execução em caso de erro

# === CONFIGURAÇÕES ===
PROJECT_ID="revalida-companion"
SERVICE_NAME="revalida-backend"
REGION="southamerica-east1"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# === FUNÇÕES UTILITÁRIAS ===
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# === VALIDAÇÕES PRÉ-DEPLOY ===
validate_environment() {
    log_info "🔍 Validando ambiente..."

    # Verificar se gcloud está instalado e configurado
    if ! command -v gcloud &> /dev/null; then
        log_error "gcloud CLI não encontrado. Instale o Google Cloud SDK."
        exit 1
    fi

    # Verificar se docker está instalado
    if ! command -v docker &> /dev/null; then
        log_error "Docker não encontrado. Instale o Docker."
        exit 1
    fi

    # Verificar autenticação (compatível com Windows/Git Bash)
    log_info "Verificando autenticação..."
    if gcloud auth list --format="value(account)" 2>/dev/null | grep -q "@" 2>/dev/null; then
        log_success "✅ Autenticação verificada"
    else
        log_warning "⚠️  Não foi possível verificar autenticação"
        log_warning "⚠️  Certifique-se de executar: gcloud auth login"
        log_info "⏳ Continuando mesmo assim..."
    fi

    # Verificar projeto correto
    CURRENT_PROJECT=$(gcloud config get-value project)
    if [ "$CURRENT_PROJECT" != "$PROJECT_ID" ]; then
        log_warning "Projeto atual: $CURRENT_PROJECT. Alterando para: $PROJECT_ID"
        gcloud config set project $PROJECT_ID
    fi

    log_success "✅ Ambiente validado com sucesso"
}

# === BUILD DA IMAGEM ===
build_image() {
    log_info "🏗️  Construindo imagem Docker otimizada..."

    # Build com cache mount para acelerar builds subsequentes
    DOCKER_BUILDKIT=1 docker build \
        --target production \
        --build-arg BUILDKIT_INLINE_CACHE=1 \
        --cache-from $IMAGE_NAME:latest \
        -t $IMAGE_NAME:latest \
        -t $IMAGE_NAME:$(date +%Y%m%d-%H%M%S) \
        .

    log_success "✅ Imagem construída com sucesso"
}

# === UPLOAD PARA GCR ===
push_image() {
    log_info "📤 Enviando imagem para Google Container Registry..."

    # Configurar Docker para usar gcloud como helper de credenciais
    gcloud auth configure-docker --quiet

    # Push da imagem
    docker push $IMAGE_NAME:latest

    log_success "✅ Imagem enviada para GCR"
}

# === DEPLOY NO CLOUD RUN ===
deploy_service() {
    log_info "🚀 Fazendo deploy no Cloud Run com configurações otimizadas..."

    # Verificar se arquivo de configuração existe
    if [ ! -f "cloud-run-config.yaml" ]; then
        log_error "Arquivo cloud-run-config.yaml não encontrado!"
        exit 1
    fi

    # Deploy usando arquivo de configuração YAML
    gcloud run services replace cloud-run-config.yaml \
        --region $REGION \
        --set-env-vars "NODE_ENV=production" \
        --set-env-vars "OPTIMIZE_MEMORY=true" \
        --set-env-vars "MAX_CONNECTIONS=50" \
        --allow-unauthenticated \
        --quiet

    log_success "✅ Deploy realizado com sucesso"
}

# === VALIDAÇÃO PÓS-DEPLOY ===
validate_deployment() {
    log_info "🔍 Validando deployment..."

    # Aguardar serviço ficar pronto
    log_info "⏳ Aguardando serviço ficar pronto..."
    gcloud run services wait $SERVICE_NAME --region $REGION --timeout=300

    # Obter URL do serviço
    SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region $REGION --format="value(status.url)")

    # Testar health check
    log_info "🩺 Testando health check..."
    if curl -f -s "$SERVICE_URL/health" > /dev/null; then
        log_success "✅ Health check passou"
    else
        log_error "❌ Health check falhou"
        exit 1
    fi

    # Testar endpoint de métricas
    log_info "📊 Testando endpoint de métricas..."
    if curl -f -s "$SERVICE_URL/debug/metrics" > /dev/null; then
        log_success "✅ Endpoint de métricas funcionando"
    else
        log_warning "⚠️  Endpoint de métricas não acessível (pode ser intencional)"
    fi

    log_success "✅ Deployment validado com sucesso"
    echo ""
    echo "========================================"
    echo "🎉 DEPLOY CONCLUÍDO COM SUCESSO!"
    echo "========================================"
    echo "🌐 URL do Serviço: $SERVICE_URL"
    echo "💰 Configurações de Otimização:"
    echo "   • Min Instances: 0 (sem custos ociosos)"
    echo "   • Memory: 512MB (otimizado)"
    echo "   • CPU: 1.0 vCPU (compatível com concurrency > 1)"
    echo "   • Concurrency: 80 (alta performance)"
    echo "   • Cache: Habilitado"
    echo "   • Health Checks: Otimizados"
    echo "========================================"
}

# === MONITORAMENTO ===
show_monitoring_info() {
    echo ""
    log_info "📈 Informações de Monitoramento:"
    echo "• Console Cloud Run: https://console.cloud.google.com/run"
    echo "• Logs: https://console.cloud.google.com/logs"
    echo "• Métricas: $SERVICE_URL/debug/metrics"
    echo "• Health Check: $SERVICE_URL/health"
    echo ""
    log_info "💡 Comandos úteis:"
    echo "• Ver logs: gcloud logging read \"resource.type=cloud_run_revision AND resource.labels.service_name=$SERVICE_NAME\" --limit=10"
    echo "• Ver métricas: gcloud run services describe $SERVICE_NAME --region $REGION"
    echo "• Escalar manualmente: gcloud run services update $SERVICE_NAME --region $REGION --min-instances=1"
}

# === ROLLBACK ===
rollback_deployment() {
    log_warning "🔄 Executando rollback para versão anterior..."

    # Obter revisões disponíveis
    REVISIONS=$(gcloud run revisions list --service=$SERVICE_NAME --region=$REGION --format="value(metadata.name)" --limit=2)

    # Pegar a segunda revisão mais recente (anterior)
    PREVIOUS_REVISION=$(echo "$REVISIONS" | sed -n '2p')

    if [ -n "$PREVIOUS_REVISION" ]; then
        gcloud run services update-traffic $SERVICE_NAME \
            --region $REGION \
            --to-revisions $PREVIOUS_REVISION=100

        log_success "✅ Rollback executado para: $PREVIOUS_REVISION"
    else
        log_error "❌ Não foi possível encontrar revisão anterior para rollback"
    fi
}

# === MENU INTERATIVO ===
show_menu() {
    echo ""
    echo "========================================"
    echo "🚀 DEPLOY OTIMIZADO - REVALIDA BACKEND"
    echo "========================================"
    echo "1) Deploy Completo (build + push + deploy)"
    echo "2) Apenas Build da Imagem"
    echo "3) Apenas Push da Imagem"
    echo "4) Apenas Deploy do Serviço"
    echo "5) Rollback para Versão Anterior"
    echo "6) Sair"
    echo "========================================"
    read -p "Escolha uma opção (1-6): " choice
}

# === EXECUÇÃO PRINCIPAL ===
main() {
    # Verificar se foi passado argumento de linha de comando
    if [ $# -eq 0 ]; then
        # Menu interativo
        while true; do
            show_menu
            case $choice in
                1)
                    log_info "🚀 Iniciando deploy completo..."
                    validate_environment
                    build_image
                    push_image
                    deploy_service
                    validate_deployment
                    show_monitoring_info
                    break
                    ;;
                2)
                    log_info "🏗️  Construindo apenas imagem..."
                    validate_environment
                    build_image
                    break
                    ;;
                3)
                    log_info "📤 Enviando apenas imagem..."
                    validate_environment
                    push_image
                    break
                    ;;
                4)
                    log_info "🚀 Fazendo apenas deploy..."
                    validate_environment
                    deploy_service
                    validate_deployment
                    break
                    ;;
                5)
                    log_info "🔄 Executando rollback..."
                    validate_environment
                    rollback_deployment
                    break
                    ;;
                6)
                    log_info "👋 Saindo..."
                    exit 0
                    ;;
                *)
                    log_error "Opção inválida. Tente novamente."
                    ;;
            esac
        done
    else
        # Execução direta baseada no argumento
        case $1 in
            "full")
                log_info "🚀 Executando deploy completo..."
                validate_environment
                build_image
                push_image
                deploy_service
                validate_deployment
                show_monitoring_info
                ;;
            "build")
                validate_environment
                build_image
                ;;
            "push")
                validate_environment
                push_image
                ;;
            "deploy")
                validate_environment
                deploy_service
                validate_deployment
                ;;
            "rollback")
                validate_environment
                rollback_deployment
                ;;
            *)
                log_error "Argumento inválido. Use: full, build, push, deploy, ou rollback"
                exit 1
                ;;
        esac
    fi
}

# Capturar sinais para cleanup
trap 'log_warning "Deploy interrompido pelo usuário"; exit 130' INT TERM

# Executar função principal
main "$@"
