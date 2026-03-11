const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const { config } = require('../config/env');
const { logger } = require('../config/logger');

const clients = new Map(); // userId -> Set<ws>

const setupWebSocket = (server) => {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(4001, 'Authentication required');
      return;
    }

    try {
      const decoded = jwt.verify(token, config.jwtSecret);
      const userId = decoded.userId;

      if (!clients.has(userId)) {
        clients.set(userId, new Set());
      }
      clients.get(userId).add(ws);

      logger.info(`WebSocket connected: user ${userId}`);

      ws.on('close', () => {
        const userClients = clients.get(userId);
        if (userClients) {
          userClients.delete(ws);
          if (userClients.size === 0) clients.delete(userId);
        }
        logger.info(`WebSocket disconnected: user ${userId}`);
      });

      ws.on('error', (err) => {
        logger.error('WebSocket error:', err);
      });

      // Send welcome
      ws.send(JSON.stringify({ type: 'connected', message: 'Connected to LeadFlow' }));
    } catch {
      ws.close(4001, 'Invalid token');
    }
  });

  return wss;
};

/**
 * Send real-time notification to specific user(s)
 */
const notifyUser = (userId, event) => {
  const userClients = clients.get(userId);
  if (!userClients) return;

  const message = JSON.stringify(event);
  for (const ws of userClients) {
    if (ws.readyState === 1) {
      ws.send(message);
    }
  }
};

/**
 * Broadcast to all users in an organization
 */
const notifyOrganization = (orgUserIds, event) => {
  for (const userId of orgUserIds) {
    notifyUser(userId, event);
  }
};

module.exports = { setupWebSocket, notifyUser, notifyOrganization };
