import { createClient } from '@supabase/supabase-js';

// In Vite si usa import.meta.env e non process.env
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Protezione: se le chiavi mancano, il client non viene inizializzato male
if (!supabaseUrl || !supabaseKey) {
  console.warn("Attenzione: Chiavi Supabase mancanti! Controlla le Environment Variables su Vercel.");
}

export const supabase = createClient(supabaseUrl, supabaseKey);