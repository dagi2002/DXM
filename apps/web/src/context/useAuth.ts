import { createContext, useContext } from 'react';
import type { AgencyType, ManagedSitesBand, ReportingWorkflow } from '../lib/workspaceSignals';

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

export interface AuthContextValue {
  user: WorkspaceUser | null;
  workspace: Workspace | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  signup: (data: {
    name: string;
    email: string;
    password: string;
    workspaceName: string;
    agencyType?: AgencyType | null;
    managedSitesBand?: ManagedSitesBand | null;
    reportingWorkflow?: ReportingWorkflow | null;
    evaluationReason?: string | null;
  }) => Promise<void>;
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
