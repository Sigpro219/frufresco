const { createClient } = require('C:\\Users\\German Higuera\\OneDrive\\Documentos\\Projects\\frufresco\\node_modules\\@supabase\\supabase-js');
const fs = require('fs');

const envContent = fs.readFileSync('C:\\Users\\German Higuera\\OneDrive\\Documentos\\Projects\\frufresco\\.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim().replace(/(^"|"$)/g, '');
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  try {
    console.log("Fetching all active collaborators...");
    const { data: collaborators, error: cError } = await supabase
      .from('collaborators')
      .select('*')
      .eq('is_active', true);
    
    if (cError) throw cError;
    console.log(`Found ${collaborators.length} active collaborators.`);

    console.log("Fetching existing profiles...");
    const { data: profiles, error: pError } = await supabase
      .from('profiles')
      .select('*');
    
    if (pError) throw pError;
    console.log(`Found ${profiles.length} existing profiles.`);

    let createdCount = 0;
    let linkedCount = 0;

    for (const collab of collaborators) {
      // Check if collaborator already has a linked profile
      const existingProfile = profiles.find(p => p.collaborator_id === collab.id);
      if (existingProfile) {
        console.log(`✅ ${collab.contact_name} already has a linked profile.`);
        continue;
      }

      // Check if there is a profile with the same email
      const emailProfile = collab.email ? profiles.find(p => p.email === collab.email || p.contact_name === collab.contact_name) : null;
      if (emailProfile) {
        console.log(`🔗 Linking existing profile ${emailProfile.id} to collaborator ${collab.contact_name}`);
        const { error: linkErr } = await supabase
          .from('profiles')
          .update({ collaborator_id: collab.id, contact_name: collab.contact_name })
          .eq('id', emailProfile.id);
        
        if (linkErr) console.error("Link error:", linkErr);
        else linkedCount++;
        continue;
      }

      // Create new auth user and profile
      const email = collab.email || `collab_${collab.id.substring(0, 8)}@frufresco.com`;
      const tempPassword = 'FruFrescoTempPassword123!';

      console.log(`🚀 Creating user/profile for ${collab.contact_name} (${email})`);

      const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
        email: email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { contact_name: collab.contact_name }
      });

      if (authError) {
        console.error(`Error creating auth user for ${collab.contact_name}:`, authError.message);
        continue;
      }

      const newProfile = {
        id: authUser.user.id,
        contact_name: collab.contact_name,
        role: 'administrativo', // default fallback role
        is_active: true,
        collaborator_id: collab.id
      };

      const { error: insertError } = await supabase
        .from('profiles')
        .upsert([newProfile]);
      
      if (insertError) {
        console.error(`Error inserting profile for ${collab.contact_name}:`, insertError.message);
      } else {
        createdCount++;
      }
    }

    console.log(`\n--- SYNC COMPLETED ---`);
    console.log(`Profiles newly created: ${createdCount}`);
    console.log(`Profiles linked: ${linkedCount}`);
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
