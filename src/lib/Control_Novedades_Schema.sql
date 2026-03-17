-- Add evidence and decision fields to inventory movements
ALTER TABLE inventory_movements 
ADD COLUMN IF NOT EXISTS evidence_url TEXT,
ADD COLUMN IF NOT EXISTS admin_decision TEXT, -- 'inventory', 'waste', 'donation'
ADD COLUMN IF NOT EXISTS status_to TEXT; -- To support 'returned' status before decision

-- Create view for Control de Novedades
CREATE OR REPLACE VIEW v_novedades_control AS
SELECT 
    m.id,
    m.created_at,
    p.name as product_name,
    p.sku,
    m.quantity,
    m.notes,
    m.evidence_url,
    m.admin_decision,
    m.status_to,
    m.reference_id as stop_id
FROM inventory_movements m
JOIN products p ON m.product_id = p.id
WHERE m.reference_type = 'delivery_return'
OR m.status_to = 'returned';
