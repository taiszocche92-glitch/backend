# 🚀 Configuração para Deploy do Agente na Nuvem

## Para Railway/Heroku/Render

### 1. Variáveis de Ambiente Necessárias

Configure estas variáveis no painel da sua plataforma de nuvem:

```bash
# Firebase Configuration
FIREBASE_PROJECT_ID=revalida-companion
FIREBASE_PRIVATE_KEY_ID=seu_private_key_id_aqui
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nsua_chave_privada_aqui\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@revalida-companion.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=seu_client_id_aqui
FIREBASE_CLIENT_X509_CERT_URL=https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-xxxxx%40revalida-companion.iam.gserviceaccount.com
FIREBASE_STORAGE_BUCKET=revalida-companion.appspot.com

# Environment
NODE_ENV=production
PORT=3001

# Frontend URL (para CORS)
FRONTEND_URL=https://seu-frontend.vercel.app
```

### 2. Como Obter as Credenciais do Firebase

1. Acesse o [Console do Firebase](https://console.firebase.google.com)
2. Vá em **Configurações do Projeto** → **Contas de Serviço**
3. Clique em **Gerar nova chave privada**
4. Baixe o arquivo JSON
5. Copie os valores para as variáveis de ambiente

**Exemplo de como extrair do JSON:**
```json
{
  "type": "service_account",
  "project_id": "← FIREBASE_PROJECT_ID",
  "private_key_id": "← FIREBASE_PRIVATE_KEY_ID", 
  "private_key": "← FIREBASE_PRIVATE_KEY",
  "client_email": "← FIREBASE_CLIENT_EMAIL",
  "client_id": "← FIREBASE_CLIENT_ID",
  "client_x509_cert_url": "← FIREBASE_CLIENT_X509_CERT_URL"
}
```

### 3. Deploy Steps

#### Railway:
```bash
# 1. Conectar repositório
# 2. Selecionar pasta /backend
# 3. Configurar variáveis de ambiente
# 4. Deploy automático via Git push
```

#### Heroku:
```bash
# 1. Criar app
heroku create seu-app-backend

# 2. Configurar variáveis
heroku config:set FIREBASE_PROJECT_ID=revalida-companion
heroku config:set FIREBASE_PRIVATE_KEY="sua-chave-aqui"
# ... outras variáveis

# 3. Deploy
git subtree push --prefix=backend heroku main
```

#### Render:
```bash
# 1. Conectar repositório
# 2. Root Directory: backend
# 3. Build Command: npm install
# 4. Start Command: npm start
# 5. Configurar Environment Variables
```

### 4. Teste do Deploy

Após o deploy, teste com:

```bash
curl -X POST https://seu-backend.railway.app/api/agent/query \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test" \
  -d '{"question":"ajuda","context":{"userId":"test"}}'
```

### 5. Atualizar Frontend

No frontend, atualize a URL do backend:

```javascript
// src/components/AgentAssistant.vue
const response = await fetch('https://seu-backend.railway.app/api/agent/query', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
  },
  body: JSON.stringify({ question, context })
})
```

### 6. Troubleshooting

**Erro "Firebase not initialized":**
- Verifique se todas as variáveis de ambiente estão configuradas
- Confirme que a FIREBASE_PRIVATE_KEY tem quebras de linha corretas

**Erro de CORS:**
- Configure FRONTEND_URL com a URL do seu frontend
- Verifique se o CORS está permitindo a origem correta

**Logs para Debug:**
- Railway: Ver logs na dashboard
- Heroku: `heroku logs --tail -a seu-app`
- Render: Ver logs na dashboard

### 7. Segurança

✅ **Nunca committar credenciais no Git**
✅ **Usar HTTPS em produção**  
✅ **Configurar CORS adequadamente**
✅ **Implementar rate limiting**
✅ **Validar tokens JWT corretamente**
