const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://kuxnixwoacwsotcilhuz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1eG5peHdvYWN3c290Y2lsaHV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1OTg1NzIsImV4cCI6MjA4NDE3NDU3Mn0.ueMkLMfFTze3EeAokrgsmmwL--_S5Vgj2pcyaJq8hOo';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
    try {
        const { data, error } = await supabase.from('test_table_check').select('*').limit(1);
        // Even if the table doesn't exist, a 404 or specific error means we connected to the instance.
        // A connection error would be different.
        if (error && error.code === 'PGRST116') {
            // Table not found means we connected!
            console.log('Connection Successful: Instance reachable (Table not found, which is expected)');
        } else if (error && error.code === '42P01') {
            console.log('Connection Successful: Instance reachable (Table "test_table_check" does not exist)');
        } else if (error) {
            // If it's a 404 on the API route or similar, it might still mean connection is 'ok' but empty.
            // Let's print the error to be sure.
            console.log('Connection Test Result:', error.message);
        } else {
            console.log('Connection Successful: Data retrieved');
        }
    } catch (err) {
        console.error('Connection Failed:', err.message);
    }
}

testConnection();
