# ============================================================================
# Multi-User Session Isolation Implementation Guide
# ============================================================================
#
# This document provides complete setup instructions and architecture overview
# for the production-ready multi-user sensory lab system with complete data isolation.

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Data Isolation Strategy](#data-isolation-strategy)
3. [Setup Instructions](#setup-instructions)
4. [File Structure](#file-structure)
5. [Key Components](#key-components)
6. [Security Best Practices](#security-best-practices)
7. [Testing Data Isolation](#testing-data-isolation)
8. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

### Multi-Layer Data Isolation

The system implements data isolation at **three critical levels**:

```
┌─────────────────────────────────────────┐
│  1. FRONTEND LAYER (React Context)      │ ← SessionContext validates user
├─────────────────────────────────────────┤
│  2. SERVICE LAYER (Isolated Queries)    │ ← All queries include userId filter
├─────────────────────────────────────────┤
│  3. DATABASE LAYER (RLS Policies)       │ ← RLS prevents cross-user access
└─────────────────────────────────────────┘
```

**Each layer independently enforces data isolation:**
- If React layer fails to filter, service layer will not execute query without userId
- If service layer is compromised, RLS policies at database prevent unauthorized access
- This "defense in depth" approach ensures security even if one layer fails

### Authentication Flow

```
1. User Login/Register
   ↓
2. Supabase Auth validates credentials
   ↓
3. Session created with unique userId
   ↓
4. SessionContext provides userId to app
   ↓
5. All data queries include userId filter
   ↓
6. RLS policies enforce access at database
```

---

## Data Isolation Strategy

### User ID Assignment
- **Source**: Supabase Auth generates unique UUID for each user
- **Storage**: Session Context stores userId in React state and localStorage
- **Validation**: Every query validates userId matches authenticated user

### Test Isolation
```typescript
// CORRECT: Filtered by userId
const tests = await fetchUserTests(userId);

// WRONG: Never do this - would require RLS to catch error
const { data } = await supabase.from('sensory_tests').select('*');
```

### Results Isolation
```typescript
// Results store BOTH userId (who submitted) and testUserId (test owner)
{
  id: "result-123",
  testId: "test-456",
  userId: "user-789",        // Person who submitted result
  testUserId: "user-111",    // Test owner who can view this result
  judgeName: "John",
  submittedAt: "2024-05-27T10:00:00Z",
  ...responses
}

// RLS ensures:
// - Test owner can view all results from their tests
// - Judge can view their own submissions
// - No cross-user leakage possible
```

### Concurrent User Scenario

**User A's View:**
```
- Only sees their own tests
- Only sees results from their tests
- Cannot see User B's data even in same test
- Cannot access User B's admin dashboard
```

**User B's View:**
```
- Completely isolated from User A
- Own tests and results only
- Cannot even detect User A exists
```

---

## Setup Instructions

### Step 1: Install Dependencies

```bash
npm install @supabase/supabase-js
```

The following packages are already included:
- react & react-dom (UI framework)
- typescript (type safety)
- vite (build tool)

### Step 2: Set Up Supabase Project

1. Go to https://supabase.com
2. Click "New Project"
3. Fill in project details
4. Wait for project initialization (3-5 minutes)
5. Navigate to **Settings > API**
6. Copy the following:
   - **Project URL** (VITE_SUPABASE_URL)
   - **Anon Key** (VITE_SUPABASE_ANON_KEY)

### Step 3: Create Database Schema

1. In Supabase dashboard, go to **SQL Editor**
2. Click **New Query**
3. Copy entire contents of `database-schema.sql`
4. Paste into SQL Editor
5. Click **Run**
6. Verify tables appear in sidebar:
   - `sensory_tests` (user-scoped tests)
   - `judge_results` (user-scoped results)
   - `user_profiles` (user profiles)
   - `session_logs` (security audit)

### Step 4: Configure Environment Variables

1. Create `.env.local` file in project root (DO NOT commit to git):
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_GOOGLE_GENERATIVE_AI_KEY=your-gemini-key-here
```

2. Restart dev server for changes to take effect

### Step 5: Integrate with App

The main App.tsx needs to be updated to use SessionProvider:

```typescript
import { SessionProvider } from './contexts/SessionContext';
import AuthPage from './components/AuthPage';
import { useSession, useUserId } from './contexts/SessionContext';

const App = () => {
  return (
    <SessionProvider>
      <AppContent />
    </SessionProvider>
  );
};

const AppContent = () => {
  const { isAuthenticated } = useSession();
  const userId = useUserId();

  if (!isAuthenticated()) {
    return <AuthPage onAuthSuccess={() => {}} />;
  }

  // Rest of app - now has userId available via useUserId()
  return <YourMainApp />;
};
```

### Step 6: Update Data Fetching

Replace old Supabase calls with isolated queries:

```typescript
// OLD (insecure - no user isolation)
const { data } = await supabase.from('sensory_tests').select('*');

// NEW (secure - user-scoped with isolation)
import { fetchUserTests } from '../services/isolatedDataService';
import { useUserId } from '../contexts/SessionContext';

const userId = useUserId();
const tests = await fetchUserTests(userId);
```

---

## File Structure

```
src/
├── components/
│   ├── AuthPage.tsx                 # Login/Register UI
│   ├── ProtectedRoute.tsx          # Authentication gating
│   ├── AdminDashboard.tsx          # Updated to use isolated queries
│   ├── TestRunner.tsx              # Updated to use userId
│   └── supabaseClient.ts           # Deprecated - use authService
│
├── contexts/
│   └── SessionContext.tsx          # Session provider & hooks
│
├── services/
│   ├── authService.ts              # Auth & session management
│   ├── isolatedDataService.ts      # User-scoped database queries
│   └── geminiService.ts            # Existing AI service (unchanged)
│
├── types.ts                         # Updated types with userId fields
├── App.tsx                          # Needs update (see below)
└── index.tsx

database-schema.sql                  # Database setup script
.env.local                          # Environment variables (NOT in git)
.env.local.example                  # Example env file (for reference)
IMPLEMENTATION_GUIDE.md             # This file
```

---

## Key Components

### 1. SessionContext (React-level isolation)

**File**: `src/contexts/SessionContext.tsx`

Provides:
```typescript
const {
  user,              // Current authenticated user
  session,           // Session token & expiry
  login,             // Login function
  register,          // Register function
  logout,            // Logout function
  isAuthenticated    // Check if authenticated
} = useSession();

// Get current user ID for queries
const userId = useUserId();
```

**Critical**: Must wrap entire app at root level

### 2. Auth Service (Secure credential handling)

**File**: `src/services/authService.ts`

Handles:
- User registration with secure password hashing
- Login with credential validation
- Session token generation and storage
- Token refresh and expiry validation
- Secure session cleanup on logout

**Security features**:
- Tokens validated before use
- Expired tokens automatically cleared
- Session invalidation on logout

### 3. Isolated Data Service (Query-level isolation)

**File**: `src/services/isolatedDataService.ts`

All functions validate userId before query:

```typescript
// Tests
fetchUserTests(userId)           // Get all tests for user
fetchUserTest(testId, userId)    // Get single test (validated)
createUserTest(testData, userId) // Create new test
updateUserTest(testId, updates, userId)  // Update test
deleteUserTest(testId, userId)   // Delete test

// Results
fetchTestResults(testId, userId)          // Get results from user's tests
submitTestResult(resultData, userId)      // Submit result
fetchUserSubmittedResults(userId)         // Get user's submissions
```

**Critical validation**:
```typescript
// Every function starts with:
validateUserId(userId);  // Throws error if userId is null

// Every query filters by userId:
.eq('userId', userId)    // MUST be in every query
```

### 4. Auth Page (User Interface)

**File**: `src/components/AuthPage.tsx`

Provides login and registration UI
- Form validation
- Error handling
- Loading states
- Toggles between login/register modes

### 5. Protected Route (Access control)

**File**: `src/components/ProtectedRoute.tsx`

Wrapper component:
```typescript
<ProtectedRoute>
  <AdminDashboard />  {/* Only shown if authenticated */}
</ProtectedRoute>
```

---

## Security Best Practices

### 1. Never Trust Frontend Filtering Alone

```typescript
// WRONG - user could modify localStorage
const userId = localStorage.getItem('userId');

// CORRECT - get from authenticated session
import { useUserId } from '../contexts/SessionContext';
const userId = useUserId();  // Cannot be spoofed
```

### 2. Always Include User Context in Queries

```typescript
// WRONG - fetches all data
const tests = await supabase.from('sensory_tests').select('*');

// CORRECT - only user's tests
const tests = await fetchUserTests(userId);
```

### 3. Validate Data Ownership Before Operations

```typescript
// Before returning results, verify test ownership
const test = await fetchUserTest(testId, userId);
if (!test) {
  throw new Error('Test not found or access denied');
}
```

### 4. Use HTTPS in Production

```typescript
// WRONG - in production
http://sensory-lab.com/

// CORRECT - always HTTPS
https://sensory-lab.com/
```

### 5. Rotate Secrets Periodically

In Supabase:
1. Go to Settings > API
2. Click "Rotate anon key"
3. Update `.env` with new key
4. Redeploy application

### 6. Enable RLS on All Tables

```sql
-- CRITICAL - Must be enabled for all tables
ALTER TABLE sensory_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE judge_results ENABLE ROW LEVEL SECURITY;
```

### 7. Test RLS Policies

```sql
-- View all RLS policies
SELECT tablename, policyname, qual FROM pg_policies;

-- Test policy effectiveness (see "Testing Data Isolation" section)
```

---

## Testing Data Isolation

### Scenario 1: Verify User Cannot See Other User's Tests

```typescript
// User A logs in and creates a test
const userA_tests = await fetchUserTests(userA_id);
// Result: [{ id: 'test-1', userId: 'userA', ... }]

// User B logs in separately
const userB_tests = await fetchUserTests(userB_id);
// Result: []  ← Empty! User B cannot see User A's test

// Attempt direct access to User A's test
const direct_access = await fetchUserTest('test-1', userB_id);
// Result: null  ← Returns null due to userId validation
```

### Scenario 2: Verify Results Cannot Cross Users

```typescript
// User A submits result to their own test
const result_a = await submitTestResult(
  { testId: 'test-1', judgeName: 'John', ... },
  userA_id
);
// Stored with userId: userA_id, testUserId: userA_id

// User B tries to fetch results from User A's test
const results = await fetchTestResults('test-1', userB_id);
// Result: []  ← Empty! RLS prevents access

// User A fetches results
const results_a = await fetchTestResults('test-1', userA_id);
// Result: [{ id: 'result-1', userId: userA_id, ... }]  ← Visible to owner
```

### Scenario 3: Concurrent Users

```typescript
// User A and User B logged in simultaneously
User A: navigates to /admin-dashboard
User B: navigates to /judge-login

// Each gets isolated session context
User A: userId = 'uuid-A'
User B: userId = 'uuid-B'

// Queries use their respective userIds
User A sees only their tests
User B sees only their judge assignments

// If User B somehow intercepts User A's test ID and tries to access:
fetchUserTest('test-from-A', userB_id)
// Result: null  ← userId mismatch, RLS blocks access
```

### Test Using Supabase Console

1. Go to Supabase Dashboard > SQL Editor
2. Create test query:

```sql
-- Test 1: Verify RLS is active
SELECT tablename, rowsecurity FROM pg_tables 
WHERE tablename IN ('sensory_tests', 'judge_results');

-- Test 2: Check current user context
SELECT auth.uid();

-- Test 3: Try to access all tests (should fail if RLS enforced)
SELECT * FROM sensory_tests;

-- Test 4: Access only current user's tests (should work)
SELECT * FROM sensory_tests WHERE userId = auth.uid();
```

---

## Troubleshooting

### Problem: "User context required: userId is missing"

**Cause**: Trying to fetch data without authentication

**Solution**:
1. Ensure user is logged in
2. Check SessionContext is wrapping app
3. Verify useUserId() returns non-null value

```typescript
const userId = useUserId();
if (!userId) {
  throw new Error('Must be authenticated');
}
```

### Problem: Tests appear to other users

**Cause**: RLS policies not enabled on database

**Solution**:
1. Go to Supabase > SQL Editor
2. Run `database-schema.sql` again
3. Verify RLS is enabled:

```sql
SELECT tablename, rowsecurity FROM pg_tables 
WHERE tablename = 'sensory_tests';
-- Result should show rowsecurity = true
```

### Problem: "Chiavi Supabase mancanti" (Missing Supabase keys)

**Cause**: Environment variables not set

**Solution**:
1. Create `.env.local` file
2. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
3. Restart dev server (`npm run dev`)
4. Restart app in browser

### Problem: Tokens expiring too quickly

**Cause**: Token expiry buffer too aggressive

**Solution**: In `authService.ts`, adjust:
```typescript
// Change this value (currently 5 minutes buffer)
const TOKEN_EXPIRY_BUFFER = 5 * 60 * 1000;
```

### Problem: Session not persisting across page reload

**Cause**: Session storage not working

**Solution**:
1. Check browser localStorage is not disabled
2. Verify .env.local variables are set
3. Check browser console for errors
4. Clear localStorage and retry login

```javascript
// In browser console
localStorage.getItem('sensory_auth_session')
// Should return valid JSON, not null
```

---

## Monitoring & Logging

### Session Logs Table

Monitor user activities for security audits:

```sql
-- View all login activities
SELECT userId, action, createdAt FROM session_logs 
WHERE action = 'login' 
ORDER BY createdAt DESC;

-- Detect suspicious access patterns
SELECT userId, COUNT(*) as attempts 
FROM session_logs 
WHERE action = 'failed_login' 
AND createdAt > NOW() - INTERVAL '1 hour'
GROUP BY userId
HAVING COUNT(*) > 5;
```

### Application Logging

The system logs all critical security events:

```typescript
// Enable detailed logging for development
localStorage.setItem('debug_auth', 'true');

// Check browser console for:
// - Login/logout events
// - Query filters applied
// - RLS policy enforcement
```

---

## Production Deployment Checklist

- [ ] Database schema loaded (sensory_tests, judge_results, user_profiles)
- [ ] RLS policies verified on all tables
- [ ] Environment variables set in deployment platform
- [ ] HTTPS enabled on all endpoints
- [ ] Supabase Auth enabled and configured
- [ ] Test isolated queries work correctly
- [ ] Auth flow works end-to-end
- [ ] Concurrent users cannot see each other's data
- [ ] Session tokens refresh correctly
- [ ] Logout clears all session data
- [ ] Error handling provides security-safe messages
- [ ] Rate limiting configured on Supabase
- [ ] Backups configured
- [ ] Monitoring and alerts set up

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (Frontend)                     │
│  ┌───────────────────────────────────────────────────┐  │
│  │  SessionContext (manages user state & session)    │  │
│  │  - Stores userId in React state                   │  │
│  │  - Validates token expiry                         │  │
│  │  - Provides useUserId() hook                       │  │
│  └───────────────────────────────────────────────────┘  │
│                          ↓                                 │
│  ┌───────────────────────────────────────────────────┐  │
│  │  React Components use isolated queries            │  │
│  │  - AdminDashboard calls fetchUserTests(userId)    │  │
│  │  - TestRunner calls fetchTestResults(userId)      │  │
│  │  - All queries include userId filter              │  │
│  └───────────────────────────────────────────────────┘  │
│                          ↓                                 │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Isolated Data Service validates:                 │  │
│  │  - userId is not null                             │  │
│  │  - userId matches authenticated user              │  │
│  │  - Data returned only has user's records          │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          ↓ HTTPS
                 (Encrypted connection)
                          ↓
┌─────────────────────────────────────────────────────────┐
│              Supabase Cloud (Backend)                     │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Auth Module validates JWT tokens                 │  │
│  │  - Verifies token signature                       │  │
│  │  - Checks token not expired                       │  │
│  │  - Extracts userId from token                     │  │
│  └───────────────────────────────────────────────────┘  │
│                          ↓                                 │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Row Level Security (RLS) Policies                │  │
│  │  - sensory_tests: Only author can view            │  │
│  │  - judge_results: Only owner/submitter can view   │  │
│  │  - user_profiles: Only own profile visible        │  │
│  │  - RLS checks run on EVERY query                  │  │
│  └───────────────────────────────────────────────────┘  │
│                          ↓                                 │
│  ┌───────────────────────────────────────────────────┐  │
│  │  PostgreSQL Database                              │  │
│  │  - Tables physically store data                   │  │
│  │  - RLS policies prevent unauthorized access      │  │
│  │  - Even direct SQL cannot bypass RLS              │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## Next Steps

1. **Set up Supabase project** (Steps 1-2 above)
2. **Load database schema** (Step 3)
3. **Configure environment** (Step 4)
4. **Integrate with App.tsx** (Step 5)
5. **Update existing components** (Step 6)
6. **Test data isolation** (Testing section)
7. **Deploy to production** (Checklist above)

---

For questions or issues, refer to:
- Supabase Docs: https://supabase.com/docs
- Supabase RLS: https://supabase.com/docs/guides/auth/row-level-security
- React Context: https://react.dev/reference/react/useContext
