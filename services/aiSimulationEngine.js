const { getGeminiManager } = require('../utils/geminiApiManager');

class AISimulationEngine {
  constructor() {
    this.geminiManager = getGeminiManager();
    this.conversationMemory = new Map(); // sessionId -> conversationData
  }

  // Mapeamento de conceitos médicos para contextos
  getConceptMap() {
    return {
      // Identificação pessoal
      'identificacao|nome|idade|profissao|trabalho': ['IDENTIFICAÇÃO DO PACIENTE', 'IDENTIFICACAO'],

      // Queixa principal e motivo da consulta
      'queixa|motivo|problema|consulta|procurou': ['MOTIVO DE CONSULTA', 'QUEIXA PRINCIPAL'],

      // Dor e sintomas principais
      'dor|doendo|doi|machuca|incomodo': ['DOR', 'SINTOMAS PRINCIPAIS', 'QUEIXA PRINCIPAL'],

      // Características da dor
      'quando|inicio|comerou|ha quanto tempo|desde': ['inicio', 'cronologia', 'tempo'],
      'onde|local|localizacao|regiao': ['localizacao', 'local', 'sitio'],
      'como|tipo|caracteristica|sensacao': ['caracteristica', 'tipo', 'qualidade'],
      'irradia|espalha|vai para|passa para': ['irradiacao', 'propagacao'],
      'forte|fraca|intensidade|escala|nota': ['intensidade', 'magnitude'],
      'melhora|piora|alivia|agrava|fatores': ['fatores', 'melhora', 'piora'],

      // Sintomas associados
      'outros sintomas|acompanha|junto|associado|sintomas': ['SINTOMAS ACOMPANHANTES', 'MANIFESTACOES', 'OUTROS SINTOMAS'],
      'febre|temperatura|febril': ['febre', 'temperatura'],
      'nausea|vomito|enjoo': ['gastrointestinal', 'nauseas'],
      'cansaco|fadiga|fraqueza|disposicao': ['fadiga', 'astenia', 'cansaco'],

      // História clínica
      'historico|antecedentes|antes|ja teve|familia': ['ANTECEDENTES', 'HISTORIA'],
      'cirurgia|operacao|procedimento': ['cirurgicos', 'procedimentos'],
      'doenca|patologia|problema de saude': ['patologicos', 'morbidades'],
      'alergia|alergico|reacao': ['alergias', 'reacoes'],
      'medicamento|remedio|droga|toma': ['medicamentos', 'remedios', 'MEDICACOES'],

      // Hábitos de vida
      'fuma|cigarro|tabaco|tabagismo': ['tabagismo', 'fumo'],
      'bebe|alcool|bebida|etilismo': ['etilismo', 'alcool'],
      'exercicio|atividade fisica|esporte': ['atividade fisica', 'exercicios'],

      // Exames e procedimentos
      'exame|resultado|laboratorio|radiografia|tomografia': ['exames', 'procedimentos', 'resultados'],
      'hemograma|sangue|laboratorio': ['laboratoriais', 'hemograma'],
      'raio-x|radiografia|imagem': ['radiologicos', 'imagem'],

      // Sistema específicos
      'respiracao|pulmao|tosse|falta de ar': ['respiratorio', 'pulmonar'],
      'coracao|peito|pressao|palpitacao': ['cardiovascular', 'cardiaco'],
      'barriga|abdomen|intestino|digestao': ['digestorio', 'abdominal'],
      'urina|bexiga|rim|xixi': ['genitourinario', 'urologico'],
      'pele|manchas|lesao|ferida': ['dermatologico', 'cutaneo']
    };
  }

  // Mapear pergunta do candidato para contextos relevantes da estação
  mapQuestionToContexts(question, stationData) {
    const questionLower = question.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .replace(/[^\w\s]/g, ' ') // Remove pontuação
      .trim();

    const availableContexts = stationData.materiaisDisponiveis?.informacoesVerbaisSimulado || [];
    const conceptMap = this.getConceptMap();
    const matchedContexts = [];

    // 1. Buscar contextos por mapeamento semântico
    for (const [concepts, contextKeywords] of Object.entries(conceptMap)) {
      const conceptRegex = new RegExp(`\\b(${concepts})\\b`, 'i');

      if (conceptRegex.test(questionLower)) {
        // Buscar contextos que contenham essas palavras-chave
        availableContexts.forEach(context => {
          const contextKey = context.contextoOuPerguntaChave.toLowerCase();
          const contextInfo = context.informacao.toLowerCase();

          const hasKeywordInContext = contextKeywords.some(keyword =>
            contextKey.includes(keyword.toLowerCase()) ||
            contextInfo.includes(keyword.toLowerCase())
          );

          if (hasKeywordInContext && !matchedContexts.find(c => c.contextoOuPerguntaChave === context.contextoOuPerguntaChave)) {
            matchedContexts.push({
              ...context,
              relevanceScore: this.calculateRelevanceScore(questionLower, context),
              matchType: 'semantic'
            });
          }
        });
      }
    }

    // 2. Buscar por palavras-chave diretas nos contextos
    availableContexts.forEach(context => {
      const contextKey = context.contextoOuPerguntaChave.toLowerCase();
      const questionWords = questionLower.split(/\s+/).filter(word => word.length > 2);

      const directMatch = questionWords.some(word => contextKey.includes(word));

      if (directMatch && !matchedContexts.find(c => c.contextoOuPerguntaChave === context.contextoOuPerguntaChave)) {
        matchedContexts.push({
          ...context,
          relevanceScore: this.calculateRelevanceScore(questionLower, context),
          matchType: 'direct'
        });
      }
    });

    // 3. Buscar por similaridade no conteúdo das informações
    availableContexts.forEach(context => {
      if (matchedContexts.find(c => c.contextoOuPerguntaChave === context.contextoOuPerguntaChave)) {
        return; // Já foi encontrado
      }

      const infoLower = context.informacao.toLowerCase();
      const questionWords = questionLower.split(/\s+/).filter(word => word.length > 3);

      const contentMatch = questionWords.some(word => infoLower.includes(word));

      if (contentMatch) {
        matchedContexts.push({
          ...context,
          relevanceScore: this.calculateRelevanceScore(questionLower, context),
          matchType: 'content'
        });
      }
    });

    // Ordenar por relevância
    return matchedContexts
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 3); // Máximo 3 contextos mais relevantes
  }

  calculateRelevanceScore(question, context) {
    let score = 0;
    const questionWords = question.split(/\s+/).filter(word => word.length > 2);
    const contextText = (context.contextoOuPerguntaChave + ' ' + context.informacao).toLowerCase();

    questionWords.forEach(word => {
      if (contextText.includes(word)) {
        score += word.length; // Palavras maiores têm mais peso
      }
    });

    return score;
  }

  // Construir prompt para IA simular paciente
  buildPatientPrompt(stationData, question, matchedContexts, conversationHistory = []) {
    const patientData = stationData.materiaisDisponiveis?.informacoesVerbaisSimulado || [];

    // Informações básicas do paciente
    const identificationContext = patientData.find(ctx =>
      ctx.contextoOuPerguntaChave.toLowerCase().includes('identificacao') ||
      ctx.contextoOuPerguntaChave.toLowerCase().includes('paciente')
    );

    let prompt = `VOCÊ É UM PACIENTE SIMULADO EM UMA CONSULTA MÉDICA.

INFORMAÇÕES DO SEU CASO:
${patientData.map(ctx => `
CONTEXTO: ${ctx.contextoOuPerguntaChave}
SUAS INFORMAÇÕES: ${ctx.informacao}
`).join('\n')}

CONTEXTOS MAIS RELEVANTES PARA A PERGUNTA ATUAL:
${matchedContexts.map(ctx => `
- ${ctx.contextoOuPerguntaChave}: ${ctx.informacao}
`).join('\n')}

HISTÓRICO DA CONVERSA:
${conversationHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n')}

PERGUNTA DO MÉDICO: "${question}"

INSTRUÇÕES PARA SUA RESPOSTA:
1. Responda APENAS como um paciente real responderia
2. Use linguagem simples e coloquial (não técnica)
3. Base sua resposta nas informações dos contextos relevantes
4. Seja consistente com o que já disse antes
5. Se não souber algo, diga "não sei" ou "não lembro"
6. Responda de forma natural e conversacional
7. Não use termos médicos complexos
8. Expresse seus sintomas como um paciente sentiria

EXEMPLO DE BOA RESPOSTA:
Se perguntado sobre dor: "Doutor, começou faz uns 5 meses. Dói aqui nas costas, bem embaixo. É uma dor chata que fica o tempo todo, mas de noite é pior. Acordo de madrugada por causa dela."

SUA RESPOSTA COMO PACIENTE:`;

    return prompt;
  }

  // Detectar solicitações de impressos/exames
  detectMaterialRequest(message) {
    const materialKeywords = [
      'exame', 'resultado', 'laboratorio', 'hemograma', 'sangue',
      'radiografia', 'raio-x', 'tomografia', 'ressonancia',
      'eletrocardiograma', 'ecg', 'ultrassom', 'endoscopia',
      'posso ver', 'pode mostrar', 'tem o resultado', 'cadê o exame'
    ];

    const messageLower = message.toLowerCase();
    return materialKeywords.some(keyword => messageLower.includes(keyword));
  }

  // Iniciar nova simulação
  async startSimulation(sessionId, stationData, userId) {
    const conversationData = {
      sessionId,
      stationId: stationData.id,
      userId,
      startTime: new Date(),
      stationData,
      conversationHistory: [],
      releasedMaterials: [],
      patientProfile: this.generatePatientProfile(stationData)
    };

    this.conversationMemory.set(sessionId, conversationData);

    return {
      success: true,
      sessionId,
      patientProfile: conversationData.patientProfile,
      welcomeMessage: this.generateWelcomeMessage(stationData)
    };
  }

  // Gerar perfil do paciente baseado na estação
  generatePatientProfile(stationData) {
    const identification = stationData.materiaisDisponiveis?.informacoesVerbaisSimulado?.find(
      ctx => ctx.contextoOuPerguntaChave.toLowerCase().includes('identificacao')
    );

    return {
      name: this.extractPatientName(identification?.informacao || ''),
      age: this.extractPatientAge(identification?.informacao || ''),
      occupation: this.extractPatientOccupation(identification?.informacao || ''),
      chiefComplaint: this.extractChiefComplaint(stationData)
    };
  }

  extractPatientName(info) {
    const nameMatch = info.match(/nome\s+é\s+([^.\n]+)/i) || info.match(/me chamo\s+([^.\n]+)/i);
    return nameMatch ? nameMatch[1].trim() : 'Paciente';
  }

  extractPatientAge(info) {
    const ageMatch = info.match(/(\d+)\s+anos/i);
    return ageMatch ? parseInt(ageMatch[1]) : null;
  }

  extractPatientOccupation(info) {
    const occupationMatch = info.match(/trabalho\s+como\s+([^.\n]+)/i) || info.match(/sou\s+([^.\n]+)/i);
    return occupationMatch ? occupationMatch[1].trim() : null;
  }

  extractChiefComplaint(stationData) {
    const motivo = stationData.materiaisDisponiveis?.informacoesVerbaisSimulado?.find(
      ctx => ctx.contextoOuPerguntaChave.toLowerCase().includes('motivo')
    );
    return motivo ? motivo.informacao : 'Não especificado';
  }

  generateWelcomeMessage(stationData) {
    const patientName = this.extractPatientName(
      stationData.materiaisDisponiveis?.informacoesVerbaisSimulado?.find(
        ctx => ctx.contextoOuPerguntaChave.toLowerCase().includes('identificacao')
      )?.informacao || ''
    );

    return `Olá doutor! Eu sou ${patientName}. Vim aqui hoje porque estou precisando de ajuda...`;
  }

  // Processar mensagem do candidato
  async processMessage(sessionId, message) {
    const conversation = this.conversationMemory.get(sessionId);
    if (!conversation) {
      throw new Error('Sessão não encontrada');
    }

    try {
      // Verificar se é solicitação de material
      const isMaterialRequest = this.detectMaterialRequest(message);

      if (isMaterialRequest) {
        return await this.handleMaterialRequest(sessionId, message);
      }

      // Mapear pergunta para contextos
      const matchedContexts = this.mapQuestionToContexts(message, conversation.stationData);

      // Construir prompt
      const prompt = this.buildPatientPrompt(
        conversation.stationData,
        message,
        matchedContexts,
        conversation.conversationHistory
      );

      // Gerar resposta da IA
      const aiResponse = await this.geminiManager.generateResponse(prompt, {
        temperature: 0.8,
        maxOutputTokens: 500
      });

      // Atualizar histórico
      conversation.conversationHistory.push(
        { role: 'médico', content: message, timestamp: new Date() },
        { role: 'paciente', content: aiResponse.text, timestamp: new Date() }
      );

      return {
        success: true,
        patientResponse: aiResponse.text,
        contextUsed: matchedContexts.map(ctx => ctx.contextoOuPerguntaChave),
        keyUsed: aiResponse.keyUsed,
        tokensUsed: aiResponse.tokensUsed
      };

    } catch (error) {
      console.error('Erro ao processar mensagem:', error);
      return {
        success: false,
        error: error.message,
        patientResponse: 'Desculpe, não consegui entender. Pode repetir a pergunta?'
      };
    }
  }

  // Lidar com solicitação de materiais/impressos
  async handleMaterialRequest(sessionId, message) {
    const conversation = this.conversationMemory.get(sessionId);
    const availableMaterials = conversation.stationData.materiaisDisponiveis?.impressos || [];

    // Mapear solicitação para materiais disponíveis
    const requestedMaterials = this.matchMaterialRequest(message, availableMaterials);

    if (requestedMaterials.length > 0) {
      // Adicionar aos materiais liberados
      requestedMaterials.forEach(material => {
        if (!conversation.releasedMaterials.find(m => m.idImpresso === material.idImpresso)) {
          conversation.releasedMaterials.push(material);
        }
      });

      const materialNames = requestedMaterials.map(m => m.tituloImpresso).join(', ');

      return {
        success: true,
        patientResponse: `Claro doutor, aqui estão os resultados que o senhor pediu.`,
        materialsReleased: requestedMaterials,
        materialNames
      };
    } else {
      return {
        success: true,
        patientResponse: 'Doutor, não tenho esse exame comigo.',
        materialsReleased: []
      };
    }
  }

  // Mapear solicitação para materiais disponíveis
  matchMaterialRequest(message, availableMaterials) {
    const messageLower = message.toLowerCase();
    const matchedMaterials = [];

    availableMaterials.forEach(material => {
      const titleLower = material.tituloImpresso.toLowerCase();
      const titleWords = titleLower.split(/\s+/);

      // Verificar se alguma palavra do título está na mensagem
      const hasMatch = titleWords.some(word =>
        word.length > 3 && messageLower.includes(word)
      );

      if (hasMatch) {
        matchedMaterials.push(material);
      }
    });

    return matchedMaterials;
  }

  // Obter status da simulação
  getSimulationStatus(sessionId) {
    const conversation = this.conversationMemory.get(sessionId);
    if (!conversation) {
      return null;
    }

    return {
      sessionId: conversation.sessionId,
      stationId: conversation.stationId,
      startTime: conversation.startTime,
      messageCount: conversation.conversationHistory.length,
      releasedMaterials: conversation.releasedMaterials.length,
      patientProfile: conversation.patientProfile
    };
  }

  // Finalizar simulação
  endSimulation(sessionId) {
    const conversation = this.conversationMemory.get(sessionId);
    if (conversation) {
      this.conversationMemory.delete(sessionId);
      return {
        success: true,
        duration: new Date() - conversation.startTime,
        messageCount: conversation.conversationHistory.length,
        materialsUsed: conversation.releasedMaterials.length
      };
    }
    return { success: false, error: 'Sessão não encontrada' };
  }
}

module.exports = {
  AISimulationEngine
};