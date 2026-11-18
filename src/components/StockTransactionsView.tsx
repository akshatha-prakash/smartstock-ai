import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  CheckCircle2,
  Download,
  Package,
  Search,
} from 'lucide-react';
import { recordStockMovement } from '../services/inventoryService';
import {
  getStockStatus,
  Product,
  StockTransaction,
  TransactionType,
} from '../types/inventory';

interface StockTransactionsViewProps {
  uid: string;
  products: Product[];
  transactions: StockTransaction[];
  initialType: TransactionType;
  initialProductId?: string;
}

const IN_REASONS = [
  'Purchase Order Delivery (Inbound Intake)',
  'Customer Return to Stock',
  'Warehouse Cycle Count Gain',
  'Opening Stock Balance',
];

const OUT_REASONS = [
  'POS / Retail Customer Sale',
  'B2B Dispatch Order',
  'Damaged / Scrap Write-off',
  'Warehouse Audit Shrinkage',
];

export const StockTransactionsView: React.FC<StockTransactionsViewProps> = ({
  uid,
  products,
  transactions,
  initialType,
  initialProductId,
}) => {
  const [movementType, setMovementType] = useState<TransactionType>(initialType);
  const [productId, setProductId] = useState<string>(initialProductId || '');
  const [quantity, setQuantity] = useState<number>(10);
  const [reason, setReason] = useState<string>(
    initialType === 'in' ? IN_REASONS[0] : OUT_REASONS[0],
  );
  const [reference, setReference] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    kind: 'success' | 'error';
    text: string;
  } | null>(null);

  // History filters
  const [historyTab, setHistoryTab] = useState<'all' | 'in' | 'out'>('all');
  const [historySearch, setHistorySearch] = useState('');

  useEffect(() => {
    setMovementType(initialType);
    setReason(initialType === 'in' ? IN_REASONS[0] : OUT_REASONS[0]);
  }, [initialType]);

  useEffect(() => {
    if (initialProductId) {
      setProductId(initialProductId);
    }
  }, [initialProductId]);

  const selectedProduct = useMemo(() => {
    if (productId) {
      return products.find((p) => p.id === productId) ?? products[0] ?? null;
    }
    return products[0] ?? null;
  }, [products, productId]);

  const currentBalance = selectedProduct?.quantity ?? 0;
  const deltaQty = Math.max(0, Math.round(quantity) || 0);
  const projectedBalance =
    movementType === 'in' ? currentBalance + deltaQty : currentBalance - deltaQty;
  const isInvalidNegative = movementType === 'out' && projectedBalance < 0;

  const summary = useMemo(() => {
    let inboundUnits = 0;
    let inboundCount = 0;
    let outboundUnits = 0;
    let outboundCount = 0;

    for (const tx of transactions) {
      if (tx.type === 'in') {
        inboundUnits += tx.quantity;
        inboundCount += 1;
      } else {
        outboundUnits += tx.quantity;
        outboundCount += 1;
      }
    }

    const lowStockSkus = products.filter((p) => getStockStatus(p) !== 'in_stock').length;

    return {
      inboundUnits,
      inboundCount,
      outboundUnits,
      outboundCount,
      netDelta: inboundUnits - outboundUnits,
      lowStockSkus,
    };
  }, [transactions, products]);

  const filteredTransactions = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (historyTab !== 'all' && tx.type !== historyTab) return false;
      if (q) {
        const match =
          tx.productName.toLowerCase().includes(q) ||
          tx.sku.toLowerCase().includes(q) ||
          tx.reason.toLowerCase().includes(q) ||
          (tx.reference ?? '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [transactions, historyTab, historySearch]);

  const handleModeChange = (nextType: TransactionType) => {
    setMovementType(nextType);
    setReason(nextType === 'in' ? IN_REASONS[0] : OUT_REASONS[0]);
    setFeedback(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || deltaQty <= 0 || isInvalidNegative) return;
    setFeedback(null);
    setSubmitting(true);
    try {
      const nextStock = await recordStockMovement(uid, {
        productId: selectedProduct.id,
        type: movementType,
        quantity: deltaQty,
        reason,
        reference,
        notes,
      });
      setFeedback({
        kind: 'success',
        text: `Committed ${movementType === 'in' ? '+' : '-'}${deltaQty} units for ${selectedProduct.name}. New balance: ${nextStock} units.`,
      });
      setReference('');
      setNotes('');
    } catch (err) {
      setFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Unable to post movement.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleExportCsv = () => {
    const headers = [
      'Transaction ID',
      'Date & Time',
      'Product Name',
      'SKU',
      'Type',
      'Quantity Changed',
      'Previous Stock',
      'Remaining Stock',
      'Reason',
      'Reference',
    ];
    const rows = filteredTransactions.map((tx) => [
      tx.id,
      tx.createdAt?.toDate ? tx.createdAt.toDate().toISOString() : '',
      `"${tx.productName.replace(/"/g, '""')}"`,
      tx.sku,
      tx.type === 'in' ? 'Stock In' : 'Stock Out',
      tx.type === 'in' ? `+${tx.quantity}` : `-${tx.quantity}`,
      String(tx.previousStock),
      String(tx.resultingStock),
      `"${tx.reason.replace(/"/g, '""')}"`,
      `"${(tx.reference ?? '').replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'smartstock-ledger-audit.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatTimestamp = (ts: StockTransaction['createdAt']) => {
    if (!ts?.toDate) return 'Pending...';
    return ts.toDate().toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1440px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold text-teal-700 mb-1">
            Facility Ledger & Audit Trail
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Stock Movement & Inventory Adjustments
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Execute atomic stock receipts, sales dispatches, and review immutable stock ledger records
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportCsv}
          disabled={filteredTransactions.length === 0}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 disabled:opacity-50 self-start sm:self-auto whitespace-nowrap"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export Audit CSV</span>
        </button>
      </div>

      {/* 4 KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-2">
            <span>Inbound Intake</span>
            <ArrowDown className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            +{summary.inboundUnits.toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 mt-1 tabular-nums">
            {summary.inboundCount} stock-in receipts logged
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-2">
            <span>Outbound / Sales</span>
            <ArrowUp className="w-4 h-4 text-[#0F2942]" />
          </div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            -{summary.outboundUnits.toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 mt-1 tabular-nums">
            {summary.outboundCount} dispatch & sale entries
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-2">
            <span>Net Movement Delta</span>
            <Package className="w-4 h-4 text-teal-700" />
          </div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {summary.netDelta >= 0 ? `+${summary.netDelta}` : summary.netDelta}
          </div>
          <div className="text-xs text-slate-500 mt-1">Net units across ledger</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-2">
            <span>Low Stock Watch</span>
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {summary.lowStockSkus} SKUs
          </div>
          <div className="text-xs text-slate-500 mt-1">At or below safety threshold</div>
        </div>
      </div>

      {/* Fast Dual-Mode Movement Terminal */}
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-100 text-[#0F2942] flex items-center justify-center shrink-0">
              <ArrowUpRight className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Fast Dual-Mode Movement Terminal
              </h2>
              <p className="text-xs text-slate-500">
                Direct atomic write into product stock & transaction ledger
              </p>
            </div>
          </div>

          {/* Mode Toggle */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg self-start md:self-auto">
            <button
              type="button"
              onClick={() => handleModeChange('in')}
              className={`px-3.5 py-2 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
                movementType === 'in'
                  ? 'bg-[#047857] text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ArrowDown className="w-3.5 h-3.5" />
              <span>Stock In (Receive Goods)</span>
            </button>
            <button
              type="button"
              onClick={() => handleModeChange('out')}
              className={`px-3.5 py-2 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
                movementType === 'out'
                  ? 'bg-[#0F2942] text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ArrowUp className="w-3.5 h-3.5" />
              <span>Stock Out (Dispatch / Sales)</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Product & SKU <span className="text-red-600">*</span>
            </label>
            <select
              value={selectedProduct?.id ?? ''}
              onChange={(e) => {
                setProductId(e.target.value);
                setFeedback(null);
              }}
              disabled={products.length === 0}
              className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
            >
              {products.length === 0 ? (
                <option value="">No products available — add one first</option>
              ) : (
                products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku}) — {p.quantity} in stock
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Adjustment Quantity <span className="text-red-600">*</span>
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                className="w-full px-3.5 py-2.5 text-sm font-bold tabular-nums rounded-lg border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
              />
              {[5, 10, 50, 100].map((inc) => (
                <button
                  key={inc}
                  type="button"
                  onClick={() => setQuantity((q) => (Number(q) || 0) + inc)}
                  className="px-2.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 tabular-nums shrink-0"
                >
                  +{inc}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Transaction Classification Reason <span className="text-red-600">*</span>
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
            >
              {(movementType === 'in' ? IN_REASONS : OUT_REASONS).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Reference / PO #
            </label>
            <input
              type="text"
              maxLength={60}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g., PO-2026-9912 or INV-1042"
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Handling Notes & Dock Bay
            </label>
            <input
              type="text"
              maxLength={300}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Pallet inspected, packaging intact"
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
            />
          </div>
        </div>

        {/* Ledger Pre-Check Validation Bar */}
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-slate-600">Ledger Pre-Check Validation:</span>
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                  !selectedProduct
                    ? 'bg-slate-200 text-slate-700'
                    : isInvalidNegative
                      ? 'bg-red-100 text-red-700'
                      : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {!selectedProduct
                  ? 'Select Product'
                  : isInvalidNegative
                    ? 'Insufficient Stock'
                    : 'Valid & Reconciled'}
              </span>
            </div>

            {selectedProduct && (
              <div className="text-sm text-slate-700 tabular-nums">
                Current Balance: <strong className="text-slate-900">{currentBalance} units</strong>{' '}
                <span className="mx-1.5 text-slate-400">→</span>
                <strong
                  className={
                    isInvalidNegative
                      ? 'text-red-600'
                      : movementType === 'in'
                        ? 'text-emerald-700'
                        : 'text-[#0F2942]'
                  }
                >
                  Updated Stock: {projectedBalance} units
                </strong>{' '}
                <span className="text-xs text-slate-500">
                  ({movementType === 'in' ? `+${deltaQty}` : `-${deltaQty}`} units shift)
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setQuantity(10);
                setReference('');
                setNotes('');
                setFeedback(null);
              }}
              className="px-4 py-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
            >
              Reset
            </button>
            <button
              type="submit"
              disabled={submitting || !selectedProduct || deltaQty <= 0 || isInvalidNegative}
              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-white text-xs font-semibold transition-colors disabled:opacity-50 whitespace-nowrap ${
                movementType === 'in'
                  ? 'bg-[#047857] hover:bg-[#065F46]'
                  : 'bg-[#0F2942] hover:bg-[#173A5E]'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{submitting ? 'Posting...' : 'Confirm & Post Movement'}</span>
            </button>
          </div>
        </div>

        {feedback && (
          <div
            className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
              feedback.kind === 'success'
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                : 'bg-red-50 border border-red-200 text-red-700'
            }`}
          >
            {feedback.kind === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}
      </form>

      {/* Transactions History Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
            {(
              [
                { id: 'all', label: `All Transactions (${transactions.length})` },
                { id: 'in', label: `Stock In (${summary.inboundCount})` },
                { id: 'out', label: `Stock Out (${summary.outboundCount})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setHistoryTab(tab.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap tabular-nums ${
                  historyTab === tab.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder="Filter by SKU, product, reference..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold text-slate-500">
                <th className="py-3.5 px-4">Transaction ID</th>
                <th className="py-3.5 px-4">Date & Time</th>
                <th className="py-3.5 px-4">Product Details & SKU</th>
                <th className="py-3.5 px-4">Movement Type</th>
                <th className="py-3.5 px-4 text-right">Quantity Changed</th>
                <th className="py-3.5 px-4 text-right">Remaining Stock</th>
                <th className="py-3.5 px-4">Reference & Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">
                    No stock movement entries found.
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-semibold text-slate-700 whitespace-nowrap">
                      #{tx.id.slice(0, 8).toUpperCase()}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap tabular-nums">
                      {formatTimestamp(tx.createdAt)}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900">{tx.productName}</div>
                      <div className="text-[11px] font-mono text-slate-500">
                        SKU: {tx.sku}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-md font-semibold text-[11px] ${
                          tx.type === 'in'
                            ? 'bg-emerald-50 text-emerald-800'
                            : 'bg-slate-100 text-slate-800'
                        }`}
                      >
                        {tx.type === 'in' ? '+ Stock In' : '- Stock Out'}
                      </span>
                    </td>
                    <td
                      className={`py-3.5 px-4 text-right font-bold tabular-nums whitespace-nowrap ${
                        tx.type === 'in' ? 'text-emerald-700' : 'text-red-600'
                      }`}
                    >
                      {tx.type === 'in' ? `+${tx.quantity}` : `-${tx.quantity}`}
                    </td>
                    <td className="py-3.5 px-4 text-right font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                      {tx.resultingStock} units
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 max-w-[240px]">
                      <div className="font-medium text-slate-800 truncate">{tx.reason}</div>
                      {(tx.reference || tx.notes) && (
                        <div className="text-[11px] text-slate-500 truncate">
                          {[tx.reference, tx.notes].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
