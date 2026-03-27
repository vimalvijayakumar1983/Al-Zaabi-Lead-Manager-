export interface FeatureCatalogItem {
  id: string;
  name: string;
  category:
    | 'Leads & CRM'
    | 'Communication'
    | 'Campaigns & Offers'
    | 'Automation & Reporting'
    | 'Operations'
    | 'Admin & Governance';
  summary: string;
  keywords: string[];
  path: string;
  whereToFind: string;
  howToUse: string[];
}

/**
 * Feature Finder source of truth.
 * Keep this list updated whenever a new user-facing feature/page is shipped.
 */
export const FEATURE_CATALOG: FeatureCatalogItem[] = [
  {
    id: 'dashboard-overview',
    name: 'Dashboard Overview',
    category: 'Leads & CRM',
    summary: 'KPI cards, trends, team and date filters, and division-aware performance view.',
    keywords: ['dashboard', 'kpi', 'team filter', 'date range', 'overview'],
    path: '/dashboard',
    whereToFind: 'Main Menu -> Dashboard',
    howToUse: [
      'Pick period or custom date range from the top filters.',
      'Use Team Member filter to narrow metrics by owner.',
      'Switch division from sidebar to scope all widgets.',
    ],
  },
  {
    id: 'lead-management',
    name: 'Lead Management',
    category: 'Leads & CRM',
    summary: 'Manage lead list, advanced filters, views, quick actions, and lifecycle tracking.',
    keywords: ['lead', 'lead list', 'filters', 'saved views', 'status', 'score'],
    path: '/leads',
    whereToFind: 'Main Menu -> Leads',
    howToUse: [
      'Use search + status filter for quick narrowing.',
      'Open Advanced Filters for tags, recency, call outcomes, and more.',
      'Save current filter setup from the Views sidebar for reuse.',
    ],
  },
  {
    id: 'lead-details',
    name: 'Lead Details Workspace',
    category: 'Leads & CRM',
    summary: 'Single-lead 360 view with notes, activities, tags, offers, and communication history.',
    keywords: ['lead details', 'tags', 'notes', 'activities', 'offer history'],
    path: '/leads',
    whereToFind: 'Open any lead row from Leads page',
    howToUse: [
      'Click a lead row to open full profile.',
      'Edit tags, update lifecycle, and log interactions.',
      'Review active offers and offer history for the lead.',
    ],
  },
  {
    id: 'contacts',
    name: 'Contacts',
    category: 'Leads & CRM',
    summary: 'Contact directory with lifecycle, ownership, and engagement details.',
    keywords: ['contacts', 'contact list', 'directory', 'lifecycle'],
    path: '/contacts',
    whereToFind: 'Main Menu -> Contacts',
    howToUse: [
      'Search and filter contacts by owner and status.',
      'Open contact detail for full profile and history.',
      'Use pagination/export actions for operational follow-up.',
    ],
  },
  {
    id: 'inbox',
    name: 'Omnichannel Inbox',
    category: 'Communication',
    summary: 'Unified inbox for conversations, response tracking, and assignment workflows.',
    keywords: ['inbox', 'whatsapp', 'messages', 'conversation', 'reply'],
    path: '/inbox',
    whereToFind: 'Main Menu -> Inbox',
    howToUse: [
      'Select a thread and reply from the right panel.',
      'Use filters/search to find specific conversations.',
      'Track unread counts and assign follow-up tasks.',
    ],
  },
  {
    id: 'wa-templates',
    name: 'WhatsApp Templates',
    category: 'Communication',
    summary: 'Template sync/management for approved WhatsApp message templates.',
    keywords: ['whatsapp template', 'wa template', 'meta template'],
    path: '/whatsapp-templates',
    whereToFind: 'Messaging -> WA Templates',
    howToUse: [
      'Sync templates from provider configuration.',
      'Search templates by name/category.',
      'Use templates in communication workflows.',
    ],
  },
  {
    id: 'broadcast-lists',
    name: 'Broadcast Lists',
    category: 'Communication',
    summary: 'Build and manage target lists for outbound broadcast communication.',
    keywords: ['broadcast', 'list', 'audience', 'bulk messaging'],
    path: '/broadcast-lists',
    whereToFind: 'Messaging -> Broadcast Lists',
    howToUse: [
      'Create list and define audience criteria.',
      'Review eligible contacts before sending.',
      'Use with scheduled broadcasts for planned campaigns.',
    ],
  },
  {
    id: 'scheduled-broadcasts',
    name: 'Scheduled Broadcasts',
    category: 'Communication',
    summary: 'Schedule and track future outbound campaigns/messages.',
    keywords: ['scheduled', 'broadcast schedule', 'campaign schedule'],
    path: '/scheduled-broadcasts',
    whereToFind: 'Messaging -> Scheduled',
    howToUse: [
      'Create a scheduled message and choose delivery time.',
      'Attach target list or filters.',
      'Monitor status and execution outcomes.',
    ],
  },
  {
    id: 'pipeline',
    name: 'Pipeline Board',
    category: 'Operations',
    summary: 'Stage-based lead movement and conversion visibility.',
    keywords: ['pipeline', 'stages', 'kanban', 'deal flow'],
    path: '/pipeline',
    whereToFind: 'Operations -> Pipeline',
    howToUse: [
      'Drag leads between stages to update progression.',
      'Use stage metrics for conversion bottleneck analysis.',
      'Align stages/status mapping from Settings when needed.',
    ],
  },
  {
    id: 'tasks',
    name: 'Tasks & Follow-ups',
    category: 'Operations',
    summary: 'Create, assign, and monitor tasks with priorities and due dates.',
    keywords: ['tasks', 'follow up', 'assignee', 'due date'],
    path: '/tasks',
    whereToFind: 'Operations -> Tasks',
    howToUse: [
      'Create task and assign owner.',
      'Filter by due date, assignee, and status.',
      'Track overdue tasks and action quickly.',
    ],
  },
  {
    id: 'analytics',
    name: 'Analytics',
    category: 'Automation & Reporting',
    summary: 'Operational analytics across leads, calls, conversion, and productivity.',
    keywords: ['analytics', 'performance', 'reports', 'conversion'],
    path: '/analytics',
    whereToFind: 'Operations -> Analytics',
    howToUse: [
      'Choose report sections and apply date/division filters.',
      'Inspect conversion and activity trends.',
      'Use drilldown links to open scoped lead lists.',
    ],
  },
  {
    id: 'report-builder',
    name: 'Report Builder',
    category: 'Automation & Reporting',
    summary: 'Guided and advanced custom report creation with filters and visual outputs.',
    keywords: ['report builder', 'custom report', 'guided mode', 'dataset'],
    path: '/report-builder',
    whereToFind: 'Operations -> Report Builder',
    howToUse: [
      'Start with Guided Mode preset for common business questions.',
      'Switch to Advanced mode for custom dimensions/measures.',
      'Save report definitions for recurring usage.',
    ],
  },
  {
    id: 'automations',
    name: 'Automations',
    category: 'Automation & Reporting',
    summary: 'Rule-based workflow automation for follow-up and lifecycle actions.',
    keywords: ['automation', 'workflow', 'trigger', 'rule'],
    path: '/automations',
    whereToFind: 'Operations -> Automations',
    howToUse: [
      'Define trigger conditions and matching criteria.',
      'Add action steps (assignment, status updates, notifications).',
      'Enable and monitor rule execution logs.',
    ],
  },
  {
    id: 'campaigns-offer-studio',
    name: 'Campaigns / Offer Studio',
    category: 'Campaigns & Offers',
    summary: 'Build campaign audiences, preview/apply offers, templates, and assignment lifecycle.',
    keywords: ['campaigns', 'offer studio', 'offers', 'audience rules', 'template'],
    path: '/campaigns',
    whereToFind: 'Main Menu -> Campaigns',
    howToUse: [
      'Select campaign and configure audience filters.',
      'Preview audience before apply.',
      'Apply offer and monitor assignment lifecycle/status.',
    ],
  },
  {
    id: 'import-center',
    name: 'Import Center',
    category: 'Operations',
    summary: 'Import leads with mapping, validation, duplicate preview, and downloadable duplicate list.',
    keywords: ['import', 'csv', 'duplicates', 'skipped rows', 'mapping'],
    path: '/import',
    whereToFind: 'Main Menu -> Import',
    howToUse: [
      'Upload file and review column mapping.',
      'Validate and inspect duplicate/skipped rows before final import.',
      'Download duplicate preview for audit/remediation.',
    ],
  },
  {
    id: 'integrations',
    name: 'Integrations',
    category: 'Admin & Governance',
    summary: 'Manage external system integrations and data sync points.',
    keywords: ['integration', 'connectors', 'api', 'sync'],
    path: '/integrations',
    whereToFind: 'Main Menu -> Integrations',
    howToUse: [
      'Open integration card and configure credentials/settings.',
      'Test connectivity and sync health.',
      'Review activity/data tabs for diagnostics.',
    ],
  },
  {
    id: 'team',
    name: 'Team Management',
    category: 'Admin & Governance',
    summary: 'Manage users, assignments, workload, and team structures.',
    keywords: ['team', 'users', 'assignee', 'capacity'],
    path: '/team',
    whereToFind: 'Main Menu -> Team',
    howToUse: [
      'Invite/manage team members.',
      'Review ownership and workload distribution.',
      'Use role and permission settings for access control.',
    ],
  },
  {
    id: 'roles-permissions',
    name: 'Roles & Permissions',
    category: 'Admin & Governance',
    summary: 'Control module visibility and access by role/user override.',
    keywords: ['roles', 'permissions', 'access control', 'module visibility'],
    path: '/roles',
    whereToFind: 'Main Menu -> Roles',
    howToUse: [
      'Select role and configure module permissions.',
      'Apply user-specific overrides only where needed.',
      'Validate permission behavior with target role/account.',
    ],
  },
  {
    id: 'settings',
    name: 'Settings',
    category: 'Admin & Governance',
    summary: 'Organization/division configuration, branding, fields, pipeline and operational controls.',
    keywords: ['settings', 'branding', 'custom fields', 'pipeline stages', 'tags'],
    path: '/settings',
    whereToFind: 'Main Menu -> Settings',
    howToUse: [
      'Navigate tabs for profile, org, and system setup.',
      'Configure division-specific settings where applicable.',
      'Save and test changes in the target workflow.',
    ],
  },
  {
    id: 'divisions',
    name: 'Divisions',
    category: 'Admin & Governance',
    summary: 'Super-admin division administration and scoping.',
    keywords: ['division', 'organization', 'scope', 'multi division'],
    path: '/divisions',
    whereToFind: 'Main Menu -> Divisions (Super Admin)',
    howToUse: [
      'Create or manage division records.',
      'Switch active division from sidebar switcher.',
      'Verify data visibility and scoping per division.',
    ],
  },
  {
    id: 'incentives',
    name: 'Incentives',
    category: 'Automation & Reporting',
    summary: 'Incentive plans, statements, and attribution workflows.',
    keywords: ['incentive', 'commission', 'statement', 'attribution'],
    path: '/incentives',
    whereToFind: 'Main Menu -> Incentives',
    howToUse: [
      'Open Incentives dashboard for high-level status.',
      'Use admin area to configure plan and statement operations.',
      'Use My Incentives for individual earnings visibility.',
    ],
  },
];

