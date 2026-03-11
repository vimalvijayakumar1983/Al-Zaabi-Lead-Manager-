const { Router } = require('express');
const multer = require('multer');
const { parse } = require('csv-parse');
const { Readable } = require('stream');
const { prisma } = require('../config/database');
const { authenticate, orgScope } = require('../middleware/auth');
const { calculateLeadScore, predictConversion } = require('../utils/leadScoring');

const router = Router();
router.use(authenticate, orgScope);

const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB

// ─── Import Leads from CSV ───────────────────────────────────────
router.post('/csv', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'CSV file is required' });
    }

    const records = [];
    const errors = [];

    const parser = Readable.from(req.file.buffer).pipe(
      parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
      })
    );

    for await (const record of parser) {
      records.push(record);
    }

    const defaultStage = await prisma.pipelineStage.findFirst({
      where: { organizationId: req.orgId, isDefault: true },
    });

    let imported = 0;
    let skipped = 0;

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      try {
        const firstName = row.firstName || row.first_name || row['First Name'] || '';
        const lastName = row.lastName || row.last_name || row['Last Name'] || '';

        if (!firstName || !lastName) {
          errors.push({ row: i + 1, error: 'Missing firstName or lastName' });
          skipped++;
          continue;
        }

        const leadData = {
          firstName,
          lastName,
          email: row.email || row.Email || null,
          phone: row.phone || row.Phone || null,
          company: row.company || row.Company || null,
          source: 'CSV_IMPORT',
          location: row.location || row.Location || row.city || null,
          productInterest: row.productInterest || row.product || null,
          budget: row.budget ? parseFloat(row.budget) : null,
          organizationId: req.orgId,
          createdById: req.user.id,
          stageId: defaultStage?.id,
        };

        leadData.score = calculateLeadScore(leadData);
        leadData.conversionProb = predictConversion(leadData.score, 'NEW');

        await prisma.lead.create({ data: leadData });
        imported++;
      } catch (err) {
        errors.push({ row: i + 1, error: err.message });
        skipped++;
      }
    }

    res.json({
      message: `Import complete: ${imported} imported, ${skipped} skipped`,
      imported,
      skipped,
      errors: errors.slice(0, 20), // Return first 20 errors
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
