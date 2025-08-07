# 🚀 Configuração do Firebase no Railway

As credenciais do Firebase foram configuradas localmente e através de variáveis de ambiente.

## Railway Deploy

O deploy usa as variáveis de ambiente configuradas no Railway dashboard.
As seguintes variáveis devem estar configuradas no Railway:

```
FIREBASE_PROJECT_ID=revalida-companion
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@revalida-companion.iam.gserviceaccount.com
FIREBASE_STORAGE_BUCKET=revalida-companion.firebasestorage.app
FIREBASE_PRIVATE_KEY=[chave privada completa]
```

## Local Development

Para desenvolvimento local, as credenciais estão no arquivo:
- `revalida-companion-firebase-adminsdk.json` (ignorado pelo git)
- `.env` (ignorado pelo git)

## Status

✅ Firebase Admin SDK configurado
✅ Variáveis de ambiente prontas
✅ Fallback para arquivo local funcionando
✅ Modo demonstração como backup

Último update: 2025-01-07
