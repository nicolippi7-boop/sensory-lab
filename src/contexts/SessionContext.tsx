/**
 * ============================================================================
 * Session Context Provider - React-level session management
 * ============================================================================
 * 
 * This context manages authentication state throughout the application.
 * CRITICAL FOR DATA ISOLATION:
 * - Provides user ID to all child components via context
 * - Ensures all data fetches include user ID in queries
 * - Prevents access to protected routes without authentication
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { AuthUser, Session, SessionContextType } from '../types';
import {
  registerUser,
  loginUser,
  logoutUser,
  getCurrentUser,
  getCurrentSession,
  validateSession,
  refreshAuthSession
} from '../services/authService';

// Create context with undefined default
const SessionContext = createContext<SessionContextType | undefined>(undefined);

interface SessionProviderProps {
  children: React.ReactNode;
}

/**
 * SessionProvider component - Wraps entire app
 * CRITICAL: Must be at root level to provide session to all components
 */
export const SessionProvider: React.FC<SessionProviderProps> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize session on app load
  useEffect(() => {
    const initializeSession = async () => {
      try {
        setLoading(true);
        
        // CRITICAL: Get stored session first (fast path)
        const storedSession = getCurrentSession();
        setSession(storedSession);

        if (storedSession) {
          // Validate session is still valid on server
          const currentUser = await getCurrentUser();
          if (currentUser) {
            setUser(currentUser);
          } else {
            // Session invalid, try to refresh
            const refreshed = await refreshAuthSession();
            if (refreshed) {
              const refreshedUser = await getCurrentUser();
              if (refreshedUser) {
                setUser(refreshedUser);
                setSession(refreshed);
              } else {
                // Refresh failed, clear session
                setUser(null);
                setSession(null);
              }
            } else {
              // Cannot refresh, clear session
              setUser(null);
              setSession(null);
            }
          }
        }
      } catch (err) {
        console.error('Session initialization error:', err);
        setError('Failed to initialize session');
      } finally {
        setLoading(false);
      }
    };

    initializeSession();
  }, []);

  // Register handler
  const handleRegister = useCallback(async (email: string, password: string) => {
    try {
      setError(null);
      setLoading(true);

      // Register and get session
      const newSession = await registerUser(email, password);
      setSession(newSession);

      // Fetch user details
      const currentUser = await getCurrentUser();
      if (currentUser) {
        setUser(currentUser);
      }
    } catch (err: any) {
      const errorMessage = err.message || 'Registration failed';
      setError(errorMessage);
      console.error('Registration error:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Login handler
  const handleLogin = useCallback(async (email: string, password: string) => {
    try {
      setError(null);
      setLoading(true);

      // Login and get session
      const newSession = await loginUser(email, password);
      setSession(newSession);

      // Fetch user details
      const currentUser = await getCurrentUser();
      if (currentUser) {
        setUser(currentUser);
      }
    } catch (err: any) {
      const errorMessage = err.message || 'Login failed';
      setError(errorMessage);
      console.error('Login error:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Logout handler
  const handleLogout = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);

      // Sign out from Supabase
      await logoutUser();

      // Clear local state
      setUser(null);
      setSession(null);
    } catch (err: any) {
      const errorMessage = err.message || 'Logout failed';
      setError(errorMessage);
      console.error('Logout error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Check if authenticated
  const isAuthenticated = useCallback((): boolean => {
    return validateSession() && user !== null;
  }, [user]);

  const value: SessionContextType = {
    user,
    session,
    loading,
    error,
    login: handleLogin,
    register: handleRegister,
    logout: handleLogout,
    isAuthenticated
  };

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
};

/**
 * Hook to access session context
 * CRITICAL: Must be called from component inside SessionProvider
 */
export const useSession = (): SessionContextType => {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used inside SessionProvider');
  }
  return context;
};

/**
 * Hook to get current user
 */
export const useUser = (): AuthUser | null => {
  const { user } = useSession();
  return user;
};

/**
 * Hook to get current user ID
 * CRITICAL: This ID must be included in all data queries for isolation
 */
export const useUserId = (): string | null => {
  const { user, session } = useSession();
  return user?.id || session?.userId || null;
};

/**
 * Hook to check if user is authenticated
 */
export const useIsAuthenticated = (): boolean => {
  const { isAuthenticated } = useSession();
  return isAuthenticated();
};
