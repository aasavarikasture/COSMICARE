import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { api } from '../api/client';
import { AuthService, type AuthUser, type AuthContextType } from './service';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const restoredRef = useRef(false);

  const refreshUser = useCallback(async () => {
    const result = await AuthService.fetchMe();
    if (result.success && result.user) {
      setUser(result.user);
    } else {
      setUser(null);
    }
  }, []);

  // Restore session on mount (once)
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    (async () => {
      const token = api.getToken();
      if (!token) {
        setIsLoading(false);
        return;
      }
      const result = await AuthService.fetchMe();
      if (result.success && result.user) {
        setUser(result.user);
        try {
          localStorage.setItem('cosmcare_user', JSON.stringify(result.user));
        } catch {
          // ignore
        }
      } else {
        // invalid/expired token
        await AuthService.logout();
        setUser(null);
      }
      setIsLoading(false);
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    const result = await AuthService.login(email, password);
    setIsLoading(false);
    if (result.success && result.user) {
      setUser(result.user);
      try {
        localStorage.setItem('cosmcare_user', JSON.stringify(result.user));
      } catch {
        // ignore
      }
      return { success: true as const, user: result.user };
    }
    return { success: false as const, error: result.error || 'Login failed' };
  }, []);

  const register = useCallback(async (
    email: string,
    password: string,
    full_name: string,
    role: 'astronaut' | 'medical' | 'mission_control' | 'admin',
    callsign?: string,
    invite_code?: string,
  ) => {
    setIsLoading(true);
    const result = await AuthService.register(email, password, full_name, role, callsign, invite_code);
    setIsLoading(false);
    if (result.success && result.user) {
      setUser(result.user);
      try {
        localStorage.setItem('cosmcare_user', JSON.stringify(result.user));
      } catch {
        // ignore
      }
      return { success: true as const, user: result.user };
    }
    return { success: false as const, error: result.error || 'Registration failed' };
  }, []);

  const logout = useCallback(async () => {
    await AuthService.logout();
    setUser(null);
    try {
      localStorage.removeItem('cosmcare_user');
    } catch {
      // ignore
    }
  }, []);

  const checkAuth = useCallback(async () => {
    const ok = await AuthService.checkAuth();
    if (!ok) {
      setUser(null);
    }
    return ok;
  }, []);

  const value: AuthContextType = {
    user,
    isLoading,
    login,
    register,
    logout,
    checkAuth,
    refreshUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
