import { createHash } from 'node:crypto';
import { randomBase62 } from '@pulse/db';

/** 32 base62 characters ≈ 190 bits: unguessable, so a fast hash is enough to store it. */
export const SHARE_TOKEN_LENGTH = 32;

export const newShareToken = () => randomBase62(SHARE_TOKEN_LENGTH);

/** Only this goes in the database; the token itself is shown once and never stored. */
export const hashShareToken = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex');
