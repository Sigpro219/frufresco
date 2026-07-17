-- Create General Institucional pricing model for default B2B catalog fallback
INSERT INTO pricing_models (id, name, base_margin_percent, description, is_base_model, b2c_autosync_enabled, autosync_days)
VALUES (
    'd90a91e5-827c-473d-9d4f-3e28c7c91e15',
    'General Institucional',
    0.00,
    'Modelo predeterminado para clientes institucionales B2B cuando no existe acuerdo específico',
    false,
    true,
    ARRAY[0,1,2,3,4,5,6]
)
ON CONFLICT (id) DO NOTHING;
