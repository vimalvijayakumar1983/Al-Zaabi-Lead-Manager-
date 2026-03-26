const { broadcastDataChange, notifyUser } = require('../websocket/server');

/**
 * Broadcast a communication change to org members (excluding actor) and echo to actor
 * so their UI can merge the payload without relying on refetch (multi-tab + excluded sender).
 */
function emitCommunicationChange(orgId, action, actorId, leadId, message) {
  const ts = new Date().toISOString();
  broadcastDataChange(orgId, 'communication', action, actorId, { entityId: leadId, message }).catch(() => {});
  if (actorId && message) {
    notifyUser(actorId, {
      type: 'data_changed',
      entity: 'communication',
      action,
      entityId: leadId,
      message,
      timestamp: ts,
    });
  }
}

module.exports = { emitCommunicationChange };
