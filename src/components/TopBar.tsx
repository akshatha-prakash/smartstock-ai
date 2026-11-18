import React from 'react';
import {
  ArrowDown,
  ArrowUp,
  Bell,
  Menu,
  Plus,
  Search,
} from 'lucide-react';
import { AppPage } from '../types/inventory';

interface TopBarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onQuickStockIn: () => void;
  onQuickStockOut: () => void;
  onAddProduct: () => void;
  onNavigate: (page: AppPage) => void;
  lowStockCount: number;
  userName: string;
  userRole: string;
  userPhotoUrl?: string | null;
  onOpenMobileMenu: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  searchQuery,
  onSearchChange,
  onQuickStockIn,
  onQuickStockOut,
  onAddProduct,
  onNavigate,
  lowStockCount,
  userName,
  userRole,
  userPhotoUrl,
  onOpenMobileMenu,
}) => {
  const initials = userName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || 'OP';

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 lg:px-6 flex items-center justify-between gap-4 sticky top-0 z-30">
      {/* Left: Mobile Menu + Global Search */}
      <div className="flex items-center gap-3 flex-1 max-w-md">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Open navigation menu"
          className="lg:hidden p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search SKU, product name, supplier..."
            className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-colors"
          />
        </div>
      </div>

      {/* Right: Quick Action Buttons + Alerts + Profile */}
      <div className="flex items-center gap-2.5 shrink-0">
        <button
          type="button"
          onClick={onQuickStockIn}
          className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#047857] hover:bg-[#065F46] text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
        >
          <ArrowDown className="w-3.5 h-3.5" />
          <span>+ Stock In</span>
        </button>

        <button
          type="button"
          onClick={onQuickStockOut}
          className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#EFF6FF] hover:bg-blue-100 text-[#0F2942] border border-blue-100 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
        >
          <ArrowUp className="w-3.5 h-3.5" />
          <span>- Stock Out</span>
        </button>

        <button
          type="button"
          onClick={onAddProduct}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#0F2942] hover:bg-[#173A5E] text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Product</span>
        </button>

        <div className="h-6 w-px bg-slate-200 mx-1 hidden md:block" />

        <button
          type="button"
          onClick={() => onNavigate('alerts')}
          aria-label="View low stock alerts"
          className="relative p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
        >
          <Bell className="w-4 h-4" />
          {lowStockCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
              {lowStockCount}
            </span>
          )}
        </button>

        <div className="hidden md:flex items-center gap-2.5 pl-1 shrink-0">
          {userPhotoUrl ? (
            <img
              src={userPhotoUrl}
              alt={userName}
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded-full object-cover border border-slate-200"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-[#0F2942] text-white text-xs font-bold flex items-center justify-center">
              {initials}
            </div>
          )}
          <div className="leading-tight">
            <div className="text-xs font-semibold text-slate-900 whitespace-nowrap">
              {userName}
            </div>
            <div className="text-[11px] text-slate-500 whitespace-nowrap">{userRole}</div>
          </div>
        </div>
      </div>
    </header>
  );
};
