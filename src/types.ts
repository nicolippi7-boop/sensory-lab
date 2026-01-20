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
}

export interface SensoryTest {
  id: string;
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
}

export interface TriangleResponse {
  selectedCode: string;
  sensoryCategoryType: 'aroma' | 'taste';
  description: string;
  intensity: number;
  isForcedResponse: boolean;
}

export interface JudgeResult {
  id: string;
  testId: string;
  judgeName: string;
  submittedAt: string;
  triangleSelection?: string;
  triangleResponse?: TriangleResponse;
  pairedSelection?: string; 
  qdaRatings?: Record<string, number>;
  flashAttributes?: string[];
  cataSelection?: string[]; 
  rataSelection?: Record<string, number>;
  nappingData?: Record<string, { x: number, y: number }>;
  sortingGroups?: Record<string, string>;
  tdsLogs?: Record<string, TDSLogEntry[]>; 
  tiLogs?: Record<string, TILogEntry[]>;
}

export type ViewState = 'HOME' | 'ADMIN_DASHBOARD' | 'CREATE_TEST' | 'TEST_RESULTS' | 'JUDGE_LOGIN' | 'JUDGE_RUNNER';

export type P2PMessage = 
  | { type: 'SYNC_TESTS'; payload: SensoryTest[] }
  | { type: 'SUBMIT_RESULT'; payload: JudgeResult }
  | { type: 'JUDGE_CONNECTED'; payload: { name: string } };