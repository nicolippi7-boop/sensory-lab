// ============================================================================
// User & Session Types - Critical for data isolation
// ============================================================================

export interface AuthUser {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at?: string;
}

export interface Session {
  userId: string;
  email: string;
  token: string;
  expiresAt: number;
}

export interface SessionContextType {
  user: AuthUser | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: () => boolean;
}

// ============================================================================
// Sensory Test Types - Now includes userId for isolation
// ============================================================================

export const TestType = {
  TRIANGLE: 'TRIANGLE',
  QDA: 'QDA',
  CATA: 'CATA',
  TDS: 'TDS',
  PAIRED_COMPARISON: 'PAIRED_COMPARISON',
  HEDONIC: 'HEDONIC',
  NAPPING: 'NAPPING',
  FLASH_PROFILE: 'FLASH_PROFILE',
  SORTING: 'SORTING',
  RATA: 'RATA',
  TIME_INTENSITY: 'TIME_INTENSITY'
} as const;

export type TestType = typeof TestType[keyof typeof TestType];

export interface Attribute {
  id: string;
  name: string;
  description?: string;
  category?: 'appearance' | 'aroma' | 'taste' | 'texture';
  scaleType: 'linear' | 'linear9' | 'linear10' | 'likert5' | 'likert7' | 'likert9';
  leftAnchor?: string;
  rightAnchor?: string;
  referenceValue?: number;
  referenceLabel?: string;
}

export interface Product {
  id: string;
  name: string;
  code: string;
}

export interface TestConfig {
  instructions: string;
  products: Product[];
  attributes: Attribute[];
  randomizePresentation?: boolean;
  correctOddSampleCode?: string;
  durationSeconds?: number;
  enableTasterNotes?: boolean;
}

/**
 * SensoryTest now includes userId to ensure data isolation
 * CRITICAL DATA ISOLATION: Every query MUST filter by both id AND userId
 * Never fetch tests without verifying the userId matches the authenticated user
 */
export interface SensoryTest {
  id: string;
  userId: string;  // CRITICAL: User who owns this test - MUST validate on every query
  name: string;
  type: TestType;
  createdAt: string;
  status: 'active' | 'closed';
  config: TestConfig;
}

export interface TDSLogEntry {
  time: number;
  attributeId: string;
}

export interface TILogEntry {
  time: number;
  intensity: number;
  attributeId?: string;
}

export interface TriangleResponse {
  selectedCode: string;
  sensoryCategoryType: 'aroma' | 'taste';
  description: string;
  intensity: number;
  isForcedResponse: boolean;
}

/**
 * JudgeResult now includes userId and testUserId for data isolation
 * CRITICAL DATA ISOLATION:
 * - userId: User who submitted this result
 * - testUserId: Test owner ID - validate access permission before returning results
 * Queries must filter by both testId AND testUserId to prevent cross-user leakage
 */
export interface JudgeResult {
  id: string;
  testId: string;
  userId: string;  // CRITICAL: User who submitted this result
  testUserId: string;  // Test owner ID - validate access permission
  judgeName: string;
  submittedAt: string;
  triangleSelection?: string;
  triangleResponse?: TriangleResponse;
  pairedSelection?: string;
  qdaRatings?: Record<string, number>;
  flashAttributes?: string[];
  cataSelection?: string[];
  rataSelection?: Record<string, number>;
  nappingData?: Record<string, { x: number; y: number }>;
  sortingGroups?: Record<string, string>;
  tdsLogs?: Record<string, TDSLogEntry[]>;
  tdsStartTime?: string;
  tdsEndTime?: string;
  tiLogs?: Record<string, TILogEntry[]>;
  generalNotes?: string;
  productNotes?: { [key: string]: string };
}

export type ViewState = 'LOGIN' | 'REGISTER' | 'HOME' | 'ADMIN_DASHBOARD' | 'CREATE_TEST' | 'TEST_RESULTS' | 'JUDGE_LOGIN' | 'JUDGE_RUNNER';

export type P2PMessage =
  | { type: 'SYNC_TESTS'; payload: SensoryTest[] }
  | { type: 'SUBMIT_RESULT'; payload: JudgeResult }
  | { type: 'JUDGE_CONNECTED'; payload: { name: string; userId: string } };