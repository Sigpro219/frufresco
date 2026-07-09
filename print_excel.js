const XLSX = require('xlsx');

function run() {
  try {
    const workbook = XLSX.readFile('club_bellavista.xlsx');
    for (const sheetName of workbook.SheetNames) {
      console.log(`\n--- Sheet: ${sheetName} ---`);
      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      console.log(rows.slice(0, 30).map(r => JSON.stringify(r)).join('\n'));
    }
  } catch (e) {
    console.error("Error reading excel:", e);
  }
}

run();
