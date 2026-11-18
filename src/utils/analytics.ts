import { getStockStatus, Product, StockTransaction } from '../types/inventory';

export interface InventoryContextProduct {
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
}

export interface InventoryContextPayload {
  summary: {
    totalProducts: number;
    totalRetailValue: number;
    totalCostValue: number;
    lowStockCount: number;
    outOfStockCount: number;
    movementsLast30DaysCount: number;
    noMovement30DaysCount: number;
  };
  products: InventoryContextProduct[];
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

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function buildInventoryContext(
  products: Product[],
  transactions: StockTransaction[],
): InventoryContextPayload {
  const now = Date.now();
  const cutoff30 = now - THIRTY_DAYS_MS;

  const statsByProduct = new Map<
    string,
    { movements: number; inbound: number; outbound: number; lastMs: number }
  >();

  let movementsLast30DaysCount = 0;

  for (const tx of transactions) {
    const ms = tx.createdAt?.toMillis?.() ?? 0;
    const prev = statsByProduct.get(tx.productId) ?? {
      movements: 0,
      inbound: 0,
      outbound: 0,
      lastMs: 0,
    };

    if (ms > prev.lastMs) {
      prev.lastMs = ms;
    }

    if (ms >= cutoff30) {
      movementsLast30DaysCount += 1;
      prev.movements += 1;
      if (tx.type === 'in') prev.inbound += tx.quantity;
      else prev.outbound += tx.quantity;
    }

    statsByProduct.set(tx.productId, prev);
  }

  let totalRetailValue = 0;
  let totalCostValue = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;
  let noMovement30DaysCount = 0;

  const contextProducts: InventoryContextProduct[] = products.map((p) => {
    totalRetailValue += p.sellingPrice * p.quantity;
    totalCostValue += p.purchasePrice * p.quantity;
    const status = getStockStatus(p);
    if (status === 'low_stock') lowStockCount += 1;
    if (status === 'out_of_stock') outOfStockCount += 1;

    const stat = statsByProduct.get(p.id) ?? {
      movements: 0,
      inbound: 0,
      outbound: 0,
      lastMs: 0,
    };

    if (stat.movements === 0) {
      noMovement30DaysCount += 1;
    }

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
      movementsLast30Days: stat.movements,
      inboundLast30Days: stat.inbound,
      outboundLast30Days: stat.outbound,
      lastMovementAt: stat.lastMs > 0 ? new Date(stat.lastMs).toISOString() : null,
    };
  });

  const recentTransactions = transactions.slice(0, 40).map((tx) => ({
    productName: tx.productName,
    sku: tx.sku,
    type: tx.type,
    quantity: tx.quantity,
    resultingStock: tx.resultingStock,
    reason: tx.reason,
    createdAt: tx.createdAt?.toDate ? tx.createdAt.toDate().toISOString() : null,
  }));

  return {
    summary: {
      totalProducts: products.length,
      totalRetailValue: Number(totalRetailValue.toFixed(2)),
      totalCostValue: Number(totalCostValue.toFixed(2)),
      lowStockCount,
      outOfStockCount,
      movementsLast30DaysCount,
      noMovement30DaysCount,
    },
    products: contextProducts,
    recentTransactions,
  };
}

export interface ReportMetrics {
  summary: {
    totalProducts: number;
    totalStockValue: number;
    totalCostValue: number;
    lowStockCount: number;
    outOfStockCount: number;
    totalInUnits: number;
    totalOutUnits: number;
  };
  movementSeries: Array<{
    key: string;
    label: string;
    inQty: number;
    outQty: number;
  }>;
  maxMovementBar: number;
  categoryBreakdown: Array<{
    category: string;
    skuCount: number;
    totalUnits: number;
    retailValue: number;
    sharePct: number;
    color: string;
  }>;
  topFastMoving: Array<{
    product: Product;
    totalMoved: number;
    inboundUnits: number;
    outboundUnits: number;
    txCount: number;
  }>;
  noMovement30Days: Array<{
    product: Product;
    lastMovementDate: Date | null;
    lockedValue: number;
  }>;
  lowStockProducts: Product[];
}

const CATEGORY_COLORS = [
  '#0F2942',
  '#047857',
  '#475569',
  '#0D9488',
  '#64748B',
  '#1E3A5F',
];

export function computeReportMetrics(
  products: Product[],
  transactions: StockTransaction[],
  startDate: Date,
  endDate: Date,
  categoryFilter: string,
): ReportMetrics {
  const startMs = new Date(
    startDate.getFullYear(),
    startDate.getMonth(),
    startDate.getDate(),
    0,
    0,
    0,
    0,
  ).getTime();
  const endMs = new Date(
    endDate.getFullYear(),
    endDate.getMonth(),
    endDate.getDate(),
    23,
    59,
    59,
    999,
  ).getTime();

  const filteredProducts =
    categoryFilter === 'all'
      ? products
      : products.filter((p) => p.category === categoryFilter);

  const productById = new Map<string, Product>();
  for (const p of filteredProducts) {
    productById.set(p.id, p);
  }

  let totalStockValue = 0;
  let totalCostValue = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;

  const categoryMap = new Map<
    string,
    { skuCount: number; totalUnits: number; retailValue: number }
  >();

  for (const p of filteredProducts) {
    const val = p.sellingPrice * p.quantity;
    totalStockValue += val;
    totalCostValue += p.purchasePrice * p.quantity;
    const status = getStockStatus(p);
    if (status === 'low_stock') lowStockCount += 1;
    if (status === 'out_of_stock') outOfStockCount += 1;

    const cat = categoryMap.get(p.category) ?? {
      skuCount: 0,
      totalUnits: 0,
      retailValue: 0,
    };
    cat.skuCount += 1;
    cat.totalUnits += p.quantity;
    cat.retailValue += val;
    categoryMap.set(p.category, cat);
  }

  // Filter transactions inside selected date range (and matching category if filtered)
  const rangeTransactions = transactions.filter((tx) => {
    if (categoryFilter !== 'all' && !productById.has(tx.productId)) return false;
    const ms = tx.createdAt?.toMillis?.() ?? Date.now();
    return ms >= startMs && ms <= endMs;
  });

  // Build daily buckets across the date range
  const dayCount = Math.max(
    1,
    Math.min(90, Math.round((endMs - startMs) / (24 * 60 * 60 * 1000)) + 1),
  );
  const bucketMap = new Map<
    string,
    { key: string; label: string; inQty: number; outQty: number }
  >();

  for (let i = 0; i < dayCount; i++) {
    const d = new Date(startMs + i * 24 * 60 * 60 * 1000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    bucketMap.set(key, { key, label, inQty: 0, outQty: 0 });
  }

  let totalInUnits = 0;
  let totalOutUnits = 0;
  const movementByProduct = new Map<
    string,
    { inboundUnits: number; outboundUnits: number; txCount: number }
  >();

  for (const tx of rangeTransactions) {
    const d = tx.createdAt?.toDate ? tx.createdAt.toDate() : new Date();
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`;
    const bucket = bucketMap.get(key);
    if (bucket) {
      if (tx.type === 'in') bucket.inQty += tx.quantity;
      else bucket.outQty += tx.quantity;
    }

    if (tx.type === 'in') totalInUnits += tx.quantity;
    else totalOutUnits += tx.quantity;

    const prodStat = movementByProduct.get(tx.productId) ?? {
      inboundUnits: 0,
      outboundUnits: 0,
      txCount: 0,
    };
    if (tx.type === 'in') prodStat.inboundUnits += tx.quantity;
    else prodStat.outboundUnits += tx.quantity;
    prodStat.txCount += 1;
    movementByProduct.set(tx.productId, prodStat);
  }

  const movementSeries = Array.from(bucketMap.values());
  const maxMovementBar = Math.max(
    10,
    ...movementSeries.map((b) => Math.max(b.inQty, b.outQty)),
  );

  // Category breakdown sorted by retail value desc
  const totalCategoryValue = Math.max(1, totalStockValue);
  const categoryBreakdown = Array.from(categoryMap.entries())
    .sort((a, b) => b[1].retailValue - a[1].retailValue)
    .map(([category, info], index) => ({
      category,
      skuCount: info.skuCount,
      totalUnits: info.totalUnits,
      retailValue: info.retailValue,
      sharePct:
        totalStockValue > 0
          ? Math.round((info.retailValue / totalCategoryValue) * 100)
          : 0,
      color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
    }));

  // Top 5 fastest-moving products in selected range
  const topFastMoving = Array.from(movementByProduct.entries())
    .map(([productId, stat]) => {
      const product = productById.get(productId);
      if (!product) return null;
      return {
        product,
        totalMoved: stat.inboundUnits + stat.outboundUnits,
        inboundUnits: stat.inboundUnits,
        outboundUnits: stat.outboundUnits,
        txCount: stat.txCount,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null && item.totalMoved > 0)
    .sort((a, b) => b.totalMoved - a.totalMoved)
    .slice(0, 5);

  // Products with NO movement in the last 30 days (strict 30-day window)
  const cutoff30 = Date.now() - THIRTY_DAYS_MS;
  const recent30Ids = new Set<string>();
  const latestMovementMs = new Map<string, number>();

  for (const tx of transactions) {
    const ms = tx.createdAt?.toMillis?.() ?? 0;
    const prev = latestMovementMs.get(tx.productId) ?? 0;
    if (ms > prev) latestMovementMs.set(tx.productId, ms);
    if (ms >= cutoff30) {
      recent30Ids.add(tx.productId);
    }
  }

  const noMovement30Days = filteredProducts
    .filter((p) => !recent30Ids.has(p.id))
    .map((p) => {
      const lastMs = latestMovementMs.get(p.id) ?? 0;
      return {
        product: p,
        lastMovementDate: lastMs > 0 ? new Date(lastMs) : null,
        lockedValue: p.sellingPrice * p.quantity,
      };
    })
    .sort((a, b) => b.lockedValue - a.lockedValue);

  const lowStockProducts = filteredProducts
    .filter((p) => getStockStatus(p) !== 'in_stock')
    .sort((a, b) => a.quantity - b.quantity);

  return {
    summary: {
      totalProducts: filteredProducts.length,
      totalStockValue,
      totalCostValue,
      lowStockCount,
      outOfStockCount,
      totalInUnits,
      totalOutUnits,
    },
    movementSeries,
    maxMovementBar,
    categoryBreakdown,
    topFastMoving,
    noMovement30Days,
    lowStockProducts,
  };
}
