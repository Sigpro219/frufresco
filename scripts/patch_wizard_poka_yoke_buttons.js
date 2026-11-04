const fs = require('fs');

const path = 'C:/Users/German Higuera/OneDrive/Documentos/Projects/frufresco/src/components/ManualDispatchWizardModal.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Patch Step 1 button
const step1Old = `                            <button
                                onClick={handleContinueToStep2}
                                disabled={savingSpaces || (!step1Confirmed && assignedCount === 0)}
                                style={{
                                    padding: '9px 20px', backgroundColor: '#0F172A', color: '#FFFFFF',
                                    border: 'none', borderRadius: '10px', fontWeight: '900', fontSize: '0.82rem',
                                    cursor: savingSpaces ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px',
                                    boxShadow: '0 2px 8px rgba(15, 23, 42, 0.25)'
                                }}
                            >
                                {savingSpaces ? (
                                    <>
                                        <RefreshCw size={14} className="animate-spin" /> Guardando bahías...
                                    </>
                                ) : (
                                    <>
                                        Continuar a Compras &amp; Recibo <ArrowRight size={14} />
                                    </>
                                )}
                            </button>`;

const step1New = `                            {step1Confirmed ? (
                                <button
                                    onClick={handleContinueToStep2}
                                    disabled={savingSpaces}
                                    style={{
                                        padding: '9px 20px', backgroundColor: '#0F172A', color: '#FFFFFF',
                                        border: 'none', borderRadius: '10px', fontWeight: '900', fontSize: '0.82rem',
                                        cursor: savingSpaces ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px',
                                        boxShadow: '0 2px 8px rgba(15, 23, 42, 0.25)'
                                    }}
                                >
                                    {savingSpaces ? (
                                        <>
                                            <RefreshCw size={14} className="animate-spin" /> Guardando bahías...
                                        </>
                                    ) : (
                                        <>
                                            Continuar a Compras &amp; Recibo <ArrowRight size={14} />
                                        </>
                                    )}
                                </button>
                            ) : (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', backgroundColor: '#F8FAFC', border: '1px dashed #CBD5E1', color: '#64748B', fontSize: '0.74rem', fontWeight: '700' }}>
                                    <Info size={14} color="#94A3B8" /> Marca la casilla para habilitar el avance
                                </div>
                            )}`;

// 2. Patch Step 2 button
const step2Old = `                            <button
                                onClick={() => {
                                    setStep2Confirmed(true);
                                    setCurrentStep(3);
                                }}
                                style={{
                                    padding: '9px 18px', backgroundColor: '#0F172A', color: '#FFFFFF',
                                    border: 'none', borderRadius: '10px', fontWeight: '900', fontSize: '0.82rem',
                                    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px'
                                }}
                            >
                                Continuar a Remisiones &amp; Manifiesto <ArrowRight size={14} />
                            </button>`;

const step2New = `                            {step2Confirmed ? (
                                <button
                                    onClick={() => {
                                        setCurrentStep(3);
                                    }}
                                    style={{
                                        padding: '9px 18px', backgroundColor: '#0F172A', color: '#FFFFFF',
                                        border: 'none', borderRadius: '10px', fontWeight: '900', fontSize: '0.82rem',
                                        cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px',
                                        boxShadow: '0 2px 8px rgba(15, 23, 42, 0.25)'
                                    }}
                                >
                                    Continuar a Remisiones &amp; Manifiesto <ArrowRight size={14} />
                                </button>
                            ) : (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', backgroundColor: '#F8FAFC', border: '1px dashed #CBD5E1', color: '#64748B', fontSize: '0.74rem', fontWeight: '700' }}>
                                    <Info size={14} color="#94A3B8" /> Marca la casilla para habilitar el avance
                                </div>
                            )}`;

// 3. Patch Step 3 button
const step3Old = `                            <button
                                onClick={() => {
                                    setStep3Confirmed(true);
                                    setCurrentStep(4);
                                }}
                                style={{
                                    padding: '9px 18px', backgroundColor: '#0F172A', color: '#FFFFFF',
                                    border: 'none', borderRadius: '10px', fontWeight: '900', fontSize: '0.82rem',
                                    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px'
                                }}
                            >
                                Continuar a Rótulos Térmicos <ArrowRight size={14} />
                            </button>`;

const step3New = `                            {step3Confirmed ? (
                                <button
                                    onClick={() => {
                                        setCurrentStep(4);
                                    }}
                                    style={{
                                        padding: '9px 18px', backgroundColor: '#0F172A', color: '#FFFFFF',
                                        border: 'none', borderRadius: '10px', fontWeight: '900', fontSize: '0.82rem',
                                        cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px',
                                        boxShadow: '0 2px 8px rgba(15, 23, 42, 0.25)'
                                    }}
                                >
                                    Continuar a Rótulos Térmicos <ArrowRight size={14} />
                                </button>
                            ) : (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', backgroundColor: '#F8FAFC', border: '1px dashed #CBD5E1', color: '#64748B', fontSize: '0.74rem', fontWeight: '700' }}>
                                    <Info size={14} color="#94A3B8" /> Marca la casilla para habilitar el avance
                                </div>
                            )}`;

// 4. Patch Step 4 button
const step4Old = `                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                <button
                                    onClick={handleFinalizeLaunch}
                                    disabled={finalizingLoading || !step4Confirmed || selectedOrderIds.size === 0}
                                    style={{
                                        padding: '12px 24px',
                                        backgroundColor: (!step4Confirmed || selectedOrderIds.size === 0) ? '#94A3B8' : '#059669',
                                        color: '#FFFFFF',
                                        border: 'none',
                                        borderRadius: '12px',
                                        fontWeight: '900',
                                        fontSize: '0.90rem',
                                        letterSpacing: '0.01em',
                                        cursor: finalizingLoading ? 'wait' : (!step4Confirmed || selectedOrderIds.size === 0) ? 'not-allowed' : 'pointer',
                                        boxShadow: (!step4Confirmed || selectedOrderIds.size === 0) ? 'none' : '0 4px 14px rgba(5, 150, 105, 0.4)',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        transition: 'all 0.15s ease',
                                        opacity: (!step4Confirmed || selectedOrderIds.size === 0) ? 0.75 : 1
                                    }}
                                    title={!step4Confirmed ? 'Debes marcar la casilla de verificación antes de finalizar' : 'Sellar y lanzar tanda'}
                                >
                                    <CheckCircle2 size={18} />
                                    {finalizingLoading ? 'Sellando Tanda en Base de Datos...' : 'FINALIZAR Y ENVIAR A PROCESO LOGÍSTICO'}
                                </button>
                                <span style={{ fontSize: '0.66rem', color: !step4Confirmed ? '#DC2626' : '#64748B', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    {!step4Confirmed ? (
                                        <>
                                            <AlertTriangle size={12} color="#DC2626" />
                                            Requiere verificación de rótulos para habilitar el botón
                                        </>
                                    ) : (
                                        <>
                                            Pasa pedidos a <strong>para_compra</strong> (Compras Corabastos &amp; Alistamiento)
                                        </>
                                    )}
                                </span>
                            </div>`;

const step4New = `                            {step4Confirmed ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                    <button
                                        onClick={handleFinalizeLaunch}
                                        disabled={finalizingLoading || selectedOrderIds.size === 0}
                                        style={{
                                            padding: '12px 24px',
                                            backgroundColor: selectedOrderIds.size === 0 ? '#94A3B8' : '#059669',
                                            color: '#FFFFFF',
                                            border: 'none',
                                            borderRadius: '12px',
                                            fontWeight: '900',
                                            fontSize: '0.90rem',
                                            letterSpacing: '0.01em',
                                            cursor: finalizingLoading ? 'wait' : selectedOrderIds.size === 0 ? 'not-allowed' : 'pointer',
                                            boxShadow: selectedOrderIds.size === 0 ? 'none' : '0 4px 14px rgba(5, 150, 105, 0.4)',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            transition: 'all 0.15s ease'
                                        }}
                                        title="Sellar y lanzar tanda"
                                    >
                                        <CheckCircle2 size={18} />
                                        {finalizingLoading ? 'Sellando Tanda en Base de Datos...' : 'FINALIZAR Y ENVIAR A PROCESO LOGÍSTICO'}
                                    </button>
                                    <span style={{ fontSize: '0.66rem', color: '#64748B', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                        Pasa pedidos a <strong>para_compra</strong> (Compras Corabastos &amp; Alistamiento)
                                    </span>
                                </div>
                            ) : (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 16px', borderRadius: '8px', backgroundColor: '#F8FAFC', border: '1px dashed #CBD5E1', color: '#64748B', fontSize: '0.74rem', fontWeight: '700' }}>
                                    <Info size={14} color="#94A3B8" /> Marca la casilla para habilitar el cierre de la tanda
                                </div>
                            )}`;

function replaceNormalize(str, target, replacement) {
  const normStr = str.replace(/\r\n/g, '\n');
  const normTarget = target.replace(/\r\n/g, '\n');
  const normReplacement = replacement.replace(/\r\n/g, '\n');
  if (!normStr.includes(normTarget)) {
    console.error('Target not found:', normTarget.substring(0, 100));
    return str;
  }
  return normStr.replace(normTarget, normReplacement);
}

content = replaceNormalize(content, step1Old, step1New);
content = replaceNormalize(content, step2Old, step2New);
content = replaceNormalize(content, step3Old, step3New);
content = replaceNormalize(content, step4Old, step4New);

fs.writeFileSync(path, content, 'utf8');
console.log('Patched ManualDispatchWizardModal.tsx successfully');
