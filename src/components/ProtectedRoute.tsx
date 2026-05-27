/**
 * ============================================================================
 * Protected Route Component - Authentication enforcement
 * ============================================================================
 * 
 * CRITICAL FOR DATA ISOLATION:
 * - Prevents unauthorized access to protected routes
 * - Validates session before rendering children
 * - Redirects unauthenticated users back to login
 */

import React from 'react';
import { useSession } from '../contexts/SessionContext';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  fallback 
}) => {
  const { user, loading, isAuthenticated } = useSession();

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={40} className="animate-spin text-indigo-600" />
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Not authenticated
  if (!isAuthenticated() || !user) {
    return (
      <>
        {fallback || (
          <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <div className="text-center">
              <p className="text-slate-600 mb-4">Please log in to access this page</p>
            </div>
          </div>
        )}
      </>
    );
  }

  // Authenticated - render children
  return <>{children}</>;
};

export default ProtectedRoute;
