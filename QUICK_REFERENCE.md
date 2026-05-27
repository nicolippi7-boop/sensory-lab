# Quick Reference - Multi-User Isolation System

## Setup (5 minutes)

```bash
# 1. Create .env.local from template
cp .env.local.example .env.local

# 2. Add Supabase credentials to .env.local
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# 3. Load database schema
# Supabase Dashboard > SQL Editor > Create Query
# Copy & paste entire database-schema.sql > Run

# 4. Verify setup
npm run verify-setup

# 5. Run application
npm run dev
```

---

## Using in Components

### Get Current User ID (Most Important!)

```typescript
import { useUserId } from '../contexts/SessionContext';

const MyComponent = () => {
  const userId = useUserId();  // ALWAYS use this
  
  // Now use userId in queries
  const tests = await fetchUserTests(userId);
};
```

### Check if User is Authenticated

```typescript
import { useSession } from '../contexts/SessionContext';

const MyComponent = () => {
  const { isAuthenticated, user, login, logout } = useSession();
  
  return isAuthenticated() ? <Dashboard /> : <LoginPage />;
};
```

### Fetch User's Tests

```typescript
import { fetchUserTests } from '../services/isolatedDataService';
import { useUserId } from '../contexts/SessionContext';

const userId = useUserId();
const tests = await fetchUserTests(userId);
// Only returns this user's tests
```

### Fetch Results for a Test

```typescript
import { fetchTestResults } from '../services/isolatedDataService';
import { useUserId } from '../contexts/SessionContext';

const userId = useUserId();
const results = await fetchTestResults(testId, userId);
// Only returns results from this user's tests
```

### Create a Test

```typescript
import { createUserTest } from '../services/isolatedDataService';
import { useUserId } from '../contexts/SessionContext';

const userId = useUserId();
const test = await createUserTest({
  id: 'test-1',
  name: 'My Test',
  type: 'QDA',
  status: 'active',
  config: { ... }
}, userId);
```

### Submit a Result

```typescript
import { submitTestResult } from '../services/isolatedDataService';
import { useUserId } from '../contexts/SessionContext';

const userId = useUserId();
const result = await submitTestResult({
  testId: 'test-1',
  testUserId: 'uuid-111',  // Test owner
  judgeName: 'John',
  submittedAt: new Date().toISOString(),
  // ... other result data
}, userId);
```

---

## Common Patterns

### Protected Component

```typescript
import { ProtectedRoute } from './ProtectedRoute';

<ProtectedRoute>
  <AdminDashboard />
</ProtectedRoute>
```

### Login/Register

```typescript
import { useSession } from './contexts/SessionContext';

const MyComponent = () => {
  const { login, register, logout } = useSession();
  
  // Login
  await login('user@example.com', 'password');
  
  // Register
  await register('user@example.com', 'password');
  
  // Logout
  await logout();
};
```

### Error Handling

```typescript
import { createSecureErrorMessage } from '../utils/securityUtils';

try {
  const tests = await fetchUserTests(userId);
} catch (error) {
  const message = createSecureErrorMessage(error);
  console.error(message);
}
```

### Rate Limiting

```typescript
import { checkRateLimit } from '../utils/securityUtils';

const { allowed, remaining } = checkRateLimit('login:' + email, 5, 60000);
if (!allowed) {
  throw new Error('Too many login attempts. Try again in 1 minute.');
}
```

---

## Database Queries

### Get All User's Tests

```typescript
const userId = useUserId();
const tests = await fetchUserTests(userId);
```

### Get Specific Test (Owned by User)

```typescript
const userId = useUserId();
const test = await fetchUserTest(testId, userId);
// Returns null if user doesn't own test
```

### Get Results from User's Test

```typescript
const userId = useUserId();
const results = await fetchTestResults(testId, userId);
// Only returns if user owns the test
```

### Get User's Submissions

```typescript
const userId = useUserId();
const submissions = await fetchUserSubmittedResults(userId);
// Returns only results submitted by this user
```

---

## Security Checklist

When adding new features:

- [ ] Does it require `userId`? If yes, add it to the function
- [ ] Does it query data? If yes, filter by `userId`
- [ ] Does it modify data? If yes, validate ownership first
- [ ] Does it handle errors? If yes, use `createSecureErrorMessage`
- [ ] Does it interact with auth? If yes, check `validateSession`
- [ ] Could it leak user data? If yes, add sanitization

---

## Troubleshooting

### "User context required"
**Fix**: Make sure you're inside SessionProvider
```typescript
// In App.tsx
<SessionProvider>
  <YourApp />
</SessionProvider>
```

### "Cannot read useUserId outside of SessionProvider"
**Fix**: Same as above - SessionProvider must wrap component

### "Test not found or access denied"
**Fix**: User doesn't own the test or userId is wrong
```typescript
// Debug
const userId = useUserId();
console.log('userId:', userId);
const test = await fetchUserTest(testId, userId);
console.log('test:', test);  // Should be test or null
```

### RLS returns empty results
**Fix**: RLS policies not enabled in database
```sql
-- Check RLS is enabled
SELECT tablename, rowsecurity FROM pg_tables 
WHERE tablename = 'sensory_tests';
-- Should show: rowsecurity = true

-- If false, enable it:
ALTER TABLE sensory_tests ENABLE ROW LEVEL SECURITY;
```

### "Chiavi Supabase mancanti"
**Fix**: .env.local not configured properly
```bash
cp .env.local.example .env.local
# Edit with real Supabase credentials
npm run dev
```

---

## Session Management

### Get Current Session
```typescript
import { getCurrentSession } from '../services/authService';

const session = getCurrentSession();
console.log(session?.userId);  // User ID
console.log(session?.expiresAt);  // Expiry time
```

### Validate Session
```typescript
import { validateSession } from '../services/authService';

if (!validateSession()) {
  // Session invalid - redirect to login
}
```

### Refresh Session
```typescript
import { refreshAuthSession } from '../services/authService';

const newSession = await refreshAuthSession();
// Returns new session or null if refresh failed
```

---

## Testing Commands

```bash
# Verify all components in place
npm run verify-setup

# Build for production
npm run build

# Check for lint errors
npm run lint

# Run development server
npm run dev

# Preview production build
npm run preview
```

---

## File Locations

| What | Where |
|------|-------|
| Auth Service | `src/services/authService.ts` |
| Session Context | `src/contexts/SessionContext.tsx` |
| Data Service | `src/services/isolatedDataService.ts` |
| Security Utils | `src/utils/securityUtils.ts` |
| Login UI | `src/components/AuthPage.tsx` |
| Protected Routes | `src/components/ProtectedRoute.tsx` |
| Types | `src/types.ts` |
| Database Schema | `database-schema.sql` |
| Setup Guide | `IMPLEMENTATION_GUIDE.md` |
| Deploy Guide | `DEPLOYMENT_GUIDE.md` |

---

## Key Hooks

```typescript
// Get current user
const user = useUser();

// Get current user ID (use this most!)
const userId = useUserId();

// Check if authenticated
const isAuth = useIsAuthenticated();

// Get session context
const { login, register, logout, isAuthenticated } = useSession();
```

---

## Deployment

### Vercel
```bash
# Environment variables in Vercel Dashboard
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...

# Deploy
git push origin main
```

### Netlify
```bash
# Connect GitHub repo to netlify.com
# Set environment variables in dashboard
# Auto-deploys on git push
```

### Local Docker
```bash
docker build -t sensory-lab .
docker run -d -p 80:80 \
  -e VITE_SUPABASE_URL=... \
  -e VITE_SUPABASE_ANON_KEY=... \
  sensory-lab
```

---

## Documentation

- **Full Setup**: `IMPLEMENTATION_GUIDE.md` (2000+ lines)
- **Production Deploy**: `DEPLOYMENT_GUIDE.md`
- **Features Overview**: `README_MULTI_USER.md`
- **Summary**: `IMPLEMENTATION_SUMMARY.md`
- **This Guide**: `QUICK_REFERENCE.md`

---

## Critical Security Rules

1. **ALWAYS use `useUserId()`** - Never hardcode or guess user IDs
2. **ALWAYS filter by `userId`** - No query should work without user context
3. **ALWAYS validate ownership** - Before returning any data
4. **NEVER trust frontend** - Backend (RLS) enforces isolation
5. **NEVER commit `.env.local`** - Keep secrets safe
6. **ALWAYS use HTTPS** - In production only
7. **ALWAYS sanitize errors** - Don't leak internal details

---

## Data Isolation Guarantee

No matter what:
- User A cannot see User B's tests
- User A cannot see User B's results
- User A cannot modify User B's data
- User B cannot even detect User A exists

This is enforced by:
1. SessionContext (validates user)
2. Isolated Data Service (filters queries)
3. Database RLS (enforces access)

All three must be bypassed to break isolation. At least one will catch any attempt.

---

## Quick Links

- Supabase Docs: https://supabase.com/docs
- RLS Guide: https://supabase.com/docs/guides/auth/row-level-security
- React Context: https://react.dev/reference/react/useContext
- This Repository: Check git history for implementation details

---

**KEEP THIS HANDY WHILE DEVELOPING** ✅
