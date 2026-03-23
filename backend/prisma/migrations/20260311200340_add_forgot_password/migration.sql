-- Add password reset fields to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS "resetToken" TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "resetTokenExpiry" TIMESTAMP(3);

-- Create email settings table
CREATE TABLE IF NOT EXISTS "email_settings" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "smtpHost" TEXT NOT NULL DEFAULT 'mail.alzaabigroup.com',
  "smtpPort" INTEGER NOT NULL DEFAULT 465,
  "smtpSecure" BOOLEAN NOT NULL DEFAULT true,
  "smtpUsername" TEXT NOT NULL DEFAULT '',
  "smtpPassword" TEXT NOT NULL DEFAULT '',
  "fromEmail" TEXT NOT NULL DEFAULT '',
  "fromName" TEXT NOT NULL DEFAULT 'Al-Zaabi Lead Manager',
  "imapHost" TEXT DEFAULT '',
  "imapPort" INTEGER DEFAULT 993,
  "imapSecure" BOOLEAN DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("organizationId")
);
