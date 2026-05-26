-- Create table to track supplier/provider purchase novelties (Rejections, Deficits, Warnings)
CREATE TABLE IF NOT EXISTS provider_novelties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_id UUID REFERENCES purchases(id) ON DELETE SET NULL,
    task_id UUID REFERENCES procurement_tasks(id) ON DELETE SET NULL,
    provider_id UUID REFERENCES providers(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    variant_label TEXT,
    novelty_type TEXT NOT NULL, -- 'rejection' (Quality red/Explicit reject), 'deficit' (quantity shortage), 'warning' (Quality yellow)
    quantity NUMERIC NOT NULL,
    unit TEXT,
    reason TEXT,
    description TEXT,
    evidence_url TEXT,
    resolved BOOLEAN DEFAULT FALSE,
    resolution_action TEXT, -- 'purchased_elsewhere', 'reprogrammed', 'claimed_financially'
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security (RLS)
ALTER TABLE provider_novelties ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (consistent with FruFresco open-development style)
CREATE POLICY "Allow public read" ON provider_novelties FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON provider_novelties FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON provider_novelties FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON provider_novelties FOR DELETE USING (true);
