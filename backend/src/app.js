// ============================================================
//  PharmaBridge — Backend entry point
// ============================================================
// Wires together Express, the HTTP server, and Socket.io, mounts all
// API routes, and starts listening. Real-time notifications are
// delivered to per-user rooms (`user_${userId}`).
// ============================================================

// Load environment variables before anything else.
require('dotenv').config();

const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

// Config / infrastructure
const { initDb } = require('./config/db');

// Middleware
const { errorHandler, notFound } = require('./middleware/errorHandler');

// Routes
const authRoutes = require('./routes/auth.routes');
const adminRoutes = require('./routes/admin.routes');
const companyRoutes = require('./routes/company.routes');
const pharmacyRoutes = require('./routes/pharmacy.routes');
const driverRoutes = require('./routes/driver.routes');
const marketRoutes = require('./routes/market.routes');
const notificationsRoutes = require('./routes/notifications.routes');

// ------------------------------------------------------------
// App + HTTP server + Socket.io
// ------------------------------------------------------------
const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
];

const corsOrigin = (origin, callback) => {
  if (!origin || allowedOrigins.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin)) {
    callback(null, true);
  } else {
    callback(new Error('Not allowed by CORS'));
  }
};

const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    credentials: true,
  },
});

// Make io available to controllers via req.app.get('io').
app.set('io', io);

// ------------------------------------------------------------
// Core middleware
// ------------------------------------------------------------
app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ------------------------------------------------------------
// Socket.io connection handling
// ------------------------------------------------------------
io.on('connection', (socket) => {
  console.log(`[socket] connected: ${socket.id}`);

  // Client emits 'join' with its userId after login so it receives
  // notifications targeted at user_${userId}.
  socket.on('join', (userId) => {
    if (userId === undefined || userId === null) return;
    socket.join(`user_${userId}`);
    console.log(`[socket] ${socket.id} joined room user_${userId}`);
  });

  socket.on('disconnect', () => {
    console.log(`[socket] disconnected: ${socket.id}`);
  });
});

// ------------------------------------------------------------
// Health check
// ------------------------------------------------------------
app.get('/health', (req, res) => {
  res.json({ success: true, message: 'Server running' });
});

// ------------------------------------------------------------
// API routes
// ------------------------------------------------------------
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/pharmacy', pharmacyRoutes);
app.use('/api/driver', driverRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/notifications', notificationsRoutes);

// ------------------------------------------------------------
// 404 + error handler (must be last)
// ------------------------------------------------------------
app.use(notFound);
app.use(errorHandler);

// ------------------------------------------------------------
// Start server
// ------------------------------------------------------------
const PORT = process.env.PORT || 5000;

async function start() {
  try {
    // Connect to DB and run the startup migration before accepting traffic.
    await initDb();
  } catch (err) {
    console.error('[startup] database initialisation failed; continuing to listen so /health works');
  }

  server.listen(PORT, () => {
    console.log(`[server] PharmaBridge backend running on port ${PORT}`);
  });
}

start();

module.exports = { app, io };
