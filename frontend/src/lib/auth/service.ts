import { api } from '../api/client';

export interface AuthUser {
  id: number;
  email: string;
  full_name: string;
  role: 'astronaut' | 'medical' | 'mission_control' | 'admin';
  callsign?: string;
}

export interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; user?: AuthUser; error?: string }>;
  register: (
    email: string,
    password: string,
    full_name: string,
    role: 'astronaut' | 'medical' | 'mission_control' | 'admin',
    callsign?: string,
    invite_code?: string,
  ) => Promise<{ success: boolean; user?: AuthUser; error?: string }>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<boolean>;
  refreshUser: () => Promise<void>;
}

const VALID_ROLES = ['astronaut', 'medical', 'mission_control', 'admin'] as const;

function normalizeRole(role: unknown): AuthUser['role'] {
  return VALID_ROLES.includes(role as AuthUser['role']) ? (role as AuthUser['role']) : 'astronaut';
}

function toUser(data: any): AuthUser {
  return {
    id: data.id,
    email: data.email,
    full_name: data.full_name,
    role: normalizeRole(data.role),
    callsign: data.callsign,
  };
}

export class AuthService {
  static async login(email: string, password: string): Promise<{ success: boolean; user?: AuthUser; error?: string }> {
    const result = await api.login({ email, password });
    if (!result.success) {
      return { success: false, error: result.error || 'Login failed' };
    }
    if (result.data?.user) {
      // Fetch full profile (including callsign) from /me
      const me = await api.me();
      const user = me.success && me.data?.user ? toUser({ ...result.data.user, ...me.data.user }) : toUser(result.data.user);
      if (me.success && me.data?.astronaut_profile?.callsign) {
        user.callsign = me.data.astronaut_profile.callsign;
      }
      return { success: true, user };
    }
    return { success: false, error: 'Invalid response format' };
  }

  static async register(
    email: string,
    password: string,
    full_name: string,
    role: 'astronaut' | 'medical' | 'mission_control' | 'admin',
    callsign?: string,
    invite_code?: string,
  ): Promise<{ success: boolean; user?: AuthUser; error?: string }> {
    const result = await api.register({
      email,
      password,
      full_name,
      role,
      callsign,
      invite_code,
    });
    if (!result.success) {
      return { success: false, error: result.error || 'Registration failed' };
    }
    if (result.data?.user) {
      const user = toUser(result.data.user);
      // fetch callsign if astronaut
      if (user.role === 'astronaut') {
        const me = await api.me();
        if (me.success && me.data?.astronaut_profile?.callsign) {
          user.callsign = me.data.astronaut_profile.callsign;
        }
      }
      return { success: true, user };
    }
    return { success: false, error: 'Invalid response format' };
  }

  static async logout() {
    await api.logout();
  }

  static async fetchMe(): Promise<{ success: boolean; user?: AuthUser; error?: string }> {
    const result = await api.me();
    if (!result.success) {
      return { success: false, error: result.error || 'Session expired' };
    }
    if (result.data?.user) {
      const user = toUser(result.data.user);
      if (result.data.astronaut_profile?.callsign) {
        user.callsign = result.data.astronaut_profile.callsign;
      }
      return { success: true, user };
    }
    return { success: false, error: 'Invalid response' };
  }

  static async checkAuth(): Promise<boolean> {
    return api.checkAuth();
  }
}
