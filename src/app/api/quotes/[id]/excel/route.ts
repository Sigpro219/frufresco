import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

const formatQuoteNumber = (num: number, createdDate?: string) => {
    const d = new Date(createdDate || Date.now());
    const year = String(d.getFullYear()).slice(-2);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const seq = String(num || 1).padStart(4, '0');
    return `COT ${year}${month} ${seq}`;
};

export async function GET(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await context.params;
        if (!id) {
            return NextResponse.json({ error: 'ID de cotización requerido' }, { status: 400 });
        }

        // 1. Obtener la cotización
        const { data: quote, error: qErr } = await supabaseAdmin
            .from('quotes')
            .select('*')
            .eq('id', id)
            .single();

        if (qErr || !quote) {
            return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 });
        }

        // 2. Obtener información del cliente o lead vinculado
        let clientInfo: any = null;
        if (quote.client_id) {
            const { data: p } = await supabaseAdmin
                .from('profiles')
                .select('company_name, contact_name, nit, phone, email, address')
                .eq('id', quote.client_id)
                .single();
            if (p) clientInfo = p;
        } else if (quote.lead_id) {
            const { data: l } = await supabaseAdmin
                .from('leads')
                .select('company_name, contact_name, nit, phone, email, address, municipality')
                .eq('id', quote.lead_id)
                .single();
            if (l) clientInfo = l;
        }

        // 3. Obtener los ítems de la cotización
        const { data: rawItems } = await supabaseAdmin
            .from('quote_items')
            .select('*, products(name, accounting_id, unit_of_measure)')
            .eq('quote_id', id);

        // Ordenar los ítems por ID Contable alfabéticamente/numéricamente
        const items = [...(rawItems || [])].sort((a, b) => {
            const idA = (a.products?.accounting_id || a.products?.name || a.product_name || '').toString().toLowerCase();
            const idB = (b.products?.accounting_id || b.products?.name || b.product_name || '').toString().toLowerCase();
            return idA.localeCompare(idB, 'es', { numeric: true, sensitivity: 'base' });
        });

        const formattedQuoteNum = formatQuoteNumber(quote.quote_number, quote.created_at);
        const clientDisplayName = quote.client_name || clientInfo?.company_name || clientInfo?.contact_name || 'Cliente';
        const contactName = clientInfo?.contact_name || clientDisplayName;
        const nit = clientInfo?.nit || 'N/A';
        const phone = clientInfo?.phone || 'N/A';
        const email = clientInfo?.email || 'N/A';
        const address = clientInfo?.address || (clientInfo?.municipality ? `${clientInfo.municipality}` : 'N/A');
        const startDate = quote.start_date ? new Date(quote.start_date).toLocaleDateString('es-CO') : new Date(quote.created_at).toLocaleDateString('es-CO');

        // 4. Construir la estructura del archivo Excel
        const rows: any[][] = [];

        // Encabezado institucional
        rows.push(['INVESTMENTS CORTÉS S.A.S. - FRUFRESCO']);
        rows.push(['NIT: 901393217 | Bogotá D.C., Colombia | contacto@investmentscortes.com']);
        rows.push(['PROPUESTA COMERCIAL - COTIZACIÓN']);
        rows.push([]);

        // Bloque de Metadatos del Cliente y Documento
        rows.push(['DOCUMENTO:', formattedQuoteNum, '', 'FECHA EMISIÓN:', startDate]);
        rows.push(['PROPUESTA PARA:', clientDisplayName, '', 'VALIDEZ:', '30 Días']);
        rows.push(['NIT / CÉDULA:', nit, '', 'ATENCIÓN:', contactName]);
        rows.push(['TELÉFONO:', phone, '', 'EMAIL:', email]);
        rows.push(['DIRECCIÓN:', address]);
        rows.push([]);

        // Encabezados de la Tabla de Productos
        const headerRowIndex = rows.length + 1; // 10
        rows.push(['#', 'ID CONTABLE', 'DESCRIPCIÓN DEL PRODUCTO', 'CANTIDAD', 'UNIDAD', 'IVA %', 'VALOR UNITARIO ($)', 'TOTAL ($)']);

        const startItemRow = headerRowIndex + 1; // 11
        items.forEach((item, index) => {
            const rowNum = startItemRow + index;
            const itemCode = item.products?.accounting_id || item.product_id?.slice(0, 8) || '-';
            const name = item.products?.name || item.product_name || 'Producto';
            const qty = Number(item.quantity) || 0;
            const unit = item.unit || item.products?.unit_of_measure || 'Kg';
            const ivaRate = (Number(item.iva_rate) || 0) / 100;
            const unitPrice = Number(item.unit_price) || 0;

            // Fila de datos con fórmula nativa de multiplicación para Total
            rows.push([
                index + 1,
                itemCode,
                name,
                qty,
                unit,
                ivaRate,
                unitPrice,
                { f: `D${rowNum}*G${rowNum}` } // Formula Total = CANTIDAD * VALOR UNITARIO
            ]);
        });

        const endItemRow = startItemRow + items.length - 1;

        rows.push([]); // Fila vacía separadora

        const subtotalRow = endItemRow + 2;
        const ivaRow = subtotalRow + 1;
        const totalRow = ivaRow + 1;

        // Filas de Totales con Fórmulas Excel SUM y SUMPRODUCT
        rows.push(['', '', '', '', '', '', 'Subtotal antes de IVA:', { f: `SUM(H${startItemRow}:H${endItemRow})` }]);
        rows.push(['', '', '', '', '', '', 'Impuestos (IVA):', { f: `SUMPRODUCT(D${startItemRow}:D${endItemRow}, G${startItemRow}:G${endItemRow}, F${startItemRow}:F${endItemRow})` }]);
        rows.push(['', '', '', '', '', '', 'TOTAL GENERAL (COP):', { f: `H${subtotalRow}+H${ivaRow}` }]);

        // Crear la hoja de trabajo (Worksheet)
        const worksheet = XLSX.utils.aoa_to_sheet(rows);

        // Configurar formato numérico y moneda para las celdas
        items.forEach((item, index) => {
            const r = startItemRow + index;
            // Formato Porcentaje IVA
            const cellIva = worksheet[XLSX.utils.encode_cell({ r: r - 1, c: 5 })];
            if (cellIva) cellIva.z = '0%';

            // Formato Moneda COP para Valor Unitario y Total
            const cellUnit = worksheet[XLSX.utils.encode_cell({ r: r - 1, c: 6 })];
            if (cellUnit) cellUnit.z = '"$"#,##0';

            const cellTotal = worksheet[XLSX.utils.encode_cell({ r: r - 1, c: 7 })];
            if (cellTotal) cellTotal.z = '"$"#,##0';
        });

        // Formatos de celdas de Totales
        const cellSub = worksheet[XLSX.utils.encode_cell({ r: subtotalRow - 1, c: 7 })];
        if (cellSub) cellSub.z = '"$"#,##0';

        const cellTax = worksheet[XLSX.utils.encode_cell({ r: ivaRow - 1, c: 7 })];
        if (cellTax) cellTax.z = '"$"#,##0';

        const cellTot = worksheet[XLSX.utils.encode_cell({ r: totalRow - 1, c: 7 })];
        if (cellTot) cellTot.z = '"$"#,##0';

        // Anchos de columnas óptimos
        worksheet['!cols'] = [
            { wch: 5 },   // #
            { wch: 15 },  // SKU
            { wch: 42 },  // Descripción Producto
            { wch: 12 },  // Cantidad
            { wch: 10 },  // Unidad
            { wch: 10 },  // IVA %
            { wch: 20 },  // Valor Unitario
            { wch: 22 }   // Total
        ];

        // Crear libro de trabajo (Workbook)
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Cotización');

        // Generar Buffer del archivo Excel
        const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        const safeClientName = clientDisplayName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
        const cleanFilename = `Cotizacion_${formattedQuoteNum.replace(/\s+/g, '')}_${safeClientName}.xlsx`;

        return new Response(excelBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="${cleanFilename}"`,
                'Cache-Control': 'no-cache, no-store, must-revalidate'
            }
        });
    } catch (err: any) {
        console.error('Error generando Excel de cotización:', err);
        return NextResponse.json({ error: 'Error generando archivo Excel: ' + err.message }, { status: 500 });
    }
}
