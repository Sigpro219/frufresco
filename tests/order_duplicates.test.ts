import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectDuplicateOrders,
  areOrdersDuplicate,
  getOrderDocumentSignature
} from '../src/lib/orderDuplicates';

test('detectDuplicateOrders: Discrimina correctamente pedidos con diferentes PDFs para el mismo cliente y fecha', () => {
  const baseOrder = {
    profile_id: 'client-123',
    customer_name: 'Restaurante Monserrate',
    delivery_date: '2026-09-24',
    shipping_address: 'Cerro Monserrate Cra 2 Este # 21-48',
    status: 'pending',
    created_at: '2026-09-23T14:00:00Z'
  };

  const order1 = {
    ...baseOrder,
    id: 'ord-1',
    sequence_id: 885,
    document_url: 'https://storage.supabase.co/order-attachments/5637e737_0_1_010OCC17309_.pdf',
    total: 1573400,
    total_weight_kg: 104
  };

  const order2 = {
    ...baseOrder,
    id: 'ord-2',
    sequence_id: 905,
    document_url: 'https://storage.supabase.co/order-attachments/ab42b76d_0_1_010OCC17245_.pdf',
    total: 34400,
    total_weight_kg: 4
  };

  const order3 = {
    ...baseOrder,
    id: 'ord-3',
    sequence_id: 906,
    document_url: 'https://storage.supabase.co/order-attachments/8f42d0f1_0_1_010OCC17338_.pdf',
    total: 216200,
    total_weight_kg: 40
  };

  // Escenario 1: Los 3 pedidos vienen de diferentes PDFs
  assert.equal(areOrdersDuplicate(order1, order2), false);
  assert.equal(areOrdersDuplicate(order2, order3), false);
  assert.equal(areOrdersDuplicate(order1, order3), false);

  const duplicatesResult = detectDuplicateOrders([order1, order2, order3]);
  assert.equal(duplicatesResult.size, 0, 'No debe haber pedidos marcados como duplicados cuando provienen de PDFs distintos');

  // Escenario 2: Se importa por error dos veces el mismo PDF (order3 duplicado)
  const order3Duplicate = {
    ...order3,
    id: 'ord-3-clone',
    sequence_id: 999
  };

  assert.equal(areOrdersDuplicate(order3, order3Duplicate), true, 'Dos órdenes con el mismo PDF sí deben detectarse como duplicadas');

  const collisionResult = detectDuplicateOrders([order1, order2, order3, order3Duplicate]);
  assert.equal(collisionResult.size, 2, 'Solo las 2 órdenes con el mismo PDF deben ser marcadas como duplicadas');
  assert.equal(collisionResult.has('ord-1'), false, 'Order 1 con PDF diferente no debe estar en la lista de duplicados');
  assert.equal(collisionResult.has('ord-2'), false, 'Order 2 con PDF diferente no debe estar en la lista de duplicados');
  assert.equal(collisionResult.has('ord-3'), true, 'Order 3 debe estar marcada');
  assert.equal(collisionResult.has('ord-3-clone'), true, 'Order 3 Clone debe estar marcada');
});

test('getOrderDocumentSignature: extrae correctamente el nombre limpio y número de OC', () => {
  const orderWithDoc = {
    document_url: 'https://csqurhdykbalvlnpowcz.supabase.co/storage/v1/object/public/order-attachments/5637e737-bae3-449e-b783-53fe34d08143_0_1_010OCC17309_.pdf'
  };
  const sig = getOrderDocumentSignature(orderWithDoc);
  assert.equal(sig.filename, '010occ17309_.pdf');
  assert.equal(sig.ocNumber, '17309');
});
