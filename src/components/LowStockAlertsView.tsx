import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  CheckCircle2,
  Edit3,
  Package,
  XCircle,
} from 'lucide-react';
import { getStockStatus, Product } from '../types/inventory';
import { getProductImageSrc } from '../utils/productImages';

interface LowStockAlertsViewProps {
  products: Product[];
  onQuickRestock: (productId: string) => void;
  onEditProduct: (product: Product) => void;
}

export const LowStockAlertsView: React.FC<LowStockAlertsViewProps> = ({
  products,
  onQuickRestock,
  onEditProduct,
}) => {
  const [filter, setFilter] = useState<'all' | 'out_of_stock' | 'low_stock'>('all');

  const alertProducts = useMemo(() => {
    return products
      .filter((p) => getStockStatus(p) !== 'in_stock')
      .sort((a, b) => a.quantity - b.quantity);
  }, [products]);

  const outCount = useMemo(
    () => alertProducts.filter((p) => p.quantity <= 0).length,
    [alertProducts],
  );
  const lowCount = alertProducts.length - outCount;

  const visibleProducts = useMemo(() => {
    if (filter === 'out_of_stock') {
      return alertProducts.filter((p) => p.quantity <= 0);
    }
    if (filter === 'low_stock') {
      return alertProducts.filter((p) => p.quantity > 0);
    }
    return alertProducts;
  }, [alertProducts, filter]);

  const estimatedRestockCost = useMemo(() => {
    return alertProducts.reduce((sum, p) => {
      const needed = Math.max(0, p.minStock * 2 - p.quantity);
      return sum + needed * p.purchasePrice;
    }, 0);
  }, [alertProducts]);

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1440px] mx-auto">
      <div>
        <div className="text-xs font-semibold text-teal-700 mb-1">
          Threshold Monitor · Apex Retail Outlet
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Low Stock Alerts & Replenishment Queue
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Products whose available physical quantity has reached or fallen below their minimum safety threshold
        </p>
      </div>

      {/* 3 Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-red-700 mb-2">
            <span>Immediate Out of Stock</span>
            <XCircle className="w-4 h-4 text-red-600" />
          </div>
          <div className="text-3xl font-bold text-slate-900 tabular-nums">{outCount}</div>
          <p className="text-xs text-slate-500 mt-1">Zero units available on shelf</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-amber-800 mb-2">
            <span>Low Stock Warnings</span>
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-3xl font-bold text-slate-900 tabular-nums">{lowCount}</div>
          <p className="text-xs text-slate-500 mt-1">At or below minimum stock threshold</p>
        </div>

        <div className="bg-[#0F2942] text-white rounded-xl p-5">
          <div className="text-xs font-semibold text-teal-300 mb-2">
            Estimated Replenishment Cost
          </div>
          <div className="text-3xl font-bold tabular-nums">
            {estimatedRestockCost.toLocaleString('en-US', {
              style: 'currency',
              currency: 'USD',
            })}
          </div>
          <p className="text-xs text-slate-300 mt-1">
            To restore all {alertProducts.length} SKUs to 2× safety buffer
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 p-1 bg-white border border-slate-200 rounded-lg w-fit">
        {(
          [
            { id: 'all', label: `All Alerts (${alertProducts.length})` },
            { id: 'out_of_stock', label: `Out of Stock (${outCount})` },
            { id: 'low_stock', label: `Low Stock (${lowCount})` },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap tabular-nums ${
              filter === tab.id
                ? 'bg-[#0F2942] text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Queue List */}
      <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
        {visibleProducts.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-slate-900">
              No active stock alerts
            </h3>
            <p className="text-sm text-slate-500 mt-1">
              All products in this view are stocked above their configured minimum safety level.
            </p>
          </div>
        ) : (
          visibleProducts.map((product) => {
            const isOut = product.quantity <= 0;
            const suggestedOrder = Math.max(10, product.minStock * 2 - product.quantity);
            const ratioPct =
              product.minStock > 0
                ? Math.min(100, Math.round((product.quantity / product.minStock) * 100))
                : 0;
            const imgSrc = getProductImageSrc(product.imageKey);

            return (
              <div
                key={product.id}
                className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="flex items-center gap-4 min-w-0">
                  {imgSrc ? (
                    <img
                      src={imgSrc}
                      alt={product.name}
                      referrerPolicy="no-referrer"
                      className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 shrink-0">
                      <Package className="w-5 h-5" />
                    </div>
                  )}

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-900 truncate">
                        {product.name}
                      </h3>
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                          isOut
                            ? 'bg-red-50 text-red-700'
                            : 'bg-amber-50 text-amber-800'
                        }`}
                      >
                        {isOut ? 'Out of Stock' : 'Low Stock'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 font-mono">
                      SKU: {product.sku} · {product.category} · Vendor: {product.supplier}
                    </div>
                  </div>
                </div>

                {/* Stock vs Threshold Gauge */}
                <div className="flex-1 max-w-xs">
                  <div className="flex items-center justify-between text-xs mb-1.5 tabular-nums">
                    <span className={isOut ? 'font-bold text-red-600' : 'font-bold text-amber-700'}>
                      {product.quantity} in stock
                    </span>
                    <span className="text-slate-500">
                      Min: {product.minStock} · Suggested +{suggestedOrder}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      style={{ width: `${ratioPct}%` }}
                      className={`h-full rounded-full ${
                        isOut ? 'bg-red-600' : 'bg-amber-500'
                      }`}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onEditProduct(product)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit Threshold</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onQuickRestock(product.id)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#047857] hover:bg-[#065F46] text-white text-xs font-semibold"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                    <span>Restock Now</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
