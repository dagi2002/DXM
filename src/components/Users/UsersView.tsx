import React, { useState } from 'react';
import { Search, Filter, MoreVertical, UserPlus, Download } from 'lucide-react';
import { mockSessions } from '../../data/mockData';

export const UsersView: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  
  // Create unique users from sessions
  const uniqueUsers = mockSessions.reduce((acc, session) => {
    if (session.userId && !acc.some(u => u.id === session.userId)) {
      const userSessions = mockSessions.filter(s => s.userId === session.userId);
      acc.push({
        id: session.userId,
        firstSeen: new Date(Math.min(...userSessions.map(s => s.startTime.getTime()))),
        lastSeen: new Date(Math.max(...userSessions.map(s => s.startTime.getTime()))),
        sessionsCount: userSessions.length,
        totalDuration: userSessions.reduce((sum, s) => sum + s.duration, 0),
        device: session.device,
        country: session.country,
        browser: session.browser,
        converted: userSessions.some(s => s.converted),
        avgSessionDuration: Math.round(userSessions.reduce((sum, s) => sum + s.duration, 0) / userSessions.length)
      });
    }
    return acc;
  }, [] as any[]);

  const filteredUsers = uniqueUsers.filter(user =>
    user.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.country.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-gray-600">Manage and analyze user behavior patterns</p>
        </div>
        
        <div className="flex items-center space-x-3">
          <button className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            <UserPlus className="h-4 w-4" />
            <span>Add User</span>
          </button>
          <button className="flex items-center space-x-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <Download className="h-4 w-4" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
        <div className="flex items-center space-x-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          <button className="flex items-center space-x-2 px-4 py-2 text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <Filter className="h-4 w-4" />
            <span>Filters</span>
          </button>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left py-3 px-6 text-sm font-medium text-gray-900">User</th>
              <th className="text-left py-3 px-6 text-sm font-medium text-gray-900">Location</th>
              <th className="text-left py-3 px-6 text-sm font-medium text-gray-900">Sessions</th>
              <th className="text-left py-3 px-6 text-sm font-medium text-gray-900">Avg. Duration</th>
              <th className="text-left py-3 px-6 text-sm font-medium text-gray-900">Last Seen</th>
              <th className="text-left py-3 px-6 text-sm font-medium text-gray-900">Status</th>
              <th className="text-left py-3 px-6 text-sm font-medium text-gray-900"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredUsers.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                <td className="py-4 px-6">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
                      {user.id.slice(-2).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">User {user.id.slice(-6)}</div>
                      <div className="text-sm text-gray-600">{user.device}</div>
                    </div>
                  </div>
                </td>
                <td className="py-4 px-6 text-sm text-gray-900">{user.country}</td>
                <td className="py-4 px-6 text-sm text-gray-900">{user.sessionsCount}</td>
                <td className="py-4 px-6 text-sm text-gray-900">{formatDuration(user.avgSessionDuration)}</td>
                <td className="py-4 px-6 text-sm text-gray-600">
                  {user.lastSeen.toLocaleDateString()}
                </td>
                <td className="py-4 px-6">
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                    user.converted 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {user.converted ? 'Converted' : 'Visitor'}
                  </span>
                </td>
                <td className="py-4 px-6">
                  <button className="text-gray-400 hover:text-gray-600 transition-colors">
                    <MoreVertical className="h-5 w-5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-6">
        <div className="text-sm text-gray-600">
          Showing 1-{filteredUsers.length} of {filteredUsers.length} users
        </div>
        <div className="flex items-center space-x-2">
          <button className="px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            Previous
          </button>
          <button className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            1
          </button>
          <button className="px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            Next
          </button>
        </div>
      </div>
    </div>
  );
};