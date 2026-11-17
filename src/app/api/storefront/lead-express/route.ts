import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateLeadExpressPayload } from '@/lib/storefront/storefrontContracts';

export const dynamic = 'force-dynamic';

function getServiceSupabase() {
  const sanitize = (val?: string) => (val || '').trim().replace(/^["']|["']$/g, '');
  const supabaseUrl = sanitize(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceKey = sanitize(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Credenciales de servidor de Supabase no configuradas.');
  }
  return createClient(supabaseUrl, serviceKey);
}

export async function POST(request: Request) {
  try {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ error: 'Formato JSON inválido.' }, { status: 400 });
    }

    const validation = validateLeadExpressPayload(rawBody);
    if (!validation.ok) {
      return NextResponse.json({ error: (validation as { error?: string }).error || 'Solicitud inválida.' }, { status: 400 });
    }

    const input = validation.data;
    const supabase = getServiceSupabase();

    const formattedNotes = `[SOURCE:${input.channel}][SEG:${input.segment}]${input.notes ? ` ${input.notes}` : ''}`;

    const { data: leadRow, error: insertError } = await supabase
      .from('leads')
      .insert([
        {
          company_name: input.company_name,
          nit: input.nit,
          contact_name: input.contact_name,
          phone: input.phone,
          email: input.email,
          business_type: input.business_type,
          business_size: input.business_size,
          address: input.address,
          municipality: input.municipality,
          status: 'new',
          notes: formattedNotes,
        },
      ])
      .select('id')
      .single();

    if (insertError || !leadRow) {
      console.error('Lead express insert error:', insertError);
      return NextResponse.json(
        { error: 'No se pudo guardar tu solicitud en este momento.' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        leadId: String(leadRow.id),
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno del servidor';
    console.error('API lead-express error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
