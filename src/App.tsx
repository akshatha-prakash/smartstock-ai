import React, { useEffect, useMemo, useState } from 'react';
import { MailCheck, RefreshCw } from 'lucide-react';
import { AiAssistantView } from './components/AiAssistantView';
import { DashboardView } from './components/DashboardView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { InventoryView } from './components/InventoryView';
import { LoginView } from './components/LoginView';
import { LowStockAlertsView } from './components/LowStockAlertsView';
import { ProductFormView } from './components/ProductFormView';
import { ReportsView } from './components/ReportsView';
import { Sidebar } from './components/Sidebar';
import { StockTransactionsView } from './components/StockTransactionsView';
import { TopBar } from './components/TopBar';
import { supabase } from '../supabase/supabase';
import {
  ensureUserProfile,
  subscribeToProducts,
  subscribeToTransactions,
} from './services/inventoryService';
import {
  AppPage,
  getStockStatus,
  Product,
  StockTransaction,
  TransactionType,
  UserProfile,
} from './types/inventory';

interface AppUser {
  id: string;
  uid: string;
  email?: string;
  displayName?: string;
  photoURL?: string | null;
  emailVerified: boolean;
}

function adaptSupabaseUser(sbUser: any): AppUser | null {
  if (!sbUser) return null;
  const meta = sbUser.user_metadata || {};
  const isVerified = Boolean(
    sbUser.email_confirmed_at ||
    sbUser.confirmed_at ||
    meta.email_verified === true
  );
  return {
    id: sbUser.id,
    uid: sbUser.id,
    email: sbUser.email,
    displayName:
      meta.full_name ||
      meta.displayName ||
      sbUser.email?.split('@')[0] ||
      'Operations Lead',
    photoURL: meta.avatar_url || meta.picture || null,
    emailVerified: isVerified,
  };
}

function SmartStockWorkspace() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<AppUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [listenerError, setListenerError] = useState<Error | null>(null);

  const [currentPage, setCurrentPage] = useState<AppPage>('dashboard');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [stockPresetType, setStockPresetType] = useState<TransactionType>('in');
  const [stockPresetProductId, setStockPresetProductId] = useState<string | undefined>(
    undefined,
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  if (listenerError) {
    throw listenerError;
  }

  // Persistent login session and reactive auth changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(adaptSupabaseUser(session?.user));
      setAuthReady(true);
    }).catch(() => {
      setAuthReady(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(adaptSupabaseUser(session?.user));
      setAuthReady(true);
      if (!session?.user) {
        setProfile(null);
        setProducts([]);
        setTransactions([]);
        setDataLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authReady || !user || !user.emailVerified) {
      return;
    }

    let active = true;
    setDataLoading(true);

    ensureUserProfile(user)
      .then((userProfile) => {
        if (active) setProfile(userProfile);
      })
      .catch((err) => {
        if (active && err instanceof Error) setListenerError(err);
      });

    const unsubProducts = subscribeToProducts(
      user.uid,
      (items) => {
        if (active) {
          setProducts(items);
          setDataLoading(false);
        }
      },
      (err) => {
        if (active) setListenerError(err);
      },
    );

    const unsubTransactions = subscribeToTransactions(
      user.uid,
      (items) => {
        if (active) setTransactions(items);
      },
      (err) => {
        if (active) setListenerError(err);
      },
    );

    return () => {
      active = false;
      unsubProducts();
      unsubTransactions();
    };
  }, [authReady, user]);

  const lowStockCount = useMemo(
    () => products.filter((p) => getStockStatus(p) !== 'in_stock').length,
    [products],
  );

  const handleOpenStockPage = (type: TransactionType, productId?: string) => {
    setStockPresetType(type);
    setStockPresetProductId(productId);
    setCurrentPage('transactions');
  };

  const handleOpenAddProduct = () => {
    setEditingProduct(null);
    setCurrentPage('add-product');
  };

  const handleOpenEditProduct = (product: Product) => {
    setEditingProduct(product);
    setCurrentPage('edit-product');
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (value.trim() && currentPage !== 'inventory') {
      setCurrentPage('inventory');
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setProducts([]);
    setTransactions([]);
    setCurrentPage('dashboard');
    setSearchQuery('');
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 rounded-xl bg-[#0F2942] mx-auto animate-pulse" />
          <p className="text-xs font-medium text-slate-500">
            Initializing SmartStock AI...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginView />;
  }

  if (!user.emailVerified) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-sm space-y-4">
          <div className="w-12 h-12 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center mx-auto">
            <MailCheck className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Verify your email address</h1>
          <p className="text-sm text-slate-600">
            We sent a verification link to <strong>{user.email}</strong>. Please confirm your email before accessing inventory records.
          </p>
          {verificationSent && (
            <p className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
              Verification email re-sent. Check your inbox or spam folder.
            </p>
          )}
          <div className="flex flex-col gap-2.5 pt-2">
            <button
              type="button"
              onClick={async () => {
                const { data } = await supabase.auth.getUser();
                if (data?.user) {
                  setUser(adaptSupabaseUser(data.user));
                }
              }}
              className="w-full py-2.5 px-4 rounded-lg bg-[#0F2942] hover:bg-[#173A5E] text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>I&apos;ve Verified — Continue</span>
            </button>
            <button
              type="button"
              onClick={async () => {
                if (user.email) {
                  await supabase.auth.resend({
                    type: 'signup',
                    email: user.email,
                  });
                  setVerificationSent(true);
                }
              }}
              className="w-full py-2.5 px-4 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
            >
              Resend Verification Email
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 pt-1 cursor-pointer"
            >
              Sign out &amp; use another account
            </button>
          </div>
        </div>
      </div>
    );
  }

  const displayName =
    profile?.displayName ||
    user.displayName ||
    user.email?.split('@')[0] ||
    'Operations Lead';
  const roleLabel = profile?.roleLabel || 'Store Ops Lead';
  const facilityName = profile?.facilityName || 'Apex Retail Outlet';

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex">
      <Sidebar
        currentPage={currentPage}
        onNavigate={(page) => {
          setEditingProduct(null);
          setCurrentPage(page);
        }}
        lowStockCount={lowStockCount}
        facilityName={facilityName}
        onSignOut={handleSignOut}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          onQuickStockIn={() => handleOpenStockPage('in')}
          onQuickStockOut={() => handleOpenStockPage('out')}
          onAddProduct={handleOpenAddProduct}
          onNavigate={(page) => setCurrentPage(page)}
          lowStockCount={lowStockCount}
          userName={displayName}
          userRole={roleLabel}
          userPhotoUrl={user.photoURL}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        />

        <main className="flex-1">
          {currentPage === 'dashboard' && (
            <DashboardView
              uid={user.uid}
              products={products}
              transactions={transactions}
              loading={dataLoading}
              onNavigate={(page) =>
                page === 'add-product' ? handleOpenAddProduct() : setCurrentPage(page)
              }
              onOpenStockPage={handleOpenStockPage}
              onEditProduct={handleOpenEditProduct}
            />
          )}

          {currentPage === 'inventory' && (
            <InventoryView
              uid={user.uid}
              products={products}
              loading={dataLoading}
              globalSearch={searchQuery}
              onGlobalSearchChange={setSearchQuery}
              onAddProduct={handleOpenAddProduct}
              onEditProduct={handleOpenEditProduct}
              onQuickStockAction={(type, productId) => handleOpenStockPage(type, productId)}
            />
          )}

          {(currentPage === 'add-product' || currentPage === 'edit-product') && (
            <ProductFormView
              key={editingProduct ? editingProduct.id : 'new-product'}
              uid={user.uid}
              product={currentPage === 'edit-product' ? editingProduct : null}
              onCancel={() => {
                setEditingProduct(null);
                setCurrentPage('inventory');
              }}
              onSaved={() => {
                setEditingProduct(null);
                setCurrentPage('inventory');
              }}
              onOpenStockMovement={(productId) => handleOpenStockPage('in', productId)}
            />
          )}

          {currentPage === 'transactions' && (
            <StockTransactionsView
              uid={user.uid}
              products={products}
              transactions={transactions}
              initialType={stockPresetType}
              initialProductId={stockPresetProductId}
            />
          )}

          {currentPage === 'alerts' && (
            <LowStockAlertsView
              products={products}
              onQuickRestock={(productId) => handleOpenStockPage('in', productId)}
              onEditProduct={handleOpenEditProduct}
            />
          )}

          {currentPage === 'reports' && (
            <ReportsView
              products={products}
              transactions={transactions}
              onQuickRestock={(productId) => handleOpenStockPage('in', productId)}
              onEditProduct={handleOpenEditProduct}
            />
          )}

          {currentPage === 'assistant' && (
            <AiAssistantView
              userName={displayName}
              products={products}
              transactions={transactions}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <SmartStockWorkspace />
    </ErrorBoundary>
  );
}
