const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true });

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
const { startCallbackReminderScheduler, stopCallbackReminderScheduler } = require('./services/callbackReminderScheduler');
const { startTaskReminderScheduler, stopTaskReminderScheduler } = require('./services/taskReminderScheduler');
const { startWillCallAgainSafetyNetScheduler, stopWillCallAgainSafetyNetScheduler } = require('./services/willCallAgainSafetyNetScheduler');
const {
  startNotificationEscalationScheduler,
  stopNotificationEscalationScheduler,
} = require('./services/notificationEscalationScheduler');
const {
  startRecycleBinPurgeScheduler,
  stopRecycleBinPurgeScheduler,
} = require('./services/recycleBinPurgeScheduler');

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
const whatsappWebhookRoutes = require('./routes/whatsappWebhook');
const whatsappTemplatesRoutes = require('./routes/whatsappTemplates');
const importRoutes = require('./routes/import');
const settingsRoutes = require('./routes/settings');
const integrationsRoutes = require('./routes/integrations');
const publicLeadsRoutes = require('./routes/public-leads');
const notificationRoutes = require('./routes/notifications');
const inboxRoutes = require('./routes/inbox');
const channelWebhookRoutes = require('./routes/channel-webhooks');
const channelErpRoutes = require('./routes/channel-erp');
const contactRoutes = require('./routes/contacts');
const callLogRoutes = require('./routes/call-logs');
const roleRoutes = require('./routes/roles');
const savedViewRoutes = require('./routes/saved-views');
const recycleBinRoutes = require('./routes/recycle-bin');
const reportBuilderRoutes = require('./routes/report-builder');

const app = express();
const server = createServer(app);

// ─── Global Middleware ───────────────────────────────────────────
app.set('trust proxy', 1);
app.use(helmet());
// CORS: allow all origins in development; in production use FRONTEND_URL whitelist
const corsOptions = {
  credentials: true,
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    // In development, allow any origin
    if (config.nodeEnv === 'development') return callback(null, true);
    const allowed = (config.frontendUrl || '')
      .split(',')
      .map(u => u.trim().replace(/\/$/, ''))
      .filter(Boolean);
    if (allowed.length === 0) return callback(null, true);
    const normalized = origin.replace(/\/$/, '');
    if (allowed.includes(normalized) || /\.vercel\.app$/.test(normalized)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
};
app.use(cors(corsOptions));
app.use(
  express.json({
    limit: '10mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: true }));

// ─── Static File Serving (uploads) ─────────────────────────────────
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
  ['/whatsapp/webhook', whatsappWebhookRoutes],
  ['/whatsapp', whatsappTemplatesRoutes],
  ['/import', importRoutes],
  ['/settings', settingsRoutes],
  ['/integrations', integrationsRoutes],
  ['/public', publicLeadsRoutes],
  ['/notifications', notificationRoutes],
  ['/inbox', inboxRoutes],
  ['/channels', channelWebhookRoutes],
  ['/channels', channelErpRoutes],
  ['/contacts', contactRoutes],
  ['/call-logs', callLogRoutes],
  ['/roles', roleRoutes],
  ['/saved-views', savedViewRoutes],
  ['/recycle-bin', recycleBinRoutes],
  ['/report-builder', reportBuilderRoutes],
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
const ENABLE_BACKGROUND_JOBS = process.env.ENABLE_BACKGROUND_JOBS !== 'false';

server.listen(PORT, () => {
  logger.info(`LeadFlow API server running on port ${PORT}`);
  logger.info(`Environment: ${config.nodeEnv}`);

  if (!ENABLE_BACKGROUND_JOBS) {
    logger.warn('Background schedulers are disabled (ENABLE_BACKGROUND_JOBS=false)');
    return;
  }

  const schedulerStarts = [
    { name: 'SLA', fn: () => startSLAMonitor(undefined, { runOnStart: true, initialDelayMs: 5000 }) },
    { name: 'TimeBased', fn: () => startTimeBasedScheduler(undefined, { runOnStart: true, initialDelayMs: 20000 }) },
    { name: 'CallbackReminder', fn: () => startCallbackReminderScheduler(undefined, { runOnStart: true, initialDelayMs: 35000 }) },
    { name: 'TaskReminder', fn: () => startTaskReminderScheduler(undefined, { runOnStart: true, initialDelayMs: 50000 }) },
    { name: 'WillCallAgainSafetyNet', fn: () => startWillCallAgainSafetyNetScheduler(undefined, { runOnStart: true, initialDelayMs: 65000 }) },
  ];
  for (const scheduler of schedulerStarts) {
    try {
      scheduler.fn();
      logger.info(`[Startup] ${scheduler.name} scheduler initialized`);
    } catch (err) {
      logger.error(`[Startup] Failed to initialize ${scheduler.name} scheduler:`, err.message);
    }
  }

  // Start unread reminder escalation monitor after core schedulers
  setTimeout(() => {
    try {
      startNotificationEscalationScheduler();
      logger.info('[Startup] NotificationEscalation scheduler initialized');
    } catch (err) {
      logger.error('[Startup] Failed to initialize NotificationEscalation scheduler:', err.message);
    }
  }, 80000);

  // Start the task reminder scheduler (due-soon & overdue pop-ups)
  startTaskReminderScheduler();

  // Start soft-loop inactivity safety net (Will Call Us Again)
  startWillCallAgainSafetyNetScheduler();

  // Start unread reminder escalation monitor
  startNotificationEscalationScheduler();

  // Purge recycle bin records that crossed retention window
  startRecycleBinPurgeScheduler();
});

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down gracefully...');
  stopSLAMonitor();
  stopTimeBasedScheduler();
  stopCallbackReminderScheduler();
  stopTaskReminderScheduler();
  stopWillCallAgainSafetyNetScheduler();
  stopNotificationEscalationScheduler();
  stopRecycleBinPurgeScheduler();
  await prisma.$disconnect();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = { app, server };
