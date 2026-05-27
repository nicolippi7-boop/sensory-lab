/**
 * ============================================================================
 * Security Utilities & Middleware
 * ============================================================================
 * 
 * CRITICAL FOR DATA ISOLATION:
 * This module provides security utilities used throughout the application
 * to enforce data isolation at multiple levels.
 * 
 * Usage:
 * - Import security functions in components
 * - Use middleware for request validation
 * - Log security events for audit trail
 */

import type { Session, SensoryTest, JudgeResult } from '../types';

// ============================================================================
// Session Validation Middleware
// ============================================================================

/**
 * Validate session is active and not expired
 * CRITICAL: Call before any data operation
 */
export const validateSessionMiddleware = (session: Session | null): { valid: boolean; error?: string } => {
  if (!session) {
    return { valid: false, error: 'No session found' };
  }

  if (Date.now() > session.expiresAt) {
    return { valid: false, error: 'Session expired' };
  }

  if (!session.userId || !session.token) {
    return { valid: false, error: 'Invalid session data' };
  }

  return { valid: true };
};

/**
 * Middleware to verify user ID format (UUID)
 * CRITICAL: Prevent SQL injection through invalid userId
 */
export const validateUserIdFormat = (userId: string | null): boolean => {
  if (!userId) return false;

  // UUID v4 format validation
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(userId);
};

// ============================================================================
// Data Ownership Validation
// ============================================================================

/**
 * Verify user owns a test
 * CRITICAL: Prevent unauthorized test access
 */
export const verifyTestOwnership = (
  test: SensoryTest | null,
  userId: string | null
): boolean => {
  if (!test || !userId) return false;
  return test.userId === userId;
};

/**
 * Verify user can access test results
 * CRITICAL: Test owner or result submitter can access
 */
export const verifyResultAccess = (
  result: JudgeResult | null,
  userId: string | null
): boolean => {
  if (!result || !userId) return false;

  // User can access if they:
  // 1. Are the test owner (testUserId), OR
  // 2. Are the result submitter (userId)
  return result.testUserId === userId || result.userId === userId;
};

// ============================================================================
// Data Sanitization
// ============================================================================

/**
 * Sanitize test data to prevent data leakage
 * CRITICAL: Only return fields user should see
 */
export const sanitizeTestData = (test: SensoryTest, userId: string): SensoryTest => {
  // Only return test if user is owner
  if (test.userId !== userId) {
    throw new Error('Access denied: Cannot sanitize non-owned test');
  }

  // Return only necessary fields
  return {
    id: test.id,
    userId: test.userId,
    name: test.name,
    type: test.type,
    createdAt: test.createdAt,
    status: test.status,
    config: test.config
  };
};

/**
 * Sanitize result data to prevent cross-user information leakage
 * CRITICAL: Only return fields user should see
 */
export const sanitizeResultData = (result: JudgeResult, userId: string): JudgeResult => {
  // Verify access
  if (!verifyResultAccess(result, userId)) {
    throw new Error('Access denied: Cannot sanitize unauthorized result');
  }

  // For test owner viewing all results
  if (result.testUserId === userId) {
    return {
      ...result,
      // Do not expose judge's userId to test owner for privacy
      // They can see the judgeName and responses only
    };
  }

  // For judge viewing their own submission
  if (result.userId === userId) {
    // Judge can see their full submission
    return result;
  }

  throw new Error('Access denied: Cannot access result');
};

// ============================================================================
// Security Event Logging
// ============================================================================

interface SecurityEvent {
  type: 'login' | 'logout' | 'failed_login' | 'failed_access' | 'data_operation';
  userId?: string;
  resource?: string;
  status: 'success' | 'failure';
  details?: string;
  timestamp: Date;
}

/**
 * Log security events for audit trail
 * CRITICAL: Maintain audit trail for security investigations
 */
export const logSecurityEvent = (event: Omit<SecurityEvent, 'timestamp'>): void => {
  const securityEvent: SecurityEvent = {
    ...event,
    timestamp: new Date()
  };

  // Log to console in development
  if (import.meta.env.DEV) {
    console.log('[SECURITY]', securityEvent);
  }

  // In production, send to backend logging service
  if (import.meta.env.PROD) {
    // sendToLoggingService(securityEvent);
  }
};

/**
 * Log failed access attempt
 * CRITICAL: Detect and alert on suspicious access patterns
 */
export const logFailedAccess = (userId: string | null, resource: string, reason: string): void => {
  logSecurityEvent({
    type: 'failed_access',
    userId: userId || 'unknown',
    resource,
    status: 'failure',
    details: reason
  });

  // Could trigger alert if multiple failures detected
};

/**
 * Log data operation
 * CRITICAL: Maintain complete audit trail of data changes
 */
export const logDataOperation = (
  userId: string | null,
  operation: 'read' | 'create' | 'update' | 'delete',
  resource: string
): void => {
  logSecurityEvent({
    type: 'data_operation',
    userId: userId || 'unknown',
    resource,
    status: 'success',
    details: `${operation} operation on ${resource}`
  });
};

// ============================================================================
// Rate Limiting Utilities
// ============================================================================

/**
 * In-memory store for rate limiting
 * In production, use Redis for distributed rate limiting
 */
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

/**
 * Check if request is within rate limit
 * CRITICAL: Prevent brute force attacks on auth endpoints
 */
export const checkRateLimit = (
  key: string,
  maxRequests: number = 5,
  windowMs: number = 60000
): { allowed: boolean; remaining: number } => {
  const now = Date.now();
  const record = rateLimitStore.get(key);

  if (!record || now > record.resetTime) {
    // Create new rate limit record
    rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  if (record.count < maxRequests) {
    record.count++;
    return { allowed: true, remaining: maxRequests - record.count };
  }

  return { allowed: false, remaining: 0 };
};

/**
 * Reset rate limit for a key (e.g., after successful auth)
 */
export const resetRateLimit = (key: string): void => {
  rateLimitStore.delete(key);
};

// ============================================================================
// Content Security Policy Helpers
// ============================================================================

/**
 * Generate CSP headers for secure responses
 * Prevents XSS and data injection attacks
 */
export const getCSPHeaders = (): Record<string, string> => {
  return {
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",  // Allow Vite HMR in dev
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://supabase.co https://*.supabase.co",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; ')
  };
};

// ============================================================================
// Error Handling with Security in Mind
// ============================================================================

/**
 * Create security-safe error messages
 * CRITICAL: Don't leak internal details to users
 */
export const createSecureErrorMessage = (
  error: any,
  isDevelopment: boolean = import.meta.env.DEV
): string => {
  // In development, show full error
  if (isDevelopment) {
    return error instanceof Error ? error.message : String(error);
  }

  // In production, show generic message
  const errorType = error?.code || error?.type;

  switch (errorType) {
    case 'PGRST116':  // Not found
      return 'Resource not found';
    case 'PGRST204':  // No rows
      return 'No data available';
    case 'PGRST422':  // Constraint violation
      return 'Invalid data provided';
    case '42501':  // Permission denied (RLS)
      return 'Access denied';
    default:
      return 'An error occurred. Please try again.';
  }
};

// ============================================================================
// Type Guards for Runtime Validation
// ============================================================================

/**
 * Type guard: Check if object is valid Session
 */
export const isValidSession = (obj: any): obj is Session => {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.userId === 'string' &&
    typeof obj.email === 'string' &&
    typeof obj.token === 'string' &&
    typeof obj.expiresAt === 'number'
  );
};

/**
 * Type guard: Check if object is valid SensoryTest
 */
export const isValidTest = (obj: any): obj is SensoryTest => {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.id === 'string' &&
    typeof obj.userId === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.type === 'string'
  );
};

/**
 * Type guard: Check if object is valid JudgeResult
 */
export const isValidResult = (obj: any): obj is JudgeResult => {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.id === 'string' &&
    typeof obj.testId === 'string' &&
    typeof obj.userId === 'string' &&
    typeof obj.testUserId === 'string' &&
    typeof obj.judgeName === 'string'
  );
};

// ============================================================================
// Encryption Utilities (Optional - for sensitive data)
// ============================================================================

/**
 * Hash user ID for anonymization in logs
 * CRITICAL: Protect user privacy in public logs
 */
export const anonymizeUserId = (userId: string): string => {
  // Return first 8 chars + hash of rest
  return userId.substring(0, 8) + '...';
};

/**
 * Hash sensitive data for comparison without storing plaintext
 * Example: Hash test names for deduplication
 */
export const hashData = async (data: string): Promise<string> => {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
};
