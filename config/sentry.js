const Sentry = require('@sentry/node')

// Profiling integration é opcional e pode não estar disponível
let ProfilingIntegration = null
try {
  ProfilingIntegration = require('@sentry/profiling-node').ProfilingIntegration
} catch (e) {
  console.log('[SENTRY] Profiling não disponível, continuando sem profiling')
}

function initSentry() {
  // Só inicializa se a variável de ambiente estiver definida
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,

      // Performance Monitoring
      tracesSampleRate: 0.1, // 10% das transações

      // Environment
      environment: process.env.NODE_ENV || 'development',

      // Release tracking
      release: '1.0.0',

      // Tags personalizadas para o backend
      initialScope: {
        tags: {
          project: 'revalidaflow',
          component: 'backend'
        }
      },

      // Filtros para reduzir ruído
      beforeSend(event) {
        // Filtra health checks do Cloud Run
        if (event.request?.url?.includes('/health')) {
          return null
        }

        // Filtra erros de conexão WebSocket normais
        if (event.exception?.values?.[0]?.type === 'Error' &&
            event.exception?.values?.[0]?.value?.includes('WebSocket connection closed')) {
          return null
        }

        return event
      }
    })

    console.log('[SENTRY] Inicializado para monitoramento de erros')
  } else {
    console.log('[SENTRY] DSN não configurado, pulando inicialização')
  }
}

// Função para capturar erros de WebSocket no backend
function captureWebSocketError(error, context = {}) {
  Sentry.withScope((scope) => {
    scope.setTag('error_type', 'websocket')
    scope.setLevel('error')

    scope.setContext('websocket', {
      sessionId: context.sessionId,
      socketId: context.socketId,
      userId: context.userId,
      event: context.event,
      participants: context.participants
    })

    Sentry.captureException(error)
  })
}

// Função para capturar erros de simulação no backend
function captureSimulationError(error, context = {}) {
  Sentry.withScope((scope) => {
    scope.setTag('error_type', 'simulation')
    scope.setLevel('error')

    scope.setContext('simulation', {
      sessionId: context.sessionId,
      stationId: context.stationId,
      participants: context.participants,
      simulationState: context.simulationState,
      duration: context.duration
    })

    Sentry.captureException(error)
  })
}

// Função para capturar erros de Firebase no backend
function captureFirebaseError(error, context = {}) {
  Sentry.withScope((scope) => {
    scope.setTag('error_type', 'firebase')
    scope.setLevel('error')

    scope.setContext('firebase', {
      operation: context.operation,
      collection: context.collection,
      docId: context.docId,
      userId: context.userId,
      errorCode: error.code
    })

    Sentry.captureException(error)
  })
}

module.exports = {
  initSentry,
  captureWebSocketError,
  captureSimulationError,
  captureFirebaseError,
  Sentry
}