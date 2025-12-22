require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

// Import routes
const authRoutes = require('./routes/auth');
const characterRoutes = require('./routes/characters');
const campaignRoutes = require('./routes/campaigns');
const rbacRoutes = require('./routes/rbac');

// Import middleware
const { sanitizeInput, securityHeaders } = require('./middleware/validation');

// Import services and jobs
const { scheduleSessionCleanup } = require('./jobs/sessionCleanup');

// Initialize express app and Prisma
const app = express();
const prisma = new PrismaClient();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? false : ["http://localhost:3000"]
  }
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Security middleware
app.use(securityHeaders);
app.use(sanitizeInput);

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('New client connected');

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });

  // Join campaign room
  socket.on('join:campaign', (campaignId) => {
    socket.join(`campaign:${campaignId}`);
  });

  // Leave campaign room
  socket.on('leave:campaign', (campaignId) => {
    socket.leave(`campaign:${campaignId}`);
  });

  // Handle game actions
  socket.on('game:action', async (data) => {
    try {
      const { campaignId, action, payload } = data;
      
      // Broadcast action to all players in the campaign
      io.to(`campaign:${campaignId}`).emit('game:update', {
        action,
        payload
      });

      // Update game state in database if needed
      if (action === 'COMBAT_START' || action === 'COMBAT_END') {
        await prisma.gameState.update({
          where: {
            campaignId
          },
          data: {
            combatActive: action === 'COMBAT_START',
            initiativeOrder: action === 'COMBAT_START' ? JSON.stringify(payload.order) : null
          }
        });
      }
    } catch (error) {
      console.error('Game action error:', error);
      socket.emit('game:error', { error: 'Error processing game action' });
    }
  });

  // Handle chat messages
  socket.on('chat:message', async (data) => {
    try {
      const { campaignId, message, type } = data;
      
      // Broadcast message to all players in the campaign
      io.to(`campaign:${campaignId}`).emit('chat:update', {
        message,
        type
      });
    } catch (error) {
      console.error('Chat message error:', error);
      socket.emit('chat:error', { error: 'Error sending chat message' });
    }
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/characters', characterRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/rbac', rbacRoutes);

// Serve static assets in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something broke!' });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

// Schedule session cleanup job
scheduleSessionCleanup();

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 
