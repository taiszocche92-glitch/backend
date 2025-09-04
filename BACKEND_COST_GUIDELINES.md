# 🚨 DIRETRIZES CRÍTICAS DO BACKEND - OTIMIZAÇÃO DE CUSTOS

## 💰 REGRAS DE OURO PARA PRODUÇÃO

### ❌ NUNCA FAÇA EM PRODUÇÃO:
- `console.log()` para debug - cada log gera custos no Google Cloud Logging
- Logs de cada requisição HTTP (ex: `[CORS DEBUG]`)
- Debug de variáveis de ambiente
- Logs desnecessários em health checks (geram ~1440 logs/dia)

### ✅ APENAS EM PRODUÇÃO:
- Logs de erros críticos que precisam de ação imediata
- Logs de inicialização essenciais
- Logs de falhas de segurança

### 🐛 LOGS DE DEBUG:
```javascript
// ✅ CORRETO - Apenas em desenvolvimento
if (process.env.NODE_ENV !== 'production') {
  console.log('DEBUG:', data);
}

// ❌ ERRADO - Gera custos em produção
console.log('DEBUG:', data);
```

### 💡 ALTERNATIVAS PARA DEBUG EM PRODUÇÃO:
- Use ferramentas de monitoramento específicas
- Configure logs condicionais por variável de ambiente
- Use breakpoints em ferramentas de debug

## 📊 IMPACTO DE CUSTOS:
- Health checks: ~$0.50-1.00/mês em logs
- Debug de requisições: ~$1.00-5.00/mês dependendo do tráfego
- Logs desnecessários podem facilmente custar $10-20/mês

## ⚠️ RESPONSABILIDADE:
**QUALQUER IA, DESENVOLVEDOR OU MODIFICAÇÃO NO BACKEND DEVE SEGUIR ESTAS DIRETRIZES RIGOROSAMENTE**

## 🔧 ARQUIVOS PRINCIPAIS COM ESSAS REGRAS:
- `backend/server.js` - Diretrizes no cabeçalho
- `backend/BACKEND_COST_GUIDELINES.md` - Este arquivo
- `backend/fix-cors-cloud-run.js` - Middleware com debug removido

## 📝 CHECKLIST ANTES DO DEPLOY:
- [ ] Remover todos os `console.log()` de debug
- [ ] Verificar se logs são essenciais para funcionamento
- [ ] Confirmar que apenas erros críticos geram logs
- [ ] Testar localmente com `NODE_ENV=production`

---
**Lembre-se: Cada log em produção = custos. Otimize sempre!**
