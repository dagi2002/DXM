import React from 'react';
import { Link } from 'react-router-dom';

export const NotFoundPage: React.FC = () => (
  <div className="flex h-full items-center justify-center">
    <div className="mx-4 max-w-md text-center">
      <p className="text-6xl font-bold text-gray-300">404</p>
      <h1 className="mt-4 text-xl font-semibold text-gray-900">Page not found</h1>
      <p className="mt-2 text-sm text-gray-600">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link
        to="/dashboard"
        className="mt-6 inline-block rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 transition-colors"
      >
        Go to Dashboard
      </Link>
    </div>
  </div>
);
