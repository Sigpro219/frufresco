-- Trigger to set pickup_completed_at automatically
CREATE OR REPLACE FUNCTION set_pickup_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status IN ('picked_up', 'rejected', 'partial_pickup') AND OLD.status NOT IN ('picked_up', 'rejected', 'partial_pickup') THEN
        NEW.pickup_completed_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_pickup_timestamp ON purchases;

CREATE TRIGGER trigger_set_pickup_timestamp
BEFORE UPDATE ON purchases
FOR EACH ROW
EXECUTE FUNCTION set_pickup_timestamp();
