-- =============================================================================
-- Al Zaabi CRM — Campaigns & Integrations Migration
-- Generated: 2026-03-12
-- Description: Adds integrations, integration_logs, api_keys tables and
--              extends campaigns with description column and new enum values.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Integrations Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS integrations (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  platform        VARCHAR(50) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'disconnected',
  credentials     JSONB       DEFAULT '{}',
  config          JSONB       DEFAULT '{}',
  last_sync_at    TIMESTAMP,
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by      UUID,
  campaign_id     UUID        REFERENCES campaigns(id) ON DELETE SET NULL,
  created_at      TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integrations_org ON integrations(organization_id);
CREATE INDEX IF NOT EXISTS idx_integrations_platform ON integrations(platform);
CREATE INDEX IF NOT EXISTS idx_integrations_status ON integrations(status);
CREATE INDEX IF NOT EXISTS idx_integrations_campaign ON integrations(campaign_id);

-- ---------------------------------------------------------------------------
-- 2. Integration Logs Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS integration_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id  UUID        NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  action          VARCHAR(50) NOT NULL,
  payload         JSONB       DEFAULT '{}',
  status          VARCHAR(20) NOT NULL DEFAULT 'success',
  lead_id         UUID        REFERENCES leads(id) ON DELETE SET NULL,
  error_message   TEXT,
  created_at      TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integration_logs_integration ON integration_logs(integration_id);
CREATE INDEX IF NOT EXISTS idx_integration_logs_created ON integration_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_integration_logs_status ON integration_logs(status);
CREATE INDEX IF NOT EXISTS idx_integration_logs_lead ON integration_logs(lead_id);

-- ---------------------------------------------------------------------------
-- 3. API Keys Table (for public lead submission)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_keys (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  key             VARCHAR(100) NOT NULL UNIQUE,
  name            VARCHAR(100),
  organization_id UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  is_active       BOOLEAN      DEFAULT true,
  last_used_at    TIMESTAMP,
  created_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(key);
CREATE INDEX IF NOT EXISTS idx_api_keys_org ON api_keys(organization_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active);

-- ---------------------------------------------------------------------------
-- 4. Add description column to campaigns table (if not exists)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaigns' AND column_name = 'description'
  ) THEN
    ALTER TABLE campaigns ADD COLUMN description TEXT;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Extend CampaignType enum with new values
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  ALTER TYPE "CampaignType" ADD VALUE IF NOT EXISTS 'TIKTOK_ADS';
  ALTER TYPE "CampaignType" ADD VALUE IF NOT EXISTS 'WEBSITE_FORM';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Extend LeadSource enum with new values
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  ALTER TYPE "LeadSource" ADD VALUE IF NOT EXISTS 'TIKTOK_ADS';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 7. Auto-update updated_at trigger for integrations
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_integrations_updated_at ON integrations;
CREATE TRIGGER trigger_integrations_updated_at
  BEFORE UPDATE ON integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
