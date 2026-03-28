/**
 * Incentive RBAC: combines system Role + optional customRole.permissions.incentives
 *
 * customRole.permissions.incentives shape:
 * {
 *   admin?: boolean,
 *   ops?: boolean,
 *   financeApprover?: boolean,
 *   teamLead?: boolean,
 *   auditor?: boolean,
 *   ingestEvents?: boolean,
 *   manualAdjust?: boolean,
 *   unlockStatement?: boolean,
 * }
 */

function incentiveFlags(req) {
  return req.user?.customRole?.permissions?.incentives || {};
}

function isSuperOrAdmin(req) {
  return req.user?.role === 'SUPER_ADMIN' || req.user?.role === 'ADMIN';
}

function isManagerUp(req) {
  return isSuperOrAdmin(req) || req.user?.role === 'MANAGER';
}

/** Full configuration / plans / rules / bulk processing */
function requireIncentiveAdmin(req, res, next) {
  if (isSuperOrAdmin(req) || incentiveFlags(req).admin) return next();
  return res.status(403).json({ error: 'Incentive admin permission required' });
}

/** Event ingest, attribution preview, earnings simulate, exceptions resolve */
function requireIncentiveOps(req, res, next) {
  if (isManagerUp(req) || incentiveFlags(req).admin || incentiveFlags(req).ops || incentiveFlags(req).ingestEvents) {
    return next();
  }
  return res.status(403).json({ error: 'Incentive operations permission required' });
}

/** Approve adjustments, approve statements, mark paid */
function requireFinanceApprover(req, res, next) {
  if (isSuperOrAdmin(req) || incentiveFlags(req).financeApprover) return next();
  return res.status(403).json({ error: 'Finance approver permission required' });
}

/** Manual adjustment create (maker); approver separate */
function requireManualAdjustmentMaker(req, res, next) {
  if (isManagerUp(req) || incentiveFlags(req).manualAdjust || incentiveFlags(req).admin) return next();
  return res.status(403).json({ error: 'Manual adjustment permission required' });
}

/** Read audit trail */
function requireAuditor(req, res, next) {
  if (isSuperOrAdmin(req) || incentiveFlags(req).auditor || incentiveFlags(req).admin) return next();
  return res.status(403).json({ error: 'Auditor permission required' });
}

/** Any authenticated user in org — agent self-service */
function requireAgent(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  return next();
}

module.exports = {
  incentiveFlags,
  requireIncentiveAdmin,
  requireIncentiveOps,
  requireFinanceApprover,
  requireManualAdjustmentMaker,
  requireAuditor,
  requireAgent,
  isSuperOrAdmin,
  isManagerUp,
};
