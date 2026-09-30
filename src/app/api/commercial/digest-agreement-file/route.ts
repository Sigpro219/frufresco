import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { extractCommercialProposalAI, parseExcelPriceProposal } from '@/lib/commercial/commercial-parser-engine';
import { findBestProductMatchDetails, sanitizeDocText } from '@/lib/orders/order-parser-engine';
import { GENERAL_INSTITUCIONAL_ID } from '@/lib/pricingUtils';
import * as XLSX from 'xlsx';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const supabaseAdmin = createAdminClient();
    const formData = await req.formData();
    
    const file = formData.get('file') as File | null;
    const clientProfileId = (formData.get('clientProfileId') as string) || null;
    const mode = (formData.get('mode') as string) || 'ai'; // 'ai' | 'standard'
    const rawTextInput = (formData.get('text') as string) || '';

    if (!file && !rawTextInput) {
      return NextResponse.json(
        { error: 'Debes proporcionar un archivo (Excel, CSV, PDF) o texto de lista de precios.' },
        { status: 400 }
      );
    }

    let rawExtractedItems: Array<{
      client_product_name: string;
      accounting_id?: string;
      client_proposed_price: number;
      unit: string;
    }> = [];

    let modelUsed: string | undefined = undefined;
    let detectedClientName = '';
    let validityStart = new Date().toISOString().split('T')[0];
    let validityEnd = '';

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || '';

    if (file) {
      const fileName = (file.name || '').toLowerCase();
      const fileType = (file.type || '').toLowerCase();
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const isExcelOrCsv =
        fileName.endsWith('.xlsx') ||
        fileName.endsWith('.xls') ||
        fileName.endsWith('.csv') ||
        fileType.includes('spreadsheet') ||
        fileType.includes('excel') ||
        fileType.includes('csv');

      const isPdf = fileName.endsWith('.pdf') || fileType.includes('pdf');

      if (isExcelOrCsv && mode === 'standard') {
        // Modo Standard: Parser programático de Excel rápido
        try {
          const parsed = parseExcelPriceProposal(buffer);
          rawExtractedItems = parsed.map(it => ({
            client_product_name: it.client_product_name,
            accounting_id: it.accounting_id,
            client_proposed_price: it.client_proposed_price,
            unit: it.unit || 'Kg',
          }));
          modelUsed = 'Standard XLSX Parser';
        } catch (err: any) {
          console.warn('[Digest Agreement File] Standard parser error, falling back to AI:', err);
        }
      }

      // Si es PDF, o modo AI, o el parser standard retornó 0 ítems
      if (rawExtractedItems.length === 0) {
        if (isPdf) {
          const base64Data = buffer.toString('base64');
          const aiResult = await extractCommercialProposalAI(
            apiKey,
            `Lista de Precios Cliente: ${file.name}`,
            'Analiza esta lista de precios aprobada enviada por el cliente y extrae todos los productos con su precio acordado y unidad de medida.',
            base64Data,
            'application/pdf'
          );

          detectedClientName = aiResult.client_name || '';
          if (aiResult.validity_start) validityStart = aiResult.validity_start;
          if (aiResult.validity_end) validityEnd = aiResult.validity_end;
          modelUsed = aiResult._modelUsed || 'Gemini 3.8 Flash';

          rawExtractedItems = (aiResult.items || []).map(it => ({
            client_product_name: it.client_product_name || (it as any).product_name || '',
            accounting_id: it.accounting_id,
            client_proposed_price: Number(it.client_proposed_price) || 0,
            unit: it.unit || 'Kg',
          }));
        } else if (isExcelOrCsv) {
          // Extraer texto de la hoja Excel para pasarlo a Gemini Flash
          try {
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            let sheetText = '';
            for (const sheetName of workbook.SheetNames) {
              const ws = workbook.Sheets[sheetName];
              const csv = XLSX.utils.sheet_to_csv(ws);
              sheetText += `\n--- HOJA: ${sheetName} ---\n${csv}`;
            }

            const aiResult = await extractCommercialProposalAI(
              apiKey,
              `Lista de Precios Excel/CSV: ${file.name}`,
              sheetText.slice(0, 100000), // safe limit for prompt
              undefined,
              'text/plain'
            );

            detectedClientName = aiResult.client_name || '';
            if (aiResult.validity_start) validityStart = aiResult.validity_start;
            if (aiResult.validity_end) validityEnd = aiResult.validity_end;
            modelUsed = aiResult._modelUsed || 'Gemini 3.8 Flash';

            rawExtractedItems = (aiResult.items || []).map(it => ({
              client_product_name: it.client_product_name || (it as any).product_name || '',
              accounting_id: it.accounting_id,
              client_proposed_price: Number(it.client_proposed_price) || 0,
              unit: it.unit || 'Kg',
            }));
          } catch (aiErr: any) {
            console.warn('[Digest Agreement File] AI Excel extraction failed, attempting fallback parser:', aiErr);
            const parsed = parseExcelPriceProposal(buffer);
            rawExtractedItems = parsed.map(it => ({
              client_product_name: it.client_product_name,
              accounting_id: it.accounting_id,
              client_proposed_price: it.client_proposed_price,
              unit: it.unit || 'Kg',
            }));
            modelUsed = 'Standard XLSX Parser (Fallback)';
          }
        }
      }
    } else if (rawTextInput.trim().length > 0) {
      // Texto libre pegado por el usuario
      const aiResult = await extractCommercialProposalAI(
        apiKey,
        'Lista de Precios Texto Libre',
        rawTextInput,
        undefined,
        'text/plain'
      );

      detectedClientName = aiResult.client_name || '';
      if (aiResult.validity_start) validityStart = aiResult.validity_start;
      if (aiResult.validity_end) validityEnd = aiResult.validity_end;
      modelUsed = aiResult._modelUsed || 'Gemini 3.8 Flash';

      rawExtractedItems = (aiResult.items || []).map(it => ({
        client_product_name: it.client_product_name || (it as any).product_name || '',
        accounting_id: it.accounting_id,
        client_proposed_price: Number(it.client_proposed_price) || 0,
        unit: it.unit || 'Kg',
      }));
    }

    if (rawExtractedItems.length === 0) {
      return NextResponse.json(
        { error: 'No se pudieron identificar productos con precio mayor a cero en el documento suministrado.' },
        { status: 422 }
      );
    }

    // 1. Obtener catálogo maestro de productos
    const { data: dbProducts, error: prodErr } = await supabaseAdmin
      .from('products')
      .select('id, sku, accounting_id, name, unit_of_measure, base_price, is_active, iva_rate, category');

    if (prodErr) {
      console.error('[Digest Agreement File] Error fetching products:', prodErr);
      throw prodErr;
    }

    const catalog = dbProducts || [];

    // 2. Obtener precios del Modelo General Institucional
    let generalPricesMap: Record<string, number> = {};
    try {
      const { data: pmpData } = await supabaseAdmin
        .from('pricing_model_prices')
        .select('product_id, price')
        .eq('model_id', GENERAL_INSTITUCIONAL_ID);

      (pmpData || []).forEach((row: any) => {
        generalPricesMap[row.product_id] = Number(row.price) || 0;
      });
    } catch (err) {
      console.warn('[Digest Agreement File] Error fetching General Institucional prices:', err);
    }

    // 3. Obtener matriz de costos
    let costMatrixMap: Record<string, number> = {};
    try {
      const { data: costs } = await supabaseAdmin
        .from('commercial_cost_matrix')
        .select('product_id, manual_cost');
      (costs || []).forEach((c: any) => {
        costMatrixMap[c.product_id] = Number(c.manual_cost) || 0;
      });
    } catch (err) {
      console.warn('[Digest Agreement File] Error fetching cost matrix:', err);
    }

    // 4. Memoria de auto-aprendizaje del cliente
    let clientLearnedMap: Record<string, string> = {};
    if (clientProfileId) {
      try {
        const { data: memories } = await supabaseAdmin
          .from('document_learning_memory')
          .select('normalized_text, matched_product_id')
          .eq('client_id', clientProfileId);

        (memories || []).forEach((m: any) => {
          if (m.normalized_text && m.matched_product_id) {
            clientLearnedMap[m.normalized_text] = m.matched_product_id;
          }
        });
      } catch (err) {
        console.warn('[Digest Agreement File] Error fetching learning memory:', err);
      }
    }

    // 5. Emparejamiento Semántico y Cálculo Financiero Fila por Fila
    let matchedCount = 0;
    let unmatchedCount = 0;
    let inactiveCount = 0;
    let totalMarginSum = 0;
    let totalSubtotal = 0;

    const reconciledItems = rawExtractedItems.map((rawItem) => {
      const rawName = (rawItem.client_product_name || '').trim();
      const rawPrice = Number(rawItem.client_proposed_price) || 0;
      const rawUnit = (rawItem.unit || 'Kg').trim();
      const rawAccId = (rawItem.accounting_id || '').trim();

      // Búsqueda en memoria de aprendizaje
      const normalizedName = sanitizeDocText(rawName);
      let matchedProd: any = null;
      let matchConfidence: 'high' | 'medium' | 'low' | 'unmatched' = 'unmatched';

      if (clientLearnedMap[normalizedName]) {
        const learnedId = clientLearnedMap[normalizedName];
        matchedProd = catalog.find((p: any) => p.id === learnedId);
        if (matchedProd) matchConfidence = 'high';
      }

      // Búsqueda por Accounting ID o SKU directo
      if (!matchedProd && rawAccId) {
        matchedProd = catalog.find(
          (p: any) =>
            (p.accounting_id && String(p.accounting_id).trim() === rawAccId) ||
            (p.sku && p.sku.toLowerCase() === rawAccId.toLowerCase())
        );
        if (matchedProd) matchConfidence = 'high';
      }

      // Búsqueda semántica / fuzzy con motor central
      if (!matchedProd && rawName) {
        const matchDetails = findBestProductMatchDetails(rawName, catalog);
        if (matchDetails.product && matchDetails.confidenceScore >= 0.55) {
          matchedProd = matchDetails.product;
          matchConfidence = matchDetails.confidenceScore >= 0.8 ? 'high' : 'medium';
        }
      }

      // Cálculo de Costos y Márgenes
      const costBasis = matchedProd
        ? (costMatrixMap[matchedProd.id] || matchedProd.base_price || 0)
        : 0;

      let marginPercent = 0;
      if (rawPrice > 0 && costBasis > 0) {
        marginPercent = Math.round(((rawPrice - costBasis) / rawPrice) * 100);
      }

      const isInactive = matchedProd ? matchedProd.is_active === false : false;

      if (matchedProd) {
        matchedCount++;
        totalMarginSum += marginPercent;
        if (isInactive) inactiveCount++;
      } else {
        unmatchedCount++;
      }

      totalSubtotal += rawPrice;

      return {
        accounting_id: matchedProd
          ? (matchedProd.accounting_id ? String(matchedProd.accounting_id) : matchedProd.sku)
          : (rawAccId || ''),
        client_product_name: rawName,
        product_name: matchedProd ? matchedProd.name : rawName,
        unit: rawUnit || (matchedProd?.unit_of_measure || 'Kg'),
        unit_price: rawPrice,
        cost_basis: costBasis,
        margin_percent: marginPercent,
        iva_rate: matchedProd ? (matchedProd.iva_rate || 0) : 0,
        matched_product: matchedProd || null,
        confidence: matchConfidence,
        is_inactive: isInactive
      };
    });

    const avgMargin = matchedCount > 0 ? Math.round(totalMarginSum / matchedCount) : 0;

    return NextResponse.json({
      success: true,
      detectedClientName,
      validityStart,
      validityEnd,
      modelUsed: modelUsed || 'Gemini 3.8 Flash',
      items: reconciledItems,
      stats: {
        totalItems: reconciledItems.length,
        matchedCount,
        unmatchedCount,
        inactiveCount,
        avgMargin,
        totalSubtotal
      }
    });
  } catch (error: any) {
    console.error('[Digest Agreement File] Fatal error:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno al procesar el archivo de acuerdo comercial.' },
      { status: 500 }
    );
  }
}
