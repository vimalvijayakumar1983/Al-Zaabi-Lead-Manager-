import type {
  Organization, DivisionUser, DivisionStats, IndustryTemplate,
  Campaign, CampaignDashboardStats,
  Integration, IntegrationLog, IntegrationPlatformInfo,
  ApiKey, WidgetConfig, Contact, ContactStats, Deal,
  AppNotification, NotificationPreferences,
  BuiltInField, CustomField
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
      const details =
        Array.isArray(data.details)
          ? data.details.map((d: any) => `${d.field}: ${d.message}`).join(', ')
          : (typeof data.details === 'string' ? data.details : '');
      const err = new Error(details ? `${data.error}: ${details}` : (data.error || data.message || 'Request failed')) as Error & {
        details?: any;
        reasonCode?: string;
        diagnostics?: any;
      };
      err.details = data;
      if (typeof data.reasonCode === 'string') err.reasonCode = data.reasonCode;
      if (data.diagnostics != null) err.diagnostics = data.diagnostics;
      throw err;
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
      const details =
        Array.isArray(data.details)
          ? data.details.map((d: any) => `${d.field}: ${d.message}`).join(', ')
          : (typeof data.details === 'string' ? data.details : '');
      const err = new Error(details ? `${data.error}: ${details}` : (data.error || data.message || 'Upload failed')) as Error & {
        details?: any;
        reasonCode?: string;
        diagnostics?: any;
      };
      err.details = data;
      if (typeof data.reasonCode === 'string') err.reasonCode = data.reasonCode;
      if (data.diagnostics != null) err.diagnostics = data.diagnostics;
      throw err;
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

  /** Overview + reachability for leads toolbar; same query params as getLeads (filters + division). */
  async getLeadsStats(params?: Record<string, string | number>) {
    const query = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
    return this.request<any>(`/leads/stats${query}`);
  }

  async globalSearch(q: string) {
    return this.request<any>(`/leads/search/global?q=${encodeURIComponent(q)}`);
  }

  // ─── Tags ──────────────────────────────────────────────────────
  async getTags(organizationId?: string) {
    const params = organizationId ? `?organizationId=${organizationId}` : '';
    return this.request<any[]>(`/leads/tags${params}`);
  }

  async createTag(data: { name: string; color?: string; organizationId: string }) {
    return this.request<any>('/leads/tags', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateTag(tagId: string, data: { name?: string; color?: string }) {
    return this.request<any>(`/leads/tags/${tagId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteTag(tagId: string) {
    return this.request<any>(`/leads/tags/${tagId}`, {
      method: 'DELETE',
    });
  }

  async addLeadTags(leadId: string, data: { tagIds?: string[]; tagNames?: string[] }) {
    return this.request<any>(`/leads/${leadId}/tags`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async removeLeadTag(leadId: string, tagId: string) {
    return this.request<any>(`/leads/${leadId}/tags/${tagId}`, {
      method: 'DELETE',
    });
  }

  async getFilterValues() {
    return this.request<any>('/leads/filter-values');
  }

  async getLead(id: string) {
    return this.request<any>(`/leads/${id}`);
  }

  async getLeadCampaignOffers(leadId: string) {
    return this.request<any[]>(`/leads/${leadId}/campaign-offers`);
  }

  async generateLeadAISummary(id: string, force = false) {
    return this.request<{
      success: boolean;
      data: {
        summary: string;
        highlights: string[];
        risks: string[];
        opportunities: string[];
        recommendedActions: Array<{
          title: string;
          reason: string;
          priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
        }>;
        confidence: number;
        generatedAt: string;
        signals: {
          score: number;
          conversionProb: number;
          status: string;
          openTasks: number;
          overdueTasks: number;
          staleDays: number | null;
          communications: number;
          calls: number;
          notes: number;
          hasWillCallAgain: boolean;
          hasNotInterested: boolean;
        };
      };
    }>(`/leads/${id}/ai-summary`, {
      method: 'POST',
      body: JSON.stringify({ force }),
    });
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

  async blockLead(id: string) {
    return this.request<any>(`/leads/${id}/block`, { method: 'POST' });
  }

  async unblockLead(id: string) {
    return this.request<any>(`/leads/${id}/unblock`, { method: 'POST' });
  }

  async whatsappOptOutLead(id: string) {
    return this.request<{ success: boolean; message: string }>(`/leads/${id}/whatsapp-opt-out`, { method: 'POST' });
  }

  async whatsappOptInLead(id: string) {
    return this.request<{ success: boolean; message: string }>(`/leads/${id}/whatsapp-opt-in`, { method: 'POST' });
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

  async createPipelineStage(data: { name: string; color?: string; divisionId?: string; isWonStage?: boolean; isLostStage?: boolean }) {
    return this.request<any>('/pipeline/stages', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updatePipelineStage(stageId: string, data: { name?: string; color?: string; order?: number }) {
    return this.request<any>(`/pipeline/stages/${stageId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deletePipelineStage(stageId: string, reassignStageId?: string) {
    const query = reassignStageId ? `?reassignStageId=${reassignStageId}` : '';
    return this.request<any>(`/pipeline/stages/${stageId}${query}`, {
      method: 'DELETE',
    });
  }

  async reorderPipelineStages(stageIds: string[]) {
    return this.request<any>('/pipeline/stages/reorder', {
      method: 'POST',
      body: JSON.stringify({ stageIds }),
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

  async updateTask(id: string, data: any) {
    return this.request<any>(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  async deleteTask(id: string) {
    return this.request<any>(`/tasks/${id}`, { method: 'DELETE' });
  }

  async bulkUpdateTasks(taskIds: string[], data: any) {
    return this.request<any>('/tasks/bulk', { method: 'PATCH', body: JSON.stringify({ taskIds, ...data }) });
  }

  async getTaskStats() {
    return this.request<any>('/tasks/stats');
  }

  // Analytics
  async getDashboard(divisionId?: string) {
    const q = divisionId ? `?divisionId=${encodeURIComponent(divisionId)}` : '';
    return this.request<any>(`/analytics/dashboard${q}`);
  }

  async getDashboardFull(
    period = '30d',
    divisionId?: string,
    filters?: { teamMemberId?: string; dateFrom?: string; dateTo?: string }
  ) {
    const q = new URLSearchParams({
      period,
      ...(divisionId ? { divisionId } : {}),
      ...(filters?.teamMemberId ? { teamMemberId: filters.teamMemberId } : {}),
      ...(filters?.dateFrom ? { from: filters.dateFrom } : {}),
      ...(filters?.dateTo ? { to: filters.dateTo } : {}),
    });
    return this.request<any>(`/analytics/dashboard-full?${q}`);
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

  async getTaskSLAReport(period = '30d', divisionId?: string) {
    const q = new URLSearchParams({ period, ...(divisionId ? { divisionId } : {}) });
    return this.request<any>(`/analytics/task-sla-report?${q}`);
  }

  async getCallDispositionReport(period = '30d', divisionId?: string, mode?: 'latest' | 'any') {
    const q = new URLSearchParams({ period, ...(divisionId ? { divisionId } : {}), ...(mode ? { mode } : {}) });
    return this.request<any>(`/analytics/call-disposition-report?${q}`);
  }

  async getPipelineForecastReport(period = '30d', divisionId?: string) {
    const q = new URLSearchParams({ period, ...(divisionId ? { divisionId } : {}) });
    return this.request<any>(`/analytics/pipeline-forecast-report?${q}`);
  }

  async getPhase1Report(period = '30d', divisionId?: string) {
    const q = new URLSearchParams({ period, ...(divisionId ? { divisionId } : {}) });
    return this.request<any>(`/analytics/phase1-report?${q}`);
  }

  async getDivisionComparison() {
    return this.request<any>('/analytics/division-comparison');
  }

  // Users
  async getUsers(divisionId?: string) {
    const q = divisionId ? `?divisionId=${encodeURIComponent(divisionId)}` : '';
    return this.request<any[]>(`/users${q}`);
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

  async deleteUserPermanently(id: string, reassignTo?: string) {
    return this.request<any>(`/users/${id}/permanent`, {
      method: 'DELETE',
      body: JSON.stringify(reassignTo ? { reassignTo } : {}),
    });
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
    assignToIds?: string[];
    defaultStatus?: string;
    defaultSource?: string;
    defaultCampaignIds?: string[];
    broadcastListName?: string;
    broadcastListSlug?: string;
    divisionId?: string | null;
  }) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('module', options.module);
    formData.append('fieldMapping', JSON.stringify(options.fieldMapping));
    formData.append('duplicateAction', options.duplicateAction);
    if (options.duplicateField) formData.append('duplicateField', options.duplicateField);
    if (options.assignToIds && options.assignToIds.length > 0) formData.append('assignToIds', JSON.stringify(options.assignToIds));
    if (options.defaultStatus) formData.append('defaultStatus', options.defaultStatus);
    if (options.defaultSource) formData.append('defaultSource', options.defaultSource);
    if (options.defaultCampaignIds && options.defaultCampaignIds.length > 0) {
      formData.append('defaultCampaignIds', JSON.stringify(options.defaultCampaignIds));
    }
    if (options.broadcastListName) formData.append('broadcastListName', options.broadcastListName);
    if (options.broadcastListSlug) formData.append('broadcastListSlug', options.broadcastListSlug);
    const div = options.divisionId ?? (typeof window !== 'undefined' ? localStorage.getItem('activeDivisionId') : null);
    if (div) formData.append('divisionId', div);
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

  /** WhatsApp broadcast audience lists (per division via activeDivisionId for super admins). */
  async listBroadcastLists(divisionId?: string | null) {
    const q = divisionId ? `?divisionId=${encodeURIComponent(divisionId)}` : '';
    return this.request<{
      lists: Array<{
        id: string;
        name: string;
        slug: string | null;
        memberCount: number;
        createdAt: string;
        updatedAt: string;
      }>;
    }>(`/broadcast-lists${q}`);
  }

  async getBroadcastList(id: string, divisionId?: string | null) {
    const q = divisionId ? `?divisionId=${encodeURIComponent(divisionId)}` : '';
    return this.request<{
      list: {
        id: string;
        name: string;
        slug: string | null;
        memberCount: number;
        createdAt: string;
        updatedAt: string;
        members: Array<{
          id: string;
          phone: string;
          phoneRaw: string | null;
          displayName: string | null;
          leadId: string | null;
          lead: { id: string; firstName: string; lastName: string; phone: string | null; email: string | null } | null;
        }>;
      };
    }>(`/broadcast-lists/${id}${q}`);
  }

  async deleteBroadcastList(id: string, divisionId?: string | null) {
    const q = divisionId ? `?divisionId=${encodeURIComponent(divisionId)}` : '';
    return this.request<{ ok: boolean }>(`/broadcast-lists/${id}${q}`, { method: 'DELETE' });
  }

  async sendBroadcastTemplate(
    listId: string,
    payload: {
      templateId: string;
      variables?: Record<string, string>;
      mode?: 'now' | 'later';
      scheduledAt?: string | null;
    },
    divisionId?: string | null,
  ) {
    const q = divisionId ? `?divisionId=${encodeURIComponent(divisionId)}` : '';
    return this.request<{
      ok: boolean;
      mode: 'now' | 'later';
      runId?: string;
      total?: number;
      sent?: number;
      failed?: number;
      failures?: Array<{ memberId: string; phone: string; error: string }>;
      message?: string;
    }>(`/broadcast-lists/${listId}/send-template${q}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async listBroadcastRuns(divisionId?: string | null) {
    const q = divisionId ? `?divisionId=${encodeURIComponent(divisionId)}` : '';
    return this.request<{
      runs: Array<{
        id: string;
        mode: 'NOW' | 'LATER';
        status: 'SCHEDULED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
        templateName: string;
        templateLanguage: string;
        list: { id: string; name: string };
        scheduledAt: string | null;
        totalRecipients: number;
        sentCount: number;
        failedCount: number;
        deliveredCount: number;
        readCount: number;
        repliedCount: number;
        startedAt: string | null;
        completedAt: string | null;
        createdAt: string;
        updatedAt: string;
      }>;
    }>(`/broadcast-lists/runs${q}`);
  }

  async getBroadcastRun(id: string, divisionId?: string | null) {
    const q = divisionId ? `?divisionId=${encodeURIComponent(divisionId)}` : '';
    return this.request<{
      run: {
        id: string;
        mode: 'NOW' | 'LATER';
        status: 'SCHEDULED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
        templateName: string;
        templateLanguage: string;
        list: { id: string; name: string; slug: string | null };
        scheduledAt: string | null;
        totalRecipients: number;
        sentCount: number;
        failedCount: number;
        deliveredCount: number;
        readCount: number;
        repliedCount: number;
        startedAt: string | null;
        completedAt: string | null;
        createdAt: string;
        updatedAt: string;
        recipients: Array<{
          id: string;
          leadId: string;
          phone: string;
          status: 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
          waMessageId: string | null;
          error: string | null;
          attemptCount: number;
          sentAt: string | null;
          deliveredAt: string | null;
          readAt: string | null;
          createdAt: string;
          updatedAt: string;
          lead: {
            id: string;
            firstName: string;
            lastName: string;
            phone: string | null;
            email: string | null;
            whatsappOptOut?: boolean;
            whatsappOptOutAt?: string | null;
          } | null;
        }>;
      };
    }>(`/broadcast-lists/runs/${encodeURIComponent(id)}${q}`);
  }

  async cancelBroadcastRun(id: string, divisionId?: string | null) {
    const q = divisionId ? `?divisionId=${encodeURIComponent(divisionId)}` : '';
    return this.request<{ ok: boolean; run: { id: string; status: string } }>(
      `/broadcast-lists/runs/${encodeURIComponent(id)}/cancel${q}`,
      { method: 'PATCH' },
    );
  }

  async retryBroadcastRun(id: string, divisionId?: string | null) {
    const q = divisionId ? `?divisionId=${encodeURIComponent(divisionId)}` : '';
    return this.request<{ ok: boolean; runId: string; retrying: number; message: string }>(
      `/broadcast-lists/runs/${encodeURIComponent(id)}/retry${q}`,
      { method: 'POST' },
    );
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

  async getCampaignStats(divisionId?: string) {
    const query = divisionId ? `?divisionId=${encodeURIComponent(divisionId)}` : '';
    return this.request<CampaignDashboardStats>(`/campaigns/stats${query}`);
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

  async getCampaignTemplates(divisionId?: string) {
    const query = divisionId ? `?divisionId=${encodeURIComponent(divisionId)}` : '';
    return this.request<any[]>(`/campaigns/templates${query}`);
  }

  async createCampaignTemplate(data: { name: string; description?: string | null; config?: Record<string, any>; isActive?: boolean; divisionId?: string }) {
    return this.request<any>('/campaigns/templates', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateCampaignTemplate(id: string, data: Partial<{ name: string; description: string | null; config: Record<string, any>; isActive: boolean }>) {
    return this.request<any>(`/campaigns/templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteCampaignTemplate(id: string) {
    return this.request<{ success: boolean }>(`/campaigns/templates/${id}`, { method: 'DELETE' });
  }

  async previewCampaignAudience(campaignId: string, filters: Record<string, any>) {
    return this.request<any>(`/campaigns/${campaignId}/assignments/preview`, {
      method: 'POST',
      body: JSON.stringify(filters || {}),
    });
  }

  async applyCampaignAudience(campaignId: string, payload: Record<string, any>) {
    return this.request<any>(`/campaigns/${campaignId}/assignments/apply`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getCampaignAssignments(campaignId: string, params?: Record<string, string | number>) {
    const query = params ? `?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}` : '';
    return this.request<any>(`/campaigns/${campaignId}/assignments${query}`);
  }

  async updateCampaignAssignment(assignmentId: string, payload: Record<string, any>) {
    return this.request<any>(`/campaigns/assignments/${assignmentId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async getCampaignOfferAnalytics(campaignId: string) {
    return this.request<any>(`/campaigns/${campaignId}/offer-analytics`);
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

  async getErpData(params?: { integrationId?: string; divisionId?: string; entityType?: string; page?: number; limit?: number }) {
    const query = params
      ? '?' + new URLSearchParams(
          Object.entries(params)
            .filter(([, v]) => v !== undefined && v !== null && String(v) !== '')
            .map(([k, v]) => [k, String(v)])
        ).toString()
      : '';
    return this.request<{
      data: Array<{
        id: string;
        integrationId: string;
        provider: string | null;
        divisionId: string | null;
        entityType: string;
        externalId: string;
        crmEntityId: string;
        payload: Record<string, unknown>;
        createdAt: string;
        updatedAt: string;
      }>;
      total: number;
      countsByEntity: Record<string, number>;
      pagination?: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
    }>(`/integrations/erp-data${query}`);
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
  async getCommunications(leadId: string) {
    return this.request<any[]>('/communications/lead/' + leadId);
  }

  /** Leads that have at least one WhatsApp message, with last message preview (for Communication → WhatsApp tab). */
  async getWhatsAppConversations() {
    return this.request<Array<{ lead: { id: string; firstName: string; lastName: string; phone: string | null }; lastMessage: { body: string; createdAt: string; direction: string } }>>('/communications/whatsapp-conversations');
  }

  async sendEmail(data: { leadId: string; to: string; subject: string; body: string }) {
    return this.request<any>('/communications/send-email', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async sendWhatsApp(data: { leadId: string; body: string }) {
    return this.request<any>('/communications/send-whatsapp', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async sendWhatsAppTemplate(data: { leadId: string; templateName?: string; languageCode?: string }) {
    return this.request<any>('/communications/send-whatsapp-template', {
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

  async getDispositions(params?: { leadId?: string; divisionId?: string }) {
    const q = new URLSearchParams();
    if (params?.leadId) q.set('leadId', params.leadId);
    if (params?.divisionId) q.set('divisionId', params.divisionId);
    const query = q.toString();
    return this.request<any[]>(`/call-logs/dispositions${query ? `?${query}` : ''}`);
  }

  async getDispositionSettings() {
    return this.request<{ disposition: string; label: string; requireNotes: boolean }[]>('/call-logs/dispositions/settings');
  }

  async updateDispositionSettings(settings: { disposition: string; requireNotes: boolean }[]) {
    return this.request<{ disposition: string; label: string; requireNotes: boolean }[]>(
      '/call-logs/dispositions/settings',
      { method: 'PUT', body: JSON.stringify({ settings }) }
    );
  }

  async getDispositionStudio(divisionId?: string) {
    const q = divisionId ? `?divisionId=${encodeURIComponent(divisionId)}` : '';
    return this.request<{ divisionId: string; dispositions: any[] }>(`/call-logs/dispositions/studio${q}`);
  }

  async updateDispositionStudio(dispositions: any[], divisionId?: string) {
    return this.request<{ divisionId: string; dispositions: any[] }>('/call-logs/dispositions/studio', {
      method: 'PUT',
      body: JSON.stringify({ dispositions, ...(divisionId ? { divisionId } : {}) }),
    });
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

  /** WhatsApp Cloud API credentials — stored per division (SUPER_ADMIN: pass divisionId). */
  async getWhatsAppSettings(divisionId?: string, revealSecrets?: boolean) {
    const q = new URLSearchParams();
    if (divisionId) q.set('divisionId', divisionId);
    if (revealSecrets) q.set('revealSecrets', 'true');
    const qs = q.toString() ? `?${q.toString()}` : '';
    return this.request<{
      whatsappNumbers: Array<{ label: string; phoneNumberId: string; displayPhone?: string; token: string; hasToken?: boolean }>;
      whatsappWebhookVerifyToken: string;
      hasWebhookVerifyToken?: boolean;
      whatsappApiUrl: string;
      whatsappBusinessAccountId?: string;
      whatsappMetaAppId?: string;
      whatsappTokenStatus?: { ok: boolean; checkedAt: string | null; error: string | null } | null;
    }>(`/settings/whatsapp${qs}`);
  }

  async saveWhatsAppSettings(
    data: {
      whatsappNumbers: Array<{ label?: string; phoneNumberId: string; displayPhone?: string; token?: string }>;
      whatsappWebhookVerifyToken?: string;
      whatsappApiUrl?: string;
      whatsappBusinessAccountId?: string;
      whatsappMetaAppId?: string;
    },
    divisionId?: string,
  ) {
    const qs = divisionId ? `?divisionId=${encodeURIComponent(divisionId)}` : '';
    return this.request<{
      whatsappNumbers: Array<{ label: string; phoneNumberId: string; displayPhone?: string; token: string; hasToken?: boolean }>;
      whatsappWebhookVerifyToken: string;
      hasWebhookVerifyToken?: boolean;
      whatsappApiUrl: string;
      whatsappBusinessAccountId?: string;
      whatsappMetaAppId?: string;
    }>(`/settings/whatsapp${qs}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  async listWhatsAppTemplates(divisionId?: string) {
    const qs = divisionId ? `?divisionId=${encodeURIComponent(divisionId)}` : '';
    return this.request<{
      templates: Array<{
        id: string;
        waTemplateId: string;
        name: string;
        language: string;
        status: string | null;
        category: string | null;
        rejectedReason: string | null;
        components?: any;
        lastSyncedAt: string;
      }>;
      lastSyncedAt: string | null;
    }>(`/whatsapp/templates${qs}`);
  }

  async syncWhatsAppTemplates(divisionId?: string) {
    const qs = divisionId ? `?divisionId=${encodeURIComponent(divisionId)}` : '';
    return this.request<{
      success: boolean;
      syncedCount: number;
      templates: Array<{
        id: string;
        waTemplateId: string;
        name: string;
        language: string;
        status: string | null;
        category: string | null;
        rejectedReason: string | null;
        components?: any;
        lastSyncedAt: string;
      }>;
      lastSyncedAt: string;
    }>(`/whatsapp/templates/sync${qs}`, { method: 'POST' });
  }

  async createWhatsAppTemplate(
    data: { name: string; language: string; category: string; components: Record<string, unknown>[] },
    divisionId?: string
  ) {
    const qs = divisionId ? `?divisionId=${encodeURIComponent(divisionId)}` : '';
    return this.request<any>(`/whatsapp/templates${qs}`, { method: 'POST', body: JSON.stringify(data) });
  }

  async updateWhatsAppTemplate(
    id: string,
    data: { category?: string; components?: Record<string, unknown>[] },
    divisionId?: string
  ) {
    const qs = divisionId ? `?divisionId=${encodeURIComponent(divisionId)}` : '';
    return this.request<any>(`/whatsapp/templates/${id}${qs}`, { method: 'PATCH', body: JSON.stringify(data) });
  }

  async deleteWhatsAppTemplate(id: string, divisionId?: string) {
    const qs = divisionId ? `?divisionId=${encodeURIComponent(divisionId)}` : '';
    return this.request<any>(`/whatsapp/templates/${id}${qs}`, { method: 'DELETE' });
  }

  async testWhatsAppSettings(data?: { phoneNumberId?: string }, divisionId?: string) {
    const qs = divisionId ? `?divisionId=${encodeURIComponent(divisionId)}` : '';
    return this.request<{
      success: boolean;
      message: string;
      reasonCode?: string;
      phoneNumberId?: string;
      displayPhoneNumber?: string | null;
      verifiedName?: string | null;
      diagnostics?: {
        token?: { ok: boolean | null; reasonCode?: string | null; message?: string | null };
        phoneNumberId?: { ok: boolean | null; reasonCode?: string | null; message?: string | null };
        waba?: { checked: boolean; ok: boolean | null; reasonCode?: string | null; message?: string | null };
      };
      details?: any;
    }>(`/settings/whatsapp/test${qs}`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    });
  }

  async getNotificationPreferences() {
    return this.request<any>('/settings/notifications');
  }

  async updateNotificationPreferences(data: Partial<NotificationPreferences>) {
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

  async createCustomField(data: {
    label: string;
    type: string;
    options?: string[];
    isRequired?: boolean;
    showInList?: boolean;
    showInDetail?: boolean;
    description?: string;
    placeholder?: string;
    defaultValue?: string;
    divisionId?: string | null;
  }) {
    return this.request<CustomField>('/settings/custom-fields', { method: 'POST', body: JSON.stringify(data) });
  }

  async updateCustomField(id: string, data: {
    label?: string;
    type?: string;
    options?: string[] | null;
    isRequired?: boolean;
    showInList?: boolean;
    showInDetail?: boolean;
    description?: string;
    placeholder?: string;
    defaultValue?: string;
    divisionId?: string | null;
  }) {
    return this.request<CustomField>(`/settings/custom-fields/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  async reorderCustomFields(fieldIds: string[]) {
    return this.request<any>('/settings/custom-fields-reorder', { method: 'PUT', body: JSON.stringify({ fieldIds }) });
  }

  async deleteCustomField(id: string) {
    return this.request<any>(`/settings/custom-fields/${id}`, { method: 'DELETE' });
  }

  // Field Configuration (built-in field visibility + custom fields)
  async getFieldConfig(divisionId?: string) {
    const q = divisionId ? `?divisionId=${divisionId}` : '';
    return this.request<{ builtInFields: BuiltInField[]; customFields: CustomField[]; statusLabels?: Record<string, string> }>(`/settings/field-config${q}`);
  }

  async getLeadSources(divisionId?: string) {
    const q = divisionId ? `?divisionId=${divisionId}` : '';
    return this.request<{ sources: Array<{ key: string; label: string; source: string; isSystem: boolean; isActive: boolean }> }>(`/settings/lead-sources${q}`);
  }

  async saveLeadSources(payload: {
    sources: Array<{ key?: string; label: string; source?: string; isSystem?: boolean; isActive?: boolean }>;
    divisionId?: string | null;
  }) {
    return this.request<{ success: boolean; sources: Array<{ key: string; label: string; source: string; isSystem: boolean; isActive: boolean }> }>('/settings/lead-sources', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async saveStatusLabels(divisionId: string | null, labels: Record<string, string>) {
    return this.request<{ success: boolean }>('/settings/status-labels', {
      method: 'PUT',
      body: JSON.stringify({ divisionId, labels }),
    });
  }

  async getStatusStageMapping(divisionId?: string) {
    const q = divisionId ? `?divisionId=${divisionId}` : '';
    return this.request<{
      divisionId: string;
      divisionName: string;
      statuses: string[];
      rows: Array<{
        stageId: string;
        stageName: string;
        isDefault: boolean;
        isWonStage: boolean;
        isLostStage: boolean;
        mappedStatus: string;
        source: 'manual' | 'fallback';
        fallbackStatus: string;
      }>;
    }>(`/settings/status-stage-mapping${q}`);
  }

  async saveStatusStageMapping(divisionId: string | null, mappings: Record<string, string>) {
    return this.request<{ success: boolean }>('/settings/status-stage-mapping', {
      method: 'PUT',
      body: JSON.stringify({ divisionId, mappings }),
    });
  }

  async cloneStatusStageMappingToAll(sourceDivisionId: string, targetDivisionIds?: string[]) {
    return this.request<{
      success: boolean;
      sourceDivisionId: string;
      clonedTo: number;
      divisions: Array<{ id: string; name: string; mappedStages: number }>;
    }>('/settings/status-stage-mapping/clone-to-all', {
      method: 'POST',
      body: JSON.stringify({ sourceDivisionId, ...(targetDivisionIds ? { targetDivisionIds } : {}) }),
    });
  }

  async saveFieldConfig(divisionId: string | null, fields: Record<string, { showInList: boolean; showInDetail: boolean; order: number }>) {
    return this.request<{ success: boolean }>('/settings/field-config', {
      method: 'PUT',
      body: JSON.stringify({ divisionId, fields }),
    });
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
    const enc = encodeURIComponent(divisionId);
    return this.request<DivisionUser[]>(`/divisions/${enc}/users${qs ? '?' + qs : ''}`);
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




  // ─── Division Memberships ──────────────────────────────────────
  async getUserDivisions(userId: string): Promise<any[]> {
    const res = await this.request<{ memberships: any[] }>(`/users/${userId}/divisions`);
    return (res as any).memberships || res || [];
  }

  async addUserToDivision(userId: string, data: { divisionId: string; role?: string }): Promise<any> {
    return this.request<any>(`/users/${userId}/divisions`, { method: 'POST', body: JSON.stringify(data) });
  }

  async updateUserDivisionRole(userId: string, divisionId: string, data: { role?: string; isPrimary?: boolean }): Promise<any> {
    return this.request<any>(`/users/${userId}/divisions/${divisionId}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  async removeUserFromDivision(userId: string, divisionId: string): Promise<any> {
    return this.request<any>(`/users/${userId}/divisions/${divisionId}`, { method: 'DELETE' });
  }

  // ─── Recycle Bin ────────────────────────────────────────────────
  async getRecycleBinItems(params?: Record<string, string | number>) {
    const q = new URLSearchParams();
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === '') continue;
        q.set(key, String(value));
      }
    }
    const query = q.toString();
    return this.request<any>(`/recycle-bin${query ? `?${query}` : ''}`);
  }

  async restoreRecycleBinItem(id: string) {
    return this.request<any>(`/recycle-bin/${id}/restore`, { method: 'POST' });
  }

  async permanentlyDeleteRecycleBinItem(id: string) {
    return this.request<any>(`/recycle-bin/${id}/permanent`, { method: 'DELETE' });
  }

  async bulkRestoreRecycleBinItems(ids: string[]) {
    return this.request<any>('/recycle-bin/bulk/restore', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
  }

  async bulkPermanentlyDeleteRecycleBinItems(ids: string[], confirmText = 'DELETE') {
    return this.request<any>('/recycle-bin/bulk/permanent-delete', {
      method: 'POST',
      body: JSON.stringify({ ids, confirmText }),
    });
  }

  async getRecycleBinAccessSettings() {
    return this.request<any>('/recycle-bin/access-settings');
  }

  async updateRecycleBinAccessSettings(data: { roleScopes?: Record<string, any>; userOverrides?: Record<string, any> }) {
    return this.request<any>('/recycle-bin/access-settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // ─── Notifications ───────────────────────────────────────────────

  async getNotifications(params?: Record<string, string | number>) {
    const query = params
      ? '?' + new URLSearchParams(params as Record<string, string>).toString()
      : '';
    return this.request<{
      data: AppNotification[];
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
      };
    }>(`/notifications${query}`);
  }

  async getUnreadCount(params?: { divisionId?: string }) {
    const q = new URLSearchParams();
    if (params?.divisionId) q.set('divisionId', params.divisionId);
    const query = q.toString();
    return this.request<{ count: number }>(`/notifications/unread-count${query ? `?${query}` : ''}`);
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

  async clearAllNotifications() {
    return this.request<{ success: boolean; changed?: number; unreadCount?: number }>('/notifications/clear-all', {
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

  async notificationAction(
    id: string,
    action: 'MARK_DONE' | 'SNOOZE' | 'ESCALATE',
    minutes?: number
  ) {
    return this.request<any>(`/notifications/${id}/action`, {
      method: 'POST',
      body: JSON.stringify(
        typeof minutes === 'number' ? { action, minutes } : { action }
      ),
    });
  }

  async snoozeNotification(id: string, minutes = 15) {
    return this.request<any>(`/notifications/${id}/snooze`, {
      method: 'POST',
      body: JSON.stringify({ minutes }),
    });
  }

  async escalateNotification(id: string) {
    return this.request<any>(`/notifications/${id}/escalate`, {
      method: 'POST',
    });
  }

  async getNotificationDigest(params?: { range?: string; from?: string; to?: string; limit?: number; divisionId?: string }) {
    const q = new URLSearchParams();
    if (params?.range) q.set('range', params.range);
    if (params?.from) q.set('from', params.from);
    if (params?.to) q.set('to', params.to);
    if (typeof params?.limit === 'number') q.set('limit', String(params.limit));
    if (params?.divisionId) q.set('divisionId', params.divisionId);
    const query = q.toString();
    return this.request<any>(`/notifications/digest${query ? `?${query}` : ''}`);
  }

  async getNotificationAnalytics(params?: { range?: string; from?: string; to?: string; divisionId?: string }) {
    const q = new URLSearchParams();
    if (params?.range) q.set('range', params.range);
    if (params?.from) q.set('from', params.from);
    if (params?.to) q.set('to', params.to);
    if (params?.divisionId) q.set('divisionId', params.divisionId);
    const query = q.toString();
    return this.request<any>(`/notifications/analytics${query ? `?${query}` : ''}`);
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

  async getAllocationStats(divisionId?: string) {
    const q = divisionId ? `?divisionId=${divisionId}` : '';
    return this.request<any>(`/leads/allocation/stats${q}`);
  }

  async autoAllocateLeads(divisionId?: string) {
    return this.request<any>('/leads/allocation/auto-allocate', {
      method: 'POST',
      body: JSON.stringify(divisionId ? { divisionId } : {}),
    });
  }

  async getAllocationRules(divisionId?: string) {
    const q = divisionId ? `?divisionId=${divisionId}` : '';
    return this.request<any>(`/leads/allocation/rules${q}`);
  }

  async updateAllocationRules(rules: any, divisionId?: string) {
    const payload = divisionId ? { ...rules, divisionId } : rules;
    return this.request<any>('/leads/allocation/rules', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async resetDivisionAllocationRules(divisionId: string) {
    return this.request<any>('/leads/allocation/rules', {
      method: 'PUT',
      body: JSON.stringify({ divisionId, resetToGlobal: true }),
    });
  }

  async getAssignmentHistory(leadId: string) {
    return this.request<any[]>(`/leads/${leadId}/assignment-history`);
  }
  // ─── Inbox / Omnichannel ──────────────────────────────────────────

  async getInboxConversations(params?: {
    channel?: string;
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
    /** Align with GET /leads — SUPER_ADMIN division switcher scopes inbox to one division */
    divisionId?: string;
  }) {
    const q = new URLSearchParams();
    if (params?.channel) q.set('channel', params.channel);
    if (params?.search) q.set('search', params.search);
    if (params?.status) q.set('status', params.status);
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.divisionId) q.set('divisionId', params.divisionId);
    return this.request<any>(`/inbox/conversations?${q.toString()}`);
  }

  async getInboxMessages(
    leadId: string,
    params?: { channel?: string; page?: number; limit?: number; divisionId?: string }
  ) {
    const q = new URLSearchParams();
    if (params?.channel) q.set('channel', params.channel);
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.divisionId) q.set('divisionId', params.divisionId);
    return this.request<any>(`/inbox/conversations/${leadId}/messages?${q.toString()}`);
  }

  async sendInboxMessage(data: { leadId: string; channel: string; body: string; subject?: string; platform?: string; metadata?: any }) {
    return this.request<any>('/inbox/send', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getInboxStats(divisionId?: string) {
    const q = divisionId ? `?divisionId=${encodeURIComponent(divisionId)}` : '';
    return this.request<any>(`/inbox/stats${q}`);
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

  async retryInboxWhatsAppMessage(messageId: string) {
    return this.request<any>(`/inbox/messages/${messageId}/retry-whatsapp`, {
      method: 'POST',
    });
  }

  async sendInboxWhatsAppTemplateMessage(
    leadId: string,
    data: { templateId?: string; templateName?: string; language?: string; variables?: string[] | Record<string, string> }
  ) {
    return this.request<any>(`/inbox/conversations/${leadId}/send-template`, {
      method: 'POST',
      body: JSON.stringify(data),
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

  // ─── Saved Views ─────────────────────────────────────────────────
  async getSavedViews(divisionId?: string) {
    const q = divisionId ? `?divisionId=${divisionId}` : '';
    return this.request<any[]>(`/saved-views${q}`);
  }

  async createSavedView(data: any) {
    return this.request<any>('/saved-views', { method: 'POST', body: JSON.stringify(data) });
  }

  async updateSavedView(id: string, data: any) {
    return this.request<any>(`/saved-views/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  async deleteSavedView(id: string) {
    return this.request<any>(`/saved-views/${id}`, { method: 'DELETE' });
  }

  async migrateSavedViews(views: any[], divisionId?: string) {
    return this.request<any>('/saved-views/migrate', {
      method: 'POST',
      body: JSON.stringify({ views, divisionId }),
    });
  }

  // ─── Report Builder ───────────────────────────────────────────────
  async getReportCatalog(dataset: 'leads' | 'tasks' | 'call_logs' | 'contacts' | 'deals' | 'campaigns' | 'campaign_assignments' | 'lead_activities' | 'pipelines', divisionId?: string) {
    const q = new URLSearchParams({ dataset, ...(divisionId ? { divisionId } : {}) });
    return this.request<any>(`/report-builder/catalog?${q.toString()}`);
  }

  async getReportDefinitions(params?: { divisionId?: string; dataset?: 'leads' | 'tasks' | 'call_logs' | 'contacts' | 'deals' | 'campaigns' | 'campaign_assignments' | 'lead_activities' | 'pipelines' }) {
    const q = new URLSearchParams();
    if (params?.divisionId) q.set('divisionId', params.divisionId);
    if (params?.dataset) q.set('dataset', params.dataset);
    const suffix = q.toString() ? `?${q.toString()}` : '';
    return this.request<any[]>(`/report-builder/definitions${suffix}`);
  }

  async createReportDefinition(data: any) {
    return this.request<any>('/report-builder/definitions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateReportDefinition(id: string, data: any) {
    return this.request<any>(`/report-builder/definitions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteReportDefinition(id: string) {
    return this.request<any>(`/report-builder/definitions/${id}`, {
      method: 'DELETE',
    });
  }

  async previewReport(payload: { dataset: 'leads' | 'tasks' | 'call_logs' | 'contacts' | 'deals' | 'campaigns' | 'campaign_assignments' | 'lead_activities' | 'pipelines'; divisionId?: string; config: any }) {
    return this.request<any>('/report-builder/preview', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async runReport(id: string) {
    return this.request<any>(`/report-builder/run/${id}`, {
      method: 'POST',
    });
  }
}

export const api = new ApiClient();
