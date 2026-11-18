import { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  Product,
  ProductInput,
  StockMovementInput,
  StockTransaction,
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

function buildProductPayload(uid: string, input: ProductInput) {
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

  const payload: Record<string, unknown> = {
    ownerId: uid,
    name,
    sku,
    category: input.category,
    supplier,
    purchasePrice,
    sellingPrice,
    quantity,
    minStock,
    unit,
  };

  if (barcode) payload.barcode = barcode;
  if (description) payload.description = description;
  if (imageKey) payload.imageKey = imageKey;
  if (storageLocation) payload.storageLocation = storageLocation;

  return { payload, name, sku, quantity };
}

export async function ensureUserProfile(user: User): Promise<UserProfile> {
  const userPath = `users/${user.uid}`;
  const userRef = doc(db, 'users', user.uid);
  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      return snap.data() as UserProfile;
    }

    const displayName = sanitizeString(
      user.displayName || user.email?.split('@')[0] || 'Operations Lead',
      80,
    );
    const email = sanitizeString(user.email || 'ops@smartstock.local', 160);

    await setDoc(userRef, {
      uid: user.uid,
      email,
      displayName,
      roleLabel: 'Store Ops Lead',
      facilityName: 'Apex Retail Outlet',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const created = await getDoc(userRef);
    return created.data() as UserProfile;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }
}

export function subscribeToProducts(
  uid: string,
  onData: (products: Product[]) => void,
  onError?: (err: Error) => void,
) {
  const q = query(collection(db, 'products'), where('ownerId', '==', uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: Product[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Product, 'id'>),
      }));
      items.sort((a, b) => {
        const aTime = a.updatedAt?.toMillis?.() ?? a.createdAt?.toMillis?.() ?? 0;
        const bTime = b.updatedAt?.toMillis?.() ?? b.createdAt?.toMillis?.() ?? 0;
        return bTime - aTime;
      });
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'products');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    },
  );
}

export function subscribeToTransactions(
  uid: string,
  onData: (transactions: StockTransaction[]) => void,
  onError?: (err: Error) => void,
) {
  const q = query(collection(db, 'transactions'), where('ownerId', '==', uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: StockTransaction[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<StockTransaction, 'id'>),
      }));
      items.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() ?? 0;
        const bTime = b.createdAt?.toMillis?.() ?? 0;
        return bTime - aTime;
      });
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'transactions');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    },
  );
}

export async function createProduct(uid: string, input: ProductInput): Promise<string> {
  const productRef = doc(collection(db, 'products'));
  const { payload, name, sku, quantity } = buildProductPayload(uid, input);

  try {
    const batch = writeBatch(db);
    batch.set(productRef, {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (quantity > 0) {
      const txRef = doc(collection(db, 'transactions'));
      batch.set(txRef, {
        ownerId: uid,
        productId: productRef.id,
        productName: name,
        sku,
        type: 'in',
        quantity,
        previousStock: 0,
        resultingStock: quantity,
        reason: 'Initial Catalog Stock',
        reference: 'INIT-ENTRY',
        createdAt: serverTimestamp(),
      });
    }

    await batch.commit();
    return productRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `products/${productRef.id}`);
  }
}

export async function updateProduct(
  uid: string,
  existingProduct: Product,
  input: ProductInput,
): Promise<void> {
  const productPath = `products/${existingProduct.id}`;
  const productRef = doc(db, 'products', existingProduct.id);
  const { payload, name, sku, quantity } = buildProductPayload(uid, input);

  try {
    const batch = writeBatch(db);
    batch.set(productRef, {
      ...payload,
      createdAt: existingProduct.createdAt ?? serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (quantity !== existingProduct.quantity) {
      const diff = quantity - existingProduct.quantity;
      const txRef = doc(collection(db, 'transactions'));
      batch.set(txRef, {
        ownerId: uid,
        productId: existingProduct.id,
        productName: name,
        sku,
        type: diff > 0 ? 'in' : 'out',
        quantity: Math.abs(diff),
        previousStock: existingProduct.quantity,
        resultingStock: quantity,
        reason: 'Manual Catalog Stock Edit',
        reference: 'EDIT-SYNC',
        createdAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, productPath);
  }
}

export async function deleteProduct(productId: string): Promise<void> {
  const productPath = `products/${productId}`;
  try {
    await deleteDoc(doc(db, 'products', productId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, productPath);
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

  const productRef = doc(db, 'products', input.productId);
  const txRef = doc(collection(db, 'transactions'));
  const reason =
    sanitizeString(input.reason, VALIDATION_LIMITS.REASON_MAX) ||
    (input.type === 'in' ? 'Purchase Order Delivery' : 'Customer Sale / Dispatch');
  const reference = sanitizeString(input.reference, VALIDATION_LIMITS.REFERENCE_MAX);
  const notes = sanitizeString(input.notes, VALIDATION_LIMITS.NOTES_MAX);

  try {
    const resultingStock = await runTransaction(db, async (transaction) => {
      const productSnap = await transaction.get(productRef);
      if (!productSnap.exists()) {
        throw new Error('Selected product no longer exists.');
      }

      const product = productSnap.data() as Omit<Product, 'id'>;
      const previousStock = product.quantity;
      const nextStock =
        input.type === 'in' ? previousStock + qty : previousStock - qty;

      if (nextStock < 0) {
        throw new Error(
          `Insufficient stock for ${product.name}. Available: ${previousStock} units.`,
        );
      }

      transaction.update(productRef, {
        quantity: nextStock,
        updatedAt: serverTimestamp(),
      });

      const txPayload: Record<string, unknown> = {
        ownerId: uid,
        productId: input.productId,
        productName: sanitizeString(product.name, VALIDATION_LIMITS.NAME_MAX),
        sku: sanitizeString(product.sku, VALIDATION_LIMITS.SKU_MAX),
        type: input.type,
        quantity: qty,
        previousStock,
        resultingStock: nextStock,
        reason,
        createdAt: serverTimestamp(),
      };

      if (reference) txPayload.reference = reference;
      if (notes) txPayload.notes = notes;

      transaction.set(txRef, txPayload);
      return nextStock;
    });

    return resultingStock;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.startsWith('Insufficient stock') ||
        error.message.startsWith('Selected product'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `products/${input.productId}`);
  }
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

  try {
    const batch = writeBatch(db);
    starterProducts.forEach((item, index) => {
      const prodRef = doc(collection(db, 'products'));
      const { payload, name, sku, quantity } = buildProductPayload(uid, item);
      batch.set(prodRef, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (quantity > 0) {
        const txRef = doc(collection(db, 'transactions'));
        batch.set(txRef, {
          ownerId: uid,
          productId: prodRef.id,
          productName: name,
          sku,
          type: 'in',
          quantity,
          previousStock: 0,
          resultingStock: quantity,
          reason: 'Opening Warehouse Balance',
          reference: `PO-2026-0${index + 1}`,
          createdAt: serverTimestamp(),
        });
      }
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'products');
  }
}
