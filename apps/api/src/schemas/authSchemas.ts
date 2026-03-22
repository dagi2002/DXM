import { z } from 'zod';

export const agencyTypeValues = [
  'web_agency',
  'growth_agency',
  'studio',
  'freelancer',
  'in_house',
] as const;
export const managedSitesBandValues = ['1_2', '3_5', '6_10', '11_15', '16_plus'] as const;
export const reportingWorkflowValues = [
  'manual_docs',
  'slides',
  'chat_updates',
  'mixed',
  'none_yet',
] as const;

export const workspaceFitProfileSchema = z.object({
  agencyType: z.enum(agencyTypeValues).nullable().optional(),
  managedSitesBand: z.enum(managedSitesBandValues).nullable().optional(),
  reportingWorkflow: z.enum(reportingWorkflowValues).nullable().optional(),
  evaluationReason: z.string().trim().max(240).nullable().optional(),
});

export const signupSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(80),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  workspaceName: z.string().min(2, 'Workspace name is required').max(80),
}).merge(workspaceFitProfileSchema);

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
