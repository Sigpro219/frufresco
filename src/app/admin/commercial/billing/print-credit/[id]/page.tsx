'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useParams } from 'next/navigation';
import { THEME, formatMoney } from '@/lib/adminTheme';

export default function CreditPrintPage() {
    const { id } = useParams();
    const [client, setClient] = useState<any>(null);
    const [dossier, setDossier] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    // Print options state
    const [printDoc, setPrintDoc] = useState<'all' | 'solicitud' | 'pagare'>('all');
    const [formatMode, setFormatMode] = useState<'natural' | 'juridica'>('natural');

    const isBlankMode = id === 'blank';

    useEffect(() => {
        const fetchDossierData = async () => {
            try {
                if (id === 'blank') {
                    setClient({
                        company_name: '',
                        nit: '',
                        razon_social: '',
                        address: '',
                        city: '',
                        department: '',
                        phone: '',
                        contact_name: '',
                        contact_phone: '',
                        email: ''
                    });
                    setDossier({
                        tipo_contribuyente: 'persona_natural'
                    });
                    setFormatMode('natural');
                    setLoading(false);
                    return;
                }
                
                // 1. Fetch client profile
                const { data: clientData } = await supabase
                    .from('profiles')
                    .eq('id', id)
                    .single();
                setClient(clientData);

                // 2. Fetch credit dossier
                const { data: dossierData } = await supabase
                    .from('client_credit_dossiers')
                    .eq('profile_id', id)
                    .single();
                setDossier(dossierData);

                if (dossierData) {
                    setFormatMode(dossierData.tipo_contribuyente === 'persona_juridica' ? 'juridica' : 'natural');
                }
            } catch (err) {
                console.error('Error fetching dossier:', err);
            } finally {
                setLoading(false);
            }
        };

        if (id) fetchDossierData();
    }, [id]);

    if (loading) return <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>Cargando expediente de crédito...</div>;
    if (!client) return <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>Cliente no encontrado.</div>;

    const d = dossier || {};
    
    // Clean fallback arrays for blank/empty modes (no underscores in empty cells)
    const contacts = (isBlankMode || !d.contactos || d.contactos.length === 0) ? [
        { area: 'Compras/pedidos', nombre: '', telefono: '', celular: '', email: '', cargo: '' },
        { area: 'Contabilidad/tesoreria', nombre: '', telefono: '', celular: '', email: '', cargo: '' },
        { area: 'Representante Legal', nombre: '', telefono: '', celular: '', email: '', cargo: '' }
    ] : d.contactos.map((c: any) => {
        if (c.area === 'Oficial de Cumplimiento') {
            return { ...c, area: 'Representante Legal' };
        }
        return c;
    });

    const shareholders = (isBlankMode || !d.participacion_accionaria || d.participacion_accionaria.length === 0) ? [
        { nombre: '', tipo_id: '', numero_id: '', participacion_pct: '', es_pep: false },
        { nombre: '', tipo_id: '', numero_id: '', participacion_pct: '', es_pep: false },
        { nombre: '', tipo_id: '', numero_id: '', participacion_pct: '', es_pep: false }
    ] : d.participacion_accionaria;

    const internationalOps = d.operaciones_internacionales_detalle || { transferencias: false, importaciones: false, exportaciones: false, inversiones: false, giros: false, pago_servicio: false, otros: '' };
    const taxClasses = d.clase_contribuyente || {};
    
    const commercialRefs = (isBlankMode || !d.referencias_comerciales || d.referencias_comerciales.length === 0) ? [
        { entidad: '', contacto: '', telefono: '', ciudad: '', cupo: '', plazo: '' },
        { entidad: '', contacto: '', telefono: '', ciudad: '', cupo: '', plazo: '' }
    ] : d.referencias_comerciales;

    const personalRefs = (isBlankMode || !d.referencias_personales || d.referencias_personales.length === 0) ? [
        { nombre: '', direccion: '', telefono: '', celular: '', relacion: '' },
        { nombre: '', direccion: '', telefono: '', celular: '', relacion: '' }
    ] : d.referencias_personales;

    const paymentCond = d.condiciones_pago || { consignacion: false, transferencia: false, cheque: false, otro: '' };
    
    const pagareDeudor = isBlankMode ? { nombre: '', deudor_solidario: '', identificacion: '', direccion: '', barrio: '', celular: '', telefono: '', email: '' } : (d.pagare_firma_deudor || { nombre: client.contact_name || '', deudor_solidario: '', identificacion: client.nit || '', direccion: client.address || '', barrio: '', celular: client.contact_phone || '', telefono: '', email: client.email || '' });
    const pagareCodeudor = d.pagare_firma_codeudor || { nombre: '', identificacion: '', direccion: '', barrio: '', celular: '', telefono: '', email: '' };

    const formatDate = (dateStr?: string) => {
        if (!dateStr || isBlankMode) {
            return (
                <>
                    <span style={{ display: 'inline-block', borderBottom: '1px dotted #000', width: '2.5em', height: '1px', verticalAlign: 'bottom', margin: '0 2px' }}></span>
                    {` de `}
                    <span style={{ display: 'inline-block', borderBottom: '1px dotted #000', width: '8.5em', height: '1px', verticalAlign: 'bottom', margin: '0 2px' }}></span>
                    {` de 202`}
                    <span style={{ display: 'inline-block', borderBottom: '1px dotted #000', width: '1.2em', height: '1px', verticalAlign: 'bottom', margin: '0 2px' }}></span>
                </>
            );
        }
        return new Date(dateStr).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
    };

    // Helper to render field underlines inside text flow only, NOT in cells
    const displayInlineVal = (val: any, placeholder: string = '____________________') => {
        const hasVal = !isBlankMode && val;
        if (!hasVal) {
            if (placeholder.startsWith('_')) {
                const len = placeholder.length;
                return (
                    <span style={{
                        display: 'inline-block',
                        borderBottom: '1px dotted #000',
                        width: `${len * 0.48}em`,
                        height: '1px',
                        verticalAlign: 'bottom',
                        margin: '0 2px'
                    }}></span>
                );
            }
            return placeholder;
        }
        return val;
    };

    // Helper for table cells (always clean and empty when blank)
    const displayCellVal = (val: any) => {
        if (isBlankMode || !val) {
            return '';
        }
        return val;
    };

    const renderCheckbox = (checked: boolean) => (
        <span style={{
            display: 'inline-block',
            width: '12px',
            height: '12px',
            border: '1px solid #000',
            lineHeight: '10px',
            textAlign: 'center',
            fontSize: '9px',
            fontFamily: 'Arial, sans-serif',
            fontWeight: 'bold',
            verticalAlign: 'middle',
            backgroundColor: '#fff',
            color: '#000',
            userSelect: 'none'
        }}>
            {checked ? 'X' : ''}
        </span>
    );

    // Standardized header layout matching Page 1 of original PDF
    const renderPageHeader = (pageNumber: number, totalPages: number, title: string = "SOLICITUD DE CRÉDITO Y CONOCIMIENTO DE CLIENTES") => (
        <table className="form-table" style={{ marginBottom: '8px', border: '1.5px solid #000' }}>
            <tbody>
                <tr>
                    <td rowSpan={4} style={{ width: '190px', textAlign: 'center', padding: '8px 4px', border: '1px solid #333', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                            <img src="/logo-investments.png" alt="Investments Cortés" style={{ height: '62px', objectFit: 'contain' }} />
                            <div style={{ fontSize: '8px', fontWeight: 'bold', color: '#000', lineHeight: '1.1' }}>INVESTMENTS CORTES S.A.S.</div>
                            <div style={{ fontSize: '7px', color: '#555', lineHeight: '1.1' }}>NIT: 901.393.217-5 | Tel: 3154063876</div>
                        </div>
                    </td>
                    <td rowSpan={4} style={{ textAlign: 'center', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', border: '1px solid #333', verticalAlign: 'middle', padding: '4px' }}>
                        {title}
                    </td>
                    <td style={{ width: '135px', fontWeight: 'bold', fontSize: '9px', padding: '4px 8px', border: '1px solid #333', verticalAlign: 'middle' }}>CÓDIGO: FC-001</td>
                </tr>
                <tr>
                    <td style={{ fontWeight: 'bold', fontSize: '9px', padding: '4px 8px', border: '1px solid #333', verticalAlign: 'middle' }}>VERSIÓN: 001</td>
                </tr>
                <tr>
                    <td style={{ fontWeight: 'bold', fontSize: '9px', padding: '4px 8px', border: '1px solid #333', verticalAlign: 'middle' }}>PÁGINA: {pageNumber} de {totalPages}</td>
                </tr>
                <tr>
                    <td style={{ fontWeight: 'bold', fontSize: '9px', padding: '4px 8px', border: '1px solid #333', verticalAlign: 'middle' }}>FECHA: 19/06/2026</td>
                </tr>
            </tbody>
        </table>
    );

    const showSolicitud = printDoc === 'all' || printDoc === 'solicitud';
    const showPagare = printDoc === 'all' || printDoc === 'pagare';

    return (
        <div style={{ backgroundColor: '#fff', color: '#000', fontFamily: 'Arial, sans-serif', fontSize: '10px', lineHeight: '1.25' }}>
            <style>
                {`
                @page {
                    size: letter portrait;
                    margin: 8mm 10mm;
                }
                @media print {
                    .no-print { display: none !important; }
                    .page-break { page-break-after: always; display: block; clear: both; }
                    body { background: white !important; margin: 0 !important; padding: 0 !important; }
                    .print-page-sheet {
                        width: 215.9mm !important;
                        height: 279.4mm !important;
                        box-shadow: none !important;
                        border-radius: 0 !important;
                        margin: 0 !important;
                        padding: 10mm 15mm !important;
                        box-sizing: border-box !important;
                        page-break-after: always !important;
                        overflow: hidden !important;
                    }
                    .print-page-sheet.pagare-sheet {
                        padding: 15mm 20mm !important;
                    }
                    .print-page-sheet:last-child {
                        page-break-after: avoid !important;
                    }
                }
                .print-page-sheet {
                    max-width: 800px;
                    margin: 20px auto;
                    background-color: #fff;
                    padding: 15px 20px;
                    box-shadow: 0 4px 25px rgba(0, 0, 0, 0.08);
                    border-radius: 8px;
                    box-sizing: border-box;
                }
                .print-page-sheet.pagare-sheet {
                    padding: 55px 65px;
                }
                .form-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 6px;
                    border: 1.2px solid #333;
                }
                .form-table td, .form-table th {
                    border: 1px solid #b2b2b2;
                    padding: 4px 6px;
                    vertical-align: middle;
                }
                .form-table tr {
                    height: 32px; /* standard notebook line height for handwriting */
                }
                .form-table th {
                    background-color: #f8f9fa;
                    text-align: left;
                    font-weight: bold;
                    text-transform: uppercase;
                    font-size: 8px;
                    color: #333;
                }
                .section-header {
                    background-color: #e8f5e9;
                    border: 1px solid #0D7A57;
                    border-left: 4px solid #0D7A57;
                    color: #0D7A57;
                    text-align: left;
                    font-weight: bold;
                    font-size: 9px;
                    padding: 4px 8px;
                    margin-bottom: 4px;
                    text-transform: uppercase;
                }
                .signature-box {
                    border: 1px solid #000;
                    height: 40px;
                    margin-top: 4px;
                }
                .checkbox-container {
                    display: inline-flex;
                    align-items: center;
                    margin-right: 8px;
                }
                .legal-text {
                    font-size: 8.8px;
                    text-align: justify;
                    line-height: 1.45;
                    margin-bottom: 6px;
                    color: #222;
                }
                .legal-title {
                    font-weight: bold;
                    text-align: center;
                    font-size: 8px;
                    margin-bottom: 4px;
                    text-transform: uppercase;
                    color: #111;
                }
                `}
            </style>

            {/* Float Print Control Toolbar */}
            <div className="no-print" style={{ position: 'fixed', top: 0, left: 0, right: 0, backgroundColor: '#f8f9fa', borderBottom: '2px solid #0D7A57', padding: '8px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 2000, boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <h3 style={{ margin: 0, fontFamily: 'sans-serif', fontSize: '13px', color: '#333' }}>
                        Documentos de Crédito - <b>{isBlankMode ? 'Expediente Vacío' : client.company_name}</b>
                    </h3>
                    
                    {/* View/Print Selection */}
                    <div style={{ display: 'flex', gap: '4px', backgroundColor: '#e9ecef', padding: '3px', borderRadius: '6px' }}>
                        <button 
                            onClick={() => setPrintDoc('all')} 
                            style={{ padding: '6px 12px', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', backgroundColor: printDoc === 'all' ? '#0D7A57' : 'transparent', color: printDoc === 'all' ? '#fff' : '#495057', transition: 'all 0.15s' }}
                        >
                            📄 Todo (6 Págs)
                        </button>
                        <button 
                            onClick={() => setPrintDoc('solicitud')} 
                            style={{ padding: '6px 12px', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', backgroundColor: printDoc === 'solicitud' ? '#0D7A57' : 'transparent', color: printDoc === 'solicitud' ? '#fff' : '#495057', transition: 'all 0.15s' }}
                        >
                            📝 Solicitud (4 Págs)
                        </button>
                        <button 
                            onClick={() => setPrintDoc('pagare')} 
                            style={{ padding: '6px 12px', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', backgroundColor: printDoc === 'pagare' ? '#0D7A57' : 'transparent', color: printDoc === 'pagare' ? '#fff' : '#495057', transition: 'all 0.15s' }}
                        >
                            ⚖️ Pagaré (2 Págs)
                        </button>
                    </div>

                    {/* Promissory Note Type Switcher */}
                    <div style={{ display: 'flex', gap: '4px', backgroundColor: '#e9ecef', padding: '3px', borderRadius: '6px', alignItems: 'center' }}>
                        <span style={{ fontSize: '10px', padding: '0 6px', color: '#495057', fontWeight: 'bold' }}>Formato Pagaré:</span>
                        <button 
                            onClick={() => setFormatMode('natural')} 
                            style={{ padding: '6px 10px', border: 'none', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', backgroundColor: formatMode === 'natural' ? '#0D7A57' : 'transparent', color: formatMode === 'natural' ? '#fff' : '#495057', transition: 'all 0.15s' }}
                        >
                            Persona Natural
                        </button>
                        <button 
                            onClick={() => setFormatMode('juridica')} 
                            style={{ padding: '6px 10px', border: 'none', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', backgroundColor: formatMode === 'juridica' ? '#0D7A57' : 'transparent', color: formatMode === 'juridica' ? '#fff' : '#495057', transition: 'all 0.15s' }}
                        >
                            Persona Jurídica
                        </button>
                    </div>
                </div>

                <button 
                    onClick={() => window.print()} 
                    style={{ padding: '8px 16px', background: '#0D7A57', color: '#fff', borderRadius: '6px', cursor: 'pointer', border: 'none', fontWeight: 'bold', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 2px 4px rgba(13,122,87,0.3)' }}
                >
                    🖨️ Imprimir Selección
                </button>
            </div>

            {/* Offset for floating toolbar */}
            <div className="no-print" style={{ height: '52px' }}></div>

            <div>
                
                {/* ======================================================== */}
                {/* DOCUMENT 1: SOLICITUD DE CRÉDITO (PAGES 1 - 4)           */}
                {/* ======================================================== */}
                {showSolicitud && (
                    <>
                        {/* PÁGINA 1: SOLICITUD DE CRÉDITO - HEADER & BASIC INFO */}
                        <div className="print-page-sheet page-break">
                            {renderPageHeader(1, 4)}

                            {/* Form Header Info */}
                            <table className="form-table">
                                <tbody>
                                    <tr>
                                        <td style={{ width: '25%' }}><b>TIPO DE ESTABLECIMIENTO:</b></td>
                                        <td style={{ width: '25%' }}>{displayCellVal(d.tipo_establecimiento || d.tipo_negocio || '')}</td>
                                        <td style={{ width: '10%' }}><b>CIUDAD /<br />MUNICIPIO:</b></td>
                                        <td style={{ width: '15%' }}>{displayCellVal(d.ciudad)}</td>
                                        <td style={{ width: '10%' }}><b>CUPO:</b></td>
                                        <td style={{ width: '15%' }}>{(!isBlankMode && d.cupo_solicitado) ? `$${d.cupo_solicitado.toLocaleString('es-CO')}` : ''}</td>
                                    </tr>
                                    <tr>
                                        <td><b>PLAZO:</b></td>
                                        <td>
                                            <div style={{ fontSize: '8px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                <span className="checkbox-container">{renderCheckbox(!isBlankMode && d.plazo_solicitado === 8)} 8 días</span>
                                                <span className="checkbox-container">{renderCheckbox(!isBlankMode && d.plazo_solicitado === 15)} 15 días</span>
                                                <span className="checkbox-container">{renderCheckbox(!isBlankMode && d.plazo_solicitado === 30)} 30 días</span>
                                                <span className="checkbox-container">{renderCheckbox(!isBlankMode && d.plazo_solicitado === 45)} 45 días</span>
                                                <span className="checkbox-container">{renderCheckbox(!isBlankMode && ![8, 15, 30, 45].includes(d.plazo_solicitado) && !!d.plazo_solicitado)} Otro: {(![8, 15, 30, 45].includes(d.plazo_solicitado) && d.plazo_solicitado) ? `${d.plazo_solicitado}d` : ''}</span>
                                            </div>
                                        </td>
                                        <td><b>FECHA SOLICITUD:</b></td>
                                        <td>{displayCellVal(d.fecha_solicitud)}</td>
                                        <td><b>SOLICITUD:</b></td>
                                        <td colSpan={1}>
                                            <div style={{ fontSize: '8px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                <span className="checkbox-container">{renderCheckbox(!isBlankMode && d.tipo_solicitud === 'creacion')} Creación</span>
                                                <span className="checkbox-container">{renderCheckbox(!isBlankMode && d.tipo_solicitud === 'actualizacion')} Actualización</span>
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>

                            {/* BASIC INFO */}
                            <div className="section-header">1. Información Básica</div>
                            <table className="form-table">
                                <colgroup>
                                    <col style={{ width: '15%' }} />
                                    <col style={{ width: '12.5%' }} />
                                    <col style={{ width: '12.5%' }} />
                                    <col style={{ width: '12.5%' }} />
                                    <col style={{ width: '12.5%' }} />
                                    <col style={{ width: '18%' }} />
                                    <col style={{ width: '17%' }} />
                                </colgroup>
                                <tbody>
                                    <tr>
                                        <td><b>Nombre o razón social:</b></td>
                                        <td colSpan={4} style={{ fontWeight: 'bold' }}>{displayCellVal(d.razon_social || client.razon_social || client.company_name)}</td>
                                        <td><b>NIT / C.C:</b></td>
                                        <td style={{ fontWeight: 'bold' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', height: '100%' }}>
                                                <span>{displayCellVal(isBlankMode ? '' : (d.nit || client.nit || '').split('-')[0])}</span>
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '8px' }}>
                                                    - DV: 
                                                    <span style={{ display: 'inline-block', width: '14px', height: '14px', border: '1px solid #000', textAlign: 'center', lineHeight: '14px', fontSize: '9px', fontWeight: 'bold', backgroundColor: '#fff', marginLeft: '2px' }}>
                                                        {displayCellVal(isBlankMode ? '' : (d.nit || client.nit || '').split('-')[1] || '')}
                                                    </span>
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td><b>Nombre Comercial:</b></td>
                                        <td colSpan={6}>{displayCellVal(d.nombre_comercial || client.company_name)}</td>
                                    </tr>
                                    <tr>
                                        <td><b>Dirección:</b></td>
                                        <td colSpan={2}>{displayCellVal(d.direccion || client.address)}</td>
                                        <td><b>Ciudad o Municipio:</b></td>
                                        <td>{displayCellVal(d.ciudad_info || client.city)}</td>
                                        <td><b>Dpto:</b></td>
                                        <td>{displayCellVal(d.departamento_info || client.department)}</td>
                                    </tr>
                                    <tr>
                                        <td><b>Teléfono:</b></td>
                                        <td>{displayCellVal(d.telefono || client.phone || client.contact_phone)}</td>
                                        <td><b>Celular:</b></td>
                                        <td>{displayCellVal(pagareDeudor.celular)}</td>
                                        <td><b>E-mail:</b></td>
                                        <td colSpan={2}>{displayCellVal(pagareDeudor.email)}</td>
                                    </tr>
                                    <tr>
                                        <td><b>Actividad Econ. Ppal:</b></td>
                                        <td colSpan={3}>{displayCellVal(d.actividad_economica_principal)}</td>
                                        <td><b>Código CIIU:</b></td>
                                        <td colSpan={2}>{displayCellVal(d.ciiu_principal)}</td>
                                    </tr>
                                    {/* REPRESENTANTE LEGAL WITH NEW FIELDS */}
                                    <tr>
                                        <td><b>Representante Legal:</b></td>
                                        <td colSpan={2} style={{ fontWeight: 'bold' }}>{displayCellVal(d.rep_legal_nombre || client.contact_name)}</td>
                                        <td><b>Identificación:</b></td>
                                        <td>{displayCellVal(d.rep_legal_identificacion)}</td>
                                        <td><b>Dir. Residencia:</b></td>
                                        <td colSpan={2}>{displayCellVal(d.rep_legal_direccion)}</td>
                                    </tr>
                                    <tr>
                                        <td><b>Teléfono Rep. Legal:</b></td>
                                        <td>{displayCellVal(d.rep_legal_telefono)}</td>
                                        <td><b>Celular Rep. Legal:</b></td>
                                        <td>{displayCellVal(d.rep_legal_celular)}</td>
                                        <td><b>E-mail Rep. Legal:</b></td>
                                        <td>{displayCellVal(d.rep_legal_email)}</td>
                                        <td><b>¿Es PEP?:</b> SI {renderCheckbox(!isBlankMode && !!d.rep_legal_es_pep)} NO {renderCheckbox(!isBlankMode && !d.rep_legal_es_pep)}</td>
                                    </tr>
                                </tbody>
                            </table>

                            {/* SUCURSALES */}
                            <div className="section-header">Sucursales (especificar sucursales a crear)</div>
                            <table className="form-table">
                                <tbody>
                                    <tr>
                                        <td style={{ width: '33%' }}><b>1.</b> {displayCellVal(d.sucursales_a_crear?.[0])}</td>
                                        <td style={{ width: '33%' }}><b>2.</b> {displayCellVal(d.sucursales_a_crear?.[1])}</td>
                                        <td style={{ width: '33%' }}><b>3.</b> {displayCellVal(d.sucursales_a_crear?.[2])}</td>
                                    </tr>
                                    <tr>
                                        <td><b>4.</b> {displayCellVal(d.sucursales_a_crear?.[3])}</td>
                                        <td><b>5.</b> {displayCellVal(d.sucursales_a_crear?.[4])}</td>
                                        <td><b>6.</b> {displayCellVal(d.sucursales_a_crear?.[5])}</td>
                                    </tr>
                                </tbody>
                            </table>

                            {/* CONTACTS */}
                            <div className="section-header">2. Contactos Autorizados</div>
                            <table className="form-table" style={{ marginBottom: '0px' }}>
                                <thead>
                                    <tr>
                                        <th style={{ width: '20%' }}>Área o Proceso</th>
                                        <th style={{ width: '25%' }}>Nombre Completo</th>
                                        <th style={{ width: '12%' }}>Teléfono</th>
                                        <th style={{ width: '13%' }}>Celular</th>
                                        <th style={{ width: '18%' }}>Email</th>
                                        <th style={{ width: '12%' }}>Cargo</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {contacts.map((contact: any, i: number) => (
                                        <tr key={i}>
                                            <td><b>{contact.area}</b></td>
                                            <td>{displayCellVal(contact.nombre)}</td>
                                            <td>{displayCellVal(contact.telefono)}</td>
                                            <td>{displayCellVal(contact.celular)}</td>
                                            <td>{displayCellVal(contact.email)}</td>
                                            <td>{displayCellVal(contact.cargo)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {/* SHAREHOLDERS */}
                            <div className="section-header">3. Participación Accionaria (Accionistas con &gt; 5% capital social)</div>
                            <table className="form-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: '40%' }}>Nombre Completo o Razón Social</th>
                                        <th style={{ width: '15%' }}>Tipo ID</th>
                                        <th style={{ width: '20%' }}>Número ID</th>
                                        <th style={{ width: '15%' }}>% Participación</th>
                                        <th style={{ width: '10%' }}>Es PEP</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {shareholders.map((sh: any, i: number) => (
                                        <tr key={i}>
                                            <td style={{ fontWeight: 'bold' }}>{displayCellVal(sh.nombre)}</td>
                                            <td>{displayCellVal(sh.tipo_id)}</td>
                                            <td>{displayCellVal(sh.numero_id)}</td>
                                            <td>{sh.participacion_pct ? `${sh.participacion_pct}%` : ''}</td>
                                            <td>{isBlankMode ? '' : (sh.es_pep ? 'SI' : 'NO')}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* PÁGINA 2: SOLICITUD DE CRÉDITO - INTERNATIONAL OPS & FINANCIALS */}
                        <div className="print-page-sheet page-break">
                            {renderPageHeader(2, 4)}

                            {/* INTERNATIONAL OPS WITH DYNAMIC CATEGORIES AND PRODUCTS TABLE */}
                            <div className="section-header">4. Información de Operaciones Internacionales</div>
                            <table className="form-table">
                                <tbody>
                                    <tr>
                                        <td style={{ width: '35%' }}><b>¿Realiza Operaciones Internacionales?</b></td>
                                        <td style={{ width: '15%' }}>
                                            SI {renderCheckbox(!isBlankMode && !!d.realiza_operaciones_internacionales)}
                                            &nbsp;&nbsp;&nbsp;
                                            NO {renderCheckbox(!isBlankMode && !d.realiza_operaciones_internacionales)}
                                        </td>
                                        <td style={{ width: '15%' }}><b>Tipo de Operación:</b></td>
                                        <td colSpan={3} style={{ fontSize: '8px' }}>
                                            <span className="checkbox-container">{renderCheckbox(!isBlankMode && !!internationalOps.transferencias)} Transferencias</span>
                                            <span className="checkbox-container">{renderCheckbox(!isBlankMode && !!internationalOps.importaciones)} Importaciones</span>
                                            <span className="checkbox-container">{renderCheckbox(!isBlankMode && !!internationalOps.exportaciones)} Exportaciones</span>
                                            <span className="checkbox-container">{renderCheckbox(!isBlankMode && !!internationalOps.inversiones)} Inversiones</span>
                                            <span className="checkbox-container">{renderCheckbox(!isBlankMode && !!internationalOps.giros)} Giros</span>
                                            <span className="checkbox-container">{renderCheckbox(!isBlankMode && !!internationalOps.pago_servicio)} Pago servicio</span>
                                            <span className="checkbox-container">{renderCheckbox(!isBlankMode && !!internationalOps.otros)} Otros</span>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>

                            {/* PRODUCTOS FINANCIEROS INTERNACIONALES TABLE */}
                            <div style={{ fontSize: '9px', fontWeight: 'bold', marginBottom: '3px' }}>
                                ¿Tiene productos financieros en el exterior?
                                &nbsp;&nbsp;&nbsp;
                                SI {renderCheckbox(!isBlankMode && !!d.tiene_productos_financieros_internacionales)}
                                &nbsp;&nbsp;&nbsp;
                                NO {renderCheckbox(!isBlankMode && !d.tiene_productos_financieros_internacionales)}
                            </div>
                            <table className="form-table" style={{ marginBottom: '8px' }}>
                                <thead>
                                    <tr>
                                        <th style={{ width: '25%', padding: '3px 6px' }}>Tipo de Producto</th>
                                        <th style={{ width: '25%', padding: '3px 6px' }}>Moneda</th>
                                        <th style={{ width: '25%', padding: '3px 6px' }}>País</th>
                                        <th style={{ width: '25%', padding: '3px 6px' }}>Ciudad</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[0, 1].map((idx) => {
                                        const prod = (d.productos_financieros_internacionales_detalle?.productos || [])[idx] || {};
                                        return (
                                            <tr key={idx} style={{ height: '28px' }}>
                                                <td>{displayCellVal(prod.tipo)}</td>
                                                <td>{displayCellVal(prod.moneda)}</td>
                                                <td>{displayCellVal(prod.pais)}</td>
                                                <td>{displayCellVal(prod.ciudad)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>

                            {/* FINANCIAL & TAX INFO GRID */}
                            <div className="section-header">5. Información Financiera y Tributaria</div>
                            <table className="form-table">
                                <tbody>
                                    <tr>
                                        <td style={{ width: '15%' }}><b>Tipo Persona:</b></td>
                                        <td style={{ width: '35%' }}>
                                            <span className="checkbox-container">{renderCheckbox(!isBlankMode && d.tipo_contribuyente === 'persona_natural')} Persona Natural</span>
                                            <span className="checkbox-container">{renderCheckbox(!isBlankMode && d.tipo_contribuyente === 'persona_juridica')} Persona Jurídica</span>
                                        </td>
                                        <td style={{ width: '15%' }}><b>Responsable IVA:</b></td>
                                        <td style={{ width: '35%' }}>
                                            <span className="checkbox-container">{renderCheckbox(!isBlankMode && !!taxClasses.regimen_comun)} Régimen Común (Resp.)</span>
                                            <span className="checkbox-container">{renderCheckbox(!isBlankMode && !!taxClasses.regimen_simplificado)} Régimen Simplificado (No Resp.)</span>
                                            <span className="checkbox-container">{renderCheckbox(!isBlankMode && !!taxClasses.regimen_simple)} Régimen Simple (RST)</span>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td><b>Clase Contribuyente:</b></td>
                                        <td colSpan={3} style={{ fontSize: '8px' }}>
                                            <span className="checkbox-container">{renderCheckbox(!isBlankMode && !!taxClasses.gran_contribuyente)} Gran Contribuyente</span>
                                            <span className="checkbox-container">{renderCheckbox(!isBlankMode && !!taxClasses.auto_retenedor)} Autorretenedor</span>
                                            <span className="checkbox-container">{renderCheckbox(!isBlankMode && !!taxClasses.regimen_simple)} Régimen Simple (RST)</span>
                                            <span className="checkbox-container">{renderCheckbox(!isBlankMode && !!taxClasses.sin_animo_lucro)} Entidad sin Ánimo de Lucro</span>
                                            <span className="checkbox-container">{renderCheckbox(!isBlankMode && !!taxClasses.corporacion)} Corporación</span>
                                            <span className="checkbox-container">{renderCheckbox(!isBlankMode && !!taxClasses.agente_retenedor)} Agente Retenedor</span>
                                            <span className="checkbox-container">{renderCheckbox(!isBlankMode && !!taxClasses.regimen_especial)} Régimen Especial</span>
                                            <span className="checkbox-container">{renderCheckbox(!isBlankMode && !!taxClasses.no_contribuyente)} No Contribuyente</span>
                                            <span className="checkbox-container">{renderCheckbox(!isBlankMode && !!taxClasses.codigo_ica)} Código ICA: {taxClasses.codigo_ica_val || ''}</span>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td><b>Ingresos Mensuales:</b></td>
                                        <td>{(!isBlankMode && d.ingresos_mensuales) ? `$${d.ingresos_mensuales.toLocaleString('es-CO')}` : ''}</td>
                                        <td><b>Egresos Mensuales:</b></td>
                                        <td>{(!isBlankMode && d.egresos_mensuales) ? `$${d.egresos_mensuales.toLocaleString('es-CO')}` : ''}</td>
                                    </tr>
                                    <tr>
                                        <td><b>Otros Ingresos:</b></td>
                                        <td>{(!isBlankMode && d.otros_ingresos) ? `$${d.otros_ingresos.toLocaleString('es-CO')}` : ''}</td>
                                        <td><b>Concepto Otros Ing:</b></td>
                                        <td>{displayCellVal(d.otros_ingresos_concepto)}</td>
                                    </tr>
                                    <tr>
                                        <td><b>Activos:</b></td>
                                        <td>{(!isBlankMode && d.activo) ? `$${d.activo.toLocaleString('es-CO')}` : ''}</td>
                                        <td><b>Pasivos:</b></td>
                                        <td>{(!isBlankMode && d.pasivo) ? `$${d.pasivo.toLocaleString('es-CO')}` : ''}</td>
                                    </tr>
                                    <tr>
                                        <td><b>Patrimonio:</b></td>
                                        <td>{(!isBlankMode && d.patrimonio) ? `$${d.patrimonio.toLocaleString('es-CO')}` : ''}</td>
                                        <td><b>Fecha de Corte:</b></td>
                                        <td>{displayCellVal(d.fecha_corte_financiero)}</td>
                                    </tr>
                                </tbody>
                            </table>

                            {/* ELECTRONIC INVOICING CONSENT */}
                            <div className="section-header">6. Facturación Electrónica</div>
                            <div style={{ border: '1.2px solid #b2b2b2', padding: '6px 8px', fontSize: '8px', textAlign: 'justify', marginBottom: '5px', lineHeight: '1.2' }}>
                                Aceptación y consentimiento para ser remitidas por medios electrónicos las facturas de venta y notas créditos fruto de las relaciones comerciales existentes.
                            </div>
                            <table className="form-table" style={{ marginBottom: '0px' }}>
                                <tbody>
                                    <tr>
                                        <td style={{ width: '15%' }}><b>Nombre Responsable:</b></td>
                                        <td style={{ width: '35%' }}>{displayCellVal(d.responsable_factura_nombre)}</td>
                                        <td style={{ width: '10%' }}><b>Email:</b></td>
                                        <td style={{ width: '22%' }}>{displayCellVal(d.responsable_factura_email)}</td>
                                        <td style={{ width: '10%' }}><b>Contacto Cel:</b></td>
                                        <td style={{ width: '13%' }}>{displayCellVal(d.responsable_factura_telefono)}</td>
                                    </tr>
                                </tbody>
                            </table>
                            
                            <div className="section-header">7. Referencias Comerciales y Personales</div>
                            <table className="form-table">
                                <thead>
                                    <tr>
                                        <th colSpan={6}>Referencias Comerciales</th>
                                    </tr>
                                    <tr>
                                        <th>Entidad / Proveedor</th>
                                        <th>Contacto</th>
                                        <th>Teléfono</th>
                                        <th>Ciudad</th>
                                        <th>Cupo</th>
                                        <th>Plazo (Días)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {commercialRefs.map((ref: any, idx: number) => (
                                        <tr key={idx}>
                                            <td>{displayCellVal(ref.entidad)}</td>
                                            <td>{displayCellVal(ref.contacto)}</td>
                                            <td>{displayCellVal(ref.telefono)}</td>
                                            <td>{displayCellVal(ref.ciudad)}</td>
                                            <td>{(!isBlankMode && ref.cupo) ? `$${ref.cupo.toLocaleString('es-CO')}` : ''}</td>
                                            <td>{displayCellVal(ref.plazo)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            <table className="form-table">
                                <thead>
                                    <tr>
                                        <th colSpan={5}>Referencias Personales (Solo Persona Natural)</th>
                                    </tr>
                                    <tr>
                                        <th>Nombre Completo</th>
                                        <th>Dirección</th>
                                        <th>Teléfono</th>
                                        <th>Celular</th>
                                        <th>Relación / Parentesco</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {personalRefs.map((ref: any, idx: number) => (
                                        <tr key={idx}>
                                            <td>{displayCellVal(ref.nombre)}</td>
                                            <td>{displayCellVal(ref.direccion)}</td>
                                            <td>{displayCellVal(ref.telefono)}</td>
                                            <td>{displayCellVal(ref.celular)}</td>
                                            <td>{displayCellVal(ref.relacion)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* PÁGINA 3: SOLICITUD DE CRÉDITO - NEGOTIATION & DECLARATIONS */}
                        <div className="print-page-sheet page-break">
                            {renderPageHeader(3, 4)}

                            {/* NEGOCIACIÓN COMERCIAL WITH FULL DETAILS */}
                            <div className="section-header">8. Condiciones de Negociación Comercial</div>
                            <table className="form-table" style={{ marginBottom: '8px' }}>
                                <tbody>
                                    <tr>
                                        <td style={{ width: '20%' }}><b>Condición de Pago:</b></td>
                                        <td colSpan={3}>
                                            <span className="checkbox-container">{renderCheckbox(!isBlankMode && paymentCond.consignacion)} Consignación</span>
                                            <span className="checkbox-container">{renderCheckbox(!isBlankMode && paymentCond.transferencia)} Transferencia electrónica</span>
                                            <span className="checkbox-container">{renderCheckbox(!isBlankMode && paymentCond.cheque)} Cheque</span>
                                            <span className="checkbox-container">{renderCheckbox(!isBlankMode && !!paymentCond.otro)} Otro: {paymentCond.otro || ''}</span>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td><b>Pago en Plazo:</b></td>
                                        <td colSpan={3} style={{ fontSize: '8.5px' }}>
                                            <span className="checkbox-container">{renderCheckbox(!isBlankMode && d.plazo_pago_dias === 8)} 8 días</span>
                                            <span className="checkbox-container">{renderCheckbox(!isBlankMode && d.plazo_pago_dias === 15)} 15 días</span>
                                            <span className="checkbox-container">{renderCheckbox(!isBlankMode && d.plazo_pago_dias === 30)} 30 días</span>
                                            <span className="checkbox-container">{renderCheckbox(!isBlankMode && d.plazo_pago_dias === 45)} 45 días</span>
                                            <span className="checkbox-container">{renderCheckbox(!isBlankMode && d.plazo_pago_dias === 60)} 60 días</span>
                                            <span className="checkbox-container">{renderCheckbox(!isBlankMode && ![8, 15, 30, 45, 60].includes(d.plazo_pago_dias) && !!d.plazo_pago_dias)} Otro: {(![8, 15, 30, 45, 60].includes(d.plazo_pago_dias) && d.plazo_pago_dias) ? `${d.plazo_pago_dias} días` : ''}</span>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td><b>Observaciones:</b></td>
                                        <td colSpan={3}>{displayCellVal(d.observaciones_negociacion)}</td>
                                    </tr>
                                    <tr>
                                        <td><b>Días de pagos y/o soportes:</b></td>
                                        <td colSpan={3}>{displayCellVal(d.negociacion_dias_pago_soporte)}</td>
                                    </tr>
                                    <tr>
                                        <td style={{ width: '20%' }}><b>Sección:</b></td>
                                        <td style={{ width: '30%' }}>{displayCellVal(d.negociacion_seccion)}</td>
                                        <td style={{ width: '20%' }}><b>Responsable Negociación:</b></td>
                                        <td style={{ width: '30%' }}>{displayCellVal(d.responsable_negociacion)}</td>
                                    </tr>
                                </tbody>
                            </table>

                            {/* SECCIÓN INFORMACIÓN BANCARIA */}
                            <div className="section-header">Información Bancaria (Donde se debe realizar el pago)</div>
                            <div style={{ border: '1.2px solid #b2b2b2', padding: '6px 8px', fontSize: '8.5px', lineHeight: '1.35', textAlign: 'justify', marginBottom: '8px' }}>
                                En el momento de realizar un pago a nombre de <b>INVESTMENTS CORTES S.A.S.</b> debe hacerse a través de las siguientes cuentas bancarias oficiales:<br />
                                • <b>Bancolombia:</b> Cuenta de ahorros No. <b>21100000438</b><br />
                                • <b>Banco Caja Social:</b> Cuenta Corriente No. <b>21004067507</b><br />
                                • <b>Davivienda:</b> Cuenta Corriente No. <b>001369996358</b><br />
                                • <b>Banco de Bogotá:</b> Cuenta Corriente No. <b>073554636</b> y/o cheque con sello (páguese únicamente al primer beneficiario) a nombre de <b>INVESTMENTS CORTES S.A.S.</b> conforme al Artículo 26 de la Ley 1430 de 2010.
                            </div>

                            {/* DECLARACIONES Y AUTORIZACION (DICTATED PART 1) */}
                            <div className="section-header">9. Declaraciones y Autorización</div>
                            <div className="legal-text">
                                Yo, {displayInlineVal(pagareDeudor.nombre, '________________________________________')}, identificado con el documento de identidad número {displayInlineVal(pagareDeudor.identificacion, '____________________')}, expedido en {displayInlineVal(pagareDeudor.barrio, '____________________')}, obrando en nombre propio y/o como representante legal de {displayInlineVal(isBlankMode ? '' : (d.razon_social || client.company_name), '________________________________________')}, con NIT {displayInlineVal(isBlankMode ? '' : (d.nit || client.nit), '____________________')}, de manera voluntaria y dando certeza de todo lo aquí consignado es cierto, realizo la siguiente declaración de fuente de fondos:
                            </div>
                            <div className="legal-text">
                                <b>1.</b> Los recursos que manejo y mis recursos propios provienen de las siguientes fuentes: {displayInlineVal(d.declaracion_origen_fondos_fuentes, '________________________________________')}.
                            </div>
                            <div className="legal-text">
                                <b>2.</b> Declaro que estos recursos no provienen de ninguna actividad ilícita de las contempladas en el Código Penal colombiano o en cualquier norma que lo modifique o adicione.
                            </div>
                            <div className="legal-text">
                                <b>3.</b> No admitiré que terceros efectúen depósitos a nombre mío con fondos provienen de actividades ilícitas contempladas en el Código Penal colombiano o en cualquier norma que lo modifique o adicione, ni efectuaré transacciones destinadas a tales actividades a favor de personas relacionadas con la misma.
                            </div>
                            <div className="legal-text">
                                <b>4.</b> Autorizo a <b>INVESTMENTS CORTES S.A.S.</b> a cancelar el contrato y/o relación comercial que mantenga conmigo y/o la sociedad que represento, en el caso de comprobarse cualquier infracción de las normas legales tendientes al control de lavado de activos, la financiación del terrorismo y/o financiación de la proliferación de armas de destrucción masiva y al programa de transparencia, la ley antisoborno de acuerdo con la legislación colombiana vigente y eximo a <b>INVESTMENTS CORTES S.A.S.</b> de toda responsabilidad que de ella se derive por información errónea, falsa o inexacta que hubiera proporcionado en este documento o de la violación del mismo.
                            </div>
                            <div className="legal-text">
                                <b>5.</b> Que la información suministrada es verídica y se encuentra actualizada. Que he sido informado que los datos correspondientes a dirección principal y/o dirección electrónica serán los que <b>INVESTMENTS CORTES S.A.S.</b> tendrá en cuenta para enviar la información, la cual una vez de enviada a dichas direcciones se entenderá legalmente notificada.
                            </div>
                            <div className="legal-text">
                                <b>6.</b> De manera expresa y voluntaria y dando certeza de que todo lo registrado en el presente documento es cierto, el cliente declara que sus ingresos provienen de actividades lícitas que no se encuentran registrados en listados nacionales y/o internacionales relacionados con los delitos de lavado de activos, financiación del terrorismo, financiación o proliferación de armas de destrucción masiva y/o cualquiera de los delitos de las fuentes.
                            </div>
                            <div className="legal-text">
                                <b>7.</b> Ni el suscrito y/o su representada están relacionados ni pretenden involucrar a <b>INVESTMENTS CORTES S.A.S.</b> en actividades relacionadas con delitos tales como lavado de activos y/o financiación del terrorismo o cualquier actividad de carácter ilícito.
                            </div>
                            <div className="legal-text">
                                <b>8.</b> Que autoriza a <b>INVESTMENTS CORTES S.A.S.</b> para realizar las consultas que considere pertinentes en dichos listados y dar por terminada la relación comercial si se evidencia que se encuentra en los listados anteriormente mencionados o llega a ser incluido en ellos y se obliga a responder por los perjuicios que pueda ocasionar y además exonera a <b>INVESTMENTS CORTES S.A.S.</b> de toda responsabilidad que tal hecho ocasionare.
                            </div>
                            <div className="legal-text">
                                <b>9.</b> Que los datos personales que se encuentran registrados en el presente formato y los que sean entregados a <b>INVESTMENTS CORTES S.A.S.</b> en desarrollo con la relación comercial han sido autorizados para ser recolectados, almacenados y tratados por el titular de los mismos en cumplimiento de la Ley 1581 de protección de datos personales y demás normas reglamentarias.
                            </div>
                            
                            <div className="legal-text" style={{ fontWeight: 'bold', marginTop: '4px' }}>
                                Autorizo expresa e irrevocable Investment Cortés o a quien sea en el futuro el acreedor del crédito solicitado a mi nombre y de la empresa que represento para:
                            </div>
                            <div className="legal-text" style={{ fontSize: '8.5px', lineHeight: '1.35' }}>
                                <b>a)</b> consultar en cualquier tiempo en las centrales de riesgo toda la información relevante para conocer mi desempeño como deudor, mi capacidad de pago o para valorar el riesgo futuro de concederme un crédito.
                                <br />
                                <b>b)</b> Reportar a las centrales de riesgo de manera indirecta y también por medio de entidades públicas que ejercen funciones de vigilancia y control, datos tanto en tanto sobre el cumplimiento oportuno como sobre el incumplimiento si lo hubiere de mis obligaciones crediticias o de mis deberes legales de contenido patrimonial.
                                <br />
                                <b>c)</b> Conservar tanto en Investment Cortés como en las centrales de riesgo con la debida actualizaciones durante el periodo necesario señalado en sus reglamentos, información indicada en el literal B de esta cláusula.
                                <br />
                                <b>d)</b> Suministrar a las centrales de información de riesgo datos relativos a mis solicitudes de crédito así como otros atinentes a mis relaciones comerciales, financieras y en general socioeconómicas que yo haya entregado o que consten en registros públicos, bases de datos públicas o documentos públicos. Igualmente manifiesto que los datos consignados son ciertos y que se ajustan fielmente a la realidad. Autorizo a Investment Cortés a verificarlos en caso de haber incurrido en cualquier omisión o falsedad. Esta solicitud puede ser anulada y acepto someterme a las consecuencias legales a que diera lugar.
                            </div>
                        </div>

                        {/* PÁGINA 4: SOLICITUD DE CRÉDITO - REQUIRED DOCS & SIGNATURES */}
                        <div className="print-page-sheet page-break">
                            {renderPageHeader(4, 4)}

                            <div className="section-header" style={{ marginTop: '4px', marginBottom: '4px' }}>Lista de Documentos Requeridos</div>
                            <table className="form-table" style={{ marginBottom: '8px', fontSize: '8.5px' }}>
                                <thead>
                                    <tr>
                                        <th style={{ width: '50%', padding: '2px 6px' }}>PERSONA NATURAL</th>
                                        <th style={{ width: '50%', padding: '2px 6px' }}>PERSONA JURÍDICA</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr style={{ height: 'auto' }}>
                                        <td style={{ padding: '4px 6px', lineHeight: '1.3' }}>
                                            {renderCheckbox(false)} Copia de cédula de ciudadanía<br />
                                            {renderCheckbox(false)} RUT actualizado<br />
                                            {renderCheckbox(false)} Extractos bancarios últimos 3 meses<br />
                                            {renderCheckbox(false)} Última declaración de renta<br />
                                            {renderCheckbox(false)} Cámara de Comercio menor a 30 días<br />
                                            {renderCheckbox(false)} Estados Financieros de los últimos dos periodos<br />
                                            {renderCheckbox(false)} Pagaré y Carta de instrucciones firmados
                                        </td>
                                        <td style={{ padding: '4px 6px', lineHeight: '1.3' }}>
                                            {renderCheckbox(false)} Copia de cédula del Representante Legal<br />
                                            {renderCheckbox(false)} RUT actualizado de la empresa<br />
                                            {renderCheckbox(false)} Cámara de Comercio menor a 30 días<br />
                                            {renderCheckbox(false)} Estados Financieros de los últimos dos periodos<br />
                                            {renderCheckbox(false)} 2 Referencias comerciales recientes<br />
                                            {renderCheckbox(false)} 1 Referencia bancaria<br />
                                            {renderCheckbox(false)} Pagaré y Carta de instrucciones firmados
                                        </td>
                                    </tr>
                                </tbody>
                            </table>

                            {/* Firmas y Espacio para Sello */}
                            <table style={{ width: '100%', marginBottom: '10px', marginTop: '10px' }}>
                                <tbody>
                                    <tr>
                                        <td style={{ width: '50%', paddingRight: '20px', verticalAlign: 'top' }}>
                                            <div style={{ borderBottom: '1.2px solid #000', height: '60px', marginTop: '20px' }}></div>
                                            <div style={{ marginTop: '8px', fontSize: '8.2px', lineHeight: '1.4' }}>
                                                <b>Firma y Sello de Representante Legal / Cliente</b><br />
                                                Nombre: {displayInlineVal(pagareDeudor.nombre, '________________________________________')}<br />
                                                Cédula: {displayInlineVal(pagareDeudor.identificacion, '____________________')}
                                            </div>
                                        </td>
                                        <td style={{ width: '50%', paddingLeft: '20px', verticalAlign: 'top' }}>
                                            <div style={{ display: 'flex', gap: '20px', marginTop: '10px', alignItems: 'flex-start' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                                    <div style={{ border: '1.2px solid #000', width: '65px', height: '85px', backgroundColor: '#fff', borderRadius: '2px' }}></div>
                                                    <span style={{ fontSize: '6.5px', color: '#555', fontWeight: 'bold', textAlign: 'center', lineHeight: '1.1' }}>
                                                        HUELLA ÍNDICE<br />DERECHO
                                                    </span>
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                                    <div style={{ border: '1px solid #b2b2b2', width: '110px', height: '70px', backgroundColor: '#fff' }}></div>
                                                    <span style={{ fontSize: '6.5px', color: '#555', fontWeight: 'bold', textAlign: 'center', lineHeight: '1.1' }}>
                                                        SELLO CON NIT PARA<br />PERSONA JURÍDICA
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '8.2px', flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', justifyContent: 'center', marginTop: '10px' }}>
                                                    <div><b>Fecha:</b> {formatDate(d.pagare_fecha_firma)}</div>
                                                    <div><b>Ciudad:</b> {displayInlineVal(d.pagare_ciudad_firma, '____________________')}</div>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>

                            <div className="section-header" style={{ marginBottom: '4px', marginTop: '10px' }}>Para uso exclusivo de Frutícola de Colombia</div>
                            <table className="form-table" style={{ marginBottom: '0px' }}>
                                <tbody>
                                    <tr style={{ height: '32px' }}>
                                        <td style={{ width: '30%' }}><b>Crédito Aprobado:</b></td>
                                        <td style={{ width: '20%', fontWeight: 'bold' }}>
                                            SÍ {renderCheckbox(!isBlankMode && !!d.credito_aprobado)}
                                            &nbsp;&nbsp;&nbsp;
                                            NO {renderCheckbox(!isBlankMode && !d.credito_aprobado)}
                                        </td>
                                        <td style={{ width: '20%' }}><b>Cupo:</b></td>
                                        <td style={{ width: '30%', fontWeight: 'bold', fontSize: '10px', color: THEME.colors.primary }}>
                                            {isBlankMode ? '' : (d.cupo_aprobado ? `$${d.cupo_aprobado.toLocaleString('es-CO')}` : 'N/A')}
                                        </td>
                                    </tr>
                                    <tr style={{ height: '32px' }}>
                                        <td><b>Plazo:</b></td>
                                        <td style={{ fontWeight: 'bold' }}>{displayCellVal((!isBlankMode && d.plazo_aprobado) ? `${d.plazo_aprobado} Días` : '')}</td>
                                        <td><b>Autorización Venta / Gerencia General:</b></td>
                                        <td>{displayCellVal(d.autorizacion_gerencia)}</td>
                                    </tr>
                                    <tr style={{ height: '65px' }}>
                                        <td><b>Observaciones Director de la Agencia:</b></td>
                                        <td colSpan={3} style={{ height: '65px', verticalAlign: 'top', padding: '6px' }}>{displayCellVal(d.observaciones_director)}</td>
                                    </tr>
                                    <tr style={{ height: '65px' }}>
                                        <td><b>Concepto Coordinador Comercial:</b></td>
                                        <td colSpan={3} style={{ height: '65px', verticalAlign: 'top', padding: '6px' }}>{displayCellVal(d.concepto_coordinador)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </>
                )}

                {/* ======================================================== */}
                {/* DOCUMENT 2: PAGARÉ & CARTA DE INSTRUCCIONES (PAGES 5 - 6) */}
                {/* ======================================================== */}
                {showPagare && (
                    <>
                        {/* PAGE 5: PAGARÉ (DYNAMIC BASED ON CONTRIBUTOR TYPE) */}
                        <div className="print-page-sheet pagare-sheet page-break" style={{ fontSize: '11px', lineHeight: '1.65' }}>
                            
                            {/* Promissory Note Header with Logo */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #000', paddingBottom: '10px', marginBottom: '35px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <img src="/logo-investments.png" alt="Investments Cortés" style={{ height: '54px', objectFit: 'contain' }} />
                                    <div>
                                        <div style={{ fontSize: '11px', fontWeight: 'bold' }}>INVESTMENTS CORTES S.A.S.</div>
                                        <div style={{ fontSize: '9px', color: '#555' }}>NIT: 901.393.217-5</div>
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>PAGARÉ</h2>
                                    <div style={{ fontWeight: 'bold', fontSize: '11.5px', marginTop: '2px' }}>
                                        PAGARÉ No. {displayInlineVal(null, '____________________')}
                                        {formatMode === 'juridica' && ` / Valor $ ${isBlankMode ? '____________________' : (d.cupo_aprobado ? d.cupo_aprobado.toLocaleString('es-CO') : '____________________')}`}
                                    </div>
                                </div>
                            </div>

                            {/* RENDER NATURAL PERSON PROMISSORY NOTE (Page 5) */}
                            {formatMode === 'natural' ? (
                                <>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '35px', backgroundColor: '#f9f9f9', padding: '15px', border: '1px solid #ddd' }}>
                                        <div>
                                             <b>ACREEDOR:</b> INVESTMENTS CORTES S.A.S.<br />
                                             <b>NIT:</b> 901.393.217-5
                                        </div>
                                        <div>
                                            <b>DEUDOR / SOLICITANTE:</b> {displayInlineVal(pagareDeudor.nombre, '________________________________')}<br />
                                            <b>NIT / C.C:</b> {displayInlineVal(pagareDeudor.identificacion, '____________________')}
                                        </div>
                                    </div>

                                    <div style={{ textAlign: 'justify', marginBottom: '35px' }}>
                                        <p style={{ margin: '0 0 20px 0' }}>
                                            <b>PRIMERO - OBJETO:</b> Que por virtud del presente título valor (Pagaré), me obligo (nos obligamos) a pagar solidaria e incondicionalmente a la orden de <b>INVESTMENTS CORTES S.A.S.</b>, o a quien sus derechos represente, en la ciudad de <b>{displayInlineVal(d.pagare_ciudad_firma, '____________________')}</b>, el día {displayInlineVal(null, '__________')} del mes {displayInlineVal(null, '____________________')} del año {displayInlineVal(null, '__________')}, la suma de: {displayInlineVal(null, '____________________________________________________________________________')} (${displayInlineVal(null, '______________________')}) moneda legal colombiana, más los intereses de ley a la tasa máxima permitida por la Superintendencia Financiera de Colombia.
                                        </p>
                                        <p style={{ margin: '0 0 20px 0' }}>
                                            <b>SEGUNDA - INTERESES MORATORIOS:</b> A partir del vencimiento de este Pagaré, reconoceré un interés moratorio a la tasa máxima autorizada por la ley mercantil aplicable (Superintendencia Financiera de Colombia).
                                        </p>
                                        <p style={{ margin: '0 0 20px 0' }}>
                                            <b>TERCERA - CLÁUSULA ACELERATORIA:</b> El tenedor de este Pagaré podrá declarar vencido el plazo y exigir el pago total de la obligación en caso de mora en el pago de facturas correspondientes a despachos de mercancía, giro de cheques sin provisión de fondos, o incumplimiento de cualquier otra obligación mercantil o tributaria.
                                        </p>
                                        <p style={{ margin: '0 0 20px 0' }}>
                                            <b>CUARTO:</b> Para constancia de lo anterior se firma y otorga el presente pagaré en la ciudad de <b>{displayInlineVal(d.pagare_ciudad_firma, '____________________')}</b>, hoy: {formatDate(d.pagare_fecha_firma)}.
                                        </p>
                                    </div>

                                    {/* Signatures */}
                                    <table style={{ width: '100%', marginTop: '45px' }}>
                                        <tbody>
                                            <tr>
                                                <td style={{ width: '50%', paddingRight: '25px', verticalAlign: 'top' }}>
                                                    <div style={{ borderTop: '1px solid #000', paddingTop: '15px', lineHeight: '1.75' }}>
                                                        <b>DEUDOR (FIRMA)</b><br />
                                                        <div style={{ height: '65px' }}></div>
                                                        Nombre: {displayInlineVal(pagareDeudor.nombre, '________________________________________')}<br />
                                                        C.C./NIT: {displayInlineVal(pagareDeudor.identificacion, '____________________')}<br />
                                                        Dirección: {displayInlineVal(pagareDeudor.direccion, '________________________________________')}<br />
                                                        Barrio: {displayInlineVal(pagareDeudor.barrio, '____________________')}<br />
                                                        Teléfono / Celular: {displayInlineVal(pagareDeudor.celular, '____________________')}<br />
                                                        Email: {displayInlineVal(pagareDeudor.email, '________________________________________')}
                                                    </div>
                                                </td>
                                                <td style={{ width: '50%', paddingLeft: '25px', verticalAlign: 'top' }}>
                                                    <div style={{ borderTop: '1px solid #000', paddingTop: '15px', lineHeight: '1.75' }}>
                                                        <b>CODEUDOR / GARANTE (FIRMA)</b><br />
                                                        <div style={{ height: '65px' }}></div>
                                                        Nombre: {displayInlineVal(pagareCodeudor.nombre, '________________________________________')}<br />
                                                        C.C.: {displayInlineVal(pagareCodeudor.identificacion, '____________________')}<br />
                                                        Dirección: {displayInlineVal(pagareCodeudor.direccion, '________________________________________')}<br />
                                                        Barrio: {displayInlineVal(pagareCodeudor.barrio, '____________________')}<br />
                                                        Teléfono / Celular: {displayInlineVal(pagareCodeudor.celular, '____________________')}<br />
                                                        Email: {displayInlineVal(pagareCodeudor.email, '________________________________________')}
                                                    </div>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </>
                            ) : (
                                /* RENDER CORPORATE (PERSONA JURÍDICA) PROMISSORY NOTE (Page 5) */
                                <>
                                    <div style={{ textAlign: 'justify', fontSize: '10.8px', lineHeight: '1.6' }}>
                                        <p style={{ margin: '0 0 16px 0' }}>
                                            <b>Yo (Nosotros)</b> {displayInlineVal(pagareDeudor.nombre, '__________________________________________________')} mayor(es) de edad e identificado(s) como aparece al pie de nuestras firmas actuando en nombre propio, por medio del presente escrito manifiesto lo siguiente:
                                        </p>
                                        <p style={{ margin: '0 0 16px 0' }}>
                                            <b>Yo</b> {displayInlineVal(isBlankMode ? '' : pagareDeudor.nombre, '__________________________________________________')} mayor de edad e identificado(a) con la C.C. No. {displayInlineVal(isBlankMode ? '' : pagareDeudor.identificacion, '____________________')} de {displayInlineVal(null, '____________________')} actuando en representación de {displayInlineVal(isBlankMode ? '' : (d.razon_social || client.company_name), '__________________________________________________')} sociedad legalmente constituida ante la Cámara de Comercio de {displayInlineVal(null, '____________________')} y con NIT {displayInlineVal(isBlankMode ? '' : (d.nit || client.nit), '____________________')}, por medio del presente escrito manifiesto lo siguiente:
                                        </p>
                                        <p style={{ margin: '0 0 16px 0' }}>
                                            <b>Deudor Solidario,</b> {displayInlineVal(pagareCodeudor.nombre, '__________________________________________________')} mayor de edad e identificado(a) con la C.C. No. {displayInlineVal(pagareCodeudor.identificacion, '____________________')} de {displayInlineVal(null, '____________________')} actuando en nombre propio, por medio del presente escrito manifiesto lo following:
                                        </p>

                                        <p style={{ margin: '18px 0 16px 0' }}>
                                            <b>PRIMERO - OBJETO:</b> Que por virtud del presente título valor (Pagaré), me obligo a pagar solidaria e incondicionalmente a la orden de <b>INVESTMENTS CORTES S.A.S.</b>, o a quien sus derechos representen, en la ciudad de <b>{displayInlineVal(d.pagare_ciudad_firma, '____________________')}</b>, el día {displayInlineVal(null, '__________')} del mes {displayInlineVal(null, '____________________')} del año {displayInlineVal(null, '__________')}, la suma de: {displayInlineVal(null, '____________________________________________________________________________')} (${displayInlineVal(null, '______________________')}) moneda legal, más los intereses señalados en la cláusula segunda de este documento.
                                        </p>
                                        <p style={{ margin: '0 0 16px 0' }}>
                                            <b>SEGUNDA:</b> A partir del vencimiento de este Pagaré, reconoceré un interés moratorio a la tasa máxima autorizada por la Superintendencia Financiera de Colombia.
                                        </p>
                                        <p style={{ margin: '0 0 16px 0' }}>
                                            <b>TERCERA:</b> El tenedor del presente Pagaré podrá declarar vencido el plazo y exigir el pago total de la obligación, más el de los intereses de plazo y mora y demás accesorios, en los siguientes casos:
                                            <br />
                                            a) Mora o retardo en el pago de uno o más de los vencimientos de capital o intereses señalados respecto al deudor (deudores);
                                            <br />
                                            b) El incumplimiento de cualquiera otra obligación que directa o indirectamente tenga el deudor (deudores) para con el acreedor;
                                            <br />
                                            c) El giro de cheques sin provisión de fondos o el no pago de los mismos.
                                        </p>
                                        <p style={{ margin: '0 0 16px 0' }}>
                                            <b>CUARTO:</b> En el caso de incumplir o quedar en mora con cualquiera de las obligaciones adquiridas en este título, acepto(amos) pagar los honorarios que se generen a mi acreedor por concepto de cobro Pre-jurídico o Jurídico que tenga que iniciar en mi contra, así como los gastos y costas judiciales, al igual que los gastos que se generen por el retiro y/o actualización de las bases de datos en las que se encuentre reportado por causa de mi incumplimiento.
                                        </p>
                                        <p style={{ margin: '0 0 25px 0' }}>
                                            Para constancia de lo anterior se firma y otorga el presente pagaré en la ciudad de <b>{displayInlineVal(d.pagare_ciudad_firma, '____________________')}</b>, a los {displayInlineVal(null, '__________')} días del mes de {displayInlineVal(null, '____________________')} del año {displayInlineVal(null, '__________')}.
                                        </p>
                                    </div>

                                    {/* Corporate Signatures */}
                                    <table style={{ width: '100%', marginTop: '35px' }}>
                                        <tbody>
                                            <tr>
                                                <td style={{ width: '50%', paddingRight: '20px', verticalAlign: 'top' }}>
                                                    <div style={{ borderTop: '1px solid #000', paddingTop: '12px', fontSize: '10px', lineHeight: '1.55' }}>
                                                        <b>Nombre / Razón Social:</b> {displayInlineVal(isBlankMode ? '' : (d.razon_social || client.company_name), '________________________________________')}<br />
                                                        <b>Firma Representante Legal:</b><br />
                                                        <div style={{ height: '65px' }}></div>
                                                        <b>C.C.:</b> {displayInlineVal(isBlankMode ? '' : (d.rep_legal_identificacion || pagareDeudor.identificacion), '____________________')}<br />
                                                        <b>Dirección:</b> {displayInlineVal(pagareDeudor.direccion, '________________________________________')}<br />
                                                        <b>Teléfono / Celular:</b> {displayInlineVal(pagareDeudor.celular, '____________________')}<br />
                                                        <b>Email:</b> {displayInlineVal(pagareDeudor.email, '________________________________________')}
                                                        
                                                        {/* Sello Box and Huella */}
                                                        <div style={{ display: 'flex', gap: '15px', marginTop: '20px', alignItems: 'flex-start' }}>
                                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                                                <div style={{ border: '1px solid #b2b2b2', width: '110px', height: '70px', backgroundColor: '#fff' }}></div>
                                                                <span style={{ fontSize: '6.5px', color: '#555', fontWeight: 'bold', textAlign: 'center', lineHeight: '1.1' }}>
                                                                    SELLO CON NIT PARA<br />PERSONA JURÍDICA
                                                                </span>
                                                            </div>
                                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                                                <div style={{ border: '1.2px solid #000', width: '60px', height: '70px', backgroundColor: '#fff', borderRadius: '2px' }}></div>
                                                                <span style={{ fontSize: '6.5px', color: '#555', fontWeight: 'bold', textAlign: 'center', lineHeight: '1.1' }}>
                                                                    HUELLA ÍNDICE<br />DERECHO
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td style={{ width: '50%', paddingLeft: '20px', verticalAlign: 'top' }}>
                                                    <div style={{ borderTop: '1px solid #000', paddingTop: '12px', fontSize: '10px', lineHeight: '1.55' }}>
                                                        <b>Nombre Deudor Solidario:</b> {displayInlineVal(pagareCodeudor.nombre, '________________________________________')}<br />
                                                        <b>Firma:</b><br />
                                                        <div style={{ height: '65px' }}></div>
                                                        <b>C.C.:</b> {displayInlineVal(pagareCodeudor.identificacion, '____________________')}<br />
                                                        <b>Dirección:</b> {displayInlineVal(pagareDeudor.direccion, '________________________________________')}<br />
                                                        <b>Teléfono / Celular:</b> {displayInlineVal(pagareCodeudor.celular, '____________________')}<br />
                                                        <b>Email:</b> {displayInlineVal(pagareDeudor.email, '________________________________________')}
                                                        
                                                        {/* Huella only */}
                                                        <div style={{ display: 'flex', gap: '15px', marginTop: '20px', alignItems: 'flex-start' }}>
                                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                                                <div style={{ border: '1.2px solid #000', width: '60px', height: '70px', backgroundColor: '#fff', borderRadius: '2px' }}></div>
                                                                <span style={{ fontSize: '6.5px', color: '#555', fontWeight: 'bold', textAlign: 'center', lineHeight: '1.1' }}>
                                                                    HUELLA ÍNDICE<br />DERECHO
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </>
                            )}
                        </div>

                        {/* PAGE 6: CARTA DE INSTRUCCIONES (DYNAMIC BASED ON CONTRIBUTOR TYPE) */}
                        <div className="print-page-sheet pagare-sheet page-break" style={{ fontSize: '11px', lineHeight: '1.65' }}>
                            
                            {/* Instructions Header with Logo */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #000', paddingBottom: '10px', marginBottom: '35px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <img src="/logo-investments.png" alt="Investments Cortés" style={{ height: '54px', objectFit: 'contain' }} />
                                    <div>
                                        <div style={{ fontSize: '11px', fontWeight: 'bold' }}>INVESTMENTS CORTES S.A.S.</div>
                                        <div style={{ fontSize: '9px', color: '#555' }}>NIT: 901.393.217-5</div>
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <h2 style={{ margin: 0, fontSize: '13px', fontWeight: 'bold' }}>
                                        {formatMode === 'natural' ? 'CARTA DE INSTRUCCIONES ANEXA AL PAGARÉ' : 'CARTA DE INSTRUCCIONES'}
                                    </h2>
                                    <div style={{ fontWeight: 'bold', fontSize: '10px', marginTop: '2px' }}>
                                        {formatMode === 'natural' 
                                            ? 'ANEXA AL PAGARÉ No. ' 
                                            : 'ESTE DOCUMENTO HACE PARTE INTEGRAL DEL PAGARÉ No. '}
                                        {displayInlineVal(null, '____________________')}
                                    </div>
                                </div>
                            </div>

                            {/* RENDER NATURAL PERSON CARTA DE INSTRUCCIONES (Page 6) */}
                            {formatMode === 'natural' ? (
                                <>
                                    <div style={{ textAlign: 'justify', marginBottom: '35px' }}>
                                        <p style={{ margin: '0 0 20px 0' }}>Señores:<br /><b>INVESTMENTS CORTES S.A.S.</b><br />Ciudad.</p>
                                        <p style={{ margin: '0 0 20px 0' }}>
                                            Yo (Nosotros), <b>{displayInlineVal(pagareDeudor.nombre, '________________________________')}</b>, identificado(s) como aparece al pie de mi (nuestras) firma(s), en calidad de Deudor(es), autorizo(amos) de manera expresa e irrevocable a <b>INVESTMENTS CORTES S.A.S.</b> para llenar los espacios que han sido dejados en blanco en el Pagaré adjunto, que he (hemos) firmado a su favor, con arreglo a las siguientes instrucciones:
                                        </p>
                                        <p style={{ margin: '0 0 20px 0' }}>
                                            <b>1. IMPORTE:</b> El importe del pagaré será igual al total de las obligaciones vigentes, exigibles y no pagadas que en cualquier momento tenga el deudor a favor de <b>INVESTMENTS CORTES S.A.S.</b> por concepto de compra de mercancías (frutas, verduras, procesados), facturas pendientes, intereses moratorios y gastos de cobranza.
                                        </p>
                                        <p style={{ margin: '0 0 20px 0' }}>
                                            <b>2. FECHA DE VENCIMIENTO:</b> La fecha de vencimiento será aquella que determine el acreedor <b>INVESTMENTS CORTES S.A.S.</b>, la cual corresponderá al día siguiente en el que ocurra la mora en el pago de una o más obligaciones.
                                        </p>
                                        <p style={{ margin: '0 0 20px 0' }}>
                                            <b>3. LUGAR DE PAGO:</b> El lugar de pago será la ciudad de <b>{displayInlineVal(d.pagare_ciudad_firma, '____________________')}</b> en las oficinas del acreedor.
                                        </p>
                                        <p style={{ margin: '0 0 35px 0' }}>
                                            Para constancia de lo anterior, se firma en la ciudad de <b>{displayInlineVal(d.pagare_ciudad_firma, '____________________')}</b>, hoy: {formatDate(d.pagare_fecha_firma)}.
                                        </p>
                                    </div>

                                    {/* Signatures */}
                                    <table style={{ width: '100%', marginTop: '45px' }}>
                                        <tbody>
                                            <tr>
                                                <td style={{ width: '50%', paddingRight: '25px', verticalAlign: 'top' }}>
                                                    <div style={{ borderTop: '1px solid #000', paddingTop: '15px', lineHeight: '1.75' }}>
                                                        <b>FIRMA DEL DEUDOR</b><br />
                                                        <div style={{ height: '65px' }}></div>
                                                        Nombre: {displayInlineVal(pagareDeudor.nombre, '________________________________________')}<br />
                                                        C.C./NIT: {displayInlineVal(pagareDeudor.identificacion, '____________________')}
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', marginTop: '20px' }}>
                                                        <div style={{ border: '1.2px solid #000', width: '60px', height: '70px', backgroundColor: '#fff', borderRadius: '2px' }}></div>
                                                        <span style={{ fontSize: '6.5px', color: '#555', fontWeight: 'bold', textAlign: 'center', lineHeight: '1.1' }}>
                                                            HUELLA ÍNDICE<br />DERECHO
                                                        </span>
                                                    </div>
                                                </td>
                                                <td style={{ width: '50%', paddingLeft: '25px', verticalAlign: 'top' }}>
                                                    <div style={{ borderTop: '1px solid #000', paddingTop: '15px', lineHeight: '1.75' }}>
                                                        <b>FIRMA DEL CODEUDOR</b><br />
                                                        <div style={{ height: '65px' }}></div>
                                                        Nombre: {displayInlineVal(pagareCodeudor.nombre, '________________________________________')}<br />
                                                        C.C.: {displayInlineVal(pagareCodeudor.identificacion, '____________________')}
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', marginTop: '20px' }}>
                                                        <div style={{ border: '1.2px solid #000', width: '60px', height: '70px', backgroundColor: '#fff', borderRadius: '2px' }}></div>
                                                        <span style={{ fontSize: '6.5px', color: '#555', fontWeight: 'bold', textAlign: 'center', lineHeight: '1.1' }}>
                                                            HUELLA ÍNDICE<br />DERECHO
                                                        </span>
                                                    </div>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </>
                            ) : (
                                /* RENDER CORPORATE (PERSONA JURÍDICA) CARTA DE INSTRUCCIONES (Page 7) */
                                <>
                                    <div style={{ textAlign: 'justify', fontSize: '10.8px', lineHeight: '1.6' }}>
                                        <p style={{ margin: '0 0 16px 0' }}>
                                            <b>Yo (Nosotros)</b> {displayInlineVal(pagareDeudor.nombre, '__________________________________________________')}, identificado(s) como aparece al pie de mi (nuestras) firma(s), autorizo (amos) a <b>INVESTMENTS CORTES S.A.S.</b> de manera expresa e irrevocablemente para que haciendo uso del derecho conferido por el artículo 622 del Código de Comercio, llene los espacios que se han dejado en blanco en el pagaré adjunto, de acuerdo con las siguientes Instrucciones:
                                        </p>
                                        
                                        <p style={{ margin: '0 0 14px 0' }}>
                                            <b>a)</b> El importe del título valor será igual al valor de todas las obligaciones exigibles que a mi (nuestro) cargo y a favor de <b>INVESTMENTS CORTES S.A.S.</b>, existan al momento de ser llenados los espacios en blanco, incluyéndose in dicho importe no sólo el capital, sino intereses, gastos, comisiones, multas, honorarios de cobranza, etc.
                                        </p>
                                        <p style={{ margin: '0 0 14px 0' }}>
                                            <b>b)</b> La tasa de interés corriente y/o mora será la máxima autorizada por la Ley (Superintendencia Financiera de Colombia).
                                        </p>
                                        <p style={{ margin: '0 0 14px 0' }}>
                                            <b>c)</b> El espacio correspondiente al día de vencimiento deberá ser llenado el día en que el pagaré sea diligenciado de conformidad con lo dispuesto en el numeral subsiguiente.
                                        </p>
                                        <p style={{ margin: '0 0 14px 0' }}>
                                            <b>d)</b> Los espacios dejados en blanco se podrán llenar de conformidad con lo aquí señalado, en cualquiera de los siguientes eventos: a) Mora o retardo en el pago de uno o más de los vencimientos de capital o intereses señalados respecto al deudor (deudores); b) El incumplimiento de cualquier otra obligación que directa o indirectamente tenga el deudor (deudores) para con el acreedor; c) El giro de cheques sin provisión de fondos o el no pago de los mismos.
                                        </p>
                                        
                                        <p style={{ margin: '18px 0 16px 0' }}>
                                            Que el Pagaré así llenado presta Mérito Ejecutivo, pudiendo el <b>ACREEDOR</b> exigir su cancelación por vía judicial sin perjuicio de las demás acciones legales que el ACREEDOR pueda tener.
                                        </p>
                                        <p style={{ margin: '0 0 16px 0' }}>
                                            Las presentes las presento de conformidad con lo dispuesto al Art. 622, inciso 2 del Código de Comercio para todos los efectos allí previstos. Dejo constancia que recibí copia de la Carta de Instrucciones y Pagaré.
                                        </p>
                                        <p style={{ margin: '0 0 25px 0' }}>
                                            Para constancia de lo anterior se firma en la ciudad de <b>{displayInlineVal(d.pagare_ciudad_firma, '____________________')}</b>, a los {displayInlineVal(null, '__________')} días del mes de {displayInlineVal(null, '____________________')} del año {displayInlineVal(null, '__________')}.
                                        </p>
                                    </div>

                                    {/* Corporate Signatures */}
                                    <table style={{ width: '100%', marginTop: '35px' }}>
                                        <tbody>
                                            <tr>
                                                <td style={{ width: '50%', paddingRight: '20px', verticalAlign: 'top' }}>
                                                    <div style={{ borderTop: '1px solid #000', paddingTop: '12px', fontSize: '10px', lineHeight: '1.55' }}>
                                                        <b>Nombre / Razón Social:</b> {displayInlineVal(isBlankMode ? '' : (d.razon_social || client.company_name), '________________________________________')}<br />
                                                        <b>Firma Representante Legal:</b><br />
                                                        <div style={{ height: '65px' }}></div>
                                                        <b>C.C.:</b> {displayInlineVal(isBlankMode ? '' : (d.rep_legal_identificacion || pagareDeudor.identificacion), '____________________')}<br />
                                                        <b>Dirección:</b> {displayInlineVal(pagareDeudor.direccion, '________________________________________')}<br />
                                                        <b>Teléfono / Celular:</b> {displayInlineVal(pagareDeudor.celular, '____________________')}<br />
                                                        <b>Email:</b> {displayInlineVal(pagareDeudor.email, '________________________________________')}
                                                        
                                                        {/* Sello Box and Huella */}
                                                        <div style={{ display: 'flex', gap: '15px', marginTop: '20px', alignItems: 'flex-start' }}>
                                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                                                <div style={{ border: '1px solid #b2b2b2', width: '110px', height: '70px', backgroundColor: '#fff' }}></div>
                                                                <span style={{ fontSize: '6.5px', color: '#555', fontWeight: 'bold', textAlign: 'center', lineHeight: '1.1' }}>
                                                                    SELLO CON NIT PARA<br />PERSONA JURÍDICA
                                                                </span>
                                                            </div>
                                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                                                <div style={{ border: '1.2px solid #000', width: '60px', height: '70px', backgroundColor: '#fff', borderRadius: '2px' }}></div>
                                                                <span style={{ fontSize: '6.5px', color: '#555', fontWeight: 'bold', textAlign: 'center', lineHeight: '1.1' }}>
                                                                    HUELLA ÍNDICE<br />DERECHO
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td style={{ width: '50%', paddingLeft: '20px', verticalAlign: 'top' }}>
                                                    <div style={{ borderTop: '1px solid #000', paddingTop: '12px', fontSize: '10px', lineHeight: '1.55' }}>
                                                        <b>Nombre Deudor Solidario:</b> {displayInlineVal(pagareCodeudor.nombre, '________________________________________')}<br />
                                                        <b>Firma:</b><br />
                                                        <div style={{ height: '65px' }}></div>
                                                        <b>C.C.:</b> {displayInlineVal(pagareCodeudor.identificacion, '____________________')}<br />
                                                        <b>Dirección:</b> {displayInlineVal(pagareDeudor.direccion, '________________________________________')}<br />
                                                        <b>Teléfono / Celular:</b> {displayInlineVal(pagareCodeudor.celular, '____________________')}<br />
                                                        <b>Email:</b> {displayInlineVal(pagareCodeudor.email, '________________________________________')}
                                                        
                                                        {/* Huella only */}
                                                        <div style={{ display: 'flex', gap: '15px', marginTop: '20px', alignItems: 'flex-start' }}>
                                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                                                <div style={{ border: '1.2px solid #000', width: '60px', height: '70px', backgroundColor: '#fff', borderRadius: '2px' }}></div>
                                                                <span style={{ fontSize: '6.5px', color: '#555', fontWeight: 'bold', textAlign: 'center', lineHeight: '1.1' }}>
                                                                    HUELLA ÍNDICE<br />DERECHO
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
