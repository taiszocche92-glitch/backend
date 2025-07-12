// ARQUIVO: backend/server.js (VERSÃO REATORADA)

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
const server = http.createServer(app);

// Inicializa o Firebase Admin
admin.initializeApp({
  credential: admin.credential.applicationDefault(), // ou use sua chave de serviço
});
const db = admin.firestore();

// Configuração do CORS mais permissiva para desenvolvimento local e deploy
const io = new Server(server, {
  cors: {
    origin: "*", // Permite qualquer origem. Para produção, restrinja a URL do seu frontend.
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// --- Gerenciamento de Sessões ---
// Lembrete: Este Map em memória é perdido se o servidor reiniciar.
// Para produção, o ideal é usar um banco de dados como Firestore ou Redis.
const sessions = new Map();

// --- Endpoints HTTP ---

// Endpoint de verificação de saúde
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date() });
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

// Endpoint para atualizar status do usuário
app.post('/api/update-user-status', async (req, res) => {
  const { uid, status } = req.body;
  if (!uid || !status) {
    return res.status(400).json({ error: 'uid e status são obrigatórios' });
  }
  try {
    await db.collection('usuarios').doc(uid).update({
      status,
      lastActive: new Date().toISOString(),
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Lógica do Socket.IO ---

io.on('connection', (socket) => {
  console.log(`[CONEXÃO] Novo cliente conectado: ${socket.id}`);

  // --- Lógica de Entrada na Sessão ---
  // Unificamos a lógica para usar os dados da query da conexão inicial.
  const { sessionId, userId, role, stationId, displayName } = socket.handshake.query;

  if (!sessionId || !userId || !role || !stationId || !displayName) {
    console.error(`[ERRO DE CONEXÃO] Cliente ${socket.id} tentou conectar com dados incompletos.`);
    socket.emit('SERVER_ERROR', { message: 'Dados de conexão insuficientes (sessionId, userId, role, stationId, displayName são obrigatórios).' });
    socket.disconnect();
    return;
  }

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
  });
  
  // Lógica para liberar dados, avaliar, etc. (mantida da sua versão anterior, pode ser expandida aqui)
  // Ex: socket.on('ACTOR_RELEASE_DATA', ...)


  // --- Lógica de Desconexão ---

  socket.on('disconnect', (reason) => {
    console.log(`[DESCONEXÃO] Cliente ${socket.id} (userId: ${userId}) desconectado. Razão: ${reason}`);
    if (session && session.participants.has(userId)) {
      session.participants.delete(userId);
      console.log(`[LEAVE] Usuário ${displayName} (${role}) removido da sessão ${sessionId}`);

      // Notifica o participante restante
      socket.to(sessionId).emit('SERVER_PARTNER_DISCONNECTED', { 
        message: `Seu parceiro (${displayName}) desconectou.`,
        remainingParticipants: Array.from(session.participants.values())
      });

      // Se a sala ficar vazia, remove a sessão do mapa para liberar memória
      if (session.participants.size === 0) {
        sessions.delete(sessionId);
        console.log(`[SESSÃO VAZIA] Sessão ${sessionId} encerrada e removida.`);
      }
    }
  });
});


// --- Iniciar o Servidor ---

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor backend rodando na porta ${PORT}`);
});
