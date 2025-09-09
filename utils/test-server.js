// Teste simples do backend em porta 3001
const express = require('express');
const app = express();
const PORT = 3001;

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend test running on port 3001' });
});

app.get('/test-batch', (req, res) => {
  res.json({ 
    message: 'Batch optimization test endpoint',
    optimization: 'active',
    debounceTime: '1000ms'
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Test backend running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🧪 Batch test: http://localhost:${PORT}/test-batch`);
});
