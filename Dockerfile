# Dockerfile para backend Node.js (Cloud Run)
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

ENV NODE_ENV=production

CMD ["node", "server.js"]
