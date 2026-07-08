-- Migration: Add show_on_web column to product_attributes_master table
ALTER TABLE public.product_attributes_master 
ADD COLUMN IF NOT EXISTS show_on_web BOOLEAN DEFAULT true;
