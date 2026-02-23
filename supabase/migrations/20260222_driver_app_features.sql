-- Migration: Driver Activity and Audit Features
-- Date: 2026-02-22

-- 1. Table for Vehicle Odometer and Persistence
ALTER TABLE IF EXISTS fleet_vehicles 
ADD COLUMN IF NOT EXISTS current_odometer NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_odometer_update TIMESTAMPTZ DEFAULT NOW();

-- 2. Table for Delivery Events (Unified Activity Log and Discrepancies)
CREATE TABLE IF NOT EXISTS delivery_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stop_id UUID REFERENCES route_stops(id),
    order_id UUID, -- Optional, for order-level events
    event_type TEXT NOT NULL, -- 'activity_operation', 'activity_refuel', 'rejection', etc.
    description TEXT, -- Structured logs like "GPS AUDIT | DURACIÓN: ... | KM: ..."
    evidence_url TEXT, -- For photos of rejections or fuel vouchers
    created_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb -- For future extensibility (e.g. raw coords)
);

-- 3. Table for Asset Movements (Specifically for Canastillas/Crates)
CREATE TABLE IF NOT EXISTS asset_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID REFERENCES routes(id),
    type TEXT NOT NULL, -- 'delivery', 'pickup', 'adjustment'
    quantity INTEGER NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Update route_stops for completion tracking
ALTER TABLE IF EXISTS route_stops 
ADD COLUMN IF NOT EXISTS completion_time TIMESTAMPTZ;

-- 5. Inventory Movements (Ensure relevant columns exist for returns)
-- Assuming table exists from inventory module, adding references if needed
ALTER TABLE IF EXISTS inventory_movements
ADD COLUMN IF NOT EXISTS reference_type TEXT, -- 'delivery_return'
ADD COLUMN IF NOT EXISTS reference_id TEXT;  -- stop_id or order_id

-- 6. RLS Policies (Ensure drivers can insert/update their own logs)
-- Note: These are baseline policies, adjust based on your specific role structure
ALTER TABLE delivery_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_movements ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users (drivers) to insert logs
CREATE POLICY "Drivers can insert delivery events" ON delivery_events
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Drivers can insert asset movements" ON asset_movements
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Allow all authenticated users to read (for control tower)
CREATE POLICY "Authenticated users can read delivery events" ON delivery_events
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can read asset movements" ON asset_movements
    FOR SELECT USING (auth.role() = 'authenticated');
