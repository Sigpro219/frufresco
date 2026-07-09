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
    console.log("Fetching collaborators...");
    const { data: collaborators, error: cError } = await supabase
      .from('collaborators')
      .select('id, contact_name, login_requested');
    
    if (cError) throw cError;

    console.log("Fetching profiles...");
    const { data: profiles, error: pError } = await supabase
      .from('profiles')
      .select('id, contact_name, collaborator_id');

    if (pError) throw pError;

    console.log(`Found ${collaborators.length} collaborators and ${profiles.length} profiles.`);

    let deletedCount = 0;

    for (const profile of profiles) {
      if (!profile.collaborator_id) {
        console.log(`Skipping profile ${profile.contact_name} because it has no linked collaborator_id.`);
        continue;
      }

      const collab = collaborators.find(c => c.id === profile.collaborator_id);
      
      // If the collaborator exists and has login_requested = false, it is a dummy profile we should delete!
      if (collab && !collab.login_requested) {
        console.log(`❌ Deleting dummy profile for "${profile.contact_name}" (ID: ${profile.id}, Collab ID: ${profile.collaborator_id})...`);
        
        // 1. Delete from Supabase Auth
        const { error: authError } = await supabase.auth.admin.deleteUser(profile.id);
        if (authError) {
          console.error(`Error deleting auth user for ${profile.contact_name}:`, authError.message);
        } else {
          console.log(`   Auth user deleted.`);
        }

        // 2. Delete from profiles table
        const { error: dbError } = await supabase
          .from('profiles')
          .delete()
          .eq('id', profile.id);
        
        if (dbError) {
          console.error(`Error deleting profile for ${profile.contact_name}:`, dbError.message);
        } else {
          console.log(`   Profile record deleted.`);
          deletedCount++;
        }
      }
    }

    console.log(`\n--- DELETION COMPLETED ---`);
    console.log(`Deleted ${deletedCount} dummy profiles.`);
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
