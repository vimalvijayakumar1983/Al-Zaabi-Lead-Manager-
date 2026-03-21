/**
 * Time-Based Automation Scheduler
 *
 * Monitors leads and fires automation triggers based on elapsed time since
 * a lead was created or last updated. This enables workflows like:
 *
 *   - "Send follow-up email 24 hours after lead creation"
 *   - "Notify manager if lead hasn't been updated in 3 days"
 *   - "Tag leads as stale after 7 days without updates"
 *
 * ── Trigger Types ─────────────────────────────────────────────────
 *
 *  LEAD_CREATED_TIME_ELAPSED  →  Fires when X minutes have passed since createdAt
 *  LEAD_UPDATED_TIME_ELAPSED  →  Fires when X minutes have passed since updatedAt
 *
 * ── How It Works ──────────────────────────────────────────────────
 *
 *  1. Runs every 2 minutes (configurable)
 *  2. Finds all active automation rules with time-based triggers
 *  3. For each rule, reads `delayMinutes` from the rule's conditions
 *     (a special condition with field = "__delay__")
 *  4. Queries leads matching the time window and other conditions
 *  5. Checks AutomationLog to avoid re-firing for the same lead+rule
 *  6. Fires the automation engine for qualifying leads
 *
 * @module services/timeBasedAutomationScheduler
 */

const { prisma } = require('../config/database');
const { logger } = require('../config/logger');
const { broadcastDataChange } = require('../websocket/server');
const { executeAutomations } = require('./automationEngine');

// Check interval (ms) — every 2 minutes
const TIME_CHECK_INTERVAL = 2 * 60 * 1000;

// Tolerance window (ms) — leads are eligible if their elapsed time falls
// within [delayMinutes, delayMinutes + window]. This prevents re-triggering
// on subsequent scheduler runs while giving enough buffer for the 2-min cycle.
const TOLERANCE_WINDOW_MINUTES = 30;

let schedulerInterval = null;

const TIME_BASED_TRIGGERS = ['LEAD_CREATED_TIME_ELAPSED', 'LEAD_UPDATED_TIME_ELAPSED'];

/**
 * Extract the delay configuration from a rule's conditions.
 * The delay is stored as a special condition: { field: "__delay__", operator: "equals", value: <minutes> }
 */
function extractDelayMinutes(conditions) {
  if (!Array.isArray(conditions)) return null;
  const delayCond = conditions.find((c) => c.field === '__delay__');
  if (!delayCond) return null;
  const minutes = Number(delayCond.value);
  return isNaN(minutes) || minutes <= 0 ? null : minutes;
}

/**
 * Get the non-delay conditions (regular lead field conditions).
 */
function getLeadConditions(conditions) {
  if (!Array.isArray(conditions)) return [];
  return conditions.filter((c) => c.field !== '__delay__');
}

/**
 * Process a single time-based automation rule across all organizations' leads.
 */
async function processTimeBasedRule(rule) {
  const delayMinutes = extractDelayMinutes(rule.conditions);
  if (!delayMinutes) {
    logger.warn(`[TimeBased] Rule "${rule.name}" has no valid __delay__ condition — skipping`);
    return 0;
  }

  const now = new Date();
  const isCreatedTrigger = rule.trigger === 'LEAD_CREATED_TIME_ELAPSED';
  const timeField = isCreatedTrigger ? 'createdAt' : 'updatedAt';

  // Calculate the time window: leads whose [timeField] is between
  // (now - delayMinutes - tolerance) and (now - delayMinutes)
  const targetTime = new Date(now.getTime() - delayMinutes * 60 * 1000);
  const windowStart = new Date(targetTime.getTime() - TOLERANCE_WINDOW_MINUTES * 60 * 1000);

  // Find leads in the time window for this org
  const leads = await prisma.lead.findMany({
    where: {
      organizationId: rule.organizationId,
      isArchived: false,
      status: { notIn: ['WON', 'LOST'] },
      [timeField]: {
        gte: windowStart,
        lte: targetTime,
      },
    },
    include: {
      assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
      tags: { include: { tag: true } },
    },
    take: 500, // safety cap per rule per cycle
  });

  if (leads.length === 0) return 0;

  // Get lead IDs that have already been triggered by this rule
  const leadIds = leads.map((l) => l.id);
  const existingLogs = await prisma.automationLog.findMany({
    where: {
      ruleId: rule.id,
      leadId: { in: leadIds },
      status: { in: ['success', 'failed'] }, // skip leads that were already processed
    },
    select: { leadId: true },
  });
  const alreadyTriggered = new Set(existingLogs.map((log) => log.leadId));

  let triggersFired = 0;

  for (const lead of leads) {
    if (alreadyTriggered.has(lead.id)) continue;

    try {
      // Fire automation — the engine will evaluate the remaining (non-delay) conditions
      await executeAutomations(rule.trigger, {
        organizationId: rule.organizationId,
        lead: {
          ...lead,
          timeElapsedMinutes: delayMinutes,
          timeField,
        },
      });
      triggersFired++;
    } catch (err) {
      logger.error(`[TimeBased] Failed to execute rule "${rule.name}" for lead ${lead.id}:`, err.message);
    }
  }

  return triggersFired;
}

/**
 * Main scheduler loop — checks all time-based automation rules.
 */
async function runTimeBasedCheck() {
  const startTime = Date.now();

  try {
    // Find all active time-based automation rules
    const rules = await prisma.automationRule.findMany({
      where: {
        trigger: { in: TIME_BASED_TRIGGERS },
        isActive: true,
      },
    });

    if (rules.length === 0) return;

    let totalTriggers = 0;

    for (const rule of rules) {
      try {
        const count = await processTimeBasedRule(rule);
        totalTriggers += count;
      } catch (err) {
        logger.error(`[TimeBased] Error processing rule "${rule.name}" (${rule.id}):`, err.message);
      }
    }

    const durationMs = Date.now() - startTime;
    if (totalTriggers > 0) {
      logger.info(
        `[TimeBased] Check completed in ${durationMs}ms — ${rules.length} rules evaluated, ${totalTriggers} triggers fired`
      );
    }
  } catch (err) {
    logger.error('[TimeBased] Scheduler check failed:', err.message);
  }
}

/**
 * Start the time-based automation scheduler.
 */
function startTimeBasedScheduler(intervalMs = TIME_CHECK_INTERVAL) {
  if (schedulerInterval) {
    logger.warn('[TimeBased] Scheduler already running');
    return;
  }

  logger.info(`[TimeBased] Starting time-based automation scheduler (interval: ${intervalMs / 1000}s)`);

  // Run after a short delay on startup (stagger with SLA monitor)
  setTimeout(() => {
    runTimeBasedCheck().catch((err) => logger.error('[TimeBased] Initial check failed:', err.message));
  }, 10000);

  // Then run on interval
  schedulerInterval = setInterval(() => {
    runTimeBasedCheck().catch((err) => logger.error('[TimeBased] Periodic check failed:', err.message));
  }, intervalMs);
}

/**
 * Stop the time-based automation scheduler.
 */
function stopTimeBasedScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    logger.info('[TimeBased] Scheduler stopped');
  }
}

module.exports = {
  startTimeBasedScheduler,
  stopTimeBasedScheduler,
  runTimeBasedCheck,
  TIME_BASED_TRIGGERS,
};
