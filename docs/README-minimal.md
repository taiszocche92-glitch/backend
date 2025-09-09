# Minimal Optimized Backend for Revalida Simulations

## Overview
This is a streamlined version of the Revalida backend, optimized for fast cold starts and focused on essential functionalities for simulation coordination.

## Key Features

### ✅ WebSocket for Simulation Coordination
- Real-time communication between candidates and evaluators
- Room-based simulations with participant management
- Automatic cleanup of inactive simulations

### ✅ Basic Authentication
- Firebase Auth token verification
- Socket-level authentication middleware
- User identification and validation

### ✅ Minimal Endpoints
- `/health` - Health check for monitoring
- `/auth/verify` - Token verification
- `/api/user/:uid` - Basic user data

### ✅ Delta Sync for Real-Time Corrections
- Real-time correction updates via WebSocket
- Delta-based synchronization to minimize bandwidth
- Persistent correction history per simulation

### ✅ Cold Start Optimization
- Removed heavy dependencies (node-cache, complex CORS)
- Simplified Firebase initialization
- Minimal memory footprint
- Fast startup time

## Architecture

### Core Components
- **Express Server**: Minimal HTTP endpoints
- **Socket.IO**: WebSocket communication
- **Firebase Admin**: Authentication and user management
- **In-Memory Storage**: Active simulations and participants

### Data Flow
1. **Authentication**: Client sends Firebase ID token
2. **Connection**: Authenticated socket joins simulation room
3. **Coordination**: Real-time events for simulation control
4. **Corrections**: Delta sync for real-time feedback
5. **Cleanup**: Automatic removal of inactive sessions

## API Reference

### HTTP Endpoints

#### GET /health
Health check endpoint
```json
{
  "status": "ok",
  "timestamp": "2025-09-04T17:55:44.029Z",
  "uptime": 22.3705202
}
```

#### POST /auth/verify
Verify Firebase ID token
```json
// Request
{
  "token": "firebase_id_token"
}

// Response
{
  "uid": "user_id",
  "email": "user@example.com"
}
```

#### GET /api/user/:uid
Get basic user information
```json
{
  "uid": "user_id",
  "email": "user@example.com",
  "displayName": "User Name"
}
```

### WebSocket Events

#### Authentication
```javascript
// Client connects with auth token
const socket = io('http://localhost:3000', {
  auth: { token: 'firebase_id_token' }
});
```

#### Simulation Management
```javascript
// Join simulation
socket.emit('join-simulation', {
  simulationId: 'sim_123',
  role: 'candidate' // or 'evaluator'
});

// Start simulation
socket.emit('start-simulation', {
  simulationId: 'sim_123',
  duration: 600 // seconds
});

// End simulation
socket.emit('end-simulation', {
  simulationId: 'sim_123'
});
```

#### Real-Time Corrections
```javascript
// Send correction update
socket.emit('correction-update', {
  simulationId: 'sim_123',
  correctionId: 'corr_456',
  delta: { score: 85, feedback: 'Good performance' },
  type: 'update'
});

// Receive correction deltas
socket.on('correction-delta', (data) => {
  console.log('Correction update:', data);
});
```

#### Messaging
```javascript
// Send message
socket.emit('send-message', {
  simulationId: 'sim_123',
  message: 'Hello everyone!',
  type: 'text'
});

// Receive messages
socket.on('new-message', (data) => {
  console.log('New message:', data);
});
```

## Environment Variables

### Required for Production
- `FIREBASE_PROJECT_ID`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_CLIENT_EMAIL`
- `NODE_ENV=production`

### Optional
- `FRONTEND_URL` - CORS allowed origin
- `PORT` - Server port (default: 3000)

## Performance Optimizations

### Cold Start Improvements
- **Reduced Dependencies**: Removed node-cache, complex middleware
- **Simplified Initialization**: Streamlined Firebase setup
- **Minimal Memory Usage**: In-memory storage only for active sessions
- **Fast Cleanup**: Automatic removal of inactive simulations

### Cost Optimizations
- **No Debug Logging**: Removed console.log in production
- **Minimal Firestore Reads**: Only essential database operations
- **Efficient WebSocket**: Room-based messaging reduces overhead

## Deployment

### Local Development
```bash
cd backend
npm install
npm start
```

### Production (Cloud Run)
```bash
# Build and deploy
docker build -f Dockerfile.backend -t revalida-backend .
gcloud run deploy revalida-backend-minimal \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=production
```

## Migration from Previous Version

### Removed Features
- Complex caching system (node-cache)
- Debug instrumentation and monitoring
- Multiple download endpoints
- Complex session management with timeouts
- Statistics and metrics endpoints
- Advanced CORS configurations

### Preserved Features
- WebSocket simulation coordination
- Firebase authentication
- Basic user management
- Real-time messaging
- Simulation lifecycle management

## Monitoring

### Health Checks
- HTTP GET `/health` for load balancer health checks
- Automatic cleanup every 30 minutes
- Graceful shutdown handling

### Logs
- Minimal logging for production cost optimization
- Structured error responses
- Connection/disconnection events for debugging

## Security

### Authentication
- Firebase ID token verification on all socket connections
- User identification and role-based access
- Token expiration handling

### Data Validation
- Input sanitization on all endpoints
- Payload size limits (1MB)
- Type validation for WebSocket events

### CORS
- Configurable allowed origins
- Credentials support for authenticated requests
- Preflight handling for complex requests
