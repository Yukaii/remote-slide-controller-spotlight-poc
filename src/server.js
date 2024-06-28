import express from 'express';
import { createServer } from 'http';
import { Server, OPEN } from 'ws';
import { join } from 'path';

// Create an Express app
const app = express();

const __dirname = import.meta.dirname;

// Serve static files from the React app build directory
app.use(express.static(join(__dirname, 'client/build')));

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'client/build', 'index.html'));
});

// Create an HTTP server and integrate it with Express
const server = createServer(app);

// Create a WebSocket server attached to the HTTP server
const wss = new Server({ server });

// Set to store all connected clients
const clients = new Set();

// WebSocket server logic
wss.on('connection', (ws) => {
  console.log('New client connected');

  // Add the new client to our set
  clients.add(ws);

  // Handle incoming messages
  ws.on('message', (message) => {
    console.log('Received:', message);

    try {
      const data = JSON.parse(message);

      // Broadcast the message to all connected clients except the sender
      clients.forEach((client) => {
        if (client !== ws && client.readyState === OPEN) {
          client.send(JSON.stringify(data));
        }
      });
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  });

  // Handle client disconnection
  ws.on('close', () => {
    console.log('Client disconnected');
    clients.delete(ws);
  });
});

// Start the server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
