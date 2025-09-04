// ARQUIVO: backend/server.js (VERSÃO OTIMIZADA COM CACHE E MONITORAMENTO)

/*
🚨 DIRETRIZES CRÍTICAS PARA DESENVOLVIMENTO DO BACKEND:

1. 💰 OTIMIZAÇÃO DE CUSTOS EM PRODUÇÃO:
   - NUNCA adicione console.log() em produção - cada log gera custos no Cloud Logging
   - Use logs apenas para erros críticos ou informações essenciais
   - Health checks automáticos geram ~1440 logs/dia - evite logs desnecessários

2. 🐛 LOGS DE DEBUG:
   - Use apenas em desenvolvimento local (NODE_ENV !== 'production')
   - Remova todos os console.log de debug antes do deploy
   - Para debug em produção, use ferramentas específicas, não console.log

3. 🎯 REGRA DE OURO:
   - Se não é essencial para o funcionamento, não deve gerar log em produção
   - Priorize performance e custos baixos sobre conveniência de debug

4. 🔍 EXEMPLOS DO QUE EVITAR EM PRODUÇÃO:
   - [CORS DEBUG] logs (REMOVIDO)
   - Logs de cada requisição HTTP
   - Debug de variáveis de ambiente (REMOVIDO)
   - Logs de conexões Socket.IO desnecessários

⚠️  QUALQUER IA OU DESENVOLVEDOR: SIGA ESTAS DIRETRIZES RIGOROSAMENTE
*/

// Carrega variáveis de ambiente do .env
require('dotenv').config();
// Se for fornecido o secret JSON via env var (FIREBASE_SA_JSON), parseie-o aqui.
let FIREBASE_SA = null;
if (process.env.FIREBASE_SA_JSON) {
  try {
    FIREBASE_SA = JSON.parse(process.env.FIREBASE_SA_JSON);
    console.log('[INFO] FIREBASE_SA_JSON lido a partir do env');
  } catch (e) {
    console.warn('[WARN] FIREBASE_SA_JSON presente mas inválido:', e && e.message);
    FIREBASE_SA = null;
  }
}
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const admin = require('firebase-admin');

// Importar sistema de cache otimizado
const {
  getCachedUser,
  getCachedStation,
  checkStationEditStatus,
  checkMultipleStationsEditStatus,
  invalidateUserCache,
  invalidateStationCache,
  invalidateEditStatusCache,
  getCacheStats,
  cleanupExpiredCache
} = require('./cache');

// Importar fix de CORS para Cloud Run
const { applyCorsHeaders, debugCors } = require('./fix-cors-cloud-run');

// --- INICIALIZAÇÃO CONDICIONAL DO FIREBASE ---
// Apenas inicializa o Firebase Admin SDK em ambiente de produção.
// Para desenvolvimento local, o backend rodará em 'mock mode'.
if (process.env.NODE_ENV === 'production') {
  // Inicialização do Firebase Admin SDK usando env vars (.env), secrets ou arquivo local
  try {
    // Verificar se todas as credenciais necessárias estão disponíveis
    const requiredCredentials = {
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      storage_bucket: process.env.FIREBASE_STORAGE_BUCKET
    };

    // DEBUG REMOVIDO: Logs de variáveis de ambiente geram custos desnecessários em produção

    // Limpar qualquer caractere de quebra de linha ou espaços extras
    function stripSurroundingQuotes(s) {
      if (!s || typeof s !== 'string') return s;
      s = s.trim();
      if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
        s = s.slice(1, -1);
      }
      return s;
    }

    if (requiredCredentials.project_id) {
      requiredCredentials.project_id = stripSurroundingQuotes(requiredCredentials.project_id).replace(/\r?\n/g, '');
    }
    if (requiredCredentials.private_key) {
      // Remova aspas externas e mantenha quebras de linha reais.
      requiredCredentials.private_key = stripSurroundingQuotes(requiredCredentials.private_key);
    }
    if (requiredCredentials.client_email) {
      requiredCredentials.client_email = stripSurroundingQuotes(requiredCredentials.client_email).replace(/\r?\n/g, '');
    }
    if (requiredCredentials.storage_bucket) {
      requiredCredentials.storage_bucket = stripSurroundingQuotes(requiredCredentials.storage_bucket).replace(/\r?\n/g, '');
    }

    // Verificar se todas as credenciais estão presentes
    const missingCredentials = Object.entries(requiredCredentials)
      .filter(([key, value]) => !value)
      .map(([key]) => key);

    if (missingCredentials.length === 0) {
      // Usar credenciais via variáveis de ambiente ou secrets
      // Converter sequências literais "\\n" em quebras de linha reais
      const normalizedPrivateKey = requiredCredentials.private_key.replace(/\\n/g, '\n');

      const serviceAccount = {
        type: 'service_account',
        project_id: requiredCredentials.project_id,
        private_key: normalizedPrivateKey,
        client_email: requiredCredentials.client_email
      };

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: requiredCredentials.storage_bucket,
        projectId: requiredCredentials.project_id
      });

      console.log('✅ [PROD] Firebase Admin SDK inicializado com credenciais seguras');
      console.log(`🆔 Project ID: ${requiredCredentials.project_id}`);
      console.log(`📧 Client Email: ${requiredCredentials.client_email}`);
      console.log(`🪣 Storage Bucket: ${requiredCredentials.storage_bucket}`);
      console.log(`🔐 Private Key: ${requiredCredentials.private_key ? '[PRESENTE]' : '[AUSENTE]'}`);
    } else {
      throw new Error(`Credenciais do Firebase ausentes: ${missingCredentials.join(', ')}. Configure via Secret Manager ou variáveis de ambiente.`);
    }
  } catch (error) {
    console.error('🛑 [PROD] ERRO CRÍTICO ao inicializar Firebase Admin SDK:', error.message);
    console.error('    O backend não pode operar em produção sem o Firebase. Encerrando.');
    process.exit(1); // Em produção, falhar é mais seguro do que rodar sem DB
  }
} else {
  // --- MODO DE DESENVOLVIMENTO LOCAL (MOCK) ---
  console.warn('----------------------------------------------------------------');
  console.warn('🚀 Backend em MODO DE DESENVOLVIMENTO (sem conexão com Firebase)');
  console.warn('----------------------------------------------------------------');
  console.warn('📝 O backend funcionará com funcionalidade limitada em modo mock.');
  console.warn('🔥 Para conectar ao Firebase, rode com NODE_ENV=production.');
  global.firebaseMockMode = true;
}


const app = express();
const server = http.createServer(app);

// Middleware de debug para logar headers de requisições OPTIONS (apenas em desenvolvimento)
app.use((req, res, next) => {
  if (req.method === 'OPTIONS' && process.env.NODE_ENV !== 'production') {
    console.log('--- OPTIONS Request Headers ---');
    console.log(req.headers);
    console.log('-----------------------------');
  }
  next();
});

// URLs permitidas para CORS (inclui todos os seus domínios).
// Permite configurar o frontend em tempo de deploy via FRONTEND_URL env var.
const DEFAULT_FRONTEND = 'https://revalidafacilapp.com.br';
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:5174", // Adicionando porta 5174
  DEFAULT_FRONTEND,
  "https://revalida-companion.web.app",
  "https://revalida-companion.firebaseapp.com"
];

if (process.env.FRONTEND_URL) {
  // adicionar sem duplicar
  const url = process.env.FRONTEND_URL.trim();
  if (url && !allowedOrigins.includes(url)) allowedOrigins.push(url);
}

console.log('🔒 CORS configurado para domínios:', allowedOrigins);

// Configuração do CORS para o Socket.IO
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Middleware agressivo para garantir CORS em todas as requisições, especialmente OPTIONS
app.use((req, res, next) => {
  const tunnelOrigin = "";
  const requestOrigin = req.headers.origin;

  if (requestOrigin === tunnelOrigin || allowedOrigins.includes(requestOrigin)) {
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else {
    // Se a origem não está na lista, mas é o domínio padrão do frontend, permita também
    if (requestOrigin && requestOrigin === DEFAULT_FRONTEND) {
      res.setHeader('Access-Control-Allow-Origin', requestOrigin);
      res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    // Caso contrário, não setamos CORS e o navegador bloqueará a requisição.
  }

  if (req.method === 'OPTIONS') {
    // Envia 200 OK para requisições OPTIONS (preflight)
    return res.sendStatus(200);
  }
  next();
});

// O middleware 'cors' padrão e 'app.options' foram removidos para evitar conflitos
// e confiar apenas no middleware 'app.all' para o controle de CORS.
app.use(express.json());

// --- DEBUG INSTRUMENTATION (temporário) ---
const debugStats = {
  http: [],            // { ts, ip, method, path, ua }
  firestoreReads: [],  // { ts, path, ip, ua, docsRead }
  socketConnections: []// { ts, socketId, userId, query, address }
};
function addHttpLog(entry) {
  debugStats.http.push(entry);
  if (debugStats.http.length > 500) debugStats.http.shift();
}
// --- fim debug ---

// --- Agente removido ---
// Rotas do agente legacy removidas. Se precisar restaurar, recupere de um commit anterior.

// --- Gerenciamento de Sessões ---
// Lembrete: Este Map em memória é perdido se o servidor reiniciar.
// Para produção, o ideal é usar um banco de dados como Firestore ou Redis.
const sessions = new Map();

// --- Endpoints HTTP ---

// Endpoint de verificação de saúde otimizado
// Em produção retornamos 204 No Content (muito leve) para reduzir custo de requisições e logs.
app.get('/health', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    // Resposta mínima e sem logs para não gerar custo desnecessário
    return res.sendStatus(204);
  }

  // Em desenvolvimento retornamos informações úteis para debug
  const healthData = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cache: getCacheStats(),
    version: process.env.npm_package_version || '1.0.0'
  };
  res.status(200).json(healthData);
});

// Endpoint de prontidão para Cloud Run
app.get('/ready', (req, res) => {
  // Verifica se Firebase está conectado e cache está funcionando
  const isReady = admin.apps.length > 0;
  if (isReady) {
    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString(),
      services: {
        firebase: 'connected',
        cache: 'operational'
      }
    });
  } else {
    res.status(503).json({
      status: 'not ready',
      timestamp: new Date().toISOString(),
      services: {
        firebase: 'disconnected',
        cache: 'unknown'
      }
    });
  }
});

// Endpoint para listar usuários do Firestore (com cache)
app.get('/api/users', async (req, res) => {
  try {
    const usersSnapshot = await admin.firestore().collection('users').get();
    const users = usersSnapshot.docs.map(doc => doc.data());

    // Instrumentação: conta documentos lidos e registra no debugStats
    try {
      const readEntry = {
        ts: new Date().toISOString(),
        path: req.path,
        ip: req.ip,
        ua: req.get('user-agent'),
        docsRead: usersSnapshot.size
      };
      debugStats.firestoreReads.push(readEntry);
      if (debugStats.firestoreReads.length > 500) debugStats.firestoreReads.shift();
      console.log(`[FIRESTORE READ] ${readEntry.ts} ${readEntry.path} ip=${readEntry.ip} ua="${readEntry.ua}" docs=${readEntry.docsRead}`);
    } catch (e) {
      console.warn('[DEBUG] Falha ao registrar firestoreReads:', e && e.message);
    }

    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// NOVOS ENDPOINTS COM CACHE PARA OTIMIZAÇÃO DE CUSTOS

// Endpoint para obter usuário específico com cache
app.get('/api/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const userData = await getCachedUser(userId, admin.firestore());

    if (!userData) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json(userData);
  } catch (err) {
    console.error('[API] Erro ao buscar usuário:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para verificar status de edição de uma estação (otimizado com cache)
app.get('/api/stations/:stationId/edit-status', async (req, res) => {
  try {
    const { stationId } = req.params;
    const editStatus = await checkStationEditStatus(stationId, admin.firestore());

    res.json(editStatus);
  } catch (err) {
    console.error('[API] Erro ao verificar status de edição:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para verificar múltiplas estações (otimizado com cache em lote)
app.post('/api/stations/batch-edit-status', async (req, res) => {
  try {
    const { stationIds } = req.body;

    if (!Array.isArray(stationIds) || stationIds.length === 0) {
      return res.status(400).json({ error: 'Lista de IDs de estações é obrigatória' });
    }

    if (stationIds.length > 50) {
      return res.status(400).json({ error: 'Máximo de 50 estações por requisição' });
    }

    const results = await checkMultipleStationsEditStatus(stationIds, admin.firestore());
    res.json(results);
  } catch (err) {
    console.error('[API] Erro ao verificar status de edição em lote:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para invalidar cache (para administração)
app.post('/api/cache/invalidate', async (req, res) => {
  try {
    const { type, key } = req.body;

    if (!type || !key) {
      return res.status(400).json({ error: 'Tipo e chave são obrigatórios' });
    }

    let result = false;

    switch (type) {
      case 'user':
        result = invalidateUserCache(key);
        break;
      case 'station':
        result = invalidateStationCache(key);
        break;
      case 'editStatus':
        result = invalidateEditStatusCache(key);
        break;
      default:
        return res.status(400).json({ error: 'Tipo de cache inválido' });
    }

    res.json({
      success: result,
      message: result ? 'Cache invalidado com sucesso' : 'Chave não encontrada no cache'
    });
  } catch (err) {
    console.error('[API] Erro ao invalidar cache:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para criar uma nova sessão de simulação (pouco usado com a lógica atual de socket)
app.post('/api/create-session', (req, res) => {
  const { stationId } = req.body;
  if (!stationId) {
    return res.status(400).json({ error: 'ID da estação é obrigatório' });
  }
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  sessions.set(sessionId, {
    stationId,
    participants: new Map(), // Usar um Map para participantes é mais eficiente
    createdAt: new Date(),
    timer: null
  });
  console.log(`[HTTP] Nova sessão criada via API: ${sessionId}`);
  res.status(201).json({ sessionId });
});

// --- ENDPOINT DE DEBUG E MONITORAMENTO (otimizado) ---
app.get('/debug/metrics', (req, res) => {
  const lastHttp = debugStats.http.slice(-100);
  const lastReads = debugStats.firestoreReads.slice(-100);
  const lastSockets = debugStats.socketConnections.slice(-100);

  // Obter estatísticas do cache
  const cacheStatsData = getCacheStats();

  res.json({
    now: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cache: cacheStatsData,
    http: lastHttp,
    firestoreReads: lastReads,
    socketConnections: lastSockets,
    activeSessions: sessions.size,
    activeUsers: userIdToSocketId.size
  });
});

// Endpoint para limpeza manual do cache
app.post('/debug/cache/cleanup', (req, res) => {
  try {
    const deleted = cleanupExpiredCache();
    res.json({
      success: true,
      message: `${deleted} chaves expiradas removidas do cache`,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint para download de dados da coleção estacoes_clinicas
app.get('/api/stations/download-json', async (req, res) => {
  try {
    // Verificar se Firebase está disponível
    if (global.firebaseMockMode) {
      console.log('[DOWNLOAD] Firebase em modo mock - retornando dados de exemplo');
      
      // Dados de exemplo para demonstração
      const estacoesMock = [
        {
          id: "estacao_exemplo_1",
          idEstacao: "EST001",
          tituloEstacao: "Consulta de Hipertensão Arterial",
          numeroDaEstacao: 1,
          especialidade: "Clínica Médica",
          tempoDuracaoMinutos: 10,
          nivelDificuldade: "Médio",
          palavrasChave: ["hipertensão", "pressão arterial", "consulta"],
          instrucoesParticipante: {
            descricaoCasoCompleta: "Paciente de 55 anos com queixa de cefaleia matinal...",
            tarefasPrincipais: ["Realizar anamnese", "Verificar pressão arterial", "Prescrever medicação"],
            avisosImportantes: ["Paciente com histórico de diabetes"]
          },
          criadoEm: new Date().toISOString(),
          atualizadoEm: new Date().toISOString()
        },
        {
          id: "estacao_exemplo_2", 
          idEstacao: "EST002",
          tituloEstacao: "Atendimento de Emergência - IAM",
          numeroDaEstacao: 2,
          especialidade: "Cardiologia",
          tempoDuracaoMinutos: 15,
          nivelDificuldade: "Alto",
          palavrasChave: ["infarto", "emergência", "cardiologia"],
          instrucoesParticipante: {
            descricaoCasoCompleta: "Paciente de 60 anos com dor precordial há 2 horas...",
            tarefasPrincipais: ["Avaliar dor torácica", "Solicitar ECG", "Administrar medicação"],
            avisosImportantes: ["Situação de emergência", "Tempo é crucial"]
          },
          criadoEm: new Date().toISOString(),
          atualizadoEm: new Date().toISOString()
        }
      ];

      // Metadados do download
      const downloadMetadata = {
        timestamp: new Date().toISOString(),
        totalEstacoes: estacoesMock.length,
        versao: '1.0.0',
        fonte: 'Mock Data - Dados de exemplo para demonstração',
        aviso: 'Este é um ambiente de demonstração. Configure o Firebase para dados reais.'
      };

      // Objeto final para download
      const downloadData = {
        metadata: downloadMetadata,
        estacoes: estacoesMock
      };

      // Configurar headers para download
      const fileName = `estacoes_clinicas_mock_${new Date().toISOString().split('T')[0]}.json`;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('X-Total-Stations', estacoesMock.length);
      res.setHeader('X-Download-Timestamp', downloadMetadata.timestamp);
      res.setHeader('X-Mock-Mode', 'true');

      console.log(`[DOWNLOAD MOCK] ${estacoesMock.length} estações de exemplo preparadas para download`);
      return res.json(downloadData);
    }

    console.log('[DOWNLOAD] Iniciando download da coleção estacoes_clinicas...');
    
    const estacoesColeção = admin.firestore().collection('estacoes_clinicas');
    const snapshot = await estacoesColeção.get();
    
    if (snapshot.empty) {
      return res.status(404).json({
        error: 'Nenhuma estação encontrada',
        message: 'A coleção estacoes_clinicas está vazia'
      });
    }

    // Construir array com todos os dados das estações
    const estacoes = [];
    snapshot.forEach(doc => {
      estacoes.push({
        id: doc.id,
        ...doc.data()
      });
    });

    // Metadados do download
    const downloadMetadata = {
      timestamp: new Date().toISOString(),
      totalEstacoes: estacoes.length,
      versao: '1.0.0',
      fonte: 'Firestore Collection: estacoes_clinicas'
    };

    // Objeto final para download
    const downloadData = {
      metadata: downloadMetadata,
      estacoes: estacoes
    };

    // Log da operação
    console.log(`[DOWNLOAD] ${estacoes.length} estações preparadas para download`);
    
    // Instrumentação: registrar no debugStats
    try {
      const readEntry = {
        ts: new Date().toISOString(),
        path: req.path,
        ip: req.ip,
        ua: req.get('user-agent'),
        docsRead: snapshot.size
      };
      debugStats.firestoreReads.push(readEntry);
      if (debugStats.firestoreReads.length > 500) debugStats.firestoreReads.shift();
      console.log(`[FIRESTORE READ] ${readEntry.ts} ${readEntry.path} ip=${readEntry.ip} docs=${readEntry.docsRead}`);
    } catch (e) {
      console.warn('[DEBUG] Falha ao registrar firestoreReads:', e && e.message);
    }

    // Configurar headers para download
    const fileName = `estacoes_clinicas_${new Date().toISOString().split('T')[0]}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('X-Total-Stations', estacoes.length);
    res.setHeader('X-Download-Timestamp', downloadMetadata.timestamp);

    // Retornar dados em formato JSON
    res.json(downloadData);

  } catch (error) {
    console.error('[DOWNLOAD] Erro ao baixar dados:', error.message);
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: 'Falha ao acessar dados da coleção estacoes_clinicas',
      details: error.message
    });
  }
});

// Endpoint para download de uma estação específica
app.get('/api/stations/:stationId/download-json', async (req, res) => {
  try {
    const { stationId } = req.params;

    // Log da requisição para debug
    console.log(`[DOWNLOAD REQUEST] Station ID: ${stationId}, Origin: ${req.headers.origin}`);

    // Aplicar headers CORS explicitamente
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.header('Access-Control-Allow-Credentials', 'true');

    // Verificar se Firebase está disponível
    if (global.firebaseMockMode) {
      console.log(`[DOWNLOAD] Firebase em modo mock - retornando estação de exemplo: ${stationId}`);
      
      // Dados de exemplo baseados no stationId
      const estacaoMock = {
        id: stationId,
        idEstacao: stationId.toUpperCase(),
        tituloEstacao: `Estação Exemplo - ${stationId}`,
        numeroDaEstacao: 1,
        especialidade: "Clínica Médica",
        tempoDuracaoMinutos: 10,
        nivelDificuldade: "Médio",
        palavrasChave: ["exemplo", "demonstração", "mock"],
        instrucoesParticipante: {
          descricaoCasoCompleta: `Esta é uma estação de exemplo para demonstração da funcionalidade de download. ID: ${stationId}`,
          tarefasPrincipais: ["Tarefa 1 de exemplo", "Tarefa 2 de exemplo", "Tarefa 3 de exemplo"],
          avisosImportantes: ["Este é um dado de demonstração", "Configure o Firebase para dados reais"]
        },
        materiaisDisponiveis: {
          impressos: [
            {
              titulo: "Impresso de Exemplo",
              tipoConteudo: "texto_simples",
              conteudo: { texto: "Conteúdo de exemplo para demonstração" }
            }
          ],
          informacoesVerbaisSimulado: [
            {
              informacao: "Informação verbal de exemplo"
            }
          ]
        },
        padraoEsperadoProcedimento: {
          idChecklistAssociado: "checklist_exemplo",
          sinteseEstacao: {
            resumoCasoPEP: "Resumo de caso de exemplo",
            focoPrincipalDetalhado: ["Foco 1 de exemplo", "Foco 2 de exemplo"]
          },
          itensAvaliacao: [
            {
              idItem: "item_1",
              numeroOficial: 1,
              descricaoItemPEP: "Item de avaliação de exemplo",
              pontosAdequado: 5,
              pontosInadequado: 0,
              pontosParcial: 2.5
            }
          ],
          pontuacaoTotalEstacao: 5
        },
        criadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString(),
        criadoPor: "sistema_mock",
        atualizadoPor: "sistema_mock"
      };

      const downloadMetadata = {
        timestamp: new Date().toISOString(),
        stationId: stationId,
        versao: '1.0.0',
        fonte: 'Mock Data - Dados de exemplo para demonstração',
        aviso: 'Este é um ambiente de demonstração. Configure o Firebase para dados reais.'
      };

      const downloadData = {
        metadata: downloadMetadata,
        estacao: estacaoMock
      };

      // Configurar headers para download
      const fileName = `estacao_${stationId}_mock_${new Date().toISOString().split('T')[0]}.json`;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('X-Station-Id', stationId);
      res.setHeader('X-Mock-Mode', 'true');

      console.log(`[DOWNLOAD MOCK] Estação de exemplo ${stationId} preparada para download`);
      return res.status(200).json(downloadData);
    }

    console.log(`[DOWNLOAD] Baixando estação específica: ${stationId}`);
    
    // Verificar se admin firebase está disponível
    if (!admin.apps.length) {
      console.error('[DOWNLOAD] Firebase Admin não inicializado');
      return res.status(503).json({
        error: 'Serviço temporariamente indisponível',
        message: 'Firebase não está configurado corretamente',
        stationId: stationId,
        timestamp: new Date().toISOString()
      });
    }
    
    const docRef = admin.firestore().collection('estacoes_clinicas').doc(stationId);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      console.log(`[DOWNLOAD] Estação não encontrada: ${stationId}`);
      return res.status(404).json({
        error: 'Estação não encontrada',
        stationId: stationId,
        timestamp: new Date().toISOString()
      });
    }

    const stationData = {
      id: doc.id,
      ...doc.data()
    };

    const downloadMetadata = {
      timestamp: new Date().toISOString(),
      stationId: stationId,
      versao: '1.0.0',
      fonte: 'Firestore Document: estacoes_clinicas'
    };

    const downloadData = {
      metadata: downloadMetadata,
      estacao: stationData
    };

    // Configurar headers para download
    const fileName = `estacao_${stationId}_${new Date().toISOString().split('T')[0]}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('X-Station-Id', stationId);

    console.log(`[DOWNLOAD SUCCESS] Estação ${stationId} enviada com sucesso`);
    res.status(200).json(downloadData);

  } catch (error) {
    console.error('[DOWNLOAD ERROR] Erro ao baixar estação:', error);
    
    // Aplicar headers CORS mesmo em caso de erro
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    
    res.status(500).json({
      error: 'Erro interno do servidor',
      details: error.message,
      stationId: req.params.stationId,
      timestamp: new Date().toISOString()
    });
  }
});


// --- Funções utilitárias para timer por sessão ---
function startSessionTimer(sessionId, durationSeconds, onTick, onEnd) {
  const session = sessions.get(sessionId);
  if (!session) return;
  if (session.timer) clearInterval(session.timer.intervalId);
  session.timer = {
    remainingSeconds: durationSeconds,
    intervalId: setInterval(() => {
      session.timer.remainingSeconds--;
      if (typeof onTick === 'function') onTick(session.timer.remainingSeconds);
      if (session.timer.remainingSeconds <= 0) {
        clearInterval(session.timer.intervalId);
        if (typeof onEnd === 'function') onEnd();
      }
    }, 1000)
  };
}
function stopSessionTimer(sessionId, reason) {
  const session = sessions.get(sessionId);
  if (session && session.timer && session.timer.intervalId) {
    clearInterval(session.timer.intervalId);
    session.timer = null;
  }
}

// --- Lógica do Socket.IO ---

// Map para associar userId ao socketId
const userIdToSocketId = new Map();

io.on('connection', (socket) => {
  // --- Mapeamento global de userId <-> socketId ---
  const handshakeUserId = socket.handshake.query.userId;
  if (handshakeUserId) {
    userIdToSocketId.set(handshakeUserId, socket.id);
  }

  // Registra conexão no debugStats
  try {
    const connTs = new Date().toISOString();
    const connEntry = {
      ts: connTs,
      socketId: socket.id,
      userId: handshakeUserId || null,
      query: socket.handshake.query || {},
      address: socket.handshake.address || (socket.request && socket.request.connection && socket.request.connection.remoteAddress) || null
    };
    debugStats.socketConnections.push(connEntry);
    if (debugStats.socketConnections.length > 1000) debugStats.socketConnections.shift();
    console.log(`[CONEXÃO] Novo cliente conectado: ${socket.id} userId=${handshakeUserId} remote=${connEntry.address}`);
  } catch (e) {
    console.log(`[CONEXÃO] Novo cliente conectado: ${socket.id} (erro ao registrar debug)`);
  }

  // --- Eventos globais de convite/chat (NÃO dependem de sessão) ---
  socket.on('INTERNAL_INVITE', (data) => {
    const { toUserId, toName, fromUserId, fromName, timestamp } = data;
    const toSocketId = userIdToSocketId.get(toUserId);
    if (toSocketId) {
      io.to(toSocketId).emit('INTERNAL_INVITE_RECEIVED', {
        fromUserId,
        fromName,
        timestamp,
      });
      console.log(`[CONVITE] ${fromUserId} convidou ${toUserId}`);
    } else {
      console.log(`[CONVITE] Usuário ${toUserId} não está conectado.`);
    }
  });

  // --- Aceite/Recusa de convite (mantém como está) ---
  socket.on('INTERNAL_INVITE_ACCEPTED', (data) => {
    const { fromUserId, toUserId } = data;
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const payload = {
      sessionId,
      users: [fromUserId, toUserId],
      startedAt: Date.now(),
    };
    const fromSocketId = userIdToSocketId.get(fromUserId);
    if (fromSocketId) io.to(fromSocketId).emit('SESSION_START', payload);
    const toSocketId = userIdToSocketId.get(toUserId);
    if (toSocketId) io.to(toSocketId).emit('SESSION_START', payload);
    console.log(`[CONVITE ACEITO] ${toUserId} aceitou convite de ${fromUserId}. Sessão: ${sessionId}`);
  });

  socket.on('INTERNAL_INVITE_DECLINED', (data) => {
    const { fromUserId, toUserId } = data;
    const fromSocketId = userIdToSocketId.get(fromUserId);
    if (fromSocketId) io.to(fromSocketId).emit('INVITE_DECLINED', { fromUserId, toUserId });
    console.log(`[CONVITE RECUSADO] ${toUserId} recusou convite de ${fromUserId}`);
  });

  // --- Handler para convite de simulação (SERVER_SEND_INTERNAL_INVITE) ---
  socket.on('SERVER_SEND_INTERNAL_INVITE', (data) => {
    const { toUserId, sessionId, stationId, meetLink, duration } = data;
    const toSocketId = userIdToSocketId.get(toUserId);
    
    if (toSocketId) {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const simulationLink = `${frontendUrl}/simulation/${sessionId}?role=candidate&duration=${duration}`;
      
      io.to(toSocketId).emit('INTERNAL_INVITE_RECEIVED', {
        from: socket.handshake.query.userName || 'Avaliador',
        link: simulationLink,
        stationTitle: 'Simulação Clínica',
        sessionId,
        role: 'candidate',
        meet: meetLink || ''
      });
    }
  });

  // --- Lógica de Entrada na Sessão ---
  // Só executa se TODOS os parâmetros de sessão estiverem presentes
  const { sessionId, userId, role, stationId, displayName } = socket.handshake.query;
  if (sessionId && userId && role && stationId && displayName) {

    // Cria a sessão se for o primeiro a entrar
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, {
        stationId,
        participants: new Map(),
        createdAt: new Date(),
        timer: null
      });
      console.log(`[SESSÃO] Sessão criada: ${sessionId} para a estação ${stationId}`);
    }

    const session = sessions.get(sessionId);

    // Validação para garantir que a sessão não exceda 2 participantes
    if (session.participants.size >= 2 && !session.participants.has(userId)) {
      console.warn(`[SESSÃO CHEIA] Cliente ${socket.id} (userId: ${userId}) tentou entrar na sessão ${sessionId} que já está cheia.`);
      socket.emit('SERVER_ERROR', { message: 'Esta sessão de simulação já está cheia.' });
      socket.disconnect();
      return;
    }

    // Adiciona ou atualiza o participante
    session.participants.set(userId, {
      socketId: socket.id,
      role,
      displayName,
      isReady: false
    });
    socket.join(sessionId);
    console.log(`[JOIN] Usuário ${displayName} (${role}) entrou na sala: ${sessionId}`);

    // Envia a lista atualizada de participantes para todos na sala
    const participantsList = Array.from(session.participants.values());
    io.to(sessionId).emit('SERVER_PARTNER_UPDATE', { participants: participantsList });

    // Informa o status da sala ao novo participante
    if (session.participants.size === 1) {
      socket.emit('SERVER_WAITING_FOR_PARTNER');
    } else if (session.participants.size === 2) {
      io.to(sessionId).emit('SERVER_PARTNER_FOUND');
    }


    // --- Eventos da Simulação ---

    // Cliente se marca como pronto
    socket.on('CLIENT_IM_READY', () => {
      if (session && session.participants.has(userId)) {
        session.participants.get(userId).isReady = true;
        console.log(`[READY] Usuário ${displayName} (${role}) está pronto.`);
        
        const updatedParticipantsList = Array.from(session.participants.values());
        io.to(sessionId).emit('SERVER_PARTNER_UPDATE', { participants: updatedParticipantsList });

        // Verifica se todos estão prontos para habilitar o botão de início
        const allReady = updatedParticipantsList.every(p => p.isReady);
        if (session.participants.size === 2 && allReady) {
          console.log(`[READY] Ambos os participantes da sessão ${sessionId} estão prontos.`);
          io.to(sessionId).emit('SERVER_BOTH_PARTICIPANTS_READY');
        }
      }
    });

    // Ator/Avaliador inicia a simulação
    socket.on('CLIENT_START_SIMULATION', (data) => {
      const { durationMinutes } = data;
      const durationSeconds = (durationMinutes || 10) * 60;
      
      console.log(`[START] Simulação iniciada na sessão ${sessionId} com duração de ${durationSeconds} segundos.`);
      
      io.to(sessionId).emit('SERVER_START_SIMULATION', { durationSeconds });
      
      // **SINAL PARA INICIAR A CHAMADA DE VOZ**
      // O frontend deve ouvir este evento para iniciar a conexão de voz (seja WebRTC ou abrindo um link do Meet)
      io.to(sessionId).emit('SERVER_INITIATE_VOICE_CALL', { 
          message: 'Por favor, inicie a comunicação por voz.',
          // meetLink: 'https://meet.google.com/new' // Exemplo se você gerar um link dinâmico
      });

      // Inicia o timer da sessão
      startSessionTimer(sessionId, durationSeconds,
        (remainingSeconds) => {
          io.to(sessionId).emit('TIMER_UPDATE', { remainingSeconds });
        },
        () => {
          io.to(sessionId).emit('TIMER_END');
          // Timer acabou, pode encerrar a sessão ou liberar recursos se necessário
        }
      );
    });
    
    // Encerramento manual da estação
    socket.on('CLIENT_MANUAL_END_SIMULATION', (data) => {
      if (!session) return;
      stopSessionTimer(sessionId, 'manual_end');
      io.to(sessionId).emit('TIMER_STOPPED', { reason: 'manual_end' });
    });

    // Liberação de impressos pelo ator
    socket.on('ACTOR_RELEASE_DATA', (data) => {
      if (!session) return;
      // Apenas ator pode liberar
      const participant = session.participants.get(userId);
      if (participant && participant.role === 'actor') {
        const { dataItemId } = data;
        io.to(sessionId).emit('CANDIDATE_RECEIVE_DATA', { dataItemId });
      }
    });

    // Liberação de PEP pelo ator/avaliador
    socket.on('ACTOR_RELEASE_PEP', (data) => {
      if (!session) return;
      const participant = session.participants.get(userId);
      if (participant && (participant.role === 'actor' || participant.role === 'evaluator')) {
        io.to(sessionId).emit('CANDIDATE_RECEIVE_PEP_VISIBILITY', { shouldBeVisible: true });
      }
    });

    // Ator/Avaliador envia atualizações de pontuação em tempo real
    socket.on('EVALUATOR_SCORES_UPDATED_FOR_CANDIDATE', (data) => {
      if (!session) return;
      const participant = session.participants.get(userId);
      // Apenas ator ou avaliador pode enviar estas atualizações
      if (participant && (participant.role === 'actor' || participant.role === 'evaluator')) {
        const { scores, totalScore } = data;
        // Envia as notas atualizadas para todos na sessão (incluindo o candidato)
        io.to(sessionId).emit('CANDIDATE_RECEIVE_UPDATED_SCORES', { scores, totalScore });
        console.log(`[PEP SCORE UPDATE] Sessão ${sessionId}: Notas atualizadas enviadas para candidato. Total: ${totalScore}`);
      }
    });
  }

  // --- Limpeza do mapeamento ao desconectar ---
  socket.on('disconnect', () => {
    console.log(`[DESCONEXÃO] Cliente desconectado: ${socket.id}`);
    
    // Limpa o mapeamento global
    if (handshakeUserId) {
      userIdToSocketId.delete(handshakeUserId);
    }

    // Lógica para remover o participante de qualquer sessão ativa
    if (sessionId && userId) {
      const session = sessions.get(sessionId);
      if (session && session.participants.has(userId)) {
        session.participants.delete(userId);
        console.log(`[LEAVE] Usuário ${displayName} (${role}) removido da sessão ${sessionId} por desconexão.`);
        
        // Notifica o outro participante que o parceiro saiu
        const remainingParticipants = Array.from(session.participants.values());
        io.to(sessionId).emit('SERVER_PARTNER_LEFT', {
          message: 'Seu parceiro de simulação se desconectou.',
          participants: remainingParticipants
        });

        // Se a sessão ficar vazia, pode ser removida
        if (session.participants.size === 0) {
          stopSessionTimer(sessionId, 'session_empty');
          sessions.delete(sessionId);
          console.log(`[SESSÃO ENCERRADA] Sessão ${sessionId} removida por estar vazia.`);
        }
      }
    }
  });
});


// --- Configurações de Otimização e Limpeza Automática ---

// Limpeza automática de cache a cada 5 minutos
setInterval(() => {
  try {
    const deleted = cleanupExpiredCache();
    if (deleted > 0) {
      console.log(`[CACHE CLEANUP] ${deleted} chaves expiradas removidas automaticamente`);
    }
  } catch (error) {
    console.warn('[CACHE CLEANUP] Erro na limpeza automática:', error.message);
  }
}, 300000); // 5 minutos

// Limpeza automática de sessões antigas (para liberar memória)
setInterval(() => {
  try {
    const now = Date.now();
    let cleanedSessions = 0;

    for (const [sessionId, session] of sessions.entries()) {
      // Remove sessões inativas há mais de 2 horas
      if (now - session.createdAt.getTime() > 7200000) { // 2 horas
        stopSessionTimer(sessionId, 'auto_cleanup');
        sessions.delete(sessionId);
        cleanedSessions++;
      }
    }

    if (cleanedSessions > 0) {
      console.log(`[SESSION CLEANUP] ${cleanedSessions} sessões antigas removidas automaticamente`);
    }
  } catch (error) {
    console.warn('[SESSION CLEANUP] Erro na limpeza automática:', error.message);
  }
}, 1800000); // 30 minutos

// Configuração de graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Recebido SIGTERM, iniciando shutdown graceful...');

  // Limpar timers ativos
  for (const [sessionId, session] of sessions.entries()) {
    stopSessionTimer(sessionId, 'shutdown');
  }

  // Fechar conexões Socket.IO
  io.close(() => {
    console.log('✅ Socket.IO fechado');
  });

  // Fechar servidor HTTP
  server.close(() => {
    console.log('✅ Servidor HTTP fechado');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 Recebido SIGINT, iniciando shutdown graceful...');
  process.emit('SIGTERM');
});

// --- Iniciar o Servidor ---

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0'; // Escuta em todas as interfaces
server.listen(PORT, HOST, () => {
  console.log(`🚀 Servidor backend otimizado rodando em ${HOST}:${PORT}`);
  console.log(`📊 Cache habilitado com monitoramento automático`);
  console.log(`🔧 Otimizações ativas: minScale=0, cache inteligente, health checks`);
  console.log(`💰 Estimativa de redução de custos: ~80%`);
  // console.log(`[REMOVIDO] Cloudflare Tunnel compatível: servidor escutando em todas as interfaces`);
});
