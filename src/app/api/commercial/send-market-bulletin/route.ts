import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { 
  generateWeeklyHarvestBulletinHtml, 
  generateWeeklyHarvestBulletinText,
  HarvestOpportunityItem,
  ScarcityAlertItem 
} from '@/lib/emailTemplates';

export async function POST(req: Request) {
  try {
    const supabaseAdmin = createAdminClient();
    const body = await req.json();

    const {
      selectedHarvestItems = [],
      selectedScarcityItems = [],
      selectedClientIds = [],
      weekLabel = 'Semana en Curso',
      notes = '',
      authorName = 'Dirección Comercial',
      authorId = '',
      authorRole = 'commercial_agent'
    }: {
      selectedHarvestItems: HarvestOpportunityItem[];
      selectedScarcityItems: ScarcityAlertItem[];
      selectedClientIds: string[];
      weekLabel: string;
      notes?: string;
      authorName?: string;
      authorId?: string;
      authorRole?: string;
    } = body;

    if (!selectedClientIds || selectedClientIds.length === 0) {
      return NextResponse.json(
        { error: 'Debe seleccionar al menos una cuenta institucional o matriz destinataria.' },
        { status: 400 }
      );
    }

    if (selectedHarvestItems.length === 0 && selectedScarcityItems.length === 0) {
      return NextResponse.json(
        { error: 'Debe incluir al menos un producto en cosecha o una alerta de escasez.' },
        { status: 400 }
      );
    }

    // 1. Fetch Client Profiles
    const { data: clients, error: clientsErr } = await supabaseAdmin
      .from('profiles')
      .select('id, company_name, contact_name, email, additional_billing_emails, is_corporate_parent, parent_id')
      .in('id', selectedClientIds);

    if (clientsErr) {
      console.error('[send-market-bulletin] Error fetching clients:', clientsErr);
      return NextResponse.json({ error: 'Error al consultar perfiles de clientes.' }, { status: 500 });
    }

    if (!clients || clients.length === 0) {
      return NextResponse.json({ error: 'No se encontraron clientes válidos para los IDs especificados.' }, { status: 404 });
    }

    // 2. Prepare mail records
    const mailRecordsToInsert: any[] = [];
    const nowIso = new Date().toISOString();

    for (const client of clients) {
      const clientName = client.company_name || client.contact_name || 'Cliente Institucional';
      const targetEmails = new Set<string>();

      if (client.email && client.email.includes('@')) {
        targetEmails.add(client.email.toLowerCase().trim());
      }

      if (Array.isArray(client.additional_billing_emails)) {
        client.additional_billing_emails.forEach((em: string) => {
          if (em && em.includes('@')) targetEmails.add(em.toLowerCase().trim());
        });
      } else if (typeof client.additional_billing_emails === 'string') {
        client.additional_billing_emails.split(',').forEach((em: string) => {
          const clean = em.trim();
          if (clean && clean.includes('@')) targetEmails.add(clean.toLowerCase());
        });
      }

      if (targetEmails.size === 0) {
        console.warn(`[send-market-bulletin] Client ${client.id} (${clientName}) has no valid emails registered.`);
        continue;
      }

      const emailData = {
        client_name: clientName,
        week_label: weekLabel,
        harvest_items: selectedHarvestItems,
        scarcity_items: selectedScarcityItems,
        responsible_agent: authorName,
        notes: notes
      };

      const htmlContent = generateWeeklyHarvestBulletinHtml(emailData);
      const textContent = generateWeeklyHarvestBulletinText(emailData);
      const subject = `🌾 Boletín Agro-Comercial Semanal • Cosechas & Novedades de Mercado - ${clientName}`;

      for (const toEmail of targetEmails) {
        mailRecordsToInsert.push({
          to_email: toEmail,
          subject: subject,
          inbox_type: 'commercial',
          status: 'pending',
          message: {
            html: htmlContent,
            text: textContent
          },
          template: {
            name: 'weekly_market_bulletin',
            data: emailData
          },
          metadata: {
            triggered_by_user_id: authorId,
            triggered_by_name: authorName,
            triggered_by_role: authorRole,
            source_module: 'weekly_market_bulletin',
            client_id: client.id,
            client_name: clientName,
            week_label: weekLabel,
            harvest_count: selectedHarvestItems.length,
            scarcity_count: selectedScarcityItems.length
          },
          created_at: nowIso,
          next_retry_at: nowIso
        });
      }
    }

    if (mailRecordsToInsert.length === 0) {
      return NextResponse.json({
        error: 'No se encontraron correos electrónicos válidos entre las cuentas seleccionadas.'
      }, { status: 400 });
    }

    // 3. Batch Insert into `mail`
    const { data: insertedMails, error: mailInsertErr } = await supabaseAdmin
      .from('mail')
      .insert(mailRecordsToInsert)
      .select('id');

    if (mailInsertErr) {
      console.error('[send-market-bulletin] Error inserting mails:', mailInsertErr);
      return NextResponse.json({ error: 'Error al encolar correos en la base de datos.' }, { status: 500 });
    }

    // 4. Update Weekly Bulletin Dispatch State in app_settings or audit log
    try {
      const bulletinAuditPayload = {
        dispatched_at: nowIso,
        week_label: weekLabel,
        author_name: authorName,
        author_id: authorId,
        clients_count: clients.length,
        emails_enqueued: mailRecordsToInsert.length,
        harvest_count: selectedHarvestItems.length,
        scarcity_count: selectedScarcityItems.length
      };

      await supabaseAdmin
        .from('app_settings')
        .upsert({
          key: 'last_weekly_bulletin_dispatch',
          value: JSON.stringify(bulletinAuditPayload),
          description: 'Registro de auditoría del último boletín agro-comercial semanal despachado'
        }, { onConflict: 'key' });
    } catch (auditErr) {
      console.warn('[send-market-bulletin] Non-blocking error saving audit settings:', auditErr);
    }

    // 5. Trigger mail processor in background/synchronously
    try {
      // Direct call to mail process handler if internal, or non-blocking fetch
      const origin = req.headers.get('origin') || 'http://localhost:3001';
      fetch(`${origin}/api/mail/process`, { method: 'POST' }).catch(() => {});
    } catch (e) {
      // Non-blocking
    }

    return NextResponse.json({
      success: true,
      clients_count: clients.length,
      emails_enqueued: mailRecordsToInsert.length,
      week_label: weekLabel,
      message: `Boletín semanal encolado exitosamente para ${clients.length} cuentas institucionales (${mailRecordsToInsert.length} correos programados).`
    });

  } catch (error: any) {
    console.error('[send-market-bulletin] Unexpected error:', error);
    return NextResponse.json({ error: error.message || 'Error interno del servidor.' }, { status: 500 });
  }
}
