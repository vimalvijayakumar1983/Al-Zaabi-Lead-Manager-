const { Router } = require('express');
const multer = require('multer');
const { z } = require('zod');
const { prisma } = require('../config/database');
const {
  isAttachmentObjectStorageEnabled,
  uploadInboxAttachmentBuffer,
} = require('../services/attachmentStorage');
const { authenticate, orgScope, resolveDivisionScope } = require('../middleware/auth');
const { logger } = require('../config/logger');

const { validate, validateQuery } = require('../middleware/validate');
const { paginate, paginatedResponse, paginationSchema } = require('../utils/pagination');
const { calculateLeadScore, predictConversion, calculateFullScore, rescoreAndPersist } = require('../utils/leadScoring');
const { detectDuplicates } = require('../utils/duplicateDetection');
const { createAuditLog } = require('../middleware/auditLog');
const { notifyUser, broadcastDataChange } = require('../websocket/server');
const { createNotification, notifyTeamMembers, notifyOrgAdmins, notifyLeadOwner, NOTIFICATION_TYPES } = require('../services/notificationService');
const { autoAssign, getNextAssignee } = require('../services/leadAssignment');
const { executeAutomations } = require('../services/automationEngine');
const { getLeadSLAInfo, getSLAConfig } = require('../services/slaMonitor');
const { upsertRecycleBinItem } = require('../services/recycleBinService');
const { generateLeadSummaryInsights, regenerateLeadSummaryById } = require('../services/aiService');
const { findStageForStatus } = require('../utils/statusStageMapping');
const {
  syncLeadScoreWithoutUpdatedAt,
  setLeadAiSummaryWithoutUpdatedAt,
  setLeadLastOpenedWithoutUpdatedAt,
} = require('../utils/leadSilentUpdates');

const router = Router();
router.use(authenticate, orgScope);
const AUTO_SERIAL_DEFAULT_VALUE = '__AUTO_SERIAL__';

const leadNoteFilesUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
      'application/pdf',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain', 'text/csv',
      'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm',
      'video/mp4', 'video/webm', 'video/quicktime',
      'application/zip', 'application/x-rar-compressed',
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('File type not allowed'), false);
  },
});

function optionalLeadNoteMultipart(req, res, next) {
  const ct = req.headers['content-type'] || '';
  if (!ct.includes('multipart/form-data')) return next();
  return leadNoteFilesUpload.array('files', 10)(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'File upload error' });
    }
    next();
  });
}

function refreshLeadAISummaryAsync(leadId) {
  if (!leadId) return;
  regenerateLeadSummaryById(leadId).catch(() => {});
}

const BUILTIN_CALL_OUTCOMES = new Set([
  'CALLBACK', 'CALL_LATER', 'CALL_AGAIN', 'WILL_CALL_US_AGAIN',
  'MEETING_ARRANGED', 'APPOINTMENT_BOOKED', 'INTERESTED',
  'NOT_INTERESTED', 'ALREADY_COMPLETED_SERVICES', 'NO_ANSWER',
  'VOICEMAIL_LEFT', 'WRONG_NUMBER', 'BUSY', 'GATEKEEPER',
  'FOLLOW_UP_EMAIL', 'QUALIFIED', 'PROPOSAL_REQUESTED', 'DO_NOT_CALL', 'OTHER',
]);

const LEAD_SOURCE_VALUES = [
  'WEBSITE_FORM', 'LIVE_CHAT', 'LANDING_PAGE', 'WHATSAPP', 'FACEBOOK_ADS',
  'GOOGLE_ADS', 'TIKTOK_ADS', 'MANUAL', 'CSV_IMPORT', 'API', 'REFERRAL', 'EMAIL', 'PHONE', 'OTHER',
];
const LEAD_SOURCE_SET = new Set(LEAD_SOURCE_VALUES);

// Smart name display — deduplicates when firstName and lastName are identical
function getDisplayName(obj) {
  const fn = (obj?.firstName || '').trim();
  const ln = (obj?.lastName || '').trim();
  if (!fn && !ln) return '';
  if (!ln) return fn;
  if (fn.toLowerCase() === ln.toLowerCase()) return fn;
  if (fn.toLowerCase().includes(ln.toLowerCase())) return fn;
  if (ln.toLowerCase().includes(fn.toLowerCase())) return ln;
  return `${fn} ${ln}`;
}

/** Prisma Decimal → JSON-safe number for res.json */
function toJsonSafeBudget(budget) {
  if (budget == null) return null;
  if (typeof budget === 'number' && Number.isFinite(budget)) return budget;
  if (typeof budget === 'object' && budget !== null && typeof budget.toNumber === 'function') {
    try {
      const n = budget.toNumber();
      return Number.isFinite(n) ? n : null;
    } catch {
      /* fall through */
    }
  }
  const n = Number(budget);
  return Number.isFinite(n) ? n : null;
}

/**
 * Note attachments loaded separately so GET /leads/:id does not depend on a nested Prisma relation
 * (avoids 500 when DB migration for leadNoteId lags or client is stale).
 */
async function mergeLeadNoteAttachments(lead) {
  const notes = lead?.notes;
  if (!Array.isArray(notes) || notes.length === 0) return;
  const noteIds = notes.map((n) => n.id).filter(Boolean);
  if (noteIds.length === 0) return;
  try {
    const att = prisma.attachment;
    if (!att || typeof att.findMany !== 'function') {
      lead.notes = notes.map((n) => ({ ...n, attachments: [] }));
      return;
    }
    const rows = await att.findMany({
      where: { leadNoteId: { in: noteIds } },
      select: {
        id: true,
        leadNoteId: true,
        filename: true,
        mimeType: true,
        size: true,
        url: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    const byNote = {};
    for (const r of rows) {
      if (!r.leadNoteId) continue;
      if (!byNote[r.leadNoteId]) byNote[r.leadNoteId] = [];
      byNote[r.leadNoteId].push({
        id: r.id,
        filename: r.filename,
        mimeType: r.mimeType,
        size: r.size,
        url: r.url || `/inbox/attachments/file/${r.id}`,
      });
    }
    lead.notes = notes.map((n) => ({
      ...n,
      attachments: byNote[n.id] || [],
    }));
  } catch (e) {
    logger.warn('GET /leads/:id mergeLeadNoteAttachments skipped', {
      leadId: lead.id,
      code: e.code,
      message: e.message,
    });
    lead.notes = notes.map((n) => ({ ...n, attachments: [] }));
  }
}

async function getLatestCallsByLead({ orgIds, assignedToId, leadIds } = {}) {
  if (Array.isArray(leadIds) && leadIds.length === 0) return [];

  const where = {};
  if (Array.isArray(leadIds) && leadIds.length > 0) {
    where.leadId = { in: leadIds };
  } else if ((Array.isArray(orgIds) && orgIds.length > 0) || assignedToId) {
    where.lead = {
      isArchived: false,
      ...(Array.isArray(orgIds) && orgIds.length > 0 ? { organizationId: { in: orgIds } } : {}),
      ...(assignedToId ? { assignedToId } : {}),
    };
  }

  return prisma.callLog.findMany({
    where,
    // Deterministic latest call per lead to keep filter + table consistent
    orderBy: [{ leadId: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }],
    distinct: ['leadId'],
    select: {
      leadId: true,
      disposition: true,
      notes: true,
      createdAt: true,
      metadata: true,
    },
  });
}

function readNumericCustomValue(customData, key) {
  if (!customData || typeof customData !== 'object') return null;
  const value = customData[key];
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.floor(num);
}

async function getNextAutoSerialValue(tx, organizationId, fieldName) {
  const leads = await tx.lead.findMany({
    where: { organizationId },
    select: { customData: true },
  });
  let maxValue = 0;
  for (const lead of leads) {
    const current = readNumericCustomValue(lead.customData, fieldName);
    if (current !== null && current > maxValue) maxValue = current;
  }
  return maxValue + 1;
}

async function getApplicableAutoSerialFields(tx, targetOrgId) {
  const org = await tx.organization.findUnique({
    where: { id: targetOrgId },
    select: { id: true, type: true, parentId: true },
  });
  const groupOrgId = org?.type === 'GROUP' ? org.id : (org?.parentId || targetOrgId);

  const [globalFields, divisionFields] = await Promise.all([
    tx.customField.findMany({
      where: {
        organizationId: groupOrgId,
        divisionId: null,
        type: 'NUMBER',
        defaultValue: AUTO_SERIAL_DEFAULT_VALUE,
      },
      orderBy: { order: 'asc' },
    }),
    tx.customField.findMany({
      where: {
        organizationId: targetOrgId,
        type: 'NUMBER',
        defaultValue: AUTO_SERIAL_DEFAULT_VALUE,
      },
      orderBy: { order: 'asc' },
    }),
  ]);

  const byName = new Map();
  for (const field of globalFields) byName.set(field.name, field);
  for (const field of divisionFields) byName.set(field.name, field);
  return Array.from(byName.values());
}

// ─── Schemas ─────────────────────────────────────────────────────
const createLeadSchema = z.object({
  name: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional().default(''),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
  jobTitle: z.string().optional().nullable(),
  source: z.enum(LEAD_SOURCE_VALUES).optional(),
  sourceDetail: z.string().max(120).optional().nullable(),
  budget: z.number().optional().nullable(),
  productInterest: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  campaign: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
  assignedToId: z.string().uuid().optional().nullable(),
  stageId: z.string().uuid().optional().nullable(),
  tags: z.array(z.string()).optional(),
  customData: z.record(z.unknown()).optional(),
  divisionId: z.string().uuid().optional().nullable(),
});

const updateLeadSchema = createLeadSchema.partial().extend({
  status: z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST']).optional(),
  lostReason: z.string().optional().nullable(),
});

const leadFilterSchema = paginationSchema.extend({
  status: z.string().optional(),
  source: z.string().optional(),
  assignedToId: z.string().optional(),
  stageId: z.string().optional(),
  tag: z.string().optional(),
  tags: z.string().optional(), // comma-separated tag names
  minScore: z.coerce.number().optional(),
  maxScore: z.coerce.number().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  updatedFrom: z.string().optional(),
  updatedTo: z.string().optional(),
  lastOpenedFrom: z.string().optional(), // YYYY-MM-DD: lastOpenedAt >= start of day
  lastOpenedTo: z.string().optional(), // YYYY-MM-DD: lastOpenedAt <= end of day
  company: z.string().optional(),
  jobTitle: z.string().optional(),
  location: z.string().optional(),
  productInterest: z.string().optional(),
  campaign: z.string().optional(),
  minBudget: z.coerce.number().optional(),
  maxBudget: z.coerce.number().optional(),
  budgetMin: z.coerce.number().optional(),
  budgetMax: z.coerce.number().optional(),
  hasEmail: z.string().optional(), // 'true' or 'false'
  hasPhone: z.string().optional(),
  conversionMin: z.coerce.number().optional(),
  conversionMax: z.coerce.number().optional(),
  customField: z.string().optional(), // JSON encoded: {"fieldName":"value"} for custom field filtering
  divisionId: z.string().optional(),
  callOutcome: z.string().optional(), // comma-separated CallDisposition values
  callOutcomeReason: z.string().optional(), // comma-separated reason labels/keys for latest call
  callOutcomeMode: z.enum(['latest', 'any']).optional(), // default latest; any is for analytics drill-down
  lastCallFrom: z.string().optional(), // date (YYYY-MM-DD): latest call createdAt >= start of day
  lastCallTo: z.string().optional(), // date: latest call createdAt <= end of day
  minCallCount: z.coerce.number().int().min(0).optional(),
  maxCallCount: z.coerce.number().int().min(0).optional(),
  showBlocked: z.string().optional(), // 'true' to show only DNC/blocked leads (admin only)
});

const aiSummaryRequestSchema = z.object({
  force: z.boolean().optional(),
});


/** Shared Prisma `where` for GET /leads and GET /leads/stats (same filters + division). */
async function buildLeadWhereClause(req, q) {
    const {
      search, status, source, assignedToId, stageId, tag, tags, minScore, maxScore, dateFrom, dateTo, updatedFrom, updatedTo,
      lastOpenedFrom, lastOpenedTo,
      company, jobTitle, location, campaign, productInterest, budgetMin, budgetMax, minBudget, maxBudget,
      hasEmail, hasPhone, conversionMin, conversionMax, customField, divisionId, callOutcome, callOutcomeReason,
      callOutcomeMode, lastCallFrom, lastCallTo, minCallCount, maxCallCount, showBlocked,
    } = q;

    const where = {
      organizationId: { in: req.orgIds },
      isArchived: false,
    };

    // ── Do Not Call / Blocked filter ──
    // By default, hide DNC leads from all views
    // showBlocked=true shows ONLY DNC leads (admin Blocked tab)
    if (showBlocked === 'true') {
      if (!['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(req.user.role)) {
        return { forbidden: true };
      }
      where.doNotCall = true;
    } else {
      where.doNotCall = false;
    }

    // Role-based data scoping: SALES_REP only sees their own assigned leads
    if (req.isRestrictedRole) {
      where.assignedToId = req.user.id;
    }

    // Optional: sidebar / filter division (same access rule as analytics)
    const scopedDivisionId = resolveDivisionScope(req, divisionId);
    if (scopedDivisionId) {
      where.organizationId = scopedDivisionId;
    }

    if (status) {
      if (status.includes(',')) {
        where.status = { in: status.split(',').map(s => s.trim()) };
      } else {
        where.status = status;
      }
    }
    if (source) {
      const selected = source.split(',').map((s) => s.trim()).filter(Boolean);
      const builtIn = selected.filter((s) => LEAD_SOURCE_SET.has(s));
      const customKeys = selected.filter((s) => !LEAD_SOURCE_SET.has(s));

      if (customKeys.length === 0) {
        if (builtIn.length > 1) {
          where.source = { in: builtIn };
        } else if (builtIn.length === 1) {
          where.source = builtIn[0];
        }
      } else {
        const sourceClauses = [];
        if (builtIn.length > 0) {
          sourceClauses.push(
            builtIn.length > 1
              ? { source: { in: builtIn } }
              : { source: builtIn[0] }
          );
        }
        sourceClauses.push(
          customKeys.length > 1
            ? { sourceDetail: { in: customKeys } }
            : { sourceDetail: customKeys[0] }
        );

        where.AND = [
          ...(where.AND || []),
          { OR: sourceClauses },
        ];
      }
    }
    if (assignedToId && !req.isRestrictedRole) {
      if (assignedToId === 'unassigned' || assignedToId === '__unassigned__') {
        where.assignedToId = null;
      } else if (assignedToId === '__current_user__') {
        where.assignedToId = req.user.id;
      } else {
        where.assignedToId = assignedToId;
      }
    }
    if (stageId) {
      // Support comma-separated stage IDs for multi-org drill-down
      const ids = stageId.split(',').filter(Boolean);
      where.stageId = ids.length === 1 ? ids[0] : { in: ids };
    }
    if (minScore !== undefined || maxScore !== undefined) {
      where.score = {};
      if (minScore !== undefined) where.score.gte = minScore;
      if (maxScore !== undefined) where.score.lte = maxScore;
    }
    if (tag) {
      where.tags = { some: { tag: { name: tag } } };
    }
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { company: { contains: search, mode: 'insensitive' } },
        { jobTitle: { contains: search, mode: 'insensitive' } },
        { location: { contains: search, mode: 'insensitive' } },
        { productInterest: { contains: search, mode: 'insensitive' } },
        { campaign: { contains: search, mode: 'insensitive' } },
        { website: { contains: search, mode: 'insensitive' } },
        { tags: { some: { tag: { name: { contains: search, mode: 'insensitive' } } } } },
      ];
    }

    // Date range — resolve shortcut tokens first
    let resolvedFrom = dateFrom;
    let resolvedTo = dateTo;
    if (resolvedFrom === '__this_week__') {
      const now = new Date();
      const day = now.getDay(); // 0=Sun
      const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
      resolvedFrom = new Date(now.getFullYear(), now.getMonth(), diff).toISOString().split('T')[0];
      resolvedTo = undefined; // up to now
    } else if (resolvedFrom === '__today__') {
      resolvedFrom = new Date().toISOString().split('T')[0];
      resolvedTo = resolvedFrom;
    } else if (resolvedFrom === '__this_month__') {
      const now = new Date();
      resolvedFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      resolvedTo = undefined;
    } else if (resolvedFrom === '__last_7_days__') {
      const d = new Date(); d.setDate(d.getDate() - 7);
      resolvedFrom = d.toISOString().split('T')[0];
      resolvedTo = undefined;
    } else if (resolvedFrom === '__last_30_days__') {
      const d = new Date(); d.setDate(d.getDate() - 30);
      resolvedFrom = d.toISOString().split('T')[0];
      resolvedTo = undefined;
    }
    if (resolvedFrom || resolvedTo) {
      where.createdAt = {};
      if (resolvedFrom) where.createdAt.gte = new Date(resolvedFrom);
      if (resolvedTo) where.createdAt.lte = new Date(resolvedTo + 'T23:59:59.999Z');
    }
    if (updatedFrom || updatedTo) {
      where.updatedAt = {};
      if (updatedFrom) where.updatedAt.gte = new Date(updatedFrom);
      if (updatedTo) where.updatedAt.lte = new Date(updatedTo + 'T23:59:59.999Z');
    }
    if (lastOpenedFrom || lastOpenedTo) {
      where.lastOpenedAt = {};
      if (lastOpenedFrom) where.lastOpenedAt.gte = new Date(lastOpenedFrom);
      if (lastOpenedTo) where.lastOpenedAt.lte = new Date(lastOpenedTo + 'T23:59:59.999Z');
    }
    // Text field filters
    if (company) where.company = { contains: company, mode: 'insensitive' };
    if (jobTitle) where.jobTitle = { contains: jobTitle, mode: 'insensitive' };
    if (location) where.location = { contains: location, mode: 'insensitive' };
    if (productInterest) where.productInterest = { contains: productInterest, mode: 'insensitive' };
    if (campaign) where.campaign = { contains: campaign, mode: 'insensitive' };
    // Budget range (support both minBudget/maxBudget and budgetMin/budgetMax)
    const effectiveBudgetMin = budgetMin !== undefined ? budgetMin : minBudget;
    const effectiveBudgetMax = budgetMax !== undefined ? budgetMax : maxBudget;
    if (effectiveBudgetMin !== undefined || effectiveBudgetMax !== undefined) {
      where.budget = {};
      if (effectiveBudgetMin !== undefined) where.budget.gte = effectiveBudgetMin;
      if (effectiveBudgetMax !== undefined) where.budget.lte = effectiveBudgetMax;
    }
    // Has email/phone
    if (hasEmail === 'true') where.email = { not: null };
    if (hasEmail === 'false') where.email = null;
    if (hasPhone === 'true') where.phone = { not: null };
    if (hasPhone === 'false') where.phone = null;
    // Multiple tags (comma-separated)
    if (tags) {
      const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
      if (tagList.length > 0) {
        where.tags = { some: { tag: { name: { in: tagList } } } };
      }
    }
    // Conversion probability range
    if (conversionMin !== undefined || conversionMax !== undefined) {
      where.conversionProb = {};
      if (conversionMin !== undefined) where.conversionProb.gte = conversionMin;
      if (conversionMax !== undefined) where.conversionProb.lte = conversionMax;
    }
    // Call outcome/reason filtering
    // - latest (default): aligns with Leads "Last Call Outcome".
    // - any: aligns analytics drill-down with call-log aggregate counts.
    if (callOutcome || callOutcomeReason) {
      const outcomes = callOutcome ? callOutcome.split(',').map(s => s.trim()).filter(Boolean) : [];
      const reasons = callOutcomeReason ? callOutcomeReason.split(',').map((s) => s.trim()).filter(Boolean) : [];
      if (outcomes.length > 0 || reasons.length > 0) {
        let scopedOrgIds = req.orgIds;
        if (typeof where.organizationId === 'string') {
          scopedOrgIds = [where.organizationId];
        } else if (where.organizationId && Array.isArray(where.organizationId.in)) {
          scopedOrgIds = where.organizationId.in;
        }

        const builtinOutcomes = new Set(outcomes.filter((o) => BUILTIN_CALL_OUTCOMES.has(o)));
        const customOutcomes = new Set(outcomes.filter((o) => !BUILTIN_CALL_OUTCOMES.has(o)));
        const reasonValues = reasons.map((r) => String(r || '').trim()).filter(Boolean);
        const normalize = (value) => String(value || '').trim().toLowerCase();
        const reasonSet = new Set(reasonValues.map(normalize));
        const mode = callOutcomeMode === 'any' ? 'any' : 'latest';

        let matchedLeadIds = [];
        if (mode === 'latest') {
          const lastCalls = await getLatestCallsByLead({
            orgIds: scopedOrgIds,
            assignedToId: req.isRestrictedRole ? req.user.id : undefined,
          });

          matchedLeadIds = lastCalls
            .filter((row) => {
              const md = (row.metadata && typeof row.metadata === 'object') ? row.metadata : {};

              const outcomeMatches = (() => {
                if (outcomes.length === 0) return true;
                if (builtinOutcomes.has(row.disposition)) return true;
                if (row.disposition !== 'OTHER') return false;
                const key = typeof md.dispositionKey === 'string' ? md.dispositionKey : '';
                return key ? customOutcomes.has(key) : false;
              })();
              if (!outcomeMatches) return false;

              const reasonMatches = (() => {
                if (reasonSet.size === 0) return true;
                if (row.disposition !== 'NOT_INTERESTED') return false;
                const extractedReason =
                  md.notInterestedReasonLabel ||
                  md.notInterestedReason ||
                  md.reasonLabel ||
                  md.reason ||
                  null;
                const reason = String(extractedReason || 'Unspecified').trim() || 'Unspecified';
                return reasonSet.has(normalize(reason));
              })();
              return reasonMatches;
            })
            .map((row) => row.leadId);
        } else {
          const outcomeOr = [];
          if (builtinOutcomes.size > 0) {
            outcomeOr.push({ disposition: { in: Array.from(builtinOutcomes) } });
          }
          if (customOutcomes.size > 0) {
            outcomeOr.push({
              AND: [
                { disposition: 'OTHER' },
                {
                  OR: Array.from(customOutcomes).map((key) => ({
                    metadata: { path: ['dispositionKey'], equals: key },
                  })),
                },
              ],
            });
          }

          const anyCallWhere = {
            lead: {
              organizationId: { in: scopedOrgIds },
              isArchived: false,
              ...(req.isRestrictedRole ? { assignedToId: req.user.id } : {}),
            },
            ...(outcomeOr.length > 0 ? { AND: [{ OR: outcomeOr }] } : {}),
          };

          if (reasonValues.length > 0) {
            const reasonOr = reasonValues.flatMap((reason) => ([
              { metadata: { path: ['notInterestedReasonLabel'], equals: reason } },
              { metadata: { path: ['notInterestedReason'], equals: reason } },
              { metadata: { path: ['reasonLabel'], equals: reason } },
              { metadata: { path: ['reason'], equals: reason } },
            ]));
            anyCallWhere.AND = [
              ...(anyCallWhere.AND || []),
              { disposition: 'NOT_INTERESTED' },
              { OR: reasonOr },
            ];
          }

          const matchedCalls = await prisma.callLog.findMany({
            where: anyCallWhere,
            select: { leadId: true },
            distinct: ['leadId'],
          });
          matchedLeadIds = matchedCalls.map((row) => row.leadId);
        }

        where.AND = [
          ...(where.AND || []),
          { id: { in: matchedLeadIds.length > 0 ? matchedLeadIds : ['__none__'] } },
        ];
      }
    }

    // Last call date — latest call per lead (same basis as "Last Call Outcome" column)
    if (lastCallFrom || lastCallTo) {
      let scopedOrgIds = req.orgIds;
      if (typeof where.organizationId === 'string') {
        scopedOrgIds = [where.organizationId];
      } else if (where.organizationId && Array.isArray(where.organizationId.in)) {
        scopedOrgIds = where.organizationId.in;
      }
      const lastCalls = await getLatestCallsByLead({
        orgIds: scopedOrgIds,
        assignedToId: req.isRestrictedRole ? req.user.id : undefined,
      });
      const fromBound = lastCallFrom ? new Date(lastCallFrom) : null;
      const toBound = lastCallTo ? new Date(`${lastCallTo}T23:59:59.999Z`) : null;
      const dateMatchedLeadIds = lastCalls
        .filter((row) => {
          const t = new Date(row.createdAt).getTime();
          if (fromBound && t < fromBound.getTime()) return false;
          if (toBound && t > toBound.getTime()) return false;
          return true;
        })
        .map((row) => row.leadId);
      where.AND = [
        ...(where.AND || []),
        { id: { in: dateMatchedLeadIds.length > 0 ? dateMatchedLeadIds : ['__none__'] } },
      ];
    }

    // Custom field filtering (JSON encoded)
    if (customField) {
      try {
        const cfFilters = JSON.parse(customField);
        // Build path filter for customData JSON field
        const cfConditions = [];
        for (const [key, value] of Object.entries(cfFilters)) {
          if (value !== '' && value !== null && value !== undefined) {
            cfConditions.push({ customData: { path: [key], string_contains: String(value) } });
          }
        }
        if (cfConditions.length > 0) {
          where.AND = [...(where.AND || []), ...cfConditions];
        }
      } catch { /* ignore invalid JSON */ }
    }

    // ─── Call Count Filtering ──────────────────────────────────
    if (minCallCount !== undefined || maxCallCount !== undefined) {
      const min = minCallCount !== undefined ? Number(minCallCount) : 0;
      const max = maxCallCount !== undefined ? Number(maxCallCount) : Infinity;

      if (min > 0) {
        // Only leads that have been called at least `min` times
        const having = { id: { _count: { gte: min } } };
        if (max < Infinity) having.id._count.lte = max;

        const results = await prisma.callLog.groupBy({
          by: ['leadId'],
          _count: { id: true },
          having,
        });
        const ids = results.map(r => r.leadId);
        // If no leads match, add impossible condition to return 0 results
        where.AND = [...(where.AND || []), { id: { in: ids.length > 0 ? ids : ['__none__'] } }];
      } else if (max < Infinity) {
        // Min is 0, so include leads with 0 calls too
        // Exclude leads with MORE than max calls
        const tooMany = await prisma.callLog.groupBy({
          by: ['leadId'],
          _count: { id: true },
          having: { id: { _count: { gt: max } } },
        });
        const excludeIds = tooMany.map(r => r.leadId);
        if (excludeIds.length > 0) {
          where.AND = [...(where.AND || []), { id: { notIn: excludeIds } }];
        }
      }
    }

    return { where };
  }
// ─── List Leads ──────────────────────────────────────────────────
router.get('/', validateQuery(leadFilterSchema), async (req, res, next) => {
  try {
    const { page, limit, sortBy, sortOrder } = req.validatedQuery;
    const built = await buildLeadWhereClause(req, req.validatedQuery);
    if (built.forbidden) return res.status(403).json({ error: 'Only admins can view blocked leads' });
    const { where } = built;

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        include: {
          assignedTo: { select: { id: true, firstName: true, lastName: true, avatar: true } },
          lastOpenedBy: { select: { id: true, firstName: true, lastName: true } },
          stage: { select: { id: true, name: true, color: true } },
          tags: { include: { tag: true } },
          organization: { select: { id: true, name: true } },
          _count: { select: { activities: true, tasks: true, communications: true, callLogs: true } },
        },
        orderBy: { [sortBy]: sortOrder },
        ...paginate(page, limit),
      }),
      prisma.lead.count({ where }),
    ]);

    // Fetch per-channel communication counts, unread counts, last message, and last call outcome for the current page of leads
    const leadIds = leads.map(l => l.id);
    let channelCountsMap = {};
    let unreadChannelCountsMap = {};
    let lastMessageMap = {};
    let lastCallOutcomeMap = {};
    if (leadIds.length > 0) {
      // Fetch last call log per lead (most recent call's disposition + date)
      const lastCallLogs = await getLatestCallsByLead({
        leadIds,
      });
      for (const cl of lastCallLogs) {
        const md = (typeof cl.metadata === 'object' && cl.metadata !== null) ? cl.metadata : {};
        lastCallOutcomeMap[cl.leadId] = {
          disposition: cl.disposition,
          dispositionKey: md.dispositionKey || null,
          dispositionLabel: md.dispositionLabel || null,
          notes: cl.notes,
          date: cl.createdAt,
        };
      }

      const [channelCounts, unreadChannelCounts, lastMessages] = await Promise.all([
        prisma.communication.groupBy({
          by: ['leadId', 'channel'],
          where: { leadId: { in: leadIds } },
          _count: { id: true },
        }),
        prisma.communication.groupBy({
          by: ['leadId', 'channel'],
          where: { leadId: { in: leadIds }, isRead: false, direction: 'INBOUND' },
          _count: { id: true },
        }),
        prisma.communication.findMany({
          where: { leadId: { in: leadIds }, direction: 'INBOUND' },
          orderBy: { createdAt: 'desc' },
          distinct: ['leadId'],
          select: { leadId: true, channel: true, body: true, createdAt: true },
        }),
        prisma.communication.findMany({
          where: { leadId: { in: leadIds } },
          orderBy: { createdAt: 'asc' },
          distinct: ['leadId'],
          select: { leadId: true, channel: true, body: true, createdAt: true },
        }),
      ]);

      // Build channel counts map: { leadId: { WHATSAPP: 3, EMAIL: 5, ... } }
      for (const row of channelCounts) {
        if (!channelCountsMap[row.leadId]) channelCountsMap[row.leadId] = {};
        channelCountsMap[row.leadId][row.channel] = row._count.id;
      }

      // Build unread channel counts map: { leadId: { WHATSAPP: 1, ... } }
      for (const row of unreadChannelCounts) {
        if (!unreadChannelCountsMap[row.leadId]) unreadChannelCountsMap[row.leadId] = {};
        unreadChannelCountsMap[row.leadId][row.channel] = row._count.id;
      }

      // Build last message map: { leadId: { channel, body, createdAt } }
      for (const msg of lastMessages) {
        lastMessageMap[msg.leadId] = {
          channel: msg.channel,
          body: msg.body?.substring(0, 100) || '',
          createdAt: msg.createdAt,
        };
      }

    }

    // Get org settings for SLA info
    let orgSettings = null;
    try {
      const org = await prisma.organization.findFirst({
        where: { id: { in: req.orgIds } },
        select: { settings: true },
      });
      orgSettings = org?.settings;
    } catch { /* non-critical */ }

    // Enrich leads with channel counts, unread counts, last message, last call outcome, and SLA info
    const enrichedLeads = leads.map(lead => ({
      ...lead,
      doNotCall: lead.doNotCall || false,
      doNotCallAt: lead.doNotCallAt || null,
      channelCounts: channelCountsMap[lead.id] || {},
      unreadChannelCounts: unreadChannelCountsMap[lead.id] || {},
      lastInboundMessage: lastMessageMap[lead.id] || null,
      lastCallOutcome: lastCallOutcomeMap[lead.id] || null,
      slaInfo: getLeadSLAInfo(lead, orgSettings),
    }));

    // Terminal normalization for immediate UI consistency:
    // WON => 100 / 1.00, LOST => 0 / 0.00
    const wonNeedsCorrection = [];
    const lostNeedsCorrection = [];
    const normalizedLeads = enrichedLeads.map((lead) => {
      if (lead.status === 'WON') {
        if (lead.score !== 100 || lead.conversionProb !== 1) wonNeedsCorrection.push(lead.id);
        return { ...lead, score: 100, conversionProb: 1 };
      }
      if (lead.status === 'LOST') {
        if ((lead.score || 0) !== 0 || (lead.conversionProb || 0) !== 0) lostNeedsCorrection.push(lead.id);
        return { ...lead, score: 0, conversionProb: 0 };
      }
      return lead;
    });

    res.json(paginatedResponse(normalizedLeads, total, page, limit));

    // Background self-heal for legacy rows with stale terminal scores.
    if (wonNeedsCorrection.length > 0) {
      prisma.lead.updateMany({
        where: { id: { in: wonNeedsCorrection }, organizationId: { in: req.orgIds }, status: 'WON' },
        data: { score: 100, conversionProb: 1 },
      }).catch(() => {});
    }
    if (lostNeedsCorrection.length > 0) {
      prisma.lead.updateMany({
        where: { id: { in: lostNeedsCorrection }, organizationId: { in: req.orgIds }, status: 'LOST' },
        data: { score: 0, conversionProb: 0 },
      }).catch(() => {});
    }
  } catch (err) {
    next(err);
  }
});

// ─── Leads stats (overview + reachability), same filters as list ──
router.get('/stats', validateQuery(leadFilterSchema), async (req, res, next) => {
  try {
    const built = await buildLeadWhereClause(req, req.validatedQuery);
    if (built.forbidden) return res.status(403).json({ error: 'Only admins can view blocked leads' });
    const { where } = built;

    const NOT_REACHED_DISPOSITIONS = ['NO_ANSWER', 'BUSY', 'VOICEMAIL_LEFT', 'WRONG_NUMBER', 'GATEKEEPER'];
    const callWhere = { lead: where };

    const [
      totalLeads, newLeads, qualifiedLeads, wonLeads, lostLeads,
      pipelineAgg, totalCalls, notReachedCalls,
    ] = await Promise.all([
      prisma.lead.count({ where }),
      prisma.lead.count({ where: { ...where, status: 'NEW' } }),
      prisma.lead.count({ where: { ...where, status: 'QUALIFIED' } }),
      prisma.lead.count({ where: { ...where, status: 'WON' } }),
      prisma.lead.count({ where: { ...where, status: 'LOST' } }),
      prisma.lead.aggregate({
        where: { ...where, status: { notIn: ['LOST'] }, budget: { not: null } },
        _sum: { budget: true },
      }),
      prisma.callLog.count({ where: callWhere }),
      prisma.callLog.count({ where: { ...callWhere, disposition: { in: NOT_REACHED_DISPOSITIONS } } }),
    ]);

    const reachedCalls = Math.max(0, totalCalls - notReachedCalls);
    const reachabilityRatio = totalCalls > 0 ? Math.round((reachedCalls / totalCalls) * 10000) / 100 : 0;
    const conversionRate = totalLeads > 0 ? Math.round((wonLeads / totalLeads) * 10000) / 100 : 0;

    res.json({
      overview: {
        totalLeads,
        newLeads,
        qualifiedLeads,
        wonLeads,
        lostLeads,
        conversionRate,
        pipelineValue: Number(pipelineAgg._sum.budget || 0),
      },
      reachability: {
        totalCalls,
        reachedCalls,
        notReachedCalls,
        reachabilityRatio,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── Global Search ──────────────────────────────────────────────
router.get('/search/global', async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || String(q).trim().length < 2) {
      return res.json({ leads: [], total: 0 });
    }
    const search = String(q).trim();

    const where = {
      organizationId: { in: req.orgIds },
      isArchived: false,
      OR: [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { company: { contains: search, mode: 'insensitive' } },
        { jobTitle: { contains: search, mode: 'insensitive' } },
        { location: { contains: search, mode: 'insensitive' } },
        { productInterest: { contains: search, mode: 'insensitive' } },
        { campaign: { contains: search, mode: 'insensitive' } },
        { website: { contains: search, mode: 'insensitive' } },
        { tags: { some: { tag: { name: { contains: search, mode: 'insensitive' } } } } },
      ],
    };

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        include: {
          assignedTo: { select: { id: true, firstName: true, lastName: true, avatar: true } },
          stage: { select: { id: true, name: true, color: true } },
          tags: { include: { tag: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      }),
      prisma.lead.count({ where }),
    ]);

    // Compute match context - which field matched
    const results = leads.map(lead => {
      const matchFields = [];
      const lowerSearch = search.toLowerCase();
      if (lead.firstName?.toLowerCase().includes(lowerSearch)) matchFields.push('name');
      if (lead.lastName?.toLowerCase().includes(lowerSearch)) matchFields.push('name');
      if (lead.email?.toLowerCase().includes(lowerSearch)) matchFields.push('email');
      if (lead.phone?.includes(search)) matchFields.push('phone');
      if (lead.company?.toLowerCase().includes(lowerSearch)) matchFields.push('company');
      if (lead.jobTitle?.toLowerCase().includes(lowerSearch)) matchFields.push('jobTitle');
      if (lead.location?.toLowerCase().includes(lowerSearch)) matchFields.push('location');
      if (lead.productInterest?.toLowerCase().includes(lowerSearch)) matchFields.push('productInterest');
      if (lead.campaign?.toLowerCase().includes(lowerSearch)) matchFields.push('campaign');
      if (lead.website?.toLowerCase().includes(lowerSearch)) matchFields.push('website');
      const tagMatch = (lead.tags || []).find(t => t.tag.name.toLowerCase().includes(lowerSearch));
      if (tagMatch) matchFields.push('tag');
      return { ...lead, matchFields: [...new Set(matchFields)] };
    });

    res.json({ leads: results, total });
  } catch (err) {
    next(err);
  }
});

// ─── Filter Values (unique values for dynamic filters) ──────────
router.get('/filter-values', async (req, res, next) => {
  try {
    const orgWhere = { organizationId: { in: req.orgIds }, isArchived: false };

    const [companies, jobTitles, locations, products, campaigns, tags, stages, users] = await Promise.all([
      prisma.lead.findMany({ where: { ...orgWhere, company: { not: null } }, select: { company: true }, distinct: ['company'], take: 100, orderBy: { company: 'asc' } }),
      prisma.lead.findMany({ where: { ...orgWhere, jobTitle: { not: null } }, select: { jobTitle: true }, distinct: ['jobTitle'], take: 100, orderBy: { jobTitle: 'asc' } }),
      prisma.lead.findMany({ where: { ...orgWhere, location: { not: null } }, select: { location: true }, distinct: ['location'], take: 100, orderBy: { location: 'asc' } }),
      prisma.lead.findMany({ where: { ...orgWhere, productInterest: { not: null } }, select: { productInterest: true }, distinct: ['productInterest'], take: 100, orderBy: { productInterest: 'asc' } }),
      prisma.lead.findMany({ where: { ...orgWhere, campaign: { not: null } }, select: { campaign: true }, distinct: ['campaign'], take: 100, orderBy: { campaign: 'asc' } }),
      prisma.tag.findMany({ where: { organizationId: { in: req.orgIds } }, select: { id: true, name: true, color: true }, orderBy: { name: 'asc' } }),
      prisma.pipelineStage.findMany({ where: { organizationId: { in: req.orgIds } }, select: { id: true, name: true, color: true }, orderBy: { order: 'asc' } }),
      prisma.user.findMany({ where: { organizationId: { in: req.orgIds }, isActive: true }, select: { id: true, firstName: true, lastName: true }, orderBy: { firstName: 'asc' } }),
    ]);

    res.json({
      companies: companies.map(c => c.company).filter(Boolean),
      jobTitles: jobTitles.map(j => j.jobTitle).filter(Boolean),
      locations: locations.map(l => l.location).filter(Boolean),
      products: products.map(p => p.productInterest).filter(Boolean),
      campaigns: campaigns.map(c => c.campaign).filter(Boolean),
      tags,
      stages,
      users,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Tags List ──────────────────────────────────────────────────
router.get('/tags', async (req, res, next) => {
  try {
    const organizationId = typeof req.query.organizationId === 'string' ? req.query.organizationId : undefined;

    let orgScope = req.orgIds;
    if (organizationId) {
      if (!req.orgIds.includes(organizationId)) {
        return res.status(403).json({ error: 'Access denied to this division' });
      }
      orgScope = [organizationId];
    }

    const tags = await prisma.tag.findMany({
      where: { organizationId: { in: orgScope } },
      select: { id: true, name: true, color: true },
      orderBy: { name: 'asc' },
    });
    res.json(tags);
  } catch (err) {
    next(err);
  }
});

// ─── Create Tag ─────────────────────────────────────────────────
router.post('/tags', async (req, res, next) => {
  try {
    const { name, color, organizationId } = req.body;
    if (!name || !organizationId) {
      return res.status(400).json({ error: 'Name and organizationId are required' });
    }
    // Check org access
    if (!req.orgIds.includes(organizationId)) {
      return res.status(403).json({ error: 'Access denied to this division' });
    }
    // Check duplicate
    const existing = await prisma.tag.findUnique({
      where: { organizationId_name: { organizationId, name: name.trim() } },
    });
    if (existing) {
      return res.status(409).json({ error: 'Tag already exists in this division' });
    }
    const tag = await prisma.tag.create({
      data: { name: name.trim(), color: color || '#6366f1', organizationId },
    });
    res.status(201).json(tag);
  } catch (err) {
    next(err);
  }
});

// ─── Update Tag ─────────────────────────────────────────────────
router.put('/tags/:id', async (req, res, next) => {
  try {
    const tag = await prisma.tag.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
    });
    if (!tag) return res.status(404).json({ error: 'Tag not found' });
    
    const { name, color } = req.body;
    const updateData = {};
    if (name !== undefined) {
      // Check duplicate name in same org
      const dup = await prisma.tag.findFirst({
        where: { organizationId: tag.organizationId, name: name.trim(), id: { not: tag.id } },
      });
      if (dup) return res.status(409).json({ error: 'A tag with this name already exists' });
      updateData.name = name.trim();
    }
    if (color !== undefined) updateData.color = color;
    
    const updated = await prisma.tag.update({
      where: { id: tag.id },
      data: updateData,
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ─── Delete Tag ─────────────────────────────────────────────────
router.delete('/tags/:id', async (req, res, next) => {
  try {
    const tag = await prisma.tag.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
    });
    if (!tag) return res.status(404).json({ error: 'Tag not found' });
    
    // Delete all lead-tag associations first, then the tag
    await prisma.$transaction([
      prisma.leadTag.deleteMany({ where: { tagId: tag.id } }),
      prisma.contactTag.deleteMany({ where: { tagId: tag.id } }),
      prisma.tag.delete({ where: { id: tag.id } }),
    ]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ─── Add Tags to Lead ───────────────────────────────────────────
router.post('/:id/tags', async (req, res, next) => {
  try {
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    
    const { tagIds, tagNames } = req.body;
    const results = [];
    
    // Add by tag IDs
    if (tagIds && Array.isArray(tagIds)) {
      for (const tagId of tagIds) {
        try {
          await prisma.leadTag.create({ data: { leadId: lead.id, tagId } });
          results.push({ tagId, added: true });
        } catch (e) {
          // Already exists - skip
          results.push({ tagId, added: false, reason: 'already assigned' });
        }
      }
    }
    
    // Add by tag names (create-on-the-fly)
    if (tagNames && Array.isArray(tagNames)) {
      for (const name of tagNames) {
        const tag = await prisma.tag.upsert({
          where: { organizationId_name: { organizationId: lead.organizationId, name: name.trim() } },
          create: { name: name.trim(), organizationId: lead.organizationId },
          update: {},
        });
        try {
          await prisma.leadTag.create({ data: { leadId: lead.id, tagId: tag.id } });
          results.push({ tagId: tag.id, name: tag.name, added: true });
        } catch (e) {
          results.push({ tagId: tag.id, name: tag.name, added: false, reason: 'already assigned' });
        }
      }
    }
    
    // Return updated lead with tags
    const updated = await prisma.lead.findUnique({
      where: { id: lead.id },
      include: { tags: { include: { tag: true } } },
    });
    res.json({ tags: updated.tags, results });
  } catch (err) {
    next(err);
  }
});

// ─── Remove Tag from Lead ───────────────────────────────────────
router.delete('/:id/tags/:tagId', async (req, res, next) => {
  try {
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    
    await prisma.leadTag.delete({
      where: { leadId_tagId: { leadId: lead.id, tagId: req.params.tagId } },
    }).catch(() => {});
    
    // Return updated tags
    const updated = await prisma.lead.findUnique({
      where: { id: lead.id },
      include: { tags: { include: { tag: true } } },
    });
    res.json({ tags: updated.tags });
  } catch (err) {
    next(err);
  }
});

// ─── Get Lead by ID ──────────────────────────────────────────────
router.post('/:id/ai-summary', validate(aiSummaryRequestSchema), async (req, res, next) => {
  try {
    const summaryWhere = { id: req.params.id, organizationId: { in: req.orgIds } };
    if (req.isRestrictedRole) summaryWhere.assignedToId = req.user.id;

    const lead = await prisma.lead.findFirst({
      where: summaryWhere,
      include: {
        stage: { select: { id: true, name: true, color: true } },
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 30,
          select: { id: true, type: true, description: true, createdAt: true },
        },
        notes: {
          orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
          take: 20,
          select: { id: true, content: true, createdAt: true },
        },
        tasks: {
          orderBy: { dueAt: 'asc' },
          take: 30,
          select: { id: true, title: true, status: true, priority: true, dueAt: true, createdAt: true, updatedAt: true },
        },
        communications: {
          orderBy: { createdAt: 'desc' },
          take: 30,
          select: { id: true, channel: true, direction: true, subject: true, body: true, createdAt: true },
        },
        callLogs: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: { id: true, disposition: true, notes: true, createdAt: true, metadata: true },
        },
      },
    });

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const force = req.validated?.force === true;
    const insights = generateLeadSummaryInsights(lead, {
      activities: lead.activities,
      communications: lead.communications,
      tasks: lead.tasks,
      notes: lead.notes,
      callLogs: lead.callLogs,
    });

    const summaryText = insights.summary;
    const shouldPersist = force || !lead.aiSummary || String(lead.aiSummary).trim() !== String(summaryText).trim();
    if (shouldPersist) {
      await setLeadAiSummaryWithoutUpdatedAt(lead.id, summaryText);
    }

    res.json({
      success: true,
      data: {
        ...insights,
        summary: summaryText,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── Bump lead.updatedAt (meaningful activity — e.g. opened Tasks tab) ──
router.post('/:id/touch', async (req, res, next) => {
  try {
    const touchWhere = { id: req.params.id, organizationId: { in: req.orgIds } };
    if (req.isRestrictedRole) touchWhere.assignedToId = req.user.id;
    const found = await prisma.lead.findFirst({ where: touchWhere, select: { id: true } });
    if (!found) return res.status(404).json({ error: 'Lead not found' });
    await prisma.lead.update({
      where: { id: found.id },
      data: { updatedAt: new Date() },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── Check-in / check-out (active work session on this lead) ──────
const checkInBodySchema = z.object({
  note: z.string().max(500).optional().nullable(),
});

router.post('/:id/check-in', validate(checkInBodySchema), async (req, res, next) => {
  try {
    const leadWhere = { id: req.params.id, organizationId: { in: req.orgIds } };
    if (req.isRestrictedRole) leadWhere.assignedToId = req.user.id;
    const lead = await prisma.lead.findFirst({
      where: leadWhere,
      select: { id: true, organizationId: true },
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const existingOnLead = await prisma.leadCheckinSession.findFirst({
      where: { leadId: lead.id, userId: req.user.id, checkedOutAt: null },
    });
    if (existingOnLead) {
      return res.status(400).json({ error: 'You are already checked in on this lead. Check out first.' });
    }

    const noteTrim = req.validated?.note != null ? String(req.validated.note).trim() : '';
    const noteToStore = noteTrim.length > 0 ? noteTrim : null;
    const now = new Date();
    const actorName = getDisplayName(req.user) || 'User';

    const session = await prisma.$transaction(async (tx) => {
      await tx.leadCheckinSession.updateMany({
        where: { userId: req.user.id, checkedOutAt: null },
        data: { checkedOutAt: now },
      });
      const created = await tx.leadCheckinSession.create({
        data: {
          leadId: lead.id,
          userId: req.user.id,
          checkedInAt: now,
          note: noteToStore,
        },
        include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
      });
      await tx.leadActivity.create({
        data: {
          leadId: lead.id,
          userId: req.user.id,
          type: 'LEAD_CHECK_IN',
          description: noteToStore
            ? `${actorName} checked in: ${noteToStore}`
            : `${actorName} checked in`,
          metadata: { sessionId: created.id },
        },
      });
      await tx.lead.update({
        where: { id: lead.id },
        data: { updatedAt: now },
      });
      return created;
    });

    broadcastDataChange(lead.organizationId, 'lead', 'updated', req.user.id, { entityId: lead.id }).catch(() => {});
    refreshLeadAISummaryAsync(lead.id);
    res.status(201).json(session);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/check-out', async (req, res, next) => {
  try {
    const leadWhere = { id: req.params.id, organizationId: { in: req.orgIds } };
    if (req.isRestrictedRole) leadWhere.assignedToId = req.user.id;
    const lead = await prisma.lead.findFirst({
      where: leadWhere,
      select: { id: true, organizationId: true },
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const session = await prisma.leadCheckinSession.findFirst({
      where: { leadId: lead.id, userId: req.user.id, checkedOutAt: null },
    });
    if (!session) {
      return res.status(400).json({ error: 'You are not checked in on this lead.' });
    }

    const now = new Date();
    const actorName = getDisplayName(req.user) || 'User';
    const durationMinutes = Math.max(0, Math.round((now.getTime() - session.checkedInAt.getTime()) / 60000));

    await prisma.$transaction(async (tx) => {
      await tx.leadCheckinSession.update({
        where: { id: session.id },
        data: { checkedOutAt: now },
      });
      await tx.leadActivity.create({
        data: {
          leadId: lead.id,
          userId: req.user.id,
          type: 'LEAD_CHECK_OUT',
          description: `${actorName} checked out (${durationMinutes} min)`,
          metadata: { sessionId: session.id, durationMinutes },
        },
      });
      await tx.lead.update({
        where: { id: lead.id },
        data: { updatedAt: now },
      });
    });

    broadcastDataChange(lead.organizationId, 'lead', 'updated', req.user.id, { entityId: lead.id }).catch(() => {});
    refreshLeadAISummaryAsync(lead.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const detailWhere = { id: req.params.id, organizationId: { in: req.orgIds } };
    if (req.isRestrictedRole) detailWhere.assignedToId = req.user.id;

    const lead = await prisma.lead.findFirst({
      where: detailWhere,
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true, avatar: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        lastOpenedBy: { select: { id: true, firstName: true, lastName: true } },
        stage: true,
        tags: { include: { tag: true } },
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
        },
        notes: {
          orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
          include: {
            user: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        tasks: {
          orderBy: { dueAt: 'asc' },
          include: { assignee: { select: { id: true, firstName: true, lastName: true } } },
        },
        communications: { orderBy: { createdAt: 'desc' }, take: 20 },
        attachments: { orderBy: { createdAt: 'desc' } },
        _count: { select: { activities: true, tasks: true, communications: true } },
      },
    });

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    await mergeLeadNoteAttachments(lead);

    // Hover-prefetch and background refetches use skipLastOpened=1 so "last opened" only updates on real detail views.
    const skipLastOpenedRecord =
      req.query.skipLastOpened === '1' ||
      req.query.skipLastOpened === 'true' ||
      req.query.prefetch === '1' ||
      req.query.prefetch === 'true';

    let lastOpenedPatch = {};
    if (!skipLastOpenedRecord) {
      const viewedAt = new Date();
      try {
        await setLeadLastOpenedWithoutUpdatedAt(lead.id, req.user.id, viewedAt);
        lastOpenedPatch = {
          lastOpenedAt: viewedAt,
          lastOpenedBy: {
            id: req.user.id,
            firstName: req.user.firstName,
            lastName: req.user.lastName,
          },
        };
      } catch { /* non-critical */ }
    }

    // Count unread + org SLA (check-in queries isolated so a missing migration / stale client cannot 500 this route)
    const [unreadCount, orgForSLA] = await Promise.all([
      prisma.communication.count({
        where: { leadId: lead.id, isRead: false, direction: 'INBOUND' },
      }),
      prisma.organization.findUnique({
        where: { id: lead.organizationId },
        select: { settings: true },
      }),
    ]);

    let activeCheckinSessions = [];
    let myCheckinSession = null;
    try {
      const checkin = prisma.leadCheckinSession;
      if (checkin && typeof checkin.findMany === 'function') {
        [activeCheckinSessions, myCheckinSession] = await Promise.all([
          checkin.findMany({
            where: { leadId: lead.id, checkedOutAt: null },
            include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
            orderBy: { checkedInAt: 'asc' },
          }),
          checkin.findFirst({
            where: { leadId: lead.id, userId: req.user.id, checkedOutAt: null },
            select: { id: true, checkedInAt: true, note: true },
          }),
        ]);
      }
    } catch (checkinErr) {
      logger.warn('GET /leads/:id leadCheckin skipped', {
        leadId: lead.id,
        code: checkinErr.code,
        message: checkinErr.message,
      });
    }

    // Fetch DNC blocker info if lead is blocked
    let doNotCallByUser = null;
    if (lead.doNotCall && lead.doNotCallById) {
      try {
        doNotCallByUser = await prisma.user.findUnique({
          where: { id: lead.doNotCallById },
          select: { id: true, firstName: true, lastName: true },
        });
      } catch { /* non-critical */ }
    }

    // Calculate full score breakdown for display and return fresh values
    let scoreBreakdown = null;
    let freshScore = lead.score;
    let freshConversionProb = lead.conversionProb;
    try {
      const scoreResult = await calculateFullScore(lead.id);
      scoreBreakdown = scoreResult.breakdown;
      freshScore = scoreResult.score;
      freshConversionProb = scoreResult.conversionProb;
      // If score has drifted, silently update it
      if (scoreResult.score !== lead.score || scoreResult.conversionProb !== lead.conversionProb) {
        await syncLeadScoreWithoutUpdatedAt(lead.id, scoreResult.score, scoreResult.conversionProb);
      }
    } catch { /* non-critical — breakdown is optional */ }

    const payload = {
      ...lead,
      ...lastOpenedPatch,
      budget: toJsonSafeBudget(lead.budget),
      score: freshScore,
      conversionProb: freshConversionProb,
      unreadCommunications: unreadCount,
      slaInfo: getLeadSLAInfo(lead, orgForSLA?.settings),
      doNotCallByUser,
      scoreBreakdown,
      leadCheckin: {
        activeSessions: activeCheckinSessions.map((s) => ({
          id: s.id,
          userId: s.userId,
          checkedInAt: s.checkedInAt,
          user: s.user,
        })),
        mySession: myCheckinSession,
      },
    };
    try {
      res.json(payload);
    } catch (serializeErr) {
      logger.error('GET /leads/:id response serialization failed', {
        leadId: lead.id,
        message: serializeErr.message,
      });
      next(serializeErr);
    }
  } catch (err) {
    logger.error('GET /leads/:id failed', {
      leadId: req.params?.id,
      code: err.code,
      meta: err.meta,
      message: err.message,
    });
    next(err);
  }
});

// ─── Get Lead Offer Campaign Assignments ─────────────────────────
router.get('/:id/campaign-offers', async (req, res, next) => {
  try {
    const leadWhere = { id: req.params.id, organizationId: { in: req.orgIds } };
    if (req.isRestrictedRole) leadWhere.assignedToId = req.user.id;
    const lead = await prisma.lead.findFirst({
      where: leadWhere,
      select: { id: true, organizationId: true },
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const assignments = await prisma.leadCampaignAssignment.findMany({
      where: { leadId: lead.id, organizationId: lead.organizationId },
      orderBy: [{ status: 'asc' }, { assignedAt: 'desc' }],
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
            startDate: true,
            endDate: true,
            metadata: true,
          },
        },
        assignedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    res.json(assignments);
  } catch (err) {
    next(err);
  }
});

// ─── Create Lead ─────────────────────────────────────────────────
router.post('/', validate(createLeadSchema), async (req, res, next) => {
  try {
    const data = req.validated;

    // Smart-split unified "name" field into firstName / lastName
    if (data.name && !data.firstName) {
      const parts = data.name.trim().split(/\s+/);
      if (parts.length === 1) {
        data.firstName = parts[0];
        data.lastName = '';
      } else {
        data.lastName = parts.pop();
        data.firstName = parts.join(' ');
      }
    }
    delete data.name;

    // Ensure firstName is present
    if (!data.firstName || data.firstName.trim() === '') {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (data.lastName === undefined || data.lastName === null) data.lastName = '';

    // ─── Dynamic Required Field Validation ─────────────────────────────
    // Check field config for the target division to enforce required fields
    try {
      const targetDivId = (req.isSuperAdmin && data.divisionId) ? data.divisionId : req.orgId;
      const configOrg = await prisma.organization.findUnique({
        where: { id: targetDivId },
        select: { settings: true },
      });
      const settings = configOrg?.settings || {};
      const divKey = `division_${targetDivId}`;
      const fieldConfig = settings.fieldConfig?.[divKey] || settings.fieldConfig?.['default'] || {};

      const missingFields = [];
      // Map of config key to request data key
      const fieldKeyMap = {
        email: 'email', phone: 'phone', company: 'company', jobTitle: 'jobTitle',
        source: 'source', budget: 'budget', productInterest: 'productInterest',
        location: 'location', website: 'website', campaign: 'campaign',
      };
      for (const [configKey, dataKey] of Object.entries(fieldKeyMap)) {
        if (fieldConfig[configKey]?.isRequired) {
          const val = data[dataKey];
          if (val === undefined || val === null || String(val).trim() === '') {
            // Find the label from BUILT_IN_FIELDS or use the key
            const builtIn = BUILT_IN_FIELDS.find(f => f.key === configKey);
            missingFields.push(builtIn?.label || configKey);
          }
        }
      }
      if (missingFields.length > 0) {
        return res.status(400).json({
          error: `Required fields missing: ${missingFields.join(', ')}`,
          missingFields,
        });
      }
    } catch (configErr) {
      // Don't block lead creation if field config check fails
      console.warn('Field config validation warning:', configErr.message);
    }

    // Determine target org: SUPER_ADMIN can target a division.
    // If SUPER_ADMIN doesn't specify a division, fall back to the first child
    // division instead of the GROUP org (which has no pipeline stages).
    let targetOrgId = req.orgId;
    if (req.isSuperAdmin) {
      if (data.divisionId) {
        targetOrgId = data.divisionId;
      } else {
        // Find the first child division under the group
        const firstDivision = await prisma.organization.findFirst({
          where: { parentId: req.user.organizationId, type: 'DIVISION' },
          select: { id: true },
          orderBy: { name: 'asc' },
        });
        if (firstDivision) targetOrgId = firstDivision.id;
      }
    }
    delete data.divisionId;


    // Auto-assign if no assignee specified — uses org's configured allocation method
    if (!data.assignedToId) {
      try {
        const orgSettings = await prisma.organization.findUnique({
          where: { id: targetOrgId },
          select: { settings: true }
        });
        const rules = (orgSettings?.settings)?.allocationRules;
        if (rules?.autoAssignOnCreate !== false) {
          const assigneeId = await getNextAssignee(targetOrgId, data);
          if (assigneeId) data.assignedToId = assigneeId;
        }
      } catch (autoAssignErr) {
        // Non-critical: continue without auto-assignment
      }
    }

    // Duplicate detection
    const duplicates = await detectDuplicates(targetOrgId, {
      email: data.email,
      phone: data.phone,
    });

    if (duplicates.length > 0) {
      return res.status(409).json({
        error: 'Potential duplicate leads found',
        duplicates,
      });
    }

    // Get default stage if not specified
    if (!data.stageId) {
      const defaultStage = await prisma.pipelineStage.findFirst({
        where: { organizationId: targetOrgId, isDefault: true },
      });
      if (defaultStage) data.stageId = defaultStage.id;
    }

    // Calculate lead score
    const score = calculateLeadScore(data);
    const conversionProb = predictConversion(score, 'NEW');

    const { tags: tagNames, ...leadData } = data;

    const lead = await prisma.$transaction(async (tx) => {
      const customData =
        leadData.customData && typeof leadData.customData === 'object'
          ? { ...leadData.customData }
          : {};

      const autoSerialFields = await getApplicableAutoSerialFields(tx, targetOrgId);
      for (const field of autoSerialFields) {
        const existingValue = readNumericCustomValue(customData, field.name);
        if (existingValue !== null) continue;
        customData[field.name] = await getNextAutoSerialValue(tx, targetOrgId, field.name);
      }

      const created = await tx.lead.create({
        data: {
          ...leadData,
          customData: Object.keys(customData).length > 0 ? customData : leadData.customData,
          score,
          conversionProb,
          organizationId: targetOrgId,
          createdById: req.user.id,
        },
        include: {
          assignedTo: { select: { id: true, firstName: true, lastName: true } },
          stage: { select: { id: true, name: true, color: true } },
        },
      });

      // Create tags
      if (tagNames && tagNames.length > 0) {
        for (const name of tagNames) {
          const tag = await tx.tag.upsert({
            where: { organizationId_name: { organizationId: targetOrgId, name } },
            create: { name, organizationId: targetOrgId },
            update: {},
          });
          await tx.leadTag.create({
            data: { leadId: created.id, tagId: tag.id },
          });
        }
      }

      // Create activity
      await tx.leadActivity.create({
        data: {
          leadId: created.id,
          userId: req.user.id,
          type: 'STATUS_CHANGE',
          description: `Lead created with status NEW`,
        },
      });

      return created;
    });

    // Notify assigned user (websocket — existing)
    if (lead.assignedToId && lead.assignedToId !== req.user.id) {
      notifyUser(lead.assignedToId, {
        type: 'lead_assigned',
        lead: { id: lead.id, firstName: lead.firstName, lastName: lead.lastName },
      });
    }

    await createAuditLog({
      userId: req.user.id,
      organizationId: targetOrgId,
      action: 'CREATE',
      entity: 'Lead',
      entityId: lead.id,
      newData: lead,
      req,
    });

    res.status(201).json(lead);

    // ── Fire-and-forget notifications ──
    // Notify assigned user (if different from creator)
    if (lead.assignedToId && lead.assignedToId !== req.user.id) {
      createNotification({
        type: NOTIFICATION_TYPES.LEAD_ASSIGNED,
        title: 'New Lead Assigned',
        message: `${getDisplayName(req.user)} assigned lead ${getDisplayName(lead)} to you`,
        userId: lead.assignedToId,
        actorId: req.user.id,
        entityType: 'lead',
        entityId: lead.id,
        organizationId: targetOrgId,
      }).catch(() => {});
    }

    // Notify org admins about new lead
    notifyOrgAdmins(targetOrgId, {
      type: NOTIFICATION_TYPES.LEAD_CREATED,
      title: 'New Lead Created',
      message: `${getDisplayName(req.user)} created lead ${getDisplayName(lead)}`,
      entityType: 'lead',
      entityId: lead.id,
    }, req.user.id).catch(() => {});

    // Fire automation rules
    executeAutomations('LEAD_CREATED', { organizationId: targetOrgId, lead }).catch(() => {});

    // Broadcast data change to all org users
    broadcastDataChange(targetOrgId, 'lead', 'created', req.user.id, { entityId: lead.id }).catch(() => {});
    refreshLeadAISummaryAsync(lead.id);
  } catch (err) {
    next(err);
  }
});

// ─── Update Lead ─────────────────────────────────────────────────
router.put('/:id', validate(updateLeadSchema), async (req, res, next) => {
  try {
    const updateWhere = { id: req.params.id, organizationId: { in: req.orgIds } };
    if (req.isRestrictedRole) updateWhere.assignedToId = req.user.id;

    const existing = await prisma.lead.findFirst({
      where: updateWhere,
    });
    if (!existing) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const data = req.validated;
    delete data.divisionId; // not applicable for update

    if (Object.prototype.hasOwnProperty.call(data, 'sourceDetail') && (data.sourceDetail === '' || data.sourceDetail === undefined)) {
      data.sourceDetail = null;
    }

    // Smart-split unified "name" field into firstName / lastName
    if (data.name) {
      const parts = data.name.trim().split(/\s+/);
      if (parts.length === 1) {
        data.firstName = parts[0];
        data.lastName = '';
      } else {
        data.lastName = parts.pop();
        data.firstName = parts.join(' ');
      }
      delete data.name;
    }
    if (data.lastName === undefined || data.lastName === null) data.lastName = '';

    const { tags: tagNames, ...updateData } = data;

    // Score will be recalculated AFTER save via rescoreAndPersist
    // so the new pipeline position, status, and profile data are all captured.
    // We skip pre-save scoring to avoid stale pipeline position issues.

    // Handle won/lost timestamps
    if (updateData.status === 'WON' && existing.status !== 'WON') {
      updateData.wonAt = new Date();
      updateData.lostAt = null;  // Clear lost if re-won
    } else if (updateData.status === 'LOST' && existing.status !== 'LOST') {
      updateData.lostAt = new Date();
      updateData.wonAt = null;   // Clear won if lost
    } else if (updateData.status && updateData.status !== 'WON' && updateData.status !== 'LOST') {
      // Moving away from terminal status — clear both dates (deal re-opened)
      if (existing.status === 'WON') updateData.wonAt = null;
      if (existing.status === 'LOST') updateData.lostAt = null;
    }

    // Mark first response — any status change from NEW counts as "responded"
    if (!existing.firstRespondedAt && updateData.status && updateData.status !== 'NEW') {
      updateData.firstRespondedAt = new Date();
      updateData.slaStatus = 'RESPONDED';
    }

    // ── Reverse sync: status change → find matching pipeline stage ──
    if (updateData.status && updateData.status !== existing.status && !updateData.stageId) {
      const [orgStages, org] = await Promise.all([
        prisma.pipelineStage.findMany({
          where: { organizationId: existing.organizationId },
          orderBy: { order: 'asc' },
        }),
        prisma.organization.findUnique({
          where: { id: existing.organizationId },
          select: { settings: true },
        }),
      ]);
      const matchedStage = findStageForStatus({
        targetStatus: updateData.status,
        stages: orgStages,
        settings: org?.settings || {},
        divisionId: existing.organizationId,
      });
      if (matchedStage && matchedStage.id !== existing.stageId) {
        updateData.stageId = matchedStage.id;
      }
    }

    // Handle tag updates if provided
    if (tagNames && Array.isArray(tagNames)) {
      // Remove all existing tags
      await prisma.leadTag.deleteMany({ where: { leadId: existing.id } });
      // Add new tags
      for (const name of tagNames) {
        const tag = await prisma.tag.upsert({
          where: { organizationId_name: { organizationId: existing.organizationId, name: name.trim() } },
          create: { name: name.trim(), organizationId: existing.organizationId },
          update: {},
        });
        await prisma.leadTag.create({ data: { leadId: existing.id, tagId: tag.id } });
      }
    }

    const lead = await prisma.$transaction(async (tx) => {
      const updated = await tx.lead.update({
        where: { id: req.params.id },
        data: updateData,
        include: {
          assignedTo: { select: { id: true, firstName: true, lastName: true } },
          stage: { select: { id: true, name: true, color: true } },
          tags: { include: { tag: true } },
        },
      });

      // Log status change
      if (data.status && data.status !== existing.status) {
        await tx.leadActivity.create({
          data: {
            leadId: existing.id,
            userId: req.user.id,
            type: 'STATUS_CHANGE',
            description: `Status changed from ${existing.status} to ${data.status}`,
          },
        });
      }

      // Log stage change
      if (data.stageId && data.stageId !== existing.stageId) {
        await tx.leadActivity.create({
          data: {
            leadId: existing.id,
            userId: req.user.id,
            type: 'STAGE_CHANGE',
            description: `Pipeline stage changed`,
          },
        });
      }

      // Log assignment change
      if (data.assignedToId && data.assignedToId !== existing.assignedToId) {
        await tx.leadActivity.create({
          data: {
            leadId: existing.id,
            userId: req.user.id,
            type: 'ASSIGNMENT_CHANGED',
            description: `Lead reassigned`,
          },
        });

        notifyUser(data.assignedToId, {
          type: 'lead_assigned',
          lead: { id: updated.id, firstName: updated.firstName, lastName: updated.lastName },
        });
      }

      // Update tags — use the lead's own organizationId for tag scoping
      if (tagNames) {
        await tx.leadTag.deleteMany({ where: { leadId: existing.id } });
        for (const name of tagNames) {
          const tag = await tx.tag.upsert({
            where: { organizationId_name: { organizationId: existing.organizationId, name } },
            create: { name, organizationId: existing.organizationId },
            update: {},
          });
          await tx.leadTag.create({ data: { leadId: existing.id, tagId: tag.id } });
        }
      }

      return updated;
    });

    await createAuditLog({
      userId: req.user.id,
      organizationId: existing.organizationId,
      action: 'UPDATE',
      entity: 'Lead',
      entityId: lead.id,
      oldData: existing,
      newData: lead,
      req,
    });

    res.json(lead);

    // ── Fire-and-forget rescore with SAVED data ──
    // This ensures pipeline position, status, and profile changes
    // are all reflected in the score. Score updates are persisted
    // asynchronously — the response has the lead data, next view
    // shows the accurate score.
    rescoreAndPersist(lead.id).catch(err =>
      logger.error('Post-update rescore failed:', err.message)
    );

    // ── Fire-and-forget notifications ──
    const leadName = getDisplayName(lead);
    const actorName = getDisplayName(req.user);

    // Status changed notification
    if (data.status && data.status !== existing.status) {
      // General status change → notify lead owner
      if (existing.assignedToId && existing.assignedToId !== req.user.id) {
        createNotification({
          type: NOTIFICATION_TYPES.LEAD_STATUS_CHANGED,
          title: 'Lead Status Changed',
          message: `${actorName} changed ${leadName} status to ${data.status}`,
          userId: existing.assignedToId,
          actorId: req.user.id,
          entityType: 'lead',
          entityId: lead.id,
          organizationId: existing.organizationId,
        }).catch(() => {});
      }

      // Won → notify team
      if (data.status === 'WON' && existing.status !== 'WON') {
        notifyTeamMembers(existing.organizationId, {
          type: NOTIFICATION_TYPES.LEAD_WON,
          title: '🎉 Lead Won!',
          message: `${leadName} marked as Won by ${actorName}`,
          entityType: 'lead',
          entityId: lead.id,
        }, req.user.id).catch(() => {});
      }

      // Lost → notify lead owner
      if (data.status === 'LOST' && existing.status !== 'LOST') {
        if (existing.assignedToId && existing.assignedToId !== req.user.id) {
          createNotification({
            type: NOTIFICATION_TYPES.LEAD_LOST,
            title: 'Lead Lost',
            message: `${leadName} marked as Lost`,
            userId: existing.assignedToId,
            actorId: req.user.id,
            entityType: 'lead',
            entityId: lead.id,
            organizationId: existing.organizationId,
          }).catch(() => {});
        }
      }
    }

    // Assignment changed → notify new assignee
    if (data.assignedToId && data.assignedToId !== existing.assignedToId) {
      createNotification({
        type: NOTIFICATION_TYPES.LEAD_ASSIGNED,
        title: 'Lead Assigned to You',
        message: `${actorName} assigned ${leadName} to you`,
        userId: data.assignedToId,
        actorId: req.user.id,
        entityType: 'lead',
        entityId: lead.id,
        organizationId: existing.organizationId,
      }).catch(() => {});
    }

    // Score changed significantly (>10 points) → notify lead owner
    if (existing.score !== null && updateData.score !== undefined) {
      const scoreDiff = Math.abs((updateData.score || 0) - (existing.score || 0));
      if (scoreDiff > 10 && existing.assignedToId) {
        createNotification({
          type: NOTIFICATION_TYPES.LEAD_SCORE_CHANGED,
          title: 'Lead Score Updated',
          message: `${leadName} score updated to ${updateData.score}`,
          userId: existing.assignedToId,
          actorId: req.user.id,
          entityType: 'lead',
          entityId: lead.id,
          organizationId: existing.organizationId,
        }).catch(() => {});
      }
    }

    // ── Fire automation rules ──
    const autoCtx = { organizationId: existing.organizationId, lead, previousData: existing };
    if (data.status && data.status !== existing.status) {
      executeAutomations('LEAD_STATUS_CHANGED', autoCtx).catch(() => {});
    }
    if (data.assignedToId && data.assignedToId !== existing.assignedToId) {
      executeAutomations('LEAD_ASSIGNED', autoCtx).catch(() => {});
    }
    if (updateData.score !== undefined && updateData.score !== existing.score) {
      executeAutomations('LEAD_SCORE_CHANGED', autoCtx).catch(() => {});
    }

    // Broadcast data change to all org users
    broadcastDataChange(existing.organizationId, 'lead', 'updated', req.user.id, { entityId: lead.id }).catch(() => {});
    refreshLeadAISummaryAsync(lead.id);
  } catch (err) {
    next(err);
  }
});

// ─── Delete (Archive) Lead ───────────────────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    const deleteWhere = { id: req.params.id, organizationId: { in: req.orgIds } };
    if (req.isRestrictedRole) deleteWhere.assignedToId = req.user.id;

    const lead = await prisma.lead.findFirst({
      where: deleteWhere,
    });
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    await prisma.lead.update({
      where: { id: req.params.id },
      data: { isArchived: true },
    });

    await upsertRecycleBinItem({
      entityType: 'LEAD',
      entityId: lead.id,
      entityLabel: getDisplayName(lead),
      organizationId: lead.organizationId,
      deletedById: req.user.id,
      recordOwnerId: lead.assignedToId || null,
      recordCreatorId: lead.createdById || null,
      metadata: {
        status: lead.status,
        source: lead.source,
      },
      snapshot: {
        firstName: lead.firstName,
        lastName: lead.lastName,
        email: lead.email,
        phone: lead.phone,
        company: lead.company,
        assignedToId: lead.assignedToId,
        createdById: lead.createdById,
      },
    });

    await createAuditLog({
      userId: req.user.id,
      organizationId: lead.organizationId,
      action: 'ARCHIVE',
      entity: 'Lead',
      entityId: req.params.id,
      req,
    });

    res.json({ message: 'Lead moved to recycle bin' });

    broadcastDataChange(lead.organizationId, 'lead', 'deleted', req.user.id, { entityId: req.params.id }).catch(() => {});
  } catch (err) {
    next(err);
  }
});

// ─── Add Note (JSON or multipart with optional `files`) ───────────
router.post('/:id/notes', optionalLeadNoteMultipart, async (req, res, next) => {
  try {
    const files = req.files || [];
    const isMultipart = String(req.headers['content-type'] || '').includes('multipart/form-data');

    let content;
    let isPinned = false;
    if (isMultipart) {
      content = req.body?.content != null ? String(req.body.content) : '';
      const pin = req.body?.isPinned;
      isPinned = pin === true || pin === 'true' || pin === '1';
    } else {
      const parsed = z.object({
        content: z.string().min(1),
        isPinned: z.boolean().optional(),
      }).safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation error',
          details: parsed.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
        });
      }
      content = parsed.data.content;
      isPinned = parsed.data.isPinned || false;
    }

    const contentTrim = String(content || '').trim();
    if (!contentTrim && files.length === 0) {
      return res.status(400).json({ error: 'Add note text or at least one attachment' });
    }

    const contentToSave = contentTrim || '(Attachment)';

    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const note = await prisma.leadNote.create({
      data: {
        content: contentToSave,
        isPinned,
        leadId: lead.id,
        userId: req.user.id,
      },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });

    const useS3 = isAttachmentObjectStorageEnabled();
    const orgId = lead.organizationId;

    for (const f of files) {
      const base64 = `data:${f.mimetype};base64,${f.buffer.toString('base64')}`;
      const record = await prisma.attachment.create({
        data: {
          leadId: lead.id,
          leadNoteId: note.id,
          filename: f.originalname,
          mimeType: f.mimetype,
          size: f.size,
          url: '',
          data: useS3 ? null : base64,
          storageKey: null,
        },
      });
      const url = `/inbox/attachments/file/${record.id}`;
      let storageKey = null;
      if (useS3) {
        try {
          storageKey = await uploadInboxAttachmentBuffer({
            buffer: f.buffer,
            mimeType: f.mimetype,
            organizationId: orgId,
            leadId: lead.id,
            attachmentId: record.id,
            filename: f.originalname,
          });
        } catch (s3Err) {
          logger.error('Note attachment S3 upload failed; using database blob', { err: s3Err.message });
          await prisma.attachment.update({
            where: { id: record.id },
            data: { data: base64 },
          });
        }
      }
      await prisma.attachment.update({
        where: { id: record.id },
        data: storageKey ? { url, storageKey } : { url },
      });
    }

    const noteWithAttachments = await prisma.leadNote.findUnique({
      where: { id: note.id },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
        attachments: {
          select: { id: true, filename: true, mimeType: true, size: true, url: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    const activityDescription =
      files.length > 0 ? `Note added (${files.length} attachment${files.length > 1 ? 's' : ''})` : 'Note added';

    await prisma.leadActivity.create({
      data: {
        leadId: lead.id,
        userId: req.user.id,
        type: 'NOTE_ADDED',
        description: activityDescription,
      },
    });

    if (!lead.firstRespondedAt) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { firstRespondedAt: new Date(), slaStatus: 'RESPONDED' },
      });
    }

    res.status(201).json(noteWithAttachments);

    broadcastDataChange(lead.organizationId, 'note', 'created', req.user.id, { entityId: lead.id }).catch(() => {});
    refreshLeadAISummaryAsync(lead.id);
  } catch (err) {
    next(err);
  }
});

// ─── Bulk Update Leads ───────────────────────────────────────────

// ---------------------------------------------------------------------------
// POST /:id/reassign — Reassign a lead to a different team member
// ---------------------------------------------------------------------------

router.post('/:id/reassign', validate(z.object({
  assignedToId: z.string().refine(v => v === '__auto__' || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v), { message: 'Must be a valid UUID or __auto__' }),
  reason: z.string().max(500).optional(),
})), async (req, res, next) => {
  try {
    let { assignedToId, reason } = req.validated;
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
      include: { assignedTo: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    // Handle auto-assign: find best user via org's configured allocation rules
    if (assignedToId === '__auto__') {
      // Try lead's own org first
      let autoId = await getNextAssignee(lead.organizationId, lead);
      // If no users in lead's org, try other orgs in scope
      if (!autoId && req.orgIds.length > 1) {
        for (const altOrgId of req.orgIds) {
          if (altOrgId === lead.organizationId) continue;
          autoId = await getNextAssignee(altOrgId, lead);
          if (autoId) break;
        }
      }
      if (!autoId) {
        return res.status(400).json({ error: 'No eligible team members found for auto-assignment' });
      }
      assignedToId = autoId;
    }

    const previousAssignee = lead.assignedTo;

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.lead.update({
        where: { id: req.params.id },
        data: { assignedToId },
        include: {
          assignedTo: { select: { id: true, firstName: true, lastName: true, avatar: true } },
          stage: { select: { id: true, name: true, color: true } },
        },
      });

      const prevName = previousAssignee ? getDisplayName(previousAssignee) : 'Unassigned';
      const newName = getDisplayName(result.assignedTo);

      await tx.leadActivity.create({
        data: {
          leadId: lead.id,
          userId: req.user.id,
          type: 'ASSIGNMENT_CHANGED',
          description: reason
            ? `Reassigned from ${prevName} to ${newName}. Reason: ${reason}`
            : `Reassigned from ${prevName} to ${newName}`,
          metadata: {
            previousAssigneeId: previousAssignee?.id || null,
            newAssigneeId: assignedToId,
            reason: reason || null,
          },
        },
      });

      return result;
    });

    // Notify new assignee
    if (assignedToId !== req.user.id) {
      notifyUser(assignedToId, {
        type: 'lead_assigned',
        lead: { id: updated.id, firstName: updated.firstName, lastName: updated.lastName },
      });
      createNotification({
        type: NOTIFICATION_TYPES.LEAD_ASSIGNED,
        title: 'Lead Reassigned to You',
        message: `${getDisplayName(req.user)} reassigned ${getDisplayName(updated)} to you${reason ? '. Reason: ' + reason : ''}`,
        userId: assignedToId,
        actorId: req.user.id,
        entityType: 'lead',
        entityId: updated.id,
        organizationId: lead.organizationId,
      }).catch(() => {});
    }

    // Notify previous assignee
    if (previousAssignee && previousAssignee.id !== req.user.id && previousAssignee.id !== assignedToId) {
      createNotification({
        type: NOTIFICATION_TYPES.LEAD_ASSIGNED,
        title: 'Lead Reassigned',
        message: `${getDisplayName(req.user)} reassigned ${getDisplayName(updated)} to another team member${reason ? '. Reason: ' + reason : ''}`,
        userId: previousAssignee.id,
        actorId: req.user.id,
        entityType: 'lead',
        entityId: updated.id,
        organizationId: lead.organizationId,
      }).catch(() => {});
    }

    await createAuditLog({
      userId: req.user.id,
      organizationId: lead.organizationId,
      action: 'REASSIGN',
      entity: 'Lead',
      entityId: lead.id,
      oldData: { assignedToId: previousAssignee?.id },
      newData: { assignedToId, reason },
      req,
    });

    res.json(updated);

    broadcastDataChange(lead.organizationId, 'lead', 'updated', req.user.id, { entityId: updated.id }).catch(() => {});
    refreshLeadAISummaryAsync(updated.id);
  } catch (err) { next(err); }
});

router.patch('/bulk', validate(z.object({
  leadIds: z.array(z.string().uuid()).min(1).max(100),
  data: updateLeadSchema,
})), async (req, res, next) => {
  try {
    const { leadIds, data } = req.validated;
    delete data.divisionId;

    await prisma.lead.updateMany({
      where: { id: { in: leadIds }, organizationId: { in: req.orgIds } },
      data,
    });

    res.json({ message: `${leadIds.length} leads updated` });

    // ── Fire-and-forget notification ──
    notifyOrgAdmins(req.user.organizationId, {
      type: NOTIFICATION_TYPES.LEAD_STATUS_CHANGED,
      title: 'Bulk Lead Update',
      message: `${getDisplayName(req.user)} updated ${leadIds.length} leads`,
      entityType: 'lead',
      entityId: null,
    }, req.user.id).catch(() => {});

    broadcastDataChange(req.user.organizationId, 'lead', 'bulk_updated', req.user.id).catch(() => {});
    leadIds.forEach((leadId) => refreshLeadAISummaryAsync(leadId));
  } catch (err) {
    next(err);
  }
});

// ─── Block Lead (Do Not Call) ────────────────────────────────────
router.post('/:id/block', async (req, res, next) => {
  try {
    if (!['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        doNotCall: true,
        doNotCallAt: new Date(),
        doNotCallById: req.user.id,
      },
    });

    await prisma.leadActivity.create({
      data: {
        leadId: lead.id,
        userId: req.user.id,
        type: 'STATUS_CHANGE',
        description: `Lead manually blocked (Do Not Call) by ${getDisplayName(req.user)}`,
        metadata: { trigger: 'manual_block' },
      },
    });

    res.json({ success: true, message: 'Lead blocked — removed from active outreach' });
    refreshLeadAISummaryAsync(lead.id);
  } catch (err) {
    next(err);
  }
});

// ─── Unblock Lead (Remove Do Not Call) ───────────────────────────
router.post('/:id/unblock', async (req, res, next) => {
  try {
    if (!['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (!lead.doNotCall) return res.status(400).json({ error: 'Lead is not blocked' });

    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        doNotCall: false,
        doNotCallAt: null,
        doNotCallById: null,
      },
    });

    await prisma.leadActivity.create({
      data: {
        leadId: lead.id,
        userId: req.user.id,
        type: 'STATUS_CHANGE',
        description: `Lead unblocked by ${getDisplayName(req.user)} — restored to active outreach`,
        metadata: { trigger: 'manual_unblock' },
      },
    });

    res.json({ success: true, message: 'Lead unblocked — restored to active leads' });
    refreshLeadAISummaryAsync(lead.id);
  } catch (err) {
    next(err);
  }
});

// ─── WhatsApp Opt-Out ───────────────────────────────────────────
router.post('/:id/whatsapp-opt-out', async (req, res, next) => {
  try {
    if (!['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (lead.whatsappOptOut) return res.json({ success: true, message: 'Lead is already opted out of WhatsApp broadcasts' });

    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        whatsappOptOut: true,
        whatsappOptOutAt: new Date(),
        whatsappOptOutById: req.user.id,
      },
    });

    await prisma.leadActivity.create({
      data: {
        leadId: lead.id,
        userId: req.user.id,
        type: 'STATUS_CHANGE',
        description: `Lead opted out of WhatsApp broadcasts by ${getDisplayName(req.user)}`,
        metadata: { trigger: 'whatsapp_opt_out' },
      },
    });

    res.json({ success: true, message: 'Lead opted out of WhatsApp broadcasts' });
  } catch (err) {
    next(err);
  }
});

// ─── WhatsApp Opt-In ────────────────────────────────────────────
router.post('/:id/whatsapp-opt-in', async (req, res, next) => {
  try {
    if (!['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (!lead.whatsappOptOut) return res.json({ success: true, message: 'Lead is already opted in to WhatsApp broadcasts' });

    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        whatsappOptOut: false,
        whatsappOptOutAt: null,
        whatsappOptOutById: null,
      },
    });

    await prisma.leadActivity.create({
      data: {
        leadId: lead.id,
        userId: req.user.id,
        type: 'STATUS_CHANGE',
        description: `Lead opted back in to WhatsApp broadcasts by ${getDisplayName(req.user)}`,
        metadata: { trigger: 'whatsapp_opt_in' },
      },
    });

    res.json({ success: true, message: 'Lead opted back in to WhatsApp broadcasts' });
  } catch (err) {
    next(err);
  }
});

// ─── Rescore a single lead (GET score breakdown) ─────────────────
router.get('/:id/score', async (req, res, next) => {
  try {
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
      select: { id: true },
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const result = await calculateFullScore(lead.id);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// ─── Rescore a single lead and persist ──────────────────────────
router.post('/:id/rescore', async (req, res, next) => {
  try {
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
      select: { id: true, score: true },
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const result = await rescoreAndPersist(lead.id);
    res.json({
      success: true,
      data: {
        previousScore: lead.score,
        newScore: result.score,
        conversionProb: result.conversionProb,
        breakdown: result.breakdown,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── Bulk rescore all leads in org ──────────────────────────────
router.post('/bulk/rescore', async (req, res, next) => {
  try {
    const leads = await prisma.lead.findMany({
      where: { organizationId: { in: req.orgIds } },
      select: { id: true },
    });

    let scored = 0;
    let errors = 0;
    for (const lead of leads) {
      try {
        await rescoreAndPersist(lead.id);
        scored++;
      } catch {
        errors++;
      }
    }

    res.json({
      success: true,
      data: { total: leads.length, scored, errors },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
