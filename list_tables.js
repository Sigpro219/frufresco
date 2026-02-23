const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://kuxnixwoacwsotcilhuz.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1eG5peHdvYWN3c290Y2lsaHV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1OTg1NzIsImV4cCI6MjA4NDE3NDU3Mn0.ueMkLMfFTze3EeAokrgsmmwL--_S5Vgj2pcyaJq8hOo'
);

async function check() {
  const { data, error } = await supabase.rpc('get_tables'); // If get_tables exists
  if (error) {
    // If no RPC, try information_schema via a trick or just guess.
    // Usually we don't have access to information_schema via PostgREST unless exposed.
    console.log('RPC get_tables failed. Trying common names...');
  } else {
    console.log('Tables:', data);
  }
}
check();
