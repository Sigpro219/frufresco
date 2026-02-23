-- Habilitar el canal de registro B2B (Módulo 1)
INSERT INTO app_settings (key, value, description, updated_at)
VALUES (
    'enable_b2b_lead_capture', 
    'true', 
    'Canal de registro para nuevos clientes institucionales (B2B)', 
    NOW()
)
ON CONFLICT (key) 
DO UPDATE SET 
    value = 'true',
    updated_at = NOW();

-- Verificar
SELECT * FROM app_settings WHERE key = 'enable_b2b_lead_capture';
