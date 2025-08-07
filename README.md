# Backend Revalida Fácil

Backend para o sistema de simulações médicas.

## Configuração

1. Configure as variáveis de ambiente no arquivo `.env`:

```bash
FIREBASE_PROJECT_ID=revalida-companion
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n[SUA_CHAVE_PRIVADA_AQUI]\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@revalida-companion.iam.gserviceaccount.com
FIREBASE_STORAGE_BUCKET=revalida-companion.firebasestorage.app
```

2. Instale as dependências:

```bash
npm install
```

3. Execute em desenvolvimento:

```bash
npm start
```

## Deploy no Railway

1. Faça commit das alterações:

```bash
git add .
git commit -m "Update backend config"
```

2. Faça push para o repositório do backend:

```bash
git push origin main
```

3. Configure as variáveis de ambiente no Railway Dashboard:
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_PRIVATE_KEY`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_STORAGE_BUCKET`

## Endpoints

- `GET /health` - Verificação de saúde
- `POST /api/agent/query` - Chat com o agente AI
- WebSocket para simulações em tempo real

## Dependências

- Express.js - Framework web
- Socket.IO - WebSockets
- Firebase Admin SDK - Acesso ao Firestore
- dotenv - Variáveis de ambiente
