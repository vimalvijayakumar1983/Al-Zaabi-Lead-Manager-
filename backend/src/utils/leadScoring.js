/**
 * Lead scoring engine - calculates a score (0-100) based on lead attributes and activity
 */
const calculateLeadScore = (lead, activityCount = 0) => {
  let score = 0;

  // Email provided (+10)
  if (lead.email) score += 10;

  // Phone provided (+10)
  if (lead.phone) score += 10;

  // Company provided (+5)
  if (lead.company) score += 5;

  // Budget provided (+15)
  if (lead.budget && parseFloat(lead.budget) > 0) score += 15;

  // Product interest specified (+10)
  if (lead.productInterest) score += 10;

  // Source scoring
  const sourceScores = {
    WEBSITE_FORM: 15,
    LANDING_PAGE: 12,
    REFERRAL: 20,
    GOOGLE_ADS: 10,
    FACEBOOK_ADS: 8,
    TIKTOK_ADS: 8,
    WHATSAPP: 12,
    EMAIL: 10,
    PHONE: 14,
    MANUAL: 5,
    CSV_IMPORT: 3,
    API: 5,
    OTHER: 3,
  };
  score += sourceScores[lead.source] || 3;

  // Activity bonus (up to 15 points)
  score += Math.min(activityCount * 3, 15);

  return Math.min(score, 100);
};

/**
 * Predict conversion probability based on lead score and status
 */
const predictConversion = (score, status) => {
  const statusMultiplier = {
    NEW: 0.3,
    CONTACTED: 0.5,
    QUALIFIED: 0.7,
    PROPOSAL_SENT: 0.8,
    NEGOTIATION: 0.85,
    WON: 1.0,
    LOST: 0.0,
  };

  const base = score / 100;
  const multiplier = statusMultiplier[status] ?? 0.3;
  return Math.round(base * multiplier * 100) / 100;
};

module.exports = { calculateLeadScore, predictConversion };
