import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  Download,
  Minus,
  Package,
  Plus,
  RefreshCw,
  Sparkles,
  Wallet,
  XCircle,
} from 'lucide-react';
import { fetchRestockSuggestions } from '../services/aiService';
import { recordStockMovement, seedStarterCatalog } from '../services/inventoryService';
import {
  AppPage,
  getStockStatus,
  Product,
  RestockSuggestion,
  StockTransaction,
  TransactionType,
} from '../types/inventory';

interface DashboardViewProps {
  uid: string;
  products: Product[];
  transactions: StockTransaction[];
  loading: boolean;
  onNavigate: (page: AppPage) => void;
  onOpenStockPage: (type: TransactionType, productId?: string) => void;
  onEditProduct: (product: Product) => void;
}

type TimeRange = 'today' | '7d' | 'mtd';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const DashboardView: React.FC<DashboardViewProps> = ({
  uid,
  products,
  transactions,
  loading,
  onNavigate,
  onOpenStockPage,
  onEditProduct,
}) => {
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [txFilter, setTxFilter] = useState<'all' | 'in' | 'out'>('all');

  // Fast Transaction Terminal state
  const [terminalType, setTerminalType] = useState<TransactionType>('in');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [terminalQty, setTerminalQty] = useState<number>(10);
  const [terminalReason, setTerminalReason] = useState<string>('Shelf Replenishment');
  const [submitting, setSubmitting] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [terminalFeedback, setTerminalFeedback] = useState<{
    kind: 'success' | 'error';
    text: string;
  } | null>(null);

  // AI Restocking Suggestions state
  const [restockSuggestions, setRestockSuggestions] = useState<RestockSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);

  const lowStockSignature = useMemo(() => {
    return products
      .filter((p) => getStockStatus(p) !== 'in_stock')
      .map((p) => `${p.id}:${p.quantity}:${p.minStock}`)
      .sort()
      .join('|');
  }, [products]);

  const loadSuggestions = useCallback(async () => {
    if (!lowStockSignature) {
      setRestockSuggestions([]);
      setSuggestionsError(null);
      return;
    }
    setSuggestionsLoading(true);
    setSuggestionsError(null);
    try {
      const items = await fetchRestockSuggestions(products, transactions);
      setRestockSuggestions(items);
    } catch (err) {
      setSuggestionsError(
        err instanceof Error
          ? err.message
          : 'Unable to load Gemini restocking suggestions.',
      );
    } finally {
      setSuggestionsLoading(false);
    }
  }, [lowStockSignature, products, transactions]);

  useEffect(() => {
    if (!loading) {
      void loadSuggestions();
    }
  }, [loading, lowStockSignature]);

  const activeProduct = useMemo(() => {
    if (selectedProductId) {
      return products.find((p) => p.id === selectedProductId) ?? products[0] ?? null;
    }
    return products[0] ?? null;
  }, [products, selectedProductId]);

  const metrics = useMemo(() => {
    let totalValuation = 0;
    let healthyCount = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    for (const p of products) {
      totalValuation += p.sellingPrice * p.quantity;
      const status = getStockStatus(p);
      if (status === 'in_stock') healthyCount += 1;
      else if (status === 'low_stock') lowStockCount += 1;
      else outOfStockCount += 1;
    }

    const healthyPct =
      products.length > 0 ? Math.round((healthyCount / products.length) * 100) : 100;

    return {
      totalValuation,
      activeSkus: products.length,
      healthyPct,
      lowStockCount,
      outOfStockCount,
    };
  }, [products]);

  const filteredByTimeTransactions = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    return transactions.filter((t) => {
      const ms = t.createdAt?.toMillis?.() ?? Date.now();
      if (timeRange === 'today') return ms >= startOfToday;
      if (timeRange === '7d') return ms >= sevenDaysAgo;
      return ms >= startOfMonth;
    });
  }, [transactions, timeRange]);

  const chartSeries = useMemo(() => {
    const bars = DAYS.map((day) => ({ day, inQty: 0, outQty: 0 }));
    let totalIn = 0;
    let totalOut = 0;

    for (const t of filteredByTimeTransactions) {
      const date = t.createdAt?.toDate ? t.createdAt.toDate() : new Date();
      // JS getDay(): 0 = Sun, 1 = Mon ... 6 = Sat
      const idx = (date.getDay() + 6) % 7;
      if (t.type === 'in') {
        bars[idx].inQty += t.quantity;
        totalIn += t.quantity;
      } else {
        bars[idx].outQty += t.quantity;
        totalOut += t.quantity;
      }
    }

    const maxVal = Math.max(
      10,
      ...bars.map((d) => Math.max(d.inQty, d.outQty)),
    );

    return { bars, totalIn, totalOut, maxVal };
  }, [filteredByTimeTransactions]);

  const recentTransactions = useMemo(() => {
    const list =
      txFilter === 'all'
        ? transactions
        : transactions.filter((t) => t.type === txFilter);
    return list.slice(0, 6);
  }, [transactions, txFilter]);

  const lowStockWatchlist = useMemo(() => {
    return products
      .filter((p) => getStockStatus(p) !== 'in_stock')
      .sort((a, b) => a.quantity - b.quantity)
      .slice(0, 4);
  }, [products]);

  const handleCommitTerminal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProduct) return;
    setTerminalFeedback(null);
    setSubmitting(true);
    try {
      const nextStock = await recordStockMovement(uid, {
        productId: activeProduct.id,
        type: terminalType,
        quantity: terminalQty,
        reason:
          terminalReason.trim() ||
          (terminalType === 'in' ? 'Quick Stock Intake' : 'POS / Quick Dispatch'),
      });
      setTerminalFeedback({
        kind: 'success',
        text: `Updated ${activeProduct.sku} to ${nextStock} units.`,
      });
    } catch (err) {
      setTerminalFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Unable to commit movement.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleExportActivityCsv = () => {
    const headers = ['Timestamp', 'Product Name', 'SKU', 'Type', 'Quantity', 'Resulting Stock', 'Reason'];
    const rows = recentTransactions.map((t) => [
      t.createdAt?.toDate ? t.createdAt.toDate().toISOString() : '',
      `"${t.productName.replace(/"/g, '""')}"`,
      t.sku,
      t.type === 'in' ? 'Stock In' : 'Stock Out',
      String(t.quantity),
      String(t.resultingStock),
      `"${t.reason.replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'smartstock-recent-activity.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSeedSample = async () => {
    setSeeding(true);
    try {
      await seedStarterCatalog(uid);
    } finally {
      setSeeding(false);
    }
  };

  const formatCurrency = (val: number) =>
    val.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  const formatTimestamp = (ts: StockTransaction['createdAt']) => {
    if (!ts?.toDate) return 'Just now';
    const d = ts.toDate();
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="p-6 lg:p-8 space-y-6">
        <div className="h-10 w-64 bg-slate-200 rounded-lg animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((k) => (
            <div key={k} className="h-32 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-80 bg-white border border-slate-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1440px] mx-auto">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold text-teal-700 mb-1">
            Apex Retail Distribution · Live Warehouse Catalog
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Operations Dashboard
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Real-time overview of inventory valuation, stock movements, and low-stock thresholds
          </p>
        </div>

        {/* Time Window Filter */}
        <div className="flex items-center gap-1 p-1 bg-white border border-slate-200 rounded-lg self-start">
          {(
            [
              { id: 'today', label: 'Today' },
              { id: '7d', label: 'Last 7 Days' },
              { id: 'mtd', label: 'Month to Date' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setTimeRange(tab.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                timeRange === tab.id
                  ? 'bg-[#0F2942] text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Empty Workspace Onboarding Banner */}
      {products.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Your Cloud Firestore catalog is currently empty
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Add your first product manually or load 6 starter SKUs into your database to test stock movements right away.
            </p>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              disabled={seeding}
              onClick={handleSeedSample}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-800 transition-colors whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5 text-teal-700" />
              <span>{seeding ? 'Loading Catalog...' : 'Load Starter Catalog'}</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('add-product')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0F2942] hover:bg-[#173A5E] text-white text-xs font-semibold transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add First Product</span>
            </button>
          </div>
        </div>
      )}

      {/* 4 KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-2">
            <span>Total Valuation</span>
            <Wallet className="w-4 h-4 text-teal-700" />
          </div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {formatCurrency(metrics.totalValuation)}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
              Retail stock value
            </span>
            <svg viewBox="0 0 60 20" className="w-16 h-5 text-emerald-600" fill="none">
              <path
                d="M2 16 C 14 14, 24 18, 36 10 C 44 5, 52 7, 58 3"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-2">
            <span>Active SKUs</span>
            <Package className="w-4 h-4 text-slate-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {metrics.activeSkus}{' '}
            <span className="text-sm font-medium text-slate-500">items</span>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded tabular-nums">
              {metrics.healthyPct}% Healthy
            </span>
            <svg viewBox="0 0 60 20" className="w-16 h-5 text-[#0F2942]" fill="none">
              <path
                d="M2 14 C 16 10, 26 16, 38 11 C 48 7, 54 9, 58 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('alerts')}
          className="text-left bg-white border border-slate-200 hover:border-amber-300 rounded-xl p-5 flex flex-col justify-between transition-colors"
        >
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-2 w-full">
            <span>Low Stock Items</span>
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {metrics.lowStockCount}{' '}
            <span className="text-sm font-medium text-slate-500">items</span>
          </div>
          <div className="mt-3 flex items-center justify-between w-full">
            <span className="text-xs font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded">
              {metrics.lowStockCount > 0 ? 'Action Required' : 'All Above Min'}
            </span>
            <svg viewBox="0 0 60 20" className="w-16 h-5 text-amber-500" fill="none">
              <path
                d="M2 8 C 16 6, 26 12, 38 14 C 48 15, 54 11, 58 13"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('alerts')}
          className="text-left bg-white border border-slate-200 hover:border-red-300 rounded-xl p-5 flex flex-col justify-between transition-colors"
        >
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-2 w-full">
            <span>Critical Depletions</span>
            <XCircle className="w-4 h-4 text-red-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {metrics.outOfStockCount}{' '}
            <span className="text-sm font-medium text-slate-500">items</span>
          </div>
          <div className="mt-3 flex items-center justify-between w-full">
            <span className="text-xs font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded">
              {metrics.outOfStockCount > 0 ? 'Out of Stock' : 'Zero Stockouts'}
            </span>
            <svg viewBox="0 0 60 20" className="w-16 h-5 text-red-500" fill="none">
              <path
                d="M2 6 C 14 7, 26 11, 38 15 C 46 17, 54 17, 58 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </button>
      </div>

      {/* Main Content Split: Stock Flow Chart (2/3) + Fast Transaction Terminal (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        {/* Stock Flow Chart Card */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Inventory Turnover & Stock Flow Trends
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Comparison between inbound stock intake vs outbound stock dispatches
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs font-semibold shrink-0">
              <div className="flex items-center gap-1.5 text-slate-700">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#0F2942]" />
                <span className="tabular-nums">Stock In (+{chartSeries.totalIn})</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-700">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#047857]" />
                <span className="tabular-nums">Stock Out (-{chartSeries.totalOut})</span>
              </div>
            </div>
          </div>

          {/* Grouped Bar Chart */}
          <div className="h-56 flex items-end justify-between gap-3 px-2 pt-6 pb-2 border-b border-slate-100">
            {chartSeries.bars.map((bar) => {
              const inHeight = Math.max(4, Math.round((bar.inQty / chartSeries.maxVal) * 165));
              const outHeight = Math.max(4, Math.round((bar.outQty / chartSeries.maxVal) * 165));
              return (
                <div key={bar.day} className="flex-1 flex flex-col items-center gap-2 group">
                  <div className="flex items-end gap-1.5 h-[170px]">
                    <div
                      title={`${bar.day} Stock In: +${bar.inQty} units`}
                      style={{ height: `${bar.inQty === 0 ? 4 : inHeight}px` }}
                      className={`w-4 sm:w-5 rounded-t transition-all ${
                        bar.inQty > 0 ? 'bg-[#0F2942] group-hover:bg-[#1A4268]' : 'bg-slate-200'
                      }`}
                    />
                    <div
                      title={`${bar.day} Stock Out: -${bar.outQty} units`}
                      style={{ height: `${bar.outQty === 0 ? 4 : outHeight}px` }}
                      className={`w-4 sm:w-5 rounded-t transition-all ${
                        bar.outQty > 0 ? 'bg-[#047857] group-hover:bg-[#059669]' : 'bg-slate-200'
                      }`}
                    />
                  </div>
                  <span className="text-xs font-medium text-slate-500">{bar.day}</span>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3.5 py-2.5">
            <span>
              Net Movement:{' '}
              <strong className="text-slate-900 tabular-nums">
                {chartSeries.totalIn - chartSeries.totalOut >= 0 ? '+' : ''}
                {chartSeries.totalIn - chartSeries.totalOut} units
              </strong>{' '}
              across {filteredByTimeTransactions.length} recorded transactions
            </span>
            <button
              type="button"
              onClick={() => onOpenStockPage('in')}
              className="font-semibold text-teal-700 hover:text-teal-800 inline-flex items-center gap-1 whitespace-nowrap"
            >
              <span>Open Full Ledger</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Fast Transaction Terminal Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">Fast Transaction Terminal</h2>
                <p className="text-xs text-slate-500">Immediate Stock In / Out update</p>
              </div>
              <span className="text-[11px] font-mono font-semibold text-slate-500">
                POS #04
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg mb-4">
              <button
                type="button"
                onClick={() => {
                  setTerminalType('in');
                  setTerminalReason('Shelf Replenishment');
                  setTerminalFeedback(null);
                }}
                className={`py-2 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  terminalType === 'in'
                    ? 'bg-[#047857] text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ArrowDown className="w-3.5 h-3.5" />
                <span>Stock In</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setTerminalType('out');
                  setTerminalReason('Retail POS Sale');
                  setTerminalFeedback(null);
                }}
                className={`py-2 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  terminalType === 'out'
                    ? 'bg-[#0F2942] text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ArrowUp className="w-3.5 h-3.5" />
                <span>Stock Out</span>
              </button>
            </div>

            <form onSubmit={handleCommitTerminal} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Select SKU / Product
                </label>
                <select
                  value={activeProduct?.id ?? ''}
                  onChange={(e) => {
                    setSelectedProductId(e.target.value);
                    setTerminalFeedback(null);
                  }}
                  disabled={products.length === 0}
                  className="w-full px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
                >
                  {products.length === 0 ? (
                    <option value="">No products in catalog</option>
                  ) : (
                    products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.sku} — {p.name}
                      </option>
                    ))
                  )}
                </select>
                {activeProduct && (
                  <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
                    Found: <strong className="text-slate-700">{activeProduct.name}</strong> (
                    {activeProduct.quantity} on shelf)
                  </p>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Adjustment Quantity
                </label>
                <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setTerminalQty((q) => Math.max(1, q - 1))}
                    className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border-r border-slate-200"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <input
                    type="number"
                    min={1}
                    value={terminalQty}
                    onChange={(e) => setTerminalQty(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full text-center py-2 text-sm font-bold text-slate-900 tabular-nums focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setTerminalQty((q) => q + 1)}
                    className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border-l border-slate-200"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Reason / Reference Note
                </label>
                <input
                  type="text"
                  value={terminalReason}
                  onChange={(e) => setTerminalReason(e.target.value)}
                  placeholder="Shelf replenishment or POS sale"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
                />
              </div>

              {terminalFeedback && (
                <div
                  className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                    terminalFeedback.kind === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-red-50 text-red-700 border border-red-200'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{terminalFeedback.text}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || !activeProduct}
                className={`w-full py-2.5 px-4 rounded-lg text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 ${
                  terminalType === 'in'
                    ? 'bg-[#047857] hover:bg-[#065F46]'
                    : 'bg-[#0F2942] hover:bg-[#173A5E]'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {submitting
                    ? 'Saving...'
                    : terminalType === 'in'
                      ? `Commit Stock In (+${terminalQty})`
                      : `Commit Stock Out (-${terminalQty})`}
                </span>
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Bottom Split: Recent Stock Activity (2/3) + Low Stock Watchlist (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Stock Activity Table */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Recent Stock Activity</h2>
              <p className="text-xs text-slate-500">
                Audited logs of verified SKU receipts and stock dispatches
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={txFilter}
                onChange={(e) => setTxFilter(e.target.value as 'all' | 'in' | 'out')}
                className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-slate-50 text-slate-700 focus:outline-none"
              >
                <option value="all">All Types</option>
                <option value="in">Stock In</option>
                <option value="out">Stock Out</option>
              </select>
              <button
                type="button"
                onClick={handleExportActivityCsv}
                disabled={recentTransactions.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 disabled:opacity-50 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>CSV</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Product Name</th>
                  <th className="py-3 px-4">SKU</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4 text-right">Quantity</th>
                  <th className="py-3 px-4 text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {recentTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-500">
                      No stock transactions recorded yet. Use the Fast Transaction Terminal to log your first movement.
                    </td>
                  </tr>
                ) : (
                  recentTransactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 text-slate-500 whitespace-nowrap tabular-nums">
                        {formatTimestamp(tx.createdAt)}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900 max-w-[200px] truncate">
                        {tx.productName}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                        {tx.sku}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded font-semibold text-[11px] ${
                            tx.type === 'in'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {tx.type === 'in' ? '+ Stock In' : '- Stock Out'}
                        </span>
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-semibold tabular-nums whitespace-nowrap ${
                          tx.type === 'in' ? 'text-emerald-700' : 'text-red-600'
                        }`}
                      >
                        {tx.type === 'in' ? `+${tx.quantity}` : `-${tx.quantity}`} units
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-slate-700 tabular-nums whitespace-nowrap">
                        {tx.resultingStock} units
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: AI Restocking Suggestions + Low Stock Watchlist */}
        <div className="space-y-6">
          {/* Restocking Suggestions (Gemini API) */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-teal-700" />
                  <h2 className="text-base font-bold text-slate-900">
                    Restocking Suggestions
                  </h2>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  AI reorder quantities based on stock thresholds &amp; 30-day velocity
                </p>
              </div>
              <button
                type="button"
                disabled={suggestionsLoading || !lowStockSignature}
                onClick={() => void loadSuggestions()}
                title="Refresh AI suggestions"
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 disabled:opacity-40"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${suggestionsLoading ? 'animate-spin' : ''}`}
                />
              </button>
            </div>

            {suggestionsLoading ? (
              <div className="space-y-2.5">
                {[1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-20 rounded-lg bg-slate-100 animate-pulse"
                  />
                ))}
              </div>
            ) : suggestionsError ? (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2 text-xs text-red-700">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{suggestionsError}</span>
              </div>
            ) : restockSuggestions.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-lg">
                All products are above their minimum reorder threshold. No restocking needed right now.
              </div>
            ) : (
              <div className="space-y-3">
                {restockSuggestions.map((item) => {
                  const isCritical =
                    item.urgency === 'critical' || item.currentStock <= 0;
                  return (
                    <div
                      key={item.productId}
                      className={`p-3.5 rounded-xl border space-y-2 ${
                        isCritical
                          ? 'bg-red-50/40 border-red-200'
                          : 'bg-slate-50/70 border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 truncate">
                            {item.productName}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500 tabular-nums">
                            {item.sku} · Stock: {item.currentStock} / Min {item.minStock}
                          </div>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold shrink-0 ${
                            isCritical
                              ? 'bg-red-100 text-red-700'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {isCritical ? 'Out of Stock' : 'Low Stock'}
                        </span>
                      </div>

                      <p className="text-xs text-slate-600 leading-snug">
                        {item.reason}
                      </p>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-xs font-semibold text-teal-800 tabular-nums">
                          Suggested order: +{item.suggestedQuantity} units
                        </span>
                        <button
                          type="button"
                          onClick={() => onOpenStockPage('in', item.productId)}
                          className="px-2.5 py-1.5 rounded-md bg-[#047857] hover:bg-[#065F46] text-white text-[11px] font-semibold whitespace-nowrap"
                        >
                          Order Now
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              onClick={() => onNavigate('assistant')}
              className="w-full py-2 px-3 rounded-lg bg-[#0F2942] hover:bg-[#173A5E] text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#2DD4BF]" />
              <span>Ask AI Assistant</span>
            </button>
          </div>

          {/* Low Stock Watchlist */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Low Stock Watchlist</h2>
                  <p className="text-xs text-slate-500">Items at or below safety threshold</p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('alerts')}
                  className="text-xs font-semibold text-teal-700 hover:text-teal-800 whitespace-nowrap"
                >
                  View All
                </button>
              </div>

              {lowStockWatchlist.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-lg">
                  All catalog items are currently above their minimum stock threshold.
                </div>
              ) : (
                <div className="space-y-3">
                  {lowStockWatchlist.map((item) => {
                    const isOut = item.quantity <= 0;
                    return (
                      <div
                        key={item.id}
                        className="p-3 rounded-lg border border-slate-200 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => onEditProduct(item)}
                            className="text-xs font-semibold text-slate-900 hover:text-teal-700 truncate block text-left"
                          >
                            {item.name}
                          </button>
                          <div className="text-[11px] text-slate-500 font-mono mt-0.5 tabular-nums">
                            {item.sku} ·{' '}
                            <span className={isOut ? 'text-red-600 font-semibold' : 'text-amber-700 font-semibold'}>
                              {item.quantity} left
                            </span>{' '}
                            / Min {item.minStock}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onOpenStockPage('in', item.id)}
                          className="px-2.5 py-1.5 rounded-md bg-[#047857] hover:bg-[#065F46] text-white text-[11px] font-semibold whitespace-nowrap shrink-0"
                        >
                          + Restock
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => onNavigate('inventory')}
              className="mt-5 w-full py-2 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center justify-center gap-1.5 transition-colors"
            >
              <span>Manage Full Catalog</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
