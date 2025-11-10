import { useState, useEffect } from 'react';
import { mockSessions, mockMetrics } from '../data/mockData';
import { Session, Metric } from '../types';

export const useRealTimeData = () => {
  const [sessions, setSessions] = useState<Session[]>(mockSessions);
  const [metrics, setMetrics] = useState<Metric[]>(mockMetrics);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      // Simulate real-time updates
      setMetrics(prev => prev.map(metric => ({
        ...metric,
        value: metric.name === 'Active Sessions' 
          ? Math.floor(Math.random() * 200) + 1200
          : metric.value,
        change: metric.name === 'Active Sessions'
          ? (Math.random() - 0.5) * 20
          : metric.change
      })));
      
      setLastUpdate(new Date());
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return { sessions, metrics, lastUpdate };
};