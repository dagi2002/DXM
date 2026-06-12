import request from 'supertest';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import type Database from 'better-sqlite3';

interface CreateWorkspaceUserOptions {
  workspaceId: string;
  role: 'owner' | 'admin' | 'viewer';
  email?: string;
  password?: string;
  name?: string;
}

/**
 * Inserts a user with an arbitrary role directly into the DB (signup always
 * creates owners) and logs them in, returning an authenticated agent.
 */
export const createWorkspaceUser = async (
  app: unknown,
  db: Database.Database,
  options: CreateWorkspaceUserOptions,
) => {
  const nonce = randomBytes(6).toString('hex');
  const email = options.email ?? `member-${nonce}@dxmpulse.local`;
  const password = options.password ?? 'password1234';
  const name = options.name ?? `Member ${nonce}`;
  const id = `usr_${randomBytes(8).toString('hex')}`;

  db.prepare(
    `INSERT INTO users (id, workspace_id, name, email, password_hash, role)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, options.workspaceId, name, email, bcrypt.hashSync(password, 10), options.role);

  const agent = request.agent(app);
  const login = await agent.post('/auth/login').send({ email, password });
  if (login.status !== 200) {
    throw new Error(`Login failed for seeded ${options.role}: ${login.status} ${JSON.stringify(login.body)}`);
  }

  return { agent, userId: id, email, password };
};
