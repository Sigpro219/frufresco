-- =============================================================================
-- Migración: 20261028_drop_legacy_purchases_pricing_trigger.sql
-- Descripción (SDD v1.9.319):
--   1. Elimina el trigger por fila legado `trigger_purchases_pricing_sync` en
--      `purchases` que recalculaba los 6 modelos × ~620 productos en cada
--      INSERT/UPDATE de compra, provocando timeouts (> 8s) en inserciones por
--      lote. La sincronización de precios se ejecuta de manera controlada por
--      producto/lote desde `batchRecalculateAndSyncPrices` (pricingUtils.ts) y
--      el trigger de `commercial_cost_matrix`.
--   2. Depura las filas sintéticas de 1 Kg (`payment_method = 'market_quote'`
--      con origen `RECOTIZACION_MERCADO_EXCEL%`) para preservar la pureza del
--      libro contable de compras reales (`purchases`).
-- =============================================================================

DROP TRIGGER IF EXISTS trigger_purchases_pricing_sync ON purchases;
DROP TRIGGER IF EXISTS trigger_rules_pricing_sync ON pricing_rules;
DROP TRIGGER IF EXISTS trigger_models_pricing_sync ON pricing_models;

DELETE FROM purchases
WHERE payment_method = 'market_quote'
  AND raw_data_source LIKE 'RECOTIZACION_MERCADO_EXCEL%';
