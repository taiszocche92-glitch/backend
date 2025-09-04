// Sistema de Cache Local para Backend - Otimização de Custos Cloud Run
// Implementa cache inteligente para reduzir leituras no Firestore

const NodeCache = require('node-cache');

// Configuração do cache com TTL padrão de 5 minutos
const cache = new NodeCache({
  stdTTL: 300, // 5 minutos padrão
  checkperiod: 60, // Verifica expiração a cada 60 segundos
  maxKeys: 1000, // Limite máximo de 1000 chaves para controlar memória
  useClones: false // Melhor performance, mas cuidado com mutações
});

// Configurações específicas por tipo de dado
const CACHE_CONFIG = {
  // Cache de usuários - TTL mais longo pois dados mudam pouco
  users: { ttl: 600 }, // 10 minutos

  // Cache de estações - TTL médio
  stations: { ttl: 300 }, // 5 minutos

  // Cache de sessões ativas - TTL curto pois dados são voláteis
  sessions: { ttl: 60 }, // 1 minuto

  // Cache de verificações de edição - TTL muito curto para dados críticos
  editStatus: { ttl: 30 }, // 30 segundos

  // Cache de dados de simulação - TTL médio
  simulation: { ttl: 180 } // 3 minutos
};

// Estatísticas do cache para monitoramento
const cacheStats = {
  hits: 0,
  misses: 0,
  sets: 0,
  deletes: 0,
  keys: 0,
  memoryUsage: 0
};

// Função para gerar chave de cache consistente
function generateCacheKey(type, ...params) {
  return `${type}:${params.join(':')}`;
}

// Função para obter dados do cache com fallback
async function getCachedData(key, fetchFunction, ttl = null) {
  try {
    // Tenta obter do cache primeiro
    const cached = cache.get(key);

    if (cached !== undefined) {
      cacheStats.hits++;
      console.log(`[CACHE HIT] ${key}`);
      return cached;
    }

    // Cache miss - busca dados e armazena
    cacheStats.misses++;
    console.log(`[CACHE MISS] ${key} - Buscando dados...`);

    const data = await fetchFunction();

    // Armazena no cache com TTL específico ou padrão
    cache.set(key, data, ttl);
    cacheStats.sets++;

    return data;
  } catch (error) {
    console.error(`[CACHE ERROR] ${key}:`, error.message);
    // Em caso de erro, tenta buscar dados sem cache
    return await fetchFunction();
  }
}

// Função para invalidar cache específico
function invalidateCache(key) {
  const deleted = cache.del(key);
  if (deleted) {
    cacheStats.deletes++;
    console.log(`[CACHE INVALIDATE] ${key}`);
  }
  return deleted;
}

// Função para invalidar cache por padrão (ex: todos os usuários)
function invalidateCacheByPattern(pattern) {
  const keys = cache.keys();
  let deletedCount = 0;

  keys.forEach(key => {
    if (key.startsWith(pattern)) {
      cache.del(key);
      deletedCount++;
    }
  });

  if (deletedCount > 0) {
    cacheStats.deletes += deletedCount;
    console.log(`[CACHE INVALIDATE PATTERN] ${pattern} - ${deletedCount} chaves removidas`);
  }

  return deletedCount;
}

// Função para limpar cache expirado manualmente
function cleanupExpiredCache() {
  try {
    const stats = cache.flushStats();
    const deleted = stats && typeof stats.keys === 'number' ? stats.keys : 0;
    if (deleted > 0) {
      console.log(`[CACHE CLEANUP] ${deleted} chaves expiradas removidas`);
    }
    return deleted;
  } catch (error) {
    console.error('[CACHE CLEANUP ERROR]', error.message);
    return 0;
  }
}

// Função para obter estatísticas do cache
function getCacheStats() {
  const stats = cache.getStats();
  return {
    ...cacheStats,
    nodeCache: {
      keys: stats.keys,
      hits: stats.hits,
      misses: stats.misses,
      ksize: stats.ksize,
      vsize: stats.vsize
    },
    hitRate: cacheStats.hits / (cacheStats.hits + cacheStats.misses) * 100 || 0
  };
}

// Função para obter dados de usuário com cache
async function getCachedUser(userId, firestore) {
  const key = generateCacheKey('user', userId);
  const ttl = CACHE_CONFIG.users.ttl;

  return getCachedData(key, async () => {
    const userDoc = await firestore.collection('users').doc(userId).get();
    return userDoc.exists ? userDoc.data() : null;
  }, ttl);
}

// Função para obter dados de estação com cache
async function getCachedStation(stationId, firestore) {
  const key = generateCacheKey('station', stationId);
  const ttl = CACHE_CONFIG.stations.ttl;

  return getCachedData(key, async () => {
    const stationDoc = await firestore.collection('stations').doc(stationId).get();
    return stationDoc.exists ? stationDoc.data() : null;
  }, ttl);
}

// Função para verificar status de edição com cache inteligente
async function checkStationEditStatus(stationId, firestore) {
  const key = generateCacheKey('editStatus', stationId);
  const ttl = CACHE_CONFIG.editStatus.ttl;

  return getCachedData(key, async () => {
    const stationRef = firestore.collection('stations').doc(stationId);
    const stationDoc = await stationRef.get();

    if (!stationDoc.exists) {
      return { hasBeenEdited: false, lastEdited: null };
    }

    const data = stationDoc.data();
    return {
      hasBeenEdited: data.hasBeenEdited || false,
      lastEdited: data.lastEdited || null
    };
  }, ttl);
}

// Função para verificar múltiplas estações de uma vez (otimizada)
async function checkMultipleStationsEditStatus(stationIds, firestore) {
  const results = {};
  const uncachedIds = [];

  // Primeiro, verifica quais estão no cache
  stationIds.forEach(stationId => {
    const key = generateCacheKey('editStatus', stationId);
    const cached = cache.get(key);

    if (cached !== undefined) {
      cacheStats.hits++;
      results[stationId] = cached;
    } else {
      uncachedIds.push(stationId);
    }
  });

  // Se todas estão no cache, retorna imediatamente
  if (uncachedIds.length === 0) {
    console.log(`[CACHE HIT MULTIPLE] Todas as ${stationIds.length} estações no cache`);
    return results;
  }

  // Busca as estações não cacheadas em lote
  console.log(`[CACHE MISS MULTIPLE] Buscando ${uncachedIds.length} estações não cacheadas`);

  try {
    const stationRefs = uncachedIds.map(id => firestore.collection('stations').doc(id));
    const stationDocs = await firestore.getAll(...stationRefs);

    stationDocs.forEach((doc, index) => {
      const stationId = uncachedIds[index];
      const key = generateCacheKey('editStatus', stationId);
      const ttl = CACHE_CONFIG.editStatus.ttl;

      let data;
      if (doc.exists) {
        const docData = doc.data();
        data = {
          hasBeenEdited: docData.hasBeenEdited || false,
          lastEdited: docData.lastEdited || null
        };
      } else {
        data = { hasBeenEdited: false, lastEdited: null };
      }

      // Armazena no cache
      cache.set(key, data, ttl);
      cacheStats.sets++;

      results[stationId] = data;
    });

    cacheStats.misses += uncachedIds.length;

  } catch (error) {
    console.error('[CACHE ERROR MULTIPLE]', error.message);
    // Em caso de erro, marca todas como não editadas
    uncachedIds.forEach(stationId => {
      results[stationId] = { hasBeenEdited: false, lastEdited: null };
    });
  }

  return results;
}

// Função para invalidar cache de usuário (quando dados são atualizados)
function invalidateUserCache(userId) {
  const key = generateCacheKey('user', userId);
  return invalidateCache(key);
}

// Função para invalidar cache de estação
function invalidateStationCache(stationId) {
  const key = generateCacheKey('station', stationId);
  return invalidateCache(key);
}

// Função para invalidar cache de status de edição
function invalidateEditStatusCache(stationId) {
  const key = generateCacheKey('editStatus', stationId);
  return invalidateCache(key);
}

// Configura limpeza automática periódica
setInterval(() => {
  cleanupExpiredCache();
}, 300000); // A cada 5 minutos

// Exporta funções e configurações
module.exports = {
  cache,
  CACHE_CONFIG,
  generateCacheKey,
  getCachedData,
  invalidateCache,
  invalidateCacheByPattern,
  cleanupExpiredCache,
  getCacheStats,
  getCachedUser,
  getCachedStation,
  checkStationEditStatus,
  checkMultipleStationsEditStatus,
  invalidateUserCache,
  invalidateStationCache,
  invalidateEditStatusCache
};
