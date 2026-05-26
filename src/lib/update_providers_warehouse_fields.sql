-- Add warehouse location and booth fields to providers table
ALTER TABLE providers 
ADD COLUMN IF NOT EXISTS warehouse_location integer,
ADD COLUMN IF NOT EXISTS puesto text;

COMMENT ON COLUMN providers.warehouse_location IS 'Ubicación numérica de bodega asociada al proveedor';
COMMENT ON COLUMN providers.puesto IS 'Código alfanumérico del puesto o stand del proveedor';
