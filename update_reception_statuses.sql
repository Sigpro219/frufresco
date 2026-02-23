-- Add new statuses for the Reception module to the check constraint
-- Note: In Supabase/Postgres, modifying a check constraint usually requires dropping and adding it again.

-- 1. Drop existing check constraint if it exists (name might vary, usually purchases_status_check)
ALTER TABLE purchases DROP CONSTRAINT IF EXISTS purchases_status_check;

-- 2. Logica de estados actualizada:
-- picking (pending_pickup) -> picked_up (En Transporte) -> receiving (En Recepción) -> received_...
ALTER TABLE purchases 
ADD CONSTRAINT purchases_status_check 
CHECK (status IN (
    'pending',              -- Solicitud inicial
    'purchased',            -- Comprado
    'pending_pickup',       -- Listo para recoger (Picking)
    'partial_pickup',       -- Recogida parcial
    'picked_up',            -- Recogido (En Transporte)
    'rejected',             -- Rechazado en origen
    'receiving',            -- En proceso de recepción (Bodega)
    'received_partial',     -- Recepción Parcial
    'received_ok',          -- Aprobado (Verde)
    'received_review',      -- En Revisión (Amarillo)
    'received_rejected',    -- Rechazado en bodega (Rojo)
    'ready_for_dispatch'    -- Listo para despacho
));
