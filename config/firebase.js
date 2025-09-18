const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Configuração do Firebase Admin usando variáveis de ambiente
const firebaseConfig = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: null, // Not needed
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: null, // Not needed
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs"
};

// Inicializar Firebase Admin
let app;
let db;

try {
  if (process.env.NODE_ENV === 'production' || process.env.FIREBASE_PROJECT_ID) {
    app = initializeApp({
      credential: cert(firebaseConfig),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET
    });

    db = getFirestore(app);
    console.log('🔥 Firebase conectado com sucesso!');
  } else {
    console.log('🔒 Modo desenvolvimento - Firebase não inicializado');
    // Em desenvolvimento, criar mock do Firestore
    db = {
      collection: () => ({
        doc: () => ({
          get: async () => ({
            exists: () => false,
            data: () => null
          })
        })
      })
    };
  }
} catch (error) {
  console.error('❌ Erro ao conectar Firebase:', error);

  // Fallback para desenvolvimento
  db = {
    collection: () => ({
      doc: () => ({
        get: async () => ({
          exists: () => false,
          data: () => null
        })
      })
    })
  };
}

module.exports = {
  db,
  app: app || null
};
