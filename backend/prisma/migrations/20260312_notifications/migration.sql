-- ============================================================
-- Notification System Migration
-- ============================================================

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    metadata JSONB DEFAULT '{}',
    "entityType" TEXT,
    "entityId" TEXT,
    "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "actorId" TEXT REFERENCES users(id) ON DELETE SET NULL,
    "organizationId" TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications("userId", "isRead");
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_org ON notifications("organizationId");
CREATE INDEX IF NOT EXISTS idx_notifications_entity ON notifications("entityType", "entityId");

-- Notification preferences table
CREATE TABLE IF NOT EXISTS notification_preferences (
    "userId" TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
