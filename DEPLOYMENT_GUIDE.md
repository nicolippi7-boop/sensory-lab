# Production Deployment Guide

## Deploying the Multi-User Sensory Lab System

This guide covers deployment to production with proper security, scalability, and data isolation enforcement.

---

## Pre-Deployment Checklist

### Security

- [ ] All environment variables configured (not in code)
- [ ] HTTPS enabled on all endpoints
- [ ] RLS policies verified on all database tables
- [ ] Supabase Auth configured and tested
- [ ] Rate limiting configured
- [ ] CORS properly configured
- [ ] CSP headers set
- [ ] Secrets rotated and validated

### Testing

- [ ] All tests passing: `npm run build` succeeds
- [ ] Concurrent users tested (2+ simultaneous sessions)
- [ ] Data isolation verified (User A cannot see User B's data)
- [ ] Session expiry handling tested
- [ ] Error messages tested (no sensitive data leaked)
- [ ] Auth flow tested end-to-end
- [ ] Logout clears all session data

### Database

- [ ] Schema loaded: `database-schema.sql` executed
- [ ] RLS enabled on all tables
- [ ] Indexes created for query performance
- [ ] Backups configured and tested
- [ ] Connection limits set
- [ ] Query logging enabled for auditing

### Infrastructure

- [ ] CDN configured (if using Vercel, Netlify, etc.)
- [ ] Environment variables set in platform
- [ ] Auto-scaling configured (if needed)
- [ ] Monitoring and alerts set up
- [ ] Error tracking configured (Sentry, etc.)
- [ ] Performance monitoring enabled

---

## Deployment to Vercel

### Step 1: Prepare Repository

```bash
# Ensure .env.local is in .gitignore (NEVER commit secrets)
echo ".env.local" >> .gitignore

# Ensure build works
npm run build

# Push to GitHub
git add .
git commit -m "Add multi-user isolation system"
git push origin main
```

### Step 2: Connect to Vercel

1. Go to [vercel.com](https://vercel.com)
2. Click "New Project"
3. Import your GitHub repository
4. Configure build settings:
   - **Framework**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`

### Step 3: Set Environment Variables

In Vercel Dashboard, go to Settings > Environment Variables:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_GOOGLE_GENERATIVE_AI_KEY=your-gemini-key-here
```

**CRITICAL**: Do NOT include these in code or `.env.local`

### Step 4: Deploy

```bash
# Vercel auto-deploys on git push
git push origin main
# Check https://your-project.vercel.app

# Or deploy manually
vercel deploy --prod
```

### Step 5: Verify Production

1. Visit production URL
2. Create account
3. Create a test
4. Open different browser/incognito
5. Create different account
6. Verify cannot see first user's test
7. Verify session works correctly

---

## Deployment to Netlify

### Step 1: Configure Build Settings

Create `netlify.toml`:

```toml
[build]
  command = "npm run build"
  publish = "dist"

[build.environment]
  NODE_VERSION = "18"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[[headers]]
  for = "/*"
  [headers.values]
    X-Content-Type-Options = "nosniff"
    X-Frame-Options = "SAMEORIGIN"
    X-XSS-Protection = "1; mode=block"
    Content-Security-Policy = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co"
```

### Step 2: Connect to Netlify

1. Go to [netlify.com](https://netlify.com)
2. Click "Add new site" > "Import an existing project"
3. Select GitHub repository
4. Netlify auto-detects configuration

### Step 3: Set Environment Variables

1. Go to Site settings > Build & deploy > Environment
2. Add variables:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_GOOGLE_GENERATIVE_AI_KEY=your-gemini-key-here
```

### Step 4: Deploy

```bash
# Automatic deployment on git push
# Or use Netlify CLI
netlify deploy --prod
```

---

## Deployment to Self-Hosted (VPS/Docker)

### Step 1: Build Application

```bash
# Build for production
npm run build

# Output goes to dist/ directory
# This is a static SPA - only needs simple HTTP server
```

### Step 2: Docker Setup

Create `Dockerfile`:

```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

Create `nginx.conf`:

```nginx
events {
  worker_connections 1024;
}

http {
  include /etc/nginx/mime.types;
  default_type application/octet-stream;

  sendfile on;
  keepalive_timeout 65;

  # Gzip compression
  gzip on;
  gzip_types text/plain text/css text/javascript application/json;

  # Security headers
  add_header X-Content-Type-Options "nosniff" always;
  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header X-XSS-Protection "1; mode=block" always;
  add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co" always;

  server {
    listen 80;
    server_name _;

    # Redirect HTTP to HTTPS (if behind reverse proxy with HTTPS)
    # Uncomment if using SSL/TLS
    # if ($http_x_forwarded_proto != "https") {
    #   return 301 https://$server_name$request_uri;
    # }

    location / {
      root /usr/share/nginx/html;
      index index.html index.htm;
      try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
      expires 30d;
      add_header Cache-Control "public, immutable";
    }
  }
}
```

### Step 3: Deploy with Docker

```bash
# Build image
docker build -t sensory-lab:latest .

# Run container
docker run -d \
  -p 80:80 \
  -e VITE_SUPABASE_URL=https://your-project.supabase.co \
  -e VITE_SUPABASE_ANON_KEY=your-key \
  --name sensory-lab \
  sensory-lab:latest

# Verify
curl http://localhost
```

### Step 4: Setup Reverse Proxy (HTTPS)

Use Caddy (easiest) or Nginx:

**Caddy (Recommended):**

```caddy
sensory-lab.example.com {
  reverse_proxy localhost:80
  encode gzip
}
```

---

## Post-Deployment

### 1. Verify Data Isolation

```bash
# User A logs in and creates test
curl -X POST https://your-app.com/api/tests \
  -H "Authorization: Bearer USER_A_TOKEN" \
  -d '{"name":"Test A"}'

# User B tries to access User A's test
curl https://your-app.com/api/tests/USER_A_TEST_ID \
  -H "Authorization: Bearer USER_B_TOKEN"
# Should return: 403 Forbidden or empty

# User A can access their own test
curl https://your-app.com/api/tests/USER_A_TEST_ID \
  -H "Authorization: Bearer USER_A_TOKEN"
# Should return: Test data
```

### 2. Load Testing

```bash
# Install Apache Bench or use Artillery
npm install -g artillery

# Create load-test.yml
# endpoints: 100 concurrent users
# rampUp: 60 seconds
artillery run load-test.yml
```

Expected results:
- No data leakage between users
- Response time < 200ms
- 0% error rate
- All sessions remain isolated

### 3. Monitor RLS Enforcement

In Supabase Dashboard > SQL Editor:

```sql
-- Monitor query performance
SELECT * FROM pg_stat_statements
ORDER BY total_time DESC
LIMIT 10;

-- Check for failed RLS policy violations
SELECT * FROM pg_audit_log
WHERE polname LIKE '%sensory%'
ORDER BY timestamp DESC;

-- Monitor user sessions
SELECT * FROM session_logs
ORDER BY createdAt DESC
LIMIT 50;
```

### 4. Setup Monitoring & Alerts

**Supabase Built-in:**
- Go to Dashboard > Reports > Query Performance
- Monitor row counts and response times
- Alert on slow queries

**Third-party Services:**

Use Sentry for error tracking:

```typescript
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: "https://your-sentry-dsn@sentry.io/project",
  environment: "production",
  tracesSampleRate: 0.1
});
```

### 5. Enable Backups

In Supabase Dashboard > Settings > Database:

1. Enable Daily Backups
2. Set retention to 30 days
3. Enable Point-in-time Recovery
4. Test restore procedure

---

## Performance Optimization

### 1. Database Indexes

Verify indexes exist:

```sql
SELECT tablename, indexname 
FROM pg_indexes 
WHERE schemaname = 'public';
```

Should include:
- `idx_sensory_tests_userId`
- `idx_sensory_tests_status`
- `idx_judge_results_testId`
- `idx_judge_results_userId`
- `idx_judge_results_testUserId`

### 2. RLS Performance

RLS adds minimal overhead (typically <1ms) but check:

```sql
-- Slow query analysis
EXPLAIN ANALYZE
SELECT * FROM sensory_tests
WHERE userId = auth.uid()
ORDER BY createdAt DESC;
```

### 3. Connection Pooling

In Supabase Dashboard > Database > Connection Pooling:

- Mode: Transaction
- Pool size: 10

Update connection string in production:

```
postgresql://user:pass@project.pooler.supabase.com:6543/postgres
```

### 4. Caching

Add to nginx/Caddy for static assets:

```nginx
location ~* \.(js|css|woff2)$ {
  expires 30d;
  add_header Cache-Control "public, max-age=2592000, immutable";
}
```

---

## Security Hardening

### 1. HTTPS Only

Ensure all connections are HTTPS:

```nginx
# Redirect HTTP to HTTPS
server {
  listen 80;
  return 301 https://$server_name$request_uri;
}
```

### 2. HSTS Header

Enable HTTP Strict Transport Security:

```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

### 3. Rate Limiting

Configure on Supabase:

```sql
-- Limit auth attempts
CREATE OR REPLACE FUNCTION limit_auth_attempts()
RETURNS TRIGGER AS $$
BEGIN
  -- Limit login attempts to 5 per minute
  -- Implementation depends on specific needs
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### 4. DDoS Protection

Use Cloudflare or similar:

1. Add DNS records to Cloudflare
2. Enable DDoS protection
3. Setup rate limiting rules
4. Configure WAF (Web Application Firewall)

---

## Monitoring Checklist

- [ ] Application errors < 0.1%
- [ ] Response time P95 < 200ms
- [ ] Database connection pool utilization < 70%
- [ ] CPU usage < 70%
- [ ] Memory usage < 80%
- [ ] Disk usage < 70%
- [ ] RLS violations logged and investigated
- [ ] No data leakage detected
- [ ] All user sessions isolated
- [ ] Backups completing successfully

---

## Troubleshooting Production Issues

### Slow Database Queries

```bash
# Check Supabase query performance
# Dashboard > Reports > Query Performance

# Identify slow queries
SELECT query, mean_time 
FROM pg_stat_statements 
WHERE mean_time > 100 
ORDER BY mean_time DESC;
```

### High Error Rate

Check error logs:

```bash
# Vercel
vercel logs [project-name]

# Netlify
netlify api listDeployLogs [site-id]
```

### Session Timeouts

In `authService.ts`, adjust token buffer:

```typescript
const TOKEN_EXPIRY_BUFFER = 2 * 60 * 1000;  // 2 min instead of 5
```

### CORS Errors

Verify Supabase CORS settings:

Supabase Dashboard > Settings > API > CORS:

```
https://your-domain.com
https://www.your-domain.com
```

---

## Scaling Guide

### Vertical Scaling (Larger Instance)

In Supabase > Settings > Database:

1. Compute Size: Select larger
2. Database will reboot (plan downtime)
3. Verify performance after scaling

### Horizontal Scaling (Multiple Servers)

For multi-server deployment:

1. Use managed database (Supabase already is)
2. Deploy multiple app servers
3. Use load balancer (Cloudflare, etc.)
4. Use sticky sessions for authentication

### Caching Layer

Add Redis for frequently accessed data:

```typescript
// Cache user's tests for 5 minutes
const cacheKey = `user:${userId}:tests`;
const cached = await redis.get(cacheKey);

if (cached) {
  return JSON.parse(cached);
}

const tests = await fetchUserTests(userId);
await redis.setex(cacheKey, 300, JSON.stringify(tests));
return tests;
```

---

## Disaster Recovery

### Backup & Restore

In Supabase Dashboard > Backups:

1. Daily automatic backups enabled
2. Retention: 30 days
3. Test restore monthly

Restore from backup:

```bash
# In Supabase Dashboard
# Select backup > Restore

# Verify after restore
npm run verify-setup
```

### Incident Response

If data breach suspected:

```bash
# 1. Rotate Supabase keys immediately
# Supabase > Settings > API > Rotate anon key

# 2. Clear all sessions
supabase.auth.signOutOtherSessions()

# 3. Revoke affected tokens
# (Supabase handles automatically)

# 4. Review logs
SELECT * FROM session_logs 
WHERE createdAt > NOW() - INTERVAL '1 hour'
ORDER BY createdAt DESC;

# 5. Update application
npm run build && deploy
```

---

## Support & Maintenance

- Monitor uptime: UptimeRobot, Pingdom
- Monitor performance: DataDog, New Relic
- Security updates: Dependabot automatic PRs
- Quarterly security audits
- Monthly performance reviews
- Daily log analysis

---

For questions or issues:
- [Supabase Support](https://supabase.com/docs)
- [Deployment Issues](https://github.com/supabase/supabase/issues)
- [Community Forum](https://github.com/supabase/supabase/discussions)
