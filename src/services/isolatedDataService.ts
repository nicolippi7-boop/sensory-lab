/**
 * ============================================================================
 * Isolated Data Service - User-scoped database queries
 * ============================================================================
 * 
 * CRITICAL FOR DATA ISOLATION:
 * Every query in this service:
 * 1. Validates userId is provided
 * 2. Filters by userId to ensure user can only see their own data
 * 3. Includes userId in all insert/update operations
 * 4. Never performs operations without user context
 * 
 * This prevents cross-user data leakage and ensures multi-user safety
 */

import { supabase } from './authService';
import type { SensoryTest, JudgeResult, TestConfig } from '../types';

const TESTS_TABLE = 'sensory_tests';
const RESULTS_TABLE = 'judge_results';
const USERS_TABLE = 'auth.users'; // For reference

// ============================================================================
// Validation Helper - Ensure userId is always present
// ============================================================================

/**
 * Validates that userId exists
 * CRITICAL: This must be called before ANY database operation
 */
const validateUserId = (userId: string | null): void => {
  if (!userId) {
    throw new Error('User context required: userId is missing. User must be authenticated.');
  }
};

// ============================================================================
// Test Management - User-scoped queries
// ============================================================================

/**
 * Fetch all tests for the current user
 * CRITICAL DATA ISOLATION:
 * - Uses .eq('userId', userId) to filter by user
 * - Never returns tests from other users
 * - Returns empty array if user has no tests
 */
export const fetchUserTests = async (userId: string | null): Promise<SensoryTest[]> => {
  validateUserId(userId);

  try {
    const { data, error } = await supabase
      .from(TESTS_TABLE)
      .select('*')
      .eq('userId', userId!)  // CRITICAL: Filter by userId
      .order('createdAt', { ascending: false });

    if (error) throw error;

    return (data || []).map(row => ({
      id: row.id,
      userId: row.userId,
      name: row.name,
      type: row.type,
      createdAt: row.createdAt,
      status: row.status,
      config: row.config
    }));
  } catch (error) {
    console.error('Error fetching tests:', error);
    throw error;
  }
};

/**
 * Fetch a specific test for the current user
 * CRITICAL DATA ISOLATION:
 * - Filters by BOTH id AND userId
 * - Prevents accessing another user's test via direct ID
 */
export const fetchUserTest = async (testId: string, userId: string | null): Promise<SensoryTest | null> => {
  validateUserId(userId);

  try {
    const { data, error } = await supabase
      .from(TESTS_TABLE)
      .select('*')
      .eq('id', testId)
      .eq('userId', userId!)  // CRITICAL: Dual validation - id AND userId
      .single();

    if (error && error.code === 'PGRST116') {
      // No matching test found - either doesn't exist or belongs to different user
      return null;
    }

    if (error) throw error;

    return {
      id: data.id,
      userId: data.userId,
      name: data.name,
      type: data.type,
      createdAt: data.createdAt,
      status: data.status,
      config: data.config
    };
  } catch (error) {
    console.error('Error fetching test:', error);
    throw error;
  }
};

/**
 * Create a new test for the current user
 * CRITICAL DATA ISOLATION:
 * - Automatically associates test with userId
 * - User cannot create tests for other users
 */
export const createUserTest = async (
  testData: Omit<SensoryTest, 'userId' | 'createdAt'>,
  userId: string | null
): Promise<SensoryTest> => {
  validateUserId(userId);

  try {
    const newTest: SensoryTest = {
      ...testData,
      userId: userId!,  // CRITICAL: Force userId from authenticated user
      createdAt: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from(TESTS_TABLE)
      .insert([newTest])
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      userId: data.userId,
      name: data.name,
      type: data.type,
      createdAt: data.createdAt,
      status: data.status,
      config: data.config
    };
  } catch (error) {
    console.error('Error creating test:', error);
    throw error;
  }
};

/**
 * Update an existing test (only if owned by user)
 * CRITICAL DATA ISOLATION:
 * - Validates ownership before update
 * - Filters by userId to prevent cross-user updates
 */
export const updateUserTest = async (
  testId: string,
  updates: Partial<Omit<SensoryTest, 'id' | 'userId' | 'createdAt'>>,
  userId: string | null
): Promise<SensoryTest> => {
  validateUserId(userId);

  try {
    // First verify the test belongs to this user
    const existingTest = await fetchUserTest(testId, userId);
    if (!existingTest) {
      throw new Error('Test not found or access denied');
    }

    const { data, error } = await supabase
      .from(TESTS_TABLE)
      .update(updates)
      .eq('id', testId)
      .eq('userId', userId!)  // CRITICAL: Ensure only user's own test is updated
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      userId: data.userId,
      name: data.name,
      type: data.type,
      createdAt: data.createdAt,
      status: data.status,
      config: data.config
    };
  } catch (error) {
    console.error('Error updating test:', error);
    throw error;
  }
};

/**
 * Delete a test (only if owned by user)
 * CRITICAL DATA ISOLATION:
 * - Only user who created test can delete it
 * - Filters by userId to prevent cross-user deletion
 */
export const deleteUserTest = async (testId: string, userId: string | null): Promise<void> => {
  validateUserId(userId);

  try {
    // Verify ownership before deletion
    const existingTest = await fetchUserTest(testId, userId);
    if (!existingTest) {
      throw new Error('Test not found or access denied');
    }

    const { error } = await supabase
      .from(TESTS_TABLE)
      .delete()
      .eq('id', testId)
      .eq('userId', userId!);  // CRITICAL: Only delete if belongs to user

    if (error) throw error;
  } catch (error) {
    console.error('Error deleting test:', error);
    throw error;
  }
};

// ============================================================================
// Results Management - User-scoped queries
// ============================================================================

/**
 * Fetch all results for a specific test (only tests owned by user)
 * CRITICAL DATA ISOLATION:
 * - Verifies test ownership before fetching results
 * - Returns only results for user's own tests
 * - Prevents accessing results from other users' tests
 */
export const fetchTestResults = async (testId: string, userId: string | null): Promise<JudgeResult[]> => {
  validateUserId(userId);

  try {
    // CRITICAL: Verify user owns the test before fetching its results
    const test = await fetchUserTest(testId, userId);
    if (!test) {
      throw new Error('Test not found or access denied');
    }

    const { data, error } = await supabase
      .from(RESULTS_TABLE)
      .select('*')
      .eq('testId', testId)
      .eq('testUserId', userId!)  // CRITICAL: Only fetch results from user's tests
      .order('submittedAt', { ascending: false });

    if (error) throw error;

    return (data || []).map(row => ({
      id: row.id,
      testId: row.testId,
      userId: row.userId,
      testUserId: row.testUserId,
      judgeName: row.judgeName,
      submittedAt: row.submittedAt,
      triangleSelection: row.triangleSelection,
      triangleResponse: row.triangleResponse,
      pairedSelection: row.pairedSelection,
      qdaRatings: row.qdaRatings,
      flashAttributes: row.flashAttributes,
      cataSelection: row.cataSelection,
      rataSelection: row.rataSelection,
      nappingData: row.nappingData,
      sortingGroups: row.sortingGroups,
      tdsLogs: row.tdsLogs,
      tdsStartTime: row.tdsStartTime,
      tdsEndTime: row.tdsEndTime,
      tiLogs: row.tiLogs,
      generalNotes: row.generalNotes,
      productNotes: row.productNotes
    }));
  } catch (error) {
    console.error('Error fetching test results:', error);
    throw error;
  }
};

/**
 * Submit a result for a test
 * CRITICAL DATA ISOLATION:
 * - Associates result with both submitting user (userId) and test owner (testUserId)
 * - Result can only be submitted to active tests
 */
export const submitTestResult = async (
  result: Omit<JudgeResult, 'id' | 'userId'>,
  userId: string | null
): Promise<JudgeResult> => {
  validateUserId(userId);

  try {
    // Verify test exists and is active
    const test = await supabase
      .from(TESTS_TABLE)
      .select('userId, status')
      .eq('id', result.testId)
      .single();

    if (test.error || test.data?.status !== 'active') {
      throw new Error('Test not found or not active');
    }

    const newResult: JudgeResult = {
      ...result,
      userId: userId!,  // CRITICAL: Record who submitted this result
      testUserId: test.data.userId  // CRITICAL: Record test owner for isolation
    };

    const { data, error } = await supabase
      .from(RESULTS_TABLE)
      .insert([newResult])
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      testId: data.testId,
      userId: data.userId,
      testUserId: data.testUserId,
      judgeName: data.judgeName,
      submittedAt: data.submittedAt,
      triangleSelection: data.triangleSelection,
      triangleResponse: data.triangleResponse,
      pairedSelection: data.pairedSelection,
      qdaRatings: data.qdaRatings,
      flashAttributes: data.flashAttributes,
      cataSelection: data.cataSelection,
      rataSelection: data.rataSelection,
      nappingData: data.nappingData,
      sortingGroups: data.sortingGroups,
      tdsLogs: data.tdsLogs,
      tdsStartTime: data.tdsStartTime,
      tdsEndTime: data.tdsEndTime,
      tiLogs: data.tiLogs,
      generalNotes: data.generalNotes,
      productNotes: data.productNotes
    };
  } catch (error) {
    console.error('Error submitting test result:', error);
    throw error;
  }
};

/**
 * Fetch results submitted by current user (for their own review)
 * CRITICAL DATA ISOLATION:
 * - Returns only results submitted by this user
 * - Useful for judge to see their own submissions
 */
export const fetchUserSubmittedResults = async (userId: string | null): Promise<JudgeResult[]> => {
  validateUserId(userId);

  try {
    const { data, error } = await supabase
      .from(RESULTS_TABLE)
      .select('*')
      .eq('userId', userId!)  // CRITICAL: Only fetch this user's submissions
      .order('submittedAt', { ascending: false });

    if (error) throw error;

    return (data || []).map(row => ({
      id: row.id,
      testId: row.testId,
      userId: row.userId,
      testUserId: row.testUserId,
      judgeName: row.judgeName,
      submittedAt: row.submittedAt,
      triangleSelection: row.triangleSelection,
      triangleResponse: row.triangleResponse,
      pairedSelection: row.pairedSelection,
      qdaRatings: row.qdaRatings,
      flashAttributes: row.flashAttributes,
      cataSelection: row.cataSelection,
      rataSelection: row.rataSelection,
      nappingData: row.nappingData,
      sortingGroups: row.sortingGroups,
      tdsLogs: row.tdsLogs,
      tdsStartTime: row.tdsStartTime,
      tdsEndTime: row.tdsEndTime,
      tiLogs: row.tiLogs,
      generalNotes: row.generalNotes,
      productNotes: row.productNotes
    }));
  } catch (error) {
    console.error('Error fetching submitted results:', error);
    throw error;
  }
};
