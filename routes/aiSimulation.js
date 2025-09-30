const express = require('express');
const { db } = require('../config/firebase');
const { AISimulationEngine } = require('../services/aiSimulationEngine');
const { getGeminiManager } = require('../utils/geminiApiManager');
const router = express.Router();

// Log de todas as requisições para esta rota
router.use((req, res, next) => {
  console.log(`🔥 [AI-SIM] ${req.method} ${req.path} - Headers:`, JSON.stringify(req.headers, null, 2));
  next();
});

// Teste simples de conectividade
router.get('/test', (req, res) => {
  console.log('✅ [AI-SIM TEST] Endpoint funcionando!');
  res.json({
    success: true,
    message: 'AI Simulation API funcionando!',
    timestamp: new Date().toISOString()
  });
});

// Instância global da engine de simulação
let aiEngine = null;

function getAIEngine() {
  if (!aiEngine) {
    aiEngine = new AISimulationEngine();
  }
  return aiEngine;
}

// Middleware para validar sessão
const validateSession = (req, res, next) => {
  const { sessionId } = req.body;
  if (!sessionId) {
    return res.status(400).json({
      success: false,
      error: 'Session ID is required'
    });
  }
  next();
};

// Middleware para autenticação (reutilizar do sistema existente)
const authenticateUser = async (req, res, next) => {
  try {
    console.log('🔐 [AI-SIM AUTH] Headers:', req.headers);
    console.log('🔐 [AI-SIM AUTH] Body:', req.body);

    // Para simulação com IA, podemos usar uma autenticação mais simples
    // ou reutilizar o middleware existente do sistema
    const userId = req.headers['user-id'] || req.body.userId;
    console.log('🔐 [AI-SIM AUTH] UserID encontrado:', userId);

    if (!userId) {
      console.log('❌ [AI-SIM AUTH] UserID ausente');
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }
    req.userId = userId;
    console.log('✅ [AI-SIM AUTH] Usuário autenticado:', userId);
    next();
  } catch (error) {
    console.error('❌ [AI-SIM AUTH] Erro na autenticação:', error);
    res.status(401).json({
      success: false,
      error: 'Authentication failed'
    });
  }
};

/**
 * POST /api/ai-simulation/start
 * Iniciar nova simulação com IA
 */
router.post('/start', authenticateUser, async (req, res) => {
  try {
    console.log('🚀 [AI-SIM START] Requisição recebida');
    console.log('🚀 [AI-SIM START] Body:', req.body);

    const { stationId, userId, stationData: providedStationData } = req.body;

    if (!stationId) {
      console.log('❌ [AI-SIM START] stationId ausente');
      return res.status(400).json({
        success: false,
        error: 'Station ID is required'
      });
    }

    console.log('🚀 [AI-SIM START] stationId:', stationId);

    let stationData;

    // Se dados da estação foram fornecidos, usar eles; senão buscar no Firestore
    if (providedStationData) {
      stationData = providedStationData;
      console.log('🚀 [AI-SIM START] Usando dados da estação fornecidos');
    } else {
      // Buscar dados da estação no Firestore
      const stationRef = db.collection('estacoes_clinicas').doc(stationId);
      const stationDoc = await stationRef.get();

      if (!stationDoc.exists) {
        return res.status(404).json({
          success: false,
          error: 'Station not found'
        });
      }

      stationData = {
        id: stationDoc.id,
        ...stationDoc.data()
      };
    }

    // Validar se a estação tem dados necessários para simulação
    const informacoesVerbais = stationData.materiaisDisponiveis?.informacoesVerbaisSimulado;
    if (!informacoesVerbais || informacoesVerbais.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Station does not have verbal information for simulation'
      });
    }

    // Gerar ID único para a sessão
    const sessionId = `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Iniciar simulação
    const engine = getAIEngine();
    const result = await engine.startSimulation(sessionId, stationData, userId || req.userId);

    res.json({
      success: true,
      sessionId,
      stationId,
      stationTitle: stationData.tituloEstacao,
      patientProfile: result.patientProfile,
      welcomeMessage: result.welcomeMessage,
      availableMaterials: stationData.materiaisDisponiveis?.impressos?.map(item => ({
        id: item.idImpresso,
        title: item.tituloImpresso,
        type: item.tipoConteudo
      })) || []
    });

  } catch (error) {
    console.error('Error starting AI simulation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start simulation: ' + error.message
    });
  }
});

/**
 * POST /api/ai-simulation/message
 * Enviar mensagem e receber resposta do paciente simulado
 */
router.post('/message', authenticateUser, validateSession, async (req, res) => {
  try {
    const { sessionId, message, stationData, releasedData } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    const engine = getAIEngine();
    const result = await engine.processMessage(sessionId, message.trim(), {
      stationData,
      releasedData
    });

    if (!result.success) {
      return res.status(500).json(result);
    }

    res.json({
      success: true,
      aiResponse: result.patientResponse || result.aiResponse,
      contextUsed: result.contextUsed || [],
      materialsReleased: result.materialsReleased || [],
      materialNames: result.materialNames || '',
      metadata: {
        keyUsed: result.keyUsed,
        tokensUsed: result.tokensUsed,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error processing message:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process message: ' + error.message,
      aiResponse: 'Desculpe, tive um problema para responder. Pode repetir a pergunta?'
    });
  }
});

/**
 * POST /api/ai-simulation/request-material
 * Solicitar material/impresso específico
 */
router.post('/request-material', authenticateUser, validateSession, async (req, res) => {
  try {
    const { sessionId, materialKeywords } = req.body;

    if (!materialKeywords) {
      return res.status(400).json({
        success: false,
        error: 'Material keywords are required'
      });
    }

    // Usar a engine para processar como solicitação de material
    const engine = getAIEngine();
    const message = `Doutor, posso ver o ${materialKeywords}?`;
    const result = await engine.processMessage(sessionId, message);

    res.json({
      success: true,
      patientResponse: result.patientResponse,
      materialsReleased: result.materialsReleased || [],
      materialNames: result.materialNames || ''
    });

  } catch (error) {
    console.error('Error requesting material:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to request material: ' + error.message
    });
  }
});

/**
 * GET /api/ai-simulation/status/:sessionId
 * Obter status atual da simulação
 */
router.get('/status/:sessionId', authenticateUser, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const engine = getAIEngine();
    const status = engine.getSimulationStatus(sessionId);

    if (!status) {
      return res.status(404).json({
        success: false,
        error: 'Simulation session not found'
      });
    }

    res.json({
      success: true,
      ...status
    });

  } catch (error) {
    console.error('Error getting simulation status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get simulation status: ' + error.message
    });
  }
});

/**
 * POST /api/ai-simulation/end
 * Finalizar simulação
 */
router.post('/end', authenticateUser, validateSession, async (req, res) => {
  try {
    const { sessionId, finalData } = req.body;

    const engine = getAIEngine();
    const result = engine.endSimulation(sessionId, finalData);

    res.json(result);

  } catch (error) {
    console.error('Error ending simulation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to end simulation: ' + error.message
    });
  }
});

/**
 * GET /api/ai-simulation/stats
 * Obter estatísticas de uso das APIs
 */
router.get('/stats', authenticateUser, async (req, res) => {
  try {
    const geminiManager = getGeminiManager();
    const stats = geminiManager.getUsageStats();

    res.json({
      success: true,
      stats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error getting API stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get API stats: ' + error.message
    });
  }
});

/**
 * GET /api/ai-simulation/health
 * Health check das APIs do Gemini
 */
router.get('/health', async (req, res) => {
  try {
    const geminiManager = getGeminiManager();
    const healthCheck = await geminiManager.healthCheck();

    res.json({
      success: true,
      health: healthCheck,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in health check:', error);
    res.status(500).json({
      success: false,
      error: 'Health check failed: ' + error.message
    });
  }
});

/**
 * POST /api/ai-simulation/evaluate-pep
 * IA avaliar automaticamente o PEP com base na conversa
 */
router.post('/evaluate-pep', authenticateUser, validateSession, async (req, res) => {
  try {
    const { sessionId, stationData, checklistData, conversationHistory, releasedData } = req.body;

    if (!checklistData?.itensAvaliacao?.length) {
      return res.json({
        success: false,
        error: 'Nenhum item de avaliação encontrado no PEP'
      });
    }

    // Criar prompt para IA avaliar o PEP
    const evaluationPrompt = `
Você é um avaliador médico experiente. Analise a conversa abaixo entre um candidato médico e um paciente virtual, e avalie a performance com base no checklist de avaliação (PEP).

**ESTAÇÃO:** ${stationData.tituloEstacao}
**ESPECIALIDADE:** ${stationData.especialidade}

**HISTÓRICO DA CONVERSA:**
${conversationHistory.map(msg => {
  if (msg.role === 'candidate') return `CANDIDATO: ${msg.content}`;
  if (msg.role === 'ai_actor') return `PACIENTE: ${msg.content}`;
  return `SISTEMA: ${msg.content}`;
}).join('\n')}

**MATERIAIS LIBERADOS:** ${Object.keys(releasedData).length} materiais foram solicitados e liberados.

**ITENS DE AVALIAÇÃO (PEP):**
${checklistData.itensAvaliacao.map((item, index) => {
  const pontosVerificacao = item.pontosVerificacao || [];
  return `${index + 1}. ${item.descricaoItem}
   Pontos de verificação (marque true/false para cada):
   ${pontosVerificacao.map((ponto, i) => `   ${i + 1}. ${ponto.descricao} [AVALIAR]`).join('\n')}`;
}).join('\n\n')}

**INSTRUÇÕES:**
- Avalie cada ponto de verificação como true (executado corretamente) ou false (não executado ou incorreto)
- Seja criterioso mas justo na avaliação
- Considere a qualidade da anamnese, exame físico, raciocínio clínico e comunicação
- Base sua avaliação APENAS no que foi demonstrado na conversa

**FORMATO DE RESPOSTA (JSON):**
{
  "itemId1": [true, false, true],
  "itemId2": [false, true],
  ...
}

Onde cada array contém os valores boolean para os pontos de verificação daquele item.
`;

    const geminiManager = getGeminiManager();
    const result = await geminiManager.generateResponse(evaluationPrompt, {
      model: 'gemini-1.5-flash',
      maxOutputTokens: 2000,
      temperature: 0.3
    });

    // Tentar extrair JSON da resposta
    let evaluations = {};
    try {
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        evaluations = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.log('❌ Erro ao parsear avaliação da IA:', parseError);

      // Fallback: criar avaliação baseada em keywords na conversa
      checklistData.itensAvaliacao.forEach(item => {
        const pontosCount = item.pontosVerificacao?.length || 0;
        if (pontosCount > 0) {
          // Avaliar baseado em palavras-chave simples
          const conversationText = conversationHistory
            .filter(msg => msg.role === 'candidate')
            .map(msg => msg.content)
            .join(' ')
            .toLowerCase();

          const hasAnamnesis = conversationText.includes('nome') || conversationText.includes('idade') || conversationText.includes('queixa');
          const hasExamination = conversationText.includes('exame') || conversationText.includes('físico') || conversationText.includes('dor');

          // Criar array de avaliação simples
          evaluations[item.idItem] = Array(pontosCount).fill(false).map((_, index) => {
            if (index === 0) return hasAnamnesis; // Primeiro ponto geralmente é anamnese
            if (index === 1) return hasExamination; // Segundo ponto geralmente é exame
            return Math.random() > 0.5; // Outros pontos aleatórios
          });
        }
      });
    }

    res.json({
      success: true,
      evaluations,
      metadata: {
        keyUsed: result.keyUsed,
        tokensUsed: result.tokensUsed,
        conversationLength: conversationHistory.length,
        materialsReleased: Object.keys(releasedData).length
      }
    });

  } catch (error) {
    console.error('Error evaluating PEP with AI:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to evaluate PEP: ' + error.message
    });
  }
});

/**
 * POST /api/ai-simulation/test
 * Endpoint para testes rápidos (apenas em desenvolvimento)
 */
router.post('/test', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      success: false,
      error: 'Test endpoint not available in production'
    });
  }

  try {
    const { prompt, model } = req.body;

    const geminiManager = getGeminiManager();
    const result = await geminiManager.generateResponse(
      prompt || 'Teste de conectividade da API Gemini',
      { model, maxOutputTokens: 100 }
    );

    res.json({
      success: true,
      response: result.text,
      metadata: {
        keyUsed: result.keyUsed,
        tokensUsed: result.tokensUsed
      }
    });

  } catch (error) {
    console.error('Error in test endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Test failed: ' + error.message
    });
  }
});

module.exports = router;