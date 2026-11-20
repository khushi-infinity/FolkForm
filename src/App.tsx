import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Sparkles, X } from 'lucide-react';
import { apiRequest, getStoredToken, setStoredToken } from './lib/api';
import { Navbar } from './components/Navbar';
import { HomePage } from './pages/HomePage';
import { MarketplacePage } from './pages/MarketplacePage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { SuppliersPage } from './pages/SuppliersPage';
import { SupplierOnboardingPage } from './pages/SupplierOnboardingPage';
import { AuthPage } from './pages/AuthPage';
import { BuyerDashboard } from './pages/BuyerDashboard';
import { SupplierDashboard } from './pages/SupplierDashboard';
import { AdminDashboard } from './pages/AdminDashboard';
import type { AuthUser } from './types';

function getCurrentLocation(): { pathname: string; search: string } {
  return {
    pathname: window.location.pathname || '/',
    search: window.location.search || '',
  };
}

export default function App() {
  const [loc, setLoc] = useState(getCurrentLocation);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [pendingAiPrompt, setPendingAiPrompt] = useState<string>('');
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4600);
    return () => window.clearTimeout(t);
  }, [toast]);

  const navigate = useCallback((path: string) => {
    const [pathname, query] = path.split('?');
    const search = query ? `?${query}` : '';
    window.history.pushState({}, '', `${pathname}${search}`);
    setLoc({ pathname: pathname || '/', search });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const handlePop = () => setLoc(getCurrentLocation());
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setAuthLoaded(true);
      return;
    }
    apiRequest<{ user: AuthUser }>('/auth/me')
      .then((res) => setUser(res.user))
      .catch(() => {
        setStoredToken(null);
        setUser(null);
      })
      .finally(() => setAuthLoaded(true));
  }, []);

  const handleDemoLogin = useCallback(
    async (role: 'buyer' | 'supplier' | 'admin', targetPath?: string) => {
      try {
        const res = await apiRequest<{ token: string; user: AuthUser }>('/auth/demo-login', {
          method: 'POST',
          body: { role },
        });
        setStoredToken(res.token);
        setUser(res.user);
        const defaultDest =
          role === 'admin'
            ? '/admin/overview'
            : role === 'supplier'
              ? '/supplier/overview'
              : '/buyer/overview';
        navigate(targetPath || defaultDest);
        showToast(`Signed into ${role.toUpperCase()} demo workspace (${res.user.fullName}).`);
      } catch (err: any) {
        showToast(err.message || 'Unable to sign in to demo account.');
      }
    },
    [navigate, showToast],
  );

  const handleLogout = useCallback(async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setStoredToken(null);
    setUser(null);
    navigate('/');
    showToast('Signed out of Folkform.');
  }, [navigate, showToast]);

  const handleLaunchAiPrompt = useCallback(
    async (prompt: string) => {
      setPendingAiPrompt(prompt);
      if (user?.role === 'buyer') {
        navigate('/buyer/ai-sourcing');
        return;
      }
      await handleDemoLogin('buyer', '/buyer/ai-sourcing');
    },
    [user, navigate, handleDemoLogin],
  );

  const { pathname, search } = loc;
  const isBuyerRoute = pathname.startsWith('/buyer');
  const isSupplierRoute = pathname.startsWith('/supplier/') || pathname === '/supplier';
  const isAdminRoute = pathname.startsWith('/admin');
  const isWorkspaceRoute = isBuyerRoute || isSupplierRoute || isAdminRoute;

  const renderContent = () => {
    if (!authLoaded && isWorkspaceRoute) {
      return (
        <div className="min-h-screen bg-[#F8F3E8] flex items-center justify-center text-sm text-[#7A5E4B]">
          Restoring Folkform workspace session…
        </div>
      );
    }

    // ------------------------------------------------------------------
    // ROLE-PROTECTED WORKSPACES
    // ------------------------------------------------------------------
    if (isBuyerRoute) {
      if (!user || (user.role !== 'buyer' && user.role !== 'admin')) {
        return (
          <AuthPage
            onAuthSuccess={(u) => setUser(u)}
            onNavigate={navigate}
            onToast={showToast}
          />
        );
      }
      const tab = pathname.split('/')[2] || 'overview';
      return (
        <BuyerDashboard
          user={user}
          tab={tab}
          initialAiPrompt={pendingAiPrompt}
          onNavigate={navigate}
          onDemoSwitch={(role) => handleDemoLogin(role)}
          onLogout={handleLogout}
          onToast={showToast}
        />
      );
    }

    if (isSupplierRoute) {
      if (!user || user.role !== 'supplier') {
        return (
          <AuthPage
            onAuthSuccess={(u) => setUser(u)}
            onNavigate={navigate}
            onToast={showToast}
          />
        );
      }
      const tab = pathname.split('/')[2] || 'overview';
      return (
        <SupplierDashboard
          user={user}
          tab={tab}
          onNavigate={navigate}
          onDemoSwitch={(role) => handleDemoLogin(role)}
          onUserUpdated={(u) => setUser(u)}
          onLogout={handleLogout}
          onToast={showToast}
        />
      );
    }

    if (isAdminRoute) {
      if (!user || user.role !== 'admin') {
        return (
          <AuthPage
            onAuthSuccess={(u) => setUser(u)}
            onNavigate={navigate}
            onToast={showToast}
          />
        );
      }
      const tab = pathname.split('/')[2] || 'overview';
      return (
        <AdminDashboard
          user={user}
          tab={tab}
          onNavigate={navigate}
          onDemoSwitch={(role) => handleDemoLogin(role)}
          onLogout={handleLogout}
          onToast={showToast}
        />
      );
    }

    // ------------------------------------------------------------------
    // PUBLIC PAGES
    // ------------------------------------------------------------------
    if (pathname === '/marketplace') {
      return (
        <MarketplacePage
          user={user}
          initialQuery={search}
          onNavigate={navigate}
          onToast={showToast}
        />
      );
    }

    if (pathname.startsWith('/products/')) {
      const productId = pathname.replace('/products/', '').split('/')[0];
      return (
        <ProductDetailPage
          productId={productId}
          user={user}
          onNavigate={navigate}
          onToast={showToast}
        />
      );
    }

    if (pathname === '/suppliers' || pathname.startsWith('/suppliers/')) {
      const supplierId = pathname.startsWith('/suppliers/')
        ? pathname.replace('/suppliers/', '').split('/')[0]
        : undefined;
      return (
        <SuppliersPage
          supplierId={supplierId}
          user={user}
          onNavigate={navigate}
          onToast={showToast}
        />
      );
    }

    if (pathname === '/onboard-supplier') {
      return (
        <SupplierOnboardingPage
          onAuthSuccess={(u) => setUser(u)}
          onNavigate={navigate}
          onToast={showToast}
        />
      );
    }

    if (pathname === '/auth') {
      return (
        <AuthPage
          onAuthSuccess={(u) => setUser(u)}
          onNavigate={navigate}
          onToast={showToast}
        />
      );
    }

    if (pathname === '/ai-preview') {
      return (
        <section className="max-w-4xl mx-auto px-6 py-20 space-y-8">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.18em] text-[#B05330] font-medium">
              Folkform Sourcing Intelligence · Multi-Agent Architecture
            </p>
            <h1 className="font-serif text-4xl sm:text-5xl font-semibold text-[#3A2319] leading-tight">
              Describe your bulk Indian craft requirement. Review ranked artisans before committing.
            </h1>
            <p className="text-base text-[#5C4537] leading-relaxed max-w-2xl">
              Our multi-agent pipeline extracts structured commercial specs, discovers regional
              workshops, verifies declared monthly capacity against lead times, estimates landed
              ranges, and waits for your explicit human approval before dispatching RFQs.
            </p>
          </div>

          <div className="bg-[#FFFCF6] border border-[#E9DCC7] p-6 sm:p-8 space-y-5">
            <label className="block text-xs uppercase tracking-[0.12em] text-[#7A5E4B]">
              Try a Flagship Hospitality Sourcing Brief
            </label>
            <textarea
              rows={3}
              value={
                pendingAiPrompt ||
                'I need 500 handcrafted ceramic table lamps from Rajasthan for a boutique hotel. My budget is ₹1,000 to ₹1,500 per unit. Delivery required within 30 days.'
              }
              onChange={(e) => setPendingAiPrompt(e.target.value)}
              className="w-full bg-[#F8F3E8] border border-[#E9DCC7] p-4 text-sm text-[#3A2319]"
            />
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-xs text-[#7A5E4B]">
                Launches Buyer Demo workspace with live multi-agent orchestration & transparent
                8-dimension scoring.
              </p>
              <button
                type="button"
                onClick={() =>
                  handleLaunchAiPrompt(
                    pendingAiPrompt ||
                      'I need 500 handcrafted ceramic table lamps from Rajasthan for a boutique hotel. My budget is ₹1,000 to ₹1,500 per unit. Delivery required within 30 days.',
                  )
                }
                className="px-6 py-3 bg-[#B05330] text-[#FFFCF6] text-xs font-medium uppercase tracking-[0.12em] hover:bg-[#974426] flex items-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                Run Sourcing Intelligence
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>
      );
    }

    return (
      <HomePage
        user={user}
        onNavigate={navigate}
        onLaunchAiPrompt={handleLaunchAiPrompt}
        onDemoLogin={(role) => handleDemoLogin(role)}
      />
    );
  };

  return (
    <div className="min-h-screen bg-[#F8F3E8] text-[#3A2319] flex flex-col">
      {!isWorkspaceRoute && <Navbar currentPath={pathname} user={user} onNavigate={navigate} />}

      <div className="flex-1">{renderContent()}</div>

      {/* Editorial Footer for Public Pages */}
      {!isWorkspaceRoute && (
        <footer className="bg-[#3A2319] text-[#E9DCC7] border-t border-[#E9DCC7]/20">
          <div className="max-w-[1360px] mx-auto px-6 py-14 grid grid-cols-1 md:grid-cols-12 gap-10">
            <div className="md:col-span-5 space-y-3">
              <p className="font-serif text-3xl font-semibold text-[#FFFCF6]">Folkform</p>
              <p className="text-xs uppercase tracking-[0.16em] text-[#BE9753]">
                Where Culture Meets Commerce
              </p>
              <p className="text-sm text-[#E9DCC7]/80 leading-relaxed max-w-md">
                Global B2B procurement infrastructure connecting Indian artisan collectives,
                master workshops, and craft clusters directly with hospitality groups, interior
                architects, and international retailers.
              </p>
            </div>

            <div className="md:col-span-2 space-y-2 text-xs">
              <p className="uppercase tracking-[0.14em] text-[#BE9753] font-medium mb-3">
                Explore
              </p>
              <button
                type="button"
                onClick={() => navigate('/marketplace')}
                className="block hover:text-[#FFFCF6] cursor-pointer"
              >
                B2B Collections
              </button>
              <button
                type="button"
                onClick={() => navigate('/suppliers')}
                className="block hover:text-[#FFFCF6] cursor-pointer"
              >
                Craft Clusters & Makers
              </button>
              <button
                type="button"
                onClick={() => navigate('/ai-preview')}
                className="block hover:text-[#FFFCF6] cursor-pointer"
              >
                AI Sourcing Intelligence
              </button>
              <button
                type="button"
                onClick={() => navigate('/onboard-supplier')}
                className="block hover:text-[#FFFCF6] cursor-pointer"
              >
                Supplier Onboarding
              </button>
            </div>

            <div className="md:col-span-2 space-y-2 text-xs">
              <p className="uppercase tracking-[0.14em] text-[#BE9753] font-medium mb-3">
                Demo Portals
              </p>
              <button
                type="button"
                onClick={() => handleDemoLogin('buyer')}
                className="block hover:text-[#FFFCF6] cursor-pointer"
              >
                Buyer Workspace
              </button>
              <button
                type="button"
                onClick={() => handleDemoLogin('supplier')}
                className="block hover:text-[#FFFCF6] cursor-pointer"
              >
                Artisan Supplier Portal
              </button>
              <button
                type="button"
                onClick={() => handleDemoLogin('admin')}
                className="block hover:text-[#FFFCF6] cursor-pointer"
              >
                Admin Control Center
              </button>
              <button
                type="button"
                onClick={() => navigate('/auth')}
                className="block hover:text-[#FFFCF6] cursor-pointer"
              >
                Sign In / Register
              </button>
            </div>

            <div className="md:col-span-3 space-y-2 text-xs text-[#E9DCC7]/75">
              <p className="uppercase tracking-[0.14em] text-[#BE9753] font-medium mb-3">
                Platform Transparency
              </p>
              <p className="leading-relaxed">
                Seeded craft workshops, indicative prices, quotations, and escrow payment records
                in this environment are demonstration data. Commercial binding always requires
                explicit human buyer and supplier confirmation.
              </p>
            </div>
          </div>
          <div className="border-t border-[#FFFCF6]/10 px-6 py-4 text-center text-[11px] text-[#E9DCC7]/60">
            Folkform Commerce Infrastructure · India Craft Clusters to Global Procurement
          </div>
        </footer>
      )}

      {/* Unobtrusive Toast Banner */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 max-w-md bg-[#3A2319] text-[#FFFCF6] border border-[#BE9753]/50 px-4 py-3 shadow-lg flex items-start gap-3 text-xs">
          <CheckCircle2 className="w-4 h-4 text-[#BE9753] shrink-0 mt-0.5" />
          <p className="leading-relaxed flex-1">{toast}</p>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-[#E9DCC7] hover:text-[#FFFCF6] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
