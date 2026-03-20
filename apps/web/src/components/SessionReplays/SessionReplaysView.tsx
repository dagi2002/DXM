import React, { useEffect, useState } from 'react';
import { SessionList } from './SessionList';
import { SessionPlayer } from './SessionPlayer';
import { ReplayPlayer } from './ReplayPlayer';
import type { SessionRecording, SessionRecordingDetail } from '../../types';
import { fetchJson } from '../../lib/api';

// Toggle between rrweb DOM replay and the legacy event-dot view
const SessionPlayerWithToggle: React.FC<{ session: SessionRecordingDetail }> = ({ session }) => {
  const [mode, setMode] = useState<'rrweb' | 'events'>('rrweb');
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          <button
            onClick={() => setMode('rrweb')}
            className={`px-4 py-1.5 font-medium transition-colors ${
              mode === 'rrweb' ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            DOM Replay
          </button>
          <button
            onClick={() => setMode('events')}
            className={`px-4 py-1.5 font-medium transition-colors ${
              mode === 'events' ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            Event Timeline
          </button>
        </div>
        <span className="text-xs text-gray-400">
          {mode === 'rrweb' ? 'Full DOM replay via rrweb' : 'Click & scroll event overlay'}
        </span>
      </div>
      {mode === 'rrweb' ? (
        <ReplayPlayer
          sessionId={session.id}
          sessionMeta={{
            url: session.metadata.url ?? '',
            device: session.metadata.device ?? 'desktop',
            browser: session.metadata.browser ?? '',
            startedAt: session.startedAt,
          }}
        />
      ) : (
        <SessionPlayer session={session} />
      )}
    </div>
  );
};

export const SessionReplaysView: React.FC = () => {
  const [sessions, setSessions] = useState<SessionRecording[]>([]);
  const [selectedSession, setSelectedSession] = useState<SessionRecording | null>(null);
  const [selectedSessionDetail, setSelectedSessionDetail] = useState<SessionRecordingDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const selectedSessionId = selectedSession?.id ?? null;
  const selectedSessionUpdatedAt = selectedSession?.updatedAt ?? null;

  useEffect(() => {
    let isMounted = true;
    let refreshTimer: number | undefined;

    const fetchSessions = async () => {
      try {
        const data = await fetchJson<SessionRecording[]>('/sessions');
        if (!isMounted) return;

        setSessions(data);
        setIsLoading(false);
        setError(null);

        // Preserve selection after refresh
        setSelectedSession(prev =>
          prev ? data.find(session => session.id === prev.id) ?? null : null
        );
      } catch (err) {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : 'Unknown error');
        setIsLoading(false);
      }
    };

    fetchSessions();
    refreshTimer = window.setInterval(fetchSessions, 5000);

    return () => {
      isMounted = false;
      if (refreshTimer) window.clearInterval(refreshTimer);
    };
  }, []);

  useEffect(() => {
    if (!selectedSessionId) {
      setSelectedSessionDetail(null);
      setDetailError(null);
      setIsDetailLoading(false);
      return;
    }

    setSelectedSessionDetail(null);
    setDetailError(null);
  }, [selectedSessionId]);

  useEffect(() => {
    if (!selectedSessionId) {
      return;
    }

    let isMounted = true;
    setIsDetailLoading(true);
    setDetailError(null);

    fetchJson<SessionRecordingDetail>(`/sessions/${selectedSessionId}`)
      .then((detail) => {
        if (!isMounted) return;
        setSelectedSessionDetail(detail);
      })
      .catch((err) => {
        if (!isMounted) return;
        setDetailError(err instanceof Error ? err.message : 'Failed to load session detail');
      })
      .finally(() => {
        if (isMounted) {
          setIsDetailLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedSessionId, selectedSessionUpdatedAt]);

  return (
    <div className="p-6 h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Session Replays</h1>
          <p className="text-gray-600">Use replay to explain what happened on client sites, not just what the metrics say.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
        <div className="lg:col-span-1">
          <SessionList
            sessions={sessions}
            selectedSession={selectedSession}
            onSessionSelect={setSelectedSession}
            isLoading={isLoading}
            error={error}
          />
        </div>

        <div className="lg:col-span-2">
          {selectedSessionDetail && selectedSessionDetail.id === selectedSessionId ? (
            <SessionPlayerWithToggle session={selectedSessionDetail} />
          ) : selectedSession && isDetailLoading ? (
            <div className="bg-white rounded-lg border border-gray-200 p-12 flex flex-col items-center justify-center text-center">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Loading session detail</h3>
              <p className="text-gray-600 max-w-md">
                Pulling the full event timeline for this session so replay and event playback stay in sync.
              </p>
            </div>
          ) : selectedSession && detailError ? (
            <div className="bg-white rounded-lg border border-red-200 p-12 flex flex-col items-center justify-center text-center">
              <h3 className="text-lg font-semibold text-red-700 mb-2">Session detail unavailable</h3>
              <p className="text-red-600 max-w-md">{detailError}</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 p-12 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <span className="text-2xl">🎬</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Select a session to replay
              </h3>
              <p className="text-gray-600 max-w-md">
                Choose a session from the list to watch how users interacted with your website.
                See their clicks, scrolls, and journey through your pages.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
