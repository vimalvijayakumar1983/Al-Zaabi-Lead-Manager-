const { prisma } = require('../config/database');

/**
 * Detect potential duplicate leads by email or phone
 */
const detectDuplicates = async (organizationId, { email, phone }) => {
  const conditions = [];

  if (email) {
    conditions.push({ email: { equals: email, mode: 'insensitive' } });
  }
  if (phone) {
    // Normalize phone for comparison
    const normalizedPhone = phone.replace(/[\s\-\(\)]/g, '');
    conditions.push({ phone: { contains: normalizedPhone } });
  }

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

module.exports = { detectDuplicates };
