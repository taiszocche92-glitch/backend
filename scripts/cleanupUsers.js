// Script para marcar usuários inativos como offline no Firestore
// Uso: node backend/scripts/cleanupUsers.js

const admin = require('firebase-admin');
const path = require('path');

// Inicializa o Firebase Admin (ajuste se necessário para seu ambiente)
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});
const db = admin.firestore();

async function cleanupUsers() {
  const snapshot = await db.collection('usuarios').get();
  const now = Date.now();
  let count = 0;
  for (const doc of snapshot.docs) {
    const data = doc.data();
    // Considera inativo se lastActive for ausente ou mais de 2 minutos atrás
    if (data.status !== 'offline' && (!data.lastActive || now - new Date(data.lastActive).getTime() > 2 * 60 * 1000)) {
      await doc.ref.update({ status: 'offline' });
      console.log(`Usuário ${doc.id} marcado como offline`);
      count++;
    }
  }
  console.log(`\nTotal de usuários marcados como offline: ${count}`);
  process.exit();
}

cleanupUsers();
