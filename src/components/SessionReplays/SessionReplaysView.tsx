import React, { useEffect, useMemo, useState } from 'react';
import { SessionList } from './SessionList';
import { SessionPlayer } from './SessionPlayer';
import type { SessionRecording } from '../../types';

const DEFAULT_API_BASE = 'http://localhost:4000';

export const SessionReplaysView: React.FC = () => {
const [selectedSession, setSelectedSession] = useState<SessionRecording | null>(null);
  const [sessions, setSessions] = useState<SessionRecording[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const apiBaseUrl = useMemo(() => {
    const configured = import.meta.env.VITE_API_URL as string | undefined;
    return configured && configured.trim().length > 0 ? configured : DEFAULT_API_BASE;
  }, []);

  useEffect(() => {
    let isMounted = true;
    let refreshTimer: number | undefined;

    const fetchSessions = async () => {
      try {
        const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/sessions`);
        if (!response.ok) {
          throw new Error('Unable to load session recordings');
        }

        const data = await response.json() as SessionRecording[];
        if (!isMounted) return;

        setSessions(data);
        setIsLoading(false);
        setError(null);
        setSelectedSession(prev => (prev ? data.find(session => session.id === prev.id) ?? null : null));
      } catch (err) {
        if (!isMounted) return;
        console.error('Failed to fetch sessions', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        setIsLoading(false);
      }
    };

    fetchSessions();
    refreshTimer = window.setInterval(fetchSessions, 5000);

    return () => {
      isMounted = false;
      if (refreshTimer) {
        window.clearInterval(refreshTimer);
      }
    };
  }, [apiBaseUrl]);
  return (
    <div className="p-6 h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Session Replays</h1>
          <p className="text-gray-600">Watch real user sessions to understand behavior patterns</p>
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
          {selectedSession ? (
            <SessionPlayer session={selectedSession} />
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