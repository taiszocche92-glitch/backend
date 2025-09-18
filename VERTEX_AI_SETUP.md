# Configuração do Google Vertex AI - MedGemma

Este documento fornece instruções completas para configurar a integração com o Google Vertex AI e o modelo MedGemma no projeto RevalidaFlow.

## 📋 Pré-requisitos

1. **Conta Google Cloud Platform (GCP)** com projeto ativo
2. **Vertex AI API habilitada** no projeto GCP
3. **Service Account** com permissões apropriadas
4. **MedGemma model** disponível no Vertex AI (verificar disponibilidade na região)

## 🔧 Configuração Passo a Passo

### 1. Habilitar APIs no Google Cloud Console

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/)
2. Selecione seu projeto (ou crie um novo)
3. Navegue para "APIs e Serviços" > "Biblioteca"
4. Habilite as seguintes APIs:
   - Vertex AI API
   - Cloud Vision API (opcional, para processamento de imagens)

### 2. Criar Service Account

1. No Cloud Console, vá para "IAM e Admin" > "Service Accounts"
2. Clique em "Create Service Account"
3. Defina um nome (ex: `vertex-ai-service`)
4. Conceda as seguintes roles:
   - `Vertex AI User`
   - `Storage Object Viewer` (se usar Cloud Storage)
5. Clique em "Done"
6. Na lista de service accounts, clique no criado
7. Vá para "Keys" > "Add Key" > "Create new key"
8. Selecione JSON e baixe o arquivo

### 3. Configurar Variáveis de Ambiente

Copie o arquivo `.env.example` para `.env` no diretório `backend/`:

```bash
cp backend/.env.example backend/.env
```

Edite o arquivo `.env` com suas credenciais:

```env
# Configurações do Firebase (já existentes)
FIREBASE_PROJECT_ID=seu-projeto-firebase
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nSUA_CHAVE_PRIVADA_AQUI\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@seu-projeto.iam.gserviceaccount.com
FIREBASE_STORAGE_BUCKET=seu-projeto.appspot.com

# Configurações do Google Cloud Vertex AI
GOOGLE_CLOUD_PROJECT_ID=seu-projeto-gcp
GOOGLE_CLOUD_LOCATION=us-central1
GOOGLE_APPLICATION_CREDENTIALS=./service-account-key.json

# OU use credenciais via variáveis (alternativa ao arquivo JSON)
GOOGLE_CLOUD_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nCHAVE_PRIVADA_VERTEX_AQUI\n-----END PRIVATE KEY-----\n"
GOOGLE_CLOUD_CLIENT_EMAIL=vertex-ai-service@seu-projeto.iam.gserviceaccount.com
```

### 4. Posicionar Arquivo de Credenciais

Se usar `GOOGLE_APPLICATION_CREDENTIALS`, coloque o arquivo JSON baixado na pasta `backend/`:

```bash
# Exemplo de estrutura
backend/
├── service-account-key.json  # Arquivo de credenciais
├── .env                      # Variáveis de ambiente
└── server.js
```

### 5. Verificar Disponibilidade do MedGemma

O MedGemma pode não estar disponível em todas as regiões. Verifique:

1. No Cloud Console, vá para Vertex AI > Model Garden
2. Procure por "MedGemma" ou "Medical"
3. Verifique se está disponível na sua região (`GOOGLE_CLOUD_LOCATION`)

Regiões comuns com Vertex AI: `us-central1`, `us-west1`, `europe-west1`

## 🧪 Teste da Configuração

### Teste Básico de Conectividade

Inicie o backend:

```bash
cd backend
npm start
```

Teste o endpoint de conectividade:

```bash
curl http://localhost:3000/api/vertex-ai/test
```

Resposta esperada (sucesso):
```json
{
  "success": true,
  "message": "Conexão com MedGemma estabelecida com sucesso",
  "response": "Sim",
  "timestamp": "2025-09-15T..."
}
```

### Teste de Análise de Imagem

Para testar a análise de imagem, use:

```bash
curl -X POST http://localhost:3000/api/vertex-ai/analyze-image \
  -H "Content-Type: application/json" \
  -d '{
    "imageBase64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "prompt": "Analise esta imagem médica."
  }'
```

## 📊 Endpoints Disponíveis

Após configuração, os seguintes endpoints estarão disponíveis:

- `GET /api/vertex-ai/test` - Testa conectividade com MedGemma
- `POST /api/vertex-ai/analyze-image` - Analisa imagem médica
- `GET /api/vertex-ai/models` - Lista modelos disponíveis

## 🔍 Troubleshooting

### Erro: "Project not found"

- Verifique se `GOOGLE_CLOUD_PROJECT_ID` está correto
- Confirme se o projeto existe no GCP

### Erro: "Permission denied"

- Verifique se o Service Account tem as roles corretas
- Confirme se a chave privada está correta

### Erro: "Model not found"

- Verifique se MedGemma está disponível na sua região
- Considere mudar `GOOGLE_CLOUD_LOCATION` para outra região

### Erro: "Quota exceeded"

- Verifique limites de quota no Vertex AI
- Considere aumentar quotas no Cloud Console

## 💰 Custos

- **Vertex AI**: Cobrança por uso (tokens processados)
- **Armazenamento**: Se usar Cloud Storage para imagens
- Monitore custos no Cloud Console > Billing

## 🔒 Segurança

- Nunca commite arquivos `.env` ou chaves JSON no Git
- Use Secret Manager em produção
- Restrinja permissões do Service Account ao mínimo necessário

## 📚 Recursos Adicionais

- [Documentação Vertex AI](https://cloud.google.com/vertex-ai/docs)
- [MedGemma no Model Garden](https://cloud.google.com/vertex-ai/generative-ai/docs/model-garden/explore-models)
- [Guia de Autenticação GCP](https://cloud.google.com/docs/authentication)