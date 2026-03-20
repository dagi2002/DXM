import request from 'supertest';

interface SignupOptions {
  name?: string;
  email?: string;
  password?: string;
  workspaceName?: string;
}

export const signupAndAuthenticate = async (app: unknown, overrides: SignupOptions = {}) => {
  const agent = request.agent(app);
  const nonce = `${Date.now()}-${Math.round(Math.random() * 100000)}`;
  const payload = {
    name: overrides.name ?? 'Test User',
    email: overrides.email ?? `test-${nonce}@dxmpulse.local`,
    password: overrides.password ?? 'password1234',
    workspaceName: overrides.workspaceName ?? 'Test Workspace',
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
