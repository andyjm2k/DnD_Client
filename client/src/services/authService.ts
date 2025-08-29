import axios from 'axios';

export interface User {
  id: string;
  username: string;
  email: string;
  displayName?: string;
  avatar?: string;
  roles: string;
  emailVerified: boolean;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
  displayName?: string;
}

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordReset {
  token: string;
  password: string;
}

export interface ProfileUpdate {
  displayName?: string;
  bio?: string;
  avatar?: string;
  theme?: 'light' | 'dark';
  notifications?: boolean;
}

export interface SessionInfo {
  id: string;
  deviceInfo: Record<string, any>;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
  lastActivityAt: string;
  expiresAt: string;
}

export interface UserPermissions {
  role: string;
  permissions: string[];
  grantedBy: string;
  grantedAt: string;
  expiresAt?: string;
}

class AuthService {
  private baseURL: string;

  constructor() {
    this.baseURL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
  }

  // Authentication methods
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const response = await axios.post(`${this.baseURL}/api/auth/login`, credentials);
    return response.data;
  }

  async register(data: RegisterData): Promise<AuthResponse> {
    const response = await axios.post(`${this.baseURL}/api/auth/register`, data);
    return response.data;
  }

  async logout(): Promise<void> {
    await axios.post(`${this.baseURL}/api/auth/logout`);
  }

  async logoutAll(): Promise<void> {
    await axios.post(`${this.baseURL}/api/auth/logout-all`);
  }

  async getCurrentUser(): Promise<User> {
    const response = await axios.get(`${this.baseURL}/api/auth/me`);
    return response.data;
  }

  // Profile management
  async updateProfile(updates: ProfileUpdate): Promise<User> {
    const response = await axios.patch(`${this.baseURL}/api/auth/profile`, updates);
    return response.data;
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await axios.post(`${this.baseURL}/api/auth/change-password`, {
      currentPassword,
      newPassword
    });
  }

  // Email verification
  async verifyEmail(token: string): Promise<void> {
    await axios.post(`${this.baseURL}/api/auth/verify-email`, { token });
  }

  // Password reset
  async requestPasswordReset(data: PasswordResetRequest): Promise<void> {
    await axios.post(`${this.baseURL}/api/auth/forgot-password`, data);
  }

  async resetPassword(data: PasswordReset): Promise<void> {
    await axios.post(`${this.baseURL}/api/auth/reset-password`, data);
  }

  // Session management
  async getSessions(): Promise<{ sessions: SessionInfo[]; currentSession: { ipAddress: string; userAgent: string } }> {
    const response = await axios.get(`${this.baseURL}/api/auth/sessions`);
    return response.data;
  }

  async terminateSession(sessionId: string): Promise<void> {
    await axios.delete(`${this.baseURL}/api/auth/sessions/${sessionId}`);
  }

  async getSessionStats(): Promise<{ activeSessions: number; totalSessions: number }> {
    const response = await axios.get(`${this.baseURL}/api/auth/sessions/stats`);
    return response.data;
  }

  // RBAC methods
  async getUserPermissions(campaignId: string): Promise<UserPermissions> {
    const response = await axios.get(`${this.baseURL}/api/rbac/campaigns/${campaignId}/permissions`);
    return response.data;
  }

  async checkPermission(campaignId: string, permission: string): Promise<{ hasPermission: boolean }> {
    const response = await axios.post(`${this.baseURL}/api/rbac/campaigns/${campaignId}/check-permission`, {
      permission
    });
    return response.data;
  }

  async checkPermissions(campaignId: string, permissions: string[], requireAll = false): Promise<{ hasPermission: boolean }> {
    const response = await axios.post(`${this.baseURL}/api/rbac/campaigns/${campaignId}/check-permission`, {
      permissions,
      requireAll
    });
    return response.data;
  }

  // Utility methods
  setAuthToken(token: string | null): void {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      localStorage.setItem('auth_token', token);
    } else {
      delete axios.defaults.headers.common['Authorization'];
      localStorage.removeItem('auth_token');
    }
  }

  getStoredToken(): string | null {
    return localStorage.getItem('auth_token');
  }

  isAuthenticated(): boolean {
    return !!this.getStoredToken();
  }

  // Error handling
  handleAuthError(error: any): string {
    if (error.response?.data?.details) {
      // Handle validation errors with specific field details
      const details = error.response.data.details;
      if (Array.isArray(details) && details.length > 0) {
        return details.map(detail => detail.message).join('. ');
      }
    }
    if (error.response?.data?.error) {
      return error.response.data.error;
    }
    if (error.response?.data?.message) {
      return error.response.data.message;
    }
    return 'An unexpected error occurred';
  }
}

export const authService = new AuthService();
export default authService;
