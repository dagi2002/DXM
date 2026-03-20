import request from 'supertest';

interface SignupOptions {
  name?: string;
  email?: string;
  password?: string;
  workspaceName?: string;
  agencyType?: 'web_agency' | 'growth_agency' | 'studio' | 'freelancer' | 'in_house' | null;
  managedSitesBand?: '1_2' | '3_5' | '6_10' | '11_15' | '16_plus' | null;
  reportingWorkflow?: 'manual_docs' | 'slides' | 'chat_updates' | 'mixed' | 'none_yet' | null;
  evaluationReason?: string | null;
}

export const signupAndAuthenticate = async (app: unknown, overrides: SignupOptions = {}) => {
  const agent = request.agent(app);
  const nonce = `${Date.now()}-${Math.round(Math.random() * 100000)}`;
  const payload = {
    name: overrides.name ?? 'Test User',
    email: overrides.email ?? `test-${nonce}@dxmpulse.local`,
    password: overrides.password ?? 'password1234',
    workspaceName: overrides.workspaceName ?? 'Test Workspace',
    ...(typeof overrides.agencyType !== 'undefined'
      ? { agencyType: overrides.agencyType }
      : {}),
    ...(typeof overrides.managedSitesBand !== 'undefined'
      ? { managedSitesBand: overrides.managedSitesBand }
      : {}),
    ...(typeof overrides.reportingWorkflow !== 'undefined'
      ? { reportingWorkflow: overrides.reportingWorkflow }
      : {}),
    ...(typeof overrides.evaluationReason !== 'undefined'
      ? { evaluationReason: overrides.evaluationReason }
      : {}),
  };

  const response = await agent.post('/auth/signup').send(payload);

  return {
    agent,
    payload,
    response,
    user: response.body?.user,
    workspace: response.body?.workspace,
  };
};
