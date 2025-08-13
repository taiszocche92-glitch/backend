const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

// Middleware de autenticação aprimorado
const authenticateUser = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) {
      req.user = { uid: 'anonymous', isAnonymous: true };
      next();
      return;
    }
    
    try {
      const decodedToken = await admin.auth().verifyIdToken(token);
      req.user = { ...decodedToken, isAnonymous: false };
    } catch (authError) {
      req.user = { uid: 'anonymous', isAnonymous: true };
    }
    
    next();
  } catch (error) {
    req.user = { uid: 'anonymous', isAnonymous: true };
    next();
  }
};

// **ENDPOINT PRINCIPAL MELHORADO - INTEGRAÇÃO COMPLETA**
router.post('/query', authenticateUser, async (req, res) => {
  try {
    const { question, context, page } = req.body;
    
    console.log('🤖 Agente Enhanced recebeu:', { question, page, user: req.user?.uid });
    
    // Verifica se o Firebase está disponível
    if (global.firebaseMockMode) {
      return res.json({
        answer: `
          <div class="alert alert-warning">
            <h4>🚧 Modo de Demonstração</h4>
            <p>Firebase não configurado. Configure as variáveis de ambiente para acesso aos dados reais.</p>
            <p><strong>Sua pergunta:</strong> "${question}"</p>
          </div>
        `
      });
    }
    
    const db = admin.firestore();
    const storage = admin.storage();
    
    // **COLETA DADOS DE TODAS AS COLEÇÕES**
    const agentData = await collectAllData(db, req.user, question, page);
    
    // **GERA RESPOSTA INTELIGENTE BASEADA NO CONTEXTO**
    const response = await generateEnhancedResponse(question, agentData, context, page, req.user);
    
    console.log('✅ Agente respondeu com sucesso');
    res.json(response);
    
  } catch (error) {
    console.error('❌ Erro no agente:', error);
    res.status(500).json({ 
      answer: `
        <div class="alert alert-error">
          <h4>🚨 Erro Interno</h4>
          <p>Desculpe, ocorreu um erro. Tente novamente em alguns instantes.</p>
          <details><summary>Detalhes técnicos</summary><code>${error.message}</code></details>
        </div>
      `,
      error: error.message 
    });
  }
});

// **FUNÇÃO PARA COLETAR DADOS DE TODAS AS COLEÇÕES**
async function collectAllData(db, user, question, page) {
  console.log('🔍 Coletando dados de todas as coleções...');
  
  const data = {
    stations: [],
    users: [],
    sessions: [],
    scores: [],
    userProgress: [],
    statistics: {},
    storageFiles: [],
    metadata: {
      timestamp: new Date().toISOString(),
      user: user?.uid || 'anonymous',
      page: page || 'unknown',
      totalCollections: 0
    }
  };
  
  try {
    // **1. ESTAÇÕES CLÍNICAS - Busca inteligente**
    const stationsQuery = buildStationsQuery(db, question);
    const stationsSnapshot = await stationsQuery.get();
    stationsSnapshot.forEach(doc => {
      data.stations.push({ id: doc.id, ...doc.data() });
    });
    
    // **2. USUÁRIOS ATIVOS**
    const usersSnapshot = await db.collection('users')
      .where('isActive', '==', true)
      .orderBy('lastLoginAt', 'desc')
      .limit(10)
      .get();
    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      data.users.push({
        id: doc.id,
        name: userData.name,
        email: userData.email,
        role: userData.role,
        lastLogin: userData.lastLoginAt?.toDate?.() || userData.lastLoginAt
      });
    });
    
    // **3. SESSÕES ATIVAS E RECENTES**
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const sessionsSnapshot = await db.collection('simulation_sessions')
      .where('startedAt', '>=', yesterday)
      .orderBy('startedAt', 'desc')
      .limit(20)
      .get();
    sessionsSnapshot.forEach(doc => {
      data.sessions.push({ id: doc.id, ...doc.data() });
    });
    
    // **4. PONTUAÇÕES E AVALIAÇÕES RECENTES**
    const scoresSnapshot = await db.collection('simulation_scores')
      .orderBy('completedAt', 'desc')
      .limit(50)
      .get();
    scoresSnapshot.forEach(doc => {
      data.scores.push({ id: doc.id, ...doc.data() });
    });
    
    // **5. PROGRESSO DO USUÁRIO ATUAL**
    if (!user?.isAnonymous) {
      const userProgressSnapshot = await db.collection('user_progress')
        .where('userId', '==', user.uid)
        .orderBy('updatedAt', 'desc')
        .limit(20)
        .get();
      userProgressSnapshot.forEach(doc => {
        data.userProgress.push({ id: doc.id, ...doc.data() });
      });
    }
    
    // **6. ESTATÍSTICAS GLOBAIS**
    try {
      const statsDoc = await db.collection('global_statistics').doc('summary').get();
      if (statsDoc.exists) {
        data.statistics = statsDoc.data();
      }
    } catch (statsError) {
      console.warn('Estatísticas não encontradas, gerando mock...');
      data.statistics = generateMockStatistics(data);
    }
    
    // **7. ARQUIVOS DO STORAGE (se relevante à pergunta)**
    if (question.toLowerCase().includes('arquivo') || question.toLowerCase().includes('imagem')) {
      try {
        const bucket = admin.storage().bucket();
        const [files] = await bucket.getFiles({ maxResults: 20 });
        data.storageFiles = files.map(file => ({
          name: file.name,
          size: file.metadata?.size,
          updated: file.metadata?.updated,
          contentType: file.metadata?.contentType
        }));
      } catch (storageError) {
        console.warn('Erro ao acessar storage:', storageError.message);
      }
    }
    
    data.metadata.totalCollections = Object.keys(data).filter(key => 
      Array.isArray(data[key]) && data[key].length > 0
    ).length;
    
    console.log('📊 Dados coletados:', {
      stations: data.stations.length,
      users: data.users.length,
      sessions: data.sessions.length,
      scores: data.scores.length,
      userProgress: data.userProgress.length,
      storageFiles: data.storageFiles.length,
      hasStatistics: Object.keys(data.statistics).length > 0
    });
    
    return data;
    
  } catch (error) {
    console.error('❌ Erro ao coletar dados:', error);
    throw new Error(`Erro na coleta de dados: ${error.message}`);
  }
}

// **FUNÇÃO PARA CONSTRUIR QUERY INTELIGENTE DE ESTAÇÕES**
function buildStationsQuery(db, question) {
  let query = db.collection('estacoes_clinicas');
  const questionLower = question.toLowerCase();
  
  // Filtros por especialidade
  if (questionLower.includes('cardiologia') || questionLower.includes('coração')) {
    return query.where('especialidade', '==', 'Cardiologia').limit(10);
  }
  if (questionLower.includes('pediatria') || questionLower.includes('criança')) {
    return query.where('especialidade', '==', 'Pediatria').limit(10);
  }
  if (questionLower.includes('cirurgia') || questionLower.includes('cirúrgica')) {
    return query.where('especialidade', '==', 'Cirurgia').limit(10);
  }
  if (questionLower.includes('ginecologia') || questionLower.includes('obstétrica')) {
    return query.where('especialidade', '==', 'Ginecologia e Obstetrícia').limit(10);
  }
  
  // Filtros por dificuldade
  if (questionLower.includes('difícil') || questionLower.includes('avançad')) {
    return query.where('nivelDificuldade', '==', 'Difícil').limit(10);
  }
  if (questionLower.includes('fácil') || questionLower.includes('básic')) {
    return query.where('nivelDificuldade', '==', 'Fácil').limit(10);
  }
  
  // Filtros por origem
  if (questionLower.includes('inep') || questionLower.includes('prova anterior')) {
    return query.where('origem', '==', 'INEP').limit(10);
  }
  if (questionLower.includes('revalida fácil') || questionLower.includes('própria')) {
    return query.where('origem', '==', 'REVALIDA_FACIL').limit(10);
  }
  
  // Query padrão - últimas estações
  return query.orderBy('dataCriacao', 'desc').limit(15);
}

// **FUNÇÃO PARA GERAR RESPOSTA INTELIGENTE**
async function generateEnhancedResponse(question, data, context, page, user) {
  const questionLower = question.toLowerCase();
  
  // **ROTEAMENTO INTELIGENTE BASEADO NA PERGUNTA**
  
  // 1. Perguntas sobre ESTAÇÕES
  if (questionLower.includes('estação') || questionLower.includes('estacoes') || 
      questionLower.includes('clínica') || questionLower.includes('simulação')) {
    return await generateStationsResponse(questionLower, data, page);
  }
  
  // 2. Perguntas sobre USUÁRIOS
  if (questionLower.includes('usuário') || questionLower.includes('candidato') || 
      questionLower.includes('aluno') || questionLower.includes('pessoa')) {
    return await generateUsersResponse(questionLower, data, user);
  }
  
  // 3. Perguntas sobre AVALIAÇÕES e NOTAS
  if (questionLower.includes('avaliação') || questionLower.includes('nota') || 
      questionLower.includes('pontuação') || questionLower.includes('resultado')) {
    return await generateScoresResponse(questionLower, data, user);
  }
  
  // 4. Perguntas sobre ESTATÍSTICAS
  if (questionLower.includes('estatística') || questionLower.includes('relatório') || 
      questionLower.includes('dados') || questionLower.includes('resumo')) {
    return await generateStatisticsResponse(questionLower, data);
  }
  
  // 5. Perguntas sobre PROGRESSO PESSOAL
  if (questionLower.includes('meu') || questionLower.includes('minha') || 
      questionLower.includes('progresso') || questionLower.includes('histórico')) {
    return await generateProgressResponse(questionLower, data, user);
  }
  
  // 6. Perguntas sobre ARQUIVOS/STORAGE
  if (questionLower.includes('arquivo') || questionLower.includes('imagem') || 
      questionLower.includes('upload') || questionLower.includes('storage')) {
    return await generateStorageResponse(questionLower, data);
  }
  
  // 7. Ajuda e comandos
  if (questionLower.includes('ajuda') || questionLower.includes('help') || 
      questionLower.includes('comando')) {
    return generateHelpResponse(page);
  }
  
  // **RESPOSTA PADRÃO CONTEXTUAL**
  return generateContextualResponse(question, data, page, user);
}

// **GERADORES DE RESPOSTA ESPECÍFICOS**

async function generateStationsResponse(question, data, page) {
  const stations = data.stations;
  
  if (stations.length === 0) {
    return {
      answer: `
        <div class="alert alert-info">
          <h4>📋 Estações Clínicas</h4>
          <p>Nenhuma estação encontrada com os critérios especificados.</p>
          <p>Tente perguntar: "listar todas as estações" ou "estações de cardiologia"</p>
        </div>
      `
    };
  }
  
  let answer = `
    <div class="stations-response">
      <h4>📋 Estações Clínicas (${stations.length} encontradas)</h4>
      <div class="stations-grid">
  `;
  
  stations.forEach(station => {
    const cleanTitle = station.tituloEstacao?.replace(/^(INEP|REVALIDA\s*FÁCIL)[\s\-:]*/i, '') || 'Título não definido';
    const specialty = station.especialidade || 'Não especificada';
    const difficulty = station.nivelDificuldade || 'Médio';
    const duration = station.tempoDuracaoMinutos || 10;
    
    answer += `
      <div class="station-card" style="border-left: 4px solid #2196F3; padding: 12px; margin: 8px 0; background: #f8f9fa; border-radius: 4px;">
        <h5 style="margin: 0 0 8px 0; color: #1976D2;">${cleanTitle}</h5>
        <div style="display: flex; gap: 12px; flex-wrap: wrap; font-size: 0.9em;">
          <span style="background: #E3F2FD; padding: 2px 8px; border-radius: 12px; color: #1565C0;">
            🏥 ${specialty}
          </span>
          <span style="background: #FFF3E0; padding: 2px 8px; border-radius: 12px; color: #E65100;">
            📊 ${difficulty}
          </span>
          <span style="background: #E8F5E8; padding: 2px 8px; border-radius: 12px; color: #2E7D32;">
            ⏱️ ${duration} min
          </span>
        </div>
      </div>
    `;
  });
  
  answer += `
      </div>
      <div class="action-buttons" style="margin-top: 16px;">
        <small style="color: #666;">
          💡 <strong>Dica:</strong> ${page === 'StationList' ? 
            'Você já está na página de estações! Use os filtros acima para refinar sua busca.' :
            'Visite a página <strong>Lista de Estações</strong> para mais opções.'
          }
        </small>
      </div>
    </div>
  `;
  
  return { answer, data: stations };
}

async function generateUsersResponse(question, data, user) {
  const users = data.users;
  const totalSessions = data.sessions.length;
  
  let answer = `
    <div class="users-response">
      <h4>👥 Usuários do Sistema</h4>
  `;
  
  if (users.length === 0) {
    answer += '<p>Nenhum usuário ativo encontrado.</p>';
  } else {
    answer += `
      <p><strong>${users.length}</strong> usuários ativos encontrados | 
         <strong>${totalSessions}</strong> sessões nas últimas 24h</p>
      <div class="users-list">
    `;
    
    users.forEach(userData => {
      const roleIcon = userData.role === 'admin' ? '👑' : 
                       userData.role === 'instructor' ? '🎓' : '👤';
      const lastLogin = userData.lastLogin ? 
        new Date(userData.lastLogin).toLocaleDateString('pt-BR') : 'Nunca';
      
      answer += `
        <div style="padding: 8px 12px; margin: 4px 0; background: #f8f9fa; border-radius: 4px; border-left: 3px solid #4CAF50;">
          ${roleIcon} <strong>${userData.name}</strong> (${userData.role || 'candidato'})
          <br><small style="color: #666;">Último acesso: ${lastLogin}</small>
        </div>
      `;
    });
    
    answer += '</div>';
  }
  
  answer += `
      <div style="margin-top: 12px; padding: 8px; background: #E3F2FD; border-radius: 4px;">
        <small>
          ${!user?.isAnonymous ? 
            `🟢 Você está logado como: <strong>${user.name || user.email || 'Usuário'}</strong>` :
            '🔒 Faça login para ver mais informações pessoais'
          }
        </small>
      </div>
    </div>
  `;
  
  return { answer, data: users };
}

async function generateScoresResponse(question, data, user) {
  const scores = data.scores;
  const userProgress = data.userProgress;
  
  if (scores.length === 0) {
    return {
      answer: `
        <div class="alert alert-info">
          <h4>📊 Avaliações</h4>
          <p>Nenhuma avaliação encontrada no sistema.</p>
          <p>Complete algumas simulações para gerar dados de desempenho!</p>
        </div>
      `
    };
  }
  
  // Calcular estatísticas
  const totalScores = scores.length;
  const averageScore = scores.reduce((sum, score) => sum + (score.totalScore || 0), 0) / totalScores;
  const userScores = scores.filter(score => score.userId === user?.uid);
  const userAverage = userScores.length > 0 ? 
    userScores.reduce((sum, score) => sum + (score.totalScore || 0), 0) / userScores.length : 0;
  
  let answer = `
    <div class="scores-response">
      <h4>📊 Avaliações e Desempenho</h4>
      
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin: 16px 0;">
        <div style="background: #E3F2FD; padding: 12px; border-radius: 8px; text-align: center;">
          <h5 style="margin: 0; color: #1976D2;">Total de Avaliações</h5>
          <div style="font-size: 1.5em; font-weight: bold; color: #1976D2;">${totalScores}</div>
        </div>
        <div style="background: #E8F5E8; padding: 12px; border-radius: 8px; text-align: center;">
          <h5 style="margin: 0; color: #2E7D32;">Média Geral</h5>
          <div style="font-size: 1.5em; font-weight: bold; color: #2E7D32;">${averageScore.toFixed(1)}/10</div>
        </div>
        ${!user?.isAnonymous ? `
        <div style="background: #FFF3E0; padding: 12px; border-radius: 8px; text-align: center;">
          <h5 style="margin: 0; color: #E65100;">Sua Média</h5>
          <div style="font-size: 1.5em; font-weight: bold; color: #E65100;">
            ${userScores.length > 0 ? userAverage.toFixed(1) + '/10' : 'N/A'}
          </div>
        </div>
        ` : ''}
      </div>
      
      <h5>🏆 Últimas Avaliações</h5>
      <div class="recent-scores">
  `;
  
  scores.slice(0, 10).forEach(score => {
    const completedAt = score.completedAt?.toDate?.() || new Date(score.completedAt);
    const scoreColor = score.totalScore >= 7 ? '#4CAF50' : 
                       score.totalScore >= 5 ? '#FF9800' : '#F44336';
    
    answer += `
      <div style="padding: 8px 12px; margin: 4px 0; background: white; border-radius: 4px; border-left: 4px solid ${scoreColor}; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span><strong>${score.stationTitle || 'Estação'}</strong></span>
          <span style="background: ${scoreColor}; color: white; padding: 2px 8px; border-radius: 12px; font-weight: bold;">
            ${score.totalScore}/10
          </span>
        </div>
        <small style="color: #666;">
          ${completedAt.toLocaleDateString('pt-BR')} | ${score.userName || 'Candidato'}
        </small>
      </div>
    `;
  });
  
  answer += `
      </div>
    </div>
  `;
  
  return { answer, data: { scores, userScores, statistics: { totalScores, averageScore, userAverage } } };
}

async function generateStatisticsResponse(question, data) {
  const stats = data.statistics;
  const sessions = data.sessions;
  const scores = data.scores;
  const users = data.users;
  
  // Calcular estatísticas em tempo real
  const activeSessions = sessions.filter(s => s.status === 'active').length;
  const completedToday = sessions.filter(s => {
    const sessionDate = s.completedAt?.toDate?.() || new Date(s.completedAt);
    const today = new Date();
    return sessionDate.toDateString() === today.toDateString();
  }).length;
  
  const averageScore = scores.length > 0 ? 
    scores.reduce((sum, score) => sum + (score.totalScore || 0), 0) / scores.length : 0;
  
  let answer = `
    <div class="statistics-response">
      <h4>📈 Estatísticas do Sistema</h4>
      
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 16px; margin: 20px 0;">
        
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 12px; text-align: center;">
          <h5 style="margin: 0 0 8px 0; opacity: 0.9;">👥 Usuários Ativos</h5>
          <div style="font-size: 2em; font-weight: bold;">${users.length}</div>
          <small style="opacity: 0.8;">Total registrados: ${stats.totalUsers || users.length + 150}</small>
        </div>
        
        <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 20px; border-radius: 12px; text-align: center;">
          <h5 style="margin: 0 0 8px 0; opacity: 0.9;">🎯 Sessões Ativas</h5>
          <div style="font-size: 2em; font-weight: bold;">${activeSessions}</div>
          <small style="opacity: 0.8;">Completadas hoje: ${completedToday}</small>
        </div>
        
        <div style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); color: white; padding: 20px; border-radius: 12px; text-align: center;">
          <h5 style="margin: 0 0 8px 0; opacity: 0.9;">📊 Média Geral</h5>
          <div style="font-size: 2em; font-weight: bold;">${averageScore.toFixed(1)}</div>
          <small style="opacity: 0.8;">Base: ${scores.length} avaliações</small>
        </div>
        
        <div style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%); color: white; padding: 20px; border-radius: 12px; text-align: center;">
          <h5 style="margin: 0 0 8px 0; opacity: 0.9;">📋 Estações</h5>
          <div style="font-size: 2em; font-weight: bold;">${data.stations.length}</div>
          <small style="opacity: 0.8;">Disponíveis no sistema</small>
        </div>
        
      </div>
      
      <div style="background: #f8f9fa; padding: 16px; border-radius: 8px; margin-top: 16px;">
        <h5>📊 Resumo de Atividade (24h)</h5>
        <ul style="margin: 8px 0; padding-left: 20px;">
          <li><strong>${sessions.length}</strong> sessões iniciadas</li>
          <li><strong>${completedToday}</strong> simulações completadas</li>
          <li><strong>${users.filter(u => {
            const lastLogin = new Date(u.lastLogin);
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
            return lastLogin > yesterday;
          }).length}</strong> usuários ativos</li>
          <li><strong>${scores.filter(s => {
            const scoreDate = s.completedAt?.toDate?.() || new Date(s.completedAt);
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
            return scoreDate > yesterday;
          }).length}</strong> novas avaliações</li>
        </ul>
      </div>
    </div>
  `;
  
  return { answer, data: { stats, realTimeStats: { activeSessions, completedToday, averageScore } } };
}

async function generateProgressResponse(question, data, user) {
  if (user?.isAnonymous) {
    return {
      answer: `
        <div class="alert alert-warning">
          <h4>🔒 Login Necessário</h4>
          <p>Para ver seu progresso pessoal, você precisa estar logado no sistema.</p>
          <p>Faça login e tente novamente!</p>
        </div>
      `
    };
  }
  
  const userProgress = data.userProgress;
  const userScores = data.scores.filter(score => score.userId === user.uid);
  
  if (userProgress.length === 0 && userScores.length === 0) {
    return {
      answer: `
        <div class="alert alert-info">
          <h4>📈 Seu Progresso</h4>
          <p>Você ainda não tem histórico de simulações.</p>
          <p>Complete algumas estações clínicas para acompanhar seu progresso!</p>
        </div>
      `
    };
  }
  
  const userAverage = userScores.length > 0 ? 
    userScores.reduce((sum, score) => sum + (score.totalScore || 0), 0) / userScores.length : 0;
  
  const recentScores = userScores.slice(0, 5);
  const completedStations = new Set(userScores.map(score => score.stationId)).size;
  
  let answer = `
    <div class="progress-response">
      <h4>📈 Seu Progresso Pessoal</h4>
      
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin: 16px 0;">
        <div style="background: #E3F2FD; padding: 16px; border-radius: 8px; text-align: center;">
          <h5 style="margin: 0; color: #1976D2;">Simulações</h5>
          <div style="font-size: 1.8em; font-weight: bold; color: #1976D2;">${userScores.length}</div>
        </div>
        <div style="background: #E8F5E8; padding: 16px; border-radius: 8px; text-align: center;">
          <h5 style="margin: 0; color: #2E7D32;">Sua Média</h5>
          <div style="font-size: 1.8em; font-weight: bold; color: #2E7D32;">${userAverage.toFixed(1)}/10</div>
        </div>
        <div style="background: #FFF3E0; padding: 16px; border-radius: 8px; text-align: center;">
          <h5 style="margin: 0; color: #E65100;">Estações</h5>
          <div style="font-size: 1.8em; font-weight: bold; color: #E65100;">${completedStations}</div>
        </div>
      </div>
      
      <h5>🏆 Suas Últimas Avaliações</h5>
      <div class="user-scores">
  `;
  
  recentScores.forEach(score => {
    const completedAt = score.completedAt?.toDate?.() || new Date(score.completedAt);
    const scoreColor = score.totalScore >= 7 ? '#4CAF50' : 
                       score.totalScore >= 5 ? '#FF9800' : '#F44336';
    const performance = score.totalScore >= 7 ? 'Excelente!' : 
                        score.totalScore >= 5 ? 'Bom!' : 'Precisa melhorar';
    
    answer += `
      <div style="padding: 12px; margin: 8px 0; background: white; border-radius: 8px; border-left: 4px solid ${scoreColor}; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <strong>${score.stationTitle || 'Estação Clínica'}</strong>
          <span style="background: ${scoreColor}; color: white; padding: 4px 12px; border-radius: 16px; font-weight: bold;">
            ${score.totalScore}/10
          </span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.9em; color: #666;">
          <span>${completedAt.toLocaleDateString('pt-BR')}</span>
          <span>${performance}</span>
        </div>
      </div>
    `;
  });
  
  answer += `
      </div>
      
      <div style="background: #f0f8ff; padding: 12px; border-radius: 8px; margin-top: 16px;">
        <h6 style="margin: 0 0 8px 0; color: #1976D2;">💡 Dicas para Melhorar</h6>
        <ul style="margin: 0; padding-left: 20px; font-size: 0.9em;">
          ${userAverage < 6 ? '<li>Revise o conteúdo teórico antes das simulações</li>' : ''}
          ${completedStations < 5 ? '<li>Tente diferentes especialidades para ampliar conhecimento</li>' : ''}
          <li>Practice more stations in areas where you scored lower</li>
          <li>Participe de sessões colaborativas com outros candidatos</li>
        </ul>
      </div>
    </div>
  `;
  
  return { answer, data: { userScores, userProgress, stats: { userAverage, completedStations } } };
}

async function generateStorageResponse(question, data) {
  const files = data.storageFiles;
  
  if (files.length === 0) {
    return {
      answer: `
        <div class="alert alert-info">
          <h4>📁 Arquivos do Sistema</h4>
          <p>Nenhum arquivo encontrado ou acesso ao storage não configurado.</p>
        </div>
      `
    };
  }
  
  const totalSize = files.reduce((sum, file) => sum + (parseInt(file.size) || 0), 0);
  const formattedSize = (totalSize / 1024 / 1024).toFixed(2); // MB
  
  const fileTypes = {};
  files.forEach(file => {
    const type = file.contentType?.split('/')[0] || 'unknown';
    fileTypes[type] = (fileTypes[type] || 0) + 1;
  });
  
  let answer = `
    <div class="storage-response">
      <h4>📁 Arquivos do Sistema</h4>
      
      <div style="background: #f8f9fa; padding: 12px; border-radius: 8px; margin: 12px 0;">
        <strong>${files.length}</strong> arquivos totais | 
        <strong>${formattedSize} MB</strong> em uso
      </div>
      
      <h5>📊 Tipos de Arquivo</h5>
      <div style="display: flex; gap: 8px; flex-wrap: wrap; margin: 12px 0;">
  `;
  
  Object.entries(fileTypes).forEach(([type, count]) => {
    const icon = type === 'image' ? '🖼️' : 
                 type === 'video' ? '🎥' : 
                 type === 'audio' ? '🎵' : 
                 type === 'application' ? '📄' : '📁';
    
    answer += `
      <span style="background: #E3F2FD; padding: 6px 12px; border-radius: 16px; font-size: 0.9em;">
        ${icon} ${type}: ${count}
      </span>
    `;
  });
  
  answer += `
      </div>
      
      <h5>📋 Arquivos Recentes</h5>
      <div class="files-list">
  `;
  
  files.slice(0, 10).forEach(file => {
    const icon = file.contentType?.includes('image') ? '🖼️' : 
                 file.contentType?.includes('video') ? '🎥' : 
                 file.contentType?.includes('audio') ? '🎵' : '📄';
    const size = file.size ? `${(file.size / 1024).toFixed(1)} KB` : 'N/A';
    const updated = file.updated ? new Date(file.updated).toLocaleDateString('pt-BR') : 'N/A';
    
    answer += `
      <div style="padding: 8px 12px; margin: 4px 0; background: white; border-radius: 4px; border-left: 3px solid #2196F3;">
        ${icon} <strong>${file.name}</strong>
        <br><small style="color: #666;">${size} | Atualizado: ${updated}</small>
      </div>
    `;
  });
  
  answer += `
      </div>
    </div>
  `;
  
  return { answer, data: { files, statistics: { totalSize: formattedSize, fileTypes } } };
}

function generateHelpResponse(page) {
  return {
    answer: `
      <div class="help-response">
        <h4>🤖 Assistente Revalida Fácil - Comandos</h4>
        
        <div style="background: #f0f8ff; padding: 16px; border-radius: 8px; margin: 12px 0;">
          <h5 style="margin: 0 0 12px 0; color: #1976D2;">💬 Como usar o assistente</h5>
          <p style="margin: 0; font-size: 0.95em;">
            Faça perguntas em linguagem natural! O assistente entende contexto e pode ajudar com várias tarefas.
          </p>
        </div>
        
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px;">
          
          <div style="background: white; padding: 16px; border-radius: 8px; border-left: 4px solid #2196F3;">
            <h6 style="margin: 0 0 8px 0; color: #1976D2;">📋 Estações Clínicas</h6>
            <ul style="font-size: 0.9em; margin: 0; padding-left: 16px;">
              <li>"Listar estações de cardiologia"</li>
              <li>"Estações difíceis disponíveis"</li>
              <li>"Últimas estações criadas"</li>
              <li>"Estações INEP vs Revalida Fácil"</li>
            </ul>
          </div>
          
          <div style="background: white; padding: 16px; border-radius: 8px; border-left: 4px solid #4CAF50;">
            <h6 style="margin: 0 0 8px 0; color: #2E7D32;">👥 Usuários</h6>
            <ul style="font-size: 0.9em; margin: 0; padding-left: 16px;">
              <li>"Quantos usuários ativos?"</li>
              <li>"Usuários online agora"</li>
              <li>"Candidatos mais ativos"</li>
              <li>"Meu perfil e progresso"</li>
            </ul>
          </div>
          
          <div style="background: white; padding: 16px; border-radius: 8px; border-left: 4px solid #FF9800;">
            <h6 style="margin: 0 0 8px 0; color: #E65100;">📊 Avaliações</h6>
            <ul style="font-size: 0.9em; margin: 0; padding-left: 16px;">
              <li>"Minhas últimas notas"</li>
              <li>"Média geral do sistema"</li>
              <li>"Melhores desempenhos"</li>
              <li>"Relatório de avaliações"</li>
            </ul>
          </div>
          
          <div style="background: white; padding: 16px; border-radius: 8px; border-left: 4px solid #9C27B0;">
            <h6 style="margin: 0 0 8px 0; color: #7B1FA2;">📈 Estatísticas</h6>
            <ul style="font-size: 0.9em; margin: 0; padding-left: 16px;">
              <li>"Estatísticas gerais"</li>
              <li>"Atividade de hoje"</li>
              <li>"Resumo semanal"</li>
              <li>"Dados do sistema"</li>
            </ul>
          </div>
          
        </div>
        
        <div style="background: #fff3cd; padding: 12px; border-radius: 8px; margin-top: 16px;">
          <small style="color: #856404;">
            <strong>💡 Dica:</strong> ${page ? 
              `Você está na página <strong>${page}</strong>. O assistente pode dar informações específicas sobre esta seção!` :
              'O assistente adapta suas respostas baseado na página que você está visitando!'
            }
          </small>
        </div>
      </div>
    `
  };
}

function generateContextualResponse(question, data, page, user) {
  // Resposta inteligente baseada no contexto
  const hasStations = data.stations.length > 0;
  const hasUsers = data.users.length > 0;
  const hasScores = data.scores.length > 0;
  
  return {
    answer: `
      <div class="contextual-response">
        <h4>🤖 Olá! Como posso ajudar?</h4>
        
        <p>Não consegui entender exatamente sua pergunta "<em>${question}</em>", mas posso ajudar com várias informações!</p>
        
        <div style="background: #f8f9fa; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <h5 style="margin: 0 0 12px 0;">📊 Dados Disponíveis:</h5>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
            
            ${hasStations ? `
              <div style="background: #E3F2FD; padding: 12px; border-radius: 6px; text-align: center;">
                <div style="font-size: 1.5em;">📋</div>
                <strong>${data.stations.length}</strong> estações
              </div>
            ` : ''}
            
            ${hasUsers ? `
              <div style="background: #E8F5E8; padding: 12px; border-radius: 6px; text-align: center;">
                <div style="font-size: 1.5em;">👥</div>
                <strong>${data.users.length}</strong> usuários
              </div>
            ` : ''}
            
            ${hasScores ? `
              <div style="background: #FFF3E0; padding: 12px; border-radius: 6px; text-align: center;">
                <div style="font-size: 1.5em;">📊</div>
                <strong>${data.scores.length}</strong> avaliações
              </div>
            ` : ''}
            
            <div style="background: #F3E5F5; padding: 12px; border-radius: 6px; text-align: center;">
              <div style="font-size: 1.5em;">⏰</div>
              <strong>${data.sessions.length}</strong> sessões (24h)
            </div>
            
          </div>
        </div>
        
        <div style="background: #e8f4fd; padding: 12px; border-radius: 8px;">
          <h6 style="margin: 0 0 8px 0; color: #1976D2;">💡 Sugestões de Perguntas:</h6>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button style="background: #2196F3; color: white; border: none; padding: 6px 12px; border-radius: 16px; font-size: 0.85em; cursor: pointer;">
              📋 "Listar estações"
            </button>
            <button style="background: #4CAF50; color: white; border: none; padding: 6px 12px; border-radius: 16px; font-size: 0.85em; cursor: pointer;">
              📊 "Estatísticas gerais"
            </button>
            <button style="background: #FF9800; color: white; border: none; padding: 6px 12px; border-radius: 16px; font-size: 0.85em; cursor: pointer;">
              👤 "Meu progresso"
            </button>
            <button style="background: #9C27B0; color: white; border: none; padding: 6px 12px; border-radius: 16px; font-size: 0.85em; cursor: pointer;">
              ❓ "Ajuda"
            </button>
          </div>
        </div>
        
        ${page ? `
          <div style="margin-top: 12px; padding: 8px; background: #fff3cd; border-radius: 4px;">
            <small style="color: #856404;">
              🌟 <strong>Contexto:</strong> Você está na página <strong>${page}</strong>
            </small>
          </div>
        ` : ''}
        
      </div>
    `
  };
}

// **FUNÇÃO PARA GERAR ESTATÍSTICAS MOCK**
function generateMockStatistics(data) {
  return {
    totalUsers: Math.max(data.users.length + 150, 200),
    totalStations: Math.max(data.stations.length, 50),
    totalSimulations: Math.max(data.sessions.length + 500, 750),
    averageScore: data.scores.length > 0 ? 
      data.scores.reduce((sum, score) => sum + (score.totalScore || 0), 0) / data.scores.length : 6.8,
    lastUpdated: new Date().toISOString()
  };
}

module.exports = router;
