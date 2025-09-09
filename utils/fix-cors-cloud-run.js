// Fix CORS para Cloud Run - Middleware adicional para garantir CORS em produção

/*
🚨 ATENÇÃO: LOGS DE DEBUG REMOVIDOS PARA OTIMIZAÇÃO DE CUSTOS
- debugCors middleware foi removido do uso em produção
- Logs de debug devem ser apenas locais, nunca em produção
- Cada console.log() gera custos no Google Cloud Logging
*/

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, Origin',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Max-Age': '86400'
};

// Middleware para aplicar headers CORS em todas as respostas
const applyCorsHeaders = (req, res, next) => {
  // Aplicar headers CORS
  Object.keys(corsHeaders).forEach(header => {
    res.header(header, corsHeaders[header]);
  });

  // Para domínios específicos em produção
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5173'
  ];

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }

  // Responder imediatamente a requisições OPTIONS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  next();
};

// Middleware de debug para CORS - USO APENAS LOCAL
// 🚨 REMOVIDO DO SERVIDOR: Gera custos desnecessários em produção
const debugCors = (req, res, next) => {
  // Este middleware foi removido do uso em server.js para evitar custos
  // Use apenas em desenvolvimento local se necessário
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[CORS DEBUG] ${req.method} ${req.path} - Origin: ${req.headers.origin || 'none'}`);
  }
  next();
};

module.exports = {
  applyCorsHeaders,
  debugCors,
  corsHeaders
};
