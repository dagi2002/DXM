import 'express';

declare global {
  namespace Express {
    interface Request {
      id?: string;
      user?: {
        id: string;
        email: string;
        name: string;
        role: 'owner' | 'admin' | 'viewer';
        workspaceId: string;
      };
      apiKey?: {
        id: string;
        workspaceId: string;
      };
    }
  }
}
