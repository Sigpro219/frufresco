-- Migration: Integrate pricing model prices cache table, triggers, and calculations
-- Path: supabase/migrations/20260609_pricing_model_prices.sql

-- 1. Create table for precalculated prices
CREATE TABLE IF NOT EXISTS pricing_model_prices (
    model_id UUID REFERENCES pricing_models(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    price NUMERIC NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (model_id, product_id)
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE pricing_model_prices ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policies (Idempotent: Drop first if exists)
DROP POLICY IF EXISTS "Allow public read access to default model" ON pricing_model_prices;
CREATE POLICY "Allow public read access to default model"
ON pricing_model_prices
FOR SELECT
TO public, anonymous, authenticated
USING (model_id = 'f7043ca1-94d5-4d25-bd10-fbf30ce120ee');

-- Allow authenticated users to read prices assigned to their pricing model
DROP POLICY IF EXISTS "Allow users to read their model prices" ON pricing_model_prices;
CREATE POLICY "Allow users to read their model prices"
ON pricing_model_prices
FOR SELECT
TO authenticated
USING (
    model_id = (SELECT pricing_model_id FROM profiles WHERE id = auth.uid())
);

-- Allow administrators full access
DROP POLICY IF EXISTS "Allow admins all access" ON pricing_model_prices;
CREATE POLICY "Allow admins all access"
ON pricing_model_prices
FOR ALL
TO authenticated
USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);

-- 4. Create function to recalculate pricing model prices
CREATE OR REPLACE FUNCTION recalculate_model_prices(p_model_id UUID)
RETURNS VOID AS $$
DECLARE
    v_base_margin NUMERIC;
    v_model_name TEXT;
BEGIN
    SELECT base_margin_percent, name INTO v_base_margin, v_model_name FROM pricing_models WHERE id = p_model_id;
    IF v_base_margin IS NULL THEN RETURN; END IF;

    -- Delete existing entries for this model
    DELETE FROM pricing_model_prices WHERE model_id = p_model_id;

    -- Recalculate and insert
    INSERT INTO pricing_model_prices (model_id, product_id, price)
    SELECT 
        p_model_id,
        p.id,
        CEIL(
            (
                -- Cost calculation prioritizing Manual Commercial Overrides first, then Latest Purchase with conversions, then base price.
                COALESCE(
                    (
                        SELECT co.manual_cost
                        FROM commercial_overrides co
                        WHERE co.product_id = p.id AND (co.expires_at IS NULL OR co.expires_at > NOW())
                        LIMIT 1
                    ),
                    CASE 
                        WHEN cost.unit_price IS NULL OR cost.unit_price = 0 THEN p.base_price
                        WHEN cost.purchase_unit = p.unit_of_measure THEN cost.unit_price
                        ELSE COALESCE(
                            -- Conversion from purchase unit to product unit
                            (
                                SELECT cost.unit_price / c.conversion_factor 
                                FROM product_conversions c 
                                WHERE c.product_id = p.id AND c.from_unit = cost.purchase_unit AND c.to_unit = p.unit_of_measure
                                LIMIT 1
                            ),
                            -- Conversion from product unit to purchase unit
                            (
                                SELECT cost.unit_price * c.conversion_factor 
                                FROM product_conversions c 
                                WHERE c.product_id = p.id AND c.from_unit = p.unit_of_measure AND c.to_unit = cost.purchase_unit
                                LIMIT 1
                            ),
                            cost.unit_price -- Fallback if conversion factor doesn't exist
                        )
                    END
                ) * 
                (1 + (v_base_margin + COALESCE(rule.margin_adjustment, 0)) / 100) * 
                (1 + COALESCE(p.iva_rate, 0) / 100)
            ) / 50
        ) * 50 AS calculated_price
    FROM products p
    LEFT JOIN LATERAL (
        SELECT pur.unit_price, pur.purchase_unit
        FROM purchases pur
        WHERE pur.product_id = p.id
        ORDER BY pur.created_at DESC
        LIMIT 1
    ) cost ON TRUE
    LEFT JOIN pricing_rules rule ON rule.model_id = p_model_id AND rule.product_id = p.id
    WHERE p.is_active = TRUE AND (v_model_name <> 'Clientes B2C' OR p.show_on_web = TRUE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Create trigger function to sync pricing
CREATE OR REPLACE FUNCTION trigger_recalculate_pricing()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_TABLE_NAME = 'purchases' THEN
        PERFORM recalculate_model_prices(id) FROM pricing_models;
    ELSIF TG_TABLE_NAME = 'pricing_rules' THEN
        IF TG_OP = 'DELETE' THEN
            PERFORM recalculate_model_prices(OLD.model_id);
        ELSE
            PERFORM recalculate_model_prices(NEW.model_id);
        END IF;
    ELSIF TG_TABLE_NAME = 'pricing_models' THEN
        IF TG_OP = 'UPDATE' AND OLD.base_margin_percent <> NEW.base_margin_percent THEN
            PERFORM recalculate_model_prices(NEW.id);
        END IF;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Attach triggers
DROP TRIGGER IF EXISTS trigger_purchases_pricing_sync ON purchases;
CREATE TRIGGER trigger_purchases_pricing_sync
AFTER INSERT OR UPDATE ON purchases
FOR EACH ROW EXECUTE FUNCTION trigger_recalculate_pricing();

DROP TRIGGER IF EXISTS trigger_rules_pricing_sync ON pricing_rules;
CREATE TRIGGER trigger_rules_pricing_sync
AFTER INSERT OR UPDATE OR DELETE ON pricing_rules
FOR EACH ROW EXECUTE FUNCTION trigger_recalculate_pricing();

DROP TRIGGER IF EXISTS trigger_models_pricing_sync ON pricing_models;
CREATE TRIGGER trigger_models_pricing_sync
AFTER UPDATE ON pricing_models
FOR EACH ROW EXECUTE FUNCTION trigger_recalculate_pricing();

-- 7. Execute initial calculations for all pricing models
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT id FROM pricing_models LOOP
        PERFORM recalculate_model_prices(r.id);
    END LOOP;
END $$;
