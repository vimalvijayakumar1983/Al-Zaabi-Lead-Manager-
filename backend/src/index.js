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
const { startSLAMonitor, stopSLAMonitor } = require('./services/slaMonitor');
const { startTimeBasedScheduler, stopTimeBasedScheduler } = require('./services/timeBasedAutomationScheduler');

// Route imports
const authRoutes = require('./routes/auth');
const divisionRoutes = require('./routes/divisions');
const allocationRoutes = require('./routes/allocation');
const emailSettingsRoutes = require('./routes/email-settings');
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
const inboxRoutes = require('./routes/inbox');
const channelWebhookRoutes = require('./routes/channel-webhooks');
const contactRoutes = require('./routes/contacts');
const callLogRoutes = require('./routes/call-logs');

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

// ─── Static File Serving (uploads) ─────────────────────────────────
const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
// Also serve under /api/uploads so the Next.js proxy can reach files
app.use('/api/uploads', express.static(path.join(__dirname, '../uploads')));

// ─── Widget Script (public, CORS-enabled) ───────────────────────────
const widgetStaticOpts = {
  setHeaders: (res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cache-Control', 'public, max-age=3600');
    res.set('Content-Type', 'application/javascript; charset=utf-8');
  },
};
app.use('/api/widget', express.static(path.join(__dirname, '../public'), widgetStaticOpts));
app.use('/widget', express.static(path.join(__dirname, '../public'), widgetStaticOpts));
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
app.use(limiter);

// ─── Health Check ────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── API Routes (mounted at both /api/* and /* for flexible deployment) ──
const routeMounts = [
  ['/auth', authRoutes],
  ['/divisions', divisionRoutes],
  ['/leads/allocation', allocationRoutes],
  ['/leads', leadRoutes],
  ['/pipeline', pipelineRoutes],
  ['/tasks', taskRoutes],
  ['/communications', communicationRoutes],
  ['/campaigns', campaignRoutes],
  ['/automations', automationRoutes],
  ['/analytics', analyticsRoutes],
  ['/users', userRoutes],
  ['/webhooks', webhookRoutes],
  ['/import', importRoutes],
  ['/settings', settingsRoutes],
  ['/integrations', integrationsRoutes],
  ['/public', publicLeadsRoutes],
  ['/notifications', notificationRoutes],
  ['/inbox', inboxRoutes],
  ['/channels', channelWebhookRoutes],
  ['/contacts', contactRoutes],
  ['/call-logs', callLogRoutes],
];

for (const [path, handler] of routeMounts) {
  app.use(`/api${path}`, handler);
  app.use(path, handler);
}

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

  // Start the SLA monitoring service
  startSLAMonitor();

  // Start the time-based automation scheduler
  startTimeBasedScheduler();
});

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down gracefully...');
  stopSLAMonitor();
  stopTimeBasedScheduler();
  await prisma.$disconnect();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = { app, server };
