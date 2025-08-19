// ARQUIVO: backend/server.js (VERSÃO REATORADA COM ATUALIZAÇÃO CORS)

// Carrega variáveis de ambiente do .env
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const admin = require('firebase-admin');

// Inicialização do Firebase Admin SDK usando env vars (.env) ou arquivo local
try {
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
    // Usar credenciais via variáveis de ambiente
    const serviceAccount = {
      type: 'service_account',
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_CLIENT_EMAIL
    };
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'revalida-companion.firebasestorage.app'
    });
    console.log('✅ Firebase Admin SDK inicializado com variáveis de ambiente');
  } else {
    // Fallback: usar arquivo de credenciais local
    const serviceAccount = require('./revalida-companion-firebase-adminsdk.json');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: 'revalida-companion.firebasestorage.app'
    });
    console.log('✅ Firebase Admin SDK inicializado com arquivo local');
  }
} catch (error) {
  console.warn('⚠️  Erro ao inicializar Firebase Admin SDK:', error.message);
  console.warn('📝 O agent funcionará com funcionalidade limitada em modo mock');
  global.firebaseMockMode = true;
}

const app = express();
const server = http.createServer(app);

// URLs permitidas para CORS (inclui todos os seus domínios)
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173", 
  "https://revalida-companion.web.app",
  "https://revalida-companion.firebaseapp.com", 
  "https://revalidafacilapp.com.br"
];

console.log('🔒 CORS configurado para domínios:', allowedOrigins);

// Configuração do CORS para o Socket.IO
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Configuração do CORS para rotas HTTP
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.json());

// --- Importação das rotas do agente ---
const agentRoutes = require('./routes/agent');

// --- Configuração das rotas ---
app.use('/api/agent', agentRoutes);

// --- Gerenciamento de Sessões ---
// Lembrete: Este Map em memória é perdido se o servidor reiniciar.
// Para produção, o ideal é usar um banco de dados como Firestore ou Redis.
const sessions = new Map();

// --- Endpoints HTTP ---

// Endpoint de verificação de saúde
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date() });
});

// Endpoint para listar usuários do Firestore
app.get('/api/users', async (req, res) => {
  try {
    const usersSnapshot = await admin.firestore().collection('users').get();
    const users = usersSnapshot.docs.map(doc => doc.data());
    res.json(users);
  } catch (err) {
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

  console.log(`[CONEXÃO] Novo cliente conectado: ${socket.id}`);

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


// --- Iniciar o Servidor ---

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor backend rodando na porta ${PORT}`);
});
