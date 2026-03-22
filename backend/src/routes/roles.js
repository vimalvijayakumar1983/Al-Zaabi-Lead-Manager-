const express = require('express');
const { prisma } = require('../config/database');
const { authenticate, authorize, orgScope } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);
router.use(orgScope);

// ─── Permission Module Definitions ──────────────────────────────
const PERMISSION_MODULES = {
  dashboard: {
    label: 'Dashboard',
    icon: 'LayoutDashboard',
    permissions: {
      view: 'View dashboard',
      viewAllDivisions: 'View all divisions data'
    }
  },
  leads: {
    label: 'Lead Management',
    icon: 'Users',
    permissions: {
      view: 'View leads',
      viewAll: 'View all divisions leads',
      create: 'Create new leads',
      edit: 'Edit leads',
      delete: 'Delete leads permanently',
      archive: 'Archive/unarchive leads',
      import: 'Import leads from CSV',
      export: 'Export leads data',
      assign: 'Assign leads to users'
    }
  },
  team: {
    label: 'Team Management',
    icon: 'UserCog',
    permissions: {
      view: 'View team members',
      viewAll: 'View all divisions members',
      invite: 'Invite new users',
      edit: 'Edit user profiles',
      changeRole: 'Change user roles',
      transfer: 'Transfer between divisions',
      deactivate: 'Deactivate users',
      delete: 'Delete users permanently',
      resetPassword: 'Reset user passwords'
    }
  },
  divisions: {
    label: 'Divisions',
    icon: 'Building2',
    permissions: {
      view: 'View own division',
      viewAll: 'View all divisions',
      create: 'Create new divisions',
      edit: 'Edit division settings',
      delete: 'Delete divisions'
    }
  },
  campaigns: {
    label: 'Campaigns',
    icon: 'Megaphone',
    permissions: {
      view: 'View campaigns',
      create: 'Create campaigns',
      edit: 'Edit campaigns',
      delete: 'Delete campaigns'
    }
  },
  integrations: {
    label: 'Integrations',
    icon: 'Plug2',
    permissions: {
      view: 'View integrations',
      manage: 'Connect/disconnect platforms',
      configure: 'Configure integration settings'
    }
  },
  automations: {
    label: 'Automations',
    icon: 'Zap',
    permissions: {
      view: 'View automation rules',
      create: 'Create automation rules',
      edit: 'Edit automation rules',
      delete: 'Delete automation rules'
    }
  },
  analytics: {
    label: 'Analytics & Reports',
    icon: 'BarChart3',
    permissions: {
      view: 'View analytics',
      viewAll: 'View all divisions analytics',
      export: 'Export analytics data'
    }
  },
  settings: {
    label: 'Settings',
    icon: 'Settings',
    permissions: {
      view: 'View settings',
      manage: 'Manage organization settings',
      email: 'Manage email/SMTP settings'
    }
  },
  contacts: {
    label: 'Contacts',
    icon: 'UserCircle',
    permissions: {
      view: 'View contacts',
      create: 'Create contacts',
      edit: 'Edit contacts',
      delete: 'Delete contacts'
    }
  },
  pipeline: {
    label: 'Pipeline',
    icon: 'Kanban',
    permissions: {
      view: 'View pipeline',
      manage: 'Manage pipeline stages'
    }
  },
  notifications: {
    label: 'Notifications',
    icon: 'Bell',
    permissions: {
      view: 'View notifications',
      manageRules: 'Manage notification rules'
    }
  }
};

// ─── System Role Default Permissions ────────────────────────────
function buildAllTrue() {
  const perms = {};
  for (const [mod, def] of Object.entries(PERMISSION_MODULES)) {
    perms[mod] = {};
    for (const key of Object.keys(def.permissions)) {
      perms[mod][key] = true;
    }
  }
  return perms;
}

function buildAllFalse() {
  const perms = {};
  for (const [mod, def] of Object.entries(PERMISSION_MODULES)) {
    perms[mod] = {};
    for (const key of Object.keys(def.permissions)) {
      perms[mod][key] = false;
    }
  }
  return perms;
}

const SYSTEM_ROLE_DEFAULTS = {
  SUPER_ADMIN: {
    name: 'Super Admin',
    description: 'Full unrestricted access to everything across all divisions',
    color: '#dc2626',
    icon: 'crown',
    level: 100,
    permissions: buildAllTrue()
  },
  ADMIN: {
    name: 'Division Admin',
    description: 'Full control within their assigned division',
    color: '#f59e0b',
    icon: 'shield',
    level: 80,
    permissions: (() => {
      const p = buildAllTrue();
      // Admins can't see all divisions
      p.dashboard.viewAllDivisions = false;
      p.leads.viewAll = false;
      p.team.viewAll = false;
      p.team.delete = false;
      p.divisions.viewAll = false;
      p.divisions.create = false;
      p.divisions.delete = false;
      p.analytics.viewAll = false;
      return p;
    })()
  },
  MANAGER: {
    name: 'Manager',
    description: 'Manage team leads and performance within their division',
    color: '#8b5cf6',
    icon: 'briefcase',
    level: 60,
    permissions: (() => {
      const p = buildAllFalse();
      p.dashboard.view = true;
      p.leads.view = true; p.leads.create = true; p.leads.edit = true; p.leads.archive = true; p.leads.assign = true; p.leads.export = true;
      p.team.view = true; p.team.invite = true; p.team.edit = true;
      p.campaigns.view = true; p.campaigns.create = true; p.campaigns.edit = true;
      p.automations.view = true; p.automations.create = true; p.automations.edit = true;
      p.analytics.view = true; p.analytics.export = true;
      p.contacts.view = true; p.contacts.create = true; p.contacts.edit = true;
      p.pipeline.view = true; p.pipeline.manage = true;
      p.notifications.view = true;
      p.integrations.view = true;
      p.divisions.view = true;
      return p;
    })()
  },
  SALES_REP: {
    name: 'Sales Rep',
    description: 'Work on assigned leads and close deals',
    color: '#3b82f6',
    icon: 'target',
    level: 40,
    permissions: (() => {
      const p = buildAllFalse();
      p.dashboard.view = true;
      p.leads.view = true; p.leads.create = true; p.leads.edit = true;
      p.contacts.view = true; p.contacts.create = true; p.contacts.edit = true;
      p.pipeline.view = true;
      p.notifications.view = true;
      return p;
    })()
  },
  VIEWER: {
    name: 'Viewer',
    description: 'Read-only access to division data',
    color: '#6b7280',
    icon: 'eye',
    level: 20,
    permissions: (() => {
      const p = buildAllFalse();
      p.dashboard.view = true;
      p.leads.view = true;
      p.analytics.view = true;
      p.contacts.view = true;
      p.pipeline.view = true;
      p.notifications.view = true;
      return p;
    })()
  }
};

// ─── GET /api/roles ─ List all roles ────────────────────────────
router.get('/', async (req, res) => {
  try {
    // Get the group org ID (parent org for all divisions)
    const groupOrgId = req.user.organization?.parentId || req.user.organizationId;

    // Get custom roles from database
    const customRoles = await prisma.customRole.findMany({
      where: { organizationId: { in: req.orgIds } },
      include: {
        _count: { select: { users: true } },
        createdBy: { select: { firstName: true, lastName: true } }
      },
      orderBy: [{ level: 'desc' }, { name: 'asc' }]
    });

    // Count users per system role
    const userCounts = await prisma.user.groupBy({
      by: ['role'],
      where: {
        organizationId: { in: req.orgIds },
        customRoleId: null, // Only count users without custom roles
        isActive: true
      },
      _count: true
    });
    const countMap = {};
    userCounts.forEach(u => { countMap[u.role] = u._count; });

    // Build system roles response
    const systemRoles = Object.entries(SYSTEM_ROLE_DEFAULTS).map(([key, def]) => ({
      id: `system_${key}`,
      name: def.name,
      description: def.description,
      color: def.color,
      icon: def.icon,
      level: def.level,
      baseRole: key,
      permissions: def.permissions,
      isSystem: true,
      userCount: countMap[key] || 0,
      createdAt: null,
      updatedAt: null
    }));

    // Format custom roles
    const formattedCustom = customRoles.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      color: r.color,
      icon: r.icon,
      level: r.level,
      baseRole: r.baseRole,
      permissions: r.permissions,
      isSystem: false,
      userCount: r._count.users,
      createdBy: r.createdBy ? `${r.createdBy.firstName} ${r.createdBy.lastName}` : null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    }));

    res.json({
      roles: [...systemRoles, ...formattedCustom],
      permissionModules: PERMISSION_MODULES,
      systemDefaults: SYSTEM_ROLE_DEFAULTS
    });
  } catch (err) {
    console.error('Error fetching roles:', err);
    res.status(500).json({ error: 'Failed to fetch roles' });
  }
});

// ─── GET /api/roles/:id ─ Get single role ───────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if system role
    if (id.startsWith('system_')) {
      const key = id.replace('system_', '');
      const def = SYSTEM_ROLE_DEFAULTS[key];
      if (!def) return res.status(404).json({ error: 'Role not found' });
      
      const userCount = await prisma.user.count({
        where: { role: key, organizationId: { in: req.orgIds }, isActive: true, customRoleId: null }
      });

      return res.json({
        id, name: def.name, description: def.description, color: def.color,
        icon: def.icon, level: def.level, baseRole: key, permissions: def.permissions,
        isSystem: true, userCount
      });
    }

    const role = await prisma.customRole.findFirst({
      where: { id, organizationId: { in: req.orgIds } },
      include: {
        _count: { select: { users: true } },
        users: {
          select: { id: true, firstName: true, lastName: true, email: true, avatar: true, isActive: true },
          take: 50
        }
      }
    });

    if (!role) return res.status(404).json({ error: 'Role not found' });

    res.json({
      ...role,
      isSystem: false,
      userCount: role._count.users
    });
  } catch (err) {
    console.error('Error fetching role:', err);
    res.status(500).json({ error: 'Failed to fetch role' });
  }
});

// ─── POST /api/roles ─ Create custom role ───────────────────────
router.post('/', authorize('ADMIN'), async (req, res) => {
  try {
    const { name, description, color, icon, permissions, baseRole, level } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Role name is required' });
    }

    // Get the group org ID
    const groupOrgId = req.user.organization?.type === 'GROUP' 
      ? req.user.organizationId 
      : (req.user.organization?.parentId || req.user.organizationId);

    // Check for duplicate name
    const existing = await prisma.customRole.findFirst({
      where: { name: name.trim(), organizationId: groupOrgId }
    });
    if (existing) {
      return res.status(409).json({ error: 'A role with this name already exists' });
    }

    const role = await prisma.customRole.create({
      data: {
        name: name.trim(),
        description: description || '',
        color: color || '#6366f1',
        icon: icon || 'shield',
        permissions: permissions || {},
        baseRole: baseRole || 'SALES_REP',
        level: level || 50,
        organizationId: groupOrgId,
        createdById: req.user.id
      }
    });

    res.status(201).json({ ...role, isSystem: false, userCount: 0 });
  } catch (err) {
    console.error('Error creating role:', err);
    res.status(500).json({ error: 'Failed to create role' });
  }
});

// ─── PUT /api/roles/:id ─ Update custom role ────────────────────
router.put('/:id', authorize('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;

    if (id.startsWith('system_')) {
      return res.status(403).json({ error: 'System roles cannot be modified' });
    }

    const existing = await prisma.customRole.findFirst({
      where: { id, organizationId: { in: req.orgIds } }
    });
    if (!existing) return res.status(404).json({ error: 'Role not found' });

    const { name, description, color, icon, permissions, baseRole, level } = req.body;

    // Check duplicate name (excluding self)
    if (name && name.trim() !== existing.name) {
      const dup = await prisma.customRole.findFirst({
        where: { name: name.trim(), organizationId: existing.organizationId, NOT: { id } }
      });
      if (dup) return res.status(409).json({ error: 'A role with this name already exists' });
    }

    const updated = await prisma.customRole.update({
      where: { id },
      data: {
        ...(name && { name: name.trim() }),
        ...(description !== undefined && { description }),
        ...(color && { color }),
        ...(icon && { icon }),
        ...(permissions && { permissions }),
        ...(baseRole && { baseRole }),
        ...(level !== undefined && { level })
      },
      include: { _count: { select: { users: true } } }
    });

    // If baseRole changed, update all users with this custom role
    if (baseRole && baseRole !== existing.baseRole) {
      await prisma.user.updateMany({
        where: { customRoleId: id },
        data: { role: baseRole }
      });
    }

    res.json({ ...updated, isSystem: false, userCount: updated._count.users });
  } catch (err) {
    console.error('Error updating role:', err);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// ─── DELETE /api/roles/:id ─ Delete custom role ─────────────────
router.delete('/:id', authorize('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;

    if (id.startsWith('system_')) {
      return res.status(403).json({ error: 'System roles cannot be deleted' });
    }

    const role = await prisma.customRole.findFirst({
      where: { id, organizationId: { in: req.orgIds } },
      include: { _count: { select: { users: true } } }
    });
    if (!role) return res.status(404).json({ error: 'Role not found' });

    if (role._count.users > 0) {
      return res.status(409).json({ 
        error: `Cannot delete: ${role._count.users} user(s) are assigned to this role. Reassign them first.`
      });
    }

    await prisma.customRole.delete({ where: { id } });
    res.json({ success: true, message: 'Role deleted' });
  } catch (err) {
    console.error('Error deleting role:', err);
    res.status(500).json({ error: 'Failed to delete role' });
  }
});

// ─── POST /api/roles/:id/clone ─ Clone a role ──────────────────
router.post('/:id/clone', authorize('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    let sourcePerms, sourceName, sourceDesc, sourceColor, sourceIcon, sourceLevel, sourceBase;

    if (id.startsWith('system_')) {
      const key = id.replace('system_', '');
      const def = SYSTEM_ROLE_DEFAULTS[key];
      if (!def) return res.status(404).json({ error: 'Source role not found' });
      sourcePerms = def.permissions;
      sourceName = def.name;
      sourceDesc = def.description;
      sourceColor = def.color;
      sourceIcon = def.icon;
      sourceLevel = def.level;
      sourceBase = key;
    } else {
      const source = await prisma.customRole.findFirst({
        where: { id, organizationId: { in: req.orgIds } }
      });
      if (!source) return res.status(404).json({ error: 'Source role not found' });
      sourcePerms = source.permissions;
      sourceName = source.name;
      sourceDesc = source.description;
      sourceColor = source.color;
      sourceIcon = source.icon;
      sourceLevel = source.level;
      sourceBase = source.baseRole;
    }

    const newName = name || `${sourceName} (Copy)`;
    const groupOrgId = req.user.organization?.type === 'GROUP'
      ? req.user.organizationId
      : (req.user.organization?.parentId || req.user.organizationId);

    // Check duplicate
    const existing = await prisma.customRole.findFirst({
      where: { name: newName, organizationId: groupOrgId }
    });
    if (existing) {
      return res.status(409).json({ error: 'A role with this name already exists' });
    }

    const cloned = await prisma.customRole.create({
      data: {
        name: newName,
        description: sourceDesc,
        color: sourceColor,
        icon: sourceIcon,
        level: Math.max(0, sourceLevel - 5), // Slightly lower level
        baseRole: sourceBase,
        permissions: sourcePerms,
        organizationId: groupOrgId,
        createdById: req.user.id
      }
    });

    res.status(201).json({ ...cloned, isSystem: false, userCount: 0 });
  } catch (err) {
    console.error('Error cloning role:', err);
    res.status(500).json({ error: 'Failed to clone role' });
  }
});

// ─── POST /api/roles/:id/assign ─ Assign role to users ─────────
router.post('/:id/assign', authorize('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const { userIds } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'userIds array is required' });
    }

    if (id.startsWith('system_')) {
      // Assign system role — clear customRoleId and set base role
      const baseRole = id.replace('system_', '');
      if (!SYSTEM_ROLE_DEFAULTS[baseRole]) {
        return res.status(404).json({ error: 'Invalid system role' });
      }

      await prisma.user.updateMany({
        where: { id: { in: userIds }, organizationId: { in: req.orgIds } },
        data: { role: baseRole, customRoleId: null }
      });

      return res.json({ success: true, message: `Assigned ${userIds.length} user(s) to ${SYSTEM_ROLE_DEFAULTS[baseRole].name}` });
    }

    // Assign custom role
    const role = await prisma.customRole.findFirst({
      where: { id, organizationId: { in: req.orgIds } }
    });
    if (!role) return res.status(404).json({ error: 'Role not found' });

    await prisma.user.updateMany({
      where: { id: { in: userIds }, organizationId: { in: req.orgIds } },
      data: { role: role.baseRole, customRoleId: role.id }
    });

    res.json({ success: true, message: `Assigned ${userIds.length} user(s) to ${role.name}` });
  } catch (err) {
    console.error('Error assigning role:', err);
    res.status(500).json({ error: 'Failed to assign role' });
  }
});

// ─── GET /api/roles/modules/list ─ Get permission modules ──────
router.get('/modules/list', async (_req, res) => {
  res.json({ modules: PERMISSION_MODULES });
});

module.exports = router;
