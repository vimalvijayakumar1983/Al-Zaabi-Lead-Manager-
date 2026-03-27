const { prisma } = require('../../config/database');
const { writeIncentiveAudit } = require('./auditLog');

function appendHistory(statement, action, actorId, meta = {}) {
  let h = [];
  const raw = statement.statusHistory;
  if (Array.isArray(raw)) h = [...raw];
  else if (raw && typeof raw === 'object') h = [raw];
  h.push({ at: new Date().toISOString(), action, actorId, ...meta });
  return h;
}

async function generateStatements({ organizationId, divisionId, periodStart, periodEnd, actorId }) {
  const start = new Date(periodStart);
  const end = new Date(periodEnd);

  const earnings = await prisma.incentiveEarning.findMany({
    where: {
      organizationId,
      divisionId,
      status: 'POSTED',
      createdAt: { gte: start, lte: end },
    },
  });

  const byUser = new Map();
  for (const e of earnings) {
    if (!byUser.has(e.userId)) byUser.set(e.userId, []);
    byUser.get(e.userId).push(e);
  }

  const created = [];
  for (const [userId, rows] of byUser) {
    const total = rows.reduce((s, r) => s + Number(r.amount), 0);
    const st = await prisma.incentiveStatement.create({
      data: {
        organizationId,
        divisionId,
        userId,
        periodStart: start,
        periodEnd: end,
        status: 'DRAFT',
        totalAmount: total,
        currency: rows[0]?.currency || 'USD',
        statusHistory: [{ at: new Date().toISOString(), action: 'CREATE_DRAFT', actorId }],
        createdById: actorId,
      },
    });
    let order = 0;
    for (const e of rows) {
      await prisma.incentiveStatementLine.create({
        data: {
          statementId: st.id,
          lineType: 'EARNING',
          earningId: e.id,
          description: `Earning from event ${e.eventId}`,
          amount: e.amount,
          trace: e.trace || {},
          sortOrder: order++,
          locked: false,
        },
      });
    }
    created.push(st.id);
    await writeIncentiveAudit({
      organizationId,
      divisionId,
      actorId,
      action: 'STATEMENT_GENERATE',
      modelType: 'IncentiveStatement',
      modelId: st.id,
      after: { periodStart, periodEnd, userId, lineCount: rows.length },
    });
  }

  return { statementIds: created, count: created.length };
}

async function approveStatement(statementId, actorId, organizationId, divisionId) {
  const st = await prisma.incentiveStatement.findFirst({
    where: { id: statementId, organizationId, divisionId },
  });
  if (!st) throw new Error('NOT_FOUND');
  if (!['DRAFT', 'REVIEW'].includes(st.status)) throw new Error('INVALID_STATUS');
  const history = appendHistory(st, 'APPROVE', actorId);
  const updated = await prisma.incentiveStatement.update({
    where: { id: statementId },
    data: {
      status: 'APPROVED',
      approvedById: actorId,
      approvedAt: new Date(),
      statusHistory: history,
    },
  });
  await writeIncentiveAudit({
    organizationId,
    divisionId,
    actorId,
    action: 'STATEMENT_APPROVE',
    modelType: 'IncentiveStatement',
    modelId: statementId,
    before: { status: st.status },
    after: { status: 'APPROVED' },
  });
  return updated;
}

async function lockStatement(statementId, actorId, organizationId, divisionId) {
  const st = await prisma.incentiveStatement.findFirst({
    where: { id: statementId, organizationId, divisionId },
  });
  if (!st) throw new Error('NOT_FOUND');
  if (st.status !== 'APPROVED') throw new Error('MUST_BE_APPROVED');
  const history = appendHistory(st, 'LOCK', actorId);
  const updated = await prisma.incentiveStatement.update({
    where: { id: statementId },
    data: {
      status: 'LOCKED',
      lockedAt: new Date(),
      lockedById: actorId,
      statusHistory: history,
    },
  });
  await prisma.incentiveStatementLine.updateMany({
    where: { statementId },
    data: { locked: true },
  });
  await writeIncentiveAudit({
    organizationId,
    divisionId,
    actorId,
    action: 'STATEMENT_LOCK',
    modelType: 'IncentiveStatement',
    modelId: statementId,
    after: { status: 'LOCKED' },
  });
  return updated;
}

async function payStatement(statementId, actorId, organizationId, divisionId, payoutRef) {
  const st = await prisma.incentiveStatement.findFirst({
    where: { id: statementId, organizationId, divisionId },
  });
  if (!st) throw new Error('NOT_FOUND');
  if (st.status !== 'LOCKED') throw new Error('MUST_BE_LOCKED');
  const history = appendHistory(st, 'PAY', actorId, { payoutRef });
  return prisma.incentiveStatement.update({
    where: { id: statementId },
    data: {
      status: 'PAID',
      paidAt: new Date(),
      paidById: actorId,
      payoutRef: payoutRef || null,
      statusHistory: history,
    },
  });
}

module.exports = {
  generateStatements,
  approveStatement,
  lockStatement,
  payStatement,
  appendHistory,
};
