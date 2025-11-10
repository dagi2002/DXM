import React, { useState } from 'react';
import { SessionList } from './SessionList';
import { SessionPlayer } from './SessionPlayer';
import { Session } from '../../types';

export const SessionReplaysView: React.FC = () => {
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);

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
            selectedSession={selectedSession}
            onSessionSelect={setSelectedSession}
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