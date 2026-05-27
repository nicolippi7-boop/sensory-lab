/**
 * ============================================================================
 * DEPRECATED - Use authService instead
 * ============================================================================
 * 
 * This file is kept for backward compatibility.
 * All Supabase operations should use the isolated data service:
 * 
 * Import from: src/services/authService.ts
 * Use: authenticateUser(), fetchUserTests(), etc.
 * 
 * This ensures all queries include user context and enforce data isolation.
 */

import { supabase } from '../services/authService';

export { supabase };