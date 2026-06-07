import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  try {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    const { newAliases } = await request.json(); // { "fresa": "UUID-123" }
    
    if (!newAliases || Object.keys(newAliases).length === 0) {
      return NextResponse.json({ success: true, message: 'No new aliases' });
    }

    // Read existing
    const { data: existingData, error: readError } = await supabaseAdmin
      .from('app_settings')
      .select('value')
      .eq('key', 'ai_product_aliases')
      .single();

    let mergedAliases = {};
    if (!readError && existingData?.value) {
      try {
        mergedAliases = typeof existingData.value === 'string' ? JSON.parse(existingData.value) : existingData.value;
      } catch (e) {}
    }

    // Merge
    mergedAliases = { ...mergedAliases, ...newAliases };

    // Upsert
    const { error: upsertError } = await supabaseAdmin
      .from('app_settings')
      .upsert({ 
        key: 'ai_product_aliases', 
        value: JSON.stringify(mergedAliases)
      });

    if (upsertError) throw upsertError;

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Error updating aliases:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
