// Adicione este trecho no início do seu arquivo server.js (backend)

io.on('connection', (socket) => {
  console.log('[BACKEND] Nova conexão socket:', socket.id, 'query:', socket.handshake.query)
  // ...restante do seu código de conexão...
})

// Isso vai mostrar no terminal do backend o conteúdo da query recebida em cada conexão socket.
// Assim, você poderá conferir se o userId está realmente chegando do frontend.
