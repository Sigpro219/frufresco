const fs = require('fs');
let code = fs.readFileSync('src/components/ClientsModule.tsx', 'utf8');

// 1. Add imports if not present
if (!code.includes('SpecialClientBadge')) {
    const importTarget = "import CommercialAgreementsModule, { extractRowsFromExcelSheet } from './CommercialAgreementsModule';";
    const importAddition = `import CommercialAgreementsModule, { extractRowsFromExcelSheet } from './CommercialAgreementsModule';
import SpecialClientBadge from '@/components/SpecialClientBadge';
import { evaluateSpecialClientAttention } from '@/lib/specialClientAttention';`;
    code = code.replace(importTarget, importAddition);
    console.log('Added imports to ClientsModule.tsx');
}

// 2. Add SpecialClientBadge to ClientCard
// In ClientCard header info:
// <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '900', color: THEME.colors.textMain, paddingRight: '100px', lineHeight: '1.3' }}>
//     {data.company_name || data.contact_name}
// </h3>
const cardHeaderTarget = `<h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '900', color: THEME.colors.textMain, paddingRight: '100px', lineHeight: '1.3' }}>
                    {data.company_name || data.contact_name}
                </h3>`;

const cardHeaderReplacement = `<div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', paddingRight: '100px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '900', color: THEME.colors.textMain, lineHeight: '1.3' }}>
                        {data.company_name || data.contact_name}
                    </h3>
                    {profileData && (
                        <SpecialClientBadge state={evaluateSpecialClientAttention({ profile: profileData, profileId: profileData.id })} />
                    )}
                </div>`;

if (code.includes(cardHeaderTarget)) {
    code = code.replace(cardHeaderTarget, cardHeaderReplacement);
    console.log('Added SpecialClientBadge to ClientCard');
} else {
    // Try with normalized whitespace
    const cardHeaderRegex = /<h3 style=\{\{\s*margin:\s*0,\s*fontSize:\s*'1\.05rem',\s*fontWeight:\s*'900',\s*color:\s*THEME\.colors\.textMain,\s*paddingRight:\s*'100px',\s*lineHeight:\s*'1\.3'\s*\}\}>\s*\{data\.company_name \|\| data\.contact_name\}\s*<\/h3>/;
    if (cardHeaderRegex.test(code)) {
        code = code.replace(cardHeaderRegex, cardHeaderReplacement);
        console.log('Added SpecialClientBadge to ClientCard via regex');
    }
}

// 3. Add SpecialClientBadge to ClientListRow
// <div style={{ fontWeight: '800', color: THEME.colors.textMain, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
//     {client.company_name || client.contact_name}
// </div>
const rowTarget = `<div style={{ fontWeight: '800', color: THEME.colors.textMain, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {client.company_name || client.contact_name}
                </div>`;

const rowReplacement = `<div style={{ fontWeight: '800', color: THEME.colors.textMain, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span>{client.company_name || client.contact_name}</span>
                    <SpecialClientBadge state={evaluateSpecialClientAttention({ profile: client, profileId: client.id })} />
                </div>`;

if (code.includes(rowTarget)) {
    code = code.replace(rowTarget, rowReplacement);
    console.log('Added SpecialClientBadge to ClientListRow');
} else {
    const rowRegex = /<div style=\{\{\s*fontWeight:\s*'800',\s*color:\s*THEME\.colors\.textMain,\s*fontSize:\s*'0\.95rem',\s*display:\s*'flex',\s*alignItems:\s*'center',\s*gap:\s*'8px'\s*\}\}>\s*\{client\.company_name \|\| client\.contact_name\}\s*<\/div>/;
    if (rowRegex.test(code)) {
        code = code.replace(rowRegex, rowReplacement);
        console.log('Added SpecialClientBadge to ClientListRow via regex');
    }
}

// 4. Add Section to Edit Modal before BOTON DE EXCEPCIONES LOGISTICAS
const modalSectionTarget = `{/* BOTÓN DE EXCEPCIONES LOGÍSTICAS (SOLO SUCURSAL) */}`;

const specialAttentionSection = `{/* ATENCIÓN ESPECIAL LOGÍSTICA & SENSIBILIDAD OPERATIVA (CALIDAD & WMS) */}
                                <div style={{ marginTop: '1.5rem', backgroundColor: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: '16px', padding: '1.2rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <ShieldAlert size={18} strokeWidth={2.2} style={{ color: '#EF4444' }} />
                                            </div>
                                            <div>
                                                <h4 style={{ margin: 0, fontSize: '0.88rem', fontWeight: '900', color: '#0F172A' }}>
                                                    ATENCIÓN ESPECIAL LOGÍSTICA (CALIDAD & WMS)
                                                </h4>
                                                <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748B' }}>
                                                    Directivas operativas de empaque, peso y canastillas limpias visibles para bodega
                                                </p>
                                            </div>
                                        </div>
                                        {/* Active Badge Preview */}
                                        {(() => {
                                            const previewState = evaluateSpecialClientAttention({
                                                profile: { ...formData, logistics_data: formData.logistics_data },
                                                profileId: editData?.id
                                            });
                                            return previewState?.active ? <SpecialClientBadge state={previewState} /> : null;
                                        })()}
                                    </div>

                                    {/* Modo de Atención: Píldoras */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '6px', marginBottom: '1rem' }}>
                                        {[
                                            { id: 'auto', label: '🤖 Automático', desc: 'Por pedidos y PQRs' },
                                            { id: 'new_client', label: '✨ Cliente Nuevo', desc: 'Primeras 3 entregas' },
                                            { id: 'recurring_pqr', label: '🚨 Crítico PQR', desc: 'Alerta máxima calidad' },
                                            { id: 'low_consumption', label: '📉 Bajo Consumo', desc: 'Seguimiento retención' },
                                            { id: 'custom', label: '⚙️ Manual / Especial', desc: 'Instrucción a medida' },
                                            { id: 'disabled', label: '⚪ Desactivado', desc: 'Estándar ordinario' }
                                        ].map(opt => {
                                            const currentAtt = formData.logistics_data?.special_attention;
                                            const currentMode = currentAtt?.mode || (currentAtt?.active === false ? 'disabled' : (currentAtt?.active ? (currentAtt.reason || 'custom') : 'auto'));
                                            const isSelected = currentMode === opt.id || (opt.id === 'recurring_pqr' && currentAtt?.reason === 'recurring_pqr' && currentAtt?.mode === 'manual') || (opt.id === 'new_client' && currentAtt?.reason === 'new_client' && currentAtt?.mode === 'manual') || (opt.id === 'low_consumption' && currentAtt?.reason === 'low_consumption' && currentAtt?.mode === 'manual');

                                            return (
                                                <button
                                                    key={opt.id}
                                                    type="button"
                                                    onClick={() => {
                                                        let newAtt: any = null;
                                                        if (opt.id === 'disabled') {
                                                            newAtt = { active: false, mode: 'disabled' };
                                                        } else if (opt.id === 'auto') {
                                                            newAtt = null;
                                                        } else {
                                                            newAtt = {
                                                                active: true,
                                                                mode: 'manual',
                                                                reason: opt.id === 'custom' ? 'custom' : opt.id,
                                                                directives: {
                                                                    selection: true,
                                                                    weight: true,
                                                                    specs: true,
                                                                    crates: true
                                                                },
                                                                custom_notes: currentAtt?.custom_notes || ''
                                                            };
                                                        }
                                                        setFormData({
                                                            ...formData,
                                                            logistics_data: {
                                                                ...(formData.logistics_data || {}),
                                                                special_attention: newAtt
                                                            }
                                                        });
                                                    }}
                                                    style={{
                                                        padding: '8px 6px',
                                                        borderRadius: '8px',
                                                        border: \`1.5px solid \${isSelected ? '#EF4444' : '#E2E8F0'}\`,
                                                        backgroundColor: isSelected ? '#FEF2F2' : '#FFFFFF',
                                                        cursor: 'pointer',
                                                        textAlign: 'center',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        alignItems: 'center',
                                                        gap: '2px',
                                                        transition: 'all 0.15s ease'
                                                    }}
                                                >
                                                    <span style={{ fontSize: '0.74rem', fontWeight: isSelected ? '900' : '700', color: isSelected ? '#991B1B' : '#334155' }}>
                                                        {opt.label}
                                                    </span>
                                                    <span style={{ fontSize: '0.62rem', color: isSelected ? '#B91C1C' : '#94A3B8' }}>
                                                        {opt.desc}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* Si está en modo manual o personalizado, mostrar las 4 directivas y notas */}
                                    {formData.logistics_data?.special_attention?.mode === 'manual' && (
                                        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #CBD5E1', padding: '10px 14px', marginTop: '10px' }}>
                                            <span style={{ fontSize: '0.7rem', fontWeight: '800', color: '#475569', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>
                                                Directivas Obligatorias para Alistamiento y Bodega:
                                            </span>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px', marginBottom: '8px' }}>
                                                {[
                                                    { key: 'crates', label: '📦 Canastillas Limpias / Higienizadas' },
                                                    { key: 'selection', label: '🔍 Selección 1A (Sin Magulladuras)' },
                                                    { key: 'weight', label: '⚖️ Peso Exacto en Báscula' },
                                                    { key: 'specs', label: '🎚️ Calibre y Madurez Exacta' }
                                                ].map(dir => {
                                                    const currentDirs = formData.logistics_data?.special_attention?.directives || { selection: true, weight: true, specs: true, crates: true };
                                                    const isChecked = currentDirs[dir.key] !== false;

                                                    return (
                                                        <label key={dir.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', fontWeight: '700', color: '#1E293B', cursor: 'pointer' }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={isChecked}
                                                                onChange={(e) => {
                                                                    setFormData({
                                                                        ...formData,
                                                                        logistics_data: {
                                                                            ...(formData.logistics_data || {}),
                                                                            special_attention: {
                                                                                ...(formData.logistics_data?.special_attention || {}),
                                                                                directives: {
                                                                                    ...currentDirs,
                                                                                    [dir.key]: e.target.checked
                                                                                }
                                                                            }
                                                                        }
                                                                    });
                                                                }}
                                                            />
                                                            <span>{dir.label}</span>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                            <div>
                                                <span style={{ fontSize: '0.7rem', fontWeight: '800', color: '#475569', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                                                    Nota Operativa para el Bodeguero / Alistador:
                                                </span>
                                                <input
                                                    type="text"
                                                    value={formData.logistics_data?.special_attention?.custom_notes || ''}
                                                    onChange={(e) => {
                                                        setFormData({
                                                            ...formData,
                                                            logistics_data: {
                                                                ...(formData.logistics_data || {}),
                                                                special_attention: {
                                                                    ...(formData.logistics_data?.special_attention || {}),
                                                                    custom_notes: e.target.value
                                                                }
                                                            }
                                                        });
                                                    }}
                                                    placeholder="Ej: Lavar canastillas con desinfectante y verificar piñas medianas..."
                                                    style={{
                                                        width: '100%',
                                                        padding: '6px 10px',
                                                        borderRadius: '6px',
                                                        border: '1px solid #CBD5E1',
                                                        fontSize: '0.75rem',
                                                        color: '#0F172A'
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* BOTÓN DE EXCEPCIONES LOGÍSTICAS (SOLO SUCURSAL) */}`;

if (code.includes(modalSectionTarget)) {
    code = code.replace(modalSectionTarget, specialAttentionSection);
    console.log('Added specialAttentionSection to Edit Modal in ClientsModule.tsx');
} else {
    console.error('modalSectionTarget not found in ClientsModule.tsx');
}

fs.writeFileSync('src/components/ClientsModule.tsx', code, 'utf8');
console.log('ClientsModule.tsx patched successfully');
