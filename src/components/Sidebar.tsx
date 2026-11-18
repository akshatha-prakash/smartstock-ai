import React from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  BarChart3,
  ClipboardList,
  LayoutGrid,
  LogOut,
  Sparkles,
  X,
} from 'lucide-react';
import { AppPage } from '../types/inventory';

interface SidebarProps {
  currentPage: AppPage;
  onNavigate: (page: AppPage) => void;
  lowStockCount: number;
  facilityName: string;
  onSignOut: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onNavigate,
  lowStockCount,
  facilityName,
  onSignOut,
  mobileOpen,
  onCloseMobile,
}) => {
  const navItems: {
    id: AppPage;
    label: string;
    icon: React.FC<{ className?: string }>;
    badge?: number;
    matchPages?: AppPage[];
  }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
    {
      id: 'inventory',
      label: 'Inventory Management',
      icon: ClipboardList,
      matchPages: ['inventory', 'add-product', 'edit-product'],
    },
    { id: 'transactions', label: 'Stock Transactions', icon: ArrowLeftRight },
    {
      id: 'alerts',
      label: 'Low Stock Alerts',
      icon: AlertTriangle,
      badge: lowStockCount,
    },
    { id: 'reports', label: 'Reports & Analytics', icon: BarChart3 },
    { id: 'assistant', label: 'AI Assistant', icon: Sparkles },
  ];

  const isActive = (item: (typeof navItems)[number]) => {
    if (item.matchPages) return item.matchPages.includes(currentPage);
    return currentPage === item.id;
  };

  const sidebarContent = (
    <aside className="w-[244px] h-full bg-[#0B2239] text-slate-200 flex flex-col justify-between select-none">
      <div>
        {/* Brand Header */}
        <div className="px-5 py-5 flex items-center justify-between border-b border-white/10">
          <button
            type="button"
            onClick={() => {
              onNavigate('dashboard');
              onCloseMobile();
            }}
            className="flex items-center gap-3 text-left"
          >
            <div className="w-9 h-9 rounded-lg bg-[#153656] border border-white/10 flex items-center justify-center shrink-0">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="w-5 h-5 text-[#2DD4BF]"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                <path d="m3.3 7 8.7 5 8.7-5" />
                <path d="M12 22V12" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-bold text-white leading-tight">SmartStock AI</div>
              <div className="text-[10px] font-semibold tracking-wider text-teal-300/90">
                Enterprise Ops
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={onCloseMobile}
            className="lg:hidden p-1 text-slate-400 hover:text-white"
            aria-label="Close navigation menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Links */}
        <div className="px-3 py-5">
          <div className="px-3 mb-2.5 text-[11px] font-semibold tracking-wider text-slate-400">
            Operations Hub
          </div>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onNavigate(item.id);
                    onCloseMobile();
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-[#17395B] text-white'
                      : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        active ? 'text-[#2DD4BF]' : 'text-slate-400'
                      }`}
                    />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="ml-2 px-1.5 py-0.5 min-w-[20px] text-center rounded-md bg-red-600 text-white text-[11px] font-semibold tabular-nums">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Bottom Facility Card & Sign Out */}
      <div className="p-4 border-t border-white/10 space-y-3">
        <div className="rounded-xl bg-[#112F4D] border border-white/10 p-3.5">
          <div className="text-[10px] font-semibold tracking-wider text-teal-300 mb-1">
            Active Facility
          </div>
          <div className="text-[13px] font-semibold text-white truncate">{facilityName}</div>
          <div className="text-[11px] text-slate-400">Main Branch · Pos #04</div>
        </div>

        <button
          type="button"
          onClick={onSignOut}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
        >
          <LogOut className="w-4 h-4 text-slate-400" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop persistent sidebar */}
      <div className="hidden lg:block shrink-0 h-screen sticky top-0">{sidebarContent}</div>

      {/* Mobile slide-over sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/50"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">{sidebarContent}</div>
        </div>
      )}
    </>
  );
};
