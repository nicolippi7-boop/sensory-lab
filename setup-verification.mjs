/**
 * ============================================================================
 * Quick Start Setup Verification Script
 * ============================================================================
 * 
 * This script verifies that the multi-user isolation system is properly configured.
 * Run this to check all components are in place before deploying.
 * 
 * USAGE:
 * 1. In VS Code terminal, run: node setup-verification.mjs
 * 2. Script will check all required files and configurations
 * 3. Follow any instructions to complete setup
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkFile(filePath, description) {
  if (fs.existsSync(filePath)) {
    log(`✓ ${description}`, 'green');
    return true;
  } else {
    log(`✗ MISSING: ${description}`, 'red');
    log(`  Path: ${filePath}`, 'yellow');
    return false;
  }
}

function checkEnvVariables() {
  const envFile = path.join(__dirname, '.env.local');
  
  if (!fs.existsSync(envFile)) {
    log('\n✗ MISSING: .env.local file', 'red');
    log('  Create this file from .env.local.example', 'yellow');
    return false;
  }

  const envContent = fs.readFileSync(envFile, 'utf-8');
  const requiredVars = [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
  ];

  let allPresent = true;
  requiredVars.forEach(varName => {
    if (envContent.includes(varName) && !envContent.includes(`${varName}=your-`)) {
      log(`✓ ${varName} is configured`, 'green');
    } else {
      log(`✗ ${varName} is not properly configured`, 'red');
      allPresent = false;
    }
  });

  return allPresent;
}

// Main verification
function runVerification() {
  log('\n' + '='.repeat(70), 'blue');
  log('MULTI-USER ISOLATION SYSTEM - SETUP VERIFICATION', 'blue');
  log('='.repeat(70) + '\n', 'blue');

  let allChecked = true;

  // Check authentication files
  log('📁 Checking Authentication Files:', 'blue');
  allChecked &= checkFile(
    path.join(__dirname, 'src/contexts/SessionContext.tsx'),
    'SessionContext (session management)'
  );
  allChecked &= checkFile(
    path.join(__dirname, 'src/services/authService.ts'),
    'authService (authentication)'
  );
  allChecked &= checkFile(
    path.join(__dirname, 'src/components/AuthPage.tsx'),
    'AuthPage (login/register UI)'
  );
  allChecked &= checkFile(
    path.join(__dirname, 'src/components/ProtectedRoute.tsx'),
    'ProtectedRoute (access control)'
  );

  // Check data isolation files
  log('\n📁 Checking Data Isolation Files:', 'blue');
  allChecked &= checkFile(
    path.join(__dirname, 'src/services/isolatedDataService.ts'),
    'isolatedDataService (user-scoped queries)'
  );

  // Check configuration files
  log('\n⚙️  Checking Configuration Files:', 'blue');
  allChecked &= checkFile(
    path.join(__dirname, 'database-schema.sql'),
    'database-schema.sql (RLS policies)'
  );
  allChecked &= checkFile(
    path.join(__dirname, '.env.local.example'),
    '.env.local.example (env template)'
  );
  allChecked &= checkFile(
    path.join(__dirname, 'IMPLEMENTATION_GUIDE.md'),
    'IMPLEMENTATION_GUIDE.md (documentation)'
  );

  // Check environment variables
  log('\n🔐 Checking Environment Variables:', 'blue');
  const envOk = checkEnvVariables();
  allChecked &= envOk;

  // Check types
  log('\n📝 Checking Type Definitions:', 'blue');
  const typesFile = path.join(__dirname, 'src/types.ts');
  const typesContent = fs.readFileSync(typesFile, 'utf-8');
  
  if (typesContent.includes('interface AuthUser') &&
      typesContent.includes('interface Session') &&
      typesContent.includes('userId')) {
    log('✓ Types include user context (AuthUser, Session, userId)', 'green');
  } else {
    log('✗ Types missing user context definitions', 'red');
    allChecked = false;
  }

  // Summary
  log('\n' + '='.repeat(70), 'blue');
  if (allChecked) {
    log('✓ ALL CHECKS PASSED - System is ready!', 'green');
    log('\n📚 Next Steps:', 'blue');
    log('1. Ensure Supabase project is created (https://supabase.com)', 'yellow');
    log('2. Load database-schema.sql into Supabase SQL Editor', 'yellow');
    log('3. Update .env.local with your Supabase credentials', 'yellow');
    log('4. Run: npm run dev', 'yellow');
    log('5. Test login/register to verify authentication works', 'yellow');
  } else {
    log('✗ SOME CHECKS FAILED - Review errors above', 'red');
    log('\n📚 See IMPLEMENTATION_GUIDE.md for detailed setup instructions', 'blue');
  }
  log('='.repeat(70) + '\n', 'blue');

  return allChecked ? 0 : 1;
}

// Run verification
process.exit(runVerification());
