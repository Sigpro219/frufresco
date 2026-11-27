-- Escenario 508: Habilitar Supabase Realtime para daily_inventory_closings (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'daily_inventory_closings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_inventory_closings;
  END IF;
END
$$;
