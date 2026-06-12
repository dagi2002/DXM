/**
 * localStorage-backed message history for Ask Pulse.
 *
 * Key:  dxm:ask:history:<workspaceId>
 * Cap:  20 turns (a turn = user Q + assistant A pair).
 *
 * Deliberately workspace-scoped so switching workspaces shows a clean slate.
 * No cross-tab sync (the chat is personal and ephemeral — re-sending a
 * message on another tab refreshes anyway).
 */
import { useCallback, useEffect, useState } from 'react';
import type { AskPulseCitation } from './types';

export interface AskPulseTurn {
  id: string;
  question: string;
  answer: string;
  citations: AskPulseCitation[];
  mode: 'ai' | 'fallback';
  createdAt: number;
}

const MAX_TURNS = 20;

const storageKey = (workspaceId: string | null) =>
  workspaceId ? `dxm:ask:history:${workspaceId}` : null;

const readHistory = (workspaceId: string | null): AskPulseTurn[] => {
  const key = storageKey(workspaceId);
  if (!key) return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, MAX_TURNS).filter(
      (t): t is AskPulseTurn =>
        typeof t === 'object' &&
        t !== null &&
        typeof (t as AskPulseTurn).question === 'string' &&
        typeof (t as AskPulseTurn).answer === 'string',
    );
  } catch {
    return [];
  }
};

const writeHistory = (workspaceId: string | null, turns: AskPulseTurn[]) => {
  const key = storageKey(workspaceId);
  if (!key) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(turns.slice(0, MAX_TURNS)));
  } catch {
    /* quota or privacy mode — history becomes ephemeral, no-op. */
  }
};

export const useAskPulseHistory = (workspaceId: string | null) => {
  const [turns, setTurns] = useState<AskPulseTurn[]>(() => readHistory(workspaceId));

  // Reload on workspace switch so history belongs to the active workspace.
  useEffect(() => {
    setTurns(readHistory(workspaceId));
  }, [workspaceId]);

  const appendTurn = useCallback(
    (turn: AskPulseTurn) => {
      setTurns((prev) => {
        const next = [turn, ...prev].slice(0, MAX_TURNS);
        writeHistory(workspaceId, next);
        return next;
      });
    },
    [workspaceId],
  );

  const clear = useCallback(() => {
    setTurns([]);
    writeHistory(workspaceId, []);
  }, [workspaceId]);

  return { turns, appendTurn, clear };
};
