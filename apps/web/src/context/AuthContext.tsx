import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { getApiUrl } from '../lib/api';

export interface WorkspaceUser {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'viewer';
  avatar?: string;
}

export interface Workspace {
  id: string;
  name: string;
  plan: 'free' | 'starter' | 'pro';
  billingStatus: 'active' | 'past_due' | 'cancelled';
}

interface AuthContextValue {
  user: WorkspaceUser | null;
  workspace: Workspace | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  signup: (data: { name: string; email: string; password: string; workspaceName: string }) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<WorkspaceUser | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const authStateVersionRef = useRef(0);

  const refreshUser = useCallback(async () => {
    const requestVersion = authStateVersionRef.current;
    try {
      const res = await fetch(getApiUrl('/auth/me'), { credentials: 'include' });
      if (requestVersion === authStateVersionRef.current && res.ok) {
        const data = await res.json();
        setUser(data.user);
        setWorkspace(data.workspace);
      } else if (requestVersion === authStateVersionRef.current) {
        setUser(null);
        setWorkspace(null);
      }
    } catch {
      if (requestVersion === authStateVersionRef.current) {
        setUser(null);
        setWorkspace(null);
      }
    } finally {
      if (requestVersion === authStateVersionRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => { refreshUser(); }, [refreshUser]);

  const login = useCallback(async (email: string, password: string) => {
    const requestVersion = ++authStateVersionRef.current;
    const res = await fetch(getApiUrl('/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Login failed' }));
      setIsLoading(false);
      throw new Error(err.message || 'Invalid credentials');
    }
    const data = await res.json();
    if (requestVersion !== authStateVersionRef.current) return;
    setUser(data.user);
    setWorkspace(data.workspace);
    setIsLoading(false);
  }, []);

  const logout = useCallback(async () => {
    const requestVersion = ++authStateVersionRef.current;
    await fetch(getApiUrl('/auth/logout'), { method: 'POST', credentials: 'include' });
    if (requestVersion !== authStateVersionRef.current) return;
    setUser(null);
    setWorkspace(null);
    setIsLoading(false);
  }, []);

  const signup = useCallback(async (data: {
    name: string; email: string; password: string; workspaceName: string;
  }) => {
    const requestVersion = ++authStateVersionRef.current;
    const res = await fetch(getApiUrl('/auth/signup'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Signup failed' }));
      setIsLoading(false);
      throw new Error(err.message || 'Signup failed');
    }
    const resp = await res.json();
    if (requestVersion !== authStateVersionRef.current) return;
    setUser(resp.user);
    setWorkspace(resp.workspace);
    setIsLoading(false);
  }, []);

  return (
    <AuthContext.Provider value={{
      user, workspace, isLoading,
      isAuthenticated: !!user,
      login, logout, signup, refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
