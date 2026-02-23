-- Add Foreign Key for purchases -> products if missing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'purchases' AND constraint_type = 'FOREIGN KEY' AND constraint_name = 'purchases_product_id_fkey') THEN
        BEGIN
            ALTER TABLE purchases ADD CONSTRAINT purchases_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id);
        EXCEPTION WHEN duplicate_object THEN
            RAISE NOTICE 'Constraint already exists';
        END;
    END IF;
END $$;
