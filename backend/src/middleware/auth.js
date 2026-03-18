const jwt = require('jsonwebtoken');
const { config } = require('../config/env');
const { prisma } = require('../config/database');

/**
 * JWT authentication middleware
 */
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        organizationId: true,
        isActive: true,
        customRoleId: true,
        customRole: {
          select: { id: true, name: true, permissions: true, level: true, color: true, icon: true },
        },
        organization: {
          select: { type: true, parentId: true },
        },
      },
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid or inactive account' });
    }

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

/**
 * Role-based access control middleware
 * SUPER_ADMIN implicitly has all ADMIN permissions.
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    // SUPER_ADMIN inherits ADMIN permissions
    const effectiveRoles = roles.includes('ADMIN') ? [...roles, 'SUPER_ADMIN'] : roles;
    if (!effectiveRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

/**
 * Ensure user can only access their organization's data.
 * For SUPER_ADMIN users, resolves all child division IDs for cross-org queries.
 */
const orgScope = async (req, _res, next) => {
  // Check if user has custom role with viewAll permissions (e.g., Group Manager)
  const hasViewAll = req.user.customRole?.permissions?.dashboard?.viewAllDivisions === true
    || req.user.customRole?.permissions?.leads?.viewAll === true;

  if (req.user.role === 'SUPER_ADMIN' || hasViewAll) {
    // Super admin or custom roles with viewAll can see all divisions
    const orgId = req.user.organizationId;
    const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { type: true, parentId: true } });
    const groupId = org?.type === 'GROUP' ? orgId : (org?.parentId || orgId);
    const children = await prisma.organization.findMany({
      where: { parentId: groupId },
      select: { id: true },
    });
    req.orgIds = [groupId, ...children.map(c => c.id)];
    req.isSuperAdmin = req.user.role === 'SUPER_ADMIN';
  } else {
    req.orgIds = [req.user.organizationId];
    req.isSuperAdmin = false;
  }
  // Keep backward compat
  req.orgId = req.user.organizationId;

  // Flag for role-based data scoping
  // SALES_REP and VIEWER only see their own assigned data
  req.isRestrictedRole = req.user.role === 'SALES_REP' || req.user.role === 'VIEWER';
  next();
};

module.exports = { authenticate, authorize, orgScope };
