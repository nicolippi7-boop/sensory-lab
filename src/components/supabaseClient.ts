import { createClient } from '@supabase/supabase-js';

// Sostituisci con i tuoi dati che trovi in Supabase -> Settings -> API
const supabaseUrl = 'https://TUO_PROGETTO.supabase.co';
const supabaseKey = 'LA_TUA_CHIAVE_ANON_PUBLIC';

export const supabase = createClient(supabaseUrl, supabaseKey);