/**
 * ============================================================================
 * Authentication Service - Core Session Management
 * ============================================================================
 * 
 * This service handles all authentication operations and session management.
 * CRITICAL FOR DATA ISOLATION:
 * - All Supabase calls include user context validation
 * - Session tokens are securely stored and validated
 * - User ID is extracted from authenticated session and used for all data queries
 */

import { createClient } from '@supabase/supabase-js';
import type { Session, AuthUser } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('ERROR: Supabase environment variables are missing!');
}

// ============================================================================
// Supabase Client - Foundation for secure, user-scoped queries
// ============================================================================
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ============================================================================
// Session Storage - Secure token management
// ============================================================================
const SESSION_STORAGE_KEY = 'sensory_auth_session';
const TOKEN_EXPIRY_BUFFER = 5 * 60 * 1000; // 5 minutes before actual expiry

/**
 * Store session securely in localStorage
 * SECURITY NOTE: In production, use httpOnly cookies instead of localStorage
 */
export const storeSession = (session: Session): void => {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
};

/**
 * Retrieve stored session from localStorage
 * CRITICAL: Validate token expiry before using
 */
export const getStoredSession = (): Session | null => {
  const stored = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!stored) return null;

  const session: Session = JSON.parse(stored);

  // CRITICAL: Validate token has not expired
  // This prevents using stale tokens that may have been revoked
  if (Date.now() > session.expiresAt) {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }

  return session;
};

/**
 * Clear session from storage - called on logout
 */
export const clearStoredSession = (): void => {
  localStorage.removeItem(SESSION_STORAGE_KEY);
};

// ============================================================================
// Authentication Functions - User registration and login
// ============================================================================

/**
 * Register a new user with Supabase Auth
 * CRITICAL DATA ISOLATION:
 * - Each user gets a unique ID from Supabase
 * - This ID is used to partition all subsequent data
 */
export const registerUser = async (email: string, password: string): Promise<Session> => {
  try {
    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password
    });

    if (authError) throw authError;
    if (!authData.user) throw new Error('Registration failed: No user created');

    // Extract session information from Supabase response
    const { user, session } = authData;
    
    if (!session) {
      throw new Error('No session returned from registration. Please verify your email.');
    }

    const userSession: Session = {
      userId: user.id,  // CRITICAL: Unique user ID from Supabase Auth
      email: user.email || email,
      token: session.access_token,
      expiresAt: Date.now() + (session.expires_in * 1000) - TOKEN_EXPIRY_BUFFER
    };

    // Store session securely
    storeSession(userSession);

    return userSession;
  } catch (error) {
    console.error('Registration error:', error);
    throw error;
  }
};

/**
 * Login user with email and password
 * CRITICAL DATA ISOLATION:
 * - Validates credentials against Supabase Auth
 * - Returns secure session with user ID for all subsequent queries
 */
export const loginUser = async (email: string, password: string): Promise<Session> => {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;
    if (!data.user || !data.session) {
      throw new Error('Login failed: Invalid response from server');
    }

    const userSession: Session = {
      userId: data.user.id,  // CRITICAL: Unique user ID from Supabase Auth
      email: data.user.email || email,
      token: data.session.access_token,
      expiresAt: Date.now() + (data.session.expires_in * 1000) - TOKEN_EXPIRY_BUFFER
    };

    // Store session securely
    storeSession(userSession);

    return userSession;
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
};

/**
 * Logout user
 * CRITICAL: Revoke session on server and clear local storage
 * This prevents token reuse and ensures clean session termination
 */
export const logoutUser = async (): Promise<void> => {
  try {
    // Sign out from Supabase (invalidates token on server)
    const { error } = await supabase.auth.signOut();
    if (error) console.warn('Server logout error:', error);
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    // Always clear local session, even if server call fails
    clearStoredSession();
  }
};

/**
 * Get current authenticated user
 * CRITICAL: Validates session is still valid
 * Returns user object with ID that must be used for all data queries
 */
export const getCurrentUser = async (): Promise<AuthUser | null> => {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    if (!user) return null;

    return {
      id: user.id,
      email: user.email || '',
      created_at: user.created_at || new Date().toISOString(),
      last_sign_in_at: user.last_sign_in_at
    };
  } catch (error) {
    console.error('Error getting user:', error);
    return null;
  }
};

/**
 * Get current session
 * CRITICAL: Returns session with user ID needed for data isolation
 */
export const getCurrentSession = (): Session | null => {
  return getStoredSession();
};

/**
 * Validate session is active and not expired
 * CRITICAL: Used by middleware to enforce authentication
 */
export const validateSession = (): boolean => {
  const session = getStoredSession();
  return session !== null;
};

/**
 * Get current user ID for data queries
 * CRITICAL: This ID MUST be included in all database queries
 * to enforce user-scoped data isolation
 */
export const getUserId = (): string | null => {
  const session = getStoredSession();
  return session?.userId || null;
};

/**
 * Refresh auth session if needed
 * CRITICAL: Handles token refresh to maintain session validity
 */
export const refreshAuthSession = async (): Promise<Session | null> => {
  try {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) throw error;
    if (!data.session || !data.user) return null;

    const userSession: Session = {
      userId: data.user.id,
      email: data.user.email || '',
      token: data.session.access_token,
      expiresAt: Date.now() + (data.session.expires_in * 1000) - TOKEN_EXPIRY_BUFFER
    };

    storeSession(userSession);
    return userSession;
  } catch (error) {
    console.error('Error refreshing session:', error);
    return null;
  }
};
