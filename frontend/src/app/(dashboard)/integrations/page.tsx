'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Activity,
  Search,
  Music,
  Globe,
  MessageSquare,
  Mail,
  Link2,
  Zap,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Plus,
  Copy,
  Trash2,
  Eye,
  EyeOff,
  Settings,
  ArrowRight,
  ExternalLink,
  Clock,
  Shield,
  Key,
  Code2,
  Bell,
  X,
  Play,
  ToggleLeft,
  ToggleRight,
  Loader2,
  Filter,
  Palette,
  Monitor,
  Building2,
  FileText,
  Plug,
  Database,
  Sparkles,
  CircleDot,
  Workflow,
  Info,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import type { User, Organization } from '@/types';

// ---------------------------------------------------------------------------
// Local interfaces
// ---------------------------------------------------------------------------

interface Integration {
  id: string;
  platform: string;
  name: string;
  status: 'connected' | 'disconnected' | 'error' | 'syncing';
  config: Record<string, unknown>;
  fieldMapping?: FieldMapping[];
  lastSync?: string;
  leadsCaptures?: number;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  divisionId?: string;
}

interface FieldMapping {
  source: string;
  target: string;
  transform?: string;
}

interface IntegrationLog {
  id: string;
  integrationId: string;
  event: string;
  status: 'success' | 'error' | 'warning' | 'info';
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

interface Platform {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  available: boolean;
}

interface ApiKeyItem {
  id: string;
  name: string;
  key: string;
  endpoint: string;
  status: 'active' | 'revoked';
  lastUsed?: string;
  createdAt: string;
}

interface WidgetConfig {
  fields: string[];
  formTitle: string;
  submitButtonText: string;
  successMessage: string;
  divisionId: string;
  backgroundColor: string;
  buttonColor: string;
}

interface WebhookItem {
  id: string;
  name: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Platform definitions
// ---------------------------------------------------------------------------

interface PlatformDef {
  slug: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
  available: boolean;
  comingSoon?: boolean;
}

const PLATFORM_DEFS: PlatformDef[] = [
  {
    slug: 'facebook',
    name: 'Facebook Lead Ads',
    description: 'Auto-capture leads from Facebook Lead Ad forms',
    icon: <Activity className="w-6 h-6" />,
    color: '#1877F2',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    available: true,
  },
  {
    slug: 'google_ads',
    name: 'Google Ads',
    description: 'Import leads from Google Ads campaigns and forms',
    icon: <Search className="w-6 h-6" />,
    color: '#4285F4',
    bgColor: 'bg-sky-50',
    borderColor: 'border-sky-200',
    available: true,
  },
  {
    slug: 'tiktok',
    name: 'TikTok Ads',
    description: 'Capture leads from TikTok Lead Generation campaigns',
    icon: <Music className="w-6 h-6" />,
    color: '#00F2EA',
    bgColor: 'bg-teal-50',
    borderColor: 'border-teal-200',
    available: false,
    comingSoon: true,
  },
  {
    slug: 'website_forms',
    name: 'Website Forms',
    description: 'Embed customizable lead capture forms on your website',
    icon: <Globe className="w-6 h-6" />,
    color: '#3B82F6',
    bgColor: 'bg-indigo-50',
    borderColor: 'border-indigo-200',
    available: true,
  },
  {
    slug: 'whatsapp',
    name: 'WhatsApp Business',
    description: 'Auto-create leads from WhatsApp conversations',
    icon: <MessageSquare className="w-6 h-6" />,
    color: '#25D366',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    available: true,
  },
  {
    slug: 'email',
    name: 'Email',
    description: 'Connect email for lead capture and notifications',
    icon: <Mail className="w-6 h-6" />,
    color: '#6366F1',
    bgColor: 'bg-violet-50',
    borderColor: 'border-violet-200',
    available: true,
  },
  {
    slug: 'webhooks',
    name: 'Webhooks',
    description: 'Create custom webhook endpoints for any data source',
    icon: <Link2 className="w-6 h-6" />,
    color: '#8B5CF6',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
    available: true,
  },
  {
    slug: 'zapier',
    name: 'Zapier',
    description: 'Connect 5,000+ apps through Zapier automations',
    icon: <Zap className="w-6 h-6" />,
    color: '#FF4A00',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    available: true,
  },
];

const WEBHOOK_EVENTS = [
  'lead.created',
  'lead.updated',
  'lead.status_changed',
  'deal.created',
  'deal.won',
  'deal.lost',
  'contact.created',
  'contact.updated',
  'note.created',
  'task.completed',
];

const CRM_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'company',
  'jobTitle',
  'source',
  'notes',
  'budget',
  'city',
];

const formatDate = (dateStr: string): string =>
  new Date(dateStr).toLocaleDateString('en-AE', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: Integration['status'] }) {
  const map: Record<
    Integration['status'],
    { label: string; cls: string; icon: React.ReactNode }
  > = {
    connected: {
      label: 'Connected',
      cls: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/10',
      icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    },
    disconnected: {
      label: 'Not Connected',
      cls: 'bg-gray-50 text-gray-500 ring-1 ring-gray-300/50',
      icon: <CircleDot className="w-3.5 h-3.5" />,
    },
    error: {
      label: 'Error',
      cls: 'bg-red-50 text-red-700 ring-1 ring-red-600/10',
      icon: <XCircle className="w-3.5 h-3.5" />,
    },
    syncing: {
      label: 'Syncing',
      cls: 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/10',
      icon: <RefreshCw className="w-3.5 h-3.5 animate-spin" />,
    },
  };
  const cfg = map[status];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
      <div className={`p-3 rounded-xl ${color}`}>{icon}</div>
      <div>
        <p className="text-2xl font-bold text-text-primary">{value}</p>
        <p className="text-sm text-text-secondary">{label}</p>
      </div>
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
    >
      {copied ? (
        <>
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          Copied!
        </>
      ) : (
        <>
          <Copy className="w-3.5 h-3.5" />
          {label ?? 'Copy'}
        </>
      )}
    </button>
  );
}

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-2">{title}</h3>
        <p className="text-sm text-text-secondary mb-6">{message}</p>
        <div className="flex items-center justify-end gap-3">
          <button onClick={onCancel} className="btn-secondary text-sm px-4 py-2">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function IntegrationsPage() {
  const { user } = useAuthStore() as { user: User | null };
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  // State: data
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [logs, setLogs] = useState<IntegrationLog[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);

  // State: division
  const [selectedDivision, setSelectedDivision] = useState<string>('all');
  const [divisions, setDivisions] = useState<Organization[]>([]);

  // State: modals
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformDef | null>(null);
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);
  const [detailLogs, setDetailLogs] = useState<IntegrationLog[]>([]);

  // State: forms
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);

  // State: Facebook form
  const [fbPageId, setFbPageId] = useState('');
  const [fbAppSecret, setFbAppSecret] = useState('');
  const [fbLeadFormIds, setFbLeadFormIds] = useState('');
  const [fbFieldMapping, setFbFieldMapping] = useState<FieldMapping[]>([
    { source: 'full_name', target: 'firstName' },
    { source: 'email', target: 'email' },
    { source: 'phone_number', target: 'phone' },
  ]);

  // State: Google Ads form
  const [gaCustomerId, setGaCustomerId] = useState('');
  const [gaCampaignId, setGaCampaignId] = useState('');
  const [gaUtmSource, setGaUtmSource] = useState(true);
  const [gaUtmMedium, setGaUtmMedium] = useState(true);
  const [gaUtmCampaign, setGaUtmCampaign] = useState(true);
  const [gaFieldMapping, setGaFieldMapping] = useState<FieldMapping[]>([
    { source: 'lead_name', target: 'firstName' },
    { source: 'lead_email', target: 'email' },
    { source: 'lead_phone', target: 'phone' },
  ]);

  // State: WhatsApp form
  const [waAccountId, setWaAccountId] = useState('');
  const [waPhoneNumberId, setWaPhoneNumberId] = useState('');
  const [waAccessToken, setWaAccessToken] = useState('');
  const [waVerifyToken, setWaVerifyToken] = useState('');
  const [waAutoCreateLead, setWaAutoCreateLead] = useState(true);

  // State: Email form
  const [emailHost, setEmailHost] = useState('');
  const [emailPort, setEmailPort] = useState('587');
  const [emailUsername, setEmailUsername] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailFromName, setEmailFromName] = useState('');
  const [emailReplyTo, setEmailReplyTo] = useState('');
  const [emailBcc, setEmailBcc] = useState('');

  // State: Webhook form
  const [webhookName, setWebhookName] = useState('');
  const [webhookEvents, setWebhookEvents] = useState<string[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookItem[]>([]);

  // State: Widget form
  const [widgetConfig, setWidgetConfig] = useState<WidgetConfig>({
    fields: ['firstName', 'lastName', 'email', 'phone', 'company', 'notes'],
    formTitle: 'Get in Touch',
    submitButtonText: 'Submit',
    successMessage: 'Thank you! We will contact you shortly.',
    divisionId: '',
    backgroundColor: '#FFFFFF',
    buttonColor: '#3B82F6',
  });
  const [widgetCode, setWidgetCode] = useState('');
  const [widgetPreviewUrl, setWidgetPreviewUrl] = useState('');

  // State: API Key form
  const [newKeyName, setNewKeyName] = useState('');
  const [generatedKey, setGeneratedKey] = useState<{ apiKey: string; endpoint: string } | null>(
    null
  );
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());

  // State: Activity log filter
  const [logFilter, setLogFilter] = useState<string>('all');

  // State: TikTok notify
  const [tiktokNotified, setTiktokNotified] = useState(false);

  // State: show password fields
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  // -------------------------------------------------------------------------
  // Load data
  // -------------------------------------------------------------------------
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [integrationsData, apiKeysData] = await Promise.all([
        api.getIntegrations() as unknown as Promise<Integration[]>,
        api.getApiKeys() as unknown as Promise<ApiKeyItem[]>,
      ]);
      setIntegrations(integrationsData);
      setApiKeys(apiKeysData);

      if (isSuperAdmin && user?.organization) {
        const allDivisions: Organization[] = [];
        const gather = (org: Organization) => {
          if (org.type === 'DIVISION') allDivisions.push(org);
          org.children?.forEach(gather);
        };
        gather(user.organization);
        setDivisions(allDivisions);
      }
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin, user]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const loadLogs = useCallback(async () => {
    try {
      setLogsLoading(true);
      const allLogs: IntegrationLog[] = [];
      for (const intg of integrations.filter((i) => i.status !== 'disconnected')) {
        try {
          const l = (await api.getIntegrationLogs(intg.id, { limit: 10 })) as unknown as IntegrationLog[];
          allLogs.push(...l);
        } catch {
          // skip
        }
      }
      allLogs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setLogs(allLogs.slice(0, 50));
    } catch {
      // silently handle
    } finally {
      setLogsLoading(false);
    }
  }, [integrations]);

  useEffect(() => {
    if (integrations.length > 0) {
      void loadLogs();
    }
  }, [integrations, loadLogs]);

  // -------------------------------------------------------------------------
  // Computed stats
  // -------------------------------------------------------------------------
  const filteredIntegrations = useMemo(() => {
    if (selectedDivision === 'all') return integrations;
    return integrations.filter((i) => i.divisionId === selectedDivision);
  }, [integrations, selectedDivision]);

  const stats = useMemo(() => {
    const total = filteredIntegrations.length;
    const connected = filteredIntegrations.filter((i) => i.status === 'connected').length;
    const syncing = filteredIntegrations.filter((i) => i.status === 'syncing').length;
    const errors = filteredIntegrations.filter((i) => i.status === 'error').length;
    return { total, connected, syncing, errors };
  }, [filteredIntegrations]);

  const getIntegrationForPlatform = (slug: string): Integration | undefined =>
    filteredIntegrations.find((i) => i.platform === slug);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const openConnectModal = (platform: PlatformDef) => {
    setSelectedPlatform(platform);
    setTestResult(null);
    const existing = getIntegrationForPlatform(platform.slug);
    if (existing) {
      prefillForm(platform.slug, existing);
    } else {
      resetForm(platform.slug);
    }
    setActiveModal('connect');
  };

  const openManageModal = async (platform: PlatformDef) => {
    const intg = getIntegrationForPlatform(platform.slug);
    if (!intg) return;
    setSelectedPlatform(platform);
    setSelectedIntegration(intg);
    setTestResult(null);
    try {
      const detail = (await api.getIntegration(intg.id)) as unknown as {
        integration: Integration;
        logs: IntegrationLog[];
      };
      setSelectedIntegration(detail.integration);
      setDetailLogs(detail.logs);
    } catch {
      setDetailLogs([]);
    }
    setActiveModal('manage');
  };

  const prefillForm = (slug: string, intg: Integration) => {
    const cfg = (intg.config as unknown) as Record<string, string | boolean | string[]>;
    switch (slug) {
      case 'facebook':
        setFbPageId((cfg.pageId as string) ?? '');
        setFbAppSecret((cfg.appSecret as string) ?? '');
        setFbLeadFormIds((cfg.leadFormIds as string) ?? '');
        setFbFieldMapping(intg.fieldMapping ?? []);
        break;
      case 'google_ads':
        setGaCustomerId((cfg.customerId as string) ?? '');
        setGaCampaignId((cfg.campaignId as string) ?? '');
        setGaUtmSource((cfg.utmSource as boolean) ?? true);
        setGaUtmMedium((cfg.utmMedium as boolean) ?? true);
        setGaUtmCampaign((cfg.utmCampaign as boolean) ?? true);
        setGaFieldMapping(intg.fieldMapping ?? []);
        break;
      case 'whatsapp':
        setWaAccountId((cfg.accountId as string) ?? '');
        setWaPhoneNumberId((cfg.phoneNumberId as string) ?? '');
        setWaAccessToken((cfg.accessToken as string) ?? '');
        setWaVerifyToken((cfg.verifyToken as string) ?? '');
        setWaAutoCreateLead((cfg.autoCreateLead as boolean) ?? true);
        break;
      case 'email':
        setEmailHost((cfg.host as string) ?? '');
        setEmailPort((cfg.port as string) ?? '587');
        setEmailUsername((cfg.username as string) ?? '');
        setEmailPassword((cfg.password as string) ?? '');
        setEmailFromName((cfg.fromName as string) ?? '');
        setEmailReplyTo((cfg.replyTo as string) ?? '');
        setEmailBcc((cfg.bcc as string) ?? '');
        break;
      default:
        break;
    }
  };

  const resetForm = (slug: string) => {
    switch (slug) {
      case 'facebook':
        setFbPageId('');
        setFbAppSecret('');
        setFbLeadFormIds('');
        setFbFieldMapping([
          { source: 'full_name', target: 'firstName' },
          { source: 'email', target: 'email' },
          { source: 'phone_number', target: 'phone' },
        ]);
        break;
      case 'google_ads':
        setGaCustomerId('');
        setGaCampaignId('');
        setGaUtmSource(true);
        setGaUtmMedium(true);
        setGaUtmCampaign(true);
        setGaFieldMapping([
          { source: 'lead_name', target: 'firstName' },
          { source: 'lead_email', target: 'email' },
          { source: 'lead_phone', target: 'phone' },
        ]);
        break;
      case 'whatsapp':
        setWaAccountId('');
        setWaPhoneNumberId('');
        setWaAccessToken('');
        setWaVerifyToken('');
        setWaAutoCreateLead(true);
        break;
      case 'email':
        setEmailHost('');
        setEmailPort('587');
        setEmailUsername('');
        setEmailPassword('');
        setEmailFromName('');
        setEmailReplyTo('');
        setEmailBcc('');
        break;
      default:
        break;
    }
  };

  const buildPayload = (slug: string): Record<string, unknown> => {
    switch (slug) {
      case 'facebook':
        return {
          platform: 'facebook',
          name: 'Facebook Lead Ads',
          config: {
            pageId: fbPageId,
            appSecret: fbAppSecret,
            leadFormIds: fbLeadFormIds,
          },
          fieldMapping: fbFieldMapping,
          divisionId: selectedDivision !== 'all' ? selectedDivision : undefined,
        };
      case 'google_ads':
        return {
          platform: 'google_ads',
          name: 'Google Ads',
          config: {
            customerId: gaCustomerId,
            campaignId: gaCampaignId,
            utmSource: gaUtmSource,
            utmMedium: gaUtmMedium,
            utmCampaign: gaUtmCampaign,
          },
          fieldMapping: gaFieldMapping,
          divisionId: selectedDivision !== 'all' ? selectedDivision : undefined,
        };
      case 'whatsapp':
        return {
          platform: 'whatsapp',
          name: 'WhatsApp Business',
          config: {
            accountId: waAccountId,
            phoneNumberId: waPhoneNumberId,
            accessToken: waAccessToken,
            verifyToken: waVerifyToken,
            autoCreateLead: waAutoCreateLead,
          },
          divisionId: selectedDivision !== 'all' ? selectedDivision : undefined,
        };
      case 'email':
        return {
          platform: 'email',
          name: 'Email',
          config: {
            host: emailHost,
            port: emailPort,
            username: emailUsername,
            password: emailPassword,
            fromName: emailFromName,
            replyTo: emailReplyTo,
            bcc: emailBcc,
          },
          divisionId: selectedDivision !== 'all' ? selectedDivision : undefined,
        };
      default:
        return {};
    }
  };

  const handleSaveIntegration = async () => {
    if (!selectedPlatform) return;
    try {
      setSaving(true);
      const payload = buildPayload(selectedPlatform.slug);
      const existing = getIntegrationForPlatform(selectedPlatform.slug);
      if (existing) {
        await api.updateIntegration(existing.id, payload);
      } else {
        await api.createIntegration(payload);
      }
      await loadData();
      setActiveModal(null);
    } catch {
      // handle error silently
    } finally {
      setSaving(false);
    }
  };

  const handleTestIntegration = async (integrationId: string) => {
    try {
      setTesting(true);
      setTestResult(null);
      const result = (await api.testIntegration(integrationId)) as unknown as {
        success: boolean;
        message: string;
      };
      setTestResult(result);
    } catch {
      setTestResult({ success: false, message: 'Test failed. Please check your configuration.' });
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnect = (intg: Integration) => {
    setConfirmAction({
      title: 'Disconnect Integration',
      message: `Are you sure you want to disconnect "${intg.name}"? This will stop all data synchronization.`,
      confirmLabel: 'Disconnect',
      onConfirm: async () => {
        try {
          await api.deleteIntegration(intg.id);
          await loadData();
          setActiveModal(null);
          setConfirmAction(null);
        } catch {
          setConfirmAction(null);
        }
      },
    });
  };

  const handleSyncNow = async (intg: Integration) => {
    try {
      await api.testIntegration(intg.id);
      await loadData();
    } catch {
      // silently handle
    }
  };

  // Webhook handlers
  const handleCreateWebhook = async () => {
    if (!webhookName || webhookEvents.length === 0) return;
    try {
      setSaving(true);
      const payload = {
        platform: 'webhooks',
        name: webhookName,
        config: {
          events: webhookEvents,
        },
        divisionId: selectedDivision !== 'all' ? selectedDivision : undefined,
      };
      await api.createIntegration(payload);
      await loadData();
      setWebhookName('');
      setWebhookEvents([]);
    } catch {
      // handle error
    } finally {
      setSaving(false);
    }
  };

  // Widget handlers
  const handleGenerateWidget = async () => {
    try {
      setSaving(true);
      const divId = widgetConfig.divisionId || (selectedDivision !== 'all' ? selectedDivision : '');
      const result = (await api.generateWidget(divId)) as unknown as {
        code: string;
        previewUrl: string;
      };
      setWidgetCode(result.code);
      setWidgetPreviewUrl(result.previewUrl);

      const payload = {
        platform: 'website_forms',
        name: 'Website Form',
        config: { ...widgetConfig },
        divisionId: divId || undefined,
      };
      const existing = getIntegrationForPlatform('website_forms');
      if (existing) {
        await api.updateIntegration(existing.id, payload);
      } else {
        await api.createIntegration(payload);
      }
      await loadData();
    } catch {
      // handle error
    } finally {
      setSaving(false);
    }
  };

  // API key handlers
  const handleGenerateApiKey = async () => {
    if (!newKeyName.trim()) return;
    try {
      setSaving(true);
      const result = (await api.generateApiKey(newKeyName)) as unknown as {
        apiKey: string;
        endpoint: string;
      };
      setGeneratedKey(result);
      await loadData();
    } catch {
      // handle error
    } finally {
      setSaving(false);
    }
  };

  const handleRevokeApiKey = (key: ApiKeyItem) => {
    setConfirmAction({
      title: 'Revoke API Key',
      message: `Are you sure you want to revoke "${key.name}"? This action cannot be undone.`,
      confirmLabel: 'Revoke',
      onConfirm: async () => {
        try {
          await api.revokeApiKey(key.id);
          await loadData();
          setConfirmAction(null);
        } catch {
          setConfirmAction(null);
        }
      },
    });
  };

  const toggleSecretVisibility = (key: string) => {
    setShowSecrets((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleKeyRevealed = (id: string) => {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleWebhookEvent = (evt: string) => {
    setWebhookEvents((prev) =>
      prev.includes(evt) ? prev.filter((e) => e !== evt) : [...prev, evt]
    );
  };

  const updateFieldMapping = (
    mappings: FieldMapping[],
    setMappings: React.Dispatch<React.SetStateAction<FieldMapping[]>>,
    index: number,
    field: 'source' | 'target',
    value: string
  ) => {
    const updated = [...mappings];
    updated[index] = { ...updated[index], [field]: value };
    setMappings(updated);
  };

  const addFieldMapping = (
    mappings: FieldMapping[],
    setMappings: React.Dispatch<React.SetStateAction<FieldMapping[]>>
  ) => {
    setMappings([...mappings, { source: '', target: '' }]);
  };

  const removeFieldMapping = (
    mappings: FieldMapping[],
    setMappings: React.Dispatch<React.SetStateAction<FieldMapping[]>>,
    index: number
  ) => {
    setMappings(mappings.filter((_, i) => i !== index));
  };

  const filteredLogs = useMemo(() => {
    if (logFilter === 'all') return logs;
    return logs.filter((l) => {
      const intg = integrations.find((i) => i.id === l.integrationId);
      return intg?.platform === logFilter;
    });
  }, [logs, logFilter, integrations]);

  // -------------------------------------------------------------------------
  // Render: field mapping table
  // -------------------------------------------------------------------------
  const renderFieldMappingTable = (
    mappings: FieldMapping[],
    setMappings: React.Dispatch<React.SetStateAction<FieldMapping[]>>,
    sourceLabel: string
  ) => (
    <div>
      <label className="block text-sm font-medium text-text-primary mb-2">Field Mapping</label>
      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_auto_1fr_auto] gap-2 items-center text-xs font-medium text-text-secondary">
          <span>{sourceLabel} Field</span>
          <span />
          <span>CRM Field</span>
          <span />
        </div>
        {mappings.map((m, i) => (
          <div key={i} className="grid grid-cols-[1fr_auto_1fr_auto] gap-2 items-center">
            <input
              type="text"
              value={m.source}
              onChange={(e) => updateFieldMapping(mappings, setMappings, i, 'source', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              placeholder="Source field"
            />
            <ArrowRight className="w-4 h-4 text-text-tertiary" />
            <select
              value={m.target}
              onChange={(e) => updateFieldMapping(mappings, setMappings, i, 'target', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            >
              <option value="">Select CRM field</option>
              {CRM_FIELDS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <button
              onClick={() => removeFieldMapping(mappings, setMappings, i)}
              className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={() => addFieldMapping(mappings, setMappings)}
        className="mt-2 inline-flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 font-medium"
      >
        <Plus className="w-4 h-4" /> Add mapping
      </button>
    </div>
  );

  // -------------------------------------------------------------------------
  // Render: Connect modal body per platform
  // -------------------------------------------------------------------------
  const renderConnectForm = () => {
    if (!selectedPlatform) return null;
    switch (selectedPlatform.slug) {
      case 'facebook':
        return (
          <div className="space-y-4">
            <p className="text-xs text-text-tertiary bg-blue-50 rounded-lg p-3 flex items-start gap-2">
              <Info className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-500" />
              These credentials will be used when Facebook OAuth is configured. Enter your Facebook
              app details to enable lead ad webhook reception.
            </p>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Facebook Page ID
              </label>
              <input
                type="text"
                value={fbPageId}
                onChange={(e) => setFbPageId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                placeholder="e.g., 123456789012345"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Facebook App Secret
              </label>
              <div className="relative">
                <input
                  type={showSecrets['fbAppSecret'] ? 'text' : 'password'}
                  value={fbAppSecret}
                  onChange={(e) => setFbAppSecret(e.target.value)}
                  className="w-full px-3 py-2 pr-10 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  placeholder="Used for webhook verification"
                />
                <button
                  type="button"
                  onClick={() => toggleSecretVisibility('fbAppSecret')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-tertiary hover:text-text-secondary"
                >
                  {showSecrets['fbAppSecret'] ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Lead Form ID(s)
              </label>
              <input
                type="text"
                value={fbLeadFormIds}
                onChange={(e) => setFbLeadFormIds(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                placeholder="Comma-separated, e.g., 111222333, 444555666"
              />
              <p className="text-xs text-text-tertiary mt-1">
                Leave empty to capture from all forms on this page
              </p>
            </div>
            {renderFieldMappingTable(fbFieldMapping, setFbFieldMapping, 'Facebook')}
          </div>
        );

      case 'google_ads':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Google Ads Customer ID
              </label>
              <input
                type="text"
                value={gaCustomerId}
                onChange={(e) => setGaCustomerId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                placeholder="e.g., 123-456-7890"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Campaign ID
              </label>
              <input
                type="text"
                value={gaCampaignId}
                onChange={(e) => setGaCampaignId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                placeholder="e.g., 12345678901"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                UTM Auto-Attribution
              </label>
              <div className="space-y-2">
                {[
                  { label: 'utm_source', value: gaUtmSource, set: setGaUtmSource },
                  { label: 'utm_medium', value: gaUtmMedium, set: setGaUtmMedium },
                  { label: 'utm_campaign', value: gaUtmCampaign, set: setGaUtmCampaign },
                ].map((item) => (
                  <label
                    key={item.label}
                    className="flex items-center gap-3 cursor-pointer"
                  >
                    <button
                      type="button"
                      onClick={() => item.set(!item.value)}
                      className="text-text-secondary"
                    >
                      {item.value ? (
                        <ToggleRight className="w-8 h-5 text-brand-600" />
                      ) : (
                        <ToggleLeft className="w-8 h-5 text-gray-400" />
                      )}
                    </button>
                    <span className="text-sm text-text-primary font-mono">{item.label}</span>
                  </label>
                ))}
              </div>
            </div>
            {renderFieldMappingTable(gaFieldMapping, setGaFieldMapping, 'Google Ads')}
          </div>
        );

      case 'whatsapp':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                WhatsApp Business Account ID
              </label>
              <input
                type="text"
                value={waAccountId}
                onChange={(e) => setWaAccountId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                placeholder="e.g., 102938475610293"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Phone Number ID
              </label>
              <input
                type="text"
                value={waPhoneNumberId}
                onChange={(e) => setWaPhoneNumberId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                placeholder="e.g., 109876543210987"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Access Token
              </label>
              <div className="relative">
                <input
                  type={showSecrets['waAccessToken'] ? 'text' : 'password'}
                  value={waAccessToken}
                  onChange={(e) => setWaAccessToken(e.target.value)}
                  className="w-full px-3 py-2 pr-10 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  placeholder="Permanent access token"
                />
                <button
                  type="button"
                  onClick={() => toggleSecretVisibility('waAccessToken')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-tertiary hover:text-text-secondary"
                >
                  {showSecrets['waAccessToken'] ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Verify Token
              </label>
              <div className="relative">
                <input
                  type={showSecrets['waVerifyToken'] ? 'text' : 'password'}
                  value={waVerifyToken}
                  onChange={(e) => setWaVerifyToken(e.target.value)}
                  className="w-full px-3 py-2 pr-10 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  placeholder="Custom verify token for webhook"
                />
                <button
                  type="button"
                  onClick={() => toggleSecretVisibility('waVerifyToken')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-tertiary hover:text-text-secondary"
                >
                  {showSecrets['waVerifyToken'] ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
            <div className="bg-emerald-50 rounded-lg p-3">
              <p className="text-xs font-medium text-emerald-800 mb-1">Webhook URL</p>
              <div className="flex items-center gap-2">
                <code className="text-xs bg-white rounded px-2 py-1 text-emerald-700 flex-1 overflow-x-auto">
                  {`${typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/whatsapp`}
                </code>
                <CopyButton
                  text={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/whatsapp`}
                />
              </div>
              <p className="text-xs text-emerald-600 mt-2">
                Configure this URL in your Meta Developer Dashboard → WhatsApp → Configuration
              </p>
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <button
                type="button"
                onClick={() => setWaAutoCreateLead(!waAutoCreateLead)}
                className="text-text-secondary"
              >
                {waAutoCreateLead ? (
                  <ToggleRight className="w-8 h-5 text-brand-600" />
                ) : (
                  <ToggleLeft className="w-8 h-5 text-gray-400" />
                )}
              </button>
              <span className="text-sm text-text-primary">
                Auto-create lead on new WhatsApp conversation
              </span>
            </label>
          </div>
        );

      case 'email':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  SMTP Host
                </label>
                <input
                  type="text"
                  value={emailHost}
                  onChange={(e) => setEmailHost(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  placeholder="e.g., smtp.gmail.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Port</label>
                <input
                  type="text"
                  value={emailPort}
                  onChange={(e) => setEmailPort(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  placeholder="587"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Username</label>
              <input
                type="text"
                value={emailUsername}
                onChange={(e) => setEmailUsername(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                placeholder="your@email.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Password</label>
              <div className="relative">
                <input
                  type={showSecrets['emailPassword'] ? 'text' : 'password'}
                  value={emailPassword}
                  onChange={(e) => setEmailPassword(e.target.value)}
                  className="w-full px-3 py-2 pr-10 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  placeholder="App password or SMTP password"
                />
                <button
                  type="button"
                  onClick={() => toggleSecretVisibility('emailPassword')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-tertiary hover:text-text-secondary"
                >
                  {showSecrets['emailPassword'] ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
            <div className="border-t border-gray-100 pt-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  From Name
                </label>
                <input
                  type="text"
                  value={emailFromName}
                  onChange={(e) => setEmailFromName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  placeholder="e.g., Al Zaabi Real Estate"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Reply-To</label>
              <input
                type="text"
                value={emailReplyTo}
                onChange={(e) => setEmailReplyTo(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                placeholder="replies@yourcompany.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                BCC Address (for CRM Capture)
              </label>
              <input
                type="text"
                value={emailBcc}
                onChange={(e) => setEmailBcc(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                placeholder="crm@yourcompany.com"
              />
              <p className="text-xs text-text-tertiary mt-1">
                All outgoing emails will be BCC&apos;d to this address for CRM tracking
              </p>
            </div>
          </div>
        );

      case 'website_forms':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Form Title
              </label>
              <input
                type="text"
                value={widgetConfig.formTitle}
                onChange={(e) =>
                  setWidgetConfig((prev) => ({ ...prev, formTitle: e.target.value }))
                }
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                placeholder="Get in Touch"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                Form Fields
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'firstName', label: 'First Name' },
                  { key: 'lastName', label: 'Last Name' },
                  { key: 'email', label: 'Email' },
                  { key: 'phone', label: 'Phone' },
                  { key: 'company', label: 'Company' },
                  { key: 'notes', label: 'Message' },
                ].map((field) => (
                  <label
                    key={field.key}
                    className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={widgetConfig.fields.includes(field.key)}
                      onChange={() =>
                        setWidgetConfig((prev) => ({
                          ...prev,
                          fields: prev.fields.includes(field.key)
                            ? prev.fields.filter((f) => f !== field.key)
                            : [...prev.fields, field.key],
                        }))
                      }
                      className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span className="text-sm text-text-primary">{field.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Submit Button Text
                </label>
                <input
                  type="text"
                  value={widgetConfig.submitButtonText}
                  onChange={(e) =>
                    setWidgetConfig((prev) => ({ ...prev, submitButtonText: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Division Assignment
                </label>
                <select
                  value={widgetConfig.divisionId}
                  onChange={(e) =>
                    setWidgetConfig((prev) => ({ ...prev, divisionId: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                >
                  <option value="">Default Division</option>
                  {divisions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Success Message
              </label>
              <input
                type="text"
                value={widgetConfig.successMessage}
                onChange={(e) =>
                  setWidgetConfig((prev) => ({ ...prev, successMessage: e.target.value }))
                }
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  <Palette className="w-3.5 h-3.5 inline mr-1" />
                  Background Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={widgetConfig.backgroundColor}
                    onChange={(e) =>
                      setWidgetConfig((prev) => ({ ...prev, backgroundColor: e.target.value }))
                    }
                    className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={widgetConfig.backgroundColor}
                    onChange={(e) =>
                      setWidgetConfig((prev) => ({ ...prev, backgroundColor: e.target.value }))
                    }
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  <Palette className="w-3.5 h-3.5 inline mr-1" />
                  Button Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={widgetConfig.buttonColor}
                    onChange={(e) =>
                      setWidgetConfig((prev) => ({ ...prev, buttonColor: e.target.value }))
                    }
                    className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={widgetConfig.buttonColor}
                    onChange={(e) =>
                      setWidgetConfig((prev) => ({ ...prev, buttonColor: e.target.value }))
                    }
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent font-mono"
                  />
                </div>
              </div>
            </div>
          </div>
        );

      case 'webhooks':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Webhook Name
              </label>
              <input
                type="text"
                value={webhookName}
                onChange={(e) => setWebhookName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                placeholder="e.g., Property Portal Leads"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                Events to Listen For
              </label>
              <div className="grid grid-cols-2 gap-2">
                {WEBHOOK_EVENTS.map((evt) => (
                  <label
                    key={evt}
                    className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={webhookEvents.includes(evt)}
                      onChange={() => toggleWebhookEvent(evt)}
                      className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span className="text-xs text-text-primary font-mono">{evt}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        );

      case 'zapier':
        return (
          <div className="space-y-6">
            <div className="bg-orange-50 rounded-xl p-5">
              <h4 className="text-sm font-semibold text-orange-900 mb-4 flex items-center gap-2">
                <Zap className="w-4 h-4" /> How to Connect with Zapier
              </h4>
              <div className="space-y-4">
                {[
                  {
                    step: 1,
                    title: 'Go to zapier.com',
                    desc: 'Create a free Zapier account or log in to your existing one.',
                  },
                  {
                    step: 2,
                    title: 'Create a new Zap',
                    desc: 'Choose "Webhooks by Zapier" as the trigger and select "Catch Hook".',
                  },
                  {
                    step: 3,
                    title: 'Use your webhook URL',
                    desc: 'Copy the webhook URL below and paste it as the trigger URL in Zapier.',
                  },
                  {
                    step: 4,
                    title: 'Map fields in Zapier',
                    desc: 'Set up your action step to map incoming data fields to your CRM fields.',
                  },
                ].map((item) => (
                  <div key={item.step} className="flex gap-3">
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-orange-200 text-orange-800 flex items-center justify-center text-xs font-bold">
                      {item.step}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-orange-900">{item.title}</p>
                      <p className="text-xs text-orange-700 mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Your Webhook URL
              </label>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono text-text-primary overflow-x-auto">
                  {typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/zapier
                </code>
                <CopyButton
                  text={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/zapier`}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Sample Payload
              </label>
              <pre className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono text-text-secondary overflow-x-auto whitespace-pre">
{`{
  "firstName": "Ahmed",
  "lastName": "Al Zaabi",
  "email": "ahmed@example.com",
  "phone": "+971501234567",
  "source": "zapier",
  "notes": "Interested in Marina property"
}`}
              </pre>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // -------------------------------------------------------------------------
  // Render: Platform card
  // -------------------------------------------------------------------------
  const renderPlatformCard = (platform: PlatformDef) => {
    const intg = getIntegrationForPlatform(platform.slug);
    const isConnected = intg && (intg.status === 'connected' || intg.status === 'syncing');
    const hasError = intg?.status === 'error';

    return (
      <div
        key={platform.slug}
        className={`bg-white rounded-xl border shadow-sm hover:shadow-md transition-all duration-200 relative overflow-hidden group ${
          platform.comingSoon
            ? 'border-gray-200 opacity-75'
            : hasError
            ? 'border-red-200'
            : isConnected
            ? 'border-emerald-200'
            : 'border-gray-100'
        }`}
      >
        {/* Accent top bar */}
        <div className="h-1 w-full" style={{ backgroundColor: platform.color }} />

        <div className="p-5">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div
                className={`p-2.5 rounded-xl ${platform.bgColor}`}
                style={{ color: platform.color }}
              >
                {platform.icon}
              </div>
              <div>
                <h3 className="font-semibold text-text-primary text-sm">{platform.name}</h3>
                {intg ? (
                  <StatusBadge status={intg.status} />
                ) : platform.comingSoon ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 ring-1 ring-gray-200">
                    <Clock className="w-3 h-3" /> Coming Soon
                  </span>
                ) : null}
              </div>
            </div>
            {isConnected && (
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 ring-4 ring-emerald-50 animate-pulse" />
            )}
          </div>

          {/* Description */}
          <p className="text-xs text-text-secondary mb-4 leading-relaxed">
            {platform.description}
          </p>

          {/* Connected info */}
          {isConnected && intg && (
            <div className="mb-4 bg-gray-50 rounded-lg p-3 space-y-1.5">
              {intg.config?.pageId && (
                <div className="flex items-center gap-2 text-xs">
                  <FileText className="w-3.5 h-3.5 text-text-tertiary" />
                  <span className="text-text-secondary">
                    Page: <span className="text-text-primary font-medium">{String(intg.config.pageId)}</span>
                  </span>
                </div>
              )}
              {intg.lastSync && (
                <div className="flex items-center gap-2 text-xs">
                  <Clock className="w-3.5 h-3.5 text-text-tertiary" />
                  <span className="text-text-secondary">
                    Last sync: <span className="text-text-primary font-medium">{formatDate(intg.lastSync)}</span>
                  </span>
                </div>
              )}
              {typeof intg.leadsCaptures === 'number' && (
                <div className="flex items-center gap-2 text-xs">
                  <Database className="w-3.5 h-3.5 text-text-tertiary" />
                  <span className="text-text-secondary">
                    Leads captured:{' '}
                    <span className="text-text-primary font-medium">
                      {intg.leadsCaptures.toLocaleString()}
                    </span>
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Error info */}
          {hasError && intg && (
            <div className="mb-4 bg-red-50 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-red-700">
                {intg.errorMessage ?? 'Connection error. Please check your configuration.'}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2">
            {platform.comingSoon ? (
              <button
                onClick={() => setTiktokNotified(true)}
                disabled={tiktokNotified}
                className={`w-full text-sm font-medium py-2 px-4 rounded-lg transition-colors ${
                  tiktokNotified
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-gray-100 text-text-primary hover:bg-gray-200'
                }`}
              >
                {tiktokNotified ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> Notification Set
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-1.5">
                    <Bell className="w-4 h-4" /> Notify me when available
                  </span>
                )}
              </button>
            ) : isConnected ? (
              <>
                <button
                  onClick={() => void openManageModal(platform)}
                  className="btn-primary text-sm flex-1 flex items-center justify-center gap-1.5 py-2"
                >
                  <Settings className="w-4 h-4" /> Manage
                </button>
                <button
                  onClick={() => intg && void handleSyncNow(intg)}
                  className="btn-secondary text-sm p-2"
                  title="Sync now"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button
                onClick={() => openConnectModal(platform)}
                className="w-full btn-primary text-sm flex items-center justify-center gap-1.5 py-2"
              >
                <Plug className="w-4 h-4" /> Connect
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  // -------------------------------------------------------------------------
  // Render: Connect Modal
  // -------------------------------------------------------------------------
  const renderConnectModal = () => {
    if (activeModal !== 'connect' || !selectedPlatform) return null;
    const existing = getIntegrationForPlatform(selectedPlatform.slug);
    const isWebhook = selectedPlatform.slug === 'webhooks';
    const isZapier = selectedPlatform.slug === 'zapier';
    const isWebsiteForms = selectedPlatform.slug === 'website_forms';

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div
                className={`p-2.5 rounded-xl ${selectedPlatform.bgColor}`}
                style={{ color: selectedPlatform.color }}
              >
                {selectedPlatform.icon}
              </div>
              <div>
                <h2 className="text-lg font-semibold text-text-primary">
                  {existing ? 'Update' : 'Connect'} {selectedPlatform.name}
                </h2>
                <p className="text-sm text-text-secondary">{selectedPlatform.description}</p>
              </div>
            </div>
            <button
              onClick={() => setActiveModal(null)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-text-secondary" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6">{renderConnectForm()}</div>

          {/* Test result */}
          {testResult && (
            <div
              className={`mx-6 mb-2 p-3 rounded-lg flex items-center gap-2 text-sm ${
                testResult.success
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-red-50 text-red-700'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <XCircle className="w-4 h-4" />
              )}
              {testResult.message}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between p-6 border-t border-gray-100">
            <div>
              {existing && (
                <button
                  onClick={() => handleTestIntegration(existing.id)}
                  disabled={testing}
                  className="btn-secondary text-sm px-4 py-2 flex items-center gap-1.5"
                >
                  {testing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  Test Connection
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setActiveModal(null)}
                className="btn-secondary text-sm px-4 py-2"
              >
                Cancel
              </button>
              {isWebhook ? (
                <button
                  onClick={() => void handleCreateWebhook()}
                  disabled={saving || !webhookName || webhookEvents.length === 0}
                  className="btn-primary text-sm px-4 py-2 flex items-center gap-1.5"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Create Webhook
                </button>
              ) : isZapier ? (
                <button onClick={() => setActiveModal(null)} className="btn-primary text-sm px-4 py-2">
                  Done
                </button>
              ) : isWebsiteForms ? (
                <button
                  onClick={() => void handleGenerateWidget()}
                  disabled={saving}
                  className="btn-primary text-sm px-4 py-2 flex items-center gap-1.5"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {existing ? 'Update & Generate' : 'Generate Widget'}
                </button>
              ) : (
                <button
                  onClick={() => void handleSaveIntegration()}
                  disabled={saving}
                  className="btn-primary text-sm px-4 py-2 flex items-center gap-1.5"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {existing ? 'Update' : 'Connect'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // -------------------------------------------------------------------------
  // Render: Manage / Detail Modal
  // -------------------------------------------------------------------------
  const renderManageModal = () => {
    if (activeModal !== 'manage' || !selectedPlatform || !selectedIntegration) return null;
    const intg = selectedIntegration;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div
                className={`p-2.5 rounded-xl ${selectedPlatform.bgColor}`}
                style={{ color: selectedPlatform.color }}
              >
                {selectedPlatform.icon}
              </div>
              <div>
                <h2 className="text-lg font-semibold text-text-primary">
                  {selectedPlatform.name}
                </h2>
                <StatusBadge status={intg.status} />
              </div>
            </div>
            <button
              onClick={() => {
                setActiveModal(null);
                setSelectedIntegration(null);
              }}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-text-secondary" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Connection overview */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <Shield className="w-4 h-4" /> Connection Overview
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-text-tertiary">Status</p>
                  <StatusBadge status={intg.status} />
                </div>
                <div>
                  <p className="text-xs text-text-tertiary">Last Sync</p>
                  <p className="text-sm text-text-primary font-medium">
                    {intg.lastSync ? formatDate(intg.lastSync) : 'Never'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-text-tertiary">Connected Since</p>
                  <p className="text-sm text-text-primary font-medium">
                    {formatDate(intg.createdAt)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-text-tertiary">Leads Captured</p>
                  <p className="text-sm text-text-primary font-medium">
                    {intg.leadsCaptures?.toLocaleString() ?? 0}
                  </p>
                </div>
              </div>
            </div>

            {/* Error details */}
            {intg.status === 'error' && intg.errorMessage && (
              <div className="bg-red-50 rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="text-sm font-semibold text-red-800">Error Details</h4>
                  <p className="text-sm text-red-700 mt-1">{intg.errorMessage}</p>
                </div>
              </div>
            )}

            {/* Configuration summary */}
            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
                <Settings className="w-4 h-4" /> Configuration
              </h3>
              <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                {Object.entries(intg.config).map(([key, val]) => {
                  const isSecret =
                    key.toLowerCase().includes('secret') ||
                    key.toLowerCase().includes('token') ||
                    key.toLowerCase().includes('password');
                  return (
                    <div key={key} className="flex items-center justify-between text-sm">
                      <span className="text-text-secondary font-mono text-xs">{key}</span>
                      <span className="text-text-primary font-medium text-xs">
                        {isSecret ? '••••••••' : String(val)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Field mapping */}
            {intg.fieldMapping && intg.fieldMapping.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
                  <Workflow className="w-4 h-4" /> Field Mapping
                </h3>
                <div className="overflow-hidden rounded-lg border border-gray-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left px-4 py-2 text-xs font-medium text-text-secondary">
                          Source
                        </th>
                        <th className="px-2 py-2" />
                        <th className="text-left px-4 py-2 text-xs font-medium text-text-secondary">
                          CRM Field
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {intg.fieldMapping.map((fm, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="px-4 py-2 font-mono text-xs">{fm.source}</td>
                          <td className="px-2 py-2">
                            <ArrowRight className="w-4 h-4 text-text-tertiary" />
                          </td>
                          <td className="px-4 py-2 font-mono text-xs">{fm.target}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Recent activity log */}
            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
                <Activity className="w-4 h-4" /> Recent Activity
              </h3>
              {detailLogs.length === 0 ? (
                <p className="text-sm text-text-tertiary text-center py-6">No activity yet</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {detailLogs.slice(0, 20).map((log) => (
                    <div
                      key={log.id}
                      className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="mt-0.5">
                        {log.status === 'success' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : log.status === 'error' ? (
                          <XCircle className="w-4 h-4 text-red-500" />
                        ) : log.status === 'warning' ? (
                          <AlertTriangle className="w-4 h-4 text-amber-500" />
                        ) : (
                          <Info className="w-4 h-4 text-blue-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-text-primary">{log.event}</p>
                        <p className="text-xs text-text-secondary mt-0.5">{log.message}</p>
                      </div>
                      <span className="text-xs text-text-tertiary whitespace-nowrap">
                        {formatDate(log.createdAt)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Test result */}
            {testResult && (
              <div
                className={`p-3 rounded-lg flex items-center gap-2 text-sm ${
                  testResult.success
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-red-50 text-red-700'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <XCircle className="w-4 h-4" />
                )}
                {testResult.message}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-6 border-t border-gray-100">
            <button
              onClick={() => handleDisconnect(intg)}
              className="text-sm font-medium text-red-600 hover:text-red-700 flex items-center gap-1.5 px-3 py-2 hover:bg-red-50 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" /> Disconnect
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleTestIntegration(intg.id)}
                disabled={testing}
                className="btn-secondary text-sm px-4 py-2 flex items-center gap-1.5"
              >
                {testing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                Test
              </button>
              <button
                onClick={() => void handleSyncNow(intg)}
                className="btn-secondary text-sm px-4 py-2 flex items-center gap-1.5"
              >
                <RefreshCw className="w-4 h-4" /> Sync Now
              </button>
              <button
                onClick={() => {
                  prefillForm(selectedPlatform.slug, intg);
                  setActiveModal('connect');
                }}
                className="btn-primary text-sm px-4 py-2 flex items-center gap-1.5"
              >
                <Settings className="w-4 h-4" /> Edit Configuration
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // -------------------------------------------------------------------------
  // Render: API Key Modal
  // -------------------------------------------------------------------------
  const renderApiKeyModal = () => {
    if (activeModal !== 'apikey') return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-between p-6 border-b border-gray-100">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Generate API Key</h2>
              <p className="text-sm text-text-secondary">Create a new key for API access</p>
            </div>
            <button
              onClick={() => {
                setActiveModal(null);
                setGeneratedKey(null);
                setNewKeyName('');
              }}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-text-secondary" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {generatedKey ? (
              <div className="space-y-4">
                <div className="bg-emerald-50 rounded-lg p-4 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-emerald-800">API Key Generated</p>
                    <p className="text-xs text-emerald-600 mt-1">
                      Save this key now — you won&apos;t be able to see it again.
                    </p>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    API Key
                  </label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono text-text-primary break-all">
                      {generatedKey.apiKey}
                    </code>
                    <CopyButton text={generatedKey.apiKey} />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    API Endpoint
                  </label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono text-text-primary break-all">
                      {generatedKey.endpoint}
                    </code>
                    <CopyButton text={generatedKey.endpoint} />
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Key Name
                </label>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  placeholder="e.g., Website Integration, Portal API"
                />
                <p className="text-xs text-text-tertiary mt-1">
                  Give your key a descriptive name for easy identification
                </p>
              </div>
            )}
          </div>
          <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-100">
            {generatedKey ? (
              <button
                onClick={() => {
                  setActiveModal(null);
                  setGeneratedKey(null);
                  setNewKeyName('');
                }}
                className="btn-primary text-sm px-4 py-2"
              >
                Done
              </button>
            ) : (
              <>
                <button
                  onClick={() => {
                    setActiveModal(null);
                    setNewKeyName('');
                  }}
                  className="btn-secondary text-sm px-4 py-2"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleGenerateApiKey()}
                  disabled={saving || !newKeyName.trim()}
                  className="btn-primary text-sm px-4 py-2 flex items-center gap-1.5"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Generate Key
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  // -------------------------------------------------------------------------
  // Render: loading state
  // -------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
          <p className="text-sm text-text-secondary">Loading integrations…</p>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Main render
  // -------------------------------------------------------------------------
  return (
    <div className="space-y-8 pb-8">
      {/* Modals */}
      {renderConnectModal()}
      {renderManageModal()}
      {renderApiKeyModal()}
      {confirmAction && (
        <ConfirmDialog
          title={confirmAction.title}
          message={confirmAction.message}
          confirmLabel={confirmAction.confirmLabel}
          onConfirm={confirmAction.onConfirm}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Header */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2.5">
            <Plug className="w-7 h-7 text-brand-600" />
            Integrations
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Connect lead sources and manage data flow
          </p>
        </div>

        {/* Division Selector (Super Admin only) */}
        {isSuperAdmin && divisions.length > 0 && (
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-text-tertiary" />
            <select
              value={selectedDivision}
              onChange={(e) => setSelectedDivision(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            >
              <option value="all">All Divisions</option>
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Stats */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Integrations"
          value={stats.total}
          icon={<Plug className="w-5 h-5 text-brand-600" />}
          color="bg-brand-50"
        />
        <StatCard
          label="Connected"
          value={stats.connected}
          icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />}
          color="bg-emerald-50"
        />
        <StatCard
          label="Syncing"
          value={stats.syncing}
          icon={<RefreshCw className="w-5 h-5 text-amber-600" />}
          color="bg-amber-50"
        />
        <StatCard
          label="Errors"
          value={stats.errors}
          icon={<AlertTriangle className="w-5 h-5 text-red-600" />}
          color="bg-red-50"
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Platform Cards Grid */}
      {/* ------------------------------------------------------------------ */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-brand-600" /> Lead Sources &amp; Integrations
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {PLATFORM_DEFS.map(renderPlatformCard)}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Existing Webhooks List */}
      {/* ------------------------------------------------------------------ */}
      {filteredIntegrations.filter((i) => i.platform === 'webhooks').length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="p-5 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
              <Link2 className="w-5 h-5 text-purple-600" /> Active Webhooks
            </h2>
            <p className="text-sm text-text-secondary mt-1">
              Custom webhook endpoints receiving data from external sources
            </p>
          </div>
          <div className="divide-y divide-gray-100">
            {filteredIntegrations
              .filter((i) => i.platform === 'webhooks')
              .map((wh) => {
                const cfg = (wh.config as unknown) as Record<string, unknown>;
                const webhookUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/${wh.id}`;
                const events = (cfg.events as string[]) ?? [];

                return (
                  <div key={wh.id} className="p-5 flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-text-primary">{wh.name}</h3>
                        <StatusBadge status={wh.status} />
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1 font-mono text-text-secondary truncate">
                          {webhookUrl}
                        </code>
                        <CopyButton text={webhookUrl} label="Copy URL" />
                      </div>
                      <div className="flex items-center gap-2 text-xs text-text-tertiary">
                        <span>
                          Secret: <code className="font-mono">••••••••</code>
                        </span>
                        <span>·</span>
                        <span>Created: {formatDate(wh.createdAt)}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {events.map((evt) => (
                          <span
                            key={evt}
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-purple-50 text-purple-700 ring-1 ring-purple-200"
                          >
                            {evt}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => void openManageModal(PLATFORM_DEFS.find((p) => p.slug === 'webhooks')!)}
                        className="btn-secondary text-sm p-2"
                        title="Manage"
                      >
                        <Settings className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDisconnect(wh)}
                        className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete webhook"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* API Keys Section */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
              <Key className="w-5 h-5 text-brand-600" /> API Keys
            </h2>
            <p className="text-sm text-text-secondary mt-1">
              Manage API keys for programmatic access to the CRM
            </p>
          </div>
          <button
            onClick={() => {
              setNewKeyName('');
              setGeneratedKey(null);
              setActiveModal('apikey');
            }}
            className="btn-primary text-sm px-4 py-2 flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Generate New Key
          </button>
        </div>

        {apiKeys.length === 0 ? (
          <div className="p-12 text-center">
            <Key className="w-10 h-10 text-text-tertiary mx-auto mb-3" />
            <p className="text-sm text-text-secondary">No API keys generated yet</p>
            <p className="text-xs text-text-tertiary mt-1">
              Generate a key to start using the API
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-5 py-3 text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Name
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Key
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Created
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Last Used
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Status
                  </th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {apiKeys.map((ak) => {
                  const isRevealed = revealedKeys.has(ak.id);
                  const maskedKey = ak.key
                    ? `${ak.key.slice(0, 14)}...${ak.key.slice(-4)}`
                    : '••••••••';
                  return (
                    <tr key={ak.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-4 font-medium text-text-primary">{ak.name}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-mono text-text-secondary">
                            {isRevealed ? ak.key : maskedKey}
                          </code>
                          <button
                            onClick={() => toggleKeyRevealed(ak.id)}
                            className="p-1 text-text-tertiary hover:text-text-secondary"
                          >
                            {isRevealed ? (
                              <EyeOff className="w-3.5 h-3.5" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <CopyButton text={ak.key} />
                        </div>
                      </td>
                      <td className="px-5 py-4 text-text-secondary text-xs">
                        {formatDate(ak.createdAt)}
                      </td>
                      <td className="px-5 py-4 text-text-secondary text-xs">
                        {ak.lastUsed ? formatDate(ak.lastUsed) : 'Never'}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            ak.status === 'active'
                              ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/10'
                              : 'bg-red-50 text-red-700 ring-1 ring-red-600/10'
                          }`}
                        >
                          {ak.status === 'active' ? 'Active' : 'Revoked'}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        {ak.status === 'active' && (
                          <button
                            onClick={() => handleRevokeApiKey(ak)}
                            className="text-xs text-red-600 hover:text-red-700 font-medium hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Embeddable Lead Form / Widget Preview */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="p-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <Code2 className="w-5 h-5 text-brand-600" /> Embeddable Lead Form
          </h2>
          <p className="text-sm text-text-secondary mt-1">
            Generate and customize a lead capture form widget for your website
          </p>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Customization */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <Palette className="w-4 h-4" /> Customization
              </h3>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Form Title
                </label>
                <input
                  type="text"
                  value={widgetConfig.formTitle}
                  onChange={(e) =>
                    setWidgetConfig((prev) => ({ ...prev, formTitle: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Form Fields
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: 'firstName', label: 'Name' },
                    { key: 'email', label: 'Email' },
                    { key: 'phone', label: 'Phone' },
                    { key: 'company', label: 'Company' },
                    { key: 'notes', label: 'Message' },
                  ].map((field) => (
                    <button
                      key={field.key}
                      onClick={() =>
                        setWidgetConfig((prev) => ({
                          ...prev,
                          fields: prev.fields.includes(field.key)
                            ? prev.fields.filter((f) => f !== field.key)
                            : [...prev.fields, field.key],
                        }))
                      }
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        widgetConfig.fields.includes(field.key)
                          ? 'bg-brand-50 text-brand-700 border-brand-200'
                          : 'bg-gray-50 text-text-secondary border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {field.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Background
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={widgetConfig.backgroundColor}
                      onChange={(e) =>
                        setWidgetConfig((prev) => ({ ...prev, backgroundColor: e.target.value }))
                      }
                      className="w-8 h-8 rounded border border-gray-200 cursor-pointer"
                    />
                    <span className="text-xs text-text-secondary font-mono">
                      {widgetConfig.backgroundColor}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Button Color
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={widgetConfig.buttonColor}
                      onChange={(e) =>
                        setWidgetConfig((prev) => ({ ...prev, buttonColor: e.target.value }))
                      }
                      className="w-8 h-8 rounded border border-gray-200 cursor-pointer"
                    />
                    <span className="text-xs text-text-secondary font-mono">
                      {widgetConfig.buttonColor}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => void handleGenerateWidget()}
                disabled={saving}
                className="btn-primary text-sm px-4 py-2 flex items-center gap-1.5"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Code2 className="w-4 h-4" />
                )}
                Generate Widget Code
              </button>

              {/* Generated code */}
              {widgetCode && (
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-sm font-medium text-text-primary">
                        Embed Code
                      </label>
                      <CopyButton text={widgetCode} label="Copy Code" />
                    </div>
                    <pre className="px-3 py-2 bg-gray-900 rounded-lg text-xs font-mono text-green-400 overflow-x-auto whitespace-pre-wrap max-h-32">
                      {widgetCode}
                    </pre>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-sm font-medium text-text-primary">
                        API Endpoint
                      </label>
                      <CopyButton
                        text={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/leads`}
                        label="Copy"
                      />
                    </div>
                    <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                      <p className="text-xs font-medium text-text-secondary mb-2">
                        Sample cURL Command
                      </p>
                      <pre className="text-xs font-mono text-text-secondary whitespace-pre-wrap">
{`curl -X POST ${typeof window !== 'undefined' ? window.location.origin : 'https://yourapp.com'}/api/leads \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "firstName": "Ahmed",
    "email": "ahmed@example.com",
    "phone": "+971501234567",
    "source": "website_form"
  }'`}
                      </pre>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right: Live preview */}
            <div>
              <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2 mb-3">
                <Monitor className="w-4 h-4" /> Live Preview
              </h3>
              <div
                className="rounded-xl border border-gray-200 p-6 shadow-inner"
                style={{ backgroundColor: widgetConfig.backgroundColor }}
              >
                <h4 className="text-lg font-semibold text-text-primary mb-4">
                  {widgetConfig.formTitle || 'Get in Touch'}
                </h4>
                <div className="space-y-3">
                  {widgetConfig.fields.includes('firstName') && (
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="First Name"
                        disabled
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                      />
                      {widgetConfig.fields.includes('lastName') && (
                        <input
                          type="text"
                          placeholder="Last Name"
                          disabled
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                        />
                      )}
                    </div>
                  )}
                  {widgetConfig.fields.includes('email') && (
                    <input
                      type="email"
                      placeholder="Email Address"
                      disabled
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                    />
                  )}
                  {widgetConfig.fields.includes('phone') && (
                    <input
                      type="tel"
                      placeholder="Phone Number (+971...)"
                      disabled
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                    />
                  )}
                  {widgetConfig.fields.includes('company') && (
                    <input
                      type="text"
                      placeholder="Company"
                      disabled
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                    />
                  )}
                  {widgetConfig.fields.includes('notes') && (
                    <textarea
                      placeholder="Message"
                      disabled
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white resize-none"
                    />
                  )}
                  <button
                    disabled
                    className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-colors"
                    style={{ backgroundColor: widgetConfig.buttonColor }}
                  >
                    {widgetConfig.submitButtonText || 'Submit'}
                  </button>
                </div>
              </div>
              {widgetPreviewUrl && (
                <a
                  href={widgetPreviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 font-medium"
                >
                  <ExternalLink className="w-4 h-4" /> Open full preview
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Activity Log */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
              <Activity className="w-5 h-5 text-brand-600" /> Activity Log
            </h2>
            <p className="text-sm text-text-secondary mt-1">
              Recent integration events and data sync activity
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-text-tertiary" />
            <select
              value={logFilter}
              onChange={(e) => setLogFilter(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            >
              <option value="all">All Platforms</option>
              {PLATFORM_DEFS.filter((p) => !p.comingSoon).map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => void loadLogs()}
              disabled={logsLoading}
              className="btn-secondary text-sm p-1.5"
              title="Refresh logs"
            >
              <RefreshCw className={`w-4 h-4 ${logsLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="p-12 text-center">
            <Activity className="w-10 h-10 text-text-tertiary mx-auto mb-3" />
            <p className="text-sm text-text-secondary">No activity recorded yet</p>
            <p className="text-xs text-text-tertiary mt-1">
              Events will appear here once integrations start syncing data
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50 max-h-[480px] overflow-y-auto">
            {filteredLogs.map((log) => {
              const intg = integrations.find((i) => i.id === log.integrationId);
              const platformDef = PLATFORM_DEFS.find((p) => p.slug === intg?.platform);

              return (
                <div
                  key={log.id}
                  className="px-5 py-3.5 flex items-start gap-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="mt-0.5 flex-shrink-0">
                    {log.status === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    ) : log.status === 'error' ? (
                      <XCircle className="w-4 h-4 text-red-500" />
                    ) : log.status === 'warning' ? (
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                    ) : (
                      <Info className="w-4 h-4 text-blue-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-text-primary font-medium">{log.event}</p>
                      {platformDef && (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
                          style={{
                            backgroundColor: `${platformDef.color}15`,
                            color: platformDef.color,
                          }}
                        >
                          {platformDef.name}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-text-secondary mt-0.5">{log.message}</p>
                  </div>
                  <span className="text-xs text-text-tertiary whitespace-nowrap flex-shrink-0">
                    {formatDate(log.createdAt)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
