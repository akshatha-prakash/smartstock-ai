/**
 * =====================================================================================
 * SmartStock AI - Supabase Inventory Service
 * =====================================================================================
 * 
 * Supabase PostgreSQL queries and Supabase Realtime channels.
 * Supabase Realtime channels.
 * =====================================================================================
 */

import { supabase } from '../../supabase/supabase';
import {
  Product,
  ProductInput,
  StockMovementInput,
  StockTransaction,
  toAppTimestamp,
  UserProfile,
  VALIDATION_LIMITS,
} from '../types/inventory';

function sanitizeString(value: string | undefined, maxLen: number): string {
  return (value ?? '').trim().slice(0, maxLen);
}

function sanitizeSku(sku: string): string {
  const cleaned = sku
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_\-]/g, '-')
    .slice(0, VALIDATION_LIMITS.SKU_MAX);
  return cleaned || `SKU-${Date.now().toString(36).toUpperCase()}`;
}

export function mapProductRow(row: any): Product {
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

export function mapTransactionRow(row: any): StockTransaction {
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

export function mapProfileRow(row: any): UserProfile {
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

function buildProductInsertPayload(uid: string, input: ProductInput) {
  const name = sanitizeString(input.name, VALIDATION_LIMITS.NAME_MAX);
  const sku = sanitizeSku(input.sku);
  const supplier = sanitizeString(input.supplier, VALIDATION_LIMITS.SUPPLIER_MAX);
  const unit = sanitizeString(input.unit, VALIDATION_LIMITS.UNIT_MAX) || 'Units (pcs)';
  const barcode = sanitizeString(input.barcode, VALIDATION_LIMITS.BARCODE_MAX);
  const description = sanitizeString(input.description, VALIDATION_LIMITS.DESCRIPTION_MAX);
  const storageLocation = sanitizeString(input.storageLocation, VALIDATION_LIMITS.STORAGE_MAX);
  const imageKey = sanitizeString(input.imageKey, 60);

  if (!name) throw new Error('Product name is required.');
  if (!supplier) throw new Error('Primary supplier is required.');
  if (!VALIDATION_LIMITS.SKU_PATTERN.test(sku)) {
    throw new Error('SKU may only contain letters, numbers, hyphens, and underscores.');
  }

  const purchasePrice = Math.max(0, Number(input.purchasePrice) || 0);
  const sellingPrice = Math.max(0, Number(input.sellingPrice) || 0);
  const quantity = Math.max(0, Math.round(Number(input.quantity) || 0));
  const minStock = Math.max(0, Math.round(Number(input.minStock) || 0));

  return {
    owner_id: uid,
    name,
    sku,
    category: input.category,
    supplier,
    purchase_price: purchasePrice,
    selling_price: sellingPrice,
    quantity,
    min_stock: minStock,
    unit,
    barcode: barcode || null,
    description: description || null,
    image_key: imageKey || null,
    storage_location: storageLocation || null,
  };
}

export async function ensureUserProfile(user: {
  id?: string;
  uid?: string;
  email?: string;
  displayName?: string;
  user_metadata?: Record<string, unknown>;
}): Promise<UserProfile> {
  const userId = user.id || user.uid;
  if (!userId) {
    throw new Error('User ID is required to fetch or create user profile.');
  }

  const { data: existing, error: fetchErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (!fetchErr && existing) {
    return mapProfileRow(existing);
  }

  const email = user.email || `${userId.slice(0, 8)}@smartstock.local`;
  const displayName = sanitizeString(
    user.displayName ||
    (user.user_metadata?.full_name as string) ||
    (user.user_metadata?.displayName as string) ||
    email.split('@')[0] ||
    'Operations Lead',
    80,
  );

  const newProfile = {
    id: userId,
    email,
    display_name: displayName,
    role_label: 'Store Ops Lead',
    facility_name: 'Apex Retail Outlet',
  };

  const { data: created, error: insertErr } = await supabase
    .from('profiles')
    .upsert(newProfile)
    .select('*')
    .single();

  if (insertErr || !created) {
    throw insertErr || new Error('Failed to create user profile in Supabase.');
  }

  return mapProfileRow(created);
}

export function subscribeToProducts(
  uid: string,
  onData: (products: Product[]) => void,
  onError?: (err: Error) => void,
): () => void {
  let isMounted = true;

  const fetchItems = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('owner_id', uid)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      if (isMounted) {
        onData((data || []).map(mapProductRow));
      }
    } catch (err) {
      if (isMounted && onError && err instanceof Error) {
        onError(err);
      }
    }
  };

  fetchItems();

  const channel = supabase
    .channel(`products:sub:${uid}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'products',
        filter: `owner_id=eq.${uid}`,
      },
      () => {
        fetchItems();
      },
    )
    .subscribe();

  return () => {
    isMounted = false;
    supabase.removeChannel(channel);
  };
}

export function subscribeToTransactions(
  uid: string,
  onData: (transactions: StockTransaction[]) => void,
  onError?: (err: Error) => void,
): () => void {
  let isMounted = true;

  const fetchItems = async () => {
    try {
      const { data, error } = await supabase
        .from('stock_transactions')
        .select('*')
        .eq('owner_id', uid)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (isMounted) {
        onData((data || []).map(mapTransactionRow));
      }
    } catch (err) {
      if (isMounted && onError && err instanceof Error) {
        onError(err);
      }
    }
  };

  fetchItems();

  const channel = supabase
    .channel(`transactions:sub:${uid}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'stock_transactions',
        filter: `owner_id=eq.${uid}`,
      },
      () => {
        fetchItems();
      },
    )
    .subscribe();

  return () => {
    isMounted = false;
    supabase.removeChannel(channel);
  };
}

export async function createProduct(uid: string, input: ProductInput): Promise<string> {
  const insertPayload = buildProductInsertPayload(uid, input);

  const { data: createdProduct, error: prodErr } = await supabase
    .from('products')
    .insert(insertPayload)
    .select('id, name, sku, quantity')
    .single();

  if (prodErr || !createdProduct) {
    throw prodErr || new Error('Failed to create product in Supabase.');
  }

  if (createdProduct.quantity > 0) {
    const { error: txErr } = await supabase.from('stock_transactions').insert({
      owner_id: uid,
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

    if (txErr) {
      console.warn('Initial stock transaction record warning:', txErr);
    }
  }

  return createdProduct.id;
}

export async function updateProduct(
  uid: string,
  existingProduct: Product,
  input: ProductInput,
): Promise<void> {
  const rawPayload = buildProductInsertPayload(uid, input);
  const { owner_id: _ignoredOwner, ...updatePayload } = rawPayload;

  const { error: updateErr } = await supabase
    .from('products')
    .update(updatePayload)
    .eq('id', existingProduct.id)
    .eq('owner_id', uid);

  if (updateErr) {
    throw updateErr;
  }

  const newQty = updatePayload.quantity;
  if (newQty !== existingProduct.quantity) {
    const diff = newQty - existingProduct.quantity;
    await supabase.from('stock_transactions').insert({
      owner_id: uid,
      product_id: existingProduct.id,
      product_name: updatePayload.name,
      sku: updatePayload.sku,
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
  if (error) {
    throw error;
  }
}

export async function recordStockMovement(
  uid: string,
  input: StockMovementInput,
): Promise<number> {
  const qty = Math.round(Number(input.quantity) || 0);
  if (qty <= 0) {
    throw new Error('Adjustment quantity must be greater than zero.');
  }

  const reason =
    sanitizeString(input.reason, VALIDATION_LIMITS.REASON_MAX) ||
    (input.type === 'in' ? 'Purchase Order Delivery' : 'Customer Sale / Dispatch');
  const reference = sanitizeString(input.reference, VALIDATION_LIMITS.REFERENCE_MAX) || null;
  const notes = sanitizeString(input.notes, VALIDATION_LIMITS.NOTES_MAX) || null;

  // 1. Try atomic PostgreSQL RPC stored procedure first
  try {
    const { data: rpcResult, error: rpcErr } = await supabase.rpc(
      'record_stock_movement_atomic',
      {
        p_owner_id: uid,
        p_product_id: input.productId,
        p_type: input.type,
        p_quantity: qty,
        p_reason: reason,
        p_reference: reference,
        p_notes: notes,
      },
    );

    if (!rpcErr && rpcResult) {
      const res = rpcResult as { resultingStock?: number; resulting_stock?: number };
      return Number(res.resultingStock ?? res.resulting_stock ?? 0);
    }

    if (rpcErr && !rpcErr.message?.toLowerCase().includes('does not exist')) {
      throw new Error(rpcErr.message);
    }
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('insufficient stock')) {
      throw err;
    }
  }

  // 2. Fallback: Sequential client-side fetch, validate, and update
  const { data: product, error: fetchErr } = await supabase
    .from('products')
    .select('id, name, sku, quantity')
    .eq('id', input.productId)
    .eq('owner_id', uid)
    .single();

  if (fetchErr || !product) {
    throw new Error('Selected product no longer exists.');
  }

  const previousStock = Number(product.quantity) || 0;
  const nextStock = input.type === 'in' ? previousStock + qty : previousStock - qty;

  if (nextStock < 0) {
    throw new Error(`Insufficient stock for ${product.name}. Available: ${previousStock} units.`);
  }

  const { error: updateErr } = await supabase
    .from('products')
    .update({ quantity: nextStock })
    .eq('id', input.productId);

  if (updateErr) throw updateErr;

  const { error: txErr } = await supabase.from('stock_transactions').insert({
    owner_id: uid,
    product_id: input.productId,
    product_name: sanitizeString(product.name, VALIDATION_LIMITS.NAME_MAX),
    sku: sanitizeString(product.sku, VALIDATION_LIMITS.SKU_MAX),
    type: input.type,
    quantity: qty,
    previous_stock: previousStock,
    resulting_stock: nextStock,
    reason,
    reference,
    notes,
  });

  if (txErr) throw txErr;

  return nextStock;
}

export async function seedStarterCatalog(uid: string): Promise<void> {
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
    const insertPayload = buildProductInsertPayload(uid, item);

    const { data: created, error } = await supabase
      .from('products')
      .insert(insertPayload)
      .select('id, name, sku, quantity')
      .single();

    if (!error && created && created.quantity > 0) {
      await supabase.from('stock_transactions').insert({
        owner_id: uid,
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
