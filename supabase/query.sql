-- =====================================================================================
-- SMARTSTOCK AI - COMPLETE SUPABASE SQL SCRIPT
-- =====================================================================================
-- Run this entire script in your Supabase Dashboard:
-- 1. Log in to https://supabase.com/dashboard
-- 2. Select your Project -> Go to 'SQL Editor' -> Click 'New Query'
-- 3. Paste this script and click 'Run' (Ctrl + Enter)
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 0. PREREQUISITES
-- -------------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -------------------------------------------------------------------------------------
-- 1. CREATE TABLES
-- -------------------------------------------------------------------------------------

-- 1.1 Profiles Table (Linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT DEFAULT 'Operations Lead',
  role_label TEXT DEFAULT 'Store Ops Lead',
  facility_name TEXT DEFAULT 'Apex Retail Outlet',
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- 1.2 Products Table (Inventory Catalog)
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  sku VARCHAR(40) NOT NULL,
  barcode VARCHAR(40),
  category TEXT NOT NULL CHECK (category IN (
    'Peripherals', 'Accessories', 'Electronics', 'Packaging', 'Office Furniture', 'Hardware'
  )),
  supplier VARCHAR(100) NOT NULL,
  purchase_price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (purchase_price >= 0),
  selling_price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (selling_price >= 0),
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  min_stock INTEGER NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
  unit VARCHAR(30) NOT NULL DEFAULT 'Units (pcs)',
  description TEXT,
  image_key VARCHAR(60),
  storage_location VARCHAR(80),
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- 1.3 Stock Transactions Table (Immutable Audit Ledger)
CREATE TABLE IF NOT EXISTS public.stock_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_name VARCHAR(120) NOT NULL,
  sku VARCHAR(40) NOT NULL,
  type VARCHAR(10) NOT NULL CHECK (type IN ('in', 'out')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  previous_stock INTEGER NOT NULL CHECK (previous_stock >= 0),
  resulting_stock INTEGER NOT NULL CHECK (resulting_stock >= 0),
  reason VARCHAR(100) NOT NULL,
  reference VARCHAR(60),
  notes VARCHAR(300),
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- -------------------------------------------------------------------------------------
-- 2. CREATE PERFORMANCE INDEXES
-- -------------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_products_owner ON public.products(owner_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products(owner_id, sku);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(owner_id, category);
CREATE INDEX IF NOT EXISTS idx_products_quantity ON public.products(owner_id, quantity);
CREATE INDEX IF NOT EXISTS idx_transactions_owner ON public.stock_transactions(owner_id);
CREATE INDEX IF NOT EXISTS idx_transactions_product ON public.stock_transactions(product_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON public.stock_transactions(owner_id, created_at DESC);

-- -------------------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY (RLS) POLICIES
-- Ensures each store operator can only see and manage their own inventory
-- -------------------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transactions ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Products Policies
DROP POLICY IF EXISTS "Users can view own products" ON public.products;
CREATE POLICY "Users can view own products" ON public.products
  FOR SELECT USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can insert own products" ON public.products;
CREATE POLICY "Users can insert own products" ON public.products
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can update own products" ON public.products;
CREATE POLICY "Users can update own products" ON public.products
  FOR UPDATE USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can delete own products" ON public.products;
CREATE POLICY "Users can delete own products" ON public.products
  FOR DELETE USING (auth.uid() = owner_id);

-- Transactions Policies
DROP POLICY IF EXISTS "Users can view own transactions" ON public.stock_transactions;
CREATE POLICY "Users can view own transactions" ON public.stock_transactions
  FOR SELECT USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can insert own transactions" ON public.stock_transactions;
CREATE POLICY "Users can insert own transactions" ON public.stock_transactions
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- -------------------------------------------------------------------------------------
-- 4. AUTOMATIC UPDATED_AT TRIGGER
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc', NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_products_updated_at ON public.products;
CREATE TRIGGER set_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- -------------------------------------------------------------------------------------
-- 5. AUTO-CREATE PROFILE ON AUTH SIGNUP
-- Automatically creates a corresponding row in public.profiles when an auth user registers
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'displayName',
      NEW.raw_user_meta_data->>'full_name',
      split_part(NEW.email, '@', 1)
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- -------------------------------------------------------------------------------------
-- 6. ATOMIC STOCK MOVEMENT STORED PROCEDURE (RPC)
-- Race-condition safe concurrency lock via 'FOR UPDATE'
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_stock_movement_atomic(
  p_owner_id UUID,
  p_product_id UUID,
  p_type TEXT,
  p_quantity INTEGER,
  p_reason TEXT,
  p_reference TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_product RECORD;
  v_previous_stock INTEGER;
  v_resulting_stock INTEGER;
  v_tx_id UUID;
BEGIN
  -- 1. Lock product row atomically for update
  SELECT * INTO v_product
  FROM public.products
  WHERE id = p_product_id AND owner_id = p_owner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product with ID % not found or not owned by user.', p_product_id;
  END IF;

  v_previous_stock := v_product.quantity;

  -- 2. Validate and calculate stock change
  IF p_type = 'in' THEN
    v_resulting_stock := v_previous_stock + p_quantity;
  ELSIF p_type = 'out' THEN
    IF v_previous_stock < p_quantity THEN
      RAISE EXCEPTION 'Insufficient stock for %. Available: %, Requested: %', v_product.name, v_previous_stock, p_quantity;
    END IF;
    v_resulting_stock := v_previous_stock - p_quantity;
  ELSE
    RAISE EXCEPTION 'Invalid transaction type: %. Must be "in" or "out".', p_type;
  END IF;

  -- 3. Update product quantity
  UPDATE public.products
  SET quantity = v_resulting_stock, updated_at = TIMEZONE('utc', NOW())
  WHERE id = p_product_id;

  -- 4. Insert audit ledger row
  INSERT INTO public.stock_transactions (
    owner_id, product_id, product_name, sku, type,
    quantity, previous_stock, resulting_stock,
    reason, reference, notes, created_at
  )
  VALUES (
    p_owner_id, p_product_id, v_product.name, v_product.sku, p_type,
    p_quantity, v_previous_stock, v_resulting_stock,
    p_reason, p_reference, p_notes, TIMEZONE('utc', NOW())
  )
  RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'transactionId', v_tx_id,
    'productId', p_product_id,
    'previousStock', v_previous_stock,
    'resultingStock', v_resulting_stock,
    'quantity', p_quantity,
    'type', p_type
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -------------------------------------------------------------------------------------
-- 7. ENABLE REALTIME PUBLICATION
-- -------------------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_transactions;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

-- -------------------------------------------------------------------------------------
-- 8. DEMO SEED QUERY (OPTIONAL)
-- To seed starter inventory for a specific user, replace '<YOUR_AUTH_USER_UUID>' with your User ID
-- -------------------------------------------------------------------------------------
/*
DO $$
DECLARE
  v_user_id UUID := 'YOUR_AUTH_USER_UUID'::UUID; -- Replace with auth.uid()
  v_p1 UUID; v_p2 UUID; v_p3 UUID; v_p4 UUID; v_p5 UUID; v_p6 UUID;
BEGIN
  INSERT INTO public.products (owner_id, name, sku, barcode, category, supplier, purchase_price, selling_price, quantity, min_stock, unit, image_key, storage_location, description)
  VALUES (v_user_id, 'Logitech MX Master 3S', 'TECH-3042', '097855172280', 'Peripherals', 'TechSupply Co.', 72.00, 99.99, 4, 15, 'Units (pcs)', 'wireless-mouse', 'Rack 03 · Bay B · Bin 14', 'Ergonomic wireless mouse with 8000 DPI sensor')
  RETURNING id INTO v_p1;

  INSERT INTO public.products (owner_id, name, sku, barcode, category, supplier, purchase_price, selling_price, quantity, min_stock, unit, image_key, storage_location, description)
  VALUES (v_user_id, 'Braided USB-C Cable 2M', 'CAB-4410', '097855180112', 'Accessories', 'PowerPro Logistics', 3.50, 12.99, 148, 30, 'Units (pcs)', 'usbc-cable', 'Rack 01 · Bay A · Bin 03', 'Double-braided 100W fast charging cable')
  RETURNING id INTO v_p2;

  INSERT INTO public.products (owner_id, name, sku, barcode, category, supplier, purchase_price, selling_price, quantity, min_stock, unit, image_key, storage_location, description)
  VALUES (v_user_id, 'Eco Thermal Paper Rolls (50pk)', 'SUP-5541', '097855194401', 'Packaging', 'Pacific Paper & Packaging', 18.00, 29.99, 0, 20, 'Packs (pk)', 'thermal-rolls', 'Rack 07 · Bay C · Bin 02', 'BPA-free 80mm thermal POS paper rolls')
  RETURNING id INTO v_p3;

  -- Initial Stock Transactions
  INSERT INTO public.stock_transactions (owner_id, product_id, product_name, sku, type, quantity, previous_stock, resulting_stock, reason, reference)
  VALUES (v_user_id, v_p1, 'Logitech MX Master 3S', 'TECH-3042', 'in', 4, 0, 4, 'Opening Warehouse Balance', 'PO-2026-01');

  INSERT INTO public.stock_transactions (owner_id, product_id, product_name, sku, type, quantity, previous_stock, resulting_stock, reason, reference)
  VALUES (v_user_id, v_p2, 'Braided USB-C Cable 2M', 'CAB-4410', 'in', 148, 0, 148, 'Opening Warehouse Balance', 'PO-2026-02');
END $$;
*/

-- -------------------------------------------------------------------------------------
-- 9. COMMON ANALYTICAL QUERIES
-- -------------------------------------------------------------------------------------

-- Query A: Get all Low-Stock and Out-of-Stock items
-- SELECT name, sku, category, quantity, min_stock, supplier FROM public.products WHERE quantity <= min_stock ORDER BY quantity ASC;

-- Query B: Store Inventory Financial Summary
-- SELECT COUNT(*) as total_items, SUM(quantity) as total_units, ROUND(SUM(quantity * purchase_price), 2) as total_cost, ROUND(SUM(quantity * selling_price), 2) as total_retail_value FROM public.products;
