const fs = require('fs');
const path = require('path');

const filePath = path.join('C:', 'Users', 'German Higuera', 'OneDrive', 'Documentos', 'Projects', 'frufresco', 'src', 'components', 'CommercialAgreementsModule.tsx');
let content = fs.readFileSync(filePath, 'utf8');

const targetStr = `            {/* TOAST NOTIFICATION */}`;

const modalsCode = `            {/* MODAL REVOCAR / ELIMINAR ACUERDO COMERCIAL (POKA-YOKE) */}
            {revokeTarget && (
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
                    zIndex: 2500,
                    padding: '16px'
                }}>
                    <div style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: '16px',
                        maxWidth: '520px',
                        width: '100%',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                        border: '1px solid #E2E8F0',
                        overflow: 'hidden'
                    }}>
                        <div style={{
                            padding: '20px 24px',
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
                                    <Trash2 size={20} />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#991B1B' }}>
                                        Revocar Acuerdo Comercial
                                    </h3>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#B91C1C' }}>
                                        Acuerdo #{revokeTarget.quote_number} &bull; {revokeTarget.client_name}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => !revoking && setRevokeTarget(null)}
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

                        <div style={{ padding: '24px' }}>
                            <div style={{
                                backgroundColor: '#FFFBEB',
                                border: '1px solid #FDE68A',
                                borderRadius: '10px',
                                padding: '14px',
                                marginBottom: '20px',
                                display: 'flex',
                                gap: '12px'
                            }}>
                                <AlertTriangle size={22} color="#D97706" style={{ flexShrink: 0, marginTop: '2px' }} />
                                <div style={{ fontSize: '0.85rem', color: '#92400E', lineHeight: '1.45' }}>
                                    <strong>¿Confirmas la revocación de este acuerdo?</strong>
                                    <p style={{ margin: '6px 0 0 0' }}>
                                        El estado pasará a <strong>Cancelado</strong>, liberando inmediatamente al cliente en la base de datos para que pueda crearse o asignarse un nuevo acuerdo comercial sin conflicto de unicidad. Los pedidos históricos no serán alterados.
                                    </p>
                                </div>
                            </div>

                            <div style={{
                                backgroundColor: '#F8FAFC',
                                borderRadius: '8px',
                                padding: '12px 16px',
                                border: '1px solid #E2E8F0',
                                fontSize: '0.85rem',
                                color: '#475569'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <span style={{ color: '#64748B' }}>Cliente:</span>
                                    <span style={{ fontWeight: 600, color: '#0F172A' }}>{revokeTarget.client_name}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <span style={{ color: '#64748B' }}>NIT / Identificación:</span>
                                    <span style={{ fontWeight: 600, color: '#0F172A' }}>{revokeTarget.client_nit || 'Sin NIT'}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: '#64748B' }}>Items en lista:</span>
                                    <span style={{ fontWeight: 600, color: '#0F172A' }}>{revokeTarget.items_count || 0} productos</span>
                                </div>
                            </div>
                        </div>

                        <div style={{
                            padding: '16px 24px',
                            borderTop: '1px solid #F1F5F9',
                            display: 'flex',
                            justifyContent: 'flex-end',
                            gap: '12px',
                            backgroundColor: '#FAFAFA'
                        }}>
                            <button
                                onClick={() => setRevokeTarget(null)}
                                disabled={revoking}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '8px',
                                    border: '1px solid #CBD5E1',
                                    backgroundColor: '#FFFFFF',
                                    color: '#475569',
                                    fontWeight: 600,
                                    fontSize: '0.85rem',
                                    cursor: revoking ? 'not-allowed' : 'pointer'
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleRevokeSubmit}
                                disabled={revoking}
                                style={{
                                    padding: '8px 18px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    backgroundColor: '#DC2626',
                                    color: '#FFFFFF',
                                    fontWeight: 700,
                                    fontSize: '0.85rem',
                                    cursor: revoking ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    boxShadow: '0 4px 12px rgba(220, 38, 38, 0.25)'
                                }}
                            >
                                {revoking ? (
                                    <><Loader2 size={16} className="animate-spin" /> Revocando...</>
                                ) : (
                                    <><Trash2 size={16} /> Confirmar y Revocar</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL CONTROL DE CLIENTES SIN ACUERDO COMERCIAL */}
            {isClientsWithoutAgreementModalOpen && (
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
                    zIndex: 2500,
                    padding: '16px'
                }}>
                    <div style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: '16px',
                        maxWidth: '720px',
                        width: '100%',
                        maxHeight: '85vh',
                        display: 'flex',
                        flexDirection: 'column',
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
                            backgroundColor: '#F8FAFC'
                        }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0F172A' }}>
                                        Clientes B2B Institucionales Sin Acuerdo Activo
                                    </h3>
                                    <span style={{
                                        backgroundColor: clientsWithoutAgreement.length > 0 ? '#DBEAFE' : '#D1FAE5',
                                        color: clientsWithoutAgreement.length > 0 ? '#1D4ED8' : '#065F46',
                                        fontSize: '0.75rem',
                                        fontWeight: 700,
                                        padding: '2px 8px',
                                        borderRadius: '12px'
                                    }}>
                                        {clientsWithoutAgreement.length} clientes
                                    </span>
                                </div>
                                <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#64748B' }}>
                                    Clientes institucionales registrados que no poseen lista de precios activa ni vinculación compartida.
                                </p>
                            </div>
                            <button
                                onClick={() => setIsClientsWithoutAgreementModalOpen(false)}
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

                        {/* Search in modal */}
                        <div style={{ padding: '14px 24px', borderBottom: '1px solid #F1F5F9', backgroundColor: '#FFFFFF' }}>
                            <div style={{ position: 'relative' }}>
                                <Search size={16} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '10px' }} />
                                <input
                                    type="text"
                                    placeholder="Filtrar por razón social o NIT..."
                                    value={clientsWithoutAgreementSearch}
                                    onChange={(e) => setClientsWithoutAgreementSearch(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px 8px 36px',
                                        borderRadius: '8px',
                                        border: '1px solid #CBD5E1',
                                        fontSize: '0.85rem',
                                        outline: 'none'
                                    }}
                                />
                            </div>
                        </div>

                        {/* Clients list */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
                            {clientsWithoutAgreement.filter(c => {
                                const term = clientsWithoutAgreementSearch.toLowerCase();
                                return (c.company_name || '').toLowerCase().includes(term) || (c.vat_number || '').includes(term);
                            }).length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748B' }}>
                                    <Check size={36} color="#0D7A57" style={{ margin: '0 auto 12px' }} />
                                    <p style={{ margin: 0, fontWeight: 600, color: '#0F172A' }}>
                                        {clientsWithoutAgreement.length === 0 
                                            ? '¡Excelente control! Todos los clientes institucionales tienen acuerdo comercial activo.'
                                            : 'No se encontraron clientes con el filtro ingresado.'}
                                    </p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {clientsWithoutAgreement
                                        .filter(c => {
                                            const term = clientsWithoutAgreementSearch.toLowerCase();
                                            return (c.company_name || '').toLowerCase().includes(term) || (c.vat_number || '').includes(term);
                                        })
                                        .map(client => (
                                            <div
                                                key={client.id}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    padding: '12px 16px',
                                                    borderRadius: '10px',
                                                    border: '1px solid #E2E8F0',
                                                    backgroundColor: '#FFFFFF',
                                                    transition: 'all 0.15s ease'
                                                }}
                                            >
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0F172A' }}>
                                                            {client.company_name}
                                                        </span>
                                                        {client.parent_id && (
                                                            <span style={{
                                                                fontSize: '0.7rem',
                                                                backgroundColor: '#F1F5F9',
                                                                color: '#475569',
                                                                padding: '1px 6px',
                                                                borderRadius: '4px'
                                                            }}>
                                                                Sede
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '2px' }}>
                                                        NIT: <strong style={{ color: '#334155' }}>{client.vat_number || 'Sin NIT'}</strong> &bull; Contacto: {client.contact_name || client.phone || 'N/A'}
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleOpenCreateWithClient(client.id)}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '6px',
                                                        padding: '7px 14px',
                                                        borderRadius: '8px',
                                                        border: 'none',
                                                        backgroundColor: '#0D7A57',
                                                        color: '#FFFFFF',
                                                        fontWeight: 600,
                                                        fontSize: '0.8rem',
                                                        cursor: 'pointer',
                                                        boxShadow: '0 2px 6px rgba(13, 122, 87, 0.2)'
                                                    }}
                                                >
                                                    <Plus size={14} strokeWidth={2.5} /> Crear Acuerdo
                                                </button>
                                            </div>
                                        ))}
                                </div>
                            )}
                        </div>

                        <div style={{
                            padding: '14px 24px',
                            borderTop: '1px solid #F1F5F9',
                            display: 'flex',
                            justifyContent: 'flex-end',
                            backgroundColor: '#FAFAFA'
                        }}>
                            <button
                                onClick={() => setIsClientsWithoutAgreementModalOpen(false)}
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
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* TOAST NOTIFICATION */}`;

if (!content.includes(targetStr)) {
    console.error('Target string not found');
    process.exit(1);
}

content = content.replace(targetStr, modalsCode);
fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully inserted Hallazgo #2 modals into CommercialAgreementsModule.tsx');
