const xlsx = require('xlsx');
const excelPath = 'C:/Users/German Higuera/OneDrive/Desktop/Solicitudes frufresco/Acuerdos octubre/Relacion_Diaria_Pedidos_2026-10-30.xlsx';

const wb = xlsx.readFile(excelPath);
const data = xlsx.utils.sheet_to_json(wb.Sheets['Informe'], { header: 1 });

const missingNums = [1, 7, 8, 10, 11, 13, 16, 19];
const missingDetails = [];

for (let i = 2; i < data.length; i++) {
  const r = data[i];
  if (r && missingNums.includes(r[0])) {
    missingDetails.push({
      item: r[0],
      documento: r[2],
      cliente: r[3],
      sucursal: r[4],
      espacio: r[5],
      valor: r[9],
      direccion: r[11],
      zona: r[15]
    });
  }
}

console.log(JSON.stringify(missingDetails, null, 2));
