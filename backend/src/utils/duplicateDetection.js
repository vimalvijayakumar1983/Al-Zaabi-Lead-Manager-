const { prisma } = require('../config/database');

/**
 * Normalize phone number for comparison: strip all non-digit characters
 */
const normalizePhone = (phone) => {
  if (!phone) return '';
  return phone.replace(/[^\d+]/g, '');
};

/**
 * Build duplicate detection conditions for email and/or phone
 */
const buildDuplicateConditions = ({ email, phone }) => {
  const conditions = [];
  if (email) {
    conditions.push({ email: { equals: email, mode: 'insensitive' } });
  }
  if (phone) {
    const normalized = normalizePhone(phone);
    if (normalized.length >= 7) {
      // Match last 7+ digits to handle country code variations
      const lastDigits = normalized.slice(-7);
      conditions.push({ phone: { contains: lastDigits } });
    } else if (normalized) {
      conditions.push({ phone: { contains: normalized } });
    }
  }
  return conditions;
};

/**
 * Detect potential duplicate leads by email or phone
 */
const detectDuplicates = async (organizationId, { email, phone }) => {
  const conditions = buildDuplicateConditions({ email, phone });
  if (conditions.length === 0) return [];

  const duplicates = await prisma.lead.findMany({
    where: {
      organizationId,
      isArchived: false,
      OR: conditions,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      status: true,
    },
    take: 5,
  });

  return duplicates;
};

/**
 * Detect potential duplicate contacts by email or phone
 */
const detectContactDuplicates = async (organizationIds, { email, phone }) => {
  const conditions = buildDuplicateConditions({ email, phone });
  if (conditions.length === 0) return [];

  const orgFilter = Array.isArray(organizationIds)
    ? { organizationId: { in: organizationIds } }
    : { organizationId: organizationIds };

  const duplicates = await prisma.contact.findMany({
    where: {
      ...orgFilter,
      isArchived: false,
      OR: conditions,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      lifecycle: true,
    },
    take: 5,
  });

  return duplicates;
};

/**
 * Detect duplicates during import — checks both email and phone if present,
 * regardless of which duplicateField the user selected.
 */
const detectImportDuplicate = async (model, organizationId, mapped) => {
  const conditions = buildDuplicateConditions({
    email: mapped.email,
    phone: mapped.phone,
  });
  if (conditions.length === 0) return null;

  const prismaModel = model === 'contact' ? prisma.contact : prisma.lead;
  return prismaModel.findFirst({
    where: {
      organizationId,
      isArchived: false,
      OR: conditions,
    },
  });
};

module.exports = { detectDuplicates, detectContactDuplicates, detectImportDuplicate, normalizePhone };
