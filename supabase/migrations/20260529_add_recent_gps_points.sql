-- Migration: Add recent_gps_points column to fleet_vehicles
ALTER TABLE fleet_vehicles ADD COLUMN IF NOT EXISTS recent_gps_points JSONB DEFAULT '[]'::jsonb;
