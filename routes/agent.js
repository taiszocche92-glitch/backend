const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

// Middleware de autenticação (você pode adaptar conforme sua implementação)
const authenticateUser = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Token não fornecido' });
    }
    
    // Verifica o token (adapte conforme sua implementação)
    // const decodedToken = await admin.auth().verifyIdToken(token);
    // req.user = decodedToken;
    
    // Por enquanto, permite acesso (remova em produção)
    req.user = { uid: 'test-user' };
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido' });
  }
};

// Endpoint principal do agente
router.post('/query', authenticateUser, async (req, res) => {
  try {
    const { question, context } = req.body;
    
    console.log('🤖 Agente recebeu pergunta:', question);
    
    // Verifica se o Firebase está disponível
    if (global.firebaseMockMode) {
      console.log('⚠️  Modo mock ativo - Firebase não configurado');
      return res.json({
        answer: `
          <h4>🚧 Modo de Demonstração</h4>
          <p>O Firebase não está configurado. Configure as variáveis de ambiente:</p>
          <ul>
            <li>FIREBASE_PROJECT_ID</li>
            <li>FIREBASE_PRIVATE_KEY</li>
            <li>FIREBASE_CLIENT_EMAIL</li>
          </ul>
          <p>Sua pergunta foi: "<em>${question}</em>"</p>
        `
      });
    }
    
    const db = admin.firestore();
    
    // Análise da pergunta e roteamento para funções específicas
    const response = await processAgentQuery(question, context, db);
    
    res.json(response);
  } catch (error) {
    console.error('❌ Erro no agente:', error);
    res.status(500).json({ 
      answer: 'Desculpe, ocorreu um erro interno. Tente novamente.',
      error: error.message 
    });
  }
});

// Função principal de processamento
async function processAgentQuery(question, context, db) {
  const questionLower = question.toLowerCase();
  
  // Palavras-chave para diferentes tipos de consulta
  if (questionLower.includes('estação') || questionLower.includes('estacoes') || questionLower.includes('clinica')) {
    return await handleStationsQuery(questionLower, db);
  }
  
  if (questionLower.includes('usuário') || questionLower.includes('usuario') || questionLower.includes('candidato')) {
    return await handleUsersQuery(questionLower, db);
  }
  
  if (questionLower.includes('avaliação') || questionLower.includes('avaliacao') || questionLower.includes('nota')) {
    return await handleEvaluationsQuery(questionLower, db);
  }
  
  if (questionLower.includes('estatística') || questionLower.includes('estatisticas') || questionLower.includes('relatório') || questionLower.includes('relatorio')) {
    return await handleStatsQuery(questionLower, db);
  }
  
  if (questionLower.includes('arquivo') || questionLower.includes('imagem') || questionLower.includes('storage') || questionLower.includes('upload')) {
    return await handleStorageQuery(questionLower, db);
  }
  
  if (questionLower.includes('ajuda') || questionLower.includes('help') || questionLower.includes('comandos')) {
    return {
      answer: `
        <h4>Comandos disponíveis:</h4>
        <ul>
          <li><strong>Estações:</strong> "listar estações", "buscar estação de cardiologia"</li>
          <li><strong>Usuários:</strong> "usuários ativos", "buscar candidato João"</li>
          <li><strong>Avaliações:</strong> "últimas avaliações", "média de notas"</li>
          <li><strong>Estatísticas:</strong> "relatório geral", "estatísticas do mês"</li>
          <li><strong>Storage:</strong> "listar arquivos", "buscar imagens", "arquivos recentes"</li>
        </ul>
        <p>Exemplo: "Listar as últimas 5 estações clínicas"</p>
      `
    };
  }
  
  // Resposta padrão para perguntas não reconhecidas
  return {
    answer: `
      Não consegui entender sua pergunta. Posso ajudar com:
      <ul>
        <li>📋 Estações clínicas</li>
        <li>👥 Usuários e candidatos</li>
        <li>📊 Avaliações e notas</li>
        <li>📈 Estatísticas e relatórios</li>
        <li>📁 Arquivos e Storage</li>
      </ul>
      Digite "ajuda" para ver exemplos de comandos.
    `
  };
}

// Manipuladores específicos para cada tipo de consulta
async function handleStationsQuery(question, db) {
  try {
    let query = db.collection('estacoes_clinicas');
    
    // Limita resultado para performance
    if (question.includes('listar') || question.includes('todas')) {
      query = query.limit(10);
    }
    
    const snapshot = await query.get();
    const stations = [];
    
    snapshot.forEach(doc => {
      const data = doc.data();
      stations.push({
        id: doc.id,
        titulo: data.tituloEstacao,
        especialidade: data.especialidade,
        dificuldade: data.dificuldade,
        criado: data.dataCriacao
      });
    });
    
    if (stations.length === 0) {
      return { answer: 'Nenhuma estação clínica encontrada.' };
    }
    
    let answer = `<h4>📋 Estações Clínicas (${stations.length} encontradas):</h4><ul>`;
    stations.forEach(station => {
      answer += `<li><strong>${station.titulo}</strong> - ${station.especialidade} (${station.dificuldade})</li>`;
    });
    answer += '</ul>';
    
    return {
      answer,
      data: stations
    };
  } catch (error) {
    console.error('Erro ao buscar estações:', error);
    return { answer: 'Erro ao buscar estações clínicas.' };
  }
}

async function handleUsersQuery(question, db) {
  try {
    let query = db.collection('usuarios').limit(10);
    
    const snapshot = await query.get();
    const users = [];
    
    snapshot.forEach(doc => {
      const data = doc.data();
      users.push({
        id: doc.id,
        name: data.name,
        email: data.email,
        role: data.role || 'candidato',
        lastLogin: data.lastLoginAt
      });
    });
    
    if (users.length === 0) {
      return { answer: 'Nenhum usuário encontrado.' };
    }
    
    let answer = `<h4>👥 Usuários (${users.length} encontrados):</h4><ul>`;
    users.forEach(user => {
      answer += `<li><strong>${user.name}</strong> (${user.email}) - ${user.role}</li>`;
    });
    answer += '</ul>';
    
    return {
      answer,
      data: users
    };
  } catch (error) {
    console.error('Erro ao buscar usuários:', error);
    return { answer: 'Erro ao buscar usuários.' };
  }
}

async function handleEvaluationsQuery(question, db) {
  try {
    let query = db.collection('avaliacoes')
      .orderBy('dataAvaliacao', 'desc')
      .limit(10);
    
    const snapshot = await query.get();
    const evaluations = [];
    
    snapshot.forEach(doc => {
      const data = doc.data();
      evaluations.push({
        id: doc.id,
        candidato: data.candidatoNome,
        estacao: data.estacaoTitulo,
        nota: data.notaFinal,
        data: data.dataAvaliacao
      });
    });
    
    if (evaluations.length === 0) {
      return { answer: 'Nenhuma avaliação encontrada.' };
    }
    
    const mediaNotas = evaluations.reduce((sum, eval) => sum + (eval.nota || 0), 0) / evaluations.length;
    
    let answer = `<h4>📊 Últimas Avaliações (${evaluations.length}):</h4>`;
    answer += `<p><strong>Média geral:</strong> ${mediaNotas.toFixed(2)}</p><ul>`;
    
    evaluations.forEach(eval => {
      answer += `<li><strong>${eval.candidato}</strong> - ${eval.estacao}: ${eval.nota ? eval.nota.toFixed(2) : 'N/A'}</li>`;
    });
    answer += '</ul>';
    
    return {
      answer,
      data: { evaluations, media: mediaNotas }
    };
  } catch (error) {
    console.error('Erro ao buscar avaliações:', error);
    return { answer: 'Erro ao buscar avaliações.' };
  }
}

async function handleStatsQuery(question, db) {
  try {
    // Busca estatísticas gerais
    const [stationsSnap, usersSnap, evaluationsSnap] = await Promise.all([
      db.collection('estacoes_clinicas').get(),
      db.collection('usuarios').get(),
      db.collection('avaliacoes').get()
    ]);
    
    const stats = {
      totalEstacoes: stationsSnap.size,
      totalUsuarios: usersSnap.size,
      totalAvaliacoes: evaluationsSnap.size
    };
    
    // Calcula média de notas se houver avaliações
    let mediaGeral = 0;
    if (evaluationsSnap.size > 0) {
      let somaNotas = 0;
      let countNotas = 0;
      
      evaluationsSnap.forEach(doc => {
        const nota = doc.data().notaFinal;
        if (nota && typeof nota === 'number') {
          somaNotas += nota;
          countNotas++;
        }
      });
      
      mediaGeral = countNotas > 0 ? somaNotas / countNotas : 0;
    }
    
    const answer = `
      <h4>📈 Estatísticas Gerais do Sistema:</h4>
      <ul>
        <li><strong>Estações Clínicas:</strong> ${stats.totalEstacoes}</li>
        <li><strong>Usuários Cadastrados:</strong> ${stats.totalUsuarios}</li>
        <li><strong>Avaliações Realizadas:</strong> ${stats.totalAvaliacoes}</li>
        <li><strong>Média Geral de Notas:</strong> ${mediaGeral.toFixed(2)}</li>
      </ul>
    `;
    
    return {
      answer,
      data: { ...stats, mediaGeral }
    };
  } catch (error) {
    console.error('Erro ao buscar estatísticas:', error);
    return { answer: 'Erro ao buscar estatísticas.' };
  }
}

async function handleStorageQuery(question, db) {
  try {
    const bucket = admin.storage().bucket();
    
    console.log('🗄️ Consultando Firebase Storage...');
    
    // Lista arquivos no Storage
    const [files] = await bucket.getFiles({
      maxResults: question.includes('todos') ? 100 : 20
    });
    
    if (files.length === 0) {
      return { 
        answer: '📁 Nenhum arquivo encontrado no Storage.',
        data: { totalFiles: 0 }
      };
    }
    
    // Processa informações dos arquivos
    const fileInfos = await Promise.all(
      files.slice(0, 15).map(async (file) => {
        try {
          const [metadata] = await file.getMetadata();
          const [exists] = await file.exists();
          
          return {
            name: file.name,
            size: metadata.size ? parseInt(metadata.size) : 0,
            contentType: metadata.contentType || 'unknown',
            created: metadata.timeCreated,
            updated: metadata.updated,
            exists: exists,
            bucket: metadata.bucket
          };
        } catch (error) {
          console.warn(`Erro ao obter metadata do arquivo ${file.name}:`, error.message);
          return {
            name: file.name,
            size: 0,
            contentType: 'unknown',
            created: 'unknown',
            updated: 'unknown',
            exists: false,
            error: error.message
          };
        }
      })
    );
    
    // Filtra arquivos válidos
    const validFiles = fileInfos.filter(file => file.exists);
    
    // Estatísticas do Storage
    const totalSize = validFiles.reduce((sum, file) => sum + (file.size || 0), 0);
    const sizeInMB = (totalSize / 1024 / 1024).toFixed(2);
    
    // Tipos de arquivo mais comuns
    const fileTypes = {};
    validFiles.forEach(file => {
      const type = file.contentType?.split('/')[0] || 'unknown';
      fileTypes[type] = (fileTypes[type] || 0) + 1;
    });
    
    // Gera resposta formatada
    let answer = `<h4>📁 Firebase Storage (${validFiles.length} arquivos):</h4>`;
    answer += `<p><strong>Tamanho total:</strong> ${sizeInMB} MB</p>`;
    
    // Lista tipos de arquivo
    if (Object.keys(fileTypes).length > 0) {
      answer += `<p><strong>Tipos de arquivo:</strong></p><ul>`;
      Object.entries(fileTypes).forEach(([type, count]) => {
        const icon = getFileTypeIcon(type);
        answer += `<li>${icon} ${type}: ${count} arquivo(s)</li>`;
      });
      answer += '</ul>';
    }
    
    // Lista alguns arquivos recentes
    if (question.includes('listar') || question.includes('arquivos')) {
      answer += `<p><strong>Arquivos recentes:</strong></p><ul>`;
      validFiles.slice(0, 10).forEach(file => {
        const sizeKB = file.size ? (file.size / 1024).toFixed(1) : '0';
        const icon = getFileTypeIcon(file.contentType?.split('/')[0]);
        answer += `<li>${icon} <strong>${file.name}</strong> (${sizeKB} KB)</li>`;
      });
      answer += '</ul>';
    }
    
    // Busca específica por imagens
    if (question.includes('imagem') || question.includes('foto')) {
      const images = validFiles.filter(file => 
        file.contentType?.startsWith('image/') || 
        file.name.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)
      );
      
      if (images.length > 0) {
        answer += `<p><strong>🖼️ Imagens encontradas (${images.length}):</strong></p><ul>`;
        images.slice(0, 8).forEach(image => {
          const sizeKB = image.size ? (image.size / 1024).toFixed(1) : '0';
          answer += `<li>🖼️ <strong>${image.name}</strong> (${sizeKB} KB)</li>`;
        });
        answer += '</ul>';
      }
    }
    
    return {
      answer,
      data: {
        totalFiles: validFiles.length,
        totalSizeMB: parseFloat(sizeInMB),
        fileTypes: fileTypes,
        files: validFiles.slice(0, 10), // Primeiros 10 para análise
        bucket: files[0]?.bucket?.name || 'unknown'
      }
    };
    
  } catch (error) {
    console.error('Erro ao consultar Storage:', error);
    
    let errorMessage = 'Erro ao acessar Firebase Storage.';
    
    if (error.code === 'storage/bucket-not-found') {
      errorMessage = '🪣 Bucket do Storage não encontrado. Verifique a configuração.';
    } else if (error.code === 'storage/unauthorized') {
      errorMessage = '🔐 Sem permissão para acessar o Storage. Verifique as credenciais.';
    } else if (error.message.includes('bucket')) {
      errorMessage = '⚙️ Erro de configuração do Storage bucket.';
    }
    
    return { 
      answer: errorMessage,
      data: { error: error.message, code: error.code }
    };
  }
}

// Função auxiliar para ícones de tipos de arquivo
function getFileTypeIcon(fileType) {
  const icons = {
    'image': '🖼️',
    'video': '🎥',
    'audio': '🎵',
    'text': '📝',
    'application': '📋',
    'pdf': '📄',
    'json': '📊',
    'unknown': '📄'
  };
  
  return icons[fileType] || icons['unknown'];
}

module.exports = router;
