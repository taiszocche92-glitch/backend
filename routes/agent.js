const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

// Middleware de autenticação
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

// Middleware de autenticação para administradores
const authenticateAdmin = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Token de acesso necessário' });
    }
    
    const decodedToken = await admin.auth().verifyIdToken(token);
    const userDoc = await admin.firestore().collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.data();
    
    if (!userData || userData.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso restrito a administradores' });
    }
    
    req.user = { ...decodedToken, ...userData };
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido' });
  }
};

// **NOVO: Endpoint para Análise Administrativa Avançada**
router.post('/admin-analysis', authenticateAdmin, async (req, res) => {
  try {
    const { action, stationId, analysisType, fixes } = req.body;
    
    console.log(`🔍 Análise Admin: ${action}`, { stationId, user: req.user?.uid });
    
    const db = admin.firestore();
    
    switch(action) {
      case 'analyze-station':
        return res.json(await analyzeStationCompleteness(db, stationId));
      case 'suggest-improvements':
        return res.json(await generateImprovementSuggestions(db, stationId));
      case 'auto-fix':
        return res.json(await performAutomaticFixes(db, stationId, fixes));
      case 'validate-pep':
        return res.json(await validatePEPScoring(db, stationId));
      case 'analyze-all':
        return res.json(await analyzeAllStations(db));
      default:
        return res.status(400).json({ error: 'Ação não reconhecida' });
    }
  } catch (error) {
    console.error('❌ Erro na análise admin:', error);
    res.status(500).json({ error: error.message });
  }
});

// **NOVO: Endpoint para Agente Virtual (Ator/Avaliador)**
router.post('/virtual-actor', authenticateUser, async (req, res) => {
  try {
    const { stationId, message, context, voiceEnabled, role = 'actor' } = req.body;
    
    console.log('🎭 Agente Virtual:', { stationId, role, user: req.user?.uid });
    
    const db = admin.firestore();
    const stationDoc = await db.collection('estacoes_clinicas').doc(stationId).get();
    
    if (!stationDoc.exists) {
      return res.status(404).json({ error: 'Estação não encontrada' });
    }
    
    const stationData = stationDoc.data();
    const response = await generateVirtualActorResponse(stationData, message, context, role);
    
    // TODO: Implementar Text-to-Speech se voiceEnabled=true
    if (voiceEnabled) {
      response.audioUrl = await generateAudioResponse(response.text);
    }
    
    res.json(response);
  } catch (error) {
    console.error('❌ Erro no agente virtual:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint principal do agente (mantido para compatibilidade)
router.post('/query', authenticateUser, async (req, res) => {
  try {
    const { question, context, page } = req.body;
    
    console.log('🤖 Agente recebeu:', { question, page, user: req.user?.uid });
    
    // Verifica se o Firebase está disponível
    if (global.firebaseMockMode) {
      return res.json({
        answer: createResponse('warning', '🚧 Modo de Demonstração', [
          'Firebase não configurado. Configure as variáveis de ambiente para acesso aos dados reais.',
          `<strong>Sua pergunta:</strong> "${question}"`
        ])
      });
    }

    const db = admin.firestore();
    let stationsData = [];
    let usersData = [];
    
    try {
      // Busca estações clínicas
      const stationsSnapshot = await db.collection('estacoes_clinicas').limit(20).get();
      stationsSnapshot.forEach(doc => {
        stationsData.push({ id: doc.id, ...doc.data() });
      });
      console.log(`✅ Carregadas ${stationsData.length} estações clínicas`);
      
      // Busca usuários
      const usersSnapshot = await db.collection('users').limit(15).get();
      usersSnapshot.forEach(doc => {
        usersData.push({ id: doc.id, ...doc.data() });
      });
      console.log(`✅ Carregados ${usersData.length} usuários`);
      
    } catch (firestoreError) {
      console.warn('⚠️ Erro ao acessar Firestore:', firestoreError.message);
    }
    
    // Processamento da pergunta
    const answer = processQuestion(question, stationsData, usersData);
    
    console.log('✅ Agente respondeu com sucesso');
    res.json({ answer });
    
  } catch (error) {
    console.error('❌ Erro no agente:', error);
    res.status(500).json({ 
      answer: createResponse('error', '🚨 Erro Interno', [
        'Desculpe, ocorreu um erro. Tente novamente em alguns instantes.',
        `<details><summary>Detalhes técnicos</summary><code>${error.message}</code></details>`
      ]),
      error: error.message 
    });
  }
});

// Função para processar perguntas
function processQuestion(question, stationsData, usersData) {
  const questionLower = question.toLowerCase();
  
  if (questionLower.includes('estação') || questionLower.includes('estacoes')) {
    return handleStationsQuery(question, stationsData);
  } 
  
  if (questionLower.includes('usuário') || questionLower.includes('user')) {
    return handleUsersQuery(question, usersData);
  }
  
  if (questionLower.includes('projeto') || questionLower.includes('código') || questionLower.includes('desenvolvimento')) {
    return handleProjectQuery(question, stationsData, usersData);
  }
  
  if (questionLower.includes('comunicação') || questionLower.includes('funciona')) {
    return handleCommunicationQuery();
  }
  
  return handleDefaultQuery(question, stationsData, usersData);
}

// Handlers para diferentes tipos de pergunta
function handleStationsQuery(question, stationsData) {
  const totalStations = stationsData.length;
  const especialidades = [...new Set(stationsData.map(s => s.especialidade).filter(Boolean))];
  const dificuldades = [...new Set(stationsData.map(s => s.nivelDificuldade).filter(Boolean))];
  const recentStations = stationsData.slice(0, 5);
  
  return createResponse('response', '🏥 Estações Clínicas - Dados Reais', [
    `<strong>Sua pergunta:</strong> "${question}"`,
    '<h5>📊 Estatísticas:</h5>',
    `<ul>
      <li><strong>Total de estações:</strong> ${totalStations}</li>
      <li><strong>Especialidades:</strong> ${especialidades.join(', ') || 'Não especificado'}</li>
      <li><strong>Níveis:</strong> ${dificuldades.join(', ') || 'Não especificado'}</li>
    </ul>`,
    recentStations.length > 0 ? `
    <h5>🎯 Últimas estações:</h5>
    <ul>
      ${recentStations.map(station => `
        <li><strong>${station.titulo || station.nome || 'Sem título'}</strong>
            ${station.especialidade ? ` - ${station.especialidade}` : ''}
            ${station.nivelDificuldade ? ` (${station.nivelDificuldade})` : ''}
        </li>
      `).join('')}
    </ul>` : '',
    '<em>✅ Conectado ao Firestore - Dados em tempo real!</em>'
  ]);
}

function handleUsersQuery(question, usersData) {
  const totalUsers = usersData.length;
  const roles = [...new Set(usersData.map(u => u.role).filter(Boolean))];
  const activeUsers = usersData.filter(u => u.isActive !== false);
  const recentUsers = usersData.slice(0, 5);
  
  return createResponse('response', '👥 Usuários - Dados Reais', [
    `<strong>Sua pergunta:</strong> "${question}"`,
    '<h5>📊 Estatísticas:</h5>',
    `<ul>
      <li><strong>Total de usuários:</strong> ${totalUsers}</li>
      <li><strong>Usuários ativos:</strong> ${activeUsers.length}</li>
      <li><strong>Perfis:</strong> ${roles.join(', ') || 'Não especificado'}</li>
    </ul>`,
    recentUsers.length > 0 ? `
    <h5>👤 Usuários recentes:</h5>
    <ul>
      ${recentUsers.map(user => `
        <li><strong>${user.name || user.displayName || 'Sem nome'}</strong>
            ${user.email ? ` (${user.email})` : ''}
            ${user.role ? ` - ${user.role}` : ''}
            ${user.isActive === false ? ' [Inativo]' : ''}
        </li>
      `).join('')}
    </ul>` : '',
    '<em>✅ Conectado ao Firestore - Dados em tempo real!</em>'
  ]);
}

function handleProjectQuery(question, stationsData, usersData) {
  return createResponse('response', '💻 Análise do Projeto', [
    `<strong>Sua pergunta:</strong> "${question}"`,
    '<h5>🎯 Dados disponíveis para desenvolvimento:</h5>',
    `<ul>
      <li><strong>Estações clínicas:</strong> ${stationsData.length} registros</li>
      <li><strong>Usuários:</strong> ${usersData.length} registros</li>
      <li><strong>Coleções ativas:</strong> estacoes_clinicas, users</li>
    </ul>`,
    '<h5>🔧 Estrutura identificada:</h5>',
    `<ul>
      <li>✅ Backend Node.js + Express funcionando</li>
      <li>✅ Firebase Admin SDK configurado</li>
      <li>✅ Frontend Vue 3 + Vuetify</li>
      <li>✅ Sistema de autenticação ativo</li>
      <li>✅ Agente IA integrado</li>
    </ul>`,
    '<em>Posso ajudar com análises específicas, sugestões de código e melhorias!</em>'
  ]);
}

function handleCommunicationQuery() {
  return createResponse('response', '💬 Como funciona a comunicação', [
    'O sistema de simulação funciona da seguinte forma:',
    `<ul>
      <li>✅ Candidato e Ator/Avaliador entram na mesma sala</li>
      <li>✅ Ambos clicam em "Estou Pronto"</li>
      <li>✅ Ator/Avaliador inicia a simulação</li>
      <li>✅ Sistema abre comunicação por voz automaticamente</li>
      <li>✅ Tempo é cronometrado em tempo real</li>
    </ul>`,
    '<strong>Dica:</strong> Use Google Meet para comunicação por voz!'
  ]);
}

function handleDefaultQuery(question, stationsData, usersData) {
  return createResponse('response', '🤖 Assistente Revalida Fácil - Com Dados Reais', [
    `<strong>Você perguntou:</strong> "${question}"`,
    '<h5>📊 Status do sistema:</h5>',
    `<ul>
      <li>🏥 <strong>Estações clínicas:</strong> ${stationsData.length} carregadas</li>
      <li>👥 <strong>Usuários:</strong> ${usersData.length} carregados</li>
      <li>🔥 <strong>Firebase:</strong> Conectado e funcionando</li>
      <li>⚡ <strong>API:</strong> Respondendo em tempo real</li>
    </ul>`,
    '<h5>🎯 Posso ajudar com:</h5>',
    `<ul>
      <li>🏥 <strong>Estações:</strong> "mostre as estações", "quais especialidades"</li>
      <li>👥 <strong>Usuários:</strong> "dados dos usuários", "quantos ativos"</li>
      <li>💻 <strong>Projeto:</strong> "análise do código", "melhorias"</li>
      <li>💬 <strong>Sistema:</strong> "como funciona", "comunicação"</li>
    </ul>`,
    '<em>✅ Todos os dados são carregados em tempo real do Firestore!</em>'
  ]);
}

// Função auxiliar para criar respostas padronizadas
function createResponse(type, title, content) {
  // Usar apenas estrutura HTML sem classes CSS específicas
  const icon = type === 'warning' ? '🚧' : 
               type === 'error' ? '🚨' : '🤖';
  
  return `
    <div>
      <h4>${icon} ${title}</h4>
      ${Array.isArray(content) ? content.join('<br>') : content}
    </div>
  `;
}

// **NOVAS FUNÇÕES DE ANÁLISE ADMINISTRATIVA**

// Função para analisar completeness de uma estação
async function analyzeStationCompleteness(db, stationId) {
  try {
    const stationDoc = await db.collection('estacoes_clinicas').doc(stationId).get();
    if (!stationDoc.exists) {
      return { error: 'Estação não encontrada' };
    }
    
    const station = stationDoc.data();
    const analysis = stationAnalyzer.analyzeCompleteness(station);
    const pepValidation = stationAnalyzer.validatePEP(station);
    const suggestions = stationAnalyzer.generateSuggestions(station);
    
    return {
      stationId,
      title: station.tituloEstacao || 'Sem título',
      completeness: analysis,
      pepValidation,
      suggestions,
      overallScore: calculateOverallScore(analysis, pepValidation)
    };
  } catch (error) {
    return { error: error.message };
  }
}

// Função para gerar sugestões de melhoria
async function generateImprovementSuggestions(db, stationId) {
  try {
    const analysis = await analyzeStationCompleteness(db, stationId);
    if (analysis.error) return analysis;
    
    const prioritizedSuggestions = analysis.suggestions.map((suggestion, index) => ({
      id: `sug_${index}`,
      description: suggestion,
      priority: determinePriority(suggestion),
      autoFixable: isAutoFixable(suggestion)
    }));
    
    return {
      stationId,
      suggestions: prioritizedSuggestions,
      summary: `${prioritizedSuggestions.length} sugestões identificadas`
    };
  } catch (error) {
    return { error: error.message };
  }
}

// Função para realizar correções automáticas
async function performAutomaticFixes(db, stationId, fixes) {
  try {
    const stationRef = db.collection('estacoes_clinicas').doc(stationId);
    const stationDoc = await stationRef.get();
    
    if (!stationDoc.exists) {
      return { error: 'Estação não encontrada' };
    }
    
    const station = stationDoc.data();
    let updatedStation = { ...station };
    const appliedFixes = [];
    
    // Correção automática de pontuação PEP
    if (fixes.includes('fix-pep-scoring') && station.padraoEsperadoProcedimento?.itensAvaliacao) {
      const pepFix = autoFixPEPScoring(updatedStation.padraoEsperadoProcedimento);
      if (pepFix.fixed) {
        updatedStation.padraoEsperadoProcedimento = pepFix.pep;
        appliedFixes.push('Pontuação PEP ajustada para somar 10');
      }
    }
    
    // Padronização de conteúdo
    if (fixes.includes('standardize-content')) {
      updatedStation = standardizeStationContent(updatedStation);
      appliedFixes.push('Conteúdo padronizado');
    }
    
    // Atualizar no Firestore se houve mudanças
    if (appliedFixes.length > 0) {
      await stationRef.update({
        ...updatedStation,
        lastModified: admin.firestore.FieldValue.serverTimestamp(),
        autoFixedBy: 'agent',
        autoFixHistory: admin.firestore.FieldValue.arrayUnion({
          timestamp: new Date().toISOString(),
          fixes: appliedFixes
        })
      });
    }
    
    return {
      stationId,
      appliedFixes,
      success: appliedFixes.length > 0,
      message: appliedFixes.length > 0 ? 
        `${appliedFixes.length} correções aplicadas com sucesso` : 
        'Nenhuma correção necessária'
    };
  } catch (error) {
    return { error: error.message };
  }
}

// Função para validar pontuação PEP
async function validatePEPScoring(db, stationId) {
  try {
    const stationDoc = await db.collection('estacoes_clinicas').doc(stationId).get();
    if (!stationDoc.exists) {
      return { error: 'Estação não encontrada' };
    }
    
    const station = stationDoc.data();
    return stationAnalyzer.validatePEP(station);
  } catch (error) {
    return { error: error.message };
  }
}

// Função para analisar todas as estações
async function analyzeAllStations(db) {
  try {
    const stationsSnapshot = await db.collection('estacoes_clinicas').get();
    const analyses = [];
    
    for (const doc of stationsSnapshot.docs) {
      const station = doc.data();
      const analysis = stationAnalyzer.analyzeCompleteness(station);
      const pepValidation = stationAnalyzer.validatePEP(station);
      
      analyses.push({
        id: doc.id,
        title: station.tituloEstacao || 'Sem título',
        overallScore: calculateOverallScore(analysis, pepValidation),
        issuesCount: analysis.issues?.length || 0,
        pepValid: pepValidation.valid
      });
    }
    
    // Ordenar por score (piores primeiro)
    analyses.sort((a, b) => a.overallScore - b.overallScore);
    
    return {
      total: analyses.length,
      analyses,
      summary: {
        needsAttention: analyses.filter(a => a.overallScore < 0.7).length,
        pepIssues: analyses.filter(a => !a.pepValid).length
      }
    };
  } catch (error) {
    return { error: error.message };
  }
}

// **SISTEMA DE ANÁLISE INTELIGENTE**
const stationAnalyzer = {
  // Análise de completeness
  analyzeCompleteness: (station) => {
    const requiredFields = ['idEstacao', 'tituloEstacao', 'especialidade'];
    const optionalFields = ['palavrasChave', 'instrucoesParticipante', 'impressos'];
    const issues = [];
    
    // Verificar campos obrigatórios
    requiredFields.forEach(field => {
      if (!station[field] || (typeof station[field] === 'string' && !station[field].trim())) {
        issues.push(`Campo obrigatório '${field}' não preenchido`);
      }
    });
    
    // Verificar qualidade do conteúdo
    if (station.palavrasChave && station.palavrasChave.length < 3) {
      issues.push('Poucas palavras-chave (recomendado: pelo menos 3)');
    }
    
    if (!station.impressos || station.impressos.length === 0) {
      issues.push('Nenhum impresso cadastrado');
    }
    
    const completeness = 1 - (issues.length * 0.1);
    
    return {
      score: Math.max(0, completeness),
      issues,
      required: requiredFields.every(field => station[field]),
      optional: optionalFields.filter(field => station[field]).length
    };
  },
  
  // Validação de PEP
  validatePEP: (station) => {
    const pep = station.padraoEsperadoProcedimento;
    if (!pep?.itensAvaliacao) {
      return { 
        valid: false, 
        errors: ['PEP não encontrado ou sem itens de avaliação'],
        currentTotal: 0,
        expectedTotal: 10
      };
    }
    
    const totalScore = pep.itensAvaliacao.reduce((sum, item) => 
      sum + (item.pontuacoes?.adequado || 0), 0);
    
    return {
      valid: Math.abs(totalScore - 10) < 0.001,
      currentTotal: totalScore,
      expectedTotal: 10,
      errors: totalScore !== 10 ? [`Pontuação total: ${totalScore} (deve ser 10)`] : [],
      suggestions: totalScore !== 10 ? ['Ajustar pontuações para somar exatamente 10'] : []
    };
  },
  
  // Sugestões de melhoria
  generateSuggestions: (station) => {
    const suggestions = [];
    
    // Verificar imagens dos impressos
    if (station.impressos) {
      station.impressos.forEach((impresso, index) => {
        if (impresso.tipoConteudo === 'imagem' && !impresso.caminhoImagem) {
          suggestions.push(`Impresso ${index + 1}: Adicionar imagem`);
        }
      });
    }
    
    // Verificar palavras-chave
    if (!station.palavrasChave || station.palavrasChave.length < 3) {
      suggestions.push('Adicionar mais palavras-chave para melhor categorização');
    }
    
    // Verificar instruções
    if (!station.instrucoesParticipante?.roteiro) {
      suggestions.push('Adicionar roteiro detalhado para o participante');
    }
    
    // Verificar feedback
    if (!station.padraoEsperadoProcedimento?.feedback?.fontes) {
      suggestions.push('Adicionar fontes de feedback para melhor aprendizado');
    }
    
    return suggestions;
  }
};

// **FUNÇÕES AUXILIARES**

function calculateOverallScore(completenessAnalysis, pepValidation) {
  const completenessScore = completenessAnalysis.score || 0;
  const pepScore = pepValidation.valid ? 1 : 0.5;
  return (completenessScore + pepScore) / 2;
}

function determinePriority(suggestion) {
  if (suggestion.includes('PEP') || suggestion.includes('pontuação')) return 'alta';
  if (suggestion.includes('obrigatório')) return 'alta';
  if (suggestion.includes('imagem')) return 'média';
  return 'baixa';
}

function isAutoFixable(suggestion) {
  return suggestion.includes('PEP') || 
         suggestion.includes('pontuação') || 
         suggestion.includes('padronizar');
}

function autoFixPEPScoring(pep) {
  if (!pep?.itensAvaliacao || pep.itensAvaliacao.length === 0) {
    return { fixed: false, pep };
  }
  
  const targetTotal = 10;
  const itemCount = pep.itensAvaliacao.length;
  const baseScore = Math.floor((targetTotal / itemCount) * 10) / 10;
  const remainder = targetTotal - (baseScore * itemCount);
  
  pep.itensAvaliacao.forEach((item, index) => {
    if (!item.pontuacoes) item.pontuacoes = {};
    item.pontuacoes.adequado = baseScore + (index < remainder ? 0.1 : 0);
  });
  
  return { fixed: true, pep };
}

function standardizeStationContent(station) {
  // Padronizar títulos
  if (station.tituloEstacao) {
    station.tituloEstacao = station.tituloEstacao.trim();
  }
  
  // Padronizar especialidade
  if (station.especialidade) {
    station.especialidade = station.especialidade.trim();
  }
  
  // Padronizar palavras-chave
  if (Array.isArray(station.palavrasChave)) {
    station.palavrasChave = station.palavrasChave
      .map(palavra => palavra.trim().toLowerCase())
      .filter(palavra => palavra.length > 0);
  }
  
  return station;
}

// **AGENTE VIRTUAL PARA SIMULAÇÕES**
async function generateVirtualActorResponse(stationData, message, context, role) {
  try {
    // Base de conhecimento do agente virtual
    const actorPersonality = {
      greeting: "Olá! Sou seu paciente virtual. Como posso ajudá-lo hoje?",
      responses: {
        introduction: "Meu nome é João Silva, tenho 45 anos...",
        symptoms: "Estou sentindo dores no peito há algumas horas...",
        history: "Já tive problemas cardíacos na família..."
      }
    };
    
    const evaluatorPersonality = {
      greeting: "Olá! Sou seu avaliador virtual. Vamos começar a simulação?",
      responses: {
        feedback: "Muito bem! Você demonstrou boa técnica...",
        guidance: "Tente ser mais específico na anamnese...",
        scoring: "Sua pontuação neste item foi..."
      }
    };
    
    const personality = role === 'actor' ? actorPersonality : evaluatorPersonality;
    
    // Análise simples da mensagem
    const messageLower = message.toLowerCase();
    let response = "";
    
    if (messageLower.includes('olá') || messageLower.includes('oi')) {
      response = personality.greeting;
    } else if (messageLower.includes('sintoma') || messageLower.includes('sente')) {
      response = personality.responses.symptoms || "Posso descrever meus sintomas...";
    } else if (messageLower.includes('história') || messageLower.includes('histórico')) {
      response = personality.responses.history || "Sobre minha história médica...";
    } else {
      response = "Entendo. Pode me fazer mais perguntas ou continuar a consulta...";
    }
    
    return {
      text: response,
      role,
      context: context || 'simulation',
      timestamp: new Date().toISOString(),
      stationId: stationData.idEstacao
    };
  } catch (error) {
    return {
      text: "Desculpe, tive uma dificuldade técnica. Pode repetir?",
      error: error.message
    };
  }
}

async function generateAudioResponse(text) {
  // TODO: Implementar integração com serviço TTS
  // Por enquanto, retorna URL placeholder
  return `data:text/plain;base64,${Buffer.from(text).toString('base64')}`;
}

module.exports = router;
