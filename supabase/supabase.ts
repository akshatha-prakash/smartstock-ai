/**
 * =====================================================================================
 * SmartStock AI - Supabase Backend Connectivity & Database Layer
 * =====================================================================================
 * 
 * File: supabase/supabase.ts
 *
 * This single unified file provides full-stack backend connectivity between
 * SmartStock AI and Supabase (PostgreSQL, Row Level Security, Auth, and Realtime).
 *
 * It includes:
 * 1. Embedded complete PostgreSQL DDL Schema & Queries (SUPABASE_SCHEMA_SQL)
 * 2. Fully typed Supabase client (Vite client-side & Node.js server-side compatible)
 * 3. PostgreSQL <-> SmartStock AI entity mappers
 * 4. Error-free Authentication, Profile, Product Catalog, and Stock Movement APIs
 * 5. Atomic concurrency-safe stock movement RPC integration
 * 6. Realtime live update subscriptions
 * 7. Inventory analytical queries and Gemini AI context builder
 * =====================================================================================
 */

import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import {
  AppTimestamp,
  Product,
  ProductCategory,
  ProductInput,
  StockMovementInput,
  StockStatus,
  StockTransaction,
  toAppTimestamp,
  TransactionType,
  UserProfile,
  VALIDATION_LIMITS,
} from '../src/types/inventory';

export {
  toAppTimestamp,
  VALIDATION_LIMITS,
};
export type {
  AppTimestamp,
  Product,
  ProductCategory,
  ProductInput,
  StockMovementInput,
  StockStatus,
  StockTransaction,
  TransactionType,
  UserProfile,
};

// =====================================================================================
// 1. SUPABASE POSTGRESQL SCHEMA DDL & SQL QUERIES
// =====================================================================================

export const SUPABASE_SCHEMA_SQL = `
-- =====================================================================================
-- SMARTSTOCK AI - COMPLETE SUPABASE DATABASE SETUP QUERY
-- Copy and run this in your Supabase Dashboard -> SQL Editor
-- =====================================================================================

-- 0. Enable UUID generation extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -------------------------------------------------------------------------------------
-- 1. PROFILES TABLE (Linked to Supabase auth.users)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT DEFAULT 'Operations Lead',
  role_label TEXT DEFAULT 'Store Ops Lead',
  facility_name TEXT DEFAULT 'Apex Retail Outlet',
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- -------------------------------------------------------------------------------------
-- 2. PRODUCTS TABLE
-- -------------------------------------------------------------------------------------
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

-- -------------------------------------------------------------------------------------
-- 3. STOCK TRANSACTIONS TABLE (Append-Only Audit Ledger)
-- -------------------------------------------------------------------------------------
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
-- 4. PERFORMANCE INDEXES
-- -------------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_products_owner ON public.products(owner_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products(owner_id, sku);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(owner_id, category);
CREATE INDEX IF NOT EXISTS idx_products_quantity ON public.products(owner_id, quantity);
CREATE INDEX IF NOT EXISTS idx_transactions_owner ON public.stock_transactions(owner_id);
CREATE INDEX IF NOT EXISTS idx_transactions_product ON public.stock_transactions(product_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON public.stock_transactions(owner_id, created_at DESC);

-- -------------------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
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
-- 6. AUTOMATIC UPDATED_AT TRIGGER
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
-- 7. AUTO-PROVISION PROFILE ON AUTH SIGNUP TRIGGER
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'displayName',
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
-- 8. ATOMIC STOCK MOVEMENT STORED PROCEDURE (RPC)
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
  -- Lock product row atomically
  SELECT * INTO v_product
  FROM public.products
  WHERE id = p_product_id AND owner_id = p_owner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product with ID % not found or not owned by user.', p_product_id;
  END IF;

  v_previous_stock := v_product.quantity;

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

  -- Update product quantity and timestamp
  UPDATE public.products
  SET quantity = v_resulting_stock, updated_at = TIMEZONE('utc', NOW())
  WHERE id = p_product_id;

  -- Insert immutable ledger entry
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
-- 9. ENABLE REALTIME PUBLICATION
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
`;

export const SUPABASE_ANALYTICS_QUERIES_SQL = `
-- =====================================================================================
-- USEFUL OPERATIONAL & ANALYTICS QUERIES FOR SMARTSTOCK AI
-- Run these queries directly in Supabase SQL Editor
-- =====================================================================================

-- 1. Identify all Low-Stock and Out-of-Stock items
SELECT
  id,
  name,
  sku,
  category,
  quantity,
  min_stock,
  supplier,
  CASE
    WHEN quantity <= 0 THEN 'OUT_OF_STOCK'
    WHEN quantity <= min_stock THEN 'LOW_STOCK'
    ELSE 'HEALTHY'
  END AS inventory_status
FROM public.products
WHERE quantity <= min_stock
ORDER BY quantity ASC, min_stock DESC;

-- 2. Inventory Valuation Summary (Total Cost, Retail Value, Potential Gross Margin)
SELECT
  COUNT(*) AS total_skus,
  SUM(quantity) AS total_units_in_stock,
  ROUND(SUM(quantity * purchase_price), 2) AS total_inventory_cost_value,
  ROUND(SUM(quantity * selling_price), 2) AS total_inventory_retail_value,
  ROUND(SUM(quantity * selling_price) - SUM(quantity * purchase_price), 2) AS potential_gross_profit
FROM public.products;

-- 3. Stock Movement Velocity (Last 30 Days Outbound & Inbound by SKU)
SELECT
  p.name,
  p.sku,
  p.category,
  p.quantity AS current_stock,
  COALESCE(SUM(CASE WHEN t.type = 'in' THEN t.quantity ELSE 0 END), 0) AS inbound_units_30d,
  COALESCE(SUM(CASE WHEN t.type = 'out' THEN t.quantity ELSE 0 END), 0) AS outbound_units_30d,
  COUNT(t.id) AS total_transactions_30d
FROM public.products p
LEFT JOIN public.stock_transactions t
  ON p.id = t.product_id
  AND t.created_at >= (NOW() - INTERVAL '30 days')
GROUP BY p.id, p.name, p.sku, p.category, p.quantity
ORDER BY outbound_units_30d DESC;

-- 4. Recent Stock Activity Audit Trail (Last 25 entries)
SELECT
  t.created_at,
  t.product_name,
  t.sku,
  t.type,
  t.quantity,
  t.previous_stock,
  t.resulting_stock,
  t.reason,
  t.reference
FROM public.stock_transactions t
ORDER BY t.created_at DESC
LIMIT 25;
`;

// =====================================================================================
// 2. DATABASE SCHEMA TYPES
// =====================================================================================

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          display_name: string;
          role_label: string;
          facility_name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          display_name?: string;
          role_label?: string;
          facility_name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          display_name?: string;
          role_label?: string;
          facility_name?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      products: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          sku: string;
          barcode: string | null;
          category: ProductCategory;
          supplier: string;
          purchase_price: number;
          selling_price: number;
          quantity: number;
          min_stock: number;
          unit: string;
          description: string | null;
          image_key: string | null;
          storage_location: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          sku: string;
          barcode?: string | null;
          category: ProductCategory;
          supplier: string;
          purchase_price?: number;
          selling_price?: number;
          quantity?: number;
          min_stock?: number;
          unit?: string;
          description?: string | null;
          image_key?: string | null;
          storage_location?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          name?: string;
          sku?: string;
          barcode?: string | null;
          category?: ProductCategory;
          supplier?: string;
          purchase_price?: number;
          selling_price?: number;
          quantity?: number;
          min_stock?: number;
          unit?: string;
          description?: string | null;
          image_key?: string | null;
          storage_location?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      stock_transactions: {
        Row: {
          id: string;
          owner_id: string;
          product_id: string;
          product_name: string;
          sku: string;
          type: 'in' | 'out';
          quantity: number;
          previous_stock: number;
          resulting_stock: number;
          reason: string;
          reference: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          product_id: string;
          product_name: string;
          sku: string;
          type: 'in' | 'out';
          quantity: number;
          previous_stock: number;
          resulting_stock: number;
          reason: string;
          reference?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          product_id?: string;
          product_name?: string;
          sku?: string;
          type?: 'in' | 'out';
          quantity?: number;
          previous_stock?: number;
          resulting_stock?: number;
          reason?: string;
          reference?: string | null;
          notes?: string | null;
          created_at?: string;
        };
      };
    };
    Functions: {
      record_stock_movement_atomic: {
        Args: {
          p_owner_id: string;
          p_product_id: string;
          p_type: string;
          p_quantity: number;
          p_reason: string;
          p_reference?: string | null;
          p_notes?: string | null;
        };
        Returns: {
          transactionId: string;
          productId: string;
          previousStock: number;
          resultingStock: number;
          quantity: number;
          type: string;
        };
      };
    };
  };
}

// =====================================================================================
// 3. DATA MAPPERS (PostgreSQL snake_case <-> Application camelCase)
// =====================================================================================

export function mapProductRowToProduct(row: Database['public']['Tables']['products']['Row']): Product {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    sku: row.sku,
    barcode: row.barcode ?? undefined,
    category: row.category,
    supplier: row.supplier,
    purchasePrice: Number(row.purchase_price) || 0,
    sellingPrice: Number(row.selling_price) || 0,
    quantity: Number(row.quantity) || 0,
    minStock: Number(row.min_stock) || 0,
    unit: row.unit,
    description: row.description ?? undefined,
    imageKey: row.image_key ?? undefined,
    storageLocation: row.storage_location ?? undefined,
    createdAt: toAppTimestamp(row.created_at),
    updatedAt: toAppTimestamp(row.updated_at),
  };
}

export function mapProductInputToInsertRow(
  ownerId: string,
  input: ProductInput,
): Database['public']['Tables']['products']['Insert'] {
  return {
    owner_id: ownerId,
    name: input.name.trim().slice(0, VALIDATION_LIMITS.NAME_MAX),
    sku: input.sku.trim().toUpperCase().slice(0, VALIDATION_LIMITS.SKU_MAX),
    barcode: input.barcode ? input.barcode.trim().slice(0, VALIDATION_LIMITS.BARCODE_MAX) : null,
    category: input.category,
    supplier: input.supplier.trim().slice(0, VALIDATION_LIMITS.SUPPLIER_MAX),
    purchase_price: Math.max(0, Number(input.purchasePrice) || 0),
    selling_price: Math.max(0, Number(input.sellingPrice) || 0),
    quantity: Math.max(0, Math.round(Number(input.quantity) || 0)),
    min_stock: Math.max(0, Math.round(Number(input.minStock) || 0)),
    unit: input.unit.trim().slice(0, VALIDATION_LIMITS.UNIT_MAX) || 'Units (pcs)',
    description: input.description ? input.description.trim().slice(0, VALIDATION_LIMITS.DESCRIPTION_MAX) : null,
    image_key: input.imageKey ? input.imageKey.trim().slice(0, 60) : null,
    storage_location: input.storageLocation ? input.storageLocation.trim().slice(0, VALIDATION_LIMITS.STORAGE_MAX) : null,
  };
}

export function mapTransactionRowToTransaction(
  row: Database['public']['Tables']['stock_transactions']['Row'],
): StockTransaction {
  return {
    id: row.id,
    ownerId: row.owner_id,
    productId: row.product_id,
    productName: row.product_name,
    sku: row.sku,
    type: row.type,
    quantity: Number(row.quantity) || 0,
    previousStock: Number(row.previous_stock) || 0,
    resultingStock: Number(row.resulting_stock) || 0,
    reason: row.reason,
    reference: row.reference ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: toAppTimestamp(row.created_at),
  };
}

export function mapProfileRowToProfile(row: Database['public']['Tables']['profiles']['Row']): UserProfile {
  return {
    uid: row.id,
    email: row.email,
    displayName: row.display_name,
    roleLabel: row.role_label,
    facilityName: row.facility_name,
    createdAt: toAppTimestamp(row.created_at),
    updatedAt: toAppTimestamp(row.updated_at),
  };
}

// =====================================================================================
// 4. SUPABASE CLIENT INITIALIZATION
// =====================================================================================

function cleanUrl(raw: string): string {
  if (!raw) return '';
  return raw.trim().replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
}

function getSupabaseConfig(): { url: string; anonKey: string; serviceRoleKey?: string } {
  let url = '';
  let anonKey = '';
  let serviceRoleKey: string | undefined = undefined;

  // 1. Check Vite frontend environment (import.meta.env)
  try {
    if (typeof import.meta !== 'undefined' && import.meta && import.meta.env) {
      url = cleanUrl(String(import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL || ''));
      anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.SUPABASE_ANON_KEY || '').trim();
    }
  } catch (_e) {
    // import.meta not available
  }

  // 2. Check Node.js runtime environment (process.env)
  try {
    const proc = typeof globalThis !== 'undefined' && (globalThis as any).process ? (globalThis as any).process : undefined;
    if (proc && proc.env) {
      if (!url) url = cleanUrl(String(proc.env.VITE_SUPABASE_URL || proc.env.SUPABASE_URL || ''));
      if (!anonKey) anonKey = String(proc.env.VITE_SUPABASE_ANON_KEY || proc.env.SUPABASE_ANON_KEY || '').trim();
      serviceRoleKey = proc.env.SUPABASE_SERVICE_ROLE_KEY ? String(proc.env.SUPABASE_SERVICE_ROLE_KEY).trim() : undefined;
    }
  } catch (_e) {
    // process not available
  }

  // Format valid fallback URL to prevent createClient URL-parser exceptions
  const defaultUrl = 'https://goemsmrwuisxqhzkczju.supabase.co';
  const defaultAnonKey = 'sb_publishable_v27y5thSgUW6-VSRLcAsZQ_g6KI4S1b';

  const validUrl = url && (url.startsWith('http://') || url.startsWith('https://')) ? url : defaultUrl;
  const validAnonKey = anonKey || defaultAnonKey;

  return {
    url: validUrl,
    anonKey: validAnonKey,
    serviceRoleKey,
  };
}

const config = getSupabaseConfig();

/**
 * Public authenticated client for frontend browser interactions
 */
export const supabase: SupabaseClient<Database> = createClient<Database>(config.url, config.anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

/**
 * Privileged admin client for server-side trusted operations (bypasses RLS)
 */
export const supabaseAdmin: SupabaseClient<Database> | null = config.serviceRoleKey
  ? createClient<Database>(config.url, config.serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

// =====================================================================================
// 5. AUTHENTICATION SERVICE
// =====================================================================================

export async function signUpWithEmail(
  email: string,
  password: string,
  displayName?: string,
  facilityName?: string,
) {
  const name = displayName?.trim() || email.split('@')[0];
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: name,
        displayName: name,
        facilityName: facilityName || 'Apex Retail Outlet',
      },
    },
  });

  if (error) throw error;
  return data;
}

export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;
  return data;
}

export async function signInWithOAuth(provider: 'google' | 'github') {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
    },
  });

  if (error) throw error;
  return data;
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export function onAuthStateChange(
  callback: (user: any | null, session?: any | null) => void,
): () => void {
  const { data: authSubscription } = supabase.auth.onAuthStateChange(async (_event, session) => {
    callback(session?.user ?? null, session ?? null);
  });
  return () => {
    authSubscription.subscription.unsubscribe();
  };
}

export async function resetPasswordForEmail(email: string) {
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/reset-password` : undefined,
  });
  if (error) throw error;
  return data;
}

// =====================================================================================
// 6. USER PROFILE SERVICE
// =====================================================================================

export async function ensureUserProfile(user: {
  id?: string;
  uid?: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
  displayName?: string;
}): Promise<UserProfile> {
  const userId = user.id || user.uid;
  if (!userId) {
    throw new Error('User ID is required to fetch or create user profile.');
  }

  const { data: existing } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (existing) {
    return mapProfileRowToProfile(existing);
  }

  const email = user.email || `${userId.slice(0, 8)}@smartstock.local`;
  const displayName =
    user.displayName ||
    (user.user_metadata?.full_name as string) ||
    (user.user_metadata?.displayName as string) ||
    email.split('@')[0] ||
    'Operations Lead';

  const newProfile = {
    id: userId,
    email,
    display_name: displayName.slice(0, 80),
    role_label: 'Store Ops Lead',
    facility_name: 'Apex Retail Outlet',
  };

  const { data: created, error: insertErr } = await supabase
    .from('profiles')
    .upsert(newProfile)
    .select('*')
    .single();

  if (insertErr || !created) {
    throw insertErr || new Error('Failed to create user profile.');
  }

  return mapProfileRowToProfile(created);
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return data ? mapProfileRowToProfile(data) : null;
}

export async function updateUserProfile(
  userId: string,
  updates: Partial<Pick<UserProfile, 'displayName' | 'roleLabel' | 'facilityName'>>,
): Promise<UserProfile> {
  const payload: Partial<Database['public']['Tables']['profiles']['Update']> = {};
  if (updates.displayName !== undefined) payload.display_name = updates.displayName.slice(0, 80);
  if (updates.roleLabel !== undefined) payload.role_label = updates.roleLabel.slice(0, 60);
  if (updates.facilityName !== undefined) payload.facility_name = updates.facilityName.slice(0, 80);

  const { data, error } = await supabase
    .from('profiles')
    .update(payload)
    .eq('id', userId)
    .select('*')
    .single();

  if (error || !data) throw error || new Error('Failed to update profile.');
  return mapProfileRowToProfile(data);
}

// =====================================================================================
// 7. PRODUCT CATALOG SERVICE (Queries, CRUD & Realtime)
// =====================================================================================

export async function getProducts(ownerId: string): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('owner_id', ownerId)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(mapProductRowToProduct);
}

export async function getProductById(productId: string): Promise<Product | null> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .maybeSingle();

  if (error) throw error;
  return data ? mapProductRowToProduct(data) : null;
}

export async function getLowStockProducts(ownerId: string): Promise<Product[]> {
  const all = await getProducts(ownerId);
  return all.filter((p) => p.quantity <= p.minStock);
}

export async function getOutOfStockProducts(ownerId: string): Promise<Product[]> {
  const all = await getProducts(ownerId);
  return all.filter((p) => p.quantity <= 0);
}

export async function createProduct(ownerId: string, input: ProductInput): Promise<string> {
  const insertPayload = mapProductInputToInsertRow(ownerId, input);

  const { data: createdProduct, error: prodErr } = await supabase
    .from('products')
    .insert(insertPayload)
    .select('id, name, sku, quantity')
    .single();

  if (prodErr || !createdProduct) throw prodErr || new Error('Failed to create product.');

  if (createdProduct.quantity > 0) {
    await supabase.from('stock_transactions').insert({
      owner_id: ownerId,
      product_id: createdProduct.id,
      product_name: createdProduct.name,
      sku: createdProduct.sku,
      type: 'in',
      quantity: createdProduct.quantity,
      previous_stock: 0,
      resulting_stock: createdProduct.quantity,
      reason: 'Initial Catalog Stock',
      reference: 'INIT-ENTRY',
    });
  }

  return createdProduct.id;
}

export async function updateProduct(
  ownerId: string,
  existingProduct: Product,
  input: ProductInput,
): Promise<void> {
  const rawPayload = mapProductInputToInsertRow(ownerId, input);
  // Exclude owner_id so RLS does not reject the update
  const { owner_id: _ignoredOwner, ...updatePayload } = rawPayload;

  const { error: updateErr } = await supabase
    .from('products')
    .update(updatePayload)
    .eq('id', existingProduct.id)
    .eq('owner_id', ownerId);

  if (updateErr) throw updateErr;

  const newQty = updatePayload.quantity ?? existingProduct.quantity;
  if (newQty !== existingProduct.quantity) {
    const diff = newQty - existingProduct.quantity;
    await supabase.from('stock_transactions').insert({
      owner_id: ownerId,
      product_id: existingProduct.id,
      product_name: updatePayload.name ?? existingProduct.name,
      sku: updatePayload.sku ?? existingProduct.sku,
      type: diff > 0 ? 'in' : 'out',
      quantity: Math.abs(diff),
      previous_stock: existingProduct.quantity,
      resulting_stock: newQty,
      reason: 'Manual Catalog Stock Edit',
      reference: 'EDIT-SYNC',
    });
  }
}

export async function deleteProduct(productId: string): Promise<void> {
  const { error } = await supabase.from('products').delete().eq('id', productId);
  if (error) throw error;
}

export function subscribeToProducts(
  ownerId: string,
  onData: (products: Product[]) => void,
  onError?: (err: Error) => void,
): () => void {
  getProducts(ownerId)
    .then(onData)
    .catch((err) => onError && onError(err instanceof Error ? err : new Error(String(err))));

  const channel: RealtimeChannel = supabase
    .channel(`products:owner:${ownerId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'products',
        filter: `owner_id=eq.${ownerId}`,
      },
      async () => {
        try {
          const updated = await getProducts(ownerId);
          onData(updated);
        } catch (err) {
          if (onError && err instanceof Error) onError(err);
        }
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// =====================================================================================
// 8. STOCK MOVEMENTS & TRANSACTIONS (Atomic RPC + Ledger Queries)
// =====================================================================================

export async function recordStockMovement(
  ownerId: string,
  input: StockMovementInput,
): Promise<number> {
  const qty = Math.round(Number(input.quantity) || 0);
  if (qty <= 0) {
    throw new Error('Adjustment quantity must be greater than zero.');
  }

  const reason =
    input.reason?.trim().slice(0, VALIDATION_LIMITS.REASON_MAX) ||
    (input.type === 'in' ? 'Purchase Order Delivery' : 'Customer Sale / Dispatch');
  const reference = input.reference ? input.reference.trim().slice(0, VALIDATION_LIMITS.REFERENCE_MAX) : null;
  const notes = input.notes ? input.notes.trim().slice(0, VALIDATION_LIMITS.NOTES_MAX) : null;

  // 1. Try atomic PostgreSQL stored procedure first
  try {
    const { data: rpcResult, error: rpcErr } = await supabase.rpc(
      'record_stock_movement_atomic',
      {
        p_owner_id: ownerId,
        p_product_id: input.productId,
        p_type: input.type,
        p_quantity: qty,
        p_reason: reason,
        p_reference: reference ?? null,
        p_notes: notes ?? null,
      },
    );

    if (!rpcErr && rpcResult) {
      const res = rpcResult as { resultingStock?: number; resulting_stock?: number };
      return Number(res.resultingStock ?? res.resulting_stock ?? 0);
    }

    // If RPC returned a business failure (e.g., Insufficient stock), throw immediately
    if (rpcErr && !rpcErr.message?.toLowerCase().includes('does not exist')) {
      throw new Error(rpcErr.message);
    }
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('insufficient stock')) {
      throw err;
    }
    // If the RPC function was not created yet in the database, fall through to client-side fallback
  }

  // 2. Fallback: Sequential client-side fetch, validate, and write
  const { data: product, error: fetchErr } = await supabase
    .from('products')
    .select('id, name, sku, quantity')
    .eq('id', input.productId)
    .eq('owner_id', ownerId)
    .single();

  if (fetchErr || !product) {
    throw new Error('Selected product no longer exists.');
  }

  const previousStock = Number(product.quantity) || 0;
  const resultingStock = input.type === 'in' ? previousStock + qty : previousStock - qty;

  if (resultingStock < 0) {
    throw new Error(`Insufficient stock for ${product.name}. Available: ${previousStock} units.`);
  }

  const { error: updateErr } = await supabase
    .from('products')
    .update({ quantity: resultingStock })
    .eq('id', input.productId);

  if (updateErr) throw updateErr;

  const { error: txErr } = await supabase.from('stock_transactions').insert({
    owner_id: ownerId,
    product_id: input.productId,
    product_name: product.name,
    sku: product.sku,
    type: input.type,
    quantity: qty,
    previous_stock: previousStock,
    resulting_stock: resultingStock,
    reason,
    reference,
    notes,
  });

  if (txErr) throw txErr;

  return resultingStock;
}

export async function getStockTransactions(
  ownerId: string,
  limit: number = 100,
): Promise<StockTransaction[]> {
  const { data, error } = await supabase
    .from('stock_transactions')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []).map(mapTransactionRowToTransaction);
}

export function subscribeToTransactions(
  ownerId: string,
  onData: (transactions: StockTransaction[]) => void,
  onError?: (err: Error) => void,
): () => void {
  getStockTransactions(ownerId)
    .then(onData)
    .catch((err) => onError && onError(err instanceof Error ? err : new Error(String(err))));

  const channel: RealtimeChannel = supabase
    .channel(`transactions:owner:${ownerId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'stock_transactions',
        filter: `owner_id=eq.${ownerId}`,
      },
      async () => {
        try {
          const updated = await getStockTransactions(ownerId);
          onData(updated);
        } catch (err) {
          if (onError && err instanceof Error) onError(err);
        }
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// =====================================================================================
// 9. STARTER CATALOG SEEDER
// =====================================================================================

export async function seedStarterCatalog(ownerId: string): Promise<void> {
  const starterProducts: ProductInput[] = [
    {
      name: 'Logitech MX Master 3S',
      sku: 'TECH-3042',
      barcode: '097855172280',
      category: 'Peripherals',
      supplier: 'TechSupply Co.',
      purchasePrice: 72.0,
      sellingPrice: 99.99,
      quantity: 4,
      minStock: 15,
      unit: 'Units (pcs)',
      imageKey: 'wireless-mouse',
      storageLocation: 'Rack 03 · Bay B · Bin 14',
      description:
        'Ergonomic wireless mouse with 8000 DPI darkfield sensor, quiet click switches, and multi-device Bluetooth connectivity.',
    },
    {
      name: 'Braided USB-C Cable 2M',
      sku: 'CAB-4410',
      barcode: '097855180112',
      category: 'Accessories',
      supplier: 'PowerPro Logistics',
      purchasePrice: 3.5,
      sellingPrice: 12.99,
      quantity: 148,
      minStock: 30,
      unit: 'Units (pcs)',
      imageKey: 'usbc-cable',
      storageLocation: 'Rack 01 · Bay A · Bin 03',
      description: 'Double-braided 100W fast charging USB-C cable with reinforced aluminum connectors.',
    },
    {
      name: 'Eco Thermal Paper Rolls (50pk)',
      sku: 'SUP-5541',
      barcode: '097855194401',
      category: 'Packaging',
      supplier: 'Pacific Paper & Packaging',
      purchasePrice: 18.0,
      sellingPrice: 29.99,
      quantity: 0,
      minStock: 20,
      unit: 'Packs (pk)',
      imageKey: 'thermal-rolls',
      storageLocation: 'Rack 07 · Bay C · Bin 02',
      description: 'BPA-free 80mm thermal POS receipt paper rolls packed 50 per carton.',
    },
    {
      name: 'Noise Cancelling Studio Headset Pro',
      sku: 'AUD-4019',
      barcode: '097855162994',
      category: 'Electronics',
      supplier: 'AuraSonic Labs',
      purchasePrice: 110.0,
      sellingPrice: 169.99,
      quantity: 6,
      minStock: 10,
      unit: 'Units (pcs)',
      imageKey: 'studio-headphones',
      storageLocation: 'Rack 02 · Bay D · Bin 09',
      description: 'Over-ear wireless active noise-cancelling headphones with 35-hour battery life.',
    },
    {
      name: 'Keychron RGB Wireless Keyboard K2',
      sku: 'KBD-KEY-K2',
      barcode: '097855158821',
      category: 'Peripherals',
      supplier: 'TechSupply Co.',
      purchasePrice: 45.0,
      sellingPrice: 79.99,
      quantity: 32,
      minStock: 10,
      unit: 'Units (pcs)',
      storageLocation: 'Rack 03 · Bay A · Bin 05',
      description: 'Compact 75% mechanical wireless keyboard with tactile switches and dual OS support.',
    },
    {
      name: 'OmniCharge 100W GaN Charging Hub',
      sku: 'POW-6502',
      barcode: '097855140033',
      category: 'Electronics',
      supplier: 'PowerPro Logistics',
      purchasePrice: 28.0,
      sellingPrice: 49.99,
      quantity: 42,
      minStock: 15,
      unit: 'Units (pcs)',
      storageLocation: 'Rack 01 · Bay C · Bin 11',
      description: 'Four-port GaN desktop power adapter supporting simultaneous laptop and phone fast charging.',
    },
  ];

  for (let i = 0; i < starterProducts.length; i++) {
    const item = starterProducts[i];
    const insertPayload = mapProductInputToInsertRow(ownerId, item);

    const { data: created, error } = await supabase
      .from('products')
      .insert(insertPayload)
      .select('id, name, sku, quantity')
      .single();

    if (!error && created && created.quantity > 0) {
      await supabase.from('stock_transactions').insert({
        owner_id: ownerId,
        product_id: created.id,
        product_name: created.name,
        sku: created.sku,
        type: 'in',
        quantity: created.quantity,
        previous_stock: 0,
        resulting_stock: created.quantity,
        reason: 'Opening Warehouse Balance',
        reference: `PO-2026-0${i + 1}`,
      });
    }
  }
}

// =====================================================================================
// 10. AI ASSISTANT INVENTORY CONTEXT BUILDER (Gemini AI Grounding)
// =====================================================================================

export interface AiInventoryContextPayload {
  summary: {
    totalProducts: number;
    totalRetailValue: number;
    totalCostValue: number;
    lowStockCount: number;
    outOfStockCount: number;
    movementsLast30DaysCount: number;
    noMovement30DaysCount: number;
  };
  products: Array<{
    id: string;
    name: string;
    sku: string;
    category: string;
    supplier: string;
    purchasePrice: number;
    sellingPrice: number;
    quantity: number;
    minStock: number;
    unit: string;
    movementsLast30Days: number;
    inboundLast30Days: number;
    outboundLast30Days: number;
    lastMovementAt: string | null;
  }>;
  recentTransactions: Array<{
    productName: string;
    sku: string;
    type: string;
    quantity: number;
    resultingStock: number;
    reason: string;
    createdAt: string | null;
  }>;
}

export async function buildSupabaseInventoryContext(ownerId: string): Promise<AiInventoryContextPayload> {
  const [products, transactions] = await Promise.all([
    getProducts(ownerId),
    getStockTransactions(ownerId, 250),
  ]);

  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

  let totalRetailValue = 0;
  let totalCostValue = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;
  let movementsLast30DaysCount = 0;
  let noMovement30DaysCount = 0;

  const productContexts = products.map((p) => {
    totalRetailValue += p.quantity * p.sellingPrice;
    totalCostValue += p.quantity * p.purchasePrice;

    if (p.quantity <= 0) {
      outOfStockCount++;
      lowStockCount++;
    } else if (p.quantity <= p.minStock) {
      lowStockCount++;
    }

    const prodTx = transactions.filter((t) => t.productId === p.id);
    const recentTx = prodTx.filter((t) => {
      const time = t.createdAt ? t.createdAt.toMillis() : 0;
      return time >= thirtyDaysAgo;
    });

    const inboundLast30Days = recentTx
      .filter((t) => t.type === 'in')
      .reduce((sum, t) => sum + t.quantity, 0);

    const outboundLast30Days = recentTx
      .filter((t) => t.type === 'out')
      .reduce((sum, t) => sum + t.quantity, 0);

    const movementsLast30Days = recentTx.length;
    if (movementsLast30Days > 0) {
      movementsLast30DaysCount += movementsLast30Days;
    } else {
      noMovement30DaysCount++;
    }

    const lastMovementAt = prodTx.length > 0 && prodTx[0].createdAt ? prodTx[0].createdAt.toISOString() : null;

    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      category: p.category,
      supplier: p.supplier,
      purchasePrice: p.purchasePrice,
      sellingPrice: p.sellingPrice,
      quantity: p.quantity,
      minStock: p.minStock,
      unit: p.unit,
      movementsLast30Days,
      inboundLast30Days,
      outboundLast30Days,
      lastMovementAt,
    };
  });

  const recentTransactions = transactions.slice(0, 20).map((t) => ({
    productName: t.productName,
    sku: t.sku,
    type: t.type,
    quantity: t.quantity,
    resultingStock: t.resultingStock,
    reason: t.reason,
    createdAt: t.createdAt ? t.createdAt.toISOString() : null,
  }));

  return {
    summary: {
      totalProducts: products.length,
      totalRetailValue: Math.round(totalRetailValue * 100) / 100,
      totalCostValue: Math.round(totalCostValue * 100) / 100,
      lowStockCount,
      outOfStockCount,
      movementsLast30DaysCount,
      noMovement30DaysCount,
    },
    products: productContexts,
    recentTransactions,
  };
}

// =====================================================================================
// 11. CONNECTION HEALTH CHECK
// =====================================================================================

export async function testSupabaseConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    const { error } = await supabase.from('products').select('id').limit(1);
    if (error) {
      return { ok: false, message: error.message };
    }
    return { ok: true, message: 'Supabase connectivity established successfully.' };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Unknown connection error',
    };
  }
}
