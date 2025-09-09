#!/usr/bin/env node
// Script de benchmark: simula pares de clientes conectando ao backend (Socket.IO)
// Uso: node simulate_sessions.js --url=http://localhost:3000 --sessions=100 --rate=5
// onde rate é sessões por segundo (criação)

const io = require('socket.io-client');

// --- parse args simples ---
const argv = require('minimist')(process.argv.slice(2));
const SERVER_URL = argv.url || argv.u || 'http://localhost:3000';
const SESSIONS = parseInt(argv.sessions || argv.s || '10', 10);
const RATE = parseFloat(argv.rate || argv.r || '2'); // sessões por segundo
const STAGGER_MS = Math.max(0, Math.round(1000 / RATE));
const STATION_ID = argv.stationId || 'est001';

if (!SERVER_URL) {
    console.error('Erro: informe --url do servidor (ex: --url=http://localhost:3000)');
    process.exit(1);
}

console.log(`Benchmark: url=${SERVER_URL} sessions=${SESSIONS} rate=${RATE}/s station=${STATION_ID}`);

let stats = {
    createdPairs: 0,
    connectedSockets: 0,
    errors: 0,
    messagesSent: 0
};

const sockets = [];

function makeQuery(sessionId, userId, role, displayName) {
    return {
        sessionId,
        userId,
        role,
        stationId: STATION_ID,
        displayName
    };
}

function createClientPair(index) {
    return new Promise((resolve) => {
        const sessionId = `loadtest_${Date.now()}_${index}`;
        const actorId = `actor_${index}_${Math.random().toString(36).slice(2, 8)}`;
        const candidateId = `candidate_${index}_${Math.random().toString(36).slice(2, 8)}`;

        const actor = io(SERVER_URL, { query: makeQuery(sessionId, actorId, 'actor', `Ator ${index}`), reconnection: false, timeout: 10000 });
        const candidate = io(SERVER_URL, { query: makeQuery(sessionId, candidateId, 'candidate', `Candidato ${index}`), reconnection: false, timeout: 10000 });

        sockets.push(actor, candidate);

        let connectedCount = 0;

        function onConnect(sock, role) {
            connectedCount++;
            stats.connectedSockets++;
            // Emit ready events after small delay
            setTimeout(() => {
                sock.emit('CLIENT_IM_READY');
                stats.messagesSent++;
            }, 200 + Math.random() * 200);
        }

        // Register handshake/error handlers early to capture failures
        function registerErrorHandlers(sock, role) {
            sock.on('connect_error', (err) => {
                stats.errors++;
                console.error(`[${role}] connect_error:`, err && (err.message || err));
            });
            sock.on('connect_timeout', () => {
                stats.errors++;
                console.error(`[${role}] connect_timeout`);
            });
            sock.on('error', (err) => {
                stats.errors++;
                console.error(`[${role}] error:`, err && (err.message || err));
            });
            sock.io && sock.io.on('reconnect_attempt', () => {
                // reconnection attempts shouldn't happen (we disable reconnection)
            });
        }

        registerErrorHandlers(actor, 'actor');
        registerErrorHandlers(candidate, 'candidate');

        actor.on('connect', () => onConnect(actor, 'actor'));
        candidate.on('connect', () => onConnect(candidate, 'candidate'));

        actor.on('SERVER_PARTNER_FOUND', (d) => {
            // when both connected, actor will start simulation after short delay
            setTimeout(() => {
                actor.emit('CLIENT_START_SIMULATION', { durationMinutes: 1 });
                stats.messagesSent++;

                // release data and PEP
                setTimeout(() => {
                    actor.emit('ACTOR_RELEASE_DATA', { dataItemId: 'impresso_1' });
                    stats.messagesSent++;
                }, 100);

                setTimeout(() => {
                    actor.emit('ACTOR_RELEASE_PEP', {});
                    stats.messagesSent++;
                }, 200);

                // Simular updates de score (burst com debounce no servidor)
                let updates = 0;
                const scoreInterval = setInterval(() => {
                    updates++;
                    actor.emit('EVALUATOR_SCORES_UPDATED_FOR_CANDIDATE', { scores: { item1: Math.random() > 0.5 ? 'OK' : 'NO' }, totalScore: Math.floor(Math.random() * 100) });
                    stats.messagesSent++;
                    if (updates >= 8) clearInterval(scoreInterval);
                }, 200);

            }, 300 + Math.random() * 400);
        });

        // simple ready ack from server
        actor.on('SERVER_PARTNER_UPDATE', () => { });
        candidate.on('SERVER_PARTNER_UPDATE', () => { });

        // Disconnect handlers
        actor.on('disconnect', () => { stats.connectedSockets--; });
        candidate.on('disconnect', () => { stats.connectedSockets--; });

        // Timeout fallback: resolve after a short period
        setTimeout(() => {
            stats.createdPairs++;
            resolve();
        }, 2000);
    });
}

async function run() {
    console.log('Iniciando criação de pares...');
    for (let i = 0; i < SESSIONS; i++) {
        createClientPair(i).catch(e => { stats.errors++; console.error('Erro ao criar par:', e && e.message); });
        await new Promise(r => setTimeout(r, STAGGER_MS));
    }

    console.log('Todos os pares solicitados foram criados. Monitorando por 30s antes de encerrar.');

    // Mostrar métricas periódicas
    const metricsInterval = setInterval(() => {
        console.log(new Date().toISOString(), 'stats:', JSON.stringify(stats));
    }, 5000);

    // Aguarda 30-60s para test
    await new Promise(r => setTimeout(r, 30000));

    console.log('Encerrando sockets...');
    clearInterval(metricsInterval);
    sockets.forEach(s => { try { s.disconnect(); } catch (e) { } });

    console.log('Finalizado. Estatísticas finais:', stats);
    process.exit(0);
}

run().catch(e => { console.error('Erro no run:', e); process.exit(1); });
