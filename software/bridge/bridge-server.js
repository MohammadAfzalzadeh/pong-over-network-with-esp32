import { WebSocketServer } from 'ws';
import net from 'net';

// Create WebSocket server for browsers
const wss = new WebSocketServer({ port: 4000 });

// Store connected browser clients
const spectators = new Map();

// Connect to remote TCP game server
const tcpClient = net.createConnection({ host: '45.89.244.213', port: 3000 }, () => {
  console.log('✅ Connected to TCP Game Server');
});

// Handle incoming data from TCP server
tcpClient.on('data', (data) => {
  try {
    // Parse game state from TCP
    const payload = JSON.parse(data.toString());

    // Broadcast to all connected WebSocket clients
    for (const ws of spectators.values()) {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(payload));
      }
    }

  } catch (err) {
    console.error('⛔ Invalid TCP data:', data.toString());
  }
});

// Handle new WebSocket connections from browsers
wss.on('connection', (ws) => {
  const id = Math.random().toString(36).slice(2); // Unique client ID
  spectators.set(id, ws);
  console.log('🌐 Browser connected:', id);

  // Listen for messages from the browser (optional)
  ws.on('message', (msg) => {
    try {
      const { type } = JSON.parse(msg);

      if (type === 'spectate') {
        // Inform the TCP server to start or maintain spectating
        tcpClient.write(JSON.stringify({
          event: 'game:spectate',
          data: {}
        }));
      }

    } catch (err) {
      console.error('❌ Invalid WS message:', msg.toString());
    }
  });

  // Remove on disconnect
  ws.on('close', () => {
    spectators.delete(id);
    console.log('❌ Browser disconnected:', id);

    // Optional: Notify TCP server if needed
    tcpClient.write(JSON.stringify({
      event: 'disconnect',
      data: {}
    }));
  });
});

// Handle TCP connection errors
tcpClient.on('error', (err) => {
  console.error('⛔ TCP Connection Error:', err.message);
});

// Handle unexpected socket closures
tcpClient.on('end', () => {
  console.warn('⚠️ TCP connection ended');
});

// Inform that the bridge is ready
console.log('🚀 WebSocket Bridge running on ws://localhost:4000');