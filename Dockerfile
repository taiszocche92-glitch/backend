# Dockerfile Otimizado para Backend Node.js - Cloud Run
# Multi-stage build para reduzir tamanho da imagem e melhorar segurança

# === STAGE 1: Build e Dependencies ===
FROM node:20-alpine AS builder

# Instalar dependências de build
RUN apk add --no-cache python3 make g++

# Criar diretório de trabalho
WORKDIR /app

# Copiar arquivos de dependências primeiro (para cache de layers)
COPY package*.json ./

# Instalar apenas dependências de produção (dev dependencies não são necessárias para build)
RUN npm ci --omit=dev && npm cache clean --force

# === STAGE 2: Production Runtime ===
FROM node:20-alpine AS production

# Instalar ca-certificates para conexões HTTPS seguras
RUN apk add --no-cache ca-certificates dumb-init && \
    rm -rf /var/cache/apk/*

# Criar usuário não-root para segurança
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Criar diretório de trabalho
WORKDIR /app

# Copiar node_modules do stage builder
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copiar código fonte (apenas arquivos necessários)
COPY --chown=nodejs:nodejs server.js cache.js fix-cors-cloud-run.js ./
COPY --chown=nodejs:nodejs routes/ ./routes/

# Configurar permissões
USER nodejs

# Configurar variáveis de ambiente para otimização
# Nota: não forçar NODE_ENV aqui para evitar que o container falhe na inicialização
# se as credenciais do Firebase não estiverem configuradas no ambiente.
# Configure NODE_ENV=production no Cloud Run somente após provisionar os segredos.
ENV NODE_OPTIONS="--max-old-space-size=256"
ENV UV_THREADPOOL_SIZE=4

# Health check para Cloud Run
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:${PORT:-8080}/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Usar dumb-init para melhor gerenciamento de sinais
ENTRYPOINT ["dumb-init", "--"]

# Cloud Run define a porta via variável de ambiente $PORT
EXPOSE 3000
CMD ["node", "server.js"]
