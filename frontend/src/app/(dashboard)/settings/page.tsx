'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import {
  User2, Lock, Building2, Bell, Shield, AlertTriangle, Check,
  Mail, Phone, Globe, Crown, ChevronRight, Eye, EyeOff,
  FileText, Trash2, LogOut, Columns3, Plus, GripVertical,
  Pencil, X, Type, Hash, Calendar, List, ToggleLeft, Link2,
  AtSign, MessageCircle, KeyRound,
} from 'lucide-react';
import type { CustomField, FieldType } from '@/types';

type Tab = 'profile' | 'security' | 'organization' | 'whatsapp' | 'customFields' | 'notifications' | 'audit' | 'danger';

const tabs: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }>; adminOnly?: boolean }[] = [
  { key: 'profile', label: 'Profile', icon: User2 },
  { key: 'security', label: 'Security', icon: Lock },
  { key: 'organization', label: 'Organization', icon: Building2, adminOnly: true },
  { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, adminOnly: true },
  { key: 'customFields', label: 'Custom Fields', icon: Columns3, adminOnly: true },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'audit', label: 'Audit Log', icon: Shield, adminOnly: true },
  { key: 'danger', label: 'Danger Zone', icon: AlertTriangle },
];

export default function SettingsPage() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const isAdmin = user?.role === 'ADMIN';

  const filteredTabs = tabs.filter(t => !t.adminOnly || isAdmin);

  return (
    <div className="animate-fade-in max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">Settings</h1>
        <p className="text-text-secondary text-sm mt-0.5">Manage your account, security, and preferences</p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar Navigation */}
        <nav className="w-56 flex-shrink-0">
          <div className="space-y-0.5">
            {filteredTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-brand-50 text-brand-700 shadow-xs'
                      : tab.key === 'danger'
                      ? 'text-red-600 hover:bg-red-50'
                      : 'text-text-secondary hover:bg-surface-tertiary hover:text-text-primary'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${
                    isActive ? 'text-brand-600' : tab.key === 'danger' ? 'text-red-500' : 'text-text-tertiary'
                  }`} />
                  {tab.label}
                  <ChevronRight className={`h-3.5 w-3.5 ml-auto transition-opacity ${
                    isActive ? 'opacity-100 text-brand-500' : 'opacity-0'
                  }`} />
                </button>
              );
            })}
          </div>
        </nav>

        {/* Content Area */}
        <div className="flex-1 min-w-0">
          {activeTab === 'profile' && <ProfileSection />}
          {activeTab === 'security' && <SecuritySection />}
          {activeTab === 'organization' && isAdmin && <OrganizationSection />}
          {activeTab === 'whatsapp' && isAdmin && <WhatsAppSection />}
          {activeTab === 'customFields' && isAdmin && <CustomFieldsSection />}
          {activeTab === 'notifications' && <NotificationsSection />}
          {activeTab === 'audit' && isAdmin && <AuditLogSection />}
          {activeTab === 'danger' && <DangerZoneSection />}
        </div>
      </div>
    </div>
  );
}

/* ─── Profile Section ────────────────────────────────────────────── */
function ProfileSection() {
  const { user, loadUser } = useAuthStore();
  const [form, setForm] = useState({
    firstName: '', lastName: '', phone: '', avatar: '',
  });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    api.getProfile().then((profile) => {
      setForm({
        firstName: profile.firstName || '',
        lastName: profile.lastName || '',
        phone: profile.phone || '',
        avatar: profile.avatar || '',
      });
    });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);
    try {
      await api.updateProfile({
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone || null,
        avatar: form.avatar || null,
      });
      await loadUser();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <SectionHeader
        title="Profile Information"
        description="Update your personal details and contact information"
      />

      <form onSubmit={handleSave} className="card p-6 space-y-5">
        {/* Avatar Preview */}
        <div className="flex items-center gap-5">
          <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-2xl font-bold text-white shadow-soft">
            {form.firstName?.[0]}{form.lastName?.[0]}
          </div>
          <div>
            <p className="font-semibold text-text-primary text-lg">
              {form.firstName} {form.lastName}
            </p>
            <p className="text-sm text-text-secondary">{user?.email}</p>
            <span className="badge bg-brand-50 text-brand-700 ring-1 ring-brand-200 mt-1.5">
              {user?.role?.replace('_', ' ')}
            </span>
          </div>
        </div>

        <div className="divider" />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">First Name</label>
            <div className="relative">
              <User2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
              <input
                className="input pl-10"
                required
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="label">Last Name</label>
            <div className="relative">
              <User2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
              <input
                className="input pl-10"
                required
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div>
          <label className="label">Email Address</label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
            <input
              className="input pl-10 bg-surface-secondary cursor-not-allowed"
              value={user?.email || ''}
              disabled
            />
          </div>
          <p className="text-2xs text-text-tertiary mt-1">Email cannot be changed. Contact support if needed.</p>
        </div>

        <div>
          <label className="label">Phone Number</label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
            <input
              className="input pl-10"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+971 50 123 4567"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          {success && (
            <div className="flex items-center gap-1.5 text-sm text-emerald-600 animate-fade-in">
              <Check className="h-4 w-4" />
              Profile updated successfully
            </div>
          )}
          {!success && <div />}
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ─── Security Section ───────────────────────────────────────────── */
function SecuritySection() {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const passwordStrength = (pw: string): { score: number; label: string; color: string } => {
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (score <= 1) return { score: 1, label: 'Weak', color: 'bg-red-500' };
    if (score <= 2) return { score: 2, label: 'Fair', color: 'bg-orange-500' };
    if (score <= 3) return { score: 3, label: 'Good', color: 'bg-yellow-500' };
    if (score <= 4) return { score: 4, label: 'Strong', color: 'bg-emerald-500' };
    return { score: 5, label: 'Very Strong', color: 'bg-emerald-600' };
  };

  const strength = form.newPassword ? passwordStrength(form.newPassword) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.newPassword !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (form.newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setSaving(true);
    try {
      await api.changePassword({
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      setSuccess(true);
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <SectionHeader
        title="Security"
        description="Manage your password and security preferences"
      />

      <form onSubmit={handleSubmit} className="card p-6 space-y-5">
        <div>
          <label className="label">Current Password</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
            <input
              type={showCurrent ? 'text' : 'password'}
              className="input pl-10 pr-10"
              required
              value={form.currentPassword}
              onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
              placeholder="Enter current password"
            />
            <button
              type="button"
              onClick={() => setShowCurrent(!showCurrent)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary transition-colors"
            >
              {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="label">New Password</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
            <input
              type={showNew ? 'text' : 'password'}
              className="input pl-10 pr-10"
              required
              minLength={8}
              value={form.newPassword}
              onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
              placeholder="Min 8 characters"
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary transition-colors"
            >
              {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {/* Password strength meter */}
          {strength && (
            <div className="mt-2.5 space-y-1.5">
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                      i <= strength.score ? strength.color : 'bg-surface-tertiary'
                    }`}
                  />
                ))}
              </div>
              <p className={`text-2xs font-medium ${
                strength.score <= 2 ? 'text-red-600' : strength.score <= 3 ? 'text-yellow-600' : 'text-emerald-600'
              }`}>
                {strength.label}
              </p>
            </div>
          )}
        </div>

        <div>
          <label className="label">Confirm New Password</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
            <input
              type="password"
              className="input pl-10"
              required
              value={form.confirmPassword}
              onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
              placeholder="Confirm new password"
            />
          </div>
          {form.confirmPassword && form.newPassword !== form.confirmPassword && (
            <p className="text-2xs text-red-600 mt-1">Passwords do not match</p>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-sm text-red-700 ring-1 ring-red-200">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          {success && (
            <div className="flex items-center gap-1.5 text-sm text-emerald-600 animate-fade-in">
              <Check className="h-4 w-4" />
              Password changed successfully
            </div>
          )}
          {!success && <div />}
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Updating...' : 'Update Password'}
          </button>
        </div>
      </form>

      {/* Security Info Card */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-3">Security Recommendations</h3>
        <div className="space-y-2.5">
          {[
            { text: 'Use a strong, unique password', done: true },
            { text: 'Enable two-factor authentication', done: false },
            { text: 'Review active sessions regularly', done: false },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <div className={`h-5 w-5 rounded-full flex items-center justify-center ${
                item.done ? 'bg-emerald-100 text-emerald-600' : 'bg-surface-tertiary text-text-tertiary'
              }`}>
                {item.done ? <Check className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
              </div>
              <span className={`text-sm ${item.done ? 'text-text-primary' : 'text-text-secondary'}`}>{item.text}</span>
              {!item.done && <span className="badge bg-surface-tertiary text-text-tertiary text-2xs ml-auto">Coming soon</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Organization Section ───────────────────────────────────────── */
function OrganizationSection() {
  const [org, setOrg] = useState<any>(null);
  const [form, setForm] = useState({ name: '', domain: '' });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    api.getOrganization().then((data) => {
      setOrg(data);
      setForm({ name: data.name || '', domain: data.domain || '' });
    });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);
    try {
      const updated = await api.updateOrganization({
        name: form.name,
        domain: form.domain || null,
      });
      setOrg(updated);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!org) {
    return (
      <div className="space-y-6">
        <SectionHeader title="Organization" description="Manage your organization settings" />
        <div className="card p-6 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i}><div className="skeleton h-4 w-24 mb-2" /><div className="skeleton h-10 w-full rounded-lg" /></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <SectionHeader
        title="Organization"
        description="Manage your organization settings and billing"
      />

      {/* Org Overview */}
      <div className="card p-5">
        <div className="flex items-center gap-4 mb-4">
          <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-xl font-bold text-white shadow-soft">
            {org.name?.[0]}
          </div>
          <div>
            <p className="text-lg font-semibold text-text-primary">{org.name}</p>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="badge bg-brand-50 text-brand-700 ring-1 ring-brand-200">
                <Crown className="h-3 w-3" />
                {org.plan || 'Free'} Plan
              </span>
              <span className="text-2xs text-text-tertiary">
                Since {new Date(org.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Users', value: org._count?.users || 0 },
            { label: 'Leads', value: org._count?.leads || 0 },
            { label: 'Campaigns', value: org._count?.campaigns || 0 },
            { label: 'Automations', value: org._count?.automationRules || 0 },
          ].map((stat) => (
            <div key={stat.label} className="text-center p-3 rounded-lg bg-surface-secondary">
              <p className="text-xl font-bold text-text-primary">{stat.value}</p>
              <p className="text-2xs text-text-tertiary font-medium">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Org Settings Form */}
      <form onSubmit={handleSave} className="card p-6 space-y-5">
        <div>
          <label className="label">Organization Name</label>
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
            <input
              className="input pl-10"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label className="label">Domain</label>
          <div className="relative">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
            <input
              className="input pl-10"
              value={form.domain}
              onChange={(e) => setForm({ ...form, domain: e.target.value })}
              placeholder="company.com"
            />
          </div>
          <p className="text-2xs text-text-tertiary mt-1">Used for email verification and SSO configuration</p>
        </div>

        <div className="flex items-center justify-between pt-2">
          {success && (
            <div className="flex items-center gap-1.5 text-sm text-emerald-600 animate-fade-in">
              <Check className="h-4 w-4" />
              Organization updated
            </div>
          )}
          {!success && <div />}
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ─── WhatsApp Section (admin only) ───────────────────────────────── */
type WhatsAppNumberEntry = { id: string; label: string; phoneNumberId: string; token: string };

function WhatsAppSection() {
  const [org, setOrg] = useState<{ settings?: Record<string, unknown> } | null>(null);
  const [numbers, setNumbers] = useState<WhatsAppNumberEntry[]>([]);
  const [webhookVerifyToken, setWebhookVerifyToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getOrganization().then((data) => {
      setOrg(data);
      const settings = (data.settings as Record<string, unknown>) || {};
      setWebhookVerifyToken((settings.whatsappWebhookVerifyToken as string) || '');
      const raw = settings.whatsappNumbers;
      if (Array.isArray(raw) && raw.length > 0) {
        setNumbers(
          raw.map((n: Record<string, string>, i: number) => ({
            id: (n as Record<string, string>).id || `n-${i}`,
            label: (n as Record<string, string>).label || '',
            phoneNumberId: (n as Record<string, string>).phoneNumberId || '',
            token: (n as Record<string, string>).token || '',
          }))
        );
      } else {
        const singleId = (settings.whatsappPhoneNumberId as string) || '';
        const singleToken = (settings.whatsappToken as string) || '';
        if (singleId || singleToken) {
          setNumbers([{ id: 'n-0', label: '', phoneNumberId: singleId, token: singleToken }]);
        } else {
          setNumbers([{ id: 'n-0', label: '', phoneNumberId: '', token: '' }]);
        }
      }
    });
  }, []);

  const addNumber = () => {
    setNumbers((prev) => [...prev, { id: `n-${Date.now()}`, label: '', phoneNumberId: '', token: '' }]);
  };

  const removeNumber = (id: string) => {
    setNumbers((prev) => (prev.length <= 1 ? prev : prev.filter((n) => n.id !== id)));
  };

  const updateNumber = (id: string, field: keyof WhatsAppNumberEntry, value: string) => {
    setNumbers((prev) => prev.map((n) => (n.id === id ? { ...n, [field]: value } : n)));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    setSuccess(false);
    try {
      const payload = numbers
        .filter((n) => n.phoneNumberId.trim() || n.token.trim())
        .map(({ label, phoneNumberId, token }) => ({ label: label.trim() || undefined, phoneNumberId: phoneNumberId.trim(), token: token.trim() }));
      await api.updateOrganization({
        settings: {
          whatsappNumbers: payload.length > 0 ? payload : [],
          whatsappWebhookVerifyToken: webhookVerifyToken.trim() || undefined,
        },
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (!org) {
    return (
      <div className="space-y-6">
        <SectionHeader title="WhatsApp" description="Connect your WhatsApp Business number" />
        <div className="card p-6 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i}><div className="skeleton h-4 w-24 mb-2" /><div className="skeleton h-10 w-full rounded-lg" /></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <SectionHeader
        title="WhatsApp"
        description="Add one or more WhatsApp Business numbers. Incoming messages to any of these numbers will create or update leads."
      />

      <form onSubmit={handleSave} className="space-y-4">
        <div className="card p-5 space-y-4 border border-border-subtle">
          <h3 className="text-sm font-semibold text-text-primary">Webhook verify token (Meta)</h3>
          <p className="text-sm text-text-secondary">
            Set this in Meta Developer Console → WhatsApp → Configuration → Webhook as the &quot;Verify token&quot;. It must match exactly when Meta verifies your webhook.
          </p>
          <div>
            <label className="label">Verify token</label>
            <input
              type="text"
              className="input font-mono text-sm"
              value={webhookVerifyToken}
              onChange={(e) => setWebhookVerifyToken(e.target.value)}
              placeholder="e.g. my-secret-verify-token-123-asdgasjhdgajshgd"
            />
          </div>
        </div>

        {numbers.map((entry) => (
          <div key={entry.id} className="card p-5 space-y-4 border border-border-subtle">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-text-primary">
                Number {numbers.indexOf(entry) + 1}
                {entry.label ? ` · ${entry.label}` : ''}
              </span>
              {numbers.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeNumber(entry.id)}
                  className="text-sm text-red-600 hover:text-red-700"
                >
                  Remove
                </button>
              )}
            </div>
            <div>
              <label className="label">Label (optional)</label>
              <input
                type="text"
                className="input"
                value={entry.label}
                onChange={(e) => updateNumber(entry.id, 'label', e.target.value)}
                placeholder="e.g. Sales, Support"
              />
            </div>
            <div>
              <label className="label">Phone Number ID</label>
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
                <input
                  type="text"
                  className="input pl-10 font-mono text-sm"
                  value={entry.phoneNumberId}
                  onChange={(e) => updateNumber(entry.id, 'phoneNumberId', e.target.value)}
                  placeholder="e.g. 1010197338847846"
                />
              </div>
            </div>
            <div>
              <label className="label">Access Token</label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
                <input
                  type="password"
                  className="input pl-10 font-mono text-sm"
                  value={entry.token}
                  onChange={(e) => updateNumber(entry.id, 'token', e.target.value)}
                  placeholder="Paste your WhatsApp access token"
                />
              </div>
            </div>
          </div>
        ))}

        <button type="button" onClick={addNumber} className="btn-secondary w-full gap-2">
          <MessageCircle className="h-4 w-4" />
          Add another number
        </button>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-sm text-red-700 ring-1 ring-red-200">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          {success && (
            <div className="flex items-center gap-1.5 text-sm text-emerald-600 animate-fade-in">
              <Check className="h-4 w-4" />
              WhatsApp credentials saved
            </div>
          )}
          {!success && <div />}
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>

      <div className="card p-5 bg-surface-secondary/50">
        <h3 className="text-sm font-semibold text-text-primary mb-2 flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-text-tertiary" />
          How to get these
        </h3>
        <ul className="text-sm text-text-secondary space-y-1.5 list-disc list-inside">
          <li>Go to <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">developers.facebook.com</a> → your app → WhatsApp → API setup</li>
          <li><strong>Phone number ID</strong> is shown next to your WhatsApp Business number</li>
          <li><strong>Access token</strong> is under “Temporary access token” (testing) or create a system user token for production</li>
          <li>You can add multiple numbers; incoming messages to any of them will be linked to this organization.</li>
        </ul>
      </div>
    </div>
  );
}

/* ─── Notifications Section ──────────────────────────────────────── */
function NotificationsSection() {
  const [prefs, setPrefs] = useState<Record<string, boolean> | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    api.getNotificationPreferences().then(setPrefs);
  }, []);

  const toggle = (key: string) => {
    if (!prefs) return;
    setPrefs({ ...prefs, [key]: !prefs[key] });
  };

  const handleSave = async () => {
    if (!prefs) return;
    setSaving(true);
    try {
      await api.updateNotificationPreferences(prefs);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const emailNotifs = [
    { key: 'emailNewLead', label: 'New lead created', description: 'Get notified when a new lead is added to the system' },
    { key: 'emailLeadAssigned', label: 'Lead assigned to you', description: 'When a lead is assigned or reassigned to you' },
    { key: 'emailTaskDue', label: 'Task due reminders', description: 'Receive reminders before tasks are due' },
    { key: 'emailWeeklyDigest', label: 'Weekly digest', description: 'Summary of your weekly lead activity and stats' },
  ];

  const inAppNotifs = [
    { key: 'inAppNewLead', label: 'New leads', description: 'Show notifications for new leads' },
    { key: 'inAppLeadAssigned', label: 'Lead assignments', description: 'Notify when leads are assigned to you' },
    { key: 'inAppTaskDue', label: 'Task reminders', description: 'Show alerts for upcoming and overdue tasks' },
    { key: 'inAppStatusChange', label: 'Status changes', description: 'When lead status or pipeline stage changes' },
  ];

  if (!prefs) {
    return (
      <div className="space-y-6">
        <SectionHeader title="Notifications" description="Choose how you want to be notified" />
        <div className="card p-6 space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center justify-between">
              <div><div className="skeleton h-4 w-40 mb-1" /><div className="skeleton h-3 w-56" /></div>
              <div className="skeleton h-6 w-11 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <SectionHeader
        title="Notifications"
        description="Choose how you want to be notified about activity"
      />

      {/* Email Notifications */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 bg-surface-secondary border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-text-tertiary" />
            <h3 className="text-sm font-semibold text-text-primary">Email Notifications</h3>
          </div>
        </div>
        <div className="divide-y divide-border-subtle">
          {emailNotifs.map((notif) => (
            <div key={notif.key} className="px-6 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-text-primary">{notif.label}</p>
                <p className="text-2xs text-text-tertiary mt-0.5">{notif.description}</p>
              </div>
              <ToggleSwitch checked={prefs[notif.key] ?? true} onChange={() => toggle(notif.key)} />
            </div>
          ))}
        </div>
      </div>

      {/* In-App Notifications */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 bg-surface-secondary border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-text-tertiary" />
            <h3 className="text-sm font-semibold text-text-primary">In-App Notifications</h3>
          </div>
        </div>
        <div className="divide-y divide-border-subtle">
          {inAppNotifs.map((notif) => (
            <div key={notif.key} className="px-6 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-text-primary">{notif.label}</p>
                <p className="text-2xs text-text-tertiary mt-0.5">{notif.description}</p>
              </div>
              <ToggleSwitch checked={prefs[notif.key] ?? true} onChange={() => toggle(notif.key)} />
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        {success && (
          <div className="flex items-center gap-1.5 text-sm text-emerald-600 animate-fade-in">
            <Check className="h-4 w-4" />
            Preferences saved
          </div>
        )}
        {!success && <div />}
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving ? 'Saving...' : 'Save Preferences'}
        </button>
      </div>
    </div>
  );
}

/* ─── Audit Log Section ──────────────────────────────────────────── */
function AuditLogSection() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getAuditLog().then(setLogs).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      <SectionHeader
        title="Audit Log"
        description="Track all administrative actions and changes"
      />

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="skeleton h-8 w-8 rounded-full" />
                <div className="flex-1"><div className="skeleton h-4 w-48 mb-1" /><div className="skeleton h-3 w-32" /></div>
                <div className="skeleton h-4 w-24" />
              </div>
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <FileText className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-text-primary">No audit logs yet</p>
            <p className="text-xs text-text-tertiary mt-1">Activity will appear here as actions are performed</p>
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {logs.map((log) => (
              <div key={log.id} className="px-6 py-3.5 flex items-center gap-3 hover:bg-surface-secondary transition-colors">
                <div className="h-8 w-8 rounded-full bg-surface-tertiary flex items-center justify-center flex-shrink-0">
                  <Shield className="h-3.5 w-3.5 text-text-tertiary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary">
                    <span className="font-medium">{log.user?.firstName} {log.user?.lastName}</span>
                    {' '}
                    <span className="text-text-secondary">{log.action.toLowerCase().replace(/_/g, ' ')}</span>
                    {' '}
                    <span className="font-medium">{log.entity?.toLowerCase()}</span>
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-2xs text-text-tertiary">
                      {new Date(log.createdAt).toLocaleString('en-US', {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                    {log.ipAddress && (
                      <span className="text-2xs text-text-tertiary">&middot; {log.ipAddress}</span>
                    )}
                  </div>
                </div>
                <span className="badge bg-surface-tertiary text-text-tertiary text-2xs">{log.entity}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Danger Zone Section ────────────────────────────────────────── */
function DangerZoneSection() {
  const { logout } = useAuthStore();
  const [showDelete, setShowDelete] = useState(false);
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setDeleting(true);
    try {
      await api.deleteAccount(password);
      logout();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <SectionHeader
        title="Danger Zone"
        description="Irreversible and destructive actions"
      />

      {/* Sign Out All Sessions */}
      <div className="card p-5 border-orange-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Sign Out</h3>
            <p className="text-2xs text-text-tertiary mt-0.5">Sign out of your current session</p>
          </div>
          <button
            onClick={logout}
            className="btn-secondary text-orange-700 border-orange-200 hover:bg-orange-50 hover:border-orange-300"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Delete Account */}
      <div className="card p-5 border-red-200 bg-red-50/30">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-red-700">Delete Account</h3>
            <p className="text-2xs text-red-600/80 mt-0.5">
              Permanently deactivate your account. This action cannot be undone.
            </p>
          </div>
          <button
            onClick={() => setShowDelete(!showDelete)}
            className="btn-danger"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete Account
          </button>
        </div>

        {showDelete && (
          <form onSubmit={handleDelete} className="mt-4 pt-4 border-t border-red-200 animate-fade-in">
            <div className="p-3 rounded-lg bg-red-100/60 mb-4">
              <div className="flex gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-red-700">
                  <p className="font-medium">Are you absolutely sure?</p>
                  <p className="text-2xs mt-1">This will deactivate your account and remove your access. Your data will be retained per our data policy. Enter your password to confirm.</p>
                </div>
              </div>
            </div>

            <div className="mb-4">
              <label className="label text-red-700">Confirm Password</label>
              <input
                type="password"
                className="input border-red-200 focus:ring-red-500 focus:border-red-500"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
              />
            </div>

            {error && (
              <div className="mb-4 flex items-center gap-2 p-3 rounded-lg bg-red-100 text-sm text-red-700 ring-1 ring-red-200">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowDelete(false)} className="btn-secondary">
                Cancel
              </button>
              <button type="submit" disabled={deleting} className="btn-danger">
                {deleting ? 'Deleting...' : 'Permanently Delete Account'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/* ─── Custom Fields Section ──────────────────────────────────────── */

const FIELD_TYPE_CONFIG: Record<FieldType, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  TEXT: { label: 'Text', icon: Type, color: 'bg-gray-100 text-gray-700' },
  NUMBER: { label: 'Number', icon: Hash, color: 'bg-blue-100 text-blue-700' },
  DATE: { label: 'Date', icon: Calendar, color: 'bg-purple-100 text-purple-700' },
  SELECT: { label: 'Dropdown', icon: List, color: 'bg-amber-100 text-amber-700' },
  MULTI_SELECT: { label: 'Multi-Select', icon: List, color: 'bg-orange-100 text-orange-700' },
  BOOLEAN: { label: 'Yes/No', icon: ToggleLeft, color: 'bg-green-100 text-green-700' },
  URL: { label: 'URL', icon: Link2, color: 'bg-cyan-100 text-cyan-700' },
  EMAIL: { label: 'Email', icon: AtSign, color: 'bg-indigo-100 text-indigo-700' },
  PHONE: { label: 'Phone', icon: Phone, color: 'bg-pink-100 text-pink-700' },
};

function CustomFieldsSection() {
  const [fields, setFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingField, setEditingField] = useState<CustomField | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const fetchFields = async () => {
    try {
      const data = await api.getCustomFields();
      setFields(data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchFields(); }, []);

  const handleDelete = async (field: CustomField) => {
    if (!confirm(`Delete custom field "${field.label}"? This will remove all data stored in this field from all leads.`)) return;
    try {
      await api.deleteCustomField(field.id);
      fetchFields();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDragStart = (idx: number) => setDragIdx(idx);

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    const items = [...fields];
    const dragged = items.splice(dragIdx, 1)[0];
    items.splice(idx, 0, dragged);
    setFields(items);
    setDragIdx(idx);
  };

  const handleDragEnd = async () => {
    setDragIdx(null);
    try {
      await api.reorderCustomFields(fields.map(f => f.id));
    } catch { /* ignore */ }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SectionHeader title="Custom Fields" description="Add custom columns to your leads table. These fields appear in lead details, table view, and import mapping." />
        <button onClick={() => { setEditingField(null); setShowModal(true); }} className="btn-primary gap-1.5 text-sm">
          <Plus className="h-4 w-4" />
          Add Field
        </button>
      </div>

      {loading ? (
        <div className="card p-8 text-center">
          <div className="animate-spin h-6 w-6 border-2 border-brand-600 border-t-transparent rounded-full mx-auto" />
        </div>
      ) : fields.length === 0 ? (
        <div className="card p-8 text-center">
          <div className="h-12 w-12 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <Columns3 className="h-6 w-6 text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-900 mb-1">No custom fields yet</p>
          <p className="text-xs text-gray-500 mb-4">Create custom fields to track additional lead information specific to your business.</p>
          <button onClick={() => { setEditingField(null); setShowModal(true); }} className="btn-primary text-sm gap-1.5">
            <Plus className="h-4 w-4" />
            Create First Field
          </button>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
            <div className="grid grid-cols-12 gap-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
              <div className="col-span-1" />
              <div className="col-span-4">Field Label</div>
              <div className="col-span-2">Type</div>
              <div className="col-span-2">Required</div>
              <div className="col-span-3 text-right">Actions</div>
            </div>
          </div>
          <div className="divide-y divide-gray-100">
            {fields.map((field, idx) => {
              const typeConfig = FIELD_TYPE_CONFIG[field.type];
              const TypeIcon = typeConfig.icon;
              return (
                <div
                  key={field.id}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragEnd={handleDragEnd}
                  className={`grid grid-cols-12 gap-3 items-center px-4 py-3 transition-colors ${
                    dragIdx === idx ? 'bg-brand-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="col-span-1">
                    <GripVertical className="h-4 w-4 text-gray-300 cursor-grab active:cursor-grabbing" />
                  </div>
                  <div className="col-span-4">
                    <p className="text-sm font-medium text-gray-900">{field.label}</p>
                    <p className="text-xs text-gray-400 font-mono">{field.name}</p>
                  </div>
                  <div className="col-span-2">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${typeConfig.color}`}>
                      <TypeIcon className="h-3 w-3" />
                      {typeConfig.label}
                    </span>
                  </div>
                  <div className="col-span-2">
                    {field.isRequired ? (
                      <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded">Required</span>
                    ) : (
                      <span className="text-xs text-gray-400">Optional</span>
                    )}
                  </div>
                  <div className="col-span-3 flex items-center justify-end gap-1">
                    {field.options && field.options.length > 0 && (
                      <span className="text-xs text-gray-400 mr-2">{(field.options as string[]).length} options</span>
                    )}
                    <button onClick={() => { setEditingField(field); setShowModal(true); }}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors" title="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => handleDelete(field)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors" title="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showModal && (
        <CustomFieldModal
          field={editingField}
          onClose={() => { setShowModal(false); setEditingField(null); }}
          onSaved={() => { setShowModal(false); setEditingField(null); fetchFields(); }}
        />
      )}
    </div>
  );
}

function CustomFieldModal({ field, onClose, onSaved }: { field: CustomField | null; onClose: () => void; onSaved: () => void }) {
  const [label, setLabel] = useState(field?.label || '');
  const [type, setType] = useState<FieldType>(field?.type || 'TEXT');
  const [isRequired, setIsRequired] = useState(field?.isRequired || false);
  const [options, setOptions] = useState<string[]>((field?.options as string[]) || []);
  const [newOption, setNewOption] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isSelect = type === 'SELECT' || type === 'MULTI_SELECT';

  const addOption = () => {
    const val = newOption.trim();
    if (val && !options.includes(val)) {
      setOptions([...options, val]);
      setNewOption('');
    }
  };

  const removeOption = (idx: number) => {
    setOptions(options.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) { setError('Label is required'); return; }
    if (isSelect && options.length === 0) { setError('Add at least one option'); return; }

    setSaving(true);
    setError('');
    try {
      if (field) {
        await api.updateCustomField(field.id, { label, type, options: isSelect ? options : null, isRequired });
      } else {
        await api.createCustomField({ label, type, options: isSelect ? options : undefined, isRequired });
      }
      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="card w-full max-w-lg max-h-[85vh] overflow-y-auto animate-fade-in">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{field ? 'Edit' : 'Create'} Custom Field</h2>
            <p className="text-xs text-gray-500 mt-0.5">This field will appear in lead forms, table, and details</p>
          </div>
          <button onClick={onClose} className="btn-icon"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Field Label */}
          <div>
            <label className="label">Field Label *</label>
            <input className="input" value={label} onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Company Size, Industry, Contract Value" autoFocus />
          </div>

          {/* Field Type */}
          <div>
            <label className="label">Field Type *</label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(FIELD_TYPE_CONFIG) as [FieldType, typeof FIELD_TYPE_CONFIG[FieldType]][]).map(([key, config]) => {
                const Icon = config.icon;
                return (
                  <button
                    key={key} type="button"
                    onClick={() => setType(key)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                      type === key ? 'border-brand-300 bg-brand-50 text-brand-700 ring-1 ring-brand-200' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {config.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Options for SELECT / MULTI_SELECT */}
          {isSelect && (
            <div>
              <label className="label">Options *</label>
              <div className="space-y-2">
                {options.map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="flex-1 text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">{opt}</span>
                    <button type="button" onClick={() => removeOption(idx)}
                      className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <input className="input flex-1" value={newOption} onChange={(e) => setNewOption(e.target.value)}
                    placeholder="Type option and press Enter" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOption(); } }} />
                  <button type="button" onClick={addOption} className="btn-secondary text-sm">Add</button>
                </div>
              </div>
            </div>
          )}

          {/* Required toggle */}
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium text-gray-900">Required field</p>
              <p className="text-xs text-gray-500">Require this field when creating or importing leads</p>
            </div>
            <ToggleSwitch checked={isRequired} onChange={() => setIsRequired(!isRequired)} />
          </div>

          {/* Preview */}
          <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Preview</p>
            <div>
              <label className="label">{label || 'Field Label'}{isRequired ? ' *' : ''}</label>
              {type === 'TEXT' && <input className="input" placeholder="Enter text..." disabled />}
              {type === 'NUMBER' && <input className="input" type="number" placeholder="0" disabled />}
              {type === 'DATE' && <input className="input" type="date" disabled />}
              {type === 'URL' && <input className="input" placeholder="https://..." disabled />}
              {type === 'EMAIL' && <input className="input" placeholder="email@example.com" disabled />}
              {type === 'PHONE' && <input className="input" placeholder="+1 (555) 000-0000" disabled />}
              {type === 'BOOLEAN' && (
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-sm"><input type="radio" disabled /> Yes</label>
                  <label className="flex items-center gap-1.5 text-sm"><input type="radio" disabled /> No</label>
                </div>
              )}
              {type === 'SELECT' && (
                <select className="input" disabled>
                  <option>Select...</option>
                  {options.map((o, i) => <option key={i}>{o}</option>)}
                </select>
              )}
              {type === 'MULTI_SELECT' && (
                <div className="flex gap-1 flex-wrap">
                  {options.length > 0 ? options.map((o, i) => (
                    <span key={i} className="inline-flex items-center gap-1 bg-brand-100 text-brand-700 text-xs font-medium px-2 py-0.5 rounded-full">{o}</span>
                  )) : <span className="text-xs text-gray-400">No options yet</span>}
                </div>
              )}
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2 border-t">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary gap-1.5">
              {saving ? 'Saving...' : field ? 'Update Field' : 'Create Field'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Shared Components ──────────────────────────────────────────── */
function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-1">
      <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
      <p className="text-sm text-text-secondary mt-0.5">{description}</p>
    </div>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
        checked ? 'bg-brand-600' : 'bg-gray-200'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}
