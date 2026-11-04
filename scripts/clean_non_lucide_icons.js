const fs = require('fs');

// 1. Clean ClientsModule.tsx
let clientsCode = fs.readFileSync('src/components/ClientsModule.tsx', 'utf8');
clientsCode = clientsCode
    .replace("label: '🤖 Automático'", "label: 'Automático', icon: Cpu")
    .replace("label: '✨ Cliente Nuevo'", "label: 'Cliente Nuevo', icon: Sparkles")
    .replace("label: '🚨 Crítico PQR'", "label: 'Crítico PQR', icon: ShieldAlert")
    .replace("label: '📉 Bajo Consumo'", "label: 'Bajo Consumo', icon: TrendingUp")
    .replace("label: '⚙️ Manual / Especial'", "label: 'Manual / Especial', icon: Sliders")
    .replace("label: '⚪ Desactivado'", "label: 'Desactivado', icon: Ban")
    .replace("label: '📦 Canastillas Limpias / Higienizadas'", "label: 'Canastillas Limpias / Higienizadas'")
    .replace("label: '🔍 Selección 1A (Sin Magulladuras)'", "label: 'Selección 1A (Sin Magulladuras)'")
    .replace("label: '⚖️ Peso Exacto en Báscula'", "label: 'Peso Exacto en Báscula'")
    .replace("label: '🎚️ Calibre y Madurez Exacta'", "label: 'Calibre y Madurez Exacta'");

// Render OptIcon inside the button in ClientsModule.tsx
clientsCode = clientsCode.replace(
    `<span style={{ fontSize: '0.74rem', fontWeight: isSelected ? '900' : '700', color: isSelected ? '#991B1B' : '#334155' }}>
                                                        {opt.label}
                                                    </span>`,
    `<span style={{ fontSize: '0.74rem', fontWeight: isSelected ? '900' : '700', color: isSelected ? '#991B1B' : '#334155', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                        {(() => { const OptIcon = (opt as any).icon; return OptIcon ? <OptIcon size={12} strokeWidth={2.2} /> : null; })()}
                                                        <span>{opt.label}</span>
                                                    </span>`
);
fs.writeFileSync('src/components/ClientsModule.tsx', clientsCode, 'utf8');
console.log('Cleaned ClientsModule.tsx to pure Lucide icons');

// 2. Clean loading/page.tsx
let loadingCode = fs.readFileSync('src/app/admin/orders/loading/page.tsx', 'utf8');
loadingCode = loadingCode.replace(
    `✓ {d.label}: {d.detail}`,
    `<CheckCircle2 size={11} strokeWidth={2.5} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '3px' }} />{d.label}: {d.detail}`
);
fs.writeFileSync('src/app/admin/orders/loading/page.tsx', loadingCode, 'utf8');
console.log('Cleaned loading/page.tsx to pure Lucide icons');

// 3. Clean picking/cliente/[id]/page.tsx
let pickingClientCode = fs.readFileSync('src/app/ops/picking/cliente/[id]/page.tsx', 'utf8');
pickingClientCode = pickingClientCode.replace(
    `✓ {d.label}: {d.detail}`,
    `<CheckCircle size={11} strokeWidth={2.5} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '3px' }} />{d.label}: {d.detail}`
);
fs.writeFileSync('src/app/ops/picking/cliente/[id]/page.tsx', pickingClientCode, 'utf8');
console.log('Cleaned picking/cliente/[id]/page.tsx to pure Lucide icons');
