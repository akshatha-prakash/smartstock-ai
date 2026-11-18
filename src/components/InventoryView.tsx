import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Download,
  Edit3,
  Package,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Wallet,
  XCircle,
} from 'lucide-react';
import { deleteProduct, seedStarterCatalog } from '../services/inventoryService';
import {
  getStockStatus,
  Product,
  PRODUCT_CATEGORIES,
  TransactionType,
} from '../types/inventory';
import { getProductImageSrc } from '../utils/productImages';

interface InventoryViewProps {
  uid: string;
  products: Product[];
  loading: boolean;
  globalSearch: string;
  onGlobalSearchChange: (value: string) => void;
  onAddProduct: () => void;
  onEditProduct: (product: Product) => void;
  onQuickStockAction: (type: TransactionType, productId: string) => void;
}

type StatusFilter = 'all' | 'in_stock' | 'low_stock' | 'out_of_stock';
type SortKey = 'updated' | 'name' | 'stock_asc' | 'stock_desc' | 'price_desc';

export const InventoryView: React.FC<InventoryViewProps> = ({
  uid,
  products,
  loading,
  globalSearch,
  onGlobalSearchChange,
  onAddProduct,
  onEditProduct,
  onQuickStockAction,
}) => {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortKey>('updated');
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  const summary = useMemo(() => {
    let inStock = 0;
    let lowStock = 0;
    let outOfStock = 0;
    let totalValuation = 0;

    for (const p of products) {
      totalValuation += p.sellingPrice * p.quantity;
      const status = getStockStatus(p);
      if (status === 'in_stock') inStock += 1;
      else if (status === 'low_stock') lowStock += 1;
      else outOfStock += 1;
    }

    const healthyPct =
      products.length > 0 ? ((inStock / products.length) * 100).toFixed(1) : '100.0';

    return {
      total: products.length,
      inStock,
      lowStock,
      outOfStock,
      totalValuation,
      healthyPct,
    };
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    const list = products.filter((p) => {
      if (statusFilter !== 'all' && getStockStatus(p) !== statusFilter) return false;
      if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
      if (q) {
        const match =
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.supplier.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });

    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'stock_asc':
          return a.quantity - b.quantity;
        case 'stock_desc':
          return b.quantity - a.quantity;
        case 'price_desc':
          return b.sellingPrice - a.sellingPrice;
        case 'updated':
        default: {
          const aMs = a.updatedAt?.toMillis?.() ?? a.createdAt?.toMillis?.() ?? 0;
          const bMs = b.updatedAt?.toMillis?.() ?? b.createdAt?.toMillis?.() ?? 0;
          return bMs - aMs;
        }
      }
    });
    return sorted;
  }, [products, globalSearch, statusFilter, categoryFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedProducts = filteredProducts.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteProduct(id);
      setConfirmDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  };

  const handleExportCsv = () => {
    const headers = [
      'SKU',
      'Product Name',
      'Category',
      'Supplier',
      'Purchase Price',
      'Selling Price',
      'Quantity',
      'Min Stock',
      'Unit',
      'Status',
    ];
    const rows = filteredProducts.map((p) => [
      p.sku,
      `"${p.name.replace(/"/g, '""')}"`,
      p.category,
      `"${p.supplier.replace(/"/g, '""')}"`,
      p.purchasePrice.toFixed(2),
      p.sellingPrice.toFixed(2),
      String(p.quantity),
      String(p.minStock),
      p.unit,
      getStockStatus(p).replace('_', ' '),
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'smartstock-inventory-catalog.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await seedStarterCatalog(uid);
    } finally {
      setSeeding(false);
    }
  };

  const formatCurrency = (val: number) =>
    val.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1440px] mx-auto">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Inventory Management
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Monitor product catalog, stock levels, suppliers, and execute quick inventory actions
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredProducts.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 disabled:opacity-50 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={onAddProduct}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0F2942] hover:bg-[#173A5E] text-white text-xs font-semibold whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Product</span>
          </button>
        </div>
      </div>

      {/* 5 Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 mb-2">
            <span>Total Active Items</span>
            <Package className="w-4 h-4 text-slate-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 tabular-nums">{summary.total}</span>
            <span className="text-xs font-medium text-teal-700">SKUs</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 mb-2">
            <span>In Stock Items</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 tabular-nums">{summary.inStock}</span>
            <span className="text-xs font-medium text-emerald-700 tabular-nums">
              {summary.healthyPct}% healthy
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 mb-2">
            <span>Low Stock Alerts</span>
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 tabular-nums">{summary.lowStock}</span>
            <span className="text-xs font-medium text-amber-700">Reorder needed</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 mb-2">
            <span>Out of Stock</span>
            <XCircle className="w-4 h-4 text-red-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-red-600 tabular-nums">{summary.outOfStock}</span>
            <span className="text-xs font-medium text-red-600">Critical action</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 mb-2">
            <span>Catalog Valuation</span>
            <Wallet className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-xl font-bold text-slate-900 tabular-nums truncate">
            {formatCurrency(summary.totalValuation)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Retail value</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={globalSearch}
            onChange={(e) => {
              onGlobalSearchChange(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search by product name, SKU, or supplier..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(
              [
                { id: 'all', label: `All (${summary.total})` },
                { id: 'in_stock', label: `In Stock (${summary.inStock})` },
                { id: 'low_stock', label: `Low Stock (${summary.lowStock})` },
                { id: 'out_of_stock', label: `Out (${summary.outOfStock})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setStatusFilter(tab.id);
                  setCurrentPage(1);
                }}
                className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap tabular-nums ${
                  statusFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Category Dropdown */}
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none"
          >
            <option value="all">All Categories</option>
            {PRODUCT_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          {/* Sort Dropdown */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none"
          >
            <option value="updated">Sort: Last Updated</option>
            <option value="name">Sort: Name (A–Z)</option>
            <option value="stock_asc">Sort: Stock (Low to High)</option>
            <option value="stock_desc">Sort: Stock (High to Low)</option>
            <option value="price_desc">Sort: Selling Price (High to Low)</option>
          </select>
        </div>
      </div>

      {/* Product Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3, 4].map((row) => (
              <div key={row} className="h-12 bg-slate-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto mb-3">
              <Package className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-1">
              No products in your catalog yet
            </h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto mb-5">
              Create your first inventory SKU or load our starter catalog into your Cloud Firestore database.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                disabled={seeding}
                onClick={handleSeed}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800"
              >
                <Sparkles className="w-3.5 h-3.5 text-teal-700" />
                <span>{seeding ? 'Seeding...' : 'Load Starter Catalog'}</span>
              </button>
              <button
                type="button"
                onClick={onAddProduct}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0F2942] hover:bg-[#173A5E] text-white text-xs font-semibold"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Product</span>
              </button>
            </div>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm text-slate-600 mb-3">
              No products match your current search or filter criteria.
            </p>
            <button
              type="button"
              onClick={() => {
                onGlobalSearchChange('');
                setStatusFilter('all');
                setCategoryFilter('all');
              }}
              className="px-3.5 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold text-slate-500">
                    <th className="py-3.5 px-4">Product & SKU</th>
                    <th className="py-3.5 px-4">Category</th>
                    <th className="py-3.5 px-4">Supplier</th>
                    <th className="py-3.5 px-4 text-right">Price / Cost</th>
                    <th className="py-3.5 px-4 text-right">Available Qty</th>
                    <th className="py-3.5 px-4 text-right">Safety Buffer</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {paginatedProducts.map((product) => {
                    const status = getStockStatus(product);
                    const imgSrc = getProductImageSrc(product.imageKey);

                    return (
                      <tr
                        key={product.id}
                        className="hover:bg-slate-50/90 transition-colors group"
                      >
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            {imgSrc ? (
                              <img
                                src={imgSrc}
                                alt={product.name}
                                referrerPolicy="no-referrer"
                                className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0 bg-slate-50"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 shrink-0">
                                <Package className="w-4 h-4" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <button
                                type="button"
                                onClick={() => onEditProduct(product)}
                                className="font-semibold text-slate-900 hover:text-teal-700 text-left truncate block max-w-[230px]"
                              >
                                {product.name}
                              </button>
                              <div className="text-[11px] font-mono text-slate-500">
                                SKU: {product.sku}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap text-slate-700 font-medium">
                          {product.category}
                        </td>

                        <td className="py-3.5 px-4 text-slate-600 max-w-[160px] truncate">
                          {product.supplier}
                        </td>

                        <td className="py-3.5 px-4 text-right whitespace-nowrap tabular-nums">
                          <div className="font-semibold text-slate-900">
                            {formatCurrency(product.sellingPrice)}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Cost {formatCurrency(product.purchasePrice)}
                          </div>
                        </td>

                        <td
                          className={`py-3.5 px-4 text-right font-bold whitespace-nowrap tabular-nums ${
                            status === 'out_of_stock'
                              ? 'text-red-600'
                              : status === 'low_stock'
                                ? 'text-amber-700'
                                : 'text-slate-900'
                          }`}
                        >
                          {product.quantity} units
                        </td>

                        <td className="py-3.5 px-4 text-right text-slate-500 whitespace-nowrap tabular-nums">
                          Min: {product.minStock} units
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {status === 'in_stock' && (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800 font-semibold text-[11px]">
                              In Stock
                            </span>
                          )}
                          {status === 'low_stock' && (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-amber-50 text-amber-800 font-semibold text-[11px]">
                              Low Stock
                            </span>
                          )}
                          {status === 'out_of_stock' && (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-red-50 text-red-700 font-semibold text-[11px]">
                              Out of Stock
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          {confirmDeleteId === product.id ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={deletingId === product.id}
                                onClick={() => handleDelete(product.id)}
                                className="px-2 py-1 rounded bg-red-600 hover:bg-red-700 text-white text-[11px] font-semibold"
                              >
                                {deletingId === product.id ? 'Deleting...' : 'Confirm'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-2 py-1 rounded border border-slate-200 text-slate-600 text-[11px] font-semibold hover:bg-slate-50"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                title="Stock In"
                                onClick={() => onQuickStockAction('in', product.id)}
                                className="p-1.5 rounded-md text-emerald-700 hover:bg-emerald-50 transition-colors"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                title="Stock Out"
                                onClick={() => onQuickStockAction('out', product.id)}
                                className="p-1.5 rounded-md text-slate-600 hover:bg-slate-100 transition-colors"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                title="Edit Product"
                                onClick={() => onEditProduct(product)}
                                className="p-1.5 rounded-md text-slate-600 hover:bg-slate-100 transition-colors"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                title="Delete Product"
                                onClick={() => setConfirmDeleteId(product.id)}
                                className="p-1.5 rounded-md text-red-600 hover:bg-red-50 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div className="px-4 py-3.5 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
              <div className="flex items-center gap-4">
                <span className="tabular-nums">
                  Showing{' '}
                  <strong>
                    {(safePage - 1) * pageSize + 1}–
                    {Math.min(safePage * pageSize, filteredProducts.length)}
                  </strong>{' '}
                  of <strong>{filteredProducts.length}</strong> items
                </span>
                <label className="inline-flex items-center gap-1.5">
                  <span>Rows per page:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="px-2 py-1 rounded border border-slate-200 bg-white font-medium text-slate-800"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                </label>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="px-2.5 py-1.5 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 font-medium"
                >
                  Previous
                </button>
                {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((pageNum) => (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => setCurrentPage(pageNum)}
                    className={`px-2.5 py-1.5 rounded font-semibold tabular-nums ${
                      safePage === pageNum
                        ? 'bg-[#0F2942] text-white'
                        : 'border border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    {pageNum}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="px-2.5 py-1.5 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 font-medium"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
