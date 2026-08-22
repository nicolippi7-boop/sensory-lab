import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envPath = new URL('../.env.local', import.meta.url).pathname;
const envRaw = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

const parseEnv = (raw, key) => {
  const m = raw.split(/\r?\n/).find(l => l.startsWith(key + '='));
  return m ? m.split('=')[1].trim() : '';
};

const SUPABASE_URL = parseEnv(envRaw, 'VITE_SUPABASE_URL');
const SUPABASE_KEY = parseEnv(envRaw, 'VITE_SUPABASE_ANON_KEY');

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase URL or anon key in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error('Usage: node scripts/create_admin.mjs <email> <password>');
  process.exit(1);
}

(async () => {
  try {
    console.log(`Registering user ${email}...`);
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      console.error('SignUp error:', error.message || error);
      process.exit(1);
    }

    console.log('SignUp response:', JSON.stringify(data, null, 2));
    console.log('If email confirmation is enabled, check your inbox to confirm the account.');
  } catch (err) {
    console.error('Unexpected error:', err);
    process.exit(1);
  }
})();
