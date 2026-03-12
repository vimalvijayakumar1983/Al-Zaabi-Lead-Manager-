const { Router } = require('express');
const multer = require('multer');
const { parse } = require('csv-parse');
const XLSX = require('xlsx');
const { Readable } = require('stream');
const { prisma } = require('../config/database');
const { authenticate, authorize, orgScope } = require('../middleware/auth');
const { calculateLeadScore, predictConversion } = require('../utils/leadScoring');

const router = Router();
router.use(authenticate, orgScope);

const upload = multer({ limits: { fileSize: 25 * 1024 * 1024 } }); // 25MB

// ─── Lead field definitions for mapping ─────────────────────────
const LEAD_FIELDS = [
  { key: 'firstName', label: 'First Name', required: true, type: 'string' },
  { key: 'lastName', label: 'Last Name', required: true, type: 'string' },
  { key: 'email', label: 'Email', required: false, type: 'email' },
  { key: 'phone', label: 'Phone', required: false, type: 'string' },
  { key: 'company', label: 'Company', required: false, type: 'string' },
  { key: 'jobTitle', label: 'Job Title', required: false, type: 'string' },
  { key: 'source', label: 'Lead Source', required: false, type: 'enum', options: ['WEBSITE_FORM','LANDING_PAGE','WHATSAPP','FACEBOOK_ADS','GOOGLE_ADS','MANUAL','CSV_IMPORT','API','REFERRAL','EMAIL','PHONE','OTHER'] },
  { key: 'status', label: 'Status', required: false, type: 'enum', options: ['NEW','CONTACTED','QUALIFIED','PROPOSAL_SENT','NEGOTIATION','WON','LOST'] },
  { key: 'budget', label: 'Budget', required: false, type: 'number' },
  { key: 'productInterest', label: 'Product Interest', required: false, type: 'string' },
  { key: 'location', label: 'Location', required: false, type: 'string' },
  { key: 'campaign', label: 'Campaign', required: false, type: 'string' },
  { key: 'website', label: 'Website', required: false, type: 'string' },
  { key: 'tags', label: 'Tags (comma separated)', required: false, type: 'tags' },
];

const CAMPAIGN_FIELDS = [
  { key: 'name', label: 'Campaign Name', required: true, type: 'string' },
  { key: 'type', label: 'Type', required: true, type: 'enum', options: ['FACEBOOK_ADS','GOOGLE_ADS','EMAIL','WHATSAPP','LANDING_PAGE','REFERRAL','OTHER'] },
  { key: 'status', label: 'Status', required: false, type: 'enum', options: ['DRAFT','ACTIVE','PAUSED','COMPLETED'] },
  { key: 'budget', label: 'Budget', required: false, type: 'number' },
  { key: 'startDate', label: 'Start Date', required: false, type: 'date' },
  { key: 'endDate', label: 'End Date', required: false, type: 'date' },
];

const MODULE_FIELDS = {
  leads: LEAD_FIELDS,
  campaigns: CAMPAIGN_FIELDS,
};

// ─── Helper: Parse file to rows ─────────────────────────────────
async function parseFileToRows(file) {
  const ext = (file.originalname || '').toLowerCase();

  if (ext.endsWith('.csv') || ext.endsWith('.tsv')) {
    return new Promise((resolve, reject) => {
      const rows = [];
      const delimiter = ext.endsWith('.tsv') ? '\t' : ',';
      const stream = Readable.from(file.buffer).pipe(
        parse({ columns: true, skip_empty_lines: true, trim: true, delimiter, relax_column_count: true })
      );
      stream.on('data', (row) => rows.push(row));
      stream.on('end', () => resolve(rows));
      stream.on('error', reject);
    });
  }

  if (ext.endsWith('.xlsx') || ext.endsWith('.xls')) {
    const workbook = XLSX.read(file.buffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    return rows;
  }

  throw new Error('Unsupported file format. Please upload CSV, TSV, XLS, or XLSX.');
}

// ─── Helper: Auto-detect field mapping ──────────────────────────
function autoDetectMapping(csvColumns, moduleFields) {
  const mapping = {};
  const aliases = {
    firstName: ['firstname', 'first_name', 'first name', 'fname', 'given name'],
    lastName: ['lastname', 'last_name', 'last name', 'lname', 'surname', 'family name'],
    email: ['email', 'email address', 'e-mail', 'emailaddress'],
    phone: ['phone', 'phone number', 'telephone', 'mobile', 'cell', 'tel', 'contact number'],
    company: ['company', 'company name', 'organization', 'org', 'business'],
    jobTitle: ['job title', 'jobtitle', 'title', 'position', 'designation', 'role'],
    source: ['source', 'lead source', 'leadsource', 'channel', 'origin'],
    status: ['status', 'lead status', 'leadstatus', 'state'],
    budget: ['budget', 'amount', 'value', 'deal value', 'revenue', 'expected revenue'],
    productInterest: ['product', 'product interest', 'productinterest', 'interest', 'product name'],
    location: ['location', 'city', 'address', 'region', 'area', 'country', 'state'],
    campaign: ['campaign', 'campaign name', 'campaignname', 'utm_campaign'],
    website: ['website', 'url', 'web', 'site', 'homepage'],
    tags: ['tags', 'tag', 'labels', 'label', 'categories', 'category'],
    name: ['name', 'campaign name', 'campaignname'],
    type: ['type', 'campaign type', 'campaigntype'],
    startDate: ['start date', 'startdate', 'start', 'begin date'],
    endDate: ['end date', 'enddate', 'end', 'finish date'],
  };

  for (const col of csvColumns) {
    const normalized = col.toLowerCase().trim();
    for (const field of moduleFields) {
      const fieldAliases = aliases[field.key] || [field.key.toLowerCase()];
      if (fieldAliases.includes(normalized) || normalized === field.key.toLowerCase()) {
        mapping[col] = field.key;
        break;
      }
    }
  }

  return mapping;
}

// ─── 1. GET module field definitions ────────────────────────────
router.get('/fields/:module', (req, res) => {
  const fields = MODULE_FIELDS[req.params.module];
  if (!fields) {
    return res.status(400).json({ error: `Unknown module: ${req.params.module}. Supported: ${Object.keys(MODULE_FIELDS).join(', ')}` });
  }
  res.json({ module: req.params.module, fields });
});

// ─── 2. Upload & preview (Step 1 of wizard) ────────────────────
router.post('/preview', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'File is required' });
    }

    const module = req.body.module || 'leads';
    const fields = MODULE_FIELDS[module];
    if (!fields) {
      return res.status(400).json({ error: `Unknown module: ${module}` });
    }

    const rows = await parseFileToRows(req.file);
    if (rows.length === 0) {
      return res.status(400).json({ error: 'File contains no data rows' });
    }

    const csvColumns = Object.keys(rows[0]);
    const suggestedMapping = autoDetectMapping(csvColumns, fields);

    // Return preview data
    res.json({
      fileName: req.file.originalname,
      fileSize: req.file.size,
      totalRows: rows.length,
      columns: csvColumns,
      sampleData: rows.slice(0, 5), // First 5 rows for preview
      suggestedMapping,
      moduleFields: fields,
    });
  } catch (err) {
    next(err);
  }
});

// ─── 3. Execute import (Step 2 after mapping confirmed) ─────────
router.post('/execute', authorize('ADMIN', 'MANAGER'), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'File is required' });
    }

    const { module = 'leads', fieldMapping: mappingStr, duplicateAction = 'skip', duplicateField, assignToId, defaultStatus, defaultSource } = req.body;
    const fieldMapping = typeof mappingStr === 'string' ? JSON.parse(mappingStr) : (mappingStr || {});
    const fields = MODULE_FIELDS[module];

    if (!fields) {
      return res.status(400).json({ error: `Unknown module: ${module}` });
    }

    const rows = await parseFileToRows(req.file);
    if (rows.length === 0) {
      return res.status(400).json({ error: 'No data rows to import' });
    }

    // Create import history record
    const importRecord = await prisma.importHistory.create({
      data: {
        module,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        totalRows: rows.length,
        fieldMapping,
        duplicateAction,
        duplicateField: duplicateField || null,
        organizationId: req.orgId,
        userId: req.user.id,
        status: 'PROCESSING',
      },
    });

    // Process import
    const errors = [];
    const importedIds = [];
    let imported = 0;
    let skipped = 0;
    let updated = 0;
    let duplicates = 0;

    if (module === 'leads') {
      const defaultStage = await prisma.pipelineStage.findFirst({
        where: { organizationId: req.orgId, isDefault: true },
      });

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          // Apply field mapping
          const mapped = {};
          for (const [csvCol, crmField] of Object.entries(fieldMapping)) {
            if (crmField && row[csvCol] !== undefined && row[csvCol] !== '') {
              mapped[crmField] = row[csvCol];
            }
          }

          // Validation: required fields
          if (!mapped.firstName || !mapped.lastName) {
            errors.push({ row: i + 2, error: 'Missing required field: firstName or lastName', data: row });
            skipped++;
            continue;
          }

          // Type coercion
          if (mapped.budget) mapped.budget = parseFloat(mapped.budget) || null;
          if (mapped.source && !LEAD_FIELDS.find(f => f.key === 'source').options.includes(mapped.source.toUpperCase())) {
            mapped.source = defaultSource || 'CSV_IMPORT';
          } else if (mapped.source) {
            mapped.source = mapped.source.toUpperCase();
          }
          if (mapped.status && !LEAD_FIELDS.find(f => f.key === 'status').options.includes(mapped.status.toUpperCase())) {
            delete mapped.status;
          } else if (mapped.status) {
            mapped.status = mapped.status.toUpperCase();
          }

          // Email validation
          if (mapped.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mapped.email)) {
            errors.push({ row: i + 2, error: `Invalid email: ${mapped.email}`, data: row });
            skipped++;
            continue;
          }

          // Handle tags
          let tagNames = [];
          if (mapped.tags) {
            tagNames = mapped.tags.split(',').map(t => t.trim()).filter(Boolean);
            delete mapped.tags;
          }

          // Duplicate detection
          let existingLead = null;
          if (duplicateField && mapped[duplicateField]) {
            existingLead = await prisma.lead.findFirst({
              where: {
                organizationId: req.orgId,
                [duplicateField]: mapped[duplicateField],
                isArchived: false,
              },
            });
          }

          if (existingLead) {
            duplicates++;
            if (duplicateAction === 'skip') {
              skipped++;
              continue;
            } else if (duplicateAction === 'overwrite') {
              // Update existing record
              const updateData = { ...mapped };
              delete updateData.firstName; // Only update non-key fields if desired, keep name
              // Actually overwrite everything
              await prisma.lead.update({
                where: { id: existingLead.id },
                data: { ...mapped, updatedAt: new Date() },
              });
              importedIds.push(existingLead.id);
              updated++;
              continue;
            }
            // duplicateAction === 'clone': fall through to create new
          }

          // Build lead data
          const leadData = {
            firstName: mapped.firstName,
            lastName: mapped.lastName,
            email: mapped.email || null,
            phone: mapped.phone || null,
            company: mapped.company || null,
            jobTitle: mapped.jobTitle || null,
            source: mapped.source || defaultSource || 'CSV_IMPORT',
            status: mapped.status || defaultStatus || 'NEW',
            budget: mapped.budget || null,
            productInterest: mapped.productInterest || null,
            location: mapped.location || null,
            campaign: mapped.campaign || null,
            website: mapped.website || null,
            organizationId: req.orgId,
            createdById: req.user.id,
            assignedToId: assignToId || null,
            stageId: defaultStage?.id || null,
          };

          leadData.score = calculateLeadScore(leadData);
          leadData.conversionProb = predictConversion(leadData.score, leadData.status);

          const lead = await prisma.lead.create({ data: leadData });
          importedIds.push(lead.id);

          // Handle tags
          if (tagNames.length > 0) {
            for (const tagName of tagNames) {
              let tag = await prisma.tag.findFirst({
                where: { organizationId: req.orgId, name: tagName },
              });
              if (!tag) {
                tag = await prisma.tag.create({
                  data: { name: tagName, organizationId: req.orgId },
                });
              }
              await prisma.leadTag.create({
                data: { leadId: lead.id, tagId: tag.id },
              }).catch(() => {}); // ignore duplicate
            }
          }

          imported++;
        } catch (err) {
          errors.push({ row: i + 2, error: err.message, data: row });
          skipped++;
        }
      }
    } else if (module === 'campaigns') {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          const mapped = {};
          for (const [csvCol, crmField] of Object.entries(fieldMapping)) {
            if (crmField && row[csvCol] !== undefined && row[csvCol] !== '') {
              mapped[crmField] = row[csvCol];
            }
          }

          if (!mapped.name) {
            errors.push({ row: i + 2, error: 'Missing required field: name', data: row });
            skipped++;
            continue;
          }

          if (!mapped.type || !CAMPAIGN_FIELDS.find(f => f.key === 'type').options.includes(mapped.type.toUpperCase())) {
            mapped.type = 'OTHER';
          } else {
            mapped.type = mapped.type.toUpperCase();
          }

          if (mapped.status) mapped.status = mapped.status.toUpperCase();
          if (mapped.budget) mapped.budget = parseFloat(mapped.budget) || null;
          if (mapped.startDate) mapped.startDate = new Date(mapped.startDate);
          if (mapped.endDate) mapped.endDate = new Date(mapped.endDate);

          // Duplicate check by name
          if (duplicateAction === 'skip') {
            const existing = await prisma.campaign.findFirst({
              where: { organizationId: req.orgId, name: mapped.name },
            });
            if (existing) {
              duplicates++;
              skipped++;
              continue;
            }
          }

          const campaign = await prisma.campaign.create({
            data: {
              name: mapped.name,
              type: mapped.type,
              status: mapped.status || 'DRAFT',
              budget: mapped.budget || null,
              startDate: mapped.startDate || null,
              endDate: mapped.endDate || null,
              organizationId: req.orgId,
            },
          });
          importedIds.push(campaign.id);
          imported++;
        } catch (err) {
          errors.push({ row: i + 2, error: err.message, data: row });
          skipped++;
        }
      }
    }

    // Update import history
    await prisma.importHistory.update({
      where: { id: importRecord.id },
      data: {
        importedCount: imported,
        skippedCount: skipped,
        updatedCount: updated,
        duplicateCount: duplicates,
        status: 'COMPLETED',
        errors: errors.slice(0, 100),
        importedIds,
        completedAt: new Date(),
      },
    });

    res.json({
      importId: importRecord.id,
      message: `Import complete: ${imported} imported, ${updated} updated, ${skipped} skipped, ${duplicates} duplicates found`,
      imported,
      updated,
      skipped,
      duplicates,
      totalRows: rows.length,
      errors: errors.slice(0, 50),
    });
  } catch (err) {
    next(err);
  }
});

// ─── 4. Import History ──────────────────────────────────────────
router.get('/history', async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [history, total] = await Promise.all([
      prisma.importHistory.findMany({
        where: { organizationId: req.orgId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
      prisma.importHistory.count({ where: { organizationId: req.orgId } }),
    ]);

    res.json({
      data: history,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── 5. Get single import details ───────────────────────────────
router.get('/history/:id', async (req, res, next) => {
  try {
    const record = await prisma.importHistory.findFirst({
      where: { id: req.params.id, organizationId: req.orgId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    if (!record) {
      return res.status(404).json({ error: 'Import record not found' });
    }

    res.json(record);
  } catch (err) {
    next(err);
  }
});

// ─── 6. Undo import ─────────────────────────────────────────────
router.post('/undo/:id', authorize('ADMIN'), async (req, res, next) => {
  try {
    const record = await prisma.importHistory.findFirst({
      where: { id: req.params.id, organizationId: req.orgId },
    });

    if (!record) {
      return res.status(404).json({ error: 'Import record not found' });
    }

    if (record.status === 'UNDONE') {
      return res.status(400).json({ error: 'This import has already been undone' });
    }

    if (record.undoneAt) {
      return res.status(400).json({ error: 'This import has already been undone' });
    }

    const ids = record.importedIds || [];
    if (ids.length === 0) {
      return res.status(400).json({ error: 'No records to undo' });
    }

    let deleted = 0;

    if (record.module === 'leads') {
      // Soft delete (archive) imported leads
      const result = await prisma.lead.updateMany({
        where: {
          id: { in: ids },
          organizationId: req.orgId,
        },
        data: { isArchived: true },
      });
      deleted = result.count;
    } else if (record.module === 'campaigns') {
      const result = await prisma.campaign.deleteMany({
        where: {
          id: { in: ids },
          organizationId: req.orgId,
        },
      });
      deleted = result.count;
    }

    await prisma.importHistory.update({
      where: { id: record.id },
      data: { status: 'UNDONE', undoneAt: new Date() },
    });

    res.json({
      message: `Undo complete: ${deleted} records removed/archived`,
      deleted,
    });
  } catch (err) {
    next(err);
  }
});

// ─── 7. Download sample template ────────────────────────────────
router.get('/template/:module', (req, res) => {
  const fields = MODULE_FIELDS[req.params.module];
  if (!fields) {
    return res.status(400).json({ error: `Unknown module: ${req.params.module}` });
  }

  const headers = fields.map(f => f.label);
  const sampleRow = fields.map(f => {
    if (f.key === 'firstName') return 'John';
    if (f.key === 'lastName') return 'Doe';
    if (f.key === 'email') return 'john.doe@example.com';
    if (f.key === 'phone') return '+971501234567';
    if (f.key === 'company') return 'Acme Corp';
    if (f.key === 'jobTitle') return 'Sales Manager';
    if (f.key === 'source') return 'MANUAL';
    if (f.key === 'status') return 'NEW';
    if (f.key === 'budget') return '50000';
    if (f.key === 'productInterest') return 'Enterprise Plan';
    if (f.key === 'location') return 'Dubai, UAE';
    if (f.key === 'campaign') return 'Q1 Campaign';
    if (f.key === 'website') return 'https://example.com';
    if (f.key === 'tags') return 'hot-lead, enterprise';
    if (f.key === 'name') return 'Summer Campaign 2025';
    if (f.key === 'type') return 'EMAIL';
    if (f.key === 'startDate') return '2025-06-01';
    if (f.key === 'endDate') return '2025-08-31';
    return '';
  });

  const csv = [headers.join(','), sampleRow.join(',')].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=${req.params.module}-import-template.csv`);
  res.send(csv);
});

// ─── 8. Validate data (dry run) ────────────────────────────────
router.post('/validate', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'File is required' });
    }

    const { module = 'leads', fieldMapping: mappingStr, duplicateField } = req.body;
    const fieldMapping = typeof mappingStr === 'string' ? JSON.parse(mappingStr) : (mappingStr || {});
    const fields = MODULE_FIELDS[module];

    if (!fields) {
      return res.status(400).json({ error: `Unknown module: ${module}` });
    }

    const rows = await parseFileToRows(req.file);
    const errors = [];
    const warnings = [];
    let validCount = 0;
    let duplicateCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const mapped = {};
      for (const [csvCol, crmField] of Object.entries(fieldMapping)) {
        if (crmField && row[csvCol] !== undefined && row[csvCol] !== '') {
          mapped[crmField] = row[csvCol];
        }
      }

      // Check required fields
      const requiredFields = fields.filter(f => f.required);
      const missingRequired = requiredFields.filter(f => !mapped[f.key]);
      if (missingRequired.length > 0) {
        errors.push({
          row: i + 2,
          type: 'missing_required',
          message: `Missing required: ${missingRequired.map(f => f.label).join(', ')}`,
        });
        continue;
      }

      // Check email format
      if (mapped.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mapped.email)) {
        errors.push({ row: i + 2, type: 'invalid_email', message: `Invalid email: ${mapped.email}` });
        continue;
      }

      // Check for duplicates in DB
      if (duplicateField && mapped[duplicateField]) {
        const existing = await prisma.lead.findFirst({
          where: { organizationId: req.orgId, [duplicateField]: mapped[duplicateField], isArchived: false },
        });
        if (existing) {
          duplicateCount++;
          warnings.push({ row: i + 2, type: 'duplicate', message: `Duplicate ${duplicateField}: ${mapped[duplicateField]}` });
        }
      }

      validCount++;
    }

    res.json({
      totalRows: rows.length,
      validCount,
      errorCount: errors.length,
      duplicateCount,
      errors: errors.slice(0, 50),
      warnings: warnings.slice(0, 50),
    });
  } catch (err) {
    next(err);
  }
});

// ─── 9. Export data as CSV ───────────────────────────────────────
router.get('/export/:module', authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { module } = req.params;
    const { status, source, assignedToId, search } = req.query;

    if (module === 'leads') {
      const where = { organizationId: req.orgId, isArchived: false };
      if (status) where.status = status;
      if (source) where.source = source;
      if (assignedToId) where.assignedToId = assignedToId;
      if (search) {
        where.OR = [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { company: { contains: search, mode: 'insensitive' } },
        ];
      }

      const leads = await prisma.lead.findMany({
        where,
        include: {
          assignedTo: { select: { firstName: true, lastName: true, email: true } },
          stage: { select: { name: true } },
          tags: { include: { tag: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 50000,
      });

      const headers = ['First Name', 'Last Name', 'Email', 'Phone', 'Company', 'Job Title',
        'Source', 'Status', 'Score', 'Budget', 'Product Interest', 'Location', 'Campaign',
        'Website', 'Pipeline Stage', 'Assigned To', 'Tags', 'Created At'];

      const escapeCSV = (val) => {
        if (val === null || val === undefined) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const rows = leads.map(l => [
        l.firstName, l.lastName, l.email || '', l.phone || '',
        l.company || '', l.jobTitle || '', l.source, l.status,
        l.score, l.budget ? parseFloat(l.budget) : '',
        l.productInterest || '', l.location || '', l.campaign || '',
        l.website || '', l.stage?.name || '',
        l.assignedTo ? `${l.assignedTo.firstName} ${l.assignedTo.lastName}` : '',
        (l.tags || []).map(t => t.tag.name).join(', '),
        new Date(l.createdAt).toISOString().split('T')[0],
      ].map(escapeCSV));

      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const timestamp = new Date().toISOString().split('T')[0];

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=leads-export-${timestamp}.csv`);
      res.send('\uFEFF' + csv); // BOM for Excel compatibility
    } else if (module === 'campaigns') {
      const campaigns = await prisma.campaign.findMany({
        where: { organizationId: req.orgId },
        orderBy: { createdAt: 'desc' },
      });

      const headers = ['Name', 'Type', 'Status', 'Budget', 'Start Date', 'End Date', 'Created At'];
      const escapeCSV = (val) => {
        if (val === null || val === undefined) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const rows = campaigns.map(c => [
        c.name, c.type, c.status, c.budget ? parseFloat(c.budget) : '',
        c.startDate ? new Date(c.startDate).toISOString().split('T')[0] : '',
        c.endDate ? new Date(c.endDate).toISOString().split('T')[0] : '',
        new Date(c.createdAt).toISOString().split('T')[0],
      ].map(escapeCSV));

      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const timestamp = new Date().toISOString().split('T')[0];

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=campaigns-export-${timestamp}.csv`);
      res.send('\uFEFF' + csv);
    } else {
      return res.status(400).json({ error: `Unknown module: ${module}` });
    }
  } catch (err) {
    next(err);
  }
});

// ─── 10. Export error rows from an import ───────────────────────
router.get('/history/:id/errors-csv', async (req, res, next) => {
  try {
    const record = await prisma.importHistory.findFirst({
      where: { id: req.params.id, organizationId: req.orgId },
    });

    if (!record) {
      return res.status(404).json({ error: 'Import record not found' });
    }

    const errors = record.errors || [];
    if (errors.length === 0) {
      return res.status(400).json({ error: 'No errors to export' });
    }

    // Build CSV from error data
    const escapeCSV = (val) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // Collect all columns from error data
    const allCols = new Set();
    for (const err of errors) {
      if (err.data) {
        Object.keys(err.data).forEach(k => allCols.add(k));
      }
    }
    const cols = ['Row', 'Error', ...Array.from(allCols)];

    const rows = errors.map(err => {
      const row = [err.row, err.error || err.message || ''];
      for (const col of allCols) {
        row.push(err.data?.[col] || '');
      }
      return row.map(escapeCSV);
    });

    const csv = [cols.join(','), ...rows.map(r => r.join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=import-errors-${record.id.slice(0, 8)}.csv`);
    res.send('\uFEFF' + csv);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
