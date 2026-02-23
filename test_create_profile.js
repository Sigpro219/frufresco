
const { createClient } = require('@supabase/supabase-js');

// Configuración manual
const supabaseUrl = 'https://kuxnixwoacwsotcilhuz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1eG5peHdvYWN3c290Y2lsaHV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1OTg1NzIsImV4cCI6MjA4NDE3NDU3Mn0.ueMkLMfFTze3EeAokrgsmmwL--_S5Vgj2pcyaJq8hOo';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testCreateProfile() {
  console.log('Testing profile creation...');
  
  const randomPhone = Math.floor(Math.random() * 1000000000).toString();
  
  const { data, error } = await supabase
    .from('profiles')
    .insert([
      {
        role: 'b2c_client',
        contact_name: 'Test Agentic Buyer',
        contact_phone: randomPhone,
        address: 'Calle Falsa 123',
        city: 'Bogotá',
        email: `test${randomPhone}@example.com` // Fake email
      }
    ])
    .select();

  if (error) {
    console.error('Error creating profile:', error);
  } else {
    console.log('Profile created successfully:', data);
  }
}

testCreateProfile();
