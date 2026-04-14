
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
const envPath = path.resolve(process.cwd(), '.env.local');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

const supabaseUrl = envConfig.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = envConfig.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function backup() {
  console.log('--- Starting Data Backup (with pagination) ---');
  
  const tables = ['products', 'app_settings', 'product_conversions'];
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(process.cwd(), 'backups', timestamp);
  
  if (!fs.existsSync(path.join(process.cwd(), 'backups'))) {
    fs.mkdirSync(path.join(process.cwd(), 'backups'));
  }
  fs.mkdirSync(backupDir);

  for (const table of tables) {
    console.log(`Backing up table: ${table}...`);
    let allData = [];
    let from = 0;
    const limit = 1000;
    let done = false;

    while (!done) {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .range(from, from + limit - 1);
      
      if (error) {
        console.error(`Error backing up ${table}:`, error.message);
        done = true;
      } else {
        allData = allData.concat(data);
        if (data.length < limit) {
          done = true;
        } else {
          from += limit;
        }
      }
    }

    if (allData.length > 0) {
      const filePath = path.join(backupDir, `${table}.json`);
      fs.writeFileSync(filePath, JSON.stringify(allData, null, 2));
      console.log(`Saved ${allData.length} rows to ${table}.json`);
    }
  }
  
  console.log(`--- Backup completed in ${backupDir} ---`);
}

backup();
