const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, '../src/app/admin/settings/page.tsx');
let content = fs.readFileSync(targetPath, 'utf8');

// 1. Add AlertCircle to lucide-react imports if missing
if (!content.includes('AlertCircle')) {
    content = content.replace(/(Clock\r?\n\} from 'lucide-react';)/, 'Clock,\n    AlertCircle\n} from \'lucide-react\';');
}

// 2. Remove cutoff_hour_admin and cutoff_hour_public from opKeys
content = content.replace(
    "const opKeys = ['store_status', 'store_vacation_config', 'email_notifications_mode', 'email_sandbox_recipient', 'delivery_fee', 'min_order_hogar', 'max_order_hogar_cod', 'min_order_institucional', 'enable_b2b_lead_capture', 'enable_cutoff_rules', 'cutoff_hour_admin', 'cutoff_hour_public', 'allow_sunday_deliveries', 'allow_holiday_deliveries', 'packaging_fee_enabled', 'packaging_fee_percentage', 'packaging_fee_note'];",
    "const opKeys = ['store_status', 'store_vacation_config', 'email_notifications_mode', 'email_sandbox_recipient', 'delivery_fee', 'min_order_hogar', 'max_order_hogar_cod', 'min_order_institucional', 'enable_b2b_lead_capture', 'enable_cutoff_rules', 'allow_sunday_deliveries', 'allow_holiday_deliveries', 'packaging_fee_enabled', 'packaging_fee_percentage', 'packaging_fee_note'];"
);

// 3. Remove enable_cutoff_rules from the generic boolean select branch
content = content.replace("setting.key === 'enable_b2b_lead_capture' || setting.key === 'enable_cutoff_rules' ||", "setting.key === 'enable_b2b_lead_capture' ||");

// 4. Inject the custom card for enable_cutoff_rules
const targetMapPattern = ".map((setting) => (";
const panelCode = `.map((setting) => {
                                        if (setting.key === 'enable_cutoff_rules') {
                                            const isCutoffActive = setting.value === 'true';
                                            const cutoffAdminSetting = settings.find(s => s.key === 'cutoff_hour_admin');
                                            const cutoffPublicSetting = settings.find(s => s.key === 'cutoff_hour_public');
                                            const cutoffAdminVal = cutoffAdminSetting?.value || '20';
                                            const cutoffPublicVal = cutoffPublicSetting?.value || '17';

                                            return (
                                                <div 
                                                    key="governance_cutoff_panel"
                                                    style={{
                                                        gridColumn: '1 / -1',
                                                        backgroundColor: THEME.colors.surface,
                                                        borderRadius: THEME.radius.lg,
                                                        border: \`1.5px solid \${isCutoffActive ? '#86EFAC' : '#FCD34D'}\`,
                                                        boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
                                                        overflow: 'hidden',
                                                        marginTop: '0.25rem',
                                                        marginBottom: '0.25rem'
                                                    }}
                                                >
                                                    {/* Header del Bloque */}
                                                    <div style={{
                                                        padding: '1.25rem 1.25rem 1rem 1.25rem',
                                                        borderBottom: \`1px solid \${THEME.colors.border}\`,
                                                        backgroundColor: isCutoffActive ? 'rgba(240, 253, 244, 0.7)' : 'rgba(254, 252, 232, 0.7)',
                                                        display: 'flex',
                                                        flexWrap: 'wrap',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        gap: '12px'
                                                    }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                            <div style={{
                                                                width: '38px',
                                                                height: '38px',
                                                                borderRadius: '10px',
                                                                backgroundColor: isCutoffActive ? '#DCFCE7' : '#FEF3C7',
                                                                color: isCutoffActive ? '#15803D' : '#B45309',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                                                            }}>
                                                                <Clock size={20} strokeWidth={2.2} />
                                                            </div>
                                                            <div>
                                                                <h3 style={{
                                                                    margin: 0,
                                                                    fontSize: '0.92rem',
                                                                    fontWeight: '800',
                                                                    color: THEME.colors.textMain,
                                                                    letterSpacing: '0.03em',
                                                                    textTransform: 'uppercase'
                                                                }}>
                                                                    Gobernanza de Horarios de Corte y Despachos (D+1 / D+2)
                                                                </h3>
                                                                <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: THEME.colors.textSecondary }}>
                                                                    Control maestro de horas límite para compras nocturnas y traslado automático de entregas.
                                                                </p>
                                                            </div>
                                                        </div>

                                                        {/* Badge de estado en tiempo real */}
                                                        <div style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '6px',
                                                            padding: '6px 14px',
                                                            borderRadius: '9999px',
                                                            fontSize: '0.72rem',
                                                            fontWeight: '800',
                                                            backgroundColor: isCutoffActive ? '#DCFCE7' : '#FEF3C7',
                                                            color: isCutoffActive ? '#15803D' : '#B45309',
                                                            border: \`1px solid \${isCutoffActive ? '#86EFAC' : '#FCD34D'}\`,
                                                            letterSpacing: '0.02em'
                                                        }}>
                                                            {isCutoffActive ? (
                                                                <>
                                                                    <CheckCircle2 size={15} />
                                                                    <span>CORTES ESTRICTOS ACTIVOS</span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <AlertCircle size={15} />
                                                                    <span>MODO FLEXIBLE / CONTINGENCIA (SIN BLOQUEOS)</span>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Cuerpo del Bloque */}
                                                    <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                                        {/* Switch Maestro */}
                                                        <div style={{
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            gap: '8px',
                                                            padding: '1.1rem',
                                                            borderRadius: THEME.radius.md,
                                                            backgroundColor: isCutoffActive ? '#F0FDF4' : '#FFFBEB',
                                                            border: \`1px solid \${isCutoffActive ? '#BBF7D0' : '#FDE68A'}\`
                                                        }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
                                                                <div style={{ maxWidth: '680px' }}>
                                                                    <span style={{ fontSize: '0.8rem', fontWeight: '800', color: THEME.colors.textMain, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                        ⚡ Interruptor Maestro de Reglas de Corte
                                                                    </span>
                                                                    <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: isCutoffActive ? '#166534' : '#92400E', lineHeight: '1.45' }}>
                                                                        {isCutoffActive ? (
                                                                            <>
                                                                                <strong>Reglas Activas (Corte Estricto):</strong> El sistema bloquea automáticamente la toma y edición de pedidos para mañana una vez superada la hora límite, trasladando la fecha de entrega obligatoria a 2 días hábiles (D+2).
                                                                            </>
                                                                        ) : (
                                                                            <>
                                                                                <strong>Modo Flexible de Contingencia (Recomendado para cierres y alta demanda):</strong> Las operadoras, correos AI y clientes pueden agendar pedidos para entrega mañana a cualquier hora de la noche sin bloqueos del calendario.
                                                                            </>
                                                                        )}
                                                                    </p>
                                                                </div>
                                                                <div style={{ minWidth: '240px' }}>
                                                                    <select
                                                                        value={setting.value || 'false'}
                                                                        onChange={(e) => handleUpdateSetting('enable_cutoff_rules', e.target.value)}
                                                                        style={{
                                                                            width: '100%',
                                                                            padding: '9px 14px',
                                                                            borderRadius: THEME.radius.sm,
                                                                            border: \`1.5px solid \${isCutoffActive ? '#15803D' : '#D97706'}\`,
                                                                            fontWeight: '800',
                                                                            fontSize: '0.85rem',
                                                                            color: isCutoffActive ? '#15803D' : '#B45309',
                                                                            backgroundColor: THEME.colors.surface,
                                                                            cursor: 'pointer',
                                                                            outline: 'none',
                                                                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                                                        }}
                                                                    >
                                                                        <option value="true">ACTIVADA — Bloqueo Estricto de Horarios</option>
                                                                        <option value="false">DESACTIVADA — Modo Flexible (Sin Bloqueos)</option>
                                                                    </select>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Subordinados: 2 Columnas para Admin y Tienda */}
                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                                                            {/* Tarjeta 1: Admin / B2B */}
                                                            <div style={{
                                                                padding: '1.1rem',
                                                                borderRadius: THEME.radius.md,
                                                                border: \`1px solid \${THEME.colors.border}\`,
                                                                backgroundColor: THEME.colors.surface,
                                                                display: 'flex',
                                                                flexDirection: 'column',
                                                                justifyContent: 'space-between',
                                                                gap: '14px'
                                                            }}>
                                                                <div>
                                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                                        <h4 style={{ margin: 0, fontSize: '0.78rem', fontWeight: '800', color: THEME.colors.textMain, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                            <Building2 size={16} style={{ color: 'var(--primary)' }} />
                                                                            1. Mesa Operativa & B2B (Admin / Empresas)
                                                                        </h4>
                                                                        <span style={{
                                                                            fontSize: '0.65rem',
                                                                            fontWeight: '800',
                                                                            padding: '3px 8px',
                                                                            borderRadius: '4px',
                                                                            backgroundColor: isCutoffActive ? '#DCFCE7' : '#F1F5F9',
                                                                            color: isCutoffActive ? '#166534' : '#64748B'
                                                                        }}>
                                                                            {isCutoffActive ? \`Corte: \${cutoffAdminVal}:00\` : 'Horario Libre'}
                                                                        </span>
                                                                    </div>

                                                                    <p style={{ margin: '0 0 12px 0', fontSize: '0.72rem', color: THEME.colors.textSecondary, lineHeight: '1.4' }}>
                                                                        Aplica a la <strong>digitación manual de operadoras</strong>, panel de administración y recepción automática de correos AI de clientes institucionales (restaurantes, casinos, hoteles).
                                                                    </p>

                                                                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: '800', color: THEME.colors.textSecondary, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                                                        Hora Límite para Despacho Mañana:
                                                                    </label>
                                                                    <select
                                                                        value={cutoffAdminVal}
                                                                        onChange={(e) => handleUpdateSetting('cutoff_hour_admin', e.target.value)}
                                                                        style={{
                                                                            width: '100%',
                                                                            padding: '8px 12px',
                                                                            borderRadius: THEME.radius.sm,
                                                                            border: \`1px solid \${THEME.colors.borderActive}\`,
                                                                            fontWeight: '700',
                                                                            fontSize: '0.85rem',
                                                                            color: THEME.colors.textMain,
                                                                            backgroundColor: THEME.colors.surface,
                                                                            cursor: 'pointer',
                                                                            outline: 'none'
                                                                        }}
                                                                    >
                                                                        <option value="14">02:00 PM (14:00)</option>
                                                                        <option value="15">03:00 PM (15:00)</option>
                                                                        <option value="16">04:00 PM (16:00)</option>
                                                                        <option value="17">05:00 PM (17:00)</option>
                                                                        <option value="18">06:00 PM (18:00)</option>
                                                                        <option value="19">07:00 PM (19:00)</option>
                                                                        <option value="20">08:00 PM (20:00) — (Recomendado Admin B2B)</option>
                                                                        <option value="21">09:00 PM (21:00)</option>
                                                                        <option value="22">10:00 PM (22:00)</option>
                                                                        <option value="23">11:00 PM (23:00)</option>
                                                                    </select>
                                                                </div>

                                                                <div style={{
                                                                    padding: '8px 10px',
                                                                    borderRadius: THEME.radius.sm,
                                                                    backgroundColor: '#F8FAFC',
                                                                    border: \`1px dashed \${THEME.colors.border}\`,
                                                                    fontSize: '0.68rem',
                                                                    color: '#64748B',
                                                                    lineHeight: '1.35'
                                                                }}>
                                                                    📌 <strong>Efecto en planta:</strong> A esta hora el sistema genera el consolidado de compras nocturnas en Corabastos. Si el corte está activo, pedidos posteriores se agendan para D+2.
                                                                </div>
                                                            </div>

                                                            {/* Tarjeta 2: Tienda Pública / B2C */}
                                                            <div style={{
                                                                padding: '1.1rem',
                                                                borderRadius: THEME.radius.md,
                                                                border: \`1px solid \${THEME.colors.border}\`,
                                                                backgroundColor: THEME.colors.surface,
                                                                display: 'flex',
                                                                flexDirection: 'column',
                                                                justifyContent: 'space-between',
                                                                gap: '14px'
                                                            }}>
                                                                <div>
                                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                                        <h4 style={{ margin: 0, fontSize: '0.78rem', fontWeight: '800', color: THEME.colors.textMain, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                            <Store size={16} style={{ color: '#D97706' }} />
                                                                            2. Tienda Web Pública (B2C / Hogares)
                                                                        </h4>
                                                                        <span style={{
                                                                            fontSize: '0.65rem',
                                                                            fontWeight: '800',
                                                                            padding: '3px 8px',
                                                                            borderRadius: '4px',
                                                                            backgroundColor: isCutoffActive ? '#FEF3C7' : '#F1F5F9',
                                                                            color: isCutoffActive ? '#92400E' : '#64748B'
                                                                        }}>
                                                                            {isCutoffActive ? \`Corte: \${cutoffPublicVal}:00\` : 'Horario Libre'}
                                                                        </span>
                                                                    </div>

                                                                    <p style={{ margin: '0 0 12px 0', fontSize: '0.72rem', color: THEME.colors.textSecondary, lineHeight: '1.4' }}>
                                                                        Aplica al <strong>carrito de compras y checkout web</strong> para clientes particulares o de hogar que compran directamente por la tienda online abierta.
                                                                    </p>

                                                                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: '800', color: THEME.colors.textSecondary, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                                                        Hora Límite para Despacho Mañana:
                                                                    </label>
                                                                    <select
                                                                        value={cutoffPublicVal}
                                                                        onChange={(e) => handleUpdateSetting('cutoff_hour_public', e.target.value)}
                                                                        style={{
                                                                            width: '100%',
                                                                            padding: '8px 12px',
                                                                            borderRadius: THEME.radius.sm,
                                                                            border: \`1px solid \${THEME.colors.borderActive}\`,
                                                                            fontWeight: '700',
                                                                            fontSize: '0.85rem',
                                                                            color: THEME.colors.textMain,
                                                                            backgroundColor: THEME.colors.surface,
                                                                            cursor: 'pointer',
                                                                            outline: 'none'
                                                                        }}
                                                                    >
                                                                        <option value="14">02:00 PM (14:00)</option>
                                                                        <option value="15">03:00 PM (15:00)</option>
                                                                        <option value="16">04:00 PM (16:00)</option>
                                                                        <option value="17">05:00 PM (17:00) — (Recomendado Tienda B2C)</option>
                                                                        <option value="18">06:00 PM (18:00)</option>
                                                                        <option value="19">07:00 PM (19:00)</option>
                                                                        <option value="20">08:00 PM (20:00)</option>
                                                                        <option value="21">09:00 PM (21:00)</option>
                                                                        <option value="22">10:00 PM (22:00)</option>
                                                                        <option value="23">11:00 PM (23:00)</option>
                                                                    </select>
                                                                </div>

                                                                <div style={{
                                                                    padding: '8px 10px',
                                                                    borderRadius: THEME.radius.sm,
                                                                    backgroundColor: '#F8FAFC',
                                                                    border: \`1px dashed \${THEME.colors.border}\`,
                                                                    fontSize: '0.68rem',
                                                                    color: '#64748B',
                                                                    lineHeight: '1.35'
                                                                }}>
                                                                    🛒 <strong>Efecto en checkout:</strong> Pasada esta hora, el selector de fecha en la tienda desactiva el día siguiente para evitar comprometer entregas sin abastecimiento.
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        }

                                        return (`;

if (content.includes(targetMapPattern)) {
    content = content.replace(targetMapPattern, panelCode);
    
    // Now close the map with proper closing brace
    const endMapPattern1 = "                                    ));\n                            })()";
    const endMapPattern2 = "                                    ));\r\n                            })()";
    
    if (content.includes(endMapPattern1)) {
        content = content.replace(endMapPattern1, "                                    );\n                                    })\n                            })()");
    } else if (content.includes(endMapPattern2)) {
        content = content.replace(endMapPattern2, "                                    );\r\n                                    })\r\n                            })()");
    }
}

fs.writeFileSync(targetPath, content, 'utf8');
console.log('Patch successfully written to page.tsx');
