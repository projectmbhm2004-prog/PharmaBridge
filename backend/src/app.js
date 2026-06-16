// backend entry point - express + http + socket.io all get wired up here.
// notifications go out to per-user rooms (`user_${userId}`), see the join handler below.

// dotenv first, before anything reads process.env
require('dotenv').config();

const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

const { initDb } = require('./config/db');

const { errorHandler, notFound } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth.routes');
const adminRoutes = require('./routes/admin.routes');
const companyRoutes = require('./routes/company.routes');
const pharmacyRoutes = require('./routes/pharmacy.routes');
const driverRoutes = require('./routes/driver.routes');
const marketRoutes = require('./routes/market.routes');
const notificationsRoutes = require('./routes/notifications.routes');

const app = express();
const server = http.createServer(app);

// vite jumps to the next free port a lot during dev, so just whitelist a range of them
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

// stash io on the app so controllers can grab it with req.app.get('io')
app.set('io', io);

app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

io.on('connection', (socket) => {
  console.log(`[socket] connected: ${socket.id}`);

  // client fires 'join' with its userId right after login so we can target it
  socket.on('join', (userId) => {
    if (userId === undefined || userId === null) return;
    socket.join(`user_${userId}`);
    console.log(`[socket] ${socket.id} joined room user_${userId}`);
  });

  socket.on('disconnect', () => {
    console.log(`[socket] disconnected: ${socket.id}`);
  });
});

// cheap health check, handy for uptime pings
app.get('/health', (req, res) => {
  res.json({ success: true, message: 'Server running' });
});

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/pharmacy', pharmacyRoutes);
app.use('/api/driver', driverRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/notifications', notificationsRoutes);

// keep these last - 404 then the error handler
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    // run the migration before we take traffic
    await initDb();
  } catch (err) {
    // still listen even if the DB is down so /health stays up and we can tell what's wrong
    console.error('[startup] database initialisation failed; continuing to listen so /health works');
  }

  server.listen(PORT, () => {
    console.log(`[server] PharmaBridge backend running on port ${PORT}`);
  });
}

start();

module.exports = { app, io };
