export type ProductCategory =
  | 'Peripherals'
  | 'Accessories'
  | 'Electronics'
  | 'Packaging'
  | 'Office Furniture'
  | 'Hardware';

export const PRODUCT_CATEGORIES: ProductCategory[] = [
  'Peripherals',
  'Accessories',
  'Electronics',
  'Packaging',
  'Office Furniture',
  'Hardware',
];

export const UNIT_OPTIONS = [
  'Units (pcs)',
  'Packs (pk)',
  'Boxes',
  'Cartons',
  'Sets',
  'Rolls',
];

export const VALIDATION_LIMITS = {
  NAME_MAX: 120,
  SKU_MAX: 40,
  SKU_PATTERN: /^[a-zA-Z0-9_\-]+$/,
  BARCODE_MAX: 40,
  SUPPLIER_MAX: 100,
  UNIT_MAX: 30,
  DESCRIPTION_MAX: 1000,
  STORAGE_MAX: 80,
  REASON_MAX: 100,
  REFERENCE_MAX: 60,
  NOTES_MAX: 300,
} as const;

/**
 * Compatible Timestamp object providing .toDate(), .toMillis(), .toISOString()
 * to seamlessly support all existing charts, audit tables, and date formatters.
 */
export interface AppTimestamp {
  seconds: number;
  nanoseconds: number;
  toDate: () => Date;
  toMillis: () => number;
  toISOString: () => string;
}

export type Timestamp = AppTimestamp;

export function toAppTimestamp(value: string | number | Date | AppTimestamp | null | undefined): AppTimestamp | null {
  if (!value) return null;
  if (typeof value === 'object' && 'toDate' in value && typeof (value as any).toDate === 'function') {
    return value as AppTimestamp;
  }
  const d = typeof value === 'string' || typeof value === 'number' ? new Date(value) : (value as Date);
  const ms = isNaN(d.getTime()) ? Date.now() : d.getTime();
  return {
    seconds: Math.floor(ms / 1000),
    nanoseconds: (ms % 1000) * 1e6,
    toDate: () => new Date(ms),
    toMillis: () => ms,
    toISOString: () => new Date(ms).toISOString(),
  };
}

export interface Product {
  id: string;
  ownerId: string;
  name: string;
  sku: string;
  barcode?: string;
  category: ProductCategory;
  supplier: string;
  purchasePrice: number;
  sellingPrice: number;
  quantity: number;
  minStock: number;
  unit: string;
  description?: string;
  imageKey?: string;
  storageLocation?: string;
  createdAt: AppTimestamp | null;
  updatedAt: AppTimestamp | null;
}

export interface ProductInput {
  name: string;
  sku: string;
  barcode?: string;
  category: ProductCategory;
  supplier: string;
  purchasePrice: number;
  sellingPrice: number;
  quantity: number;
  minStock: number;
  unit: string;
  description?: string;
  imageKey?: string;
  storageLocation?: string;
}

export type TransactionType = 'in' | 'out';

export interface StockTransaction {
  id: string;
  ownerId: string;
  productId: string;
  productName: string;
  sku: string;
  type: TransactionType;
  quantity: number;
  previousStock: number;
  resultingStock: number;
  reason: string;
  reference?: string;
  notes?: string;
  createdAt: AppTimestamp | null;
}

export interface StockMovementInput {
  productId: string;
  type: TransactionType;
  quantity: number;
  reason: string;
  reference?: string;
  notes?: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  roleLabel: string;
  facilityName: string;
  createdAt: AppTimestamp | null;
  updatedAt: AppTimestamp | null;
}

export type AppPage =
  | 'dashboard'
  | 'inventory'
  | 'add-product'
  | 'edit-product'
  | 'transactions'
  | 'alerts'
  | 'reports'
  | 'assistant';

export interface RestockSuggestion {
  productId: string;
  productName: string;
  sku: string;
  currentStock: number;
  minStock: number;
  suggestedQuantity: number;
  urgency: string;
  reason: string;
}

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

export function getStockStatus(product: Pick<Product, 'quantity' | 'minStock'>): StockStatus {
  if (product.quantity <= 0) return 'out_of_stock';
  if (product.quantity <= product.minStock) return 'low_stock';
  return 'in_stock';
}
