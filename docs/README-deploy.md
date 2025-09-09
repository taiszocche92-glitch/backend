# 🚀 Guia de Deploy Otimizado - Backend Revalida

## 📋 Visão Geral

Este guia explica como usar o script de deploy otimizado para reduzir custos no Google Cloud Run.

## ⚡ Otimizações Implementadas

- **Min Instances = 0**: Elimina custos quando não há tráfego
- **Memória reduzida**: 256MB (50% menos que o padrão)
- **CPU otimizada**: 0.5 vCPU (50% menos)
- **Cache inteligente**: Reduz leituras no Firestore
- **Health checks otimizados**: Menos overhead
- **Build multi-stage**: Imagens menores e mais rápidas

## 🛠️ Pré-requisitos

1. **Google Cloud SDK** instalado e configurado
2. **Docker** instalado
3. **Conta de serviço** com permissões adequadas
4. **Projeto GCP** configurado

```bash
# Verificar instalação
gcloud --version
docker --version

# Configurar projeto
gcloud config set project SEU_PROJECT_ID
gcloud auth login
```

## 🚀 Como Usar

### Opção 1: Deploy Completo (Recomendado)

```bash
cd backend
./deploy-optimized.sh full
```

### Opção 2: Menu Interativo

```bash
cd backend
./deploy-optimized.sh
```

Escolha a opção desejada no menu:
1. Deploy Completo
2. Apenas Build da Imagem
3. Apenas Push da Imagem
4. Apenas Deploy do Serviço
5. Rollback para Versão Anterior

### Opção 3: Comandos Individuais

```bash
# Apenas build
./deploy-optimized.sh build

# Apenas push
./deploy-optimized.sh push

# Apenas deploy
./deploy-optimized.sh deploy

# Rollback
./deploy-optimized.sh rollback
```

## 📊 Monitoramento

### URLs Importantes
- **Serviço**: `https://SEU_SERVICO-REGION-PROJECT.cloudfunctions.net`
- **Health Check**: `https://SEU_SERVICO-REGION-PROJECT.cloudfunctions.net/health`
- **Métricas**: `https://SEU_SERVICO-REGION-PROJECT.cloudfunctions.net/debug/metrics`

### Comandos de Monitoramento

```bash
# Ver logs recentes
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=revalida-backend" --limit=10

# Ver status do serviço
gcloud run services describe revalida-backend --region=southamerica-east1

# Ver métricas de uso
gcloud run services logs read revalida-backend --region=southamerica-east1
```

## 💰 Otimizações de Custo

### Antes vs Depois

| Configuração | Antes | Depois | Economia |
|-------------|-------|--------|----------|
| Min Instances | 1 | 0 | ~70% |
| Memória | 512MB | 256MB | ~50% |
| CPU | 1 vCPU | 0.5 vCPU | ~50% |
| Cache | Nenhum | Inteligente | ~80% leituras |

### Custos Esperados
- **Com tráfego normal**: ~R$ 2-5/dia
- **Sem tráfego**: R$ 0 (graças ao minScale=0)
- **Pico de uso**: Auto-scaling até 10 instâncias

## 🔧 Configurações Técnicas

### Variáveis de Ambiente
```bash
NODE_ENV=production
OPTIMIZE_MEMORY=true
MAX_CONNECTIONS=50
```

### Configurações Cloud Run
```yaml
memory: 256Mi
cpu: 0.5
max-instances: 10
concurrency: 80
timeout: 300
min-instances: 0
```

## 🚨 Troubleshooting

### Problema: Build falha
```bash
# Limpar cache Docker
docker system prune -a

# Verificar espaço em disco
df -h
```

### Problema: Deploy falha
```bash
# Verificar permissões
gcloud auth list

# Verificar quota do projeto
gcloud compute project-info describe
```

### Problema: Serviço não responde
```bash
# Verificar logs
gcloud logging read "resource.type=cloud_run_revision" --limit=20

# Verificar health check
curl -f https://SEU_SERVICO/health
```

## 📈 Próximos Passos

1. **Monitorar custos** por 1 semana
2. **Ajustar configurações** baseado no uso real
3. **Implementar cache distribuído** se necessário
4. **Configurar CI/CD** para deploys automáticos

## 📞 Suporte

Para problemas ou dúvidas:
1. Verifique os logs do Cloud Run
2. Teste o health check endpoint
3. Verifique as configurações do projeto GCP
4. Consulte a documentação do Google Cloud Run

---

**💡 Dica**: Execute o deploy durante horários de baixo tráfego para minimizar impacto no serviço.
