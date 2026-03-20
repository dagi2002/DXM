import { createHash, randomUUID } from 'crypto';
import { db } from '../../db/index.js';

export type AiArtifactStatus = 'ready' | 'error' | 'building';

interface AiArtifactRow {
  id: string;
  workspace_id: string;
  site_id: string | null;
  entity_type: string;
  entity_id: string;
  artifact_kind: string;
  period_key: string;
  status: AiArtifactStatus;
  generator_type: 'deterministic' | 'llm';
  input_hash: string;
  evidence_json: string;
  output_json: string;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
}

interface AiArtifactScope {
  workspaceId: string;
  siteId?: string | null;
  entityType: string;
  entityId: string;
  artifactKind: string;
  periodKey: string;
}

interface AiArtifactRecord<TOutput, TEvidence> extends AiArtifactScope {
  id: string;
  status: AiArtifactStatus;
  generatorType: 'deterministic' | 'llm';
  inputHash: string;
  evidence: TEvidence;
  output: TOutput;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

const stableSerialize = (value: unknown): string => {
  if (typeof value === 'undefined') return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableSerialize(item)).join(',')}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => typeof entryValue !== 'undefined')
    .sort(([left], [right]) => left.localeCompare(right));

  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableSerialize(entryValue)}`)
    .join(',')}}`;
};

export const hashAiInput = (value: unknown) =>
  createHash('sha256').update(stableSerialize(value)).digest('hex');

export const addHours = (date: Date, hours: number) => new Date(date.getTime() + hours * 60 * 60 * 1000);

export const isArtifactFresh = (expiresAt: string, now = new Date()) => {
  const expiryTime = new Date(expiresAt).getTime();
  return !Number.isNaN(expiryTime) && expiryTime > now.getTime();
};

export const getAiArtifact = <TOutput, TEvidence>(
  scope: AiArtifactScope,
): AiArtifactRecord<TOutput, TEvidence> | null => {
  const row = db
    .prepare<
      [string, string, string, string, string],
      AiArtifactRow
    >(
      `
        SELECT
          id,
          workspace_id,
          site_id,
          entity_type,
          entity_id,
          artifact_kind,
          period_key,
          status,
          generator_type,
          input_hash,
          evidence_json,
          output_json,
          last_error,
          created_at,
          updated_at,
          expires_at
        FROM ai_artifacts
        WHERE workspace_id = ?
          AND entity_type = ?
          AND entity_id = ?
          AND artifact_kind = ?
          AND period_key = ?
      `,
    )
    .get(scope.workspaceId, scope.entityType, scope.entityId, scope.artifactKind, scope.periodKey);

  if (!row) return null;

  try {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      siteId: row.site_id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      artifactKind: row.artifact_kind,
      periodKey: row.period_key,
      status: row.status,
      generatorType: row.generator_type,
      inputHash: row.input_hash,
      evidence: JSON.parse(row.evidence_json) as TEvidence,
      output: JSON.parse(row.output_json) as TOutput,
      lastError: row.last_error,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      expiresAt: row.expires_at,
    };
  } catch {
    return null;
  }
};

export const upsertAiArtifact = <TOutput, TEvidence>(
  scope: AiArtifactScope & {
    status: AiArtifactStatus;
    generatorType: 'deterministic' | 'llm';
    inputHash: string;
    evidence: TEvidence;
    output: TOutput;
    lastError?: string | null;
    now?: Date;
    expiresAt: string;
  },
) => {
  const timestamp = (scope.now ?? new Date()).toISOString();

  db.prepare(
    `
      INSERT INTO ai_artifacts (
        id,
        workspace_id,
        site_id,
        entity_type,
        entity_id,
        artifact_kind,
        period_key,
        status,
        generator_type,
        input_hash,
        evidence_json,
        output_json,
        last_error,
        created_at,
        updated_at,
        expires_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id, entity_type, entity_id, artifact_kind, period_key)
      DO UPDATE SET
        site_id = excluded.site_id,
        status = excluded.status,
        generator_type = excluded.generator_type,
        input_hash = excluded.input_hash,
        evidence_json = excluded.evidence_json,
        output_json = excluded.output_json,
        last_error = excluded.last_error,
        updated_at = excluded.updated_at,
        expires_at = excluded.expires_at
    `,
  ).run(
    randomUUID(),
    scope.workspaceId,
    scope.siteId ?? null,
    scope.entityType,
    scope.entityId,
    scope.artifactKind,
    scope.periodKey,
    scope.status,
    scope.generatorType,
    scope.inputHash,
    JSON.stringify(scope.evidence),
    JSON.stringify(scope.output),
    scope.lastError ?? null,
    timestamp,
    timestamp,
    scope.expiresAt,
  );
};
