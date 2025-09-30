const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const router = express.Router();

class AIChatManager {
  constructor() {
    this.apiKeys = [];
    this.currentKeyIndex = 0;
    this.loadApiKeys();
  }

  loadApiKeys() {
    // Carregar chaves do .env com preferência para Gemini 2.5 Flash
    for (let i = 1; i <= 6; i++) {
      const key = process.env[`GOOGLE_API_KEY_${i}`];
      if (key) {
        this.apiKeys.push({
          key,
          index: i,
          quotaUsed: 0,
          maxQuota: 1500, // Limite diário aproximado
          lastReset: new Date().toDateString(),
          errors: 0,
          isActive: true
        });
      }
    }
    console.log(`🔑 Carregadas ${this.apiKeys.length} chaves API para IA Chat`);
  }

  getActiveKey() {
    const today = new Date().toDateString();

    // Reset diário das quotas
    this.apiKeys.forEach(keyData => {
      if (keyData.lastReset !== today) {
        keyData.quotaUsed = 0;
        keyData.errors = 0;
        keyData.lastReset = today;
        keyData.isActive = true;
        console.log(`🔄 Reset quota para chave ${keyData.index}`);
      }
    });

    // Encontrar primeira chave disponível
    for (let i = 0; i < this.apiKeys.length; i++) {
      const keyIndex = (this.currentKeyIndex + i) % this.apiKeys.length;
      const keyData = this.apiKeys[keyIndex];

      if (keyData.isActive && keyData.quotaUsed < keyData.maxQuota) {
        this.currentKeyIndex = keyIndex;
        return keyData;
      }
    }

    // Se todas estão no limite, usar a com menos uso
    const leastUsedKey = this.apiKeys.reduce((min, key) =>
      (key.quotaUsed < min.quotaUsed) ? key : min
    );

    console.log(`⚠️ Todas as chaves no limite, usando chave ${leastUsedKey.index} (uso: ${leastUsedKey.quotaUsed})`);
    return leastUsedKey;
  }

  async generateAIResponse(userMessage, stationData, conversationHistory) {
    const keyData = this.getActiveKey();

    try {
      // VERIFICAR SE É PERGUNTA FORA DO SCRIPT
      if (this.isOffScript(userMessage, stationData)) {
        console.log(`⚠️ Pergunta fora do script detectada: "${userMessage}"`);

        return {
          message: "Não consta no script.",
          releaseMaterial: false,
          materialToRelease: null,
          keyUsed: keyData.index,
          quotaRemaining: keyData.maxQuota - keyData.quotaUsed,
          offScript: true
        };
      }

      // VERIFICAR SE É SOLICITAÇÃO VAGA
      const vagueCheck = this.shouldGiveVagueResponse(userMessage, conversationHistory, stationData);
      if (vagueCheck.isVague && !vagueCheck.shouldAccept) {
        console.log(`⚠️ Solicitação vaga detectada: "${userMessage}"`);

        return {
          message: vagueCheck.response,
          releaseMaterial: false,
          materialToRelease: null,
          keyUsed: keyData.index,
          quotaRemaining: keyData.maxQuota - keyData.quotaUsed,
          vagueRequest: true
        };
      }

      // Usar Gemini 2.5 Flash especificamente
      const genAI = new GoogleGenerativeAI(keyData.key);
      const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash-exp" // Usar Gemini 2.5 Flash
      });

      // Construir prompt contextual para simulação médica
      const prompt = this.buildMedicalSimulationPrompt(userMessage, stationData, conversationHistory);

      console.log(`🤖 Enviando para Gemini 2.5 Flash (chave ${keyData.index}):`, userMessage.substring(0, 100));

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // Atualizar estatísticas da chave
      keyData.quotaUsed++;
      keyData.lastUsed = new Date();

      console.log(`✅ Resposta da IA (${text.length} chars):`, text.substring(0, 150));

      return {
        message: text,
        keyUsed: keyData.index,
        quotaRemaining: keyData.maxQuota - keyData.quotaUsed
      };

    } catch (error) {
      console.error(`❌ Erro com chave ${keyData.index}:`, error.message);

      // Marcar chave como problemática se muitos erros
      keyData.errors++;
      if (keyData.errors >= 3) {
        keyData.isActive = false;
        console.log(`🚫 Chave ${keyData.index} desativada após ${keyData.errors} erros`);
      }

      // Tentar próxima chave se disponível
      if (this.apiKeys.some(k => k.isActive && k.quotaUsed < k.maxQuota)) {
        console.log(`🔄 Tentando próxima chave disponível...`);
        return this.generateAIResponse(userMessage, stationData, conversationHistory);
      }

      throw new Error(`Todas as chaves API indisponíveis: ${error.message}`);
    }
  }

  buildMedicalSimulationPrompt(userMessage, stationData, conversationHistory) {
    const stationInfo = stationData?.informacoesEssenciais || {};
    const patientScript = stationData?.materiaisDisponiveis?.informacoesVerbaisSimulado || [];
    const pepData = stationData?.padraoEsperadoProcedimento || null;

    // Extrair informações do paciente do script
    const patientInfo = this.extractPatientInfo(patientScript);

    let prompt = `Você é um paciente virtual em uma simulação médica. Suas características:\n\n`;

    // Informações básicas do paciente
    prompt += `IDENTIDADE DO PACIENTE:\n`;
    prompt += `- Nome: ${patientInfo.nome || 'Pedro Rodrigues'}\n`;
    prompt += `- Idade: ${patientInfo.idade || '36 anos'}\n`;
    prompt += `- Profissão: ${patientInfo.profissao || 'Segurança de shopping'}\n`;
    prompt += `- Estado Civil: ${patientInfo.estadoCivil || 'Casado'}\n\n`;

    // Contexto da estação
    if (stationInfo.titulo) {
      prompt += `CONTEXTO MÉDICO:\n`;
      prompt += `- Estação: ${stationInfo.titulo}\n`;
      if (stationInfo.contextoClinico) {
        prompt += `- Contexto: ${stationInfo.contextoClinico}\n`;
      }
      prompt += `\n`;
    }

    // Script do paciente
    if (patientScript.length > 0) {
      prompt += `SCRIPT DO PACIENTE (use como base para suas respostas):\n`;
      patientScript.forEach(item => {
        if (item.contextoOuPerguntaChave && item.informacao) {
          prompt += `- ${item.contextoOuPerguntaChave}: ${item.informacao}\n`;
        }
      });
      prompt += `\n`;
    }

    // Histórico da conversa (últimas 6 mensagens)
    if (conversationHistory.length > 0) {
      prompt += `CONVERSA ANTERIOR:\n`;
      const recentHistory = conversationHistory.slice(-6);
      recentHistory.forEach(msg => {
        const role = msg.sender === 'ai' ? 'Paciente' : 'Médico';
        prompt += `${role}: ${msg.message}\n`;
      });
      prompt += `\n`;
    }

    // Incluir informações sobre histórico de solicitações vagas
    const vagueRequestHistory = this.getVagueRequestHistory(conversationHistory);

    // Instruções para a IA
    prompt += `INSTRUÇÕES:\n`;
    prompt += `1. Responda SEMPRE como o paciente, mantendo consistência com o script\n`;
    prompt += `2. Use linguagem natural e coloquial (não muito técnica)\n`;
    prompt += `3. Seja cooperativo mas realista - um paciente real\n`;
    prompt += `4. Mantenha respostas concisas (máximo 2-3 frases)\n`;
    prompt += `5. Se não souber algo específico, diga "Não sei" ou "Não lembro"\n`;
    prompt += `6. Adapte-se ao contexto da conversa anterior\n`;
    prompt += `7. REGRA ABSOLUTA - JAMAIS use "não" redundante no final das frases:\n`;
    prompt += `   Se sua resposta já tem "não" no início, NÃO repita "não" no final\n`;
    prompt += `   - PROIBIDO: "Não fumo, não."\n`;
    prompt += `   - CORRETO: "Não fumo."\n`;
    prompt += `   - PROIBIDO: "Não, doutor, não fumo."\n`;
    prompt += `   - CORRETO: "Não, doutor. Não fumo."\n\n`;

    // Regras especiais para controle da conversa
    prompt += `REGRAS ESPECIAIS:\n`;
    prompt += `8. FUGA DO ROTEIRO: Se o candidato perguntar algo que não está no seu script, responda: "Não consta no script"\n`;
    prompt += `9. SOLICITAÇÕES VAGAS: Se o candidato solicitar algo genérico como "exames" ou "exame de sangue":\n`;
    prompt += `   - 1ª vez: Responda "Seja mais específico, doutor"\n`;
    prompt += `   - 2ª vez: Aceite a solicitação vaga (para ele aprender que precisa ser específico)\n`;
    prompt += `10. ANÁLISE DOS MATERIAIS: Considere que alguns exames precisam ser solicitados especificamente para o candidato pontuar\n\n`;

    // Informar sobre solicitações vagas anteriores
    if (vagueRequestHistory.hasVagueRequests) {
      prompt += `HISTÓRICO DE SOLICITAÇÕES VAGAS:\n`;
      prompt += `- O candidato já fez ${vagueRequestHistory.count} solicitação(ões) vaga(s)\n`;
      prompt += `- Última solicitação vaga: "${vagueRequestHistory.lastVague}"\n\n`;
    }

    // Incluir informações do PEP para orientar sobre especificidade necessária
    if (pepData && pepData.itensAvaliacao) {
      prompt += `ITENS DE AVALIAÇÃO (PEP) - Para referência sobre especificidade necessária:\n`;
      pepData.itensAvaliacao.forEach((item, index) => {
        if (item.descricaoItem) {
          prompt += `- Item ${index + 1}: ${item.descricaoItem}\n`;
        }
      });
      prompt += `\nNOTA: Se o candidato solicitar algo genérico que está especificado no PEP, lembre-se das regras sobre especificidade.\n\n`;
    }

    prompt += `PERGUNTA ATUAL DO MÉDICO: "${userMessage}"\n\n`;
    prompt += `Responda como o paciente:`;

    return prompt;
  }

  getVagueRequestHistory(conversationHistory) {
    const vagueKeywords = ['exames', 'exame de sangue', 'laboratório', 'imagem', 'raio-x', 'ultrassom', 'tomografia', 'ressonância'];
    let hasVagueRequests = false;
    let count = 0;
    let lastVague = '';

    for (let i = conversationHistory.length - 1; i >= 0; i--) {
      const msg = conversationHistory[i];
      if (msg && msg.sender !== 'ai' && msg.message && typeof msg.message === 'string') { // Mensagem do "Médico"
        const messageText = msg.message.toLowerCase();
        const isVague = vagueKeywords.some(keyword => messageText.includes(keyword));

        if (isVague) {
          hasVagueRequests = true;
          count++;
          if (!lastVague) {
            lastVague = msg.message;
          }
        }
      }
    }
    return { hasVagueRequests, count, lastVague };
  }

  extractPatientInfo(patientScript) {
    const info = {};

    // Procurar informações de identificação no script
    const identificationSection = patientScript.find(item =>
      item.contextoOuPerguntaChave?.toLowerCase().includes('identificação')
    );

    if (identificationSection?.informacao) {
      const text = identificationSection.informacao;

      // Extrair nome
      const nameMatch = text.match(/nome[:\s]+([^,\.\n]+)/i);
      if (nameMatch) info.nome = nameMatch[1].trim();

      // Extrair idade
      const ageMatch = text.match(/(\d+)\s*anos?/i);
      if (ageMatch) info.idade = ageMatch[1] + ' anos';

      // Extrair profissão
      const professionMatch = text.match(/(?:profissão|trabalho)[:\s]+([^,\.\n]+)/i);
      if (professionMatch) info.profissao = professionMatch[1].trim();

      // Extrair estado civil
      const maritalMatch = text.match(/(?:casado|solteiro|divorciado|viúvo)/i);
      if (maritalMatch) info.estadoCivil = maritalMatch[0];
    }

    return info;
  }

  shouldReleaseMaterial(conversationHistory, userMessage, stationData, isVagueRequest = false) {
    console.log('🔍 DEBUG shouldReleaseMaterial - userMessage:', userMessage);
    console.log('🔍 DEBUG shouldReleaseMaterial - isVagueRequest:', isVagueRequest);

    // Se foi solicitação vaga na primeira vez, NÃO liberar material
    if (isVagueRequest) {
      console.log('❌ Material não liberado - solicitação vaga');
      return false;
    }

    // Analisar se o candidato solicitou algo específico que justifica liberação de material
    const userText = userMessage.toLowerCase();

    // Palavras-chave específicas que indicam solicitação de materiais
    const specificRequests = [
      'exame físico', 'sinais vitais', 'ausculta', 'palpação', 'inspeção',
      'pressão arterial', 'temperatura', 'pulso', 'respiração',
      'hemograma', 'pcr', 'vhs', 'glicemia', 'ureia', 'creatinina',
      'raio-x', 'radiografia', 'ressonância', 'tomografia', 'ultrassom',
      'colonoscopia', 'endoscopia', 'eletrocardiograma', 'ecg',
      'prescrição', 'receita', 'atestado', 'relatório'
    ];

    const hasSpecificRequest = specificRequests.some(keyword => userText.includes(keyword));
    const matchingKeywords = specificRequests.filter(keyword => userText.includes(keyword));

    console.log('🔍 DEBUG - Palavras-chave encontradas:', matchingKeywords);
    console.log('🔍 DEBUG - hasSpecificRequest:', hasSpecificRequest);

    // Verificar se há orientações específicas no roteiro do ator
    const patientScript = stationData?.materiaisDisponiveis?.informacoesVerbaisSimulado || [];
    const hasSpecialReleaseInstruction = patientScript.some(item => {
      const info = item.informacao?.toLowerCase() || '';
      return info.includes('libere') || info.includes('liberar') || info.includes('disponibilize');
    });

    console.log('🔍 DEBUG - hasSpecialReleaseInstruction:', hasSpecialReleaseInstruction);

    const result = hasSpecificRequest || hasSpecialReleaseInstruction;
    console.log('🔍 DEBUG shouldReleaseMaterial RESULTADO:', result);

    return result;
  }

  decideMaterialToRelease(stationData, conversationHistory, userMessage) {
    const userText = userMessage.toLowerCase();

    // Verificar múltiplas estruturas possíveis de materiais
    const availableMaterials = stationData?.materiaisImpressos ||
                              stationData?.materiais ||
                              stationData?.materiaisDisponiveis?.materiaisImpressos ||
                              [];

    const patientScript = stationData?.materiaisDisponiveis?.informacoesVerbaisSimulado || [];

    console.log('🔍 DEBUG - Estrutura completa stationData:', Object.keys(stationData || {}));
    console.log('🔍 DEBUG - materiaisImpressos:', stationData?.materiaisImpressos);
    console.log('🔍 DEBUG - materiais alternativo:', stationData?.materiais);
    console.log('🔍 DEBUG - materiaisDisponiveis:', stationData?.materiaisDisponiveis ? Object.keys(stationData.materiaisDisponiveis) : 'undefined');
    console.log('🔍 DEBUG - availableMaterials final:', availableMaterials);
    console.log('🔍 DEBUG - Texto do usuário para análise:', userText);

    if (availableMaterials.length === 0) {
      console.log('❌ Nenhum material disponível na estação');
      return null;
    }

    console.log('🔍 Analisando materiais disponíveis:', availableMaterials.map(m => m.tituloImpresso || m.titulo));

    // 1. VERIFICAR ORIENTAÇÕES ESPECÍFICAS NO ROTEIRO DO ATOR
    for (const scriptItem of patientScript) {
      const info = scriptItem.informacao?.toLowerCase() || '';
      if (info.includes('libere') || info.includes('liberar')) {
        // Extrair nome do material da instrução
        const materialMatch = info.match(/libere?\s+(?:o\s+)?(?:impresso\s+)?([^.]+)/i);
        if (materialMatch) {
          const materialName = materialMatch[1].trim();

          // Buscar material com nome similar
          const matchingMaterial = availableMaterials.find(material => {
            const title = (material.tituloImpresso || material.titulo || '').toLowerCase();
            return title.includes(materialName) || materialName.includes(title);
          });

          if (matchingMaterial) {
            console.log('✅ Material liberado por instrução específica:', matchingMaterial.tituloImpresso);
            return matchingMaterial.idImpresso || matchingMaterial.id;
          }
        }
      }
    }

    // 2. LIBERAÇÃO BASEADA NO NOME/CONTEÚDO DOS MATERIAIS
    for (const material of availableMaterials) {
      if (!material) continue;
      const materialTitle = (material.tituloImpresso || material.titulo || '').toLowerCase();
      const materialContent = (material.conteudo || material.conteudoImpresso || '').toLowerCase();

      // Verificar correspondência direta com nome do material
      const titleWords = materialTitle.split(' ').filter(word => word.length > 2);
      const contentKeywords = this.extractKeywordsFromContent(materialContent);

      // Combinar palavras do título + palavras-chave do conteúdo
      const allKeywords = [...titleWords, ...contentKeywords];

      // Verificar se candidato mencionou alguma palavra-chave relevante
      const hasMatch = allKeywords.some(keyword => {
        if (keyword.length < 3) return false; // Ignorar palavras muito curtas
        return userText.includes(keyword);
      });

      if (hasMatch) {
        console.log(`✅ Material "${materialTitle}" liberado por correspondência:`, {
          keywords: allKeywords.filter(k => userText.includes(k)),
          userText: userText.substring(0, 100)
        });
        return material.idImpresso || material.id;
      }
    }

    // 3. CORRESPONDÊNCIA SEMÂNTICA INTELIGENTE
    const semanticMatches = {
      'exame físico': ['físico', 'exame físico', 'semiologia', 'propedêutica'],
      'sinais vitais': ['vitais', 'pressão', 'temperatura', 'pulso', 'respiração', 'pa', 'fc', 'fr'],
      'laboratório': ['hemograma', 'sangue', 'urina', 'fezes', 'pcr', 'vhs', 'glicemia'],
      'radiografia': ['raio-x', 'raio x', 'rx', 'radiografia', 'tórax'],
      'prescrição': ['receita', 'medicamento', 'remédio', 'prescrição'],
      'atestado': ['atestado', 'licença', 'afastamento']
    };

    for (const [category, keywords] of Object.entries(semanticMatches)) {
      const hasSemanticMatch = keywords.some(keyword => userText.includes(keyword));

      if (hasSemanticMatch) {
        // Buscar material que se relaciona com esta categoria
        const matchingMaterial = availableMaterials.find(material => {
          const title = (material.tituloImpresso || material.titulo || '').toLowerCase();
          const content = (material.conteudo || material.conteudoImpresso || '').toLowerCase();

          return keywords.some(keyword =>
            title.includes(keyword) || content.includes(keyword) || title.includes(category)
          );
        });

        if (matchingMaterial) {
          console.log(`✅ Material liberado por correspondência semântica "${category}":`, matchingMaterial.tituloImpresso);
          return matchingMaterial.idImpresso || matchingMaterial.id;
        }
      }
    }

    return null;
  }

  extractKeywordsFromContent(content) {
    if (!content) return [];

    // Extrair palavras-chave relevantes do conteúdo
    const medicalKeywords = [
      'pressão arterial', 'temperatura', 'pulso', 'respiração', 'saturação',
      'ausculta', 'palpação', 'inspeção', 'percussão',
      'hemograma', 'glicemia', 'ureia', 'creatinina', 'pcr', 'vhs',
      'radiografia', 'tomografia', 'ressonância', 'ultrassom',
      'eletrocardiograma', 'ecg', 'ecocardiograma'
    ];

    return medicalKeywords.filter(keyword => content.includes(keyword));
  }

  getVagueRequestHistory(conversationHistory) {
    const vagueKeywords = [
      'exames', 'exame de sangue', 'laboratório', 'exames complementares',
      'exames laboratoriais', 'exame de imagem', 'procedimentos'
    ];

    let vagueCount = 0;
    let lastVagueRequest = '';

    conversationHistory.forEach(msg => {
      if (msg.sender !== 'ai' && msg.message) {
        const text = msg.message.toLowerCase();
        const hasVague = vagueKeywords.some(keyword => text.includes(keyword));

        if (hasVague) {
          vagueCount++;
          lastVagueRequest = msg.message;
        }
      }
    });

    return {
      hasVagueRequests: vagueCount > 0,
      count: vagueCount,
      lastVague: lastVagueRequest
    };
  }

  isOffScript(userMessage, stationData) {
    const userText = userMessage.toLowerCase();
    const patientScript = stationData?.materiaisDisponiveis?.informacoesVerbaisSimulado || [];
    const pepData = stationData?.padraoEsperadoProcedimento || null;

    // Coletar todos os tópicos relevantes do roteiro do ator
    const scriptTopics = new Set();
    patientScript.forEach(item => {
      if (item.contextoOuPerguntaChave) {
        scriptTopics.add(item.contextoOuPerguntaChave.toLowerCase());
      }
      if (item.informacao) {
        // Extrair palavras-chave médicas relevantes
        const medicalKeywords = item.informacao.toLowerCase().match(/\b[a-záàâãéêíóôõúç]{4,}\b/g) || [];
        medicalKeywords.forEach(keyword => scriptTopics.add(keyword));
      }
    });

    // Coletar tópicos dos itens do PEP (checklist)
    if (pepData && pepData.itensAvaliacao) {
      pepData.itensAvaliacao.forEach(item => {
        if (item.descricaoItem) {
          const pepKeywords = item.descricaoItem.toLowerCase().match(/\b[a-záàâãéêíóôõúç]{4,}\b/g) || [];
          pepKeywords.forEach(keyword => scriptTopics.add(keyword));
        }
      });
    }

    // Verificar se a pergunta tem relação com algum tópico do script/PEP
    const scriptTopicsArray = Array.from(scriptTopics);
    const hasRelation = scriptTopicsArray.some(topic => {
      return userText.includes(topic) || topic.includes(userText.replace(/[^a-záàâãéêíóôõúç\s]/g, '').trim().split(' ')[0]);
    });

    // Se não tem relação com script/PEP e não é pergunta médica básica, é fora do script
    const basicMedicalTerms = ['dor', 'sintoma', 'quando', 'como', 'onde', 'medicamento', 'tratamento', 'exame', 'problema', 'queixa'];
    const isBasicMedical = basicMedicalTerms.some(term => userText.includes(term));

    return !hasRelation && !isBasicMedical;
  }

  shouldGiveVagueResponse(userMessage, conversationHistory, stationData) {
    const vagueHistory = this.getVagueRequestHistory(conversationHistory);
    const userText = userMessage.toLowerCase();

    console.log('🔍 DEBUG shouldGiveVagueResponse - userText:', userText);

    // Primeiro verificar se tem especificidade suficiente
    const specificTerms = [
      'hemograma', 'pcr', 'vhs', 'glicemia', 'ureia', 'creatinina',
      'radiografia', 'tomografia', 'ressonância', 'ultrassom',
      'exame físico', 'sinais vitais', 'ausculta', 'palpação', 'inspeção',
      'eletrocardiograma', 'ecg', 'ecocardiograma',
      'coluna lombar', 'coluna cervical', 'tórax', 'abdomen'
    ];

    const hasSpecificTerms = specificTerms.some(term => userText.includes(term));

    console.log('🔍 DEBUG - hasSpecificTerms:', hasSpecificTerms);

    // Se já tem termos específicos, NÃO é vago
    if (hasSpecificTerms) {
      console.log('✅ Solicitação específica detectada - não é vaga');
      return { isVague: false };
    }

    // Detectar apenas solicitações realmente vagas
    const vaguePatterns = [
      /^(solicito?\s+)?exames?\s*$/i,                    // "solicito exames" sem especificar
      /^(quero\s+fazer\s+)?exames?\s*$/i,                // "quero fazer exames" sem especificar
      /^laboratório\s*$/i,                               // só "laboratório" sem especificar
      /^procedimentos?\s*$/i,                            // só "procedimentos" sem especificar
      /^(solicito?\s+)?exames?\s+(complementares?|de\s+rotina)\s*$/i  // "exames complementares" genérico
    ];

    const isVagueRequest = vaguePatterns.some(pattern => pattern.test(userText));

    console.log('🔍 DEBUG - isVagueRequest:', isVagueRequest);

    if (!isVagueRequest) return { isVague: false };

    // Se é primeira vez com solicitação vaga
    if (vagueHistory.count === 0) {
      return {
        isVague: true,
        shouldAccept: false,
        response: "Seja mais específico, doutor. Quais exames exatamente?"
      };
    }

    // Se já fez solicitação vaga antes, aceitar na segunda vez
    return {
      isVague: true,
      shouldAccept: true,
      response: "Certo, doutor."
    };
  }

  async analyzeSemanticPrompt(prompt) {
    const keyData = this.getActiveKey();
    try {
      const genAI = new GoogleGenerativeAI(keyData.key);
      const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash-exp"
      });

      console.log(`🧠 Enviando análise semântica para Gemini 2.5 Flash (chave ${keyData.index})`);

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      keyData.quotaUsed++;
      keyData.lastUsed = new Date();

      console.log(`✅ Análise semântica concluída: ${text.trim()}`);

      return {
        message: text,
        keyUsed: keyData.index,
        quotaRemaining: keyData.maxQuota - keyData.quotaUsed
      };

    } catch (error) {
      console.error(`❌ Erro na análise semântica com chave ${keyData.index}:`, error.message);
      keyData.errors++;

      // Tentar próxima chave se disponível
      if (keyData.errors >= 3) {
        keyData.isActive = false;
        console.log(`🚫 Chave ${keyData.index} desativada após múltiplos erros`);
      }

      // Retry com próxima chave
      const nextKey = this.getActiveKey();
      if (nextKey && nextKey.index !== keyData.index) {
        return this.analyzeSemanticPrompt(prompt);
      }

      throw error;
    }
  }
}

// Instância global do manager
const aiChatManager = new AIChatManager();

// Endpoint principal para chat AI
router.post('/chat', async (req, res) => {
  try {
    const { message, stationData, conversationHistory = [] } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Mensagem é obrigatória' });
    }

    console.log(`💬 Nova mensagem AI: "${message}" (histórico: ${conversationHistory.length} msgs)`);

    const aiResponse = await aiChatManager.generateAIResponse(
      message,
      stationData,
      conversationHistory
    );

    res.json(aiResponse);

  } catch (error) {
    console.error('❌ Erro no chat AI:', error);

    res.status(500).json({
      error: 'Erro interno do servidor',
      message: 'Desculpe, não consegui processar sua mensagem. Tente novamente.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Endpoint para avaliar PEP automaticamente
router.post('/evaluate-pep', async (req, res) => {
  try {
    const { stationData, conversationHistory, checklistData } = req.body;

    const prompt = `Analise esta conversa médica e avalie cada item do checklist:

CONVERSA:
${conversationHistory.map(msg => `${msg.sender === 'ai' ? 'Paciente' : 'Médico'}: ${msg.message}`).join('\n')}

CHECKLIST PARA AVALIAR:
${checklistData?.itensAvaliacao?.map(item => `- ${item.descricao}`).join('\n') || 'Nenhum item disponível'}

Para cada item, responda apenas "SIM" ou "NÃO" se foi adequadamente realizado pelo médico.
Formato: Item 1: SIM/NÃO, Item 2: SIM/NÃO, etc.`;

    const aiResponse = await aiChatManager.generateAIResponse(prompt, stationData, []);

    res.json({
      evaluation: aiResponse.message,
      success: true
    });

  } catch (error) {
    console.error('❌ Erro na avaliação PEP:', error);
    res.status(500).json({ error: 'Erro ao avaliar PEP' });
  }
});

// Endpoint para análise semântica inteligente
router.post('/analyze', async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt é obrigatório' });
    }

    console.log('🧠 Análise semântica solicitada');

    const response = await aiChatManager.analyzeSemanticPrompt(prompt);
    res.json(response);

  } catch (error) {
    console.error('❌ Erro na análise semântica:', error);
    res.status(500).json({
      error: 'Erro interno no servidor',
      details: error.message
    });
  }
});

// Endpoint para status das chaves API
router.get('/status', (req, res) => {
  const status = aiChatManager.apiKeys.map(key => ({
    index: key.index,
    quotaUsed: key.quotaUsed,
    maxQuota: key.maxQuota,
    isActive: key.isActive,
    errors: key.errors,
    lastUsed: key.lastUsed
  }));

  res.json({
    keys: status,
    totalKeys: aiChatManager.apiKeys.length,
    currentKey: aiChatManager.currentKeyIndex + 1
  });
});

module.exports = router;