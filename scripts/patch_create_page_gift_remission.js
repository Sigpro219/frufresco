const fs = require('fs');
let code = fs.readFileSync('src/app/admin/orders/create/page.tsx', 'utf8');

// 1. Update orderNature state and add gift states + isGiftOrder
const oldStateBlock = `    // SDD §7.5.8: Naturaleza del Pedido (Venta Ordinaria vs Reposición por Calidad $0 COP)
    const [orderNature, setOrderNature] = useState<'regular' | 'replacement'>(
        (searchParams.get('replacement') === 'true' || searchParams.get('isReplacement') === 'true') ? 'replacement' : 'regular'
    );`;

const newStateBlock = `    // SDD §7.5.8 / §39.3: Naturaleza del Pedido (Venta Ordinaria, Reposición $0 COP o Formato Obsequio con Precio Interno)
    const [orderNature, setOrderNature] = useState<'regular' | 'replacement' | 'gift'>(
        (searchParams.get('replacement') === 'true' || searchParams.get('isReplacement') === 'true')
            ? 'replacement'
            : (searchParams.get('gift') === 'true' || searchParams.get('isGift') === 'true')
                ? 'gift'
                : 'regular'
    );
    const [giftRecipientName, setGiftRecipientName] = useState('');
    const [giftRecipientPhone, setGiftRecipientPhone] = useState('');
    const [giftMessage, setGiftMessage] = useState('');
    const isGiftOrder = orderNature === 'gift' || isGiftRemissionClient;`;

const stateRegex = /\/\/ SDD §7\.5\.8: Naturaleza del Pedido \(Venta Ordinaria vs Reposición por Calidad \$0 COP\)\s*const \[orderNature, setOrderNature\] = useState<'regular' \| 'replacement'>\(\s*\(searchParams\.get\('replacement'\) === 'true' \|\| searchParams\.get\('isReplacement'\) === 'true'\) \? 'replacement' : 'regular'\s*\);/;
if (stateRegex.test(code)) {
    code = code.replace(stateRegex, newStateBlock);
    console.log('1. Updated orderNature state and added isGiftOrder');
}

// 2. Update handleToggleOrderNature
const toggleRegex = /const handleToggleOrderNature = \(nature: 'regular' \| 'replacement'\) => \{[\s\S]*?showToast\('Modo Venta Ordinaria Restaurado\.', 'info'\);\s*\}\s*\};/;
const newToggle = `const handleToggleOrderNature = (nature: 'regular' | 'replacement' | 'gift') => {
        setOrderNature(nature);
        if (nature === 'replacement') {
            // Forzar $0 COP únicamente en Reposiciones por Garantía
            setCart(prev => prev.map(item => ({
                ...item,
                price: 0,
                observations: item.observations ? item.observations : 'Reposición de Garantía ($0 COP)'
            })));
            showToast('Modo Reposición Activo: Todos los productos se liquidarán a $0 COP.', 'info');
        } else {
            // Restaurar precios reales de catálogo/acuerdo tanto en Venta Ordinaria como en Formato Obsequio
            setParentOrderId(null);
            setParentOrderFriendlyId(null);
            setCart(prev => prev.map(item => {
                const p = item.product;
                const rePrice = (contractPrices[p.id] !== undefined && contractPrices[p.id] !== null && contractPrices[p.id] > 0)
                    ? contractPrices[p.id]
                    : 0;
                return {
                    ...item,
                    price: rePrice,
                    observations: nature === 'gift' ? 'Formato Obsequio (Precio interno registrado · Imprime $0 en puerta)' : ''
                };
            }));
            if (nature === 'gift') {
                showToast('Modo Formato Obsequio Activo: Se registra el precio interno real y la remisión de entrega saldrá sin precios ($0 en puerta).', 'info');
            } else {
                showToast('Modo Venta Ordinaria Restaurado.', 'info');
            }
        }
    };`;

if (toggleRegex.test(code)) {
    code = code.replace(toggleRegex, newToggle);
    console.log('2. Updated handleToggleOrderNature');
}

// 3. Preserve internal prices when adding to cart (line 1894)
code = code.replace(
    `const resolvedPrice = (orderNature === 'replacement' || isGiftRemissionClient)`,
    `const resolvedPrice = (orderNature === 'replacement')`
);
code = code.replace(
    `: isGiftRemissionClient\r\n                ? 'Obsequio de Cortesía ($0 COP)'`,
    `: isGiftOrder\r\n                ? 'Formato Obsequio (Remisión sin precio en puerta)'`
).replace(
    `: isGiftRemissionClient\n                ? 'Obsequio de Cortesía ($0 COP)'`,
    `: isGiftOrder\n                ? 'Formato Obsequio (Remisión sin precio en puerta)'`
);

// 4. Preserve internal prices in calculateGrossTotal, calculateTotal, calculateTotalTax, calculateSubtotal
code = code.replace(/if \(orderNature === 'replacement' \|\| isGiftRemissionClient\) return 0;/g, `if (orderNature === 'replacement') return 0;`);
console.log('3 & 4. Preserved internal prices in cart and calculations');

// 5. Preserve internal prices in staging insert (lines 3798, 3806, 3945-3966)
code = code.replace(
    `const unitPrice = (isGiftRemissionClient || isOffAgreementItem)`,
    `const unitPrice = isOffAgreementItem`
);
code = code.replace(
    `const ivaRate = (isGiftRemissionClient || isOffAgreementItem) ? 0 :`,
    `const ivaRate = isOffAgreementItem ? 0 :`
);
code = code.replace(
    `total: (isGiftRemissionClient || isOnlyOffAgreementOrder) ? 0 : Math.round(total),`,
    `total: isOnlyOffAgreementOrder ? 0 : Math.round(total),`
);
code = code.replace(
    `subtotal: (isGiftRemissionClient || isOnlyOffAgreementOrder) ? 0 : Math.round(subtotal),`,
    `subtotal: isOnlyOffAgreementOrder ? 0 : Math.round(subtotal),`
);
code = code.replace(
    `tax: (isGiftRemissionClient || isOnlyOffAgreementOrder) ? 0 : Math.round(tax),`,
    `tax: isOnlyOffAgreementOrder ? 0 : Math.round(tax),`
);
code = code.replace(
    `is_gift_remission: isGiftRemissionClient,`,
    `is_gift_remission: isGiftOrder,`
);

// 6. Preserve internal prices in main order submission (lines 4672, 4798, 4812)
code = code.replace(
    `} else if (isGiftRemissionClient && !finalAdminNotes.includes('REMISIÓN DE OBSEQUIO')) {\r\n                finalAdminNotes = \`[REMISIÓN DE OBSEQUIO / CORTESÍA $0 COP]\\n\${finalAdminNotes}\`.trim();`,
    `} else if (isGiftOrder && !finalAdminNotes.includes('REMISIÓN DE OBSEQUIO')) {\r\n                const recNote = giftRecipientName.trim() ? \`\\n[DESTINATARIO / RECIBE EN PUERTA: \${giftRecipientName.trim()} | Tel: \${giftRecipientPhone.trim() || 'S/T'}]\` : '';\r\n                const msgNote = giftMessage.trim() ? \`\\n[MENSAJE OBSEQUIO: \${giftMessage.trim()}]\` : '';\r\n                finalAdminNotes = \`[REMISIÓN DE OBSEQUIO - PRECIO INTERNO REGISTRADO / IMPRIME $0 EN PUERTA]\${recNote}\${msgNote}\\n\${finalAdminNotes}\`.trim();`
).replace(
    `} else if (isGiftRemissionClient && !finalAdminNotes.includes('REMISIÓN DE OBSEQUIO')) {\n                finalAdminNotes = \`[REMISIÓN DE OBSEQUIO / CORTESÍA $0 COP]\\n\${finalAdminNotes}\`.trim();`,
    `} else if (isGiftOrder && !finalAdminNotes.includes('REMISIÓN DE OBSEQUIO')) {\n                const recNote = giftRecipientName.trim() ? \`\\n[DESTINATARIO / RECIBE EN PUERTA: \${giftRecipientName.trim()} | Tel: \${giftRecipientPhone.trim() || 'S/T'}]\` : '';\n                const msgNote = giftMessage.trim() ? \`\\n[MENSAJE OBSEQUIO: \${giftMessage.trim()}]\` : '';\n                finalAdminNotes = \`[REMISIÓN DE OBSEQUIO - PRECIO INTERNO REGISTRADO / IMPRIME $0 EN PUERTA]\${recNote}\${msgNote}\\n\${finalAdminNotes}\`.trim();`
);

code = code.replace(
    `const isExoneratedZero = orderNature === 'replacement' || isGiftRemissionClient;`,
    `const isExoneratedZero = orderNature === 'replacement';`
);

code = code.replace(
    `is_replacement: orderNature === 'replacement',\r\n                is_gift_remission: isGiftRemissionClient,`,
    `is_replacement: orderNature === 'replacement',\r\n                is_gift_remission: isGiftOrder,\r\n                ...(isGiftOrder && giftRecipientName.trim() ? {\r\n                    is_b2c_gift: clientType === 'B2C',\r\n                    recipient_name: giftRecipientName.trim(),\r\n                    recipient_phone: giftRecipientPhone.trim(),\r\n                    gift_message: giftMessage.trim()\r\n                } : {}),`
).replace(
    `is_replacement: orderNature === 'replacement',\n                is_gift_remission: isGiftRemissionClient,`,
    `is_replacement: orderNature === 'replacement',\n                is_gift_remission: isGiftOrder,\n                ...(isGiftOrder && giftRecipientName.trim() ? {\n                    is_b2c_gift: clientType === 'B2C',\n                    recipient_name: giftRecipientName.trim(),\n                    recipient_phone: giftRecipientPhone.trim(),\n                    gift_message: giftMessage.trim()\n                } : {}),`
);

// 7. Update UI cart item price & badge (lines 9374-9400)
code = code.replace(
    `{formatMoney((orderNature === 'replacement' || isGiftRemissionClient) ? 0 : unitPrice)}`,
    `{formatMoney(orderNature === 'replacement' ? 0 : unitPrice)}`
);
code = code.replace(
    `) : isGiftRemissionClient ? (\r\n                                                            <span style={{ fontSize: '0.65rem', color: '#6D28D9', fontWeight: 'bold', backgroundColor: '#FAF5FF', border: '1px solid #D8B4FE', borderRadius: '4px', padding: '1px 5px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>\r\n                                                                <Gift size={10} color="#6D28D9" /> Obsequio $0\r\n                                                            </span>`,
    `) : isGiftOrder ? (\r\n                                                            <span style={{ fontSize: '0.65rem', color: '#6D28D9', fontWeight: 'bold', backgroundColor: '#FAF5FF', border: '1px solid #D8B4FE', borderRadius: '4px', padding: '1px 5px', display: 'inline-flex', alignItems: 'center', gap: '3px' }} title="Registra precio interno real pero imprime $0 en la remisión de entrega">\r\n                                                                <Gift size={10} color="#6D28D9" /> Remisión Obsequio ($0 en puerta)\r\n                                                            </span>`
).replace(
    `) : isGiftRemissionClient ? (\n                                                            <span style={{ fontSize: '0.65rem', color: '#6D28D9', fontWeight: 'bold', backgroundColor: '#FAF5FF', border: '1px solid #D8B4FE', borderRadius: '4px', padding: '1px 5px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>\n                                                                <Gift size={10} color="#6D28D9" /> Obsequio $0\n                                                            </span>`,
    `) : isGiftOrder ? (\n                                                            <span style={{ fontSize: '0.65rem', color: '#6D28D9', fontWeight: 'bold', backgroundColor: '#FAF5FF', border: '1px solid #D8B4FE', borderRadius: '4px', padding: '1px 5px', display: 'inline-flex', alignItems: 'center', gap: '3px' }} title="Registra precio interno real pero imprime $0 en la remisión de entrega">\n                                                                <Gift size={10} color="#6D28D9" /> Remisión Obsequio ($0 en puerta)\n                                                            </span>`
);
code = code.replace(
    `{formatMoney((orderNature === 'replacement' || isGiftRemissionClient) ? 0 : (unitPrice * parseFloat(item.qty.toString().replace(',', '.') || '0')))}`,
    `{formatMoney(orderNature === 'replacement' ? 0 : (unitPrice * parseFloat(item.qty.toString().replace(',', '.') || '0')))}`
);

// 8. Add 3rd button "Formato Obsequio" in Top Toggle Bar
const natureButtonsTargetRegex = /<RotateCcw size=\{13\} strokeWidth=\{2\.4\} \/>\s*<span>Reposición por Calidad \(\$0 COP\)<\/span>\s*<\/button>/;
const natureButtonsReplacement = `<RotateCcw size={13} strokeWidth={2.4} />
                                <span>Reposición por Calidad ($0 COP)</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => handleToggleOrderNature('gift')}
                                style={{
                                    padding: '0.35rem 0.65rem', borderRadius: '6px', border: 'none',
                                    backgroundColor: isGiftOrder ? '#7C3AED' : 'transparent',
                                    color: isGiftOrder ? '#FFFFFF' : '#64748B',
                                    fontWeight: '800', cursor: 'pointer',
                                    boxShadow: isGiftOrder ? '0 1px 3px rgba(124,58,237,0.3)' : 'none',
                                    transition: 'all 0.15s', fontSize: '0.75rem',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px'
                                }}
                            >
                                <Gift size={13} strokeWidth={2.4} />
                                <span>Formato Obsequio</span>
                            </button>`;

if (natureButtonsTargetRegex.test(code)) {
    code = code.replace(natureButtonsTargetRegex, natureButtonsReplacement);
    console.log('8. Added Formato Obsequio button to top toggle bar');
}

// 9. Add Gift Recipient Panel before PRODUCT SEARCH
const productSearchMarker = `{/* 2. PRODUCT SEARCH (Visible only if NOT importing a document) */}`;
const giftPanel = `{/* PANEL DE FORMATO OBSEQUIO (INSTITUCIONAL Y HOGAR CON PRECIO INTERNO) */}
                        {isGiftOrder && orderNature !== 'replacement' && (
                            <div style={{
                                marginBottom: '1.25rem',
                                padding: '1.1rem 1.25rem',
                                backgroundColor: '#FAF5FF',
                                border: '1.8px solid #D8B4FE',
                                borderRadius: '12px',
                                boxShadow: '0 2px 8px rgba(124, 58, 237, 0.08)'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: '#F3E8FF', color: '#7C3AED', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Gift size={18} strokeWidth={2.4} />
                                        </div>
                                        <div>
                                            <h3 style={{ margin: 0, fontSize: '0.92rem', fontWeight: '800', color: '#581C87' }}>
                                                Formato de Obsequio Activo • Precio Interno Registrado
                                            </h3>
                                            <p style={{ margin: '2px 0 0', fontSize: '0.74rem', color: '#6B21A8' }}>
                                                El sistema guarda internamente el valor real de los productos, pero la Remisión de Entrega impresa saldrá sin precios ($0 en puerta).
                                            </p>
                                        </div>
                                    </div>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', backgroundColor: '#F3E8FF', border: '1px solid #C084FC', padding: '4px 10px', borderRadius: '20px', fontSize: '0.72rem', fontWeight: '800', color: '#581C87' }}>
                                        <CheckCircle2 size={13} />
                                        <span>Remisión de Entrega $0</span>
                                    </span>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', backgroundColor: '#FFFFFF', padding: '0.85rem', borderRadius: '8px', border: '1px solid #E9D5FF' }}>
                                    <div>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', fontWeight: '800', color: '#581C87', textTransform: 'uppercase', marginBottom: '4px' }}>
                                            <User size={11} /> Destinatario (Quien recibe en puerta)
                                        </label>
                                        <input
                                            type="text"
                                            value={giftRecipientName}
                                            onChange={(e) => setGiftRecipientName(e.target.value)}
                                            placeholder="Opcional: Nombre de quien recibe el regalo..."
                                            style={{ width: '100%', padding: '0.45rem 0.65rem', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.78rem', color: '#0F172A' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', fontWeight: '800', color: '#581C87', textTransform: 'uppercase', marginBottom: '4px' }}>
                                            <Phone size={11} /> Teléfono del Destinatario
                                        </label>
                                        <input
                                            type="text"
                                            value={giftRecipientPhone}
                                            onChange={(e) => setGiftRecipientPhone(e.target.value)}
                                            placeholder="Opcional: Celular de contacto en entrega..."
                                            style={{ width: '100%', padding: '0.45rem 0.65rem', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.78rem', color: '#0F172A' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', fontWeight: '800', color: '#581C87', textTransform: 'uppercase', marginBottom: '4px' }}>
                                            <MessageSquare size={11} /> Nota / Dedicatoria de Obsequio
                                        </label>
                                        <input
                                            type="text"
                                            value={giftMessage}
                                            onChange={(e) => setGiftMessage(e.target.value)}
                                            placeholder="Opcional: Mensaje o referencia de obsequio..."
                                            style={{ width: '100%', padding: '0.45rem 0.65rem', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.78rem', color: '#0F172A' }}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 2. PRODUCT SEARCH (Visible only if NOT importing a document) */}`;

if (code.includes(productSearchMarker)) {
    code = code.replace(productSearchMarker, giftPanel);
    console.log('9. Added Gift Recipient Panel to create/page.tsx');
}

fs.writeFileSync('src/app/admin/orders/create/page.tsx', code, 'utf8');
console.log('Successfully patched create/page.tsx for Hallazgo 2');
