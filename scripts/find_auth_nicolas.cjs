const fs = require('fs');
const dotenv = require('dotenv');
const env = dotenv.parse(fs.readFileSync('.env.local'));
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function checkAuthUsers() {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) { console.error('Auth error:', error); return; }
  const users = data.users || [];
  console.log('Total auth users:', users.length);
  
  const matched = users.filter(u => {
    const e = (u.email || '').toLowerCase();
    const meta = JSON.stringify(u.user_metadata || {}).toLowerCase();
    return e.includes('nic') || meta.includes('nic');
  });

  console.log('Matched users for "nic":');
  matched.forEach(u => {
    console.log(u.id, u.email, u.user_metadata);
  });

  console.log('\n--- Commercial / Staff users: ---');
  const staff = users.filter(u => {
    const e = (u.email || '').toLowerCase();
    return e.includes('frufresco') || e.includes('comercial') || e.includes('gerencia') || e.includes('admin');
  });
  staff.forEach(u => {
    console.log(u.id, u.email, u.user_metadata);
  });
}
checkAuthUsers();
