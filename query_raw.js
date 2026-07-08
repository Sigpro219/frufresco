const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: './.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase.from('raw_emails').select('id, payload, created_at').order('created_at', { ascending: false }).limit(2);
  
  if (data) {
    for (let row of data) {
      console.log("Raw Email ID:", row.id, "Created At:", row.created_at);
      const attachments = row.payload?.attachments || [];
      console.log("Attachments count:", attachments.length);
      if (attachments.length > 0) {
        console.log("Attachment name:", attachments[0].filename || attachments[0].file_name);
        // Let's decode the attachment and print the first few rows
        if (attachments[0].content) {
            const XLSX = require('xlsx');
            try {
                const buffer = Buffer.from(attachments[0].content, 'base64');
                const workbook = XLSX.read(buffer, { type: 'buffer' });
                for (const sheetName of workbook.SheetNames) {
                    console.log(`\n--- Sheet: ${sheetName} ---`);
                    const worksheet = workbook.Sheets[sheetName];
                    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                    console.log(rows.slice(0, 20).map(r => JSON.stringify(r)).join('\n'));
                }
            } catch (e) {
                console.error("Error reading excel:", e);
            }
        }
      }
    }
  } else {
    console.error("Error:", error);
  }
}

run();
