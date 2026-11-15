import { type ErrorResponse } from '../types';

// Base API URL - configure via environment variable
const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8001';
const TOKEN_KEY = 'cosmcare_token';

export class ApiClient {
  private token: string | null = null;

  constructor() {
    try {
      this.token = localStorage.getItem(TOKEN_KEY);
    } catch {
      this.token = null;
    }
  }

  setAuthToken(token: string | null) {
    this.token = token;
    try {
      if (token) {
        localStorage.setItem(TOKEN_KEY, token);
      } else {
        localStorage.removeItem(TOKEN_KEY);
      }
    } catch {
      // ignore storage errors
    }
  }

  getToken(): string | null {
    return this.token;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<{
    success: boolean;
    data?: T;
    error?: string;
    status: number;
  }> {
    const headers = new Headers({
      'Content-Type': 'application/json',
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      ...options.headers,
    });

    let response: Response;
    try {
      response = await fetch(`${BASE_URL}/api${endpoint}`, {
        ...options,
        headers,
        credentials: 'omit', // JWT is in headers, not cookies
      });
    } catch {
      return {
        success: false,
        error: 'Unable to reach the COSMICARE backend. Check your connection and try again.',
        status: 0,
      };
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      const err = (data as ErrorResponse | null) ?? ({} as ErrorResponse);
      // FastAPI errors use "detail"; our envelope uses "message"/"error"
      const message =
        (typeof err === 'object' && err !== null
          ? (err as { detail?: string; message?: string; error?: string }).detail ||
            (err as { message?: string }).message ||
            (err as { error?: string }).error
          : null) ||
        response.statusText ||
        'Request failed';
      return {
        success: false,
        error: message,
        status: response.status,
      };
    }

    return {
      success: true,
      data: data as T,
      status: response.status,
    };
  }

  async get<T>(endpoint: string): Promise<{
    success: boolean;
    data?: T;
    error?: string;
    status: number;
  }> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, body?: unknown): Promise<{
    success: boolean;
    data?: T;
    error?: string;
    status: number;
  }> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  async put<T>(endpoint: string, body?: unknown): Promise<{
    success: boolean;
    data?: T;
    error?: string;
    status: number;
  }> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  async patch<T>(endpoint: string, body?: unknown): Promise<{
    success: boolean;
    data?: T;
    error?: string;
    status: number;
  }> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<{
    success: boolean;
    data?: T;
    error?: string;
    status: number;
  }> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  // Auth endpoints
  async register(payload: {
    email: string;
    password: string;
    full_name: string;
    role: 'astronaut' | 'medical' | 'mission_control' | 'admin';
    callsign?: string;
    invite_code?: string;
  }) {
    const result = await this.post<{ user: any; token: string; token_type: string }>(
      '/auth/register',
      payload,
    );
    if (result.success && result.data?.token) {
      this.setAuthToken(result.data.token);
    }
    return result;
  }

  async login(credentials: { email: string; password: string }) {
    const result = await this.post<{ user: any; token: string; token_type: string }>(
      '/auth/login',
      credentials,
    );
    if (result.success && result.data?.token) {
      this.setAuthToken(result.data.token);
    }
    return result;
  }

  async logout() {
    try {
      await this.post('/auth/logout', {});
    } catch {
      // ignore
    }
    this.setAuthToken(null);
  }

  async me() {
    return this.get<{
      user: any;
      privacy: any;
      astronaut_profile: { id: number; callsign: string } | null;
    }>('/auth/me');
  }

  async checkAuth(): Promise<boolean> {
    if (!this.token) return false;
    const result = await this.get('/auth/me');
    return result.success;
  }
}

export const api = new ApiClient();
