import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  DollarSign,
  Info,
  MapPin,
  Minus,
  Package,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { createProduct, deleteProduct, updateProduct } from '../services/inventoryService';
import {
  getStockStatus,
  Product,
  PRODUCT_CATEGORIES,
  ProductCategory,
  UNIT_OPTIONS,
  VALIDATION_LIMITS,
} from '../types/inventory';
import { getProductImageSrc, PRODUCT_IMAGE_OPTIONS } from '../utils/productImages';

interface ProductFormViewProps {
  uid: string;
  product: Product | null;
  onCancel: () => void;
  onSaved: () => void;
  onOpenStockMovement: (productId: string) => void;
}

export const ProductFormView: React.FC<ProductFormViewProps> = ({
  uid,
  product,
  onCancel,
  onSaved,
  onOpenStockMovement,
}) => {
  const isEdit = Boolean(product);

  const [name, setName] = useState(product?.name ?? '');
  const [sku, setSku] = useState(product?.sku ?? '');
  const [barcode, setBarcode] = useState(product?.barcode ?? '');
  const [category, setCategory] = useState<ProductCategory>(
    product?.category ?? 'Peripherals',
  );
  const [supplier, setSupplier] = useState(product?.supplier ?? '');
  const [storageLocation, setStorageLocation] = useState(
    product?.storageLocation ?? 'Rack 01 · Bay A · Bin 01',
  );
  const [purchasePrice, setPurchasePrice] = useState<string>(
    product ? String(product.purchasePrice) : '',
  );
  const [sellingPrice, setSellingPrice] = useState<string>(
    product ? String(product.sellingPrice) : '',
  );
  const [quantity, setQuantity] = useState<number>(product?.quantity ?? 0);
  const [minStock, setMinStock] = useState<number>(product?.minStock ?? 10);
  const [unit, setUnit] = useState<string>(product?.unit ?? UNIT_OPTIONS[0]);
  const [description, setDescription] = useState<string>(product?.description ?? '');
  const [imageKey, setImageKey] = useState<string>(product?.imageKey ?? '');

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const parsedPurchase = Math.max(0, Number(purchasePrice) || 0);
  const parsedSelling = Math.max(0, Number(sellingPrice) || 0);
  const grossProfit = parsedSelling - parsedPurchase;
  const marginPct =
    parsedSelling > 0 ? ((grossProfit / parsedSelling) * 100).toFixed(1) : '0.0';

  const status = getStockStatus({ quantity, minStock });
  const deficit = Math.max(0, minStock - quantity);
  const previewImgSrc = getProductImageSrc(imageKey);

  const handleGenerateSku = () => {
    const prefixMap: Record<ProductCategory, string> = {
      Peripherals: 'TECH',
      Accessories: 'CAB',
      Electronics: 'ELEC',
      Packaging: 'PKG',
      'Office Furniture': 'FURN',
      Hardware: 'HRD',
    };
    const prefix = prefixMap[category] || 'SKU';
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    setSku(`${prefix}-${randomNum}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!name.trim()) {
      setErrorMsg('Product Name is required.');
      return;
    }
    if (!sku.trim()) {
      setErrorMsg('Product ID / SKU is required.');
      return;
    }
    if (!VALIDATION_LIMITS.SKU_PATTERN.test(sku.trim())) {
      setErrorMsg('SKU may only contain letters, numbers, hyphens, and underscores.');
      return;
    }
    if (!supplier.trim()) {
      setErrorMsg('Primary Supplier is required.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        sku: sku.trim().toUpperCase(),
        barcode: barcode.trim(),
        category,
        supplier: supplier.trim(),
        storageLocation: storageLocation.trim(),
        purchasePrice: parsedPurchase,
        sellingPrice: parsedSelling,
        quantity: Math.max(0, Math.round(quantity)),
        minStock: Math.max(0, Math.round(minStock)),
        unit,
        description: description.trim(),
        imageKey,
      };

      if (isEdit && product) {
        await updateProduct(uid, product, payload);
      } else {
        await createProduct(uid, payload);
      }
      onSaved();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save product.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!product) return;
    setDeleting(true);
    setErrorMsg(null);
    try {
      await deleteProduct(product.id);
      onSaved();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to delete product.');
      setDeleting(false);
    }
  };

  const lastActivityLabel = useMemo(() => {
    if (!product?.updatedAt?.toDate) return 'Just created';
    return product.updatedAt.toDate().toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [product]);

  return (
    <form onSubmit={handleSubmit} className="p-6 lg:p-8 max-w-[1360px] mx-auto space-y-6">
      {/* Breadcrumb & Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1.5">
            <span>Inventory</span>
            <ChevronRight className="w-3.5 h-3.5" />
            <span>Product Catalog</span>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="font-semibold text-slate-800">
              {isEdit ? `${product?.sku} · Edit Product` : 'Add New Product'}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {isEdit ? `Edit Product: ${product?.name}` : 'Add New Product'}
            </h1>
            {isEdit && (
              <span
                className={`px-2.5 py-0.5 rounded-md text-xs font-semibold ${
                  status === 'out_of_stock'
                    ? 'bg-red-50 text-red-700'
                    : status === 'low_stock'
                      ? 'bg-amber-50 text-amber-800'
                      : 'bg-emerald-50 text-emerald-800'
                }`}
              >
                {status === 'out_of_stock'
                  ? `Out of Stock (0 / ${minStock} min)`
                  : status === 'low_stock'
                    ? `Low Stock (${quantity} / ${minStock} min)`
                    : `In Stock (${quantity} units)`}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {isEdit
              ? 'Update product pricing, minimum reorder thresholds, supplier assignment, and inventory details.'
              : 'Create and register a new inventory item with stock thresholds and supplier pricing.'}
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 whitespace-nowrap"
          >
            {isEdit ? 'Discard Changes' : 'Cancel'}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0F2942] hover:bg-[#173A5E] text-white text-xs font-semibold disabled:opacity-60 whitespace-nowrap"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>
              {saving
                ? 'Saving...'
                : isEdit
                  ? 'Update Product'
                  : 'Save Product'}
            </span>
          </button>
        </div>
      </div>

      {!isEdit && (
        <div className="bg-white border border-slate-200 rounded-xl px-5 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-xs text-slate-600">
            <Info className="w-4 h-4 text-teal-700 shrink-0" />
            <span>
              <strong className="text-slate-900">Catalog Validation Active:</strong> Fields marked
              with <span className="text-red-600 font-semibold">*</span> are required before saving
              to Supabase.
            </span>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2.5 text-xs font-medium text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Main 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left 2/3 Form Sections */}
        <div className="lg:col-span-2 space-y-6">
          {/* Section 1: General Information */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-sm font-bold text-slate-900">
                1. General Information
              </h2>
              <span className="text-[11px] font-semibold text-slate-400">
                SKU Identity
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Product Name <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                maxLength={VALIDATION_LIMITS.NAME_MAX}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Logitech MX Master 3S Wireless Mouse"
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Product ID / SKU <span className="text-red-600">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    maxLength={VALIDATION_LIMITS.SKU_MAX}
                    value={sku}
                    onChange={(e) => setSku(e.target.value.toUpperCase())}
                    placeholder="E.G., TECH-3042"
                    className="w-full px-3.5 py-2.5 text-sm font-mono rounded-lg border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
                  />
                  {!isEdit && (
                    <button
                      type="button"
                      onClick={handleGenerateSku}
                      className="px-3 py-2.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#0F2942] text-xs font-semibold whitespace-nowrap shrink-0 transition-colors"
                    >
                      Generate SKU
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Barcode (UPC / EAN)
                </label>
                <input
                  type="text"
                  maxLength={VALIDATION_LIMITS.BARCODE_MAX}
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder="097855172280"
                  className="w-full px-3.5 py-2.5 text-sm font-mono rounded-lg border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Category <span className="text-red-600">*</span>
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ProductCategory)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
                >
                  {PRODUCT_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Primary Supplier <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  maxLength={VALIDATION_LIMITS.SUPPLIER_MAX}
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  placeholder="e.g., TechSupply Co."
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Warehouse Bin / Storage Location
              </label>
              <input
                type="text"
                maxLength={VALIDATION_LIMITS.STORAGE_MAX}
                value={storageLocation}
                onChange={(e) => setStorageLocation(e.target.value)}
                placeholder="Rack 03 · Bay B · Bin 14"
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
              />
            </div>
          </div>

          {/* Section 2: Pricing & Costing */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-sm font-bold text-slate-900">2. Pricing & Costing</h2>
              <span className="text-[11px] font-semibold text-teal-700">
                Live Margin Calculation
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Purchase Price (USD) <span className="text-red-600">*</span>
                </label>
                <div className="relative">
                  <DollarSign className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={purchasePrice}
                    onChange={(e) => setPurchasePrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-9 pr-3.5 py-2.5 text-sm font-semibold tabular-nums rounded-lg border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Landed acquisition unit cost from supplier
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Selling Price (MSRP USD) <span className="text-red-600">*</span>
                </label>
                <div className="relative">
                  <DollarSign className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={sellingPrice}
                    onChange={(e) => setSellingPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-9 pr-3.5 py-2.5 text-sm font-semibold tabular-nums rounded-lg border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Standard retail price visible in catalog
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold text-slate-500">
                  Real-Time Commercial Metrics
                </div>
                <div className="text-sm font-bold text-slate-900 tabular-nums mt-0.5">
                  Gross Profit: ${grossProfit.toFixed(2)}{' '}
                  <span className="text-teal-700 font-semibold">({marginPct}% Margin)</span>
                </div>
              </div>
              <span
                className={`px-2.5 py-1 rounded-md text-xs font-semibold ${
                  grossProfit > 0
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {grossProfit > 0 ? 'Positive Margin' : 'Awaiting Price Input'}
              </span>
            </div>
          </div>

          {/* Section 3: Stock & Inventory Rules */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-sm font-bold text-slate-900">
                3. Stock & Inventory Rules
              </h2>
              <span className="text-[11px] font-semibold text-slate-400">
                Threshold Rules
              </span>
            </div>

            {isEdit && status !== 'in_stock' && (
              <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-3 text-xs text-amber-900">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">
                    Needs Reorder: {deficit > 0 ? `${deficit} units to reach safety buffer` : 'At minimum threshold'}
                  </div>
                  <div className="text-amber-800 mt-0.5">
                    Current inventory ({quantity}) is at or below the minimum safety buffer ({minStock}).
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  {isEdit ? 'Available Physical Stock' : 'Initial Stock Quantity'}{' '}
                  <span className="text-red-600">*</span>
                </label>
                <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(0, q - 1))}
                    className="px-3 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border-r border-slate-200"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <input
                    type="number"
                    min="0"
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full text-center py-2.5 text-sm font-bold text-slate-900 tabular-nums focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => q + 1)}
                    className="px-3 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border-l border-slate-200"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  {isEdit ? 'Changes create an audit ledger entry' : 'Starting physical units'}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Minimum Stock Alert Level <span className="text-red-600">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  value={minStock}
                  onChange={(e) => setMinStock(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full px-3.5 py-2.5 text-sm font-semibold tabular-nums rounded-lg border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Triggers low-stock alert when stock ≤ threshold
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Unit of Measurement <span className="text-red-600">*</span>
                </label>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
                >
                  {UNIT_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">Base warehouse unit</p>
              </div>
            </div>
          </div>

          {/* Section 4: Description & Catalog Image */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-sm font-bold text-slate-900">
                4. Detailed Description & Product Visual
              </h2>
              <span className="text-[11px] text-slate-400 tabular-nums">
                {description.length} / {VALIDATION_LIMITS.DESCRIPTION_MAX} chars
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Catalog Description
              </label>
              <textarea
                rows={3}
                maxLength={VALIDATION_LIMITS.DESCRIPTION_MAX}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter detailed product specifications, model numbers, and handling instructions..."
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                Catalog Thumbnail Preset (Optional)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                <button
                  type="button"
                  onClick={() => setImageKey('')}
                  className={`p-2 rounded-lg border text-center text-xs font-medium transition-colors ${
                    imageKey === ''
                      ? 'border-teal-600 bg-teal-50 text-teal-800'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  <div className="w-full aspect-square rounded bg-slate-100 flex items-center justify-center mb-1.5">
                    <Package className="w-5 h-5 text-slate-400" />
                  </div>
                  Default Icon
                </button>
                {PRODUCT_IMAGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setImageKey(opt.key)}
                    className={`p-2 rounded-lg border text-center text-xs font-medium transition-colors ${
                      imageKey === opt.key
                        ? 'border-teal-600 bg-teal-50 text-teal-800'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <img
                      src={opt.src}
                      alt={opt.label}
                      referrerPolicy="no-referrer"
                      className="w-full aspect-square rounded object-cover mb-1.5 bg-slate-100"
                    />
                    <span className="block truncate">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right 1/3 Column: Live Preview & Audit Trail */}
        <div className="space-y-6">
          {/* SKU Quick Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
              <span>SKU Quick Card</span>
              <span className="font-mono">{sku || 'SKU: --'}</span>
            </div>

            <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center">
              {previewImgSrc ? (
                <img
                  src={previewImgSrc}
                  alt={name || 'Product Preview'}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-center p-4">
                  <Package className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <span className="text-xs text-slate-400">No thumbnail selected</span>
                </div>
              )}
              <div className="absolute bottom-2.5 left-2.5 px-2.5 py-1 rounded-md bg-slate-900/80 text-white text-[11px] font-semibold">
                {category}
              </div>
            </div>

            <div>
              <h3 className="text-base font-bold text-slate-900 truncate">
                {name.trim() || 'New Catalog Product'}
              </h3>
              <p className="text-xs text-slate-500 truncate mt-0.5">
                {supplier.trim() || 'No supplier assigned yet'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                <div className="text-[10px] font-semibold text-slate-500">Selling Price</div>
                <div className="text-base font-bold text-slate-900 tabular-nums mt-0.5">
                  ${parsedSelling.toFixed(2)}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                <div className="text-[10px] font-semibold text-slate-500">On Hand</div>
                <div className="text-base font-bold text-slate-900 tabular-nums mt-0.5">
                  {quantity} {unit.split(' ')[0]}
                </div>
              </div>
            </div>
          </div>

          {/* Metadata & Quick Stock Link (Edit mode) */}
          {isEdit && product && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3.5">
              <div className="text-[11px] font-semibold text-slate-500">
                Metadata & Audit Trail
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 flex items-start gap-2.5">
                <Clock className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <div className="text-slate-500">Last Activity</div>
                  <div className="font-semibold text-slate-900 mt-0.5">
                    {lastActivityLabel}
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <div className="text-slate-500">Assigned Storage</div>
                  <div className="font-semibold text-slate-900 mt-0.5">
                    {storageLocation || 'Main Warehouse'}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onOpenStockMovement(product.id)}
                className="w-full py-2.5 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-[#0F2942] flex items-center justify-center gap-2 transition-colors"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span>Adjust Stock via Stock In / Out</span>
              </button>
            </div>
          )}

          {!isEdit && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2.5 text-xs">
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <Sparkles className="w-4 h-4 text-teal-700" />
                <span>Threshold Protection</span>
              </div>
              <p className="text-slate-500 leading-relaxed">
                Whenever available stock drops to or below your Minimum Stock Alert Level, the item automatically appears in your Low Stock Alerts queue.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          {isEdit && product ? (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-red-700">
                  Delete {product.sku} permanently?
                </span>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={handleDelete}
                  className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
                >
                  {deleting ? 'Deleting...' : 'Confirm Delete'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-red-700"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete SKU · {product.sku}</span>
              </button>
            )
          ) : (
            <span className="text-xs text-slate-500">
              All changes are persisted directly to Supabase.
            </span>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0F2942] hover:bg-[#173A5E] text-white text-xs font-semibold disabled:opacity-60"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>
              {saving
                ? 'Saving...'
                : isEdit
                  ? 'Update Product'
                  : 'Save Product'}
            </span>
          </button>
        </div>
      </div>
    </form>
  );
};
