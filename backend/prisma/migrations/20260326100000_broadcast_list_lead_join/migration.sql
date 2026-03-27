-- Create lead-based join table for WhatsApp broadcast recipients.
CREATE TABLE "whatsapp_broadcast_list_leads" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_broadcast_list_leads_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "whatsapp_broadcast_list_leads_listId_idx" ON "whatsapp_broadcast_list_leads"("listId");
CREATE INDEX "whatsapp_broadcast_list_leads_leadId_idx" ON "whatsapp_broadcast_list_leads"("leadId");
CREATE UNIQUE INDEX "whatsapp_broadcast_list_leads_listId_leadId_key" ON "whatsapp_broadcast_list_leads"("listId", "leadId");

ALTER TABLE "whatsapp_broadcast_list_leads"
  ADD CONSTRAINT "whatsapp_broadcast_list_leads_listId_fkey"
  FOREIGN KEY ("listId") REFERENCES "whatsapp_broadcast_lists"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "whatsapp_broadcast_list_leads"
  ADD CONSTRAINT "whatsapp_broadcast_list_leads_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "leads"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill any missing lead links in old member rows by matching normalized phone.
UPDATE "whatsapp_broadcast_list_members" m
SET "leadId" = l."id"
FROM "whatsapp_broadcast_lists" bl
JOIN "leads" l ON l."organizationId" = bl."organizationId"
WHERE m."listId" = bl."id"
  AND l."isArchived" = false
  AND regexp_replace(COALESCE(l."phone", ''), '\D', '', 'g') = m."phone"
  AND m."leadId" IS NULL;

-- For any unresolved member row, create a minimal lead so broadcast recipients stay lead-centric.
WITH unresolved AS (
  SELECT
    m."id" AS member_id,
    m."phone",
    m."phoneRaw",
    m."displayName",
    bl."organizationId"
  FROM "whatsapp_broadcast_list_members" m
  JOIN "whatsapp_broadcast_lists" bl ON bl."id" = m."listId"
  WHERE m."leadId" IS NULL
),
prepared AS (
  SELECT
    u.*,
    COALESCE(NULLIF(trim(u."displayName"), ''), 'WhatsApp Lead') AS full_name,
    -- Generate uuid-like ids without requiring DB extensions.
    lower(
      substr(h, 1, 8) || '-' ||
      substr(h, 9, 4) || '-' ||
      '4' || substr(h, 14, 3) || '-' ||
      'a' || substr(h, 18, 3) || '-' ||
      substr(h, 21, 12)
    ) AS lead_id
  FROM (
    SELECT
      u.*,
      md5(u.member_id || ':' || clock_timestamp()::text || ':' || random()::text) AS h
    FROM unresolved u
  ) u
)
INSERT INTO "leads" (
  "id",
  "firstName",
  "lastName",
  "phone",
  "source",
  "sourceDetail",
  "organizationId",
  "createdAt",
  "updatedAt"
)
SELECT
  p.lead_id,
  split_part(p.full_name, ' ', 1),
  CASE
    WHEN position(' ' in p.full_name) > 0 THEN btrim(substr(p.full_name, position(' ' in p.full_name) + 1))
    ELSE ''
  END,
  COALESCE(NULLIF(trim(p."phoneRaw"), ''), p."phone"),
  'WHATSAPP'::"LeadSource",
  'BROADCAST_IMPORT',
  p."organizationId",
  NOW(),
  NOW()
FROM prepared p;

-- Fill member leadId after creating new leads, matched by normalized phone + org.
UPDATE "whatsapp_broadcast_list_members" m
SET "leadId" = l."id"
FROM "whatsapp_broadcast_lists" bl
JOIN "leads" l ON l."organizationId" = bl."organizationId"
WHERE m."listId" = bl."id"
  AND l."isArchived" = false
  AND regexp_replace(COALESCE(l."phone", ''), '\D', '', 'g') = m."phone"
  AND m."leadId" IS NULL;

-- Backfill list<->lead join records from old members.
INSERT INTO "whatsapp_broadcast_list_leads" ("id", "listId", "leadId", "createdAt")
SELECT
  lower(
    substr(h, 1, 8) || '-' ||
    substr(h, 9, 4) || '-' ||
    '4' || substr(h, 14, 3) || '-' ||
    'a' || substr(h, 18, 3) || '-' ||
    substr(h, 21, 12)
  ) AS id,
  t."listId",
  t."leadId",
  COALESCE(t."createdAt", NOW())
FROM (
  SELECT DISTINCT
    m."listId",
    m."leadId",
    m."createdAt",
    md5(m."id" || ':' || COALESCE(m."leadId", '') || ':' || random()::text) AS h
  FROM "whatsapp_broadcast_list_members" m
  WHERE m."leadId" IS NOT NULL
) t
ON CONFLICT ("listId", "leadId") DO NOTHING;

-- Keep denormalized count in sync with new lead-based joins.
UPDATE "whatsapp_broadcast_lists" bl
SET "memberCount" = c.cnt
FROM (
  SELECT "listId", COUNT(*)::int AS cnt
  FROM "whatsapp_broadcast_list_leads"
  GROUP BY "listId"
) c
WHERE bl."id" = c."listId";
