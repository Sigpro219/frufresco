const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://csqurhdykbalvlnpowcz.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzcXVyaGR5a2JhbHZsbnBvd2N6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY3Njk2MSwiZXhwIjoyMDg4MjUyOTYxfQ.6lAdV9TeZvrc6nMs7VCMxnZiTWeewMsFtZn84-kJ_5E';

const supabase = createClient(supabaseUrl, supabaseKey);

// Read SQL file
const sqlPath = path.join(__dirname, '../supabase/migrations/20260712_add_columns_to_leads.sql');
if (!fs.existsSync(sqlPath)) {
    console.error("Migration file not found at:", sqlPath);
    process.exit(1);
}
const sql = fs.readFileSync(sqlPath, 'utf8');

async function run() {
    console.log('Attempting to execute SQL migration using admin_execute_sql...');
    let { data, error } = await supabase.rpc('admin_execute_sql', { sql_query: sql });
    
    if (error) {
        console.log('admin_execute_sql failed, trying execute_sql_query...', error.message);
        const res = await supabase.rpc('execute_sql_query', { sql: sql });
        data = res.data;
        error = res.error;
    }
    
    if (error) {
        console.log('execute_sql_query failed, trying execute_sql...', error.message);
        const res = await supabase.rpc('execute_sql', { sql_query: sql });
        data = res.data;
        error = res.error;
    }

    if (error) {
        console.error('❌ Failed to run migration via RPC:', error);
    } else {
        console.log('✅ Migration succeeded via RPC! nit, address, and municipality columns added to leads table.', data);
    }
}

run();
