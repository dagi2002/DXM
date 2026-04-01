import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Play, MonitorPlay } from 'lucide-react';
import { SessionList } from './SessionList';
import { SessionPlayer } from './SessionPlayer';
import { ReplayPlayer } from './ReplayPlayer';
import { UpgradeGate } from '../UpgradeGate';
import { useAuth } from '../../context/AuthContext';
import type { SessionRecording, SessionRecordingDetail } from '../../types';
import { fetchJson } from '../../lib/api';
import { BILLING_FEATURES, workspaceHasFeature } from '../../lib/billing';
import { markJourneyMilestone } from '../../lib/workspaceSignals';

// Toggle between rrweb DOM replay and the event timeline view
const SessionPlayerWithToggle: React.FC<{
  session: SessionRecordingDetail;
  insightContext?: { title: string; severity: 'info' | 'warning' | 'critical' } | null;
}> = ({ session, insightContext }) => {
  const [mode, setMode] = useState<'rrweb' | 'events'>('rrweb');
  return (
    <div className="space-y-3">
      {/* Mode toggle — styled to match the rest of the app */}
      <div className="flex items-center gap-3">
        <div className="flex rounded-2xl border border-surface-200 bg-surface-50 p-1 gap-1">
          <button
            onClick={() => setMode('rrweb')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
              mode === 'rrweb'
                ? 'bg-white text-primary-700 shadow-sm border border-surface-200'
                : 'text-surface-500 hover:text-surface-800'
            }`}
          >
            <MonitorPlay className="h-3.5 w-3.5" />
            DOM Replay
          </button>
          <button
            onClick={() => setMode('events')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
              mode === 'events'
                ? 'bg-white text-primary-700 shadow-sm border border-surface-200'
                : 'text-surface-500 hover:text-surface-800'
            }`}
          >
            <Play className="h-3.5 w-3.5" />
            Event Timeline
          </button>
        </div>
        <span className="text-xs text-surface-400">
          {mode === 'rrweb' ? 'Full page reconstruction via rrweb' : 'Click, scroll & navigation events'}
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
          sessionEvents={session.events}
          insightContext={insightContext}
        />
      ) : (
        <SessionPlayer session={session} />
      )}
    </div>
  );
};

export const SessionReplaysView: React.FC = () => {
  const { t } = useTranslation();
  const { workspace } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [sessions, setSessions] = useState<SessionRecording[]>([]);
  const [selectedSession, setSelectedSession] = useState<SessionRecording | null>(null);
  const [selectedSessionDetail, setSelectedSessionDetail] = useState<SessionRecordingDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const selectedSessionId = selectedSession?.id ?? null;
  const selectedSessionUpdatedAt = selectedSession?.updatedAt ?? null;
  const canReplay = workspaceHasFeature(workspace?.plan || 'free', BILLING_FEATURES.replay);

  // Insight context from URL params (when navigated from InsightsPanel)
  const insightTitle = searchParams.get('insightTitle');
  const insightSeverity = searchParams.get('insightSeverity') as 'info' | 'warning' | 'critical' | null;
  const insightContext = insightTitle && insightSeverity
    ? { title: insightTitle, severity: insightSeverity }
    : null;

  // Deep-link: auto-select session from URL param
  const deepLinkSessionId = searchParams.get('sessionId');

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

        // Auto-select from deep link on first load
        if (deepLinkSessionId && !selectedSession) {
          const match = data.find(s => s.id === deepLinkSessionId);
          if (match) {
            setSelectedSession(match);
            // Clear the param so it doesn't re-trigger
            setSearchParams(prev => {
              const next = new URLSearchParams(prev);
              next.delete('sessionId');
              return next;
            }, { replace: true });
          }
        }

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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!selectedSessionId || !canReplay) {
      return;
    }

    let isMounted = true;
    setIsDetailLoading(true);
    setDetailError(null);

    fetchJson<SessionRecordingDetail>(`/sessions/${selectedSessionId}`)
      .then((detail) => {
        if (!isMounted) return;
        setSelectedSessionDetail(detail);
        void markJourneyMilestone('replay_viewed').catch(() => {});
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
  }, [canReplay, selectedSessionId, selectedSessionUpdatedAt]);

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="rounded-[28px] border border-surface-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-100">
                <MonitorPlay className="h-4 w-4 text-primary-700" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-surface-500">Session Replays</span>
            </div>
            <h1 className="text-2xl font-bold text-surface-900">{t('sessions.title')}</h1>
            <p className="mt-1 text-sm text-surface-500">{t('sessions.subtitle')}</p>
          </div>
          {sessions.length > 0 && (
            <div className="rounded-2xl border border-surface-200 bg-surface-50 px-4 py-2.5 text-center shrink-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-surface-500">Recorded sessions</p>
              <p className="mt-1 text-xl font-bold text-surface-900">{sessions.length}</p>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
          {selectedSession && !canReplay ? (
            <UpgradeGate
              source="replay"
              title="Unlock replay to show clients exactly what happened."
              description="Free workspaces can review the session list, but replay playback lives on the paid DXM bundle where agencies start turning evidence into client-ready explanations."
              bullets={[
                'Keep the session list on Free',
                'Unlock DOM replay, alerts, funnels, and reports together',
              ]}
            />
          ) : selectedSessionDetail && selectedSessionDetail.id === selectedSessionId ? (
            <SessionPlayerWithToggle session={selectedSessionDetail} insightContext={insightContext} />
          ) : selectedSession && isDetailLoading ? (
            <div className="rounded-2xl border border-surface-200 bg-white p-12 flex flex-col items-center justify-center text-center shadow-sm">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary-50">
                <span className="relative flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-400 opacity-75" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-primary-500" />
                </span>
              </div>
              <h3 className="text-base font-semibold text-surface-900 mb-1">Loading session detail</h3>
              <p className="text-sm text-surface-500 max-w-sm">
                Pulling the full event timeline so DOM replay and event playback stay in sync.
              </p>
            </div>
          ) : selectedSession && detailError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-12 flex flex-col items-center justify-center text-center shadow-sm">
              <h3 className="text-base font-semibold text-red-700 mb-1">Session detail unavailable</h3>
              <p className="text-sm text-red-600 max-w-sm">{detailError}</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-surface-200 bg-white p-12 flex flex-col items-center justify-center text-center shadow-sm">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-50">
                <MonitorPlay className="h-7 w-7 text-primary-400" />
              </div>
              <h3 className="text-base font-semibold text-surface-900 mb-1">
                Select a session to replay
              </h3>
              <p className="text-sm text-surface-500 max-w-sm">
                Choose a session from the list to watch exactly how a visitor moved through the site — clicks, scrolls, and page navigation included.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
