const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

// 1. Cargar entorno de Supabase
const envPath = path.resolve(__dirname, '../.env.local');
const env = dotenv.parse(fs.readFileSync(envPath));
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: Faltan credenciales de Supabase en .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

// 2. Funciones de Validación Poka-Yoke de Calidad de Datos

function auditGps(latRaw, lngRaw) {
    if (latRaw === null || latRaw === undefined || latRaw === '' || lngRaw === null || lngRaw === undefined || lngRaw === '') {
        return { isValid: false, reason: 'Sin coordenadas GPS registradas' };
    }
    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    if (isNaN(lat) || isNaN(lng)) {
        return { isValid: false, reason: `Coordenadas no numéricas ('${latRaw}', '${lngRaw}')` };
    }
    if (lat === 0 && lng === 0) {
        return { isValid: false, reason: 'Coordenadas Null Island (0, 0)' };
    }
    // Límites de Colombia: latitud -4.5 a 13.5, longitud -82.0 a -66.5
    if (lat < -4.5 || lat > 13.5 || lng < -82.0 || lng > -66.5) {
        return { isValid: false, reason: `Coordenadas fuera de Colombia (Lat: ${lat}, Lng: ${lng})` };
    }
    return { isValid: true, reason: 'Válido' };
}

function auditAddress(addressRaw) {
    if (!addressRaw || typeof addressRaw !== 'string') {
        return { isValid: false, reason: 'Dirección vacía o no registrada' };
    }
    const addr = addressRaw.trim();
    if (addr.length === 0) {
        return { isValid: false, reason: 'Dirección vacía' };
    }
    const upper = addr.toUpperCase();
    const placeholders = [
        'N/A', 'NA', 'SIN DIRECCION', 'SIN DIRECCIÓN', 'PENDIENTE', 'POR DEFINIR',
        'NO TIENE', 'NO APLICA', 'BOGOTA', 'BOGOTÁ', 'CUNDINAMARCA', 'MEDELLIN',
        'MEDELLÍN', 'CALI', 'CASA', 'CALLE', 'CARRERA', 'NINGUNA', '---', '--', '.',
        '0', 'PRUEBA', 'TEST', 'DOMICILIO'
    ];
    if (placeholders.includes(upper)) {
        return { isValid: false, reason: `Texto genérico o placeholder ('${addr}')` };
    }
    if (addr.length < 6) {
        return { isValid: false, reason: `Dirección incompleta / muy corta (${addr.length} caracteres: '${addr}')` };
    }
    return { isValid: true, reason: 'Válido' };
}

function auditPhone(phone1, phone2) {
    const raw = (phone1 || phone2 || '').toString().trim();
    if (!raw) {
        return { isValid: false, reason: 'Teléfono no registrado', clean: '' };
    }
    const digitsOnly = raw.replace(/\D/g, '');
    let clean = digitsOnly;
    // Si inicia con indicativo internacional 57 y tiene 12 dígitos, remover 57
    if (clean.startsWith('57') && clean.length >= 12) {
        clean = clean.substring(2);
    }
    if (clean.length === 0) {
        return { isValid: false, reason: `Sin dígitos numéricos ('${raw}')`, clean: '' };
    }
    if (clean.length < 7) {
        return { isValid: false, reason: `Longitud insuficiente (${clean.length} dígitos: '${raw}')`, clean };
    }
    if (clean.length > 13) {
        return { isValid: false, reason: `Longitud excesiva (${clean.length} dígitos: '${raw}')`, clean };
    }
    const dummyPatterns = ['0000000', '1111111', '1234567', '9999999', '123456789', '1234567890'];
    if (dummyPatterns.some(p => clean.includes(p))) {
        return { isValid: false, reason: `Número ficticio o secuencial ('${raw}')`, clean };
    }
    return { isValid: true, reason: 'Válido', clean };
}

function auditEmail(emailRaw) {
    if (!emailRaw || typeof emailRaw !== 'string') {
        return { isValid: false, reason: 'Email no registrado' };
    }
    const email = emailRaw.trim().toLowerCase();
    if (email.length === 0) {
        return { isValid: false, reason: 'Email vacío' };
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return { isValid: false, reason: `Formato de correo no cumple estándar RFC ('${email}')` };
    }
    const dummyEmails = ['noemail', 'sinemail', 'na@na.com', 'test@test.com', 'a@b.com', 'nodisp@', 'noreply@', 'correo@correo.com'];
    if (dummyEmails.some(d => email.includes(d))) {
        return { isValid: false, reason: `Correo ficticio o dummy ('${email}')` };
    }
    return { isValid: true, reason: 'Válido' };
}

// 3. Ejecución Principal
async function generateAuditReport() {
    console.log('🔍 Consultando base de datos Supabase...');

    // A. Obtener perfiles de clientes
    const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('*')
        .in('role', ['b2b_client', 'b2c_client', 'client'])
        .order('role');

    if (pErr) {
        console.error('Error al consultar profiles:', pErr);
        process.exit(1);
    }

    console.log(`✅ ${profiles.length} clientes encontrados en la base de datos.`);

    // B. Obtener pedidos recientes para sugerencias de recuperación
    const { data: orders, error: oErr } = await supabase
        .from('orders')
        .select('profile_id, shipping_address, latitude, longitude, contact_phone, created_at')
        .order('created_at', { ascending: false });

    const clientOrderMap = {};
    if (!oErr && orders) {
        orders.forEach(o => {
            if (o.profile_id && !clientOrderMap[o.profile_id]) {
                clientOrderMap[o.profile_id] = o;
            }
        });
    }

    // C. Procesar y auditar cada cliente
    const auditedClients = profiles.map(c => {
        const isB2B = c.role === 'b2b_client' || c.role === 'client' || Boolean(c.is_corporate_parent);
        const clientTypeLabel = isB2B ? 'Institucional (B2B)' : 'Hogar (B2C)';
        const companyOrContact = (c.company_name || c.razon_social || c.contact_name || 'Sin Nombre').trim();

        const gpsEval = auditGps(c.latitude, c.longitude);
        const addressEval = auditAddress(c.address);
        const phoneEval = auditPhone(c.contact_phone, c.phone);
        const emailEval = auditEmail(c.email || c.contact_email);

        const issuesCount = (!gpsEval.isValid ? 1 : 0) +
                            (!addressEval.isValid ? 1 : 0) +
                            (!phoneEval.isValid ? 1 : 0) +
                            (!emailEval.isValid ? 1 : 0);

        let severity = '🟢 Válido (100%)';
        if (issuesCount >= 3 || (!gpsEval.isValid && !addressEval.isValid)) {
            severity = '🔴 Crítico (Riesgo Despacho)';
        } else if (issuesCount >= 1) {
            severity = '🟡 Moderado (Incompleto)';
        }

        const lastOrder = clientOrderMap[c.id];
        let recoveryGps = '';
        let recoveryAddress = '';
        if (lastOrder) {
            if (!gpsEval.isValid && lastOrder.latitude && lastOrder.longitude) {
                recoveryGps = `${lastOrder.latitude}, ${lastOrder.longitude} (De pedido ${lastOrder.created_at.slice(0, 10)})`;
            }
            if (!addressEval.isValid && lastOrder.shipping_address) {
                recoveryAddress = `${lastOrder.shipping_address} (De pedido ${lastOrder.created_at.slice(0, 10)})`;
            }
        }

        return {
            id: c.id,
            client_type: clientTypeLabel,
            role_code: c.role,
            is_active: c.is_active !== false ? 'Activo' : 'Inactivo',
            display_name: companyOrContact,
            contact_name: c.contact_name || '',
            nit: c.nit || c.document_id || '',
            city: c.city || c.municipality || 'Bogotá',
            severity,
            issues_count: issuesCount,
            
            // GPS
            gps_status: gpsEval.isValid ? 'VÁLIDO' : 'INVÁLIDO',
            gps_reason: gpsEval.reason,
            latitude: c.latitude ?? '',
            longitude: c.longitude ?? '',
            recovery_gps: recoveryGps,

            // Dirección
            address_status: addressEval.isValid ? 'VÁLIDO' : 'INVÁLIDO',
            address_reason: addressEval.reason,
            address: c.address || '',
            recovery_address: recoveryAddress,

            // Teléfono
            phone_status: phoneEval.isValid ? 'VÁLIDO' : 'INVÁLIDO',
            phone_reason: phoneEval.reason,
            contact_phone: c.contact_phone || '',
            alt_phone: c.phone || '',

            // Email
            email_status: emailEval.isValid ? 'VÁLIDO' : 'INVÁLIDO',
            email_reason: emailEval.reason,
            email: c.email || '',
            alt_emails: c.additional_billing_emails || c.contact_email || '',

            // Historial
            last_order_date: lastOrder ? lastOrder.created_at.slice(0, 10) : 'Sin pedidos'
        };
    });

    // D. Filtrar segmentos
    const b2bWithIssues = auditedClients.filter(c => c.client_type === 'Institucional (B2B)' && c.issues_count > 0);
    const b2cWithIssues = auditedClients.filter(c => c.client_type === 'Hogar (B2C)' && c.issues_count > 0);

    // E. Generar métricas de resumen
    const totalB2B = auditedClients.filter(c => c.client_type === 'Institucional (B2B)').length;
    const totalB2C = auditedClients.filter(c => c.client_type === 'Hogar (B2C)').length;
    
    const summaryData = [
        { 'MÉTRICA DE GOBERNANZA': 'Total Clientes Registrados en Base de Datos', 'VALOR': auditedClients.length, 'DETALLE': 'Padrón unificado en tabla profiles' },
        { 'MÉTRICA DE GOBERNANZA': 'Clientes Institucionales (B2B)', 'VALOR': totalB2B, 'DETALLE': 'Empresas, restaurantes, minimercados e instituciones' },
        { 'MÉTRICA DE GOBERNANZA': 'Clientes Hogar (B2C)', 'VALOR': totalB2C, 'DETALLE': 'Clientes residenciales de tienda y pedidos hogar' },
        { 'MÉTRICA DE GOBERNANZA': 'Clientes con Información 100% Completa y Válida', 'VALOR': auditedClients.filter(c => c.issues_count === 0).length, 'DETALLE': '🟢 Datos listos para geocodificación y facturación' },
        { 'MÉTRICA DE GOBERNANZA': 'Clientes con Al Menos 1 Dato Inválido o Faltante', 'VALOR': auditedClients.filter(c => c.issues_count > 0).length, 'DETALLE': 'Requieren saneamiento o llamada de actualización' },
        { 'MÉTRICA DE GOBERNANZA': '• Clientes B2B con Fallas de Datos', 'VALOR': b2bWithIssues.length, 'DETALLE': `Representa el ${Math.round((b2bWithIssues.length / totalB2B) * 100)}% de los clientes institucionales` },
        { 'MÉTRICA DE GOBERNANZA': '• Clientes Hogar (B2C) con Fallas de Datos', 'VALOR': b2cWithIssues.length, 'DETALLE': `Representa el ${Math.round((b2cWithIssues.length / totalB2C) * 100)}% de los clientes hogar` },
        { 'MÉTRICA DE GOBERNANZA': '--- DESGLOSE POR TIPO DE DATO ---', 'VALOR': '---', 'DETALLE': '----------------------------------------------' },
        { 'MÉTRICA DE GOBERNANZA': 'Total con Fallas de GPS (Sin coordenadas o fuera de Colombia)', 'VALOR': auditedClients.filter(c => c.gps_status === 'INVÁLIDO').length, 'DETALLE': 'Impide cálculo automático de rutas y tiempos de viaje' },
        { 'MÉTRICA DE GOBERNANZA': 'Total con Fallas de Dirección (Vacía, N/A o genérica)', 'VALOR': auditedClients.filter(c => c.address_status === 'INVÁLIDO').length, 'DETALLE': 'Riesgo de despacho errado o entrega fallida en ruta' },
        { 'MÉTRICA DE GOBERNANZA': 'Total con Fallas de Teléfono (Sin número o longitud < 7)', 'VALOR': auditedClients.filter(c => c.phone_status === 'INVÁLIDO').length, 'DETALLE': 'Impide notificación por WhatsApp o llamada del chofer' },
        { 'MÉTRICA DE GOBERNANZA': 'Total con Fallas de Email (Sin correo o formato erróneo)', 'VALOR': auditedClients.filter(c => c.email_status === 'INVÁLIDO').length, 'DETALLE': 'Impide emisión de factura electrónica DIAN o confirmación' }
    ];

    // F. Transformar filas a formato amigable de Excel
    const formatClientRows = (list) => list.map((c, index) => ({
        '#': index + 1,
        'Tipo Cliente': c.client_type,
        'Razón Social / Cliente': c.display_name,
        'Contacto': c.contact_name,
        'NIT / Cédula': c.nit,
        'Estado': c.is_active,
        'Semáforo': c.severity,
        'Total Fallas': c.issues_count,
        'Último Pedido': c.last_order_date,

        // GPS
        'GPS Estado': c.gps_status,
        'GPS Diagnóstico': c.gps_reason,
        'Latitud': c.latitude,
        'Longitud': c.longitude,
        'GPS Sugerido de Pedido': c.recovery_gps,

        // Dirección
        'Dirección Estado': c.address_status,
        'Dirección Diagnóstico': c.address_reason,
        'Dirección Registrada': c.address,
        'Ciudad': c.city,
        'Dirección Sugerida de Pedido': c.recovery_address,

        // Teléfono
        'Teléfono Estado': c.phone_status,
        'Teléfono Diagnóstico': c.phone_reason,
        'Teléfono Contacto': c.contact_phone,
        'Teléfono Alt': c.alt_phone,

        // Email
        'Email Estado': c.email_status,
        'Email Diagnóstico': c.email_reason,
        'Email Principal': c.email,
        'Emails Adicionales': c.alt_emails,

        'ID Sistema (UUID)': c.id
    }));

    // G. Crear Libro de Trabajo Excel
    const wb = XLSX.utils.book_new();

    // Pestaña 1: Resumen Ejecutivo
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    wsSummary['!cols'] = [{ wch: 60 }, { wch: 15 }, { wch: 65 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen Ejecutivo');

    // Pestaña 2: B2B Institucionales con Fallas
    const wsB2B = XLSX.utils.json_to_sheet(formatClientRows(b2bWithIssues));
    wsB2B['!cols'] = [
        { wch: 4 }, { wch: 20 }, { wch: 35 }, { wch: 25 }, { wch: 15 },
        { wch: 10 }, { wch: 25 }, { wch: 12 }, { wch: 14 },
        { wch: 12 }, { wch: 35 }, { wch: 12 }, { wch: 12 }, { wch: 35 },
        { wch: 12 }, { wch: 35 }, { wch: 35 }, { wch: 15 }, { wch: 35 },
        { wch: 12 }, { wch: 35 }, { wch: 16 }, { wch: 16 },
        { wch: 12 }, { wch: 35 }, { wch: 30 }, { wch: 25 },
        { wch: 36 }
    ];
    XLSX.utils.book_append_sheet(wb, wsB2B, 'B2B Institucionales (Fallas)');

    // Pestaña 3: B2C Hogar con Fallas
    const wsB2C = XLSX.utils.json_to_sheet(formatClientRows(b2cWithIssues));
    wsB2C['!cols'] = wsB2B['!cols'];
    XLSX.utils.book_append_sheet(wb, wsB2C, 'Hogar B2C (Fallas)');

    // Pestaña 4: Padrón Completo (578 Clientes)
    const wsAll = XLSX.utils.json_to_sheet(formatClientRows(auditedClients));
    wsAll['!cols'] = wsB2B['!cols'];
    XLSX.utils.book_append_sheet(wb, wsAll, 'Padrón Total (578 Clientes)');

    // H. Determinar rutas de destino en el Escritorio
    const oneDriveDesktop = 'C:\\Users\\German Higuera\\OneDrive\\Desktop';
    const standardDesktop = 'C:\\Users\\German Higuera\\Desktop';
    
    let targetFolder = oneDriveDesktop;
    if (!fs.existsSync(targetFolder)) {
        if (fs.existsSync(standardDesktop)) {
            targetFolder = standardDesktop;
        } else {
            targetFolder = path.resolve(__dirname, '..');
        }
    }

    const fileName = 'AUDITORIA_CLIENTES_DATOS_INVALIDOS_FRUFRESCO.xlsx';
    const fullOutputPath = path.join(targetFolder, fileName);

    XLSX.writeFile(wb, fullOutputPath);
    console.log(`🎉 Archivo Excel generado con éxito en:\n👉 ${fullOutputPath}`);

    // Si existe también la otra carpeta de escritorio, guardar una copia por máxima seguridad
    if (fs.existsSync(standardDesktop) && standardDesktop !== targetFolder) {
        try {
            fs.copyFileSync(fullOutputPath, path.join(standardDesktop, fileName));
            console.log(`📋 Copia de respaldo guardada en: ${path.join(standardDesktop, fileName)}`);
        } catch (_) {}
    }

    return {
        path: fullOutputPath,
        totalClients: auditedClients.length,
        b2bIssues: b2bWithIssues.length,
        b2cIssues: b2cWithIssues.length,
        totalGpsIssues: auditedClients.filter(c => c.gps_status === 'INVÁLIDO').length,
        totalAddressIssues: auditedClients.filter(c => c.address_status === 'INVÁLIDO').length,
        totalPhoneIssues: auditedClients.filter(c => c.phone_status === 'INVÁLIDO').length,
        totalEmailIssues: auditedClients.filter(c => c.email_status === 'INVÁLIDO').length
    };
}

generateAuditReport().catch(err => {
    console.error('Error fatal al generar auditoría:', err);
    process.exit(1);
});
