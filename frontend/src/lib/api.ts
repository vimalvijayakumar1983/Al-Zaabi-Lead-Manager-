import type {
  Organization, DivisionUser, DivisionStats, IndustryTemplate,
  Campaign, CampaignDashboardStats,
  Integration, IntegrationLog, IntegrationPlatformInfo,
  ApiKey, WidgetConfig, Contact, ContactStats, Deal,
  AppNotification, NotificationPreferences
} from '@/types';

// Always use same-origin /api path — Next.js API route proxies to backend server-side
const API_URL = '/api';

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  }

  getToken(): string | null {
    if (!this.token && typeof window !== 'undefined') {
      this.token = localStorage.getItem('token');
    }
    return this.token;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
    });

    if (res.status === 401) {
      this.setToken(null);
      // If we're already logging out, don't do a competing redirect.
      // The logout() function handles its own redirect.
      if (typeof window !== 'undefined' && !(window as any).__loggingOut) {
        window.location.href = '/login';
      }
      throw new Error('Unauthorized');
    }

    const data = await res.json();

    if (!res.ok) {
      const details = data.details?.map((d: any) => `${d.field}: ${d.message}`).join(', ');
      throw new Error(details ? `${data.error}: ${details}` : (data.error || 'Request failed'));
    }

    return data;
  }

  private async requestFormData<T>(path: string, formData: FormData): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (res.status === 401) {
      this.setToken(null);
      if (typeof window !== 'undefined' && !(window as any).__loggingOut) {
        window.location.href = '/login';
      }
      throw new Error('Unauthorized');
    }

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Upload failed');
    }
    return data;
  }

  // Auth
  async login(email: string, password: string) {
    return this.request<{ token: string; user: any; divisions?: Organization[] }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async register(data: { email: string; password: string; firstName: string; lastName: string; organizationName: string }) {
    return this.request<{ token: string; user: any }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getMe() {
    return this.request<any>('/auth/me');
  }

  // Leads
  async getLeads(params?: Record<string, string | number>) {
    const query = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
    return this.request<any>(`/leads${query}`);
  }

  async globalSearch(q: string) {
    return this.request<any>(`/leads/search/global?q=${encodeURIComponent(q)}`);
  }

  async getLeadTags() {
    return this.request<any[]>('/leads/tags');
  }

  async getFilterValues() {
    return this.request<any>('/leads/filter-values');
  }

  async getLead(id: string) {
    return this.request<any>(`/leads/${id}`);
  }

  async createLead(data: any) {
    return this.request<any>('/leads', { method: 'POST', body: JSON.stringify(data) });
  }

  async updateLead(id: string, data: any) {
    return this.request<any>(`/leads/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  async deleteLead(id: string) {
    return this.request<any>(`/leads/${id}`, { method: 'DELETE' });
  }

  async bulkUpdateLeads(leadIds: string[], data: any) {
    return this.request<any>('/leads/bulk', {
      method: 'PATCH',
      body: JSON.stringify({ leadIds, data }),
    });
  }

  async addLeadNote(leadId: string, content: string) {
    return this.request<any>(`/leads/${leadId}/notes`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }

  // Pipeline
  async getPipelineStages(organizationId?: string) {
    const query = organizationId ? `?organizationId=${organizationId}` : '';
    return this.request<any[]>(`/pipeline/stages${query}`);
  }

  async moveLead(leadId: string, stageId: string, order: number) {
    return this.request<any>('/pipeline/move', {
      method: 'POST',
      body: JSON.stringify({ leadId, stageId, order }),
    });
  }

  // Tasks
  async getTasks(params?: Record<string, string | number>) {
    const query = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
    return this.request<any>(`/tasks${query}`);
  }

  async createTask(data: any) {
    return this.request<any>('/tasks', { method: 'POST', body: JSON.stringify(data) });
  }

  async completeTask(id: string) {
    return this.request<any>(`/tasks/${id}/complete`, { method: 'POST' });
  }

  // Analytics
  async getDashboard(divisionId?: string) {
    const q = divisionId ? `?divisionId=${divisionId}` : '';
    return this.request<any>(`/analytics/dashboard${q}`);
  }

  async getAnalyticsOverview(period = '30d', divisionId?: string) {
    const q = new URLSearchParams({ period, ...(divisionId ? { divisionId } : {}) });
    return this.request<any>(`/analytics/overview?${q}`);
  }

  async getFunnel(divisionId?: string) {
    const q = divisionId ? `?divisionId=${divisionId}` : '';
    return this.request<any>(`/analytics/funnel${q}`);
  }

  async getTeamPerformance(divisionId?: string) {
    const q = divisionId ? `?divisionId=${divisionId}` : '';
    return this.request<any>(`/analytics/team-performance${q}`);
  }

  async getTrends(period = '30d', divisionId?: string) {
    const q = new URLSearchParams({ period, ...(divisionId ? { divisionId } : {}) });
    return this.request<any>(`/analytics/trends?${q}`);
  }

  async getSourcePerformance(period = '30d', divisionId?: string) {
    const q = new URLSearchParams({ period, ...(divisionId ? { divisionId } : {}) });
    return this.request<any>(`/analytics/source-performance?${q}`);
  }

  async getCampaignPerformance(divisionId?: string) {
    const q = divisionId ? `?divisionId=${divisionId}` : '';
    return this.request<any>(`/analytics/campaign-performance${q}`);
  }

  async getActivitiesAnalytics(period = '30d', divisionId?: string) {
    const q = new URLSearchParams({ period, ...(divisionId ? { divisionId } : {}) });
    return this.request<any>(`/analytics/activities?${q}`);
  }

  async getScoreDistribution(divisionId?: string) {
    const q = divisionId ? `?divisionId=${divisionId}` : '';
    return this.request<any>(`/analytics/score-distribution${q}`);
  }

  async getDivisionComparison() {
    return this.request<any>('/analytics/division-comparison');
  }

  // Users
  async getUsers() {
    return this.request<any[]>('/users');
  }

  async inviteUser(data: any) {
    return this.request<any>('/users/invite', { method: 'POST', body: JSON.stringify(data) });
  }

  async updateUser(id: string, data: any) {
    return this.request<any>(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  async resetUserPassword(id: string, newPassword: string) {
    return this.request<any>(`/users/${id}/reset-password`, { method: 'PUT', body: JSON.stringify({ newPassword }) });
  }

  async deactivateUser(id: string) {
    return this.request<any>(`/users/${id}`, { method: 'DELETE' });
  }

  async reactivateUser(id: string) {
    return this.request<any>(`/users/${id}/reactivate`, { method: 'POST' });
  }

  async getPermissions() {
    return this.request<{ rolePermissions: Record<string, Record<string, boolean>>; userOverrides: Record<string, Record<string, boolean>>; defaults: Record<string, Record<string, boolean>> }>('/users/permissions');
  }

  async updateRolePermissions(rolePermissions: Record<string, Record<string, boolean>>) {
    return this.request<any>('/users/permissions/roles', { method: 'PUT', body: JSON.stringify({ rolePermissions }) });
  }

  async updateUserPermissions(userId: string, permissions: Record<string, boolean> | null) {
    return this.request<any>(`/users/permissions/user/${userId}`, { method: 'PUT', body: JSON.stringify({ permissions }) });
  }

  // Import
  async getImportFields(module: string) {
    return this.request<{ module: string; fields: any[] }>(`/import/fields/${module}`);
  }

  async importPreview(file: File, module: string) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('module', module);
    const token = this.getToken();
    const res = await fetch(`${API_URL}/import/preview`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Preview failed');
    return data;
  }

  async importExecute(file: File, options: {
    module: string;
    fieldMapping: Record<string, string>;
    duplicateAction: string;
    duplicateField?: string;
    assignToId?: string;
    defaultStatus?: string;
    defaultSource?: string;
  }) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('module', options.module);
    formData.append('fieldMapping', JSON.stringify(options.fieldMapping));
    formData.append('duplicateAction', options.duplicateAction);
    if (options.duplicateField) formData.append('duplicateField', options.duplicateField);
    if (options.assignToId) formData.append('assignToId', options.assignToId);
    if (options.defaultStatus) formData.append('defaultStatus', options.defaultStatus);
    if (options.defaultSource) formData.append('defaultSource', options.defaultSource);
    const token = this.getToken();
    const res = await fetch(`${API_URL}/import/execute`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Import failed');
    return data;
  }

  async importValidate(file: File, options: { module: string; fieldMapping: Record<string, string>; duplicateField?: string }) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('module', options.module);
    formData.append('fieldMapping', JSON.stringify(options.fieldMapping));
    if (options.duplicateField) formData.append('duplicateField', options.duplicateField);
    const token = this.getToken();
    const res = await fetch(`${API_URL}/import/validate`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Validation failed');
    return data;
  }

  async getImportHistory(page = 1) {
    return this.request<any>(`/import/history?page=${page}`);
  }

  async getImportDetails(id: string) {
    return this.request<any>(`/import/history/${id}`);
  }

  async undoImport(id: string) {
    return this.request<any>(`/import/undo/${id}`, { method: 'POST' });
  }

  private async authenticatedDownload(path: string, fallbackFilename: string) {
    const token = this.getToken();
    const res = await fetch(`${API_URL}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Download failed');
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = res.headers.get('Content-Disposition')?.split('filename=')[1] || fallbackFilename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }

  async downloadImportTemplate(module: string) {
    return this.authenticatedDownload(`/import/template/${module}`, `${module}-import-template.csv`);
  }

  async exportData(module: string, filters?: Record<string, string>) {
    const params = filters ? '?' + new URLSearchParams(filters).toString() : '';
    return this.authenticatedDownload(`/import/export/${module}${params}`, `${module}-export.csv`);
  }

  async downloadErrorsCsv(importId: string) {
    return this.authenticatedDownload(`/import/history/${importId}/errors-csv`, `import-errors.csv`);
  }

  // Campaigns
  async getCampaigns(params?: Record<string, string | number>) {
    const query = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
    return this.request<any>(`/campaigns${query}`);
  }

  // ─── Campaigns (Enhanced) ───────────────────────────────────────

  async createCampaign(data: Partial<Campaign>) {
    return this.request<Campaign>('/campaigns', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateCampaign(id: string, data: Partial<Campaign>) {
    return this.request<Campaign>(`/campaigns/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteCampaign(id: string) {
    return this.request<void>(`/campaigns/${id}`, { method: 'DELETE' });
  }

  async duplicateCampaign(id: string) {
    return this.request<Campaign>(`/campaigns/${id}/duplicate`, { method: 'POST' });
  }

  async getCampaignStats() {
    return this.request<CampaignDashboardStats>('/campaigns/stats');
  }

  async bulkUpdateCampaigns(ids: string[], data: { status?: string }) {
    return this.request<void>('/campaigns/bulk-update', {
      method: 'POST',
      body: JSON.stringify({ ids, data }),
    });
  }

  async bulkDeleteCampaigns(ids: string[]) {
    return this.request<void>('/campaigns/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
  }

  // ─── Integrations ──────────────────────────────────────────────

  async getIntegrations() {
    return this.request<Integration[]>('/integrations');
  }

  async getIntegration(id: string) {
    return this.request<{ integration: Integration; logs: IntegrationLog[] }>(
      `/integrations/${id}`,
    );
  }

  async createIntegration(data: Partial<Integration>) {
    return this.request<Integration>('/integrations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateIntegration(id: string, data: Partial<Integration>) {
    return this.request<Integration>(`/integrations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteIntegration(id: string) {
    return this.request<void>(`/integrations/${id}`, { method: 'DELETE' });
  }

  async testIntegration(id: string) {
    return this.request<{ success: boolean; message: string }>(
      `/integrations/${id}/test`,
      { method: 'POST' },
    );
  }

  async getIntegrationLogs(id: string, params?: Record<string, string | number>) {
    const query = params
      ? '?' + new URLSearchParams(params as Record<string, string>).toString()
      : '';
    return this.request<IntegrationLog[]>(`/integrations/${id}/logs${query}`);
  }

  async getIntegrationPlatforms() {
    return this.request<IntegrationPlatformInfo[]>('/integrations/platforms');
  }

  // ─── Widget & API Keys ─────────────────────────────────────────

  async generateWidget(config: string | WidgetConfig) {
    const body = typeof config === 'string' ? { divisionId: config } : config;
    return this.request<{ code: string; previewUrl: string }>(
      '/integrations/widget/generate',
      { method: 'POST', body: JSON.stringify(body) },
    );
  }

  async generateApiKey(name: string) {
    return this.request<{ apiKey: string; endpoint: string }>(
      '/integrations/api-key/generate',
      { method: 'POST', body: JSON.stringify({ name }) },
    );
  }

  async revokeApiKey(id: string) {
    return this.request<void>(`/integrations/api-key/${id}/revoke`, { method: 'POST' });
  }

  async deleteApiKey(id: string) {
    return this.request<void>(`/integrations/api-key/${id}`, { method: 'DELETE' });
  }

  async getApiKeys() {
    return this.request<ApiKey[]>('/integrations/api-keys');
  }


  // Automations
  async getAutomations() {
    return this.request<any[]>('/automations');
  }

  async getAutomation(id: string) {
    return this.request<any>(`/automations/${id}`);
  }

  async createAutomation(data: any) {
    return this.request<any>('/automations', { method: 'POST', body: JSON.stringify(data) });
  }

  async updateAutomation(id: string, data: any) {
    return this.request<any>(`/automations/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  async toggleAutomation(id: string) {
    return this.request<any>(`/automations/${id}/toggle`, { method: 'POST' });
  }

  async deleteAutomation(id: string) {
    return this.request<any>(`/automations/${id}`, { method: 'DELETE' });
  }

  async duplicateAutomation(id: string) {
    return this.request<any>(`/automations/${id}/duplicate`, { method: 'POST' });
  }

  async getAutomationLogs(id: string, page = 1, limit = 20) {
    return this.request<any>(`/automations/${id}/logs?page=${page}&limit=${limit}`);
  }

  async getAutomationTemplates(params?: { search?: string; category?: string; trigger?: string }) {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.category) query.set('category', params.category);
    if (params?.trigger) query.set('trigger', params.trigger);
    const qs = query.toString();
    return this.request<any[]>(`/automations/templates${qs ? `?${qs}` : ''}`);
  }

  async saveAutomationAsTemplate(id: string, data?: { name?: string; description?: string }) {
    return this.request<any>(`/automations/${id}/save-as-template`, { method: 'POST', body: JSON.stringify(data || {}) });
  }

  async getAutomationStats() {
    return this.request<any>('/automations/stats/overview');
  }

  // ─── Contacts ────────────────────────────────────────────────────
  async getContacts(params?: Record<string, string | number>) {
    const query = params ? '?' + new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString() : '';
    return this.request<{ data: Contact[]; pagination: any }>(`/contacts${query}`);
  }

  async exportContacts(params?: Record<string, string>) {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    const token = this.getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_URL}/contacts/export${query}`, { headers });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as any).error || 'Export failed');
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contacts-export-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }

  async getContact(id: string) {
    return this.request<Contact>(`/contacts/${id}`);
  }

  async createContact(data: Partial<Contact> & { tags?: string[] }) {
    return this.request<Contact>('/contacts', { method: 'POST', body: JSON.stringify(data) });
  }

  async updateContact(id: string, data: Partial<Contact> & { tags?: string[] }) {
    return this.request<Contact>(`/contacts/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  async deleteContact(id: string) {
    return this.request<any>(`/contacts/${id}`, { method: 'DELETE' });
  }

  async getContactStats() {
    return this.request<ContactStats>('/contacts/stats');
  }

  async getContactFilterValues() {
    return this.request<any>('/contacts/filter-values');
  }

  async searchContacts(q: string) {
    return this.request<Contact[]>(`/contacts/search/global?q=${encodeURIComponent(q)}`);
  }

  async convertLeadToContact(data: { leadId: string; lifecycle?: string; type?: string; createDeal?: boolean; dealName?: string; dealAmount?: number }) {
    return this.request<Contact>('/contacts/convert-lead', { method: 'POST', body: JSON.stringify(data) });
  }

  async mergeContacts(data: { primaryContactId: string; secondaryContactId: string; fieldsToKeep?: Record<string, 'primary' | 'secondary'> }) {
    return this.request<Contact>('/contacts/merge', { method: 'POST', body: JSON.stringify(data) });
  }

  async bulkUpdateContacts(contactIds: string[], data: Record<string, any>) {
    return this.request<{ updated: number }>('/contacts/bulk', { method: 'PATCH', body: JSON.stringify({ contactIds, data }) });
  }

  async addContactNote(contactId: string, content: string) {
    return this.request<any>(`/contacts/${contactId}/notes`, { method: 'POST', body: JSON.stringify({ content }) });
  }

  async createDeal(contactId: string, data: Partial<Deal>) {
    return this.request<Deal>(`/contacts/${contactId}/deals`, { method: 'POST', body: JSON.stringify(data) });
  }

  async updateDeal(contactId: string, dealId: string, data: Partial<Deal>) {
    return this.request<Deal>(`/contacts/${contactId}/deals/${dealId}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  // Communications
  async sendEmail(data: { leadId: string; to: string; subject: string; body: string }) {
    return this.request<any>('/communications/send-email', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async logCommunication(data: any) {
    return this.request<any>('/communications', { method: 'POST', body: JSON.stringify(data) });
  }

  // Call Logs
  async logCall(data: any) {
    return this.request<any>('/call-logs', { method: 'POST', body: JSON.stringify(data) });
  }

  async getCallLogs(leadId: string) {
    return this.request<any[]>(`/call-logs/lead/${leadId}`);
  }

  async getDispositions() {
    return this.request<any[]>('/call-logs/dispositions');
  }

  // Settings
  async getProfile() {
    return this.request<any>('/settings/profile');
  }

  async updateProfile(data: { firstName?: string; lastName?: string; phone?: string | null; avatar?: string | null }) {
    return this.request<any>('/settings/profile', { method: 'PUT', body: JSON.stringify(data) });
  }

  async changePassword(data: { currentPassword: string; newPassword: string }) {
    return this.request<any>('/settings/password', { method: 'PUT', body: JSON.stringify(data) });
  }

  async getOrganization() {
    return this.request<any>('/settings/organization');
  }

  async updateOrganization(data: { name?: string; domain?: string | null; settings?: Record<string, any> }) {
    return this.request<any>('/settings/organization', { method: 'PUT', body: JSON.stringify(data) });
  }

  async getNotificationPreferences() {
    return this.request<any>('/settings/notifications');
  }

  async updateNotificationPreferences(data: Record<string, boolean>) {
    return this.request<any>('/settings/notifications', { method: 'PUT', body: JSON.stringify(data) });
  }

  async getAuditLog() {
    return this.request<any[]>('/settings/audit-log');
  }

  async deleteAccount(password: string) {
    return this.request<any>('/settings/account', { method: 'DELETE', body: JSON.stringify({ password }) });
  }

  // SLA Configuration
  async getSLAConfig() {
    return this.request<any>('/settings/sla');
  }

  async updateSLAConfig(data: any) {
    return this.request<any>('/settings/sla', { method: 'PUT', body: JSON.stringify(data) });
  }

  async getSLADashboard() {
    return this.request<any>('/settings/sla/dashboard');
  }

  // Custom Fields
  async getCustomFields(divisionId?: string) {
    const q = divisionId ? `?divisionId=${divisionId}` : '';
    return this.request<any[]>(`/settings/custom-fields${q}`);
  }

  async createCustomField(data: { label: string; type: string; options?: string[]; isRequired?: boolean }) {
    return this.request<any>('/settings/custom-fields', { method: 'POST', body: JSON.stringify(data) });
  }

  async updateCustomField(id: string, data: { label?: string; type?: string; options?: string[] | null; isRequired?: boolean }) {
    return this.request<any>(`/settings/custom-fields/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  async reorderCustomFields(fieldIds: string[]) {
    return this.request<any>('/settings/custom-fields-reorder', { method: 'PUT', body: JSON.stringify({ fieldIds }) });
  }

  async deleteCustomField(id: string) {
    return this.request<any>(`/settings/custom-fields/${id}`, { method: 'DELETE' });
  }

  // ─── Email Settings ──────────────────────────────────────────────
  async getEmailConfig(divisionId?: string) {
    const qs = divisionId ? `?divisionId=${divisionId}` : '';
    return this.request<any>(`/settings/email${qs}`);
  }

  async saveEmailConfig(data: any, divisionId?: string) {
    const qs = divisionId ? `?divisionId=${divisionId}` : '';
    return this.request<any>(`/settings/email${qs}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  async testEmailConnection(data: { smtpHost: string; smtpPort: number; smtpUser: string; smtpPass?: string }, divisionId?: string) {
    const qs = divisionId ? `?divisionId=${divisionId}` : '';
    return this.request<{ success: boolean; message: string }>(`/settings/email/test-connection${qs}`, { method: 'POST', body: JSON.stringify(data) });
  }

  async sendTestEmail(toEmail: string, divisionId?: string) {
    const qs = divisionId ? `?divisionId=${divisionId}` : '';
    return this.request<{ success: boolean; message: string }>(`/settings/email/send-test${qs}`, { method: 'POST', body: JSON.stringify({ toEmail }) });
  }

  async getEmailTemplates(divisionId?: string) {
    const qs = divisionId ? `?divisionId=${divisionId}` : '';
    return this.request<any[]>(`/settings/email/templates${qs}`);
  }

  async saveEmailTemplate(name: string, data: { label: string; subject: string; body?: string; htmlBody?: string; description?: string }, divisionId?: string) {
    const qs = divisionId ? `?divisionId=${divisionId}` : '';
    return this.request<any>(`/settings/email/templates/${name}${qs}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  async deleteEmailTemplate(name: string, divisionId?: string) {
    const qs = divisionId ? `?divisionId=${divisionId}` : '';
    return this.request<any>(`/settings/email/templates/${name}${qs}`, { method: 'DELETE' });
  }

  async previewEmailTemplate(data: { subject?: string; body?: string; htmlBody?: string }, divisionId?: string) {
    const qs = divisionId ? `?divisionId=${divisionId}` : '';
    return this.request<{ subject: string; html: string }>(`/settings/email/templates/preview${qs}`, { method: 'POST', body: JSON.stringify(data) });
  }

  // ─── Incoming Email (IMAP / POP3) Settings ──────────────────────
  async getIncomingEmailConfig(divisionId?: string) {
    const qs = divisionId ? `?divisionId=${divisionId}` : '';
    return this.request<any>(`/settings/email/incoming${qs}`);
  }

  async saveIncomingEmailConfig(data: any, divisionId?: string) {
    const qs = divisionId ? `?divisionId=${divisionId}` : '';
    return this.request<any>(`/settings/email/incoming${qs}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  async testImapConnection(data: { imapHost: string; imapPort: number; imapUser: string; imapPass?: string; imapSecurity?: string }, divisionId?: string) {
    const qs = divisionId ? `?divisionId=${divisionId}` : '';
    return this.request<{ success: boolean; message: string; mailboxes?: string[] }>(`/settings/email/incoming/test-imap${qs}`, { method: 'POST', body: JSON.stringify(data) });
  }

  async testPop3Connection(data: { popHost: string; popPort: number; popUser: string; popPass?: string; popSecurity?: string }, divisionId?: string) {
    const qs = divisionId ? `?divisionId=${divisionId}` : '';
    return this.request<{ success: boolean; message: string }>(`/settings/email/incoming/test-pop3${qs}`, { method: 'POST', body: JSON.stringify(data) });
  }

  async fetchIncomingEmails(divisionId?: string) {
    const qs = divisionId ? `?divisionId=${divisionId}` : '';
    return this.request<{ success: boolean; emails?: any[]; count?: number; error?: string }>(`/settings/email/incoming/fetch${qs}`, { method: 'POST' });
  }

  // ─── Division Management ─────────────────────────────────────────
  async getDivisions(): Promise<Organization[]> {
    return this.request<Organization[]>('/divisions');
  }

  async getDivisionTemplates(): Promise<IndustryTemplate[]> {
    return this.request<IndustryTemplate[]>('/divisions/templates');
  }

  async createDivision(data: Record<string, unknown>): Promise<Organization> {
    return this.request<Organization>('/divisions', { method: 'POST', body: JSON.stringify(data) });
  }

  async getDivision(id: string): Promise<Organization> {
    return this.request<Organization>(`/divisions/${id}`);
  }

  async updateDivision(id: string, data: Partial<Organization>): Promise<Organization> {
    return this.request<Organization>(`/divisions/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  async deleteDivision(id: string): Promise<void> {
    return this.request<void>(`/divisions/${id}`, { method: 'DELETE' });
  }

  async applyDivisionTemplate(divisionId: string, data: { templateId: string; replaceStages?: boolean; replaceFields?: boolean; replaceTags?: boolean }): Promise<{ message: string; summary: { stagesAdded: number; fieldsAdded: number; tagsAdded: number; stagesRemoved: number; fieldsRemoved: number; tagsRemoved: number } }> {
    return this.request(`/divisions/${divisionId}/apply-template`, { method: 'POST', body: JSON.stringify(data) });
  }

  // ─── Division Users & Stats (NEW) ────────────────────────────────
  async getDivisionUsers(divisionId: string, params?: { search?: string; role?: string; isActive?: string }): Promise<DivisionUser[]> {
    const queryParams = new URLSearchParams();
    if (params?.search) queryParams.set('search', params.search);
    if (params?.role) queryParams.set('role', params.role);
    if (params?.isActive) queryParams.set('isActive', params.isActive);
    const qs = queryParams.toString();
    return this.request<DivisionUser[]>(`/divisions/${divisionId}/users${qs ? '?' + qs : ''}`);
  }

  async getDivisionStats(divisionId: string): Promise<DivisionStats> {
    return this.request<DivisionStats>(`/divisions/${divisionId}/stats`);
  }

  async inviteDivisionUser(divisionId: string, data: { email: string; firstName: string; lastName: string; role: string; password: string }) {
    return this.request<any>(`/divisions/${divisionId}/users/invite`, { method: 'POST', body: JSON.stringify(data) });
  }

  async transferDivisionUser(divisionId: string, data: { userId: string; targetDivisionId: string }) {
    return this.request<any>(`/divisions/${divisionId}/users/transfer`, { method: 'POST', body: JSON.stringify(data) });
  }

  async updateDivisionUser(divisionId: string, userId: string, data: any) {
    return this.request<any>(`/divisions/${divisionId}/users/${userId}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  async resetDivisionUserPassword(divisionId: string, userId: string, newPassword: string) {
    return this.request<any>(`/divisions/${divisionId}/users/${userId}/reset-password`, { method: 'PUT', body: JSON.stringify({ newPassword }) });
  }



  // ─── Notifications ───────────────────────────────────────────────

  async getNotifications(params?: Record<string, string | number>) {
    const query = params
      ? '?' + new URLSearchParams(params as Record<string, string>).toString()
      : '';
    return this.request<{
      data: AppNotification[];
      pagination: { page: number; limit: number; total: number; totalPages: number };
    }>(`/notifications${query}`);
  }

  async getUnreadCount() {
    return this.request<{ count: number }>('/notifications/unread-count');
  }

  async markNotificationRead(id: string) {
    return this.request<{ success: boolean }>(`/notifications/${id}/read`, {
      method: 'POST',
    });
  }

  async markAllNotificationsRead() {
    return this.request<{ success: boolean }>('/notifications/read-all', {
      method: 'POST',
    });
  }

  async archiveNotification(id: string) {
    return this.request<{ success: boolean }>(`/notifications/${id}/archive`, {
      method: 'POST',
    });
  }

  async deleteNotification(id: string) {
    return this.request<{ success: boolean }>(`/notifications/${id}`, {
      method: 'DELETE',
    });
  }

  async getNotificationPrefs() {
    return this.request<any>('/notifications/preferences');
  }

  async updateNotificationPrefs(data: Partial<NotificationPreferences>) {
    return this.request<any>('/notifications/preferences', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // ─── Lead Allocation ────────────────────────────────────────────
  async reassignLead(leadId: string, assignedToId: string, reason?: string) {
    return this.request<any>(`/leads/${leadId}/reassign`, {
      method: 'POST',
      body: JSON.stringify({ assignedToId, reason }),
    });
  }

  async getAllocationStats() {
    return this.request<any>('/leads/allocation/stats');
  }

  async autoAllocateLeads() {
    return this.request<any>('/leads/allocation/auto-allocate', {
      method: 'POST',
    });
  }

  async getAllocationRules() {
    return this.request<any>('/leads/allocation/rules');
  }

  async updateAllocationRules(rules: any) {
    return this.request<any>('/leads/allocation/rules', {
      method: 'PUT',
      body: JSON.stringify(rules),
    });
  }

  async getAssignmentHistory(leadId: string) {
    return this.request<any[]>(`/leads/${leadId}/assignment-history`);
  }

  // ─── Inbox / Omnichannel ──────────────────────────────────────────

  async getInboxConversations(params?: { channel?: string; search?: string; status?: string; page?: number; limit?: number }) {
    const q = new URLSearchParams();
    if (params?.channel) q.set('channel', params.channel);
    if (params?.search) q.set('search', params.search);
    if (params?.status) q.set('status', params.status);
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    return this.request<any>(`/inbox/conversations?${q.toString()}`);
  }

  async getInboxMessages(leadId: string, params?: { channel?: string; page?: number; limit?: number }) {
    const q = new URLSearchParams();
    if (params?.channel) q.set('channel', params.channel);
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    return this.request<any>(`/inbox/conversations/${leadId}/messages?${q.toString()}`);
  }

  async sendInboxMessage(data: { leadId: string; channel: string; body: string; subject?: string; platform?: string; metadata?: any }) {
    return this.request<any>('/inbox/send', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getInboxStats() {
    return this.request<any>('/inbox/stats');
  }

  async updateConversationStatus(leadId: string, status: string) {
    return this.request<any>(`/inbox/conversations/${leadId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  async addInternalNote(leadId: string, body: string) {
    return this.request<any>(`/inbox/conversations/${leadId}/notes`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
  }

  async getInternalNotes(leadId: string) {
    return this.request<any[]>(`/inbox/conversations/${leadId}/notes`);
  }

  async markConversationRead(leadId: string) {
    return this.request<{ success: boolean }>(`/inbox/conversations/${leadId}/read`, {
      method: 'POST',
    });
  }

  async editInboxMessage(messageId: string, body: string) {
    return this.request<any>(`/inbox/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ body }),
    });
  }

  async deleteInboxMessage(messageId: string) {
    return this.request<any>(`/inbox/messages/${messageId}`, {
      method: 'DELETE',
    });
  }

  async getCannedResponses() {
    return this.request<any[]>('/inbox/canned-responses');
  }

  async uploadInboxFiles(files: File[]) {
    const formData = new FormData();
    files.forEach(f => formData.append('files', f));
    return this.requestFormData<{ attachments: any[] }>('/inbox/upload', formData);
  }

  async sendInboxMessageWithAttachments(data: {
    leadId: string;
    channel: string;
    body?: string;
    subject?: string;
    platform?: string;
    files: File[];
  }) {
    const formData = new FormData();
    formData.append('leadId', data.leadId);
    formData.append('channel', data.channel);
    if (data.body) formData.append('body', data.body);
    if (data.subject) formData.append('subject', data.subject);
    if (data.platform) formData.append('platform', data.platform);
    data.files.forEach(f => formData.append('files', f));
    return this.requestFormData<any>('/inbox/send-with-attachments', formData);
  }

  async getLeadAttachments(leadId: string) {
    return this.request<any[]>(`/inbox/conversations/${leadId}/attachments`);
  }
}

export const api = new ApiClient();
