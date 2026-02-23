const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

async function testSearch(term) {
    console.log(`Testing search for: ${term}`);
    
    // Test 1: Simple ILIKE
    console.log("\n--- Test 1: Simple ILIKE on name ---");
    const test1 = await supabase.from('products').select('id, name').ilike('name', `%${term}%`).limit(1);
    if (test1.error) console.log("Test 1 ERROR:", test1.error.message);
    else console.log("Test 1 SUCCESS:", test1.data.length, "items");

    // Test 2: OR filter with current syntax (quotes)
    console.log("\n--- Test 2: OR with double quotes ---");
    const test2 = await supabase.from('products').select('id, name')
        .or(`name.ilike."%${term}%",sku.ilike."%${term}%"`)
        .limit(1);
    if (test2.error) console.log("Test 2 ERROR:", test2.error.message);
    else console.log("Test 2 SUCCESS:", test2.data.length, "items");

    // Test 3: OR filter without double quotes
    console.log("\n--- Test 3: OR WITHOUT double quotes ---");
    const test3 = await supabase.from('products').select('id, name')
        .or(`name.ilike.%${term}%,sku.ilike.%${term}%`)
        .limit(1);
    if (test3.error) console.log("Test 3 ERROR:", test3.error.message);
    else console.log("Test 3 SUCCESS:", test3.data.length, "items");
}

testSearch("Papa");
