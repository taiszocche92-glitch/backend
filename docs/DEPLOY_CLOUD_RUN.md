# Deploy do backend no Cloud Run (com Secret Manager)

Este documento descreve os passos reproduzíveis para construir a imagem Docker do backend, enviar para o Container Registry e fazer o deploy no Cloud Run usando Google Secret Manager (quatro secrets separados).

Pré-requisitos
- gcloud instalado e autenticado no projeto `revalida-companion` (`gcloud auth login` e `gcloud config set project revalida-companion`).
- Docker Desktop em execução e able to push para gcr.io.
- Secrets criados no Secret Manager:
  - `firebase-private-key` (valor: PEM da private_key do service account)
  - `firebase-client-email` (valor: client_email)
  - `firebase-project-id` (valor: project_id)
  - `firebase-storage-bucket` (valor: storage bucket)
- Service account `cloud-run-sa@revalida-companion.iam.gserviceaccount.com` com a role `Secret Manager Secret Accessor` para acessar os secrets.

Recomendações
- Use um subdomínio para o backend (ex.: `api.revalidafacilapp.com.br`) em vez de `www` para evitar conflitos com o frontend.
- Não coloque a chave privada no repositório. Use o Secret Manager.

1) Build e push da imagem Docker

Abra PowerShell no diretório `backend` e execute:

```powershell
Set-Location "d:\REVALIDAFLOW\Projeto vs code\meuapp\backend"
docker build -t gcr.io/revalida-companion/revalida-backend:latest .
docker push gcr.io/revalida-companion/revalida-backend:latest
```

2) Deploy no Cloud Run com secrets (NODE_ENV=production)

```powershell
gcloud run deploy revalida-backend `
  --image gcr.io/revalida-companion/revalida-backend:latest `
  --platform managed `
  --region southamerica-east1 `
  --allow-unauthenticated `
  --service-account "cloud-run-sa@revalida-companion.iam.gserviceaccount.com" `
  --set-env-vars "NODE_ENV=production,FRONTEND_URL=https://www.revalidafacilapp.com.br" `
  --set-secrets "FIREBASE_PRIVATE_KEY=firebase-private-key:latest" `
  --set-secrets "FIREBASE_CLIENT_EMAIL=firebase-client-email:latest" `
  --set-secrets "FIREBASE_PROJECT_ID=firebase-project-id:latest" `
  --set-secrets "FIREBASE_STORAGE_BUCKET=firebase-storage-bucket:latest" `
  --memory "256Mi" `
  --cpu "0.5" `
  --min-instances "0" `
  --max-instances "10" `
  --concurrency "80" `
  --timeout "300s" `
  --port "3000"
```

3) Testar o endpoint de health

```powershell
Invoke-RestMethod -Uri "https://<SERVICE_URL>/health" -Method GET
```

Substitua `<SERVICE_URL>` pela URL retornada por:

```powershell
gcloud run services describe revalida-backend --platform managed --region southamerica-east1 --format "value(status.url)"
```

Problemas comuns
- Erro ao inicializar Firebase Admin SDK: verifique se `firebase-private-key` não contém aspas externas. Se sim, remova-as ao criar o secret. O script `backend/server.js` inclui sanitização para remover aspas e normalizar `\n`.
- `Permission denied` ao acessar secrets: conceda a role `Secret Manager Secret Accessor` à service account do Cloud Run.

Notas finais
- O deploy cria revisões; o Cloud Run expõe tanto a URL canônica do serviço quanto URLs diretas para revisões no domínio `*.a.run.app`. Use a URL canônica para o frontend.
- Para mapear um domínio customizado (recomendado: `api.revalidafacilapp.com.br`), use `gcloud run domain-mappings create --service=revalida-backend --domain=api.revalidafacilapp.com.br --platform=managed --region=southamerica-east1`.

Se precisar, posso executar esses comandos localmente se você autorizar e estiver logado no gcloud nesta máquina.
