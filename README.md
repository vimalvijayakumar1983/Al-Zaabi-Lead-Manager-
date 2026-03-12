# LeadFlow - Enterprise Lead Management System

A production-ready, enterprise-grade Lead Management System built to compete with Zoho CRM, HubSpot, and Salesforce Essentials. Multi-tenant, AI-enabled, and fully scalable.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                     │
│  ┌──────┐ ┌──────┐ ┌────────┐ ┌──────┐ ┌───────────┐   │
│  │Dashbd│ │Leads │ │Pipeline│ │Tasks │ │Automations│   │
│  └──────┘ └──────┘ └────────┘ └──────┘ └───────────┘   │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────────┐     │
│  │ Analytics │ │Campaigns │ │ Team Management     │     │
│  └──────────┘ └──────────┘ └──────────────────────┘     │
└─────────────────┬───────────────────────────────────────┘
                  │ REST API + WebSocket
┌─────────────────▼───────────────────────────────────────┐
│                  Backend (Node.js/Express)                │
│  ┌─────────────────────────────────────────────────┐     │
│  │ Middleware: Auth (JWT) │ RBAC │ Rate Limit │ Audit│    │
│  └─────────────────────────────────────────────────┘     │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────────┐      │
│  │ Lead │ │ Task │ │Pipe- │ │Comms │ │Automation│      │
│  │ CRUD │ │ Mgmt │ │line  │ │ Hub  │ │  Engine  │      │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────────┘      │
│  ┌────────────┐ ┌────────────┐ ┌────────────────┐       │
│  │ AI Service │ │Lead Assign │ │ Lead Scoring   │       │
│  │(LLM Ready) │ │ Engine     │ │ + Prediction   │       │
│  └────────────┘ └────────────┘ └────────────────┘       │
└──────────┬──────────────┬────────────────┬──────────────┘
           │              │                │
    ┌──────▼──────┐ ┌─────▼─────┐  ┌──────▼──────┐
    │ PostgreSQL  │ │   Redis   │  │ WebSocket   │
    │  (Primary)  │ │  (Cache)  │  │  (Realtime) │
    └─────────────┘ └───────────┘  └─────────────┘
```

## Core Modules

### 1. Lead Capture System
- Multi-source capture: Website forms, Landing pages, WhatsApp, Facebook Ads, Google Ads, Manual entry, CSV Import, API/Webhook
- Duplicate detection by email/phone
- Auto lead scoring (0-100)
- Tagging system with custom fields

### 2. Lead Pipeline Management (Kanban)
- Visual drag-and-drop pipeline
- Customizable stages with colors
- Auto status updates on stage change (Won/Lost)
- Lead timeline with full activity history

### 3. Lead Assignment Engine
- Round-robin assignment (least-loaded)
- Rules-based assignment (e.g., Facebook Ads + Abu Dhabi → Sales Rep A)
- Manual assignment
- Real-time WebSocket notifications

### 4. Task & Follow-up System
- Follow-up calls, meetings, emails, WhatsApp, demos, proposals
- Priority levels (Low/Medium/High/Urgent)
- Overdue task tracking
- Calendar-ready due dates

### 5. Communication Hub
- Email integration (SMTP/Gmail ready)
- WhatsApp Business API ready
- SMS & Voice call logging
- All communications stored in lead timeline

### 6. Lead Intelligence & AI
- Auto lead scoring based on data completeness, source, and activity
- Conversion probability prediction
- AI-powered next action suggestions
- LLM-ready for conversation summarization

### 7. Analytics Dashboard
- KPI cards: Total Leads, Conversion Rate, Pipeline Value
- Conversion funnel visualization
- Lead source performance
- Team performance rankings
- 30-day trend charts

### 8. Automation Workflows
- Trigger-based rules (lead created, status changed, inactive, etc.)
- Conditional logic (field equals, contains, gt, lt)
- Actions: send email/WhatsApp, assign lead, change status, add tag, create task, notify user, fire webhook

### 9. Multi-User Access Control
- Roles: Admin, Manager, Sales Rep, Viewer
- Organization-scoped data isolation (multi-tenant)
- JWT authentication with role-based middleware
- Audit logging

### 10. Mobile-Friendly UI
- Responsive Tailwind CSS design
- Works on desktop, tablet, and mobile
- Clean, minimal UI inspired by HubSpot/Linear/Notion

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS |
| State | Zustand |
| Backend | Node.js, Express.js |
| Database | PostgreSQL (via Prisma ORM) |
| Cache | Redis (via ioredis) |
| Auth | JWT + bcrypt |
| Real-time | WebSocket (ws) |
| Validation | Zod |
| Logging | Winston |
| Containerization | Docker + Docker Compose |

## Database Schema

20+ tables including:
- `organizations` - Multi-tenant orgs
- `users` - Team members with roles
- `leads` - Core lead data with scoring
- `lead_activities` - Full activity timeline
- `lead_notes` - Notes with pinning
- `tasks` - Follow-ups with priorities
- `pipeline_stages` - Customizable Kanban stages
- `communications` - Email/WhatsApp/SMS/Phone logs
- `campaigns` - Marketing campaign tracking
- `automation_rules` - Workflow automation
- `tags` / `lead_tags` - Flexible tagging
- `custom_fields` - Per-org custom fields
- `webhooks` - Inbound/outbound integrations
- `audit_logs` - Full audit trail

## API Endpoints

### Authentication
```
POST   /api/auth/register     - Register org + admin
POST   /api/auth/login        - Login
GET    /api/auth/me           - Current user
```

### Leads
```
GET    /api/leads              - List leads (paginated, filterable)
GET    /api/leads/:id          - Get lead detail
POST   /api/leads              - Create lead (with duplicate detection)
PUT    /api/leads/:id          - Update lead
DELETE /api/leads/:id          - Archive lead
POST   /api/leads/:id/notes   - Add note
PATCH  /api/leads/bulk         - Bulk update
```

### Pipeline
```
GET    /api/pipeline/stages       - Get all stages with leads
POST   /api/pipeline/stages       - Create stage
PUT    /api/pipeline/stages/:id   - Update stage
POST   /api/pipeline/move         - Move lead (drag-and-drop)
POST   /api/pipeline/stages/reorder - Reorder stages
```

### Tasks
```
GET    /api/tasks              - List tasks
POST   /api/tasks              - Create task
PUT    /api/tasks/:id          - Update task
POST   /api/tasks/:id/complete - Complete task
DELETE /api/tasks/:id          - Delete task
```

### Analytics
```
GET    /api/analytics/dashboard        - Dashboard overview
GET    /api/analytics/funnel           - Conversion funnel
GET    /api/analytics/team-performance - Team metrics
GET    /api/analytics/trends           - 30-day trends
```

### Other
```
GET/POST  /api/campaigns       - Campaign CRUD
GET/POST  /api/automations     - Automation rules
GET/POST  /api/users           - User management
GET/POST  /api/webhooks        - Webhook management
POST      /api/import/csv      - CSV lead import
POST      /api/communications  - Log communications
```

## Quick Start

### Prerequisites
- Node.js 22+
- PostgreSQL 16+
- Redis 7+

### Local Development

```bash
# 1. Clone the repository
git clone <repo-url>
cd Al-Zaabi-Lead-Manager-

# 2. Backend setup
cd backend
cp .env.example .env
# Edit .env with your database credentials
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run prisma:seed    # Seeds sample data
npm run dev            # Starts on port 4000

# 3. Frontend setup (in another terminal)
cd frontend
npm install
npm run dev            # Starts on port 3000
```


### Automated Production Deployment (GitHub Actions)

This repository includes `.github/workflows/deploy-production.yml` for automated backend deployment to Railway.

**Trigger**
- Push to `main`
- Or run manually from **Actions → Deploy to Production**

**What it does**
1. Runs backend unit tests (`npm test -- --runInBand`).
2. If tests pass, deploys backend service to the Railway **Production** environment using Railway CLI.

**Required GitHub Secrets**
- `RAILWAY_TOKEN`
- `RAILWAY_PROJECT_ID`
- `RAILWAY_BACKEND_SERVICE`

> After adding these secrets, merges to `main` will auto-deploy the backend to production.

> In Railway, ensure the service **Production Branch** is set to `main` so GitHub app preview builds do not become your primary release path.

### Docker Deployment

```bash
docker-compose up -d
```

This starts PostgreSQL, Redis, Backend API, and Frontend.

### Default Login
```
Email:    admin@alzaabi.ae
Password: password123
```

## Project Structure

```
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma        # Database schema (20+ models)
│   │   └── seed.js              # Sample data seeder
│   ├── src/
│   │   ├── config/              # Environment, logger, database
│   │   ├── middleware/           # Auth, validation, audit, errors
│   │   ├── routes/              # API route handlers
│   │   │   ├── auth.js          # Register, login, profile
│   │   │   ├── leads.js         # Lead CRUD + notes + bulk
│   │   │   ├── pipeline.js      # Kanban pipeline management
│   │   │   ├── tasks.js         # Task management
│   │   │   ├── communications.js # Communication hub
│   │   │   ├── campaigns.js     # Campaign tracking
│   │   │   ├── automations.js   # Workflow rules
│   │   │   ├── analytics.js     # Dashboard + reports
│   │   │   ├── users.js         # Team management
│   │   │   ├── webhooks.js      # Webhook integration
│   │   │   └── import.js        # CSV import
│   │   ├── services/            # Business logic
│   │   │   ├── automationEngine.js  # Rule evaluation & execution
│   │   │   ├── leadAssignment.js    # Round-robin + rules
│   │   │   ├── aiService.js         # AI/LLM integration
│   │   │   └── emailService.js      # SMTP email sending
│   │   ├── utils/               # Scoring, pagination, dedup
│   │   ├── websocket/           # Real-time notifications
│   │   └── index.js             # App entry point
│   ├── tests/                   # Jest test suite
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── (dashboard)/     # Protected dashboard layout
│   │   │   │   ├── dashboard/   # KPI overview
│   │   │   │   ├── leads/       # Lead list + detail pages
│   │   │   │   ├── pipeline/    # Kanban board
│   │   │   │   ├── tasks/       # Task management
│   │   │   │   ├── analytics/   # Charts + reports
│   │   │   │   ├── automations/ # Automation builder
│   │   │   │   ├── campaigns/   # Campaign tracking
│   │   │   │   └── team/        # Team management
│   │   │   ├── login/           # Auth page
│   │   │   └── layout.tsx       # Root layout
│   │   ├── components/          # Shared components (Sidebar)
│   │   ├── lib/                 # API client
│   │   ├── store/               # Zustand auth store
│   │   └── types/               # TypeScript interfaces
│   ├── Dockerfile
│   ├── tailwind.config.ts
│   └── package.json
├── docker-compose.yml
└── README.md
```

## Security Features

- JWT token authentication with expiry
- bcrypt password hashing (12 rounds)
- Role-based access control (RBAC)
- Organization-scoped data isolation
- Input validation with Zod
- Helmet security headers
- CORS configuration
- Rate limiting (1000 req/15min)
- Audit logging for all mutations
- SQL injection protection (Prisma ORM)

## Integration Points

| Service | Status |
|---------|--------|
| Email (SMTP/Gmail) | Ready - configure SMTP in .env |
| WhatsApp Business API | Integration point ready |
| SMS | Integration point ready |
| Voice Calls | Logging ready |
| Facebook Lead Ads | Webhook endpoint ready |
| Google Calendar | Integration point ready |
| Zapier | Webhook support |
| Custom Webhooks | Full CRUD + incoming endpoint |

## Performance

- Prisma ORM with indexed queries
- Paginated API responses (max 100/page)
- Redis cache ready
- WebSocket for real-time updates
- Database indexes on all foreign keys and common query patterns
- Designed for 1M+ leads and 1000+ concurrent users

## License

Proprietary - Al-Zaabi Real Estate
