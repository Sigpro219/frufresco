const fs = require('fs');
const path = require('path');

const filePath = path.join('C:', 'Users', 'German Higuera', 'OneDrive', 'Documentos', 'Projects', 'frufresco', 'src', 'components', 'CommercialAgreementsModule.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add state variable isUnmatchedResolutionModalOpen
const stateTarget = `const [isClientsWithoutAgreementModalOpen, setIsClientsWithoutAgreementModalOpen] = useState(false);`;
const stateAdd = `const [isClientsWithoutAgreementModalOpen, setIsClientsWithoutAgreementModalOpen] = useState(false);
    const [isUnmatchedResolutionModalOpen, setIsUnmatchedResolutionModalOpen] = useState(false);`;

if (!content.includes(stateTarget)) {
    console.error('State target not found');
    process.exit(1);
}
content = content.replace(stateTarget, stateAdd);

// 2. Add handleDiscardAllUnmatched function and improve handleDiscardRow
const discardTarget = `    const handleDiscardRow = (rowIdx: number) => {
        if (!excelPreviewData) return;
        const newItems = excelPreviewData.items.filter((_, idx) => idx !== rowIdx);`;

const discardReplacement = `    const handleDiscardAllUnmatched = () => {
        if (!excelPreviewData) return;
        const newItems = excelPreviewData.items.filter(it => Boolean(it.matched_product));
        const matchedCount = newItems.length;
        const unmatchedCount = 0;
        const inactiveCount = newItems.filter(it => it.is_inactive).length;
        const totalMarginSum = newItems.reduce((acc, it) => acc + (it.margin_percent || 0), 0);
        const avgMargin = matchedCount > 0 ? Math.round((totalMarginSum / matchedCount) * 10) / 10 : 0;
        const totalSubtotal = newItems.reduce((acc, it) => acc + (it.unit_price || 0), 0);

        setExcelPreviewData({
            items: newItems,
            matchedCount,
            unmatchedCount,
            inactiveCount,
            avgMargin,
            totalSubtotal
        });

        setUploadedItems(newItems.map(it => ({
            accounting_id: it.accounting_id,
            product_name: it.product_name,
            unit_price: it.unit_price
        })));

        setActiveCellSearchRowIdx(null);
        setExcelPreviewFilter('all');
        showToast('Se descartaron todos los ítems sin coincidencia. Listo para activar.', 'success');
    };

    const handleDiscardRow = (rowIdx: number, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (!excelPreviewData) return;
        if (activeCellSearchRowIdx === rowIdx) {
            setActiveCellSearchRowIdx(null);
        }
        const newItems = excelPreviewData.items.filter((_, idx) => idx !== rowIdx);`;

if (!content.includes(discardTarget)) {
    console.error('Discard target not found');
    process.exit(1);
}
content = content.replace(discardTarget, discardReplacement);

// 3. Update Poka-Yoke banner to add "Descartar todos los sin coincidencia"
const bannerTarget = `                                                    <button
                                                        type="button"
                                                        onClick={() => setExcelPreviewFilter('unmatched')}
                                                        style={{
                                                            padding: '4px 10px',
                                                            backgroundColor: '#DC2626',
                                                            color: 'white',
                                                            border: 'none',
                                                            borderRadius: '6px',
                                                            fontSize: '0.72rem',
                                                            fontWeight: 'bold',
                                                            cursor: 'pointer',
                                                            whiteSpace: 'nowrap'
                                                        }}
                                                    >
                                                        Ver Pendientes ({excelPreviewData.unmatchedCount})
                                                    </button>`;

const bannerReplacement = `                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                        <button
                                                            type="button"
                                                            onClick={() => setExcelPreviewFilter('unmatched')}
                                                            style={{
                                                                padding: '5px 12px',
                                                                backgroundColor: '#DC2626',
                                                                color: 'white',
                                                                border: 'none',
                                                                borderRadius: '6px',
                                                                fontSize: '0.75rem',
                                                                fontWeight: 'bold',
                                                                cursor: 'pointer',
                                                                whiteSpace: 'nowrap',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '5px'
                                                            }}
                                                        >
                                                            <Search size={12} /> Ver Pendientes ({excelPreviewData.unmatchedCount})
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={handleDiscardAllUnmatched}
                                                            title="Omitir todas las filas que no coincidan con el catálogo para poder activar el acuerdo ya"
                                                            style={{
                                                                padding: '5px 12px',
                                                                backgroundColor: '#991B1B',
                                                                color: 'white',
                                                                border: 'none',
                                                                borderRadius: '6px',
                                                                fontSize: '0.75rem',
                                                                fontWeight: 'bold',
                                                                cursor: 'pointer',
                                                                whiteSpace: 'nowrap',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '5px'
                                                            }}
                                                        >
                                                            <Trash2 size={12} /> Descartar todos los sin coincidencia ({excelPreviewData.unmatchedCount})
                                                        </button>
                                                    </div>`;

if (!content.includes(bannerTarget)) {
    console.error('Banner target not found');
    process.exit(1);
}
content = content.replace(bannerTarget, bannerReplacement);

// 4. Update the individual row trash button in the table
const rowTrashTarget = `                                                                        {/* Row actions */}
                                                                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleDiscardRow(originalIndex)}
                                                                                title="Descartar fila (no comercial)"
                                                                                style={{
                                                                                    backgroundColor: 'transparent',
                                                                                    border: 'none',
                                                                                    cursor: 'pointer',
                                                                                    color: '#EF4444',
                                                                                    padding: '4px',
                                                                                    borderRadius: '4px',
                                                                                    display: 'inline-flex',
                                                                                    alignItems: 'center',
                                                                                    justifyContent: 'center'
                                                                                }}
                                                                            >
                                                                                <Trash2 size={14} />
                                                                            </button>
                                                                        </td>`;

const rowTrashReplacement = `                                                                        {/* Row actions */}
                                                                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                                            <button
                                                                                type="button"
                                                                                onClick={(e) => handleDiscardRow(originalIndex, e)}
                                                                                title="Descartar fila de la lista de precios"
                                                                                style={{
                                                                                    backgroundColor: '#FEE2E2',
                                                                                    border: '1px solid #FECACA',
                                                                                    cursor: 'pointer',
                                                                                    color: '#DC2626',
                                                                                    padding: '6px 8px',
                                                                                    borderRadius: '6px',
                                                                                    display: 'inline-flex',
                                                                                    alignItems: 'center',
                                                                                    justifyContent: 'center',
                                                                                    transition: 'all 0.15s ease'
                                                                                }}
                                                                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#FCA5A5'}
                                                                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#FEE2E2'}
                                                                            >
                                                                                <Trash2 size={15} />
                                                                            </button>
                                                                        </td>`;

if (!content.includes(rowTrashTarget)) {
    console.error('Row trash target not found');
    process.exit(1);
}
content = content.replace(rowTrashTarget, rowTrashReplacement);

// 5. Update footer submit button to make it interactive when hasUnmatched
const footerTarget = `                                {createStep === 3 && (() => {
                                    const hasItems = Boolean(excelPreviewData && excelPreviewData.items.length > 0);
                                    const hasUnmatched = Boolean(excelPreviewData && excelPreviewData.unmatchedCount > 0);
                                    const isSubmitDisabled = savingAgreement || parsing || isDigestingWithAI || !hasItems || hasUnmatched;

                                    return (
                                        <button 
                                            type="submit" 
                                            disabled={isSubmitDisabled}
                                            title={hasUnmatched ? \`Hay \${excelPreviewData?.unmatchedCount} ítems sin coincidencia pendientes.\` : undefined}
                                            style={{ 
                                                padding: '10px 24px', 
                                                borderRadius: THEME.radius.md, 
                                                border: 'none', 
                                                backgroundColor: isSubmitDisabled 
                                                    ? (hasUnmatched ? '#F87171' : '#CBD5E1') 
                                                    : '#0D7A57',
                                                backgroundImage: isSubmitDisabled 
                                                    ? 'none' 
                                                    : 'linear-gradient(135deg, #0D7A57 0%, #059669 100%)',
                                                color: 'white', 
                                                fontWeight: 'bold', 
                                                fontSize: '0.85rem', 
                                                cursor: isSubmitDisabled ? 'not-allowed' : 'pointer',
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                gap: '8px', 
                                                boxShadow: isSubmitDisabled ? 'none' : '0 4px 14px rgba(13, 122, 87, 0.35)',
                                                opacity: isSubmitDisabled && !hasUnmatched ? 0.7 : 1,
                                                transition: 'all 0.2s ease'
                                            }}
                                        >
                                            {savingAgreement ? (
                                                <><Loader2 size={16} className="animate-spin" /> Guardando Acuerdo...</>
                                            ) : hasUnmatched ? (
                                                <><AlertCircle size={16} /> {excelPreviewData?.unmatchedCount} Sin Coincidencia — Resuelve para Activar</>
                                            ) : !hasItems ? (
                                                <>Carga un archivo de precios para continuar</>
                                            ) : (
                                                <>
                                                    <Check size={16} strokeWidth={2.5} /> Crear y Activar Acuerdo Comercial ({excelPreviewData?.matchedCount} SKUs)
                                                </>
                                            )}
                                        </button>
                                    );
                                })()}`;

const footerReplacement = `                                {createStep === 3 && (() => {
                                    const hasItems = Boolean(excelPreviewData && excelPreviewData.items.length > 0);
                                    const hasUnmatched = Boolean(excelPreviewData && excelPreviewData.unmatchedCount > 0);
                                    const isSubmitDisabled = savingAgreement || parsing || isDigestingWithAI || !hasItems;

                                    if (hasUnmatched) {
                                        return (
                                            <button 
                                                type="button" 
                                                onClick={() => setIsUnmatchedResolutionModalOpen(true)}
                                                title="Haz clic para resolver o descartar los productos sin coincidencia y activar el acuerdo"
                                                style={{ 
                                                    padding: '10px 24px', 
                                                    borderRadius: THEME.radius.md, 
                                                    border: 'none', 
                                                    backgroundColor: '#DC2626',
                                                    backgroundImage: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
                                                    color: 'white', 
                                                    fontWeight: 'bold', 
                                                    fontSize: '0.85rem', 
                                                    cursor: 'pointer',
                                                    display: 'flex', 
                                                    alignItems: 'center', 
                                                    gap: '8px', 
                                                    boxShadow: '0 4px 14px rgba(220, 38, 38, 0.35)',
                                                    transition: 'all 0.2s ease'
                                                }}
                                            >
                                                <AlertCircle size={16} /> {excelPreviewData?.unmatchedCount} Sin Coincidencia — Resolver para Activar
                                            </button>
                                        );
                                    }

                                    return (
                                        <button 
                                            type="submit" 
                                            disabled={isSubmitDisabled}
                                            style={{ 
                                                padding: '10px 24px', 
                                                borderRadius: THEME.radius.md, 
                                                border: 'none', 
                                                backgroundColor: isSubmitDisabled ? '#CBD5E1' : '#0D7A57',
                                                backgroundImage: isSubmitDisabled ? 'none' : 'linear-gradient(135deg, #0D7A57 0%, #059669 100%)',
                                                color: 'white', 
                                                fontWeight: 'bold', 
                                                fontSize: '0.85rem', 
                                                cursor: isSubmitDisabled ? 'not-allowed' : 'pointer',
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                gap: '8px', 
                                                boxShadow: isSubmitDisabled ? 'none' : '0 4px 14px rgba(13, 122, 87, 0.35)',
                                                opacity: isSubmitDisabled ? 0.7 : 1,
                                                transition: 'all 0.2s ease'
                                            }}
                                        >
                                            {savingAgreement ? (
                                                <><Loader2 size={16} className="animate-spin" /> Guardando Acuerdo...</>
                                            ) : !hasItems ? (
                                                <>Carga un archivo de precios para continuar</>
                                            ) : (
                                                <>
                                                    <Check size={16} strokeWidth={2.5} /> Crear y Activar Acuerdo Comercial ({excelPreviewData?.matchedCount} SKUs)
                                                </>
                                            )}
                                        </button>
                                    );
                                })()}`;

if (!content.includes(footerTarget)) {
    console.error('Footer target not found');
    process.exit(1);
}
content = content.replace(footerTarget, footerReplacement);

// 6. Add UnmatchedResolutionModal before TOAST NOTIFICATION
const modalInsertTarget = `            {/* TOAST NOTIFICATION */}`;

const resolutionModalCode = `            {/* MODAL DE RESOLUCIÓN RÁPIDA POKA-YOKE SIN COINCIDENCIA */}
            {isUnmatchedResolutionModalOpen && excelPreviewData && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(15, 23, 42, 0.65)',
                    backdropFilter: 'blur(4px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 2600,
                    padding: '16px'
                }}>
                    <div style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: '16px',
                        maxWidth: '560px',
                        width: '100%',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                        border: '1px solid #E2E8F0',
                        overflow: 'hidden'
                    }}>
                        <div style={{
                            padding: '18px 24px',
                            borderBottom: '1px solid #F1F5F9',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            backgroundColor: '#FEF2F2'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{
                                    width: '36px',
                                    height: '36px',
                                    borderRadius: '10px',
                                    backgroundColor: '#FEE2E2',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#DC2626'
                                }}>
                                    <AlertCircle size={20} />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#991B1B' }}>
                                        Resolver {excelPreviewData.unmatchedCount} Productos Sin Coincidencia
                                    </h3>
                                    <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: '#B91C1C' }}>
                                        {excelPreviewData.matchedCount} productos reconocidos de {excelPreviewData.items.length} totales
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsUnmatchedResolutionModalOpen(false)}
                                style={{
                                    border: 'none',
                                    background: 'transparent',
                                    cursor: 'pointer',
                                    color: '#94A3B8',
                                    padding: '4px'
                                }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <p style={{ margin: 0, fontSize: '0.88rem', color: '#475569', lineHeight: '1.5' }}>
                                El archivo cargado contiene <strong>{excelPreviewData.unmatchedCount} filas</strong> que no coinciden con ningún SKU del catálogo maestro. Elige cómo deseas proceder:
                            </p>

                            {/* Option 1: Discard unmatched and activate immediately */}
                            <div 
                                onClick={() => {
                                    handleDiscardAllUnmatched();
                                    setIsUnmatchedResolutionModalOpen(false);
                                }}
                                style={{
                                    padding: '16px',
                                    borderRadius: '12px',
                                    border: '2px solid #BBF7D0',
                                    backgroundColor: '#F0FDF4',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '12px'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.borderColor = '#16A34A';
                                    e.currentTarget.style.backgroundColor = '#DCFCE7';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.borderColor = '#BBF7D0';
                                    e.currentTarget.style.backgroundColor = '#F0FDF4';
                                }}
                            >
                                <div style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '8px',
                                    backgroundColor: '#DCFCE7',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#15803D',
                                    flexShrink: 0
                                }}>
                                    <Check size={18} strokeWidth={2.5} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#166534', marginBottom: '2px' }}>
                                        Descartar las {excelPreviewData.unmatchedCount} filas no coincidentes y Activar
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: '#15803D' }}>
                                        Omite los ítems no reconocidos (útil para notas, encabezados o productos descontinuados) y deja el acuerdo listo con los <strong>{excelPreviewData.matchedCount} productos válidos</strong>.
                                    </div>
                                </div>
                            </div>

                            {/* Option 2: Go to table to resolve one by one */}
                            <div 
                                onClick={() => {
                                    setExcelPreviewFilter('unmatched');
                                    setIsUnmatchedResolutionModalOpen(false);
                                }}
                                style={{
                                    padding: '16px',
                                    borderRadius: '12px',
                                    border: '1px solid #E2E8F0',
                                    backgroundColor: '#F8FAFC',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '12px'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.borderColor = '#94A3B8';
                                    e.currentTarget.style.backgroundColor = '#F1F5F9';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.borderColor = '#E2E8F0';
                                    e.currentTarget.style.backgroundColor = '#F8FAFC';
                                }}
                            >
                                <div style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '8px',
                                    backgroundColor: '#E0F2FE',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#0284C7',
                                    flexShrink: 0
                                }}>
                                    <Search size={18} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#0F172A', marginBottom: '2px' }}>
                                        Revisar y asociar en la tabla fila por fila
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: '#64748B' }}>
                                        Filtra la lista de precios en los ítems sin coincidencia para que puedas buscarlos en el catálogo o crearlos individualmente.
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div style={{
                            padding: '14px 24px',
                            borderTop: '1px solid #F1F5F9',
                            display: 'flex',
                            justifyContent: 'flex-end',
                            backgroundColor: '#FAFAFA'
                        }}>
                            <button
                                onClick={() => setIsUnmatchedResolutionModalOpen(false)}
                                style={{
                                    padding: '8px 18px',
                                    borderRadius: '8px',
                                    border: '1px solid #CBD5E1',
                                    backgroundColor: '#FFFFFF',
                                    color: '#475569',
                                    fontWeight: 600,
                                    fontSize: '0.85rem',
                                    cursor: 'pointer'
                                }}
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* TOAST NOTIFICATION */}`;

if (!content.includes(modalInsertTarget)) {
    console.error('Modal insert target not found');
    process.exit(1);
}
content = content.replace(modalInsertTarget, resolutionModalCode);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully patched CommercialAgreementsModule.tsx for Hallazgo #3 (Opción 1)');
