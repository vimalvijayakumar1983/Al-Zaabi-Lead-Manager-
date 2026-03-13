const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const { config } = require('../config/env');
const { logger } = require('../config/logger');
const { prisma } = require('../config/database');

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

/**
 * Broadcast a data-change event to all users in an organization (except the actor).
 * This lets other users' UIs auto-refresh when someone makes a change.
 *
 * @param {string} orgId - Organization ID
 * @param {string} entity - Entity type (e.g. 'lead', 'contact', 'task', 'deal', 'campaign')
 * @param {string} action - Action type (e.g. 'created', 'updated', 'deleted', 'bulk_updated')
 * @param {string} actorId - User who performed the action (excluded from broadcast)
 * @param {object} [meta] - Optional metadata (e.g. entity ID)
 */
const broadcastDataChange = async (orgId, entity, action, actorId, meta = {}) => {
  try {
    // Find all active users in this org (and parent/child orgs for super admins)
    const orgIds = [orgId];
    const parentOrg = await prisma.organization.findUnique({ where: { id: orgId }, select: { parentId: true } });
    if (parentOrg?.parentId) {
      orgIds.push(parentOrg.parentId);
    }
    const childOrgs = await prisma.organization.findMany({
      where: { parentId: orgId },
      select: { id: true },
    });
    orgIds.push(...childOrgs.map(c => c.id));

    const users = await prisma.user.findMany({
      where: { organizationId: { in: orgIds }, isActive: true, id: { not: actorId } },
      select: { id: true },
    });

    const event = {
      type: 'data_changed',
      entity,
      action,
      ...meta,
      timestamp: new Date().toISOString(),
    };

    for (const user of users) {
      notifyUser(user.id, event);
    }
  } catch (err) {
    logger.error('broadcastDataChange error:', err);
  }
};

module.exports = { setupWebSocket, notifyUser, notifyOrganization, broadcastDataChange };
