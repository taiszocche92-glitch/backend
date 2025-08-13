FROM node:18-alpine

WORKDIR /app

# Copiar apenas package.json primeiro para otimizar cache
COPY package*.json ./

# Instalar dependências
RUN npm ci --only=production

# Copiar código fonte
COPY . .

# Cloud Run usa a variável PORT automaticamente
EXPOSE 8080

# Usar usuário não-root para segurança
USER node

CMD ["node", "server.js"]
