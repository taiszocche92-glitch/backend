/**
 * Endpoint para reset de estatísticas dos usuários
 * Adicione estas rotas ao seu server.js do backend
 */

// Middleware de autenticação admin (você deve implementar)
const requireAdminAuth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  // Verificar se é um token válido de admin
  if (!token || token !== process.env.ADMIN_SECRET_TOKEN) {
    return res.status(403).json({ error: 'Acesso negado' });
  }
  
  next();
};

// Route para reset completo
app.post('/api/admin/reset-all-user-stats', requireAdminAuth, async (req, res) => {
  try {
    console.log('🚀 Iniciando reset completo de usuários...');
    
    // Reset na base de dados do backend
    const result = await db.query(`
      UPDATE usuarios SET 
        status = 'offline',
        total_estacoes_feitas = 0,
        media_geral = 0,
        melhor_nota = 0,
        pior_nota = 0,
        tempo_total_treinamento = 0,
        pontos_experiencia = 0,
        nivel_atual = 'Iniciante',
        ultima_atividade = NULL,
        conquistas = '[]',
        historico_simulacoes = '[]',
        estatisticas_por_especialidade = '{}',
        progresso_semanal = '[]',
        metas_semana = '{"estacoesPlanejadas": 0, "estacoesRealizadas": 0, "progresso": 0}',
        data_ultima_atualizacao = NOW()
      WHERE 1=1
    `);
    
    const affectedRows = result.affectedRows || result.rowCount;
    
    console.log(`✅ Reset completo finalizado: ${affectedRows} usuários resetados`);
    
    res.json({
      success: true,
      message: 'Reset completo executado com sucesso',
      usersAffected: affectedRows,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Erro no reset completo:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno no reset',
      details: error.message
    });
  }
});

// Route para reset seletivo
app.post('/api/admin/reset-selective-user-stats', requireAdminAuth, async (req, res) => {
  try {
    const {
      resetStatus = false,
      resetEstacoes = false,
      resetNotas = false,
      resetTempo = false,
      resetConquistas = false
    } = req.body;
    
    console.log('🎯 Iniciando reset seletivo...');
    
    const updateFields = [];
    
    if (resetStatus) {
      updateFields.push("status = 'offline'");
    }
    
    if (resetEstacoes) {
      updateFields.push(
        "total_estacoes_feitas = 0",
        "estatisticas_por_especialidade = '{}'"
      );
    }
    
    if (resetNotas) {
      updateFields.push(
        "media_geral = 0",
        "melhor_nota = 0",
        "pior_nota = 0"
      );
    }
    
    if (resetTempo) {
      updateFields.push("tempo_total_treinamento = 0");
    }
    
    if (resetConquistas) {
      updateFields.push(
        "pontos_experiencia = 0",
        "conquistas = '[]'",
        "nivel_atual = 'Iniciante'"
      );
    }
    
    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Nenhuma opção de reset selecionada'
      });
    }
    
    updateFields.push("data_ultima_atualizacao = NOW()");
    
    const query = `UPDATE usuarios SET ${updateFields.join(', ')} WHERE 1=1`;
    const result = await db.query(query);
    
    const affectedRows = result.affectedRows || result.rowCount;
    
    console.log(`✅ Reset seletivo finalizado: ${affectedRows} usuários atualizados`);
    
    res.json({
      success: true,
      message: 'Reset seletivo executado com sucesso',
      usersAffected: affectedRows,
      resetOptions: { resetStatus, resetEstacoes, resetNotas, resetTempo, resetConquistas },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Erro no reset seletivo:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno no reset seletivo',
      details: error.message
    });
  }
});

// Route para obter estatísticas antes do reset
app.get('/api/admin/user-stats-summary', requireAdminAuth, async (req, res) => {
  try {
    const stats = await db.query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN status = 'online' THEN 1 END) as online_users,
        SUM(total_estacoes_feitas) as total_estacoes,
        AVG(CASE WHEN media_geral > 0 THEN media_geral END) as average_score,
        MAX(melhor_nota) as highest_score,
        MIN(CASE WHEN pior_nota > 0 THEN pior_nota END) as lowest_score,
        SUM(tempo_total_treinamento) as total_training_time
      FROM usuarios
    `);
    
    res.json({
      success: true,
      statistics: stats[0] || stats.rows[0], // Compatibilidade MySQL/PostgreSQL
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Erro ao obter estatísticas:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao obter estatísticas',
      details: error.message
    });
  }
});

// Route para backup antes do reset
app.post('/api/admin/backup-user-stats', requireAdminAuth, async (req, res) => {
  try {
    console.log('💾 Criando backup das estatísticas...');
    
    const backupTableName = `usuario_stats_backup_${Date.now()}`;
    
    // Criar tabela de backup
    await db.query(`
      CREATE TABLE ${backupTableName} AS 
      SELECT 
        uid,
        email,
        nome,
        sobrenome,
        status,
        total_estacoes_feitas,
        media_geral,
        melhor_nota,
        pior_nota,
        tempo_total_treinamento,
        pontos_experiencia,
        nivel_atual,
        conquistas,
        historico_simulacoes,
        estatisticas_por_especialidade,
        data_ultima_atualizacao,
        NOW() as backup_timestamp
      FROM usuarios
    `);
    
    const countResult = await db.query(`SELECT COUNT(*) as count FROM ${backupTableName}`);
    const backupCount = countResult[0]?.count || countResult.rows[0]?.count;
    
    console.log(`✅ Backup criado: ${backupTableName} com ${backupCount} registros`);
    
    res.json({
      success: true,
      message: 'Backup criado com sucesso',
      backupTable: backupTableName,
      recordsBackedUp: backupCount,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Erro ao criar backup:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao criar backup',
      details: error.message
    });
  }
});

module.exports = {
  requireAdminAuth
};
