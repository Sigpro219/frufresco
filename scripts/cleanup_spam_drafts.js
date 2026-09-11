const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Faltan variables de entorno NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanupSpamDrafts() {
  console.log('Iniciando escaneo de borradores no operativos (Spam / Alertas de sistema)...');

  const { data: drafts, error } = await supabase
    .from('order_drafts')
    .select('id, email_subject, source_email, status, created_at, client_detected_name')
    .eq('status', 'pending');

  if (error) {
    console.error('Error obteniendo borradores:', error.message);
    return;
  }

  console.log('Total de borradores pendientes encontrados: ' + drafts.length);

  const spamPatterns = [
    /vercel/i,
    /supabase/i,
    /github/i,
    /google\s*play/i,
    /google\s*one/i,
    /google\s*maps/i,
    /resend/i,
    /noreply/i,
    /no-reply/i,
    /security vulnerabilities/i,
    /custom domain free/i,
    /your password was reset/i,
    /please set your password/i,
    /recibo de tu pedido de google/i,
    /cambios en los l[ií]mites/i,
    /el precio de lanzamiento/i
  ];

  const toDelete = [];

  for (const draft of drafts) {
    const textToCheck = (draft.email_subject || '') + ' ' + (draft.source_email || '') + ' ' + (draft.client_detected_name || '');
    const isSpam = spamPatterns.some(pattern => pattern.test(textToCheck));
    
    if (isSpam) {
      toDelete.push(draft);
    }
  }

  console.log('\nBorradores identificados como spam / alertas técnicas: ' + toDelete.length);
  toDelete.forEach((d, i) => {
    console.log('[' + (i + 1) + '] ID: ' + d.id + ' | Remitente: ' + d.source_email + ' | Asunto: "' + d.email_subject + '"');
  });

  if (toDelete.length === 0) {
    console.log('No se encontraron borradores spam para depurar.');
    return;
  }

  const idsToDelete = toDelete.map(d => d.id);
  const { error: deleteError } = await supabase
    .from('order_drafts')
    .delete()
    .in('id', idsToDelete);

  if (deleteError) {
    console.error('Error eliminando borradores spam:', deleteError.message);
  } else {
    console.log('\n✅ Se eliminaron exitosamente ' + toDelete.length + ' borradores no operativos.');
  }

  const { count } = await supabase
    .from('order_drafts')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');

  console.log('\n📦 Total de borradores legítimos pendientes restantes: ' + count);
}

cleanupSpamDrafts();
