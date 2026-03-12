const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { config } = require('./config/env');
const { logger } = require('./config/logger');
const { prisma } = require('./config/database');
const { setupWebSocket } = require('./websocket/server');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// Route imports
const authRoutes = require('./routes/auth');
const divisionRoutes = require('./routes/divisions');
const allocationRoutes = require('./routes/allocation');
const leadRoutes = require('./routes/leads');
const pipelineRoutes = require('./routes/pipeline');
const taskRoutes = require('./routes/tasks');
const communicationRoutes = require('./routes/communications');
const campaignRoutes = require('./routes/campaigns');
const automationRoutes = require('./routes/automations');
const analyticsRoutes = require('./routes/analytics');
const userRoutes = require('./routes/users');
const webhookRoutes = require('./routes/webhooks');
const importRoutes = require('./routes/import');
const settingsRoutes = require('./routes/settings');
const integrationsRoutes = require('./routes/integrations');
const publicLeadsRoutes = require('./routes/public-leads');
const notificationRoutes = require('./routes/notifications');

const app = express();
const server = createServer(app);

// ─── Global Middleware ───────────────────────────────────────────
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    const allowed = config.frontendUrl.split(',').map(u => u.trim().replace(/\/$/, ''));
    const normalized = origin.replace(/\/$/, '');
    // Check exact match or Vercel preview deployments
    if (allowed.includes(normalized) || /\.vercel\.app$/.test(normalized)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

// ─── Health Check ────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── API Routes ──────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/divisions', divisionRoutes);
app.use('/api/leads/allocation', allocationRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/pipeline', pipelineRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/communications', communicationRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/automations', automationRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/users', userRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/import', importRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/integrations', integrationsRoutes);
app.use('/api/public', publicLeadsRoutes);
app.use('/api/notifications', notificationRoutes);

// ─── Error Handling ──────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ─── WebSocket Setup ─────────────────────────────────────────────
setupWebSocket(server);

// ─── Start Server ────────────────────────────────────────────────
const PORT = config.port || 4000;

server.listen(PORT, () => {
  logger.info(`LeadFlow API server running on port ${PORT}`);
  logger.info(`Environment: ${config.nodeEnv}`);
});

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down gracefully...');
  await prisma.$disconnect();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = { app, server };
