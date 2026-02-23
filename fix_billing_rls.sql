
-- FIX RLS POLICIES FOR BILLING MODULE (DEVELOPMENT MODE)

-- 1. Drops current restrictive policies
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Enable all for authenticated" ON billing_cuts;
    DROP POLICY IF EXISTS "Enable all for authenticated" ON billing_returns;
    DROP POLICY IF EXISTS "Enable all for authenticated" ON billing_invoices;
    DROP POLICY IF EXISTS "Enable all for authenticated" ON billing_modifications;
END $$;

-- 2. Create broad policies for both AUTHENTICATED and ANON (Testing)
-- Note: 'WITH CHECK (true)' is critical for INSERT/UPDATE operations
CREATE POLICY "Enable all for anyone" ON billing_cuts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anyone" ON billing_returns FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anyone" ON billing_invoices FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anyone" ON billing_modifications FOR ALL USING (true) WITH CHECK (true);
