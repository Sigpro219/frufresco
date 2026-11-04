const fs = require('fs');
const path = require('path');

const filePath = path.join('C:', 'Users', 'German Higuera', 'OneDrive', 'Documentos', 'Projects', 'frufresco', 'src', 'components', 'CommercialAgreementsModule.tsx');
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(
    `{revokeTarget.client_nit || 'Sin NIT'}`,
    `{revokeTarget.profiles?.nit || 'Sin NIT'}`
);

content = content.replace(
    `<span style={{ color: '#64748B' }}>Items en lista:</span>\n                                    <span style={{ fontWeight: 600, color: '#0F172A' }}>{revokeTarget.items_count || 0} productos</span>`,
    `<span style={{ color: '#64748B' }}>Modelo Base:</span>\n                                    <span style={{ fontWeight: 600, color: '#0F172A' }}>{revokeTarget.model_snapshot_name || 'Personalizado'}</span>`
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed properties in CommercialAgreementsModule.tsx');
