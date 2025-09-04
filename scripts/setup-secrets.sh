#!/bin/bash

# Script para configurar secrets no Google Secret Manager
# Execute este script uma vez para criar os secrets

PROJECT_ID="revalida-companion"
REGION="southamerica-east1"

echo "🔐 Configurando Google Secret Manager para o projeto: $PROJECT_ID"

# Verificar se o usuário está logado no gcloud
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q "@"; then
    echo "❌ Você precisa fazer login no gcloud primeiro:"
    echo "   gcloud auth login"
    exit 1
fi

# Definir o projeto ativo
gcloud config set project $PROJECT_ID

# Habilitar a API do Secret Manager se não estiver habilitada
echo "📝 Habilitando API do Secret Manager..."
gcloud services enable secretmanager.googleapis.com

echo ""
echo "🔑 IMPORTANTE: Você precisará dos seguintes valores do Firebase:"
echo "   1. FIREBASE_PRIVATE_KEY (chave privada do service account)"
echo "   2. FIREBASE_CLIENT_EMAIL (email do service account)"
echo "   3. FIREBASE_PROJECT_ID (ID do projeto)"
echo "   4. FIREBASE_STORAGE_BUCKET (bucket do storage)"
echo ""

# Criar secret para FIREBASE_PRIVATE_KEY
echo "📋 Criando secret para FIREBASE_PRIVATE_KEY..."
echo "Cole a chave privada completa (incluindo -----BEGIN PRIVATE KEY----- e -----END PRIVATE KEY-----):"
read -r -d '' FIREBASE_PRIVATE_KEY

if [ -n "$FIREBASE_PRIVATE_KEY" ]; then
    echo "$FIREBASE_PRIVATE_KEY" | gcloud secrets create firebase-private-key \
        --data-file=- \
        --replication-policy="automatic" || echo "Secret firebase-private-key já existe"
    echo "✅ Secret firebase-private-key criado"
fi

# Criar secret para FIREBASE_CLIENT_EMAIL
echo "📧 Digite o FIREBASE_CLIENT_EMAIL:"
read FIREBASE_CLIENT_EMAIL
if [ -n "$FIREBASE_CLIENT_EMAIL" ]; then
    echo "$FIREBASE_CLIENT_EMAIL" | gcloud secrets create firebase-client-email \
        --data-file=- \
        --replication-policy="automatic" || echo "Secret firebase-client-email já existe"
    echo "✅ Secret firebase-client-email criado"
fi

# Criar secret para FIREBASE_PROJECT_ID
echo "🆔 Digite o FIREBASE_PROJECT_ID:"
read FIREBASE_PROJECT_ID_VALUE
if [ -n "$FIREBASE_PROJECT_ID_VALUE" ]; then
    echo "$FIREBASE_PROJECT_ID_VALUE" | gcloud secrets create firebase-project-id \
        --data-file=- \
        --replication-policy="automatic" || echo "Secret firebase-project-id já existe"
    echo "✅ Secret firebase-project-id criado"
fi

# Criar secret para FIREBASE_STORAGE_BUCKET
echo "🪣 Digite o FIREBASE_STORAGE_BUCKET:"
read FIREBASE_STORAGE_BUCKET
if [ -n "$FIREBASE_STORAGE_BUCKET" ]; then
    echo "$FIREBASE_STORAGE_BUCKET" | gcloud secrets create firebase-storage-bucket \
        --data-file=- \
        --replication-policy="automatic" || echo "Secret firebase-storage-bucket já existe"
    echo "✅ Secret firebase-storage-bucket criado"
fi

echo ""
echo "🔐 Listando secrets criados:"
gcloud secrets list --filter="name:firebase-"

echo ""
echo "🎯 Próximos passos:"
echo "   1. Execute o script deploy-with-secrets.sh para fazer deploy"
echo "   2. Ou use o comando gcloud run deploy com as configurações de secrets"
echo ""
echo "✅ Configuração do Secret Manager concluída!"
