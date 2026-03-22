/**
 * Industry Templates for Lead Management
 *
 * Each template defines the complete setup for a division:
 * - Custom fields relevant to the industry
 * - Pipeline stages tailored to the sales process
 * - Default tags for lead categorization
 * - Form field suggestions for lead capture
 */

const INDUSTRY_TEMPLATES = [
  // ─── 1. Real Estate ─────────────────────────────────────────────────
  {
    id: 'real_estate',
    name: 'Real Estate',
    description: 'Property sales, rentals, and real estate brokerage',
    icon: 'building',
    color: '#6366f1',
    pipelineStages: [
      { name: 'New Inquiry', order: 0, color: '#6366f1', isDefault: true },
      { name: 'Property Viewing Scheduled', order: 1, color: '#3b82f6' },
      { name: 'Viewing Completed', order: 2, color: '#06b6d4' },
      { name: 'Offer Made', order: 3, color: '#f59e0b' },
      { name: 'Negotiation', order: 4, color: '#f97316' },
      { name: 'Documentation', order: 5, color: '#8b5cf6' },
      { name: 'Closed Won', order: 6, color: '#22c55e', isWonStage: true },
      { name: 'Closed Lost', order: 7, color: '#ef4444', isLostStage: true },
    ],
    customFields: [
      { label: 'Property Type', type: 'SELECT', options: ['Apartment', 'Villa', 'Townhouse', 'Penthouse', 'Land', 'Office', 'Retail', 'Warehouse'], isRequired: false },
      { label: 'Budget Range', type: 'SELECT', options: ['Under 500K', '500K - 1M', '1M - 2M', '2M - 5M', '5M - 10M', 'Above 10M'], isRequired: false },
      { label: 'Bedrooms', type: 'SELECT', options: ['Studio', '1', '2', '3', '4', '5+'], isRequired: false },
      { label: 'Preferred Location', type: 'TEXT', isRequired: false },
      { label: 'Purpose', type: 'SELECT', options: ['Buy', 'Rent', 'Invest', 'Off-Plan'], isRequired: false },
      { label: 'Move-in Date', type: 'DATE', isRequired: false },
      { label: 'Current Living Situation', type: 'SELECT', options: ['Renting', 'Own Property', 'Relocating', 'First-time Buyer'], isRequired: false },
      { label: 'Financing Required', type: 'BOOLEAN', isRequired: false },
      { label: 'Nationality', type: 'TEXT', isRequired: false },
    ],
    tags: [
      { name: 'Hot Lead', color: '#ef4444' },
      { name: 'Investor', color: '#8b5cf6' },
      { name: 'First-time Buyer', color: '#3b82f6' },
      { name: 'Cash Buyer', color: '#22c55e' },
      { name: 'Mortgage Required', color: '#f59e0b' },
      { name: 'Relocation', color: '#06b6d4' },
      { name: 'Off-Plan Interest', color: '#ec4899' },
      { name: 'Rental', color: '#14b8a6' },
      { name: 'VIP', color: '#eab308' },
    ],
  },

  // ─── 2. Healthcare ──────────────────────────────────────────────────
  {
    id: 'healthcare',
    name: 'Healthcare & Medical',
    description: 'Hospitals, clinics, dental, aesthetics, and wellness centers',
    icon: 'heart-pulse',
    color: '#ef4444',
    pipelineStages: [
      { name: 'New Patient Inquiry', order: 0, color: '#ef4444', isDefault: true },
      { name: 'Consultation Scheduled', order: 1, color: '#f97316' },
      { name: 'Consultation Completed', order: 2, color: '#3b82f6' },
      { name: 'Treatment Plan Shared', order: 3, color: '#8b5cf6' },
      { name: 'Insurance/Payment Processing', order: 4, color: '#f59e0b' },
      { name: 'Treatment Confirmed', order: 5, color: '#22c55e', isWonStage: true },
      { name: 'Not Proceeding', order: 6, color: '#6b7280', isLostStage: true },
    ],
    customFields: [
      { label: 'Service Interest', type: 'SELECT', options: ['General Checkup', 'Dental', 'Dermatology', 'Orthopedics', 'Cardiology', 'Pediatrics', 'Aesthetics', 'Surgery', 'Physiotherapy', 'Mental Health', 'Other'], isRequired: false },
      { label: 'Preferred Doctor', type: 'TEXT', isRequired: false },
      { label: 'Insurance Provider', type: 'TEXT', isRequired: false },
      { label: 'Insurance Policy Number', type: 'TEXT', isRequired: false },
      { label: 'Preferred Date', type: 'DATE', isRequired: false },
      { label: 'Preferred Time Slot', type: 'SELECT', options: ['Morning (8am-12pm)', 'Afternoon (12pm-4pm)', 'Evening (4pm-8pm)', 'Weekend Only'], isRequired: false },
      { label: 'Urgency Level', type: 'SELECT', options: ['Routine', 'Soon', 'Urgent', 'Emergency'], isRequired: false },
      { label: 'Existing Patient', type: 'BOOLEAN', isRequired: false },
      { label: 'Referral Source', type: 'SELECT', options: ['Doctor Referral', 'Online Search', 'Social Media', 'Friend/Family', 'Insurance Portal', 'Walk-in', 'Other'], isRequired: false },
    ],
    tags: [
      { name: 'New Patient', color: '#3b82f6' },
      { name: 'Returning Patient', color: '#22c55e' },
      { name: 'Insurance Covered', color: '#8b5cf6' },
      { name: 'Self-Pay', color: '#f59e0b' },
      { name: 'Urgent', color: '#ef4444' },
      { name: 'VIP Patient', color: '#eab308' },
      { name: 'Medical Tourism', color: '#06b6d4' },
      { name: 'Follow-up Required', color: '#f97316' },
    ],
  },

  // ─── 3. Automotive / Auto Care ──────────────────────────────────────
  {
    id: 'automotive',
    name: 'Automotive & Auto Care',
    description: 'Car sales, servicing, detailing, and auto parts',
    icon: 'car',
    color: '#f97316',
    pipelineStages: [
      { name: 'New Inquiry', order: 0, color: '#f97316', isDefault: true },
      { name: 'Vehicle Assessment', order: 1, color: '#3b82f6' },
      { name: 'Quote Sent', order: 2, color: '#8b5cf6' },
      { name: 'Negotiation', order: 3, color: '#f59e0b' },
      { name: 'Service/Sale Confirmed', order: 4, color: '#06b6d4' },
      { name: 'In Progress', order: 5, color: '#14b8a6' },
      { name: 'Completed', order: 6, color: '#22c55e', isWonStage: true },
      { name: 'Cancelled', order: 7, color: '#ef4444', isLostStage: true },
    ],
    customFields: [
      { label: 'Service Type', type: 'SELECT', options: ['New Car Sale', 'Used Car Sale', 'Regular Service', 'Repair', 'Body Work', 'Detailing', 'Insurance Claim', 'Parts', 'Accessories', 'Tinting', 'Wrapping'], isRequired: false },
      { label: 'Vehicle Make', type: 'TEXT', isRequired: false },
      { label: 'Vehicle Model', type: 'TEXT', isRequired: false },
      { label: 'Vehicle Year', type: 'NUMBER', isRequired: false },
      { label: 'Plate Number', type: 'TEXT', isRequired: false },
      { label: 'Mileage (KM)', type: 'NUMBER', isRequired: false },
      { label: 'Preferred Drop-off Date', type: 'DATE', isRequired: false },
      { label: 'Insurance Claim', type: 'BOOLEAN', isRequired: false },
      { label: 'Estimated Budget', type: 'SELECT', options: ['Under 500', '500 - 1,000', '1,000 - 5,000', '5,000 - 10,000', '10,000 - 50,000', 'Above 50,000'], isRequired: false },
    ],
    tags: [
      { name: 'Urgent Repair', color: '#ef4444' },
      { name: 'Regular Service', color: '#3b82f6' },
      { name: 'Insurance Job', color: '#8b5cf6' },
      { name: 'Fleet Customer', color: '#06b6d4' },
      { name: 'VIP', color: '#eab308' },
      { name: 'Return Customer', color: '#22c55e' },
      { name: 'New Car Buyer', color: '#f97316' },
      { name: 'Trade-in', color: '#14b8a6' },
    ],
  },

  // ─── 4. Trading & Wholesale ─────────────────────────────────────────
  {
    id: 'trading',
    name: 'Trading & Wholesale',
    description: 'B2B trading, distribution, import/export, and wholesale',
    icon: 'package',
    color: '#14b8a6',
    pipelineStages: [
      { name: 'New Inquiry', order: 0, color: '#14b8a6', isDefault: true },
      { name: 'Requirements Gathered', order: 1, color: '#3b82f6' },
      { name: 'Quotation Sent', order: 2, color: '#8b5cf6' },
      { name: 'Sample/Trial', order: 3, color: '#f59e0b' },
      { name: 'Negotiation', order: 4, color: '#f97316' },
      { name: 'Purchase Order', order: 5, color: '#06b6d4' },
      { name: 'Order Fulfilled', order: 6, color: '#22c55e', isWonStage: true },
      { name: 'Lost/No Order', order: 7, color: '#ef4444', isLostStage: true },
    ],
    customFields: [
      { label: 'Product Category', type: 'SELECT', options: ['Electronics', 'FMCG', 'Building Materials', 'Textiles', 'Chemicals', 'Food & Beverage', 'Machinery', 'Auto Parts', 'Packaging', 'Other'], isRequired: false },
      { label: 'Order Volume', type: 'TEXT', isRequired: false },
      { label: 'Order Frequency', type: 'SELECT', options: ['One-time', 'Weekly', 'Monthly', 'Quarterly', 'Annually'], isRequired: false },
      { label: 'Payment Terms', type: 'SELECT', options: ['Advance', 'COD', 'Net 30', 'Net 60', 'Net 90', 'Letter of Credit'], isRequired: false },
      { label: 'Delivery Location', type: 'TEXT', isRequired: false },
      { label: 'Trade License Number', type: 'TEXT', isRequired: false },
      { label: 'Annual Purchase Value', type: 'SELECT', options: ['Under 50K', '50K - 100K', '100K - 500K', '500K - 1M', 'Above 1M'], isRequired: false },
      { label: 'Existing Supplier', type: 'BOOLEAN', isRequired: false },
    ],
    tags: [
      { name: 'Bulk Buyer', color: '#14b8a6' },
      { name: 'Retail', color: '#3b82f6' },
      { name: 'Distributor', color: '#8b5cf6' },
      { name: 'Government', color: '#f59e0b' },
      { name: 'International', color: '#06b6d4' },
      { name: 'Repeat Customer', color: '#22c55e' },
      { name: 'Credit Account', color: '#f97316' },
      { name: 'New Account', color: '#ec4899' },
    ],
  },

  // ─── 5. Education ──────────────────────────────────────────────────
  {
    id: 'education',
    name: 'Education & Training',
    description: 'Schools, universities, training institutes, and online courses',
    icon: 'graduation-cap',
    color: '#3b82f6',
    pipelineStages: [
      { name: 'New Inquiry', order: 0, color: '#3b82f6', isDefault: true },
      { name: 'Info Session Scheduled', order: 1, color: '#8b5cf6' },
      { name: 'Application Started', order: 2, color: '#06b6d4' },
      { name: 'Documents Submitted', order: 3, color: '#f59e0b' },
      { name: 'Assessment/Interview', order: 4, color: '#f97316' },
      { name: 'Offer Extended', order: 5, color: '#14b8a6' },
      { name: 'Enrolled', order: 6, color: '#22c55e', isWonStage: true },
      { name: 'Did Not Enroll', order: 7, color: '#ef4444', isLostStage: true },
    ],
    customFields: [
      { label: 'Program Interest', type: 'SELECT', options: ['Undergraduate', 'Postgraduate', 'MBA', 'Diploma', 'Certificate', 'Short Course', 'Professional Training', 'Language Course', 'K-12'], isRequired: false },
      { label: 'Field of Study', type: 'TEXT', isRequired: false },
      { label: 'Preferred Start Date', type: 'SELECT', options: ['Immediate', 'Next Month', 'Next Quarter', 'Next Academic Year'], isRequired: false },
      { label: 'Current Education Level', type: 'SELECT', options: ['High School', 'Undergraduate', 'Graduate', 'Professional', 'Other'], isRequired: false },
      { label: 'Study Mode', type: 'SELECT', options: ['Full-time', 'Part-time', 'Online', 'Hybrid', 'Weekend'], isRequired: false },
      { label: 'Scholarship Interest', type: 'BOOLEAN', isRequired: false },
      { label: 'Nationality', type: 'TEXT', isRequired: false },
      { label: 'Parent/Guardian Name', type: 'TEXT', isRequired: false },
      { label: 'Parent/Guardian Phone', type: 'PHONE', isRequired: false },
    ],
    tags: [
      { name: 'Scholarship Candidate', color: '#eab308' },
      { name: 'International Student', color: '#06b6d4' },
      { name: 'Transfer Student', color: '#8b5cf6' },
      { name: 'Corporate Training', color: '#14b8a6' },
      { name: 'Walk-in', color: '#3b82f6' },
      { name: 'Online Lead', color: '#f97316' },
      { name: 'Parent Inquiry', color: '#ec4899' },
      { name: 'Alumni Referral', color: '#22c55e' },
    ],
  },

  // ─── 6. Insurance ──────────────────────────────────────────────────
  {
    id: 'insurance',
    name: 'Insurance',
    description: 'Life, health, auto, property, and commercial insurance',
    icon: 'shield',
    color: '#8b5cf6',
    pipelineStages: [
      { name: 'New Lead', order: 0, color: '#8b5cf6', isDefault: true },
      { name: 'Needs Assessment', order: 1, color: '#3b82f6' },
      { name: 'Quote Generated', order: 2, color: '#06b6d4' },
      { name: 'Quote Presented', order: 3, color: '#f59e0b' },
      { name: 'Documents Collection', order: 4, color: '#f97316' },
      { name: 'Underwriting', order: 5, color: '#14b8a6' },
      { name: 'Policy Issued', order: 6, color: '#22c55e', isWonStage: true },
      { name: 'Declined/Lost', order: 7, color: '#ef4444', isLostStage: true },
    ],
    customFields: [
      { label: 'Insurance Type', type: 'SELECT', options: ['Health', 'Life', 'Auto', 'Home/Property', 'Travel', 'Business/Commercial', 'Marine', 'Workers Comp', 'Professional Liability'], isRequired: false },
      { label: 'Current Provider', type: 'TEXT', isRequired: false },
      { label: 'Policy Expiry Date', type: 'DATE', isRequired: false },
      { label: 'Coverage Amount', type: 'TEXT', isRequired: false },
      { label: 'Number of Dependents', type: 'NUMBER', isRequired: false },
      { label: 'Annual Premium Budget', type: 'SELECT', options: ['Under 1,000', '1,000 - 5,000', '5,000 - 10,000', '10,000 - 25,000', 'Above 25,000'], isRequired: false },
      { label: 'Existing Policy', type: 'BOOLEAN', isRequired: false },
      { label: 'Employer Name', type: 'TEXT', isRequired: false },
    ],
    tags: [
      { name: 'Renewal', color: '#f59e0b' },
      { name: 'New Policy', color: '#3b82f6' },
      { name: 'Corporate', color: '#8b5cf6' },
      { name: 'Individual', color: '#06b6d4' },
      { name: 'Family Plan', color: '#ec4899' },
      { name: 'High Value', color: '#eab308' },
      { name: 'Competitor Switch', color: '#f97316' },
      { name: 'Claim History', color: '#ef4444' },
    ],
  },

  // ─── 7. Financial Services ─────────────────────────────────────────
  {
    id: 'financial_services',
    name: 'Financial Services',
    description: 'Banking, investments, loans, mortgage, and wealth management',
    icon: 'landmark',
    color: '#0ea5e9',
    pipelineStages: [
      { name: 'New Inquiry', order: 0, color: '#0ea5e9', isDefault: true },
      { name: 'Eligibility Check', order: 1, color: '#3b82f6' },
      { name: 'Proposal Prepared', order: 2, color: '#8b5cf6' },
      { name: 'Proposal Presented', order: 3, color: '#f59e0b' },
      { name: 'Documentation', order: 4, color: '#f97316' },
      { name: 'Approval Process', order: 5, color: '#14b8a6' },
      { name: 'Disbursed/Activated', order: 6, color: '#22c55e', isWonStage: true },
      { name: 'Declined', order: 7, color: '#ef4444', isLostStage: true },
    ],
    customFields: [
      { label: 'Product Interest', type: 'SELECT', options: ['Personal Loan', 'Home Loan/Mortgage', 'Auto Loan', 'Business Loan', 'Credit Card', 'Savings Account', 'Investment/Wealth', 'Insurance', 'Fixed Deposit', 'Other'], isRequired: false },
      { label: 'Loan Amount Required', type: 'TEXT', isRequired: false },
      { label: 'Monthly Income', type: 'SELECT', options: ['Under 5K', '5K - 10K', '10K - 20K', '20K - 50K', 'Above 50K'], isRequired: false },
      { label: 'Employment Type', type: 'SELECT', options: ['Salaried', 'Self-Employed', 'Business Owner', 'Freelancer', 'Retired'], isRequired: false },
      { label: 'Employer Name', type: 'TEXT', isRequired: false },
      { label: 'Existing Customer', type: 'BOOLEAN', isRequired: false },
      { label: 'Credit Score Range', type: 'SELECT', options: ['Excellent (750+)', 'Good (700-749)', 'Fair (650-699)', 'Below Average (<650)', 'Unknown'], isRequired: false },
      { label: 'Preferred Tenure', type: 'SELECT', options: ['6 months', '1 year', '2 years', '3 years', '5 years', '10 years', '15 years', '20+ years'], isRequired: false },
    ],
    tags: [
      { name: 'Pre-Approved', color: '#22c55e' },
      { name: 'High Net Worth', color: '#eab308' },
      { name: 'Salaried', color: '#3b82f6' },
      { name: 'Self-Employed', color: '#f97316' },
      { name: 'Mortgage', color: '#8b5cf6' },
      { name: 'Existing Customer', color: '#14b8a6' },
      { name: 'Cross-sell', color: '#06b6d4' },
      { name: 'Referral', color: '#ec4899' },
    ],
  },

  // ─── 8. Hospitality & Travel ───────────────────────────────────────
  {
    id: 'hospitality',
    name: 'Hospitality & Travel',
    description: 'Hotels, resorts, restaurants, tourism, and event venues',
    icon: 'hotel',
    color: '#ec4899',
    pipelineStages: [
      { name: 'New Inquiry', order: 0, color: '#ec4899', isDefault: true },
      { name: 'Requirements Discussed', order: 1, color: '#3b82f6' },
      { name: 'Proposal/Quote Sent', order: 2, color: '#8b5cf6' },
      { name: 'Site Visit/Tasting', order: 3, color: '#f59e0b' },
      { name: 'Negotiation', order: 4, color: '#f97316' },
      { name: 'Booking Confirmed', order: 5, color: '#22c55e', isWonStage: true },
      { name: 'Cancelled', order: 6, color: '#ef4444', isLostStage: true },
    ],
    customFields: [
      { label: 'Service Type', type: 'SELECT', options: ['Room Booking', 'Event/Conference', 'Wedding', 'Corporate Event', 'Restaurant/Dining', 'Tour Package', 'Group Travel', 'Spa/Wellness'], isRequired: false },
      { label: 'Event Date', type: 'DATE', isRequired: false },
      { label: 'Number of Guests', type: 'NUMBER', isRequired: false },
      { label: 'Number of Nights', type: 'NUMBER', isRequired: false },
      { label: 'Room Type', type: 'SELECT', options: ['Standard', 'Deluxe', 'Suite', 'Presidential', 'Villa', 'Dormitory'], isRequired: false },
      { label: 'Special Requirements', type: 'TEXT', isRequired: false },
      { label: 'Estimated Budget', type: 'SELECT', options: ['Under 1,000', '1,000 - 5,000', '5,000 - 10,000', '10,000 - 50,000', 'Above 50,000'], isRequired: false },
      { label: 'Dietary Restrictions', type: 'SELECT', options: ['None', 'Vegetarian', 'Vegan', 'Halal', 'Kosher', 'Gluten-free', 'Other'], isRequired: false },
    ],
    tags: [
      { name: 'Corporate', color: '#3b82f6' },
      { name: 'Wedding', color: '#ec4899' },
      { name: 'Group Booking', color: '#8b5cf6' },
      { name: 'VIP Guest', color: '#eab308' },
      { name: 'Repeat Guest', color: '#22c55e' },
      { name: 'Travel Agent', color: '#06b6d4' },
      { name: 'Walk-in', color: '#f97316' },
      { name: 'Online Booking', color: '#14b8a6' },
    ],
  },

  // ─── 9. Fitness & Wellness ─────────────────────────────────────────
  {
    id: 'fitness',
    name: 'Fitness & Wellness',
    description: 'Gyms, yoga studios, personal training, and wellness programs',
    icon: 'dumbbell',
    color: '#22c55e',
    pipelineStages: [
      { name: 'New Lead', order: 0, color: '#22c55e', isDefault: true },
      { name: 'Trial Scheduled', order: 1, color: '#3b82f6' },
      { name: 'Trial Completed', order: 2, color: '#06b6d4' },
      { name: 'Membership Offered', order: 3, color: '#f59e0b' },
      { name: 'Follow-up', order: 4, color: '#f97316' },
      { name: 'Membership Signed', order: 5, color: '#22c55e', isWonStage: true },
      { name: 'Not Interested', order: 6, color: '#ef4444', isLostStage: true },
    ],
    customFields: [
      { label: 'Interest', type: 'SELECT', options: ['Gym Membership', 'Personal Training', 'Group Classes', 'Yoga/Pilates', 'Swimming', 'CrossFit', 'Martial Arts', 'Dance', 'Kids Program', 'Corporate Wellness'], isRequired: false },
      { label: 'Fitness Goal', type: 'SELECT', options: ['Weight Loss', 'Muscle Gain', 'General Fitness', 'Sports Training', 'Rehabilitation', 'Flexibility', 'Stress Relief'], isRequired: false },
      { label: 'Preferred Time', type: 'SELECT', options: ['Early Morning (5-8am)', 'Morning (8-11am)', 'Afternoon (11am-3pm)', 'Evening (3-7pm)', 'Night (7-10pm)', 'Flexible'], isRequired: false },
      { label: 'Current Fitness Level', type: 'SELECT', options: ['Beginner', 'Intermediate', 'Advanced', 'Returning After Break'], isRequired: false },
      { label: 'Medical Conditions', type: 'TEXT', isRequired: false },
      { label: 'Membership Duration', type: 'SELECT', options: ['1 Month', '3 Months', '6 Months', '1 Year', '2 Years'], isRequired: false },
    ],
    tags: [
      { name: 'Trial Member', color: '#3b82f6' },
      { name: 'Personal Training', color: '#f97316' },
      { name: 'Group Class', color: '#8b5cf6' },
      { name: 'Referral', color: '#22c55e' },
      { name: 'Corporate', color: '#06b6d4' },
      { name: 'Student', color: '#ec4899' },
      { name: 'Renewal Due', color: '#f59e0b' },
    ],
  },

  // ─── 10. Home Services ─────────────────────────────────────────────
  {
    id: 'home_services',
    name: 'Home Services',
    description: 'Cleaning, maintenance, renovation, interior design, and landscaping',
    icon: 'wrench',
    color: '#f59e0b',
    pipelineStages: [
      { name: 'New Request', order: 0, color: '#f59e0b', isDefault: true },
      { name: 'Site Visit Scheduled', order: 1, color: '#3b82f6' },
      { name: 'Site Visit Done', order: 2, color: '#06b6d4' },
      { name: 'Quotation Sent', order: 3, color: '#8b5cf6' },
      { name: 'Negotiation', order: 4, color: '#f97316' },
      { name: 'Work in Progress', order: 5, color: '#14b8a6' },
      { name: 'Completed', order: 6, color: '#22c55e', isWonStage: true },
      { name: 'Cancelled', order: 7, color: '#ef4444', isLostStage: true },
    ],
    customFields: [
      { label: 'Service Type', type: 'SELECT', options: ['Deep Cleaning', 'Regular Cleaning', 'AC Maintenance', 'Plumbing', 'Electrical', 'Painting', 'Renovation', 'Interior Design', 'Landscaping', 'Pest Control', 'Moving/Relocation'], isRequired: false },
      { label: 'Property Type', type: 'SELECT', options: ['Apartment', 'Villa', 'Townhouse', 'Office', 'Retail Shop', 'Warehouse'], isRequired: false },
      { label: 'Property Size (sqft)', type: 'NUMBER', isRequired: false },
      { label: 'Preferred Service Date', type: 'DATE', isRequired: false },
      { label: 'Recurring Service', type: 'BOOLEAN', isRequired: false },
      { label: 'Frequency', type: 'SELECT', options: ['One-time', 'Weekly', 'Bi-weekly', 'Monthly', 'Quarterly', 'Annual'], isRequired: false },
      { label: 'Area/Location', type: 'TEXT', isRequired: false },
      { label: 'Budget Range', type: 'SELECT', options: ['Under 500', '500 - 1,000', '1,000 - 5,000', '5,000 - 10,000', 'Above 10,000'], isRequired: false },
    ],
    tags: [
      { name: 'Emergency', color: '#ef4444' },
      { name: 'Recurring Contract', color: '#22c55e' },
      { name: 'One-time', color: '#3b82f6' },
      { name: 'Commercial', color: '#8b5cf6' },
      { name: 'Residential', color: '#06b6d4' },
      { name: 'Referral', color: '#ec4899' },
      { name: 'Annual Contract', color: '#f59e0b' },
    ],
  },

  // ─── 11. E-Commerce & Retail ───────────────────────────────────────
  {
    id: 'ecommerce',
    name: 'E-Commerce & Retail',
    description: 'Online stores, retail chains, and direct-to-consumer brands',
    icon: 'shopping-cart',
    color: '#a855f7',
    pipelineStages: [
      { name: 'New Lead', order: 0, color: '#a855f7', isDefault: true },
      { name: 'Product Interest', order: 1, color: '#3b82f6' },
      { name: 'Cart/Quote Stage', order: 2, color: '#06b6d4' },
      { name: 'Order Placed', order: 3, color: '#f59e0b' },
      { name: 'Payment Received', order: 4, color: '#14b8a6' },
      { name: 'Fulfilled', order: 5, color: '#22c55e', isWonStage: true },
      { name: 'Abandoned/Lost', order: 6, color: '#ef4444', isLostStage: true },
    ],
    customFields: [
      { label: 'Product Interest', type: 'TEXT', isRequired: false },
      { label: 'Order Value', type: 'NUMBER', isRequired: false },
      { label: 'Customer Type', type: 'SELECT', options: ['B2C Individual', 'B2B Business', 'Wholesale', 'Reseller', 'Dropshipper'], isRequired: false },
      { label: 'Preferred Payment', type: 'SELECT', options: ['Credit Card', 'Debit Card', 'Cash on Delivery', 'Bank Transfer', 'Installments', 'Digital Wallet'], isRequired: false },
      { label: 'Delivery Address', type: 'TEXT', isRequired: false },
      { label: 'Coupon/Promo Code', type: 'TEXT', isRequired: false },
      { label: 'Returning Customer', type: 'BOOLEAN', isRequired: false },
    ],
    tags: [
      { name: 'Cart Abandoned', color: '#f59e0b' },
      { name: 'High Value', color: '#eab308' },
      { name: 'Wholesale', color: '#8b5cf6' },
      { name: 'First Purchase', color: '#3b82f6' },
      { name: 'Returning Customer', color: '#22c55e' },
      { name: 'Discount Seeker', color: '#f97316' },
      { name: 'Social Media Lead', color: '#ec4899' },
    ],
  },

  // ─── 12. General / Default ─────────────────────────────────────────
  {
    id: 'general',
    name: 'General Business',
    description: 'Default template for any business type with standard CRM fields',
    icon: 'briefcase',
    color: '#6b7280',
    pipelineStages: [
      { name: 'New Lead', order: 0, color: '#6366f1', isDefault: true },
      { name: 'Contacted', order: 1, color: '#3b82f6' },
      { name: 'Qualified', order: 2, color: '#06b6d4' },
      { name: 'Proposal Sent', order: 3, color: '#f59e0b' },
      { name: 'Negotiation', order: 4, color: '#f97316' },
      { name: 'Won', order: 5, color: '#22c55e', isWonStage: true },
      { name: 'Lost', order: 6, color: '#ef4444', isLostStage: true },
    ],
    customFields: [
      { label: 'Product/Service Interest', type: 'TEXT', isRequired: false },
      { label: 'Budget Range', type: 'SELECT', options: ['Under 1,000', '1,000 - 5,000', '5,000 - 10,000', '10,000 - 50,000', 'Above 50,000'], isRequired: false },
      { label: 'Decision Timeline', type: 'SELECT', options: ['Immediate', 'This Week', 'This Month', 'This Quarter', 'No Rush'], isRequired: false },
      { label: 'Company Size', type: 'SELECT', options: ['1-10', '11-50', '51-200', '201-500', '500+'], isRequired: false },
      { label: 'Industry', type: 'TEXT', isRequired: false },
      { label: 'Preferred Contact Method', type: 'SELECT', options: ['Phone', 'Email', 'WhatsApp', 'In Person'], isRequired: false },
    ],
    tags: [
      { name: 'Hot Lead', color: '#ef4444' },
      { name: 'Warm Lead', color: '#f59e0b' },
      { name: 'Cold Lead', color: '#3b82f6' },
      { name: 'Referral', color: '#22c55e' },
      { name: 'Follow-up', color: '#f97316' },
      { name: 'VIP', color: '#eab308' },
      { name: 'Partner', color: '#8b5cf6' },
    ],
  },
];

/**
 * Generate camelCase name from a label (same logic as settings.js)
 */
function labelToFieldName(label) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+(.)/g, (_, c) => c.toUpperCase())
    .replace(/\s/g, '');
}

/**
 * Get a template by ID
 */
function getTemplate(templateId) {
  return INDUSTRY_TEMPLATES.find((t) => t.id === templateId) || null;
}

/**
 * Get all templates (for listing)
 */
function getAllTemplates() {
  return INDUSTRY_TEMPLATES.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    icon: t.icon,
    color: t.color,
    stageCount: t.pipelineStages.length,
    fieldCount: t.customFields.length,
    tagCount: t.tags.length,
  }));
}

module.exports = {
  INDUSTRY_TEMPLATES,
  getTemplate,
  getAllTemplates,
  labelToFieldName,
};
