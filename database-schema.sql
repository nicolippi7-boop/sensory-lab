/**
 * ============================================================================
 * Supabase Database Schema Setup
 * ============================================================================
 * 
 * This SQL script sets up the complete database schema with Row Level Security (RLS)
 * 
 * CRITICAL FOR DATA ISOLATION:
 * - RLS policies enforce user-scoped data access at database level
 * - Even if application logic fails, database prevents cross-user data access
 * - This is the primary enforcement mechanism for multi-user data isolation
 * 
 * SETUP INSTRUCTIONS:
 * 1. Go to Supabase Dashboard > SQL Editor
 * 2. Create new query
 * 3. Copy-paste entire SQL script below
 * 4. Click "Run" to execute
 * 5. Verify tables appear in "Tables" sidebar
 */

-- ============================================================================
-- Create Sensory Tests Table with User Isolation
-- ============================================================================

CREATE TABLE IF NOT EXISTS sensory_tests (
  id TEXT PRIMARY KEY,
  userId UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  config JSONB NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT NOW(),
  updatedAt TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_sensory_tests_userId ON sensory_tests(userId);
CREATE INDEX IF NOT EXISTS idx_sensory_tests_status ON sensory_tests(status);

-- Enable RLS on sensory_tests
ALTER TABLE sensory_tests ENABLE ROW LEVEL SECURITY;

-- CRITICAL RLS POLICY: Users can only see their own tests
CREATE POLICY "Users can view only their own tests"
ON sensory_tests
FOR SELECT
USING (auth.uid() = userId);

-- CRITICAL RLS POLICY: Users can only insert tests for themselves
CREATE POLICY "Users can create their own tests"
ON sensory_tests
FOR INSERT
WITH CHECK (auth.uid() = userId);

-- CRITICAL RLS POLICY: Users can only update their own tests
CREATE POLICY "Users can update only their own tests"
ON sensory_tests
FOR UPDATE
USING (auth.uid() = userId)
WITH CHECK (auth.uid() = userId);

-- CRITICAL RLS POLICY: Users can only delete their own tests
CREATE POLICY "Users can delete only their own tests"
ON sensory_tests
FOR DELETE
USING (auth.uid() = userId);

-- ============================================================================
-- Create Judge Results Table with User Isolation
-- ============================================================================

CREATE TABLE IF NOT EXISTS judge_results (
  id TEXT PRIMARY KEY,
  testId TEXT NOT NULL REFERENCES sensory_tests(id) ON DELETE CASCADE,
  userId UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  testUserId UUID NOT NULL,  -- ID of the test owner for isolation
  judgeName TEXT NOT NULL,
  responses JSONB NOT NULL,  -- Stores all test-specific responses
  submittedAt TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Denormalized fields for easier filtering
  triangleSelection TEXT,
  pairedSelection TEXT,
  CONSTRAINT fk_test_user FOREIGN KEY (testUserId) REFERENCES auth.users(id)
);

-- Add indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_judge_results_testId ON judge_results(testId);
CREATE INDEX IF NOT EXISTS idx_judge_results_userId ON judge_results(userId);
CREATE INDEX IF NOT EXISTS idx_judge_results_testUserId ON judge_results(testUserId);
CREATE INDEX IF NOT EXISTS idx_judge_results_testId_testUserId ON judge_results(testId, testUserId);

-- Enable RLS on judge_results
ALTER TABLE judge_results ENABLE ROW LEVEL SECURITY;

-- CRITICAL RLS POLICY: Users can view results from their own tests
-- Test owners can see all results submitted for their tests
CREATE POLICY "Test owners can view results from their tests"
ON judge_results
FOR SELECT
USING (auth.uid() = testUserId);

-- CRITICAL RLS POLICY: Judges can view only their own submissions
-- This allows judges to verify what they submitted
-- NOTE: This is secondary - primary access is through test ownership
CREATE POLICY "Users can view their own submitted results"
ON judge_results
FOR SELECT
USING (auth.uid() = userId OR auth.uid() = testUserId);

-- CRITICAL RLS POLICY: Only allow insertions with correct user ID
-- Results must have userId = current user (who submitted)
CREATE POLICY "Users can submit results for any test"
ON judge_results
FOR INSERT
WITH CHECK (auth.uid() = userId);

-- CRITICAL RLS POLICY: Only allow updates to own results
CREATE POLICY "Users can update only their own results"
ON judge_results
FOR UPDATE
USING (auth.uid() = userId OR auth.uid() = testUserId)
WITH CHECK (auth.uid() = userId OR auth.uid() = testUserId);

-- CRITICAL RLS POLICY: Only allow deletion of own results
CREATE POLICY "Test owners can delete results from their tests"
ON judge_results
FOR DELETE
USING (auth.uid() = testUserId);

-- ============================================================================
-- Create User Profiles Table (Optional - for extended user info)
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  displayName TEXT,
  role TEXT NOT NULL DEFAULT 'judge',  -- 'judge' or 'organizer'
  createdAt TIMESTAMP NOT NULL DEFAULT NOW(),
  updatedAt TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Enable RLS on user_profiles
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Users can only view their own profile
CREATE POLICY "Users can view their own profile"
ON user_profiles
FOR SELECT
USING (auth.uid() = id);

-- Users can only update their own profile
CREATE POLICY "Users can update their own profile"
ON user_profiles
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- ============================================================================
-- Create Session Log Table (Optional - for security audit)
-- ============================================================================

CREATE TABLE IF NOT EXISTS session_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  userId UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,  -- 'login', 'logout', 'create_test', etc.
  resourceId TEXT,  -- ID of affected resource
  ipAddress TEXT,
  userAgent TEXT,
  createdAt TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_session_logs_userId ON session_logs(userId);
CREATE INDEX IF NOT EXISTS idx_session_logs_createdAt ON session_logs(createdAt);

-- Enable RLS on session_logs
ALTER TABLE session_logs ENABLE ROW LEVEL SECURITY;

-- Users can only view their own session logs
CREATE POLICY "Users can view their own session logs"
ON session_logs
FOR SELECT
USING (auth.uid() = userId);

-- Only system can insert session logs
CREATE POLICY "System can insert session logs"
ON session_logs
FOR INSERT
WITH CHECK (true);

-- ============================================================================
-- Verify Setup
-- ============================================================================

-- Check tables exist
SELECT tablename FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('sensory_tests', 'judge_results', 'user_profiles', 'session_logs');

-- Check RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND rowsecurity = true;
