/**
 * Serviço para integração com Google Vertex AI - MedGemma
 * Responsável por inicializar o cliente e fornecer métodos para análise de imagens médicas
 */

const { VertexAI } = require('@google-cloud/aiplatform');

// Configurações do Vertex AI
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

// Cache para instância do cliente (singleton pattern)
let vertexAIClient = null;

/**
 * Inicializa e retorna o cliente Vertex AI
 * @returns {VertexAI} Instância do cliente Vertex AI
 */
function getVertexAIClient() {
  if (!vertexAIClient) {
    try {
      // Verificar se as credenciais estão disponíveis
      if (!PROJECT_ID) {
        throw new Error('GOOGLE_CLOUD_PROJECT_ID ou FIREBASE_PROJECT_ID não configurado');
      }

      // Inicializar cliente Vertex AI
      vertexAIClient = new VertexAI({
        project: PROJECT_ID,
        location: LOCATION,
      });

      console.log(`✅ Cliente Vertex AI inicializado para projeto: ${PROJECT_ID}, localização: ${LOCATION}`);
    } catch (error) {
      console.error('❌ Erro ao inicializar cliente Vertex AI:', error.message);
      throw error;
    }
  }

  return vertexAIClient;
}

/**
 * Testa a conectividade com o MedGemma fazendo uma chamada simples
 * @returns {Promise<Object>} Resultado do teste
 */
async function testMedGemmaConnection() {
  try {
    const vertexAI = getVertexAIClient();

    // Inicializar o modelo MedGemma
    // Nota: MedGemma é um modelo multimodal, então usamos o GenerativeModel
    const model = vertexAI.getGenerativeModel({
      model: 'med-gemma', // ou o nome exato do modelo MedGemma no Vertex AI
    });

    // Fazer uma chamada de teste simples (sem imagem, apenas texto)
    const testPrompt = {
      text: "Olá MedGemma, você está funcionando? Responda apenas 'Sim' se estiver operacional."
    };

    const result = await model.generateContent(testPrompt);
    const response = result.response;

    return {
      success: true,
      message: 'Conexão com MedGemma estabelecida com sucesso',
      response: response.text(),
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('❌ Erro no teste de conectividade com MedGemma:', error.message);
    return {
      success: false,
      message: 'Falha na conexão com MedGemma',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Analisa uma imagem médica usando MedGemma
 * @param {string} imageBase64 - Imagem em base64
 * @param {string} prompt - Prompt para análise
 * @returns {Promise<Object>} Resultado da análise
 */
async function analyzeMedicalImage(imageBase64, prompt = "Analise esta imagem médica e forneça um diagnóstico preliminar.") {
  try {
    const vertexAI = getVertexAIClient();

    // Inicializar o modelo MedGemma
    const model = vertexAI.getGenerativeModel({
      model: 'med-gemma',
    });

    // Preparar o conteúdo multimodal (texto + imagem)
    const request = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: 'image/jpeg', // ou detectar dinamicamente
                data: imageBase64
              }
            }
          ]
        }
      ]
    };

    const result = await model.generateContent(request);
    const response = result.response;

    return {
      success: true,
      analysis: response.text(),
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('❌ Erro na análise de imagem médica:', error.message);
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Lista os modelos disponíveis no Vertex AI (para debug)
 * @returns {Promise<Array>} Lista de modelos
 */
async function listAvailableModels() {
  try {
    const vertexAI = getVertexAIClient();

    // Esta é uma simplificação - na prática, você pode precisar usar a API de listagem
    const models = [
      'med-gemma',
      'gemini-pro',
      'gemini-pro-vision'
    ];

    return {
      success: true,
      models: models,
      project: PROJECT_ID,
      location: LOCATION
    };

  } catch (error) {
    console.error('❌ Erro ao listar modelos:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  getVertexAIClient,
  testMedGemmaConnection,
  analyzeMedicalImage,
  listAvailableModels
};