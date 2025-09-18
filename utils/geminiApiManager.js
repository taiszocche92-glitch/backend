const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createHash } = require('crypto');

class GeminiAPIManager {
  constructor() {
    this.freeKeys = this.loadApiKeys('free');
    this.paidKeys = this.loadApiKeys('paid');
    this.quotaCache = new Map(); // Cache de quotas em memória
    this.lastResetDate = new Date().toDateString();

    // Reset diário automático
    this.checkDailyReset();
    setInterval(() => this.checkDailyReset(), 60000); // Check a cada minuto
  }

  loadApiKeys(type) {
    const keys = [];

    if (type === 'free') {
      // Carregar chaves gratuitas 1-7 do .env
      for (let index = 1; index <= 7; index++) {
        const keyEnv = `GOOGLE_API_KEY_${index}`;
        const key = process.env[keyEnv];

        if (key) {
          const keyData = {
            key: key,
            type: type,
            index: index,
            dailyQuota: 1500, // 15 RPM * 100 requests = 1500 requests/day aproximadamente
            used: 0,
            lastUsed: null,
            errors: 0,
            isActive: true
          };

          keys.push(keyData);

          // Inicializar cache de quota
          const cacheKey = this.getCacheKey(key);
          if (!this.quotaCache.has(cacheKey)) {
            this.quotaCache.set(cacheKey, {
              used: 0,
              date: new Date().toDateString(),
              errors: 0
            });
          }
        }
      }
    } else if (type === 'paid') {
      // Carregar chave paga (GOOGLE_API_KEY_8) do .env
      const key = process.env.GOOGLE_API_KEY_8;

      if (key) {
        const keyData = {
          key: key,
          type: type,
          index: 8,
          dailyQuota: 999999, // Quota alta para chave paga
          used: 0,
          lastUsed: null,
          errors: 0,
          isActive: true
        };

        keys.push(keyData);

        // Inicializar cache de quota
        const cacheKey = this.getCacheKey(key);
        if (!this.quotaCache.has(cacheKey)) {
          this.quotaCache.set(cacheKey, {
            used: 0,
            date: new Date().toDateString(),
            errors: 0
          });
        }
      }
    }

    console.log(`🔑 Carregadas ${keys.length} chaves ${type} do Gemini`);
    return keys;
  }

  getCacheKey(apiKey) {
    return createHash('md5').update(apiKey).digest('hex').substring(0, 8);
  }

  checkDailyReset() {
    const currentDate = new Date().toDateString();

    if (this.lastResetDate !== currentDate) {
      console.log('🔄 Executando reset diário de quotas...');
      this.resetDailyQuotas();
      this.lastResetDate = currentDate;
    }
  }

  resetDailyQuotas() {
    // Reset quotas das chaves gratuitas
    this.freeKeys.forEach(keyData => {
      keyData.used = 0;
      keyData.errors = 0;
      const cacheKey = this.getCacheKey(keyData.key);
      this.quotaCache.set(cacheKey, {
        used: 0,
        date: new Date().toDateString(),
        errors: 0
      });
    });

    console.log(`✅ Reset de quotas concluído - ${this.freeKeys.length} chaves gratuitas resetadas`);
  }

  getAvailableFreeKey() {
    const currentDate = new Date().toDateString();

    for (const keyData of this.freeKeys) {
      if (!keyData.isActive) continue;

      const cacheKey = this.getCacheKey(keyData.key);
      const quota = this.quotaCache.get(cacheKey);

      // Verificar se precisa resetar esta chave específica
      if (quota && quota.date !== currentDate) {
        quota.used = 0;
        quota.date = currentDate;
        quota.errors = 0;
      }

      const currentUsage = quota ? quota.used : 0;

      if (currentUsage < keyData.dailyQuota) {
        return keyData;
      }
    }

    return null;
  }

  getPaidKey() {
    // Retorna a primeira chave paga ativa
    return this.paidKeys.find(key => key.isActive) || null;
  }

  async callGemini(keyData, prompt, options = {}) {
    try {
      const genAI = new GoogleGenerativeAI(keyData.key);

      // Usar Gemini 2.5 Flash-Lite como padrão, Flash como fallback
      const modelName = options.model || (keyData.type === 'free' ? 'gemini-2.5-flash' : 'gemini-2.5-flash');
      const model = genAI.getGenerativeModel({ model: modelName });

      const generationConfig = {
        temperature: options.temperature || 0.7,
        topP: options.topP || 0.8,
        topK: options.topK || 40,
        maxOutputTokens: options.maxOutputTokens || 2048,
      };

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig,
      });

      const response = result.response;
      const text = response.text();

      // Atualizar estatísticas de uso
      this.updateUsageStats(keyData, true);

      return {
        success: true,
        text: text,
        keyUsed: keyData.type,
        keyIndex: keyData.index,
        tokensUsed: this.estimateTokens(prompt + text)
      };

    } catch (error) {
      console.error(`❌ Erro na API ${keyData.type}-${keyData.index}:`, error.message);

      // Atualizar estatísticas de erro
      this.updateUsageStats(keyData, false);

      // Desativar temporariamente se muitos erros
      const cacheKey = this.getCacheKey(keyData.key);
      const quota = this.quotaCache.get(cacheKey);
      if (quota && quota.errors >= 5) {
        keyData.isActive = false;
        console.warn(`⚠️ Chave ${keyData.type}-${keyData.index} desativada por muitos erros`);
      }

      throw error;
    }
  }

  updateUsageStats(keyData, success) {
    const cacheKey = this.getCacheKey(keyData.key);
    const quota = this.quotaCache.get(cacheKey) || {
      used: 0,
      date: new Date().toDateString(),
      errors: 0
    };

    if (success) {
      quota.used++;
      keyData.used++;
      keyData.lastUsed = new Date();
    } else {
      quota.errors++;
      keyData.errors++;
    }

    this.quotaCache.set(cacheKey, quota);
  }

  estimateTokens(text) {
    // Estimativa aproximada: ~4 caracteres por token
    return Math.ceil(text.length / 4);
  }

  async generateResponse(prompt, options = {}) {
    const maxRetries = this.freeKeys.length + this.paidKeys.length;
    let attempt = 0;

    // Tentativa 1: Chaves gratuitas
    while (attempt < maxRetries) {
      const freeKey = this.getAvailableFreeKey();

      if (freeKey) {
        try {
          console.log(`🆓 Usando chave gratuita ${freeKey.type}-${freeKey.index}`);
          return await this.callGemini(freeKey, prompt, options);
        } catch (error) {
          console.warn(`⚠️ Chave gratuita ${freeKey.index} falhou, tentando próxima...`);
          attempt++;
          continue;
        }
      } else {
        console.log('ℹ️ Todas as chaves gratuitas esgotadas, usando chave paga...');
        break;
      }
    }

    // Tentativa 2: Chaves pagas
    const paidKey = this.getPaidKey();
    if (paidKey) {
      try {
        console.log(`💳 Usando chave paga ${paidKey.type}-${paidKey.index}`);
        return await this.callGemini(paidKey, prompt, options);
      } catch (error) {
        console.error('❌ Falha na chave paga:', error.message);
        throw new Error('Todas as chaves API falharam');
      }
    }

    throw new Error('Nenhuma chave API disponível');
  }

  getUsageStats() {
    const stats = {
      freeKeys: this.freeKeys.map(key => ({
        index: key.index,
        used: key.used,
        quota: key.dailyQuota,
        percentage: ((key.used / key.dailyQuota) * 100).toFixed(1),
        isActive: key.isActive,
        errors: key.errors
      })),
      paidKeys: this.paidKeys.map(key => ({
        index: key.index,
        used: key.used,
        isActive: key.isActive,
        errors: key.errors
      })),
      totalFreeUsage: this.freeKeys.reduce((sum, key) => sum + key.used, 0),
      totalFreeQuota: this.freeKeys.reduce((sum, key) => sum + key.dailyQuota, 0)
    };

    stats.economyPercentage = ((stats.totalFreeUsage / (stats.totalFreeUsage + this.paidKeys.reduce((sum, key) => sum + key.used, 0))) * 100).toFixed(1);

    return stats;
  }

  async healthCheck() {
    const results = {
      freeKeys: [],
      paidKeys: [],
      totalActive: 0,
      timestamp: new Date().toISOString()
    };

    // Test free keys
    for (const key of this.freeKeys) {
      try {
        await this.callGemini(key, 'Test', { maxOutputTokens: 10 });
        results.freeKeys.push({ index: key.index, status: 'active' });
        results.totalActive++;
      } catch (error) {
        results.freeKeys.push({ index: key.index, status: 'error', error: error.message });
      }
    }

    // Test paid keys
    for (const key of this.paidKeys) {
      try {
        await this.callGemini(key, 'Test', { maxOutputTokens: 10 });
        results.paidKeys.push({ index: key.index, status: 'active' });
        results.totalActive++;
      } catch (error) {
        results.paidKeys.push({ index: key.index, status: 'error', error: error.message });
      }
    }

    return results;
  }
}

// Singleton instance
let geminiManager = null;

function getGeminiManager() {
  if (!geminiManager) {
    geminiManager = new GeminiAPIManager();
  }
  return geminiManager;
}

module.exports = {
  GeminiAPIManager,
  getGeminiManager
};