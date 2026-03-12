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
    return this.request<{ token: string; user: any }>('/auth/login', {
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

  // Campaigns
  async getCampaigns(params?: Record<string, string | number>) {
    const query = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
    return this.request<any>(`/campaigns${query}`);
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
}

export const api = new ApiClient();
