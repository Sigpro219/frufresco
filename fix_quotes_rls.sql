-- Unlock Quotes and items for dev
ALTER TABLE quotes DISABLE ROW LEVEL SECURITY;
ALTER TABLE quote_items DISABLE ROW LEVEL SECURITY;

-- Or add permissive policies
DROP POLICY IF EXISTS "Enable all for everyone" ON quotes;
CREATE POLICY "Enable all for everyone" ON quotes FOR ALL USING (true);

DROP POLICY IF EXISTS "Enable all for everyone" ON quote_items;
CREATE POLICY "Enable all for everyone" ON quote_items FOR ALL USING (true);
