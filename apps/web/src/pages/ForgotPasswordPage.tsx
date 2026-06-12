import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Zap } from 'lucide-react';
import { requestPasswordReset } from '../lib/api';

export const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await requestPasswordReset(email);
    } catch {
      // Ignored for security, always show success map
    } finally {
      setIsLoading(false);
      setIsSuccess(true);
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-50 items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <Zap className="h-7 w-7 text-primary-600" />
          <span className="text-xl font-bold text-gray-900">DXM Pulse</span>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">Reset your password</h1>
        <p className="text-gray-500 mb-8 text-center">
          Enter your email and we'll send you a reset link.
        </p>

        {isSuccess ? (
          <div className="text-center">
            <div className="mb-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              If an account with that email exists, we have sent a password reset link. Please check your inbox.
            </div>
            <Link
              to="/login"
              className="inline-block bg-primary-600 text-white rounded-lg px-6 py-2.5 text-sm font-semibold transition hover:bg-primary-700"
            >
              Return to login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                placeholder="you@yourcompany.com"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg bg-primary-600 py-3 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed mt-2"
            >
              {isLoading ? 'Sending link…' : 'Send reset link'}
            </button>
            <div className="mt-4 text-center">
              <Link to="/login" className="text-sm font-medium text-gray-500 hover:text-gray-700 hover:underline">
                Back to login
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
