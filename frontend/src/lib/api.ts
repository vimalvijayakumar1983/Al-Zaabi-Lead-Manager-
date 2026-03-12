import type {
  Organization, DivisionUser, DivisionStats,
  Campaign, CampaignDashboardStats,
  Integration, IntegrationLog, IntegrationPlatformInfo,
  ApiKey, WidgetConfig,
  AppNotification, NotificationPreferences
} from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

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
      if (typeof window !== 'undefined') {
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
  async getPipelineStages() {
    return this.request<any[]>('/pipeline/stages');
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
  async getDashboard() {
    return this.request<any>('/analytics/dashboard');
  }

  async getFunnel() {
    return this.request<any>('/analytics/funnel');
  }

  async getTeamPerformance() {
    return this.request<any>('/analytics/team-performance');
  }

  async getTrends() {
    return this.request<any>('/analytics/trends');
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

  async getApiKeys() {
    return this.request<ApiKey[]>('/integrations/api-keys');
  }


  // Automations
  async getAutomations() {
    return this.request<any[]>('/automations');
  }

  async createAutomation(data: any) {
    return this.request<any>('/automations', { method: 'POST', body: JSON.stringify(data) });
  }

  async toggleAutomation(id: string) {
    return this.request<any>(`/automations/${id}/toggle`, { method: 'POST' });
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

  // Notification preferences moved to /notifications/preferences

  async getAuditLog() {
    return this.request<any[]>('/settings/audit-log');
  }

  async deleteAccount(password: string) {
    return this.request<any>('/settings/account', { method: 'DELETE', body: JSON.stringify({ password }) });
  }

  // Custom Fields
  async getCustomFields() {
    return this.request<any[]>('/settings/custom-fields');
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

  // ─── Division Management ─────────────────────────────────────────
  async getDivisions(): Promise<Organization[]> {
    return this.request<Organization[]>('/divisions');
  }

  async createDivision(data: Partial<Organization>): Promise<Organization> {
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

  async getNotificationPreferences() {
    return this.request<NotificationPreferences>('/notifications/preferences');
  }

  async updateNotificationPreferences(data: Partial<NotificationPreferences>) {
    return this.request<NotificationPreferences>('/notifications/preferences', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }
}

export const api = new ApiClient();
