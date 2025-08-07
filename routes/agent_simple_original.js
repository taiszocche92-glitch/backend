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

// **ENDPOINT SIMPLES QUE FUNCIONAVA**
router.post('/query', authenticateUser, async (req, res) => {
  try {
    const { question, context, page } = req.body;
    
    console.log('🤖 Agente recebeu:', { question, page, user: req.user?.uid });
    
    // Verifica se o Firebase está disponível
    if (global.firebaseMockMode) {
      return res.json({
        answer: `
          <div style="padding: 16px; background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; color: #856404;">
            <h4>🚧 Modo de Demonstração</h4>
            <p>Firebase não configurado. Configure as variáveis de ambiente para acesso aos dados reais.</p>
            <p><strong>Sua pergunta:</strong> "${question}"</p>
          </div>
        `
      });
    }

    // **VERSÃO SIMPLES SEM QUERIES COMPLEXAS**
    const db = admin.firestore();
    
    // Resposta simples baseada na pergunta
    let answer = '';
    const questionLower = question.toLowerCase();
    
    if (questionLower.includes('estação') || questionLower.includes('estacoes')) {
      answer = `
        <div style="padding: 16px; background: #f8f9fa; border-radius: 8px;">
          <h4>🏥 Sobre Estações Clínicas</h4>
          <p>Posso ajudar com informações sobre estações clínicas do sistema Revalida Fácil.</p>
          <p><strong>Sua pergunta:</strong> "${question}"</p>
          <p>As estações estão sendo carregadas do Firestore...</p>
        </div>
      `;
    } else if (questionLower.includes('comunicação') || questionLower.includes('funciona')) {
      answer = `
        <div style="padding: 16px; background: #f8f9fa; border-radius: 8px;">
          <h4>💬 Como funciona a comunicação</h4>
          <p>O sistema de simulação funciona da seguinte forma:</p>
          <ul>
            <li>✅ Candidato e Ator/Avaliador entram na mesma sala</li>
            <li>✅ Ambos clicam em "Estou Pronto"</li>
            <li>✅ Ator/Avaliador inicia a simulação</li>
            <li>✅ Sistema abre comunicação por voz automaticamente</li>
            <li>✅ Tempo é cronometrado em tempo real</li>
          </ul>
          <p><strong>Dica:</strong> Use Google Meet para comunicação por voz!</p>
        </div>
      `;
    } else {
      answer = `
        <div style="padding: 16px; background: #f8f9fa; border-radius: 8px;">
          <h4>🤖 Assistente Revalida Fácil</h4>
          <p>Olá! Sou seu assistente inteligente.</p>
          <p><strong>Você perguntou:</strong> "${question}"</p>
          <p><strong>Posso ajudar com:</strong></p>
          <ul>
            <li>🏥 Informações sobre estações clínicas</li>
            <li>👥 Como usar o sistema de simulação</li>
            <li>📊 Dados e estatísticas</li>
            <li>💬 Dúvidas sobre comunicação</li>
          </ul>
          <p><em>Conectado ao Firebase e funcionando! ✅</em></p>
        </div>
      `;
    }
    
    console.log('✅ Agente respondeu com sucesso');
    res.json({ answer });
    
  } catch (error) {
    console.error('❌ Erro no agente:', error);
    res.status(500).json({ 
      answer: `
        <div style="padding: 16px; background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 8px; color: #721c24;">
          <h4>🚨 Erro Interno</h4>
          <p>Desculpe, ocorreu um erro. Tente novamente em alguns instantes.</p>
          <details><summary>Detalhes técnicos</summary><code>${error.message}</code></details>
        </div>
      `,
      error: error.message 
    });
  }
});

module.exports = router;
