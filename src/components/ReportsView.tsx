import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  Calendar,
  Download,
  Layers,
  Package,
  TrendingUp,
  Wallet,
  XCircle,
} from 'lucide-react';
import {
  getStockStatus,
  Product,
  PRODUCT_CATEGORIES,
  StockTransaction,
} from '../types/inventory';
import { computeReportMetrics } from '../utils/analytics';

interface ReportsViewProps {
  products: Product[];
  transactions: StockTransaction[];
  onQuickRestock: (productId: string) => void;
  onEditProduct: (product: Product) => void;
}

type DatePreset = '7d' | '30d' | '90d' | 'custom';

function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  products,
  transactions,
  onQuickRestock,
  onEditProduct,
}) => {
  const [preset, setPreset] = useState<DatePreset>('30d');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const today = useMemo(() => new Date(), []);
  const [customStart, setCustomStart] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return toDateInputValue(d);
  });
  const [customEnd, setCustomEnd] = useState<string>(() => toDateInputValue(new Date()));

  const { startDate, endDate } = useMemo(() => {
    const end = new Date(today);
    const start = new Date(today);

    if (preset === '7d') {
      start.setDate(end.getDate() - 6);
      return { startDate: start, endDate: end };
    }
    if (preset === '30d') {
      start.setDate(end.getDate() - 29);
      return { startDate: start, endDate: end };
    }
    if (preset === '90d') {
      start.setDate(end.getDate() - 89);
      return { startDate: start, endDate: end };
    }

    const parsedStart = new Date(`${customStart}T00:00:00`);
    const parsedEnd = new Date(`${customEnd}T23:59:59`);
    if (Number.isNaN(parsedStart.getTime()) || Number.isNaN(parsedEnd.getTime())) {
      start.setDate(end.getDate() - 29);
      return { startDate: start, endDate: end };
    }
    return parsedStart <= parsedEnd
      ? { startDate: parsedStart, endDate: parsedEnd }
      : { startDate: parsedEnd, endDate: parsedStart };
  }, [preset, today, customStart, customEnd]);

  const metrics = useMemo(
    () =>
      computeReportMetrics(
        products,
        transactions,
        startDate,
        endDate,
        categoryFilter,
      ),
    [products, transactions, startDate, endDate, categoryFilter],
  );

  // When showing >31 days, group bars into ~10-15 readable buckets so bars never squish
  const chartBars = useMemo(() => {
    const series = metrics.movementSeries;
    if (series.length <= 31) {
      return series;
    }
    const bucketSize = Math.ceil(series.length / 15);
    const grouped: typeof series = [];
    for (let i = 0; i < series.length; i += bucketSize) {
      const slice = series.slice(i, i + bucketSize);
      const inQty = slice.reduce((sum, s) => sum + s.inQty, 0);
      const outQty = slice.reduce((sum, s) => sum + s.outQty, 0);
      grouped.push({
        key: slice[0].key,
        label:
          slice.length > 1
            ? `${slice[0].label}–${slice[slice.length - 1].label}`
            : slice[0].label,
        inQty,
        outQty,
      });
    }
    return grouped;
  }, [metrics.movementSeries]);

  const maxChartBar = useMemo(
    () => Math.max(10, ...chartBars.map((b) => Math.max(b.inQty, b.outQty))),
    [chartBars],
  );

  const handleExportCsv = () => {
    const lines: string[] = [];
    lines.push('SmartStock AI Inventory Analytics Report');
    lines.push(
      `Date Range,${toDateInputValue(startDate)},to,${toDateInputValue(endDate)},Category,${categoryFilter}`,
    );
    lines.push('');
    lines.push('SUMMARY METRICS');
    lines.push(`Total Products,${metrics.summary.totalProducts}`);
    lines.push(`Total Stock Value (Retail),${metrics.summary.totalStockValue.toFixed(2)}`);
    lines.push(`Total Stock Value (Cost),${metrics.summary.totalCostValue.toFixed(2)}`);
    lines.push(`Low-Stock Count,${metrics.summary.lowStockCount}`);
    lines.push(`Out-of-Stock Count,${metrics.summary.outOfStockCount}`);
    lines.push(`Stock In (Range),${metrics.summary.totalInUnits}`);
    lines.push(`Stock Out (Range),${metrics.summary.totalOutUnits}`);
    lines.push('');
    lines.push('STOCK BY CATEGORY');
    lines.push('Category,SKUs,Total Units,Retail Value,Share %');
    for (const c of metrics.categoryBreakdown) {
      lines.push(
        `"${c.category}",${c.skuCount},${c.totalUnits},${c.retailValue.toFixed(2)},${c.sharePct}%`,
      );
    }
    lines.push('');
    lines.push('TOP 5 FASTEST-MOVING PRODUCTS');
    lines.push('Rank,Product Name,SKU,Units Moved,Inbound,Outbound,Current Stock');
    metrics.topFastMoving.forEach((item, idx) => {
      lines.push(
        `${idx + 1},"${item.product.name.replace(/"/g, '""')}",${item.product.sku},${item.totalMoved},${item.inboundUnits},${item.outboundUnits},${item.product.quantity}`,
      );
    });
    lines.push('');
    lines.push('PRODUCTS WITH NO MOVEMENT IN 30 DAYS');
    lines.push('Product Name,SKU,Category,Current Stock,Locked Retail Value');
    for (const item of metrics.noMovement30Days) {
      lines.push(
        `"${item.product.name.replace(/"/g, '""')}",${item.product.sku},${item.product.category},${item.product.quantity},${item.lockedValue.toFixed(2)}`,
      );
    }
    lines.push('');
    lines.push('LOW-STOCK & OUT-OF-STOCK PRODUCTS');
    lines.push('Product Name,SKU,Category,Supplier,Current Quantity,Reorder Level,Deficit,Status');
    for (const p of metrics.lowStockProducts) {
      const status = getStockStatus(p) === 'out_of_stock' ? 'Out of Stock' : 'Low Stock';
      const deficit = Math.max(0, p.minStock - p.quantity);
      lines.push(
        `"${p.name.replace(/"/g, '""')}",${p.sku},${p.category},"${p.supplier.replace(/"/g, '""')}",${p.quantity},${p.minStock},${deficit},${status}`,
      );
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smartstock-report-${toDateInputValue(startDate)}-to-${toDateInputValue(endDate)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatCurrency = (val: number) =>
    val.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1440px] mx-auto">
      {/* Header & Export */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold text-teal-700 mb-1">
            Operations Telemetry · Cloud Firestore
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Reports &amp; Analytics
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Live inventory valuation, 30-day stock movements, category breakdown, and reorder audit
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportCsv}
          disabled={products.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#0F2942] hover:bg-[#173A5E] text-white text-xs font-semibold disabled:opacity-50 self-start sm:self-auto whitespace-nowrap"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export Report CSV</span>
        </button>
      </div>

      {/* Date Range & Category Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(
              [
                { id: '7d', label: 'Last 7 Days' },
                { id: '30d', label: 'Last 30 Days' },
                { id: '90d', label: 'Last 90 Days' },
                { id: 'custom', label: 'Custom Range' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setPreset(tab.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                  preset === tab.id
                    ? 'bg-white text-[#0F2942] shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {preset === 'custom' && (
            <div className="flex items-center gap-2 text-xs">
              <Calendar className="w-4 h-4 text-slate-400" />
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 tabular-nums"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 tabular-nums"
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          <span className="text-xs font-semibold text-slate-500">Category:</span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none"
          >
            <option value="all">All Categories</option>
            {PRODUCT_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 1. Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-2">
            <span>Total Products</span>
            <Package className="w-4 h-4 text-[#0F2942]" />
          </div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {metrics.summary.totalProducts}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Active SKUs in filtered catalog
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-2">
            <span>Total Stock Value</span>
            <Wallet className="w-4 h-4 text-teal-700" />
          </div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {formatCurrency(metrics.summary.totalStockValue)}
          </div>
          <div className="text-xs text-slate-500 mt-1 tabular-nums">
            Cost basis: {formatCurrency(metrics.summary.totalCostValue)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-2">
            <span>Low-Stock Count</span>
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-amber-700 tabular-nums">
            {metrics.summary.lowStockCount}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            At or below reorder threshold
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-2">
            <span>Out-of-Stock Count</span>
            <XCircle className="w-4 h-4 text-red-600" />
          </div>
          <div className="text-2xl font-bold text-red-600 tabular-nums">
            {metrics.summary.outOfStockCount}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Zero units currently available
          </div>
        </div>
      </div>

      {/* 2. Stock Movement Chart (Stock In vs Stock Out) */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Stock Movement Trends (Stock In vs. Stock Out)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Daily unit volume across {toDateInputValue(startDate)} to{' '}
              {toDateInputValue(endDate)}
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-semibold shrink-0">
            <div className="flex items-center gap-1.5 text-slate-700">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#0F2942]" />
              <span className="tabular-nums">
                Stock In (+{metrics.summary.totalInUnits.toLocaleString()})
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-700">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#047857]" />
              <span className="tabular-nums">
                Stock Out (-{metrics.summary.totalOutUnits.toLocaleString()})
              </span>
            </div>
          </div>
        </div>

        <div className="h-56 flex items-end gap-1.5 pt-6 pb-2 border-b border-slate-100 overflow-x-auto">
          {chartBars.map((bar, idx) => {
            const inH =
              bar.inQty === 0
                ? 3
                : Math.max(6, Math.round((bar.inQty / maxChartBar) * 165));
            const outH =
              bar.outQty === 0
                ? 3
                : Math.max(6, Math.round((bar.outQty / maxChartBar) * 165));
            const showLabel =
              chartBars.length <= 12 ||
              idx === 0 ||
              idx === chartBars.length - 1 ||
              idx % Math.ceil(chartBars.length / 8) === 0;

            return (
              <div
                key={bar.key}
                className="flex-1 min-w-[14px] flex flex-col items-center gap-2 group"
              >
                <div className="flex items-end gap-0.5 h-[170px]">
                  <div
                    title={`${bar.label} — Stock In: +${bar.inQty} units`}
                    style={{ height: `${inH}px` }}
                    className={`w-2 sm:w-3 rounded-t transition-all ${
                      bar.inQty > 0 ? 'bg-[#0F2942]' : 'bg-slate-200'
                    }`}
                  />
                  <div
                    title={`${bar.label} — Stock Out: -${bar.outQty} units`}
                    style={{ height: `${outH}px` }}
                    className={`w-2 sm:w-3 rounded-t transition-all ${
                      bar.outQty > 0 ? 'bg-[#047857]' : 'bg-slate-200'
                    }`}
                  />
                </div>
                <span className="text-[10px] font-medium text-slate-400 whitespace-nowrap">
                  {showLabel ? bar.label : ''}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Stock by Category Breakdown */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Stock Valuation &amp; Units by Category
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Asset concentration across active product categories
            </p>
          </div>
          <span className="text-sm font-bold text-slate-900 tabular-nums">
            {formatCurrency(metrics.summary.totalStockValue)} Total
          </span>
        </div>

        {metrics.categoryBreakdown.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">
            No products available to categorize.
          </div>
        ) : (
          <>
            {/* Stacked Percentage Bar */}
            <div>
              <div className="h-3.5 w-full rounded-full overflow-hidden flex bg-slate-100">
                {metrics.categoryBreakdown.map((cat) => (
                  <div
                    key={cat.category}
                    title={`${cat.category}: ${formatCurrency(cat.retailValue)} (${cat.sharePct}%)`}
                    style={{
                      width: `${Math.max(cat.sharePct, cat.retailValue > 0 ? 3 : 0)}%`,
                      backgroundColor: cat.color,
                    }}
                    className="h-full border-r border-white last:border-r-0"
                  />
                ))}
              </div>
              <div className="flex justify-between text-[11px] text-slate-400 mt-1.5 tabular-nums">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </div>

            {/* Category Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {metrics.categoryBreakdown.map((cat) => (
                <div
                  key={cat.category}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1.5"
                >
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                    <span
                      className="w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span className="truncate">{cat.category}</span>
                  </div>
                  <div className="text-lg font-bold text-slate-900 tabular-nums">
                    {formatCurrency(cat.retailValue)}
                  </div>
                  <div className="text-[11px] text-slate-500 tabular-nums">
                    {cat.sharePct}% share · {cat.totalUnits.toLocaleString()} units ·{' '}
                    {cat.skuCount} SKUs
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 4. Top 5 Fastest-Moving Products & No Movement in 30 Days */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top 5 Fastest-Moving */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Top 5 Fastest-Moving Products
              </h2>
              <p className="text-xs text-slate-500">
                Highest total units moved in selected date range
              </p>
            </div>
            <TrendingUp className="w-4 h-4 text-teal-700" />
          </div>

          {metrics.topFastMoving.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-lg">
              No stock movements recorded within this date range.
            </div>
          ) : (
            <div className="space-y-2.5">
              {metrics.topFastMoving.map((item, idx) => (
                <div
                  key={item.product.id}
                  className="p-3.5 rounded-xl border border-slate-200 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-7 h-7 rounded-lg bg-[#0F2942] text-white text-xs font-bold flex items-center justify-center shrink-0 tabular-nums">
                      0{idx + 1}
                    </span>
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onEditProduct(item.product)}
                        className="text-xs font-bold text-slate-900 hover:text-teal-700 truncate block text-left"
                      >
                        {item.product.name}
                      </button>
                      <div className="text-[11px] font-mono text-slate-500 tabular-nums">
                        {item.product.sku} · +{item.inboundUnits} in / -{item.outboundUnits} out
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0 tabular-nums">
                    <div className="text-xs font-bold text-slate-900">
                      {item.totalMoved} moved
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {item.product.quantity} on hand
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Products With No Movement in 30 Days */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                No Movement in 30 Days
              </h2>
              <p className="text-xs text-slate-500">
                Products with zero inbound or outbound transactions in the past 30 days
              </p>
            </div>
            <Layers className="w-4 h-4 text-slate-400" />
          </div>

          {metrics.noMovement30Days.length === 0 ? (
            <div className="py-10 text-center text-xs text-emerald-700 bg-emerald-50/50 border border-emerald-200 rounded-lg">
              Every product in this catalog has recorded stock activity within the last 30 days.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
              {metrics.noMovement30Days.map((item) => (
                <div
                  key={item.product.id}
                  className="p-3.5 rounded-xl border border-slate-200 bg-red-50/30 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => onEditProduct(item.product)}
                      className="text-xs font-bold text-slate-900 hover:text-teal-700 truncate block text-left"
                    >
                      {item.product.name}
                    </button>
                    <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                      {item.product.sku} ·{' '}
                      {item.lastMovementDate
                        ? `Last moved ${item.lastMovementDate.toLocaleDateString()}`
                        : 'Never moved'}
                    </div>
                  </div>
                  <div className="text-right shrink-0 tabular-nums">
                    <div className="text-xs font-bold text-slate-900">
                      {item.product.quantity} units
                    </div>
                    <div className="text-[11px] text-red-700 font-medium">
                      {formatCurrency(item.lockedValue)} idle
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 5. Low-Stock Products Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Low-Stock &amp; Reorder Audit Table
            </h2>
            <p className="text-xs text-slate-500">
              All products at or below their configured reorder threshold
            </p>
          </div>
          <span className="text-xs font-semibold text-slate-600 tabular-nums">
            {metrics.lowStockProducts.length} SKUs flagged
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold text-slate-500">
                <th className="py-3.5 px-4">Product &amp; SKU</th>
                <th className="py-3.5 px-4">Category</th>
                <th className="py-3.5 px-4">Supplier</th>
                <th className="py-3.5 px-4 text-right">Current Quantity</th>
                <th className="py-3.5 px-4 text-right">Reorder Level</th>
                <th className="py-3.5 px-4 text-right">Shortfall</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {metrics.lowStockProducts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-500">
                    All products are currently stocked above their reorder threshold.
                  </td>
                </tr>
              ) : (
                metrics.lowStockProducts.map((p) => {
                  const status = getStockStatus(p);
                  const deficit = Math.max(0, p.minStock - p.quantity);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900">{p.name}</div>
                        <div className="text-[11px] font-mono text-slate-500">
                          {p.sku}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-700">{p.category}</td>
                      <td className="py-3.5 px-4 text-slate-600">{p.supplier}</td>
                      <td
                        className={`py-3.5 px-4 text-right font-bold tabular-nums ${
                          status === 'out_of_stock' ? 'text-red-600' : 'text-amber-700'
                        }`}
                      >
                        {p.quantity} units
                      </td>
                      <td className="py-3.5 px-4 text-right text-slate-700 font-medium tabular-nums">
                        {p.minStock} units
                      </td>
                      <td className="py-3.5 px-4 text-right text-slate-600 tabular-nums">
                        {deficit > 0 ? `-${deficit} units` : 'At limit'}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-md font-semibold text-[11px] ${
                            status === 'out_of_stock'
                              ? 'bg-red-50 text-red-700'
                              : 'bg-amber-50 text-amber-800'
                          }`}
                        >
                          {status === 'out_of_stock' ? 'Out of Stock' : 'Low Stock'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onQuickRestock(p.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#047857] hover:bg-[#065F46] text-white text-[11px] font-semibold"
                        >
                          <ArrowDown className="w-3 h-3" />
                          <span>Restock</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
