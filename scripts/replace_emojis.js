const fs = require('fs');
const path = require('path');

const filePath = 'C:\\Users\\German Higuera\\OneDrive\\Documentos\\Projects\\frufresco\\src\\components\\CommercialUnifiedDashboard.tsx';
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace('📊 Mix de Facturación Bruta:', '<BarChart2 size={15} color={THEME.colors.primary} /> Mix de Facturación Bruta:');
content = content.replace('💰 Mix de Utilidad Bruta (Ganancia Real):', '<DollarSign size={15} color="#059669" /> Mix de Utilidad Bruta (Ganancia Real):');

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully replaced emojis with Lucide icons!');
