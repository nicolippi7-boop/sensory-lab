import { createClient } from '@supabase/supabase-js';

// Queste righe leggono i dati in modo sicuro dal file .env.local (in locale) 
// o dai "Settings" di Vercel (online).
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Mancano le chiavi di Supabase! Controlla il file .env o le impostazioni di Vercel.");
}

export const supabase = createClient(supabaseUrl, supabaseKey);