import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  BarChart3,
  Bookmark,
  Check,
  FileDown,
  FileText,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Package,
  Plus,
  Scale,
  Send,
  ShieldCheck,
  Sparkles,
  Store,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  apiRequest,
  formatDate,
  formatInr,
  formatOrderStatus,
  formatVerificationLabel,
} from '../lib/api';
import { downloadQuotationPdf } from '../lib/pdf';
import { AiSourcingWorkspace } from '../components/AiSourcingWorkspace';
import { CraftImage } from '../components/CraftImage';
import { MessagingCenter } from '../components/MessagingCenter';
import { OrderLifecycleView } from '../components/OrderLifecycleView';
import type {
  AuthUser,
  Product,
  ProductCategory,
  PurchaseOrder,
  QuotationRecord,
  RfqRecord,
  SupplierProfile,
} from '../types';

interface BuyerDashboardProps {
  user: AuthUser;
  tab: string;
  initialAiPrompt?: string;
  onNavigate: (path: string) => void;
  onDemoSwitch: (role: 'buyer' | 'supplier' | 'admin') => Promise<void>;
  onLogout: () => void;
  onToast: (msg: string) => void;
}

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'ai-sourcing', label: 'AI Sourcing', icon: Sparkles },
  { id: 'rfqs', label: 'My RFQs', icon: FileText },
  { id: 'compare', label: 'Compare Quotes', icon: Scale },
  { id: 'orders', label: 'Orders & POs', icon: Package },
  { id: 'saved', label: 'Saved Items', icon: Bookmark },
  { id: 'messages', label: 'Messages', icon: MessageSquare },
  { id: 'analytics', label: 'Spend Analytics', icon: BarChart3 },
];

export const BuyerDashboard: React.FC<BuyerDashboardProps> = ({
  user,
  tab,
  initialAiPrompt,
  onNavigate,
  onDemoSwitch,
  onLogout,
  onToast,
}) => {
  const activeTab = NAV_ITEMS.some((n) => n.id === tab) ? tab : 'overview';

  const [kpis, setKpis] = useState({
    activeRfqs: 0,
    receivedQuotes: 0,
    pendingApprovals: 0,
    activeOrders: 0,
    totalProcurementValueInr: 0,
  });
  const [spendByCategory, setSpendByCategory] = useState<
    { category: string; spendInr: number; orders: number }[]
  >([]);
  const [recommendedSuppliers, setRecommendedSuppliers] = useState<SupplierProfile[]>([]);
  const [rfqs, setRfqs] = useState<RfqRecord[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [savedData, setSavedData] = useState<{ products: Product[]; suppliers: SupplierProfile[] }>({
    products: [],
    suppliers: [],
  });
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);

  // Quotation comparison state
  const [compareRfqId, setCompareRfqId] = useState<string>('');
  const [revisionQuoteId, setRevisionQuoteId] = useState<string | null>(null);
  const [revisionNote, setRevisionNote] = useState('');
  const [poModalQuote, setPoModalQuote] = useState<QuotationRecord | null>(null);
  const [poDeliveryLocation, setPoDeliveryLocation] = useState('');
  const [poHumanConfirmed, setPoHumanConfirmed] = useState(false);
  const [poSubmitting, setPoSubmitting] = useState(false);

  // Create RFQ modal state
  const [showNewRfqModal, setShowNewRfqModal] = useState(false);
  const [creatingRfq, setCreatingRfq] = useState(false);
  const [newRfq, setNewRfq] = useState({
    title: '',
    categorySlugOrId: 'pottery-ceramics',
    description: '',
    quantity: 300,
    targetUnitPriceInr: 1200,
    budgetMinInr: 950,
    budgetMaxInr: 1450,
    preferredMaterials: '',
    craftTechnique: '',
    customisationRequirements: '',
    moqPreference: 100,
    deliveryLocation: 'Udaipur, Rajasthan',
    requiredLeadDays: 30,
    shippingRequirements: 'Export-grade corrugated boxes with corner foam',
    additionalInstructions: '',
  });

  const loadAll = async () => {
    setLoading(true);
    try {
      const [dashRes, rfqRes, ordRes, savedRes, catRes] = await Promise.all([
        apiRequest<{
          kpis: typeof kpis;
          spendByCategory: typeof spendByCategory;
          recommendedSuppliers: SupplierProfile[];
        }>('/buyer/dashboard'),
        apiRequest<{ rfqs: RfqRecord[] }>('/rfqs'),
        apiRequest<{ orders: PurchaseOrder[] }>('/orders'),
        apiRequest<{ products: Product[]; suppliers: SupplierProfile[] }>('/saved'),
        apiRequest<{ categories: ProductCategory[] }>('/categories'),
      ]);
      setKpis(dashRes.kpis);
      setSpendByCategory(dashRes.spendByCategory);
      setRecommendedSuppliers(dashRes.recommendedSuppliers);
      setRfqs(rfqRes.rfqs);
      setOrders(ordRes.orders);
      setSavedData(savedRes);
      setCategories(catRes.categories);

      if (!compareRfqId && rfqRes.rfqs.length > 0) {
        const flagship =
          rfqRes.rfqs.find((r) => r.rfqCode === 'RFQ-2026-001') ||
          rfqRes.rfqs.find((r) => (r.quotations?.length ?? 0) > 0) ||
          rfqRes.rfqs[0];
        if (flagship) setCompareRfqId(flagship.id);
      }
    } catch (err: any) {
      onToast(err.message || 'Unable to load buyer workspace data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [user.id]);

  const rfqsWithQuotes = useMemo(
    () => rfqs.filter((r) => (r.quotations?.length ?? 0) > 0),
    [rfqs],
  );

  const activeCompareRfq = useMemo(() => {
    return (
      rfqs.find((r) => r.id === compareRfqId) ||
      rfqsWithQuotes[0] ||
      rfqs[0] ||
      null
    );
  }, [rfqs, rfqsWithQuotes, compareRfqId]);

  const compareQuotes = activeCompareRfq?.quotations ?? [];
  const lowestLandedId = useMemo(() => {
    if (compareQuotes.length === 0) return null;
    return compareQuotes.reduce((best, cur) =>
      cur.totalLandedCostInr < best.totalLandedCostInr ? cur : best,
    ).id;
  }, [compareQuotes]);

  const fastestLeadId = useMemo(() => {
    if (compareQuotes.length === 0) return null;
    return compareQuotes.reduce((best, cur) =>
      cur.estimatedProductionDays < best.estimatedProductionDays ? cur : best,
    ).id;
  }, [compareQuotes]);

  const handleCreateRfq = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingRfq(true);
    try {
      const res = await apiRequest<{ id: string; rfqCode: string; invitedSuppliersCount: number }>(
        '/rfqs',
        {
          method: 'POST',
          body: newRfq,
        },
      );
      onToast(`Created ${res.rfqCode} and invited ${res.invitedSuppliersCount} matched suppliers.`);
      setShowNewRfqModal(false);
      setNewRfq({
        title: '',
        categorySlugOrId: 'pottery-ceramics',
        description: '',
        quantity: 300,
        targetUnitPriceInr: 1200,
        budgetMinInr: 950,
        budgetMaxInr: 1450,
        preferredMaterials: '',
        craftTechnique: '',
        customisationRequirements: '',
        moqPreference: 100,
        deliveryLocation: 'Udaipur, Rajasthan',
        requiredLeadDays: 30,
        shippingRequirements: 'Export-grade corrugated boxes with corner foam',
        additionalInstructions: '',
      });
      await loadAll();
    } catch (err: any) {
      onToast(err.message);
    } finally {
      setCreatingRfq(false);
    }
  };

  const handleQuoteAction = async (
    quoteId: string,
    action: 'save' | 'unsave' | 'request_revision' | 'reject',
    note?: string,
  ) => {
    try {
      await apiRequest(`/quotations/${quoteId}/action`, {
        method: 'PATCH',
        body: { action, note },
      });
      if (action === 'save') onToast('Quotation saved for comparison shortlist.');
      else if (action === 'unsave') onToast('Quotation removed from saved shortlist.');
      else if (action === 'request_revision') {
        onToast('Clarification & revision request sent to supplier.');
        setRevisionQuoteId(null);
        setRevisionNote('');
      } else onToast('Quotation marked rejected.');
      await loadAll();
    } catch (err: any) {
      onToast(err.message);
    }
  };

  const openPoApprovalModal = (q: QuotationRecord) => {
    setPoModalQuote(q);
    setPoDeliveryLocation(activeCompareRfq?.deliveryLocation || 'Udaipur, Rajasthan');
    setPoHumanConfirmed(false);
  };

  const handleCreatePurchaseOrder = async (approveImmediately: boolean) => {
    if (!poModalQuote) return;
    if (approveImmediately && !poHumanConfirmed) {
      onToast('Please confirm human commercial approval before issuing a Purchase Order.');
      return;
    }
    setPoSubmitting(true);
    try {
      const res = await apiRequest<{ id: string; poNumber: string; status: string }>('/orders', {
        method: 'POST',
        body: {
          quotationId: poModalQuote.id,
          deliveryLocation: poDeliveryLocation,
          approveImmediately,
        },
      });
      onToast(
        approveImmediately
          ? `Purchase Order ${res.poNumber} approved & issued to ${poModalQuote.supplierName}.`
          : `Purchase Order draft ${res.poNumber} saved for formal buyer approval.`,
      );
      setPoModalQuote(null);
      await loadAll();
      onNavigate('/buyer/orders');
    } catch (err: any) {
      onToast(err.message);
    } finally {
      setPoSubmitting(false);
    }
  };

  const handleToggleSavedProduct = async (productId: string) => {
    try {
      await apiRequest(`/saved/products/${productId}`, { method: 'POST' });
      onToast('Updated saved products.');
      loadAll();
    } catch (err: any) {
      onToast(err.message);
    }
  };

  const handleToggleSavedSupplier = async (supplierId: string) => {
    try {
      await apiRequest(`/saved/suppliers/${supplierId}`, { method: 'POST' });
      onToast('Updated saved suppliers.');
      loadAll();
    } catch (err: any) {
      onToast(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F3E8] text-[#3A2319] flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 bg-[#FFFCF6] border-r border-[#E9DCC7] sticky top-0 h-screen">
        <div className="px-6 h-16 border-b border-[#E9DCC7] flex items-center justify-between">
          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="font-serif text-2xl font-semibold text-[#3A2319] cursor-pointer"
          >
            Folkform
          </button>
          <span className="text-[10px] uppercase tracking-[0.14em] text-[#B05330] font-medium">
            Buyer OS
          </span>
        </div>

        <div className="px-5 py-4 border-b border-[#E9DCC7]/70">
          <p className="text-xs font-semibold text-[#3A2319] truncate">
            {user.buyerProfile?.companyName || user.fullName}
          </p>
          <p className="text-[11px] text-[#7A5E4B] truncate mt-0.5">
            {user.fullName} · {user.buyerProfile?.buyerType || 'Global Buyer'}
          </p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(`/buyer/${item.id}`)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#3A2319] text-[#FFFCF6] font-medium'
                    : 'text-[#3A2319]/80 hover:bg-[#F8F3E8] hover:text-[#3A2319]'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
                {item.id === 'compare' && kpis.receivedQuotes > 0 && (
                  <span
                    className={`ml-auto font-mono text-[11px] tabular-nums ${
                      active ? 'text-[#BE9753]' : 'text-[#7A5E4B]'
                    }`}
                  >
                    {kpis.receivedQuotes}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#E9DCC7] space-y-2">
          <button
            type="button"
            onClick={() => onNavigate('/marketplace')}
            className="w-full flex items-center justify-between px-3 py-2 text-xs text-[#3A2319] border border-[#E9DCC7] hover:bg-[#F8F3E8] cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Store className="w-3.5 h-3.5 text-[#B05330]" />
              Browse Marketplace
            </span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#7A5E4B] hover:text-[#B05330] cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Workspace Bar */}
        <header className="sticky top-0 z-30 bg-[#FFFCF6]/95 backdrop-blur-sm border-b border-[#E9DCC7] px-4 sm:px-8 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate('/')}
              className="lg:hidden font-serif text-xl font-semibold text-[#3A2319]"
            >
              Folkform
            </button>
            <span className="text-xs uppercase tracking-[0.14em] text-[#7A5E4B]">
              Buyer Workspace ·{' '}
              <strong className="text-[#3A2319]">
                {NAV_ITEMS.find((n) => n.id === activeTab)?.label}
              </strong>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] uppercase tracking-[0.12em] text-[#7A5E4B] hidden sm:inline">
              Demo Switch:
            </span>
            <div className="inline-flex border border-[#E9DCC7] bg-[#F8F3E8] p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => onDemoSwitch('buyer')}
                className="px-2.5 py-1 bg-[#3A2319] text-[#FFFCF6] font-medium cursor-pointer"
              >
                Buyer
              </button>
              <button
                type="button"
                onClick={() => onDemoSwitch('supplier')}
                className="px-2.5 py-1 text-[#3A2319] hover:bg-[#FFFCF6] cursor-pointer"
              >
                Artisan
              </button>
              <button
                type="button"
                onClick={() => onDemoSwitch('admin')}
                className="px-2.5 py-1 text-[#3A2319] hover:bg-[#FFFCF6] cursor-pointer"
              >
                Admin
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowNewRfqModal(true)}
              className="px-3.5 py-1.5 bg-[#B05330] text-[#FFFCF6] text-xs font-medium hover:bg-[#974426] flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              New RFQ
            </button>
          </div>
        </header>

        {/* Mobile Nav Strip */}
        <div className="lg:hidden overflow-x-auto bg-[#FFFCF6] border-b border-[#E9DCC7] px-4 py-2 flex gap-1.5">
          {NAV_ITEMS.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(`/buyer/${item.id}`)}
                className={`px-3 py-1.5 text-xs whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-[#3A2319] text-[#FFFCF6] font-medium'
                    : 'text-[#3A2319] bg-[#F8F3E8]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Workspace Canvas */}
        <main className="flex-1 p-5 sm:p-8 max-w-[1360px] w-full mx-auto">
          {loading && activeTab === 'overview' ? (
            <div className="py-16 text-center text-sm text-[#7A5E4B]">
              Loading procurement workspace…
            </div>
          ) : null}

          {/* ============================================================== */}
          {/* TAB 1: OVERVIEW                                                */}
          {/* ============================================================== */}
          {activeTab === 'overview' && (
            <div className="space-y-8">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-[#B05330] font-medium">
                    Global Procurement Command · Demo Account
                  </p>
                  <h1 className="font-serif text-4xl font-semibold text-[#3A2319] mt-1">
                    Welcome back, {user.fullName.split(' ')[0]}
                  </h1>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onNavigate('/buyer/ai-sourcing')}
                    className="px-4 py-2.5 bg-[#3A2319] text-[#FFFCF6] text-xs font-medium hover:bg-[#523326] flex items-center gap-2 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#BE9753]" />
                    Launch AI Sourcing Intelligence
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('/buyer/compare')}
                    className="px-4 py-2.5 border border-[#3A2319] text-[#3A2319] text-xs font-medium hover:bg-[#E9DCC7]/40 cursor-pointer"
                  >
                    Compare Quotations ({kpis.receivedQuotes})
                  </button>
                </div>
              </div>

              {/* KPI Strip */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                {[
                  { label: 'Active RFQs', value: String(kpis.activeRfqs), note: 'Open sourcing briefs' },
                  {
                    label: 'Quotations Received',
                    value: String(kpis.receivedQuotes),
                    note: 'Ready to compare',
                  },
                  {
                    label: 'Pending Approvals',
                    value: String(kpis.pendingApprovals),
                    note: 'Human PO gates',
                  },
                  { label: 'Active Orders', value: String(kpis.activeOrders), note: 'In production / transit' },
                  {
                    label: 'Total Procurement Value',
                    value: formatInr(kpis.totalProcurementValueInr),
                    note: 'Demo PO volume',
                  },
                ].map((k) => (
                  <div
                    key={k.label}
                    className="bg-[#FFFCF6] border border-[#E9DCC7] p-5 flex flex-col justify-between"
                  >
                    <span className="text-[11px] uppercase tracking-[0.12em] text-[#7A5E4B]">
                      {k.label}
                    </span>
                    <p className="font-mono text-2xl font-semibold text-[#3A2319] tabular-nums mt-3">
                      {k.value}
                    </p>
                    <span className="text-[11px] text-[#7A5E4B] mt-1">{k.note}</span>
                  </div>
                ))}
              </div>

              {/* Quick AI Prompt Launch Strip */}
              <div className="bg-[#3A2319] text-[#FFFCF6] p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="max-w-2xl">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-[#BE9753]">
                    Folkform Sourcing Intelligence · Multi-Agent Workflow
                  </p>
                  <h2 className="font-serif text-2xl sm:text-3xl font-semibold mt-1">
                    Turn natural language briefs into vetted Indian artisan shortlists
                  </h2>
                  <p className="text-sm text-[#E9DCC7] mt-2 leading-relaxed">
                    Run our transparent 8-dimension matching engine across Jaipur pottery,
                    Moradabad brass, Kutch handloom, and Channapatna woodcraft—with explicit human
                    approval before contacting suppliers.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('/buyer/ai-sourcing')}
                  className="px-6 py-3 bg-[#B05330] text-[#FFFCF6] text-xs font-medium uppercase tracking-[0.12em] hover:bg-[#984324] shrink-0 cursor-pointer"
                >
                  Open Sourcing Workbench
                </button>
              </div>

              {/* Recent RFQs & Recommended Makers */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 bg-[#FFFCF6] border border-[#E9DCC7] p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-serif text-2xl font-semibold text-[#3A2319]">
                      Recent Sourcing Requests
                    </h3>
                    <button
                      type="button"
                      onClick={() => onNavigate('/buyer/rfqs')}
                      className="text-xs text-[#B05330] font-medium hover:underline cursor-pointer"
                    >
                      View all RFQs
                    </button>
                  </div>

                  <div className="divide-y divide-[#E9DCC7]">
                    {rfqs.slice(0, 5).map((r) => (
                      <div
                        key={r.id}
                        className="py-3.5 flex flex-wrap items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-[11px] text-[#7A5E4B]">
                            <span className="font-mono font-medium text-[#3A2319]">
                              {r.rfqCode}
                            </span>
                            <span>·</span>
                            <span>{r.categoryName}</span>
                            <span>·</span>
                            <span className="font-mono tabular-nums">{r.quantity} units</span>
                          </div>
                          <p className="text-sm font-medium text-[#3A2319] mt-0.5 truncate">
                            {r.title}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-xs text-[#7A5E4B] font-mono tabular-nums">
                            {r.quotationsReceivedCount ?? 0} quotes
                          </span>
                          {(r.quotationsReceivedCount ?? 0) > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setCompareRfqId(r.id);
                                onNavigate('/buyer/compare');
                              }}
                              className="px-3 py-1 text-xs border border-[#3A2319] text-[#3A2319] hover:bg-[#3A2319] hover:text-[#FFFCF6] cursor-pointer"
                            >
                              Compare
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="lg:col-span-5 bg-[#FFFCF6] border border-[#E9DCC7] p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-serif text-2xl font-semibold text-[#3A2319]">
                      Verified Craft Clusters
                    </h3>
                    <button
                      type="button"
                      onClick={() => onNavigate('/suppliers')}
                      className="text-xs text-[#B05330] font-medium hover:underline cursor-pointer"
                    >
                      Directory
                    </button>
                  </div>
                  <div className="space-y-3">
                    {recommendedSuppliers.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => onNavigate(`/suppliers/${s.id}`)}
                        className="w-full text-left p-3.5 border border-[#E9DCC7] hover:border-[#B05330] transition-colors cursor-pointer"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-[#3A2319]">
                            {s.businessName}
                          </span>
                          <span className="text-[11px] text-[#6F8069] font-medium flex items-center gap-1">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            {formatVerificationLabel(s.verificationStatus, s.isDemo)}
                          </span>
                        </div>
                        <p className="text-xs text-[#7A5E4B] mt-1">
                          {s.city}, {s.state} · {s.supplierType} · Declared cap{' '}
                          <span className="font-mono tabular-nums">
                            {s.monthlyCapacityUnits}/mo
                          </span>
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 2: AI SOURCING INTELLIGENCE                                */}
          {/* ============================================================== */}
          {activeTab === 'ai-sourcing' && (
            <AiSourcingWorkspace
              user={user}
              initialPrompt={initialAiPrompt}
              onNavigate={onNavigate}
              onToast={onToast}
              onRfqCreated={loadAll}
            />
          )}

          {/* ============================================================== */}
          {/* TAB 3: MY RFQS                                                 */}
          {/* ============================================================== */}
          {activeTab === 'rfqs' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-[#B05330]">
                    Structured Bulk Procurement
                  </p>
                  <h2 className="font-serif text-3xl font-semibold text-[#3A2319] mt-0.5">
                    Requests for Quotation ({rfqs.length})
                  </h2>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onNavigate('/buyer/ai-sourcing')}
                    className="px-4 py-2 border border-[#3A2319] text-xs font-medium text-[#3A2319] hover:bg-[#E9DCC7]/40 cursor-pointer"
                  >
                    Draft via AI Sourcing
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowNewRfqModal(true)}
                    className="px-4 py-2 bg-[#B05330] text-[#FFFCF6] text-xs font-medium hover:bg-[#974426] flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Create Structured RFQ
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {rfqs.map((rfq) => (
                  <div
                    key={rfq.id}
                    className="bg-[#FFFCF6] border border-[#E9DCC7] p-6 space-y-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-[#7A5E4B]">
                          <span className="font-mono font-semibold text-[#3A2319]">
                            {rfq.rfqCode}
                          </span>
                          <span>·</span>
                          <span>{rfq.categoryName}</span>
                          <span>·</span>
                          <span className="text-[#B05330] font-medium">
                            {formatOrderStatus(rfq.status)}
                          </span>
                          {rfq.isDemo && (
                            <>
                              <span>·</span>
                              <span>Demo Record</span>
                            </>
                          )}
                        </div>
                        <h3 className="font-serif text-2xl font-semibold text-[#3A2319] mt-1">
                          {rfq.title}
                        </h3>
                        <p className="text-sm text-[#5C4537] mt-1 max-w-3xl leading-relaxed">
                          {rfq.description}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2 shrink-0">
                        {(rfq.quotations?.length ?? 0) > 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              setCompareRfqId(rfq.id);
                              onNavigate('/buyer/compare');
                            }}
                            className="px-4 py-2 bg-[#3A2319] text-[#FFFCF6] text-xs font-medium hover:bg-[#523326] cursor-pointer"
                          >
                            Compare {rfq.quotations?.length} Quotation
                            {(rfq.quotations?.length ?? 0) === 1 ? '' : 's'}
                          </button>
                        ) : (
                          <span className="px-3 py-2 text-xs border border-[#E9DCC7] text-[#7A5E4B]">
                            Awaiting Supplier Quotes
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 pt-4 border-t border-[#E9DCC7]/70 text-xs">
                      <div>
                        <span className="text-[#7A5E4B] block">Quantity</span>
                        <span className="font-mono font-semibold text-[#3A2319] tabular-nums">
                          {rfq.quantity.toLocaleString('en-IN')} units
                        </span>
                      </div>
                      <div>
                        <span className="text-[#7A5E4B] block">Target Budget / Unit</span>
                        <span className="font-mono font-semibold text-[#3A2319] tabular-nums">
                          {rfq.budgetMinInr && rfq.budgetMaxInr
                            ? `${formatInr(rfq.budgetMinInr)} – ${formatInr(rfq.budgetMaxInr)}`
                            : formatInr(rfq.targetUnitPriceInr)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#7A5E4B] block">Delivery Location</span>
                        <span className="font-medium text-[#3A2319]">{rfq.deliveryLocation}</span>
                      </div>
                      <div>
                        <span className="text-[#7A5E4B] block">Required Lead Time</span>
                        <span className="font-mono font-medium text-[#3A2319] tabular-nums">
                          {rfq.requiredLeadDays ? `${rfq.requiredLeadDays} days` : 'Flexible'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#7A5E4B] block">Suppliers Contacted</span>
                        <span className="font-mono font-medium text-[#3A2319] tabular-nums">
                          {rfq.suppliersContactedCount ?? 0} invited
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 4: QUOTATION COMPARISON WORKSPACE (STANDOUT FEATURE)       */}
          {/* ============================================================== */}
          {activeTab === 'compare' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-[#B05330] font-medium">
                    Side-by-Side Commercial Evaluation
                  </p>
                  <h2 className="font-serif text-3xl sm:text-4xl font-semibold text-[#3A2319] mt-0.5">
                    Quotation Comparison Workspace
                  </h2>
                </div>

                <div className="w-full sm:w-96">
                  <label className="block text-[11px] uppercase tracking-[0.12em] text-[#7A5E4B] mb-1">
                    Select RFQ to Evaluate
                  </label>
                  <select
                    value={activeCompareRfq?.id || ''}
                    onChange={(e) => setCompareRfqId(e.target.value)}
                    className="w-full bg-[#FFFCF6] border border-[#3A2319]/30 px-3 py-2 text-sm text-[#3A2319]"
                  >
                    {rfqs.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.rfqCode} — {r.title} ({r.quotations?.length ?? 0} quotes)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {activeCompareRfq && (
                <div className="bg-[#FFFCF6] border border-[#E9DCC7] p-5 flex flex-wrap items-center justify-between gap-4 text-xs">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-[#7A5E4B]">
                      <span className="font-mono font-semibold text-[#3A2319]">
                        {activeCompareRfq.rfqCode}
                      </span>
                      <span>·</span>
                      <span>Quantity: {activeCompareRfq.quantity.toLocaleString('en-IN')} units</span>
                      <span>·</span>
                      <span>
                        Budget:{' '}
                        {activeCompareRfq.budgetMinInr && activeCompareRfq.budgetMaxInr
                          ? `${formatInr(activeCompareRfq.budgetMinInr)} – ${formatInr(activeCompareRfq.budgetMaxInr)}/unit`
                          : formatInr(activeCompareRfq.targetUnitPriceInr)}
                      </span>
                      <span>·</span>
                      <span>Target Lead: {activeCompareRfq.requiredLeadDays || 30} days</span>
                    </div>
                    <p className="text-sm font-medium text-[#3A2319]">{activeCompareRfq.title}</p>
                  </div>
                  <p className="text-[11px] text-[#7A5E4B] max-w-md">
                    Quotations reflect supplier-declared capacity and commercial terms. Formal
                    human approval is required before converting any offer into a Purchase Order.
                  </p>
                </div>
              )}

              {compareQuotes.length === 0 ? (
                <div className="bg-[#FFFCF6] border border-[#E9DCC7] p-12 text-center space-y-3">
                  <p className="font-serif text-2xl text-[#3A2319]">
                    No quotations received for this RFQ yet
                  </p>
                  <p className="text-sm text-[#7A5E4B] max-w-md mx-auto">
                    Switch to the Artisan Demo role in the top bar to submit a live quotation into
                    this RFQ, or choose RFQ-2026-001 to evaluate three Rajasthan lamp offers.
                  </p>
                </div>
              ) : (
                <>
                  {/* Side-by-Side Comparison Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {compareQuotes.map((q) => {
                      const isLowest = q.id === lowestLandedId;
                      const isFastest = q.id === fastestLeadId;
                      const meetsLead =
                        !activeCompareRfq?.requiredLeadDays ||
                        q.estimatedProductionDays <= activeCompareRfq.requiredLeadDays;
                      return (
                        <div
                          key={q.id}
                          className={`bg-[#FFFCF6] border flex flex-col justify-between ${
                            isLowest ? 'border-[#B05330]' : 'border-[#E9DCC7]'
                          }`}
                        >
                          <div className="p-6 space-y-5">
                            {/* Header */}
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.12em]">
                                  <span className="font-mono text-[#7A5E4B]">{q.quoteCode}</span>
                                  {isLowest && (
                                    <span className="text-[#B05330] font-semibold">
                                      · Lowest Landed Cost
                                    </span>
                                  )}
                                  {isFastest && (
                                    <span className="text-[#6F8069] font-semibold">
                                      · Fastest Lead Time
                                    </span>
                                  )}
                                </div>
                                <h3 className="font-serif text-2xl font-semibold text-[#3A2319] mt-1">
                                  {q.supplierName}
                                </h3>
                                <p className="text-xs text-[#7A5E4B] mt-0.5">
                                  {q.supplierCity}, {q.supplierState} ·{' '}
                                  {formatVerificationLabel(
                                    q.supplierVerificationStatus || 'pending',
                                    q.isDemo,
                                  )}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  handleQuoteAction(q.id, q.isSaved ? 'unsave' : 'save')
                                }
                                title={q.isSaved ? 'Remove from saved' : 'Save quotation'}
                                className={`p-2 border cursor-pointer ${
                                  q.isSaved
                                    ? 'bg-[#3A2319] text-[#FFFCF6] border-[#3A2319]'
                                    : 'border-[#E9DCC7] text-[#3A2319] hover:bg-[#F8F3E8]'
                                }`}
                              >
                                <Bookmark className="w-4 h-4" />
                              </button>
                            </div>

                            {/* Primary Pricing Block */}
                            <div className="bg-[#F8F3E8] border border-[#E9DCC7] p-4 grid grid-cols-2 gap-4">
                              <div>
                                <span className="text-[11px] uppercase tracking-[0.1em] text-[#7A5E4B]">
                                  Unit Price
                                </span>
                                <p className="font-mono text-2xl font-semibold text-[#3A2319] tabular-nums mt-0.5">
                                  {formatInr(q.unitPriceInr)}
                                </p>
                              </div>
                              <div className="text-right">
                                <span className="text-[11px] uppercase tracking-[0.1em] text-[#7A5E4B]">
                                  Total Landed Cost
                                </span>
                                <p className="font-mono text-xl font-semibold text-[#B05330] tabular-nums mt-1">
                                  {formatInr(q.totalLandedCostInr)}
                                </p>
                              </div>
                            </div>

                            {/* Structured Commercial Specs Table */}
                            <dl className="divide-y divide-[#E9DCC7]/70 text-xs">
                              <div className="py-2 flex justify-between">
                                <dt className="text-[#7A5E4B]">Product Subtotal</dt>
                                <dd className="font-mono font-medium text-[#3A2319] tabular-nums">
                                  {formatInr(q.totalProductCostInr)}
                                </dd>
                              </div>
                              <div className="py-2 flex justify-between">
                                <dt className="text-[#7A5E4B]">Shipping & Export Packing</dt>
                                <dd className="font-mono font-medium text-[#3A2319] tabular-nums">
                                  {formatInr(q.shippingEstimateInr)}
                                </dd>
                              </div>
                              <div className="py-2 flex justify-between">
                                <dt className="text-[#7A5E4B]">MOQ</dt>
                                <dd className="font-mono font-medium text-[#3A2319] tabular-nums">
                                  {q.moq} units
                                </dd>
                              </div>
                              <div className="py-2 flex justify-between">
                                <dt className="text-[#7A5E4B]">Declared Monthly Capacity</dt>
                                <dd className="font-mono font-medium text-[#3A2319] tabular-nums">
                                  {q.availableCapacity} units/mo
                                </dd>
                              </div>
                              <div className="py-2 flex justify-between">
                                <dt className="text-[#7A5E4B]">Production Lead Time</dt>
                                <dd
                                  className={`font-mono font-semibold tabular-nums ${
                                    meetsLead ? 'text-[#6F8069]' : 'text-[#B05330]'
                                  }`}
                                >
                                  {q.estimatedProductionDays} days{' '}
                                  {meetsLead ? '(Within target)' : '(Exceeds target)'}
                                </dd>
                              </div>
                              <div className="py-2 flex justify-between">
                                <dt className="text-[#7A5E4B]">Status · Validity</dt>
                                <dd className="font-medium text-[#3A2319]">
                                  {formatOrderStatus(q.status)} · {q.validityDays}d
                                </dd>
                              </div>
                            </dl>

                            {q.customisationNotes && (
                              <div className="text-xs">
                                <span className="text-[11px] uppercase tracking-[0.1em] text-[#7A5E4B] block mb-1">
                                  Customisation & Finishing
                                </span>
                                <p className="text-[#3A2319] leading-relaxed">
                                  {q.customisationNotes}
                                </p>
                              </div>
                            )}

                            {q.conditions && (
                              <div className="text-xs">
                                <span className="text-[11px] uppercase tracking-[0.1em] text-[#7A5E4B] block mb-1">
                                  Commercial Terms
                                </span>
                                <p className="text-[#5C4537] leading-relaxed">{q.conditions}</p>
                              </div>
                            )}

                            {/* Inline Clarification Drawer */}
                            {revisionQuoteId === q.id && (
                              <div className="p-3 bg-[#F8F3E8] border border-[#E9DCC7] space-y-2">
                                <label className="block text-[11px] font-medium text-[#3A2319]">
                                  Message to {q.supplierName} (Clarification / Revision Request)
                                </label>
                                <textarea
                                  rows={2}
                                  value={revisionNote}
                                  onChange={(e) => setRevisionNote(e.target.value)}
                                  placeholder="e.g., Can you confirm matte cream stoneware glaze & trim lead time to 22 days?"
                                  className="w-full bg-[#FFFCF6] border border-[#E9DCC7] p-2 text-xs text-[#3A2319]"
                                />
                                <div className="flex gap-2 justify-end">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setRevisionQuoteId(null);
                                      setRevisionNote('');
                                    }}
                                    className="px-3 py-1 text-xs text-[#7A5E4B] cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleQuoteAction(q.id, 'request_revision', revisionNote)
                                    }
                                    className="px-3 py-1 bg-[#3A2319] text-[#FFFCF6] text-xs font-medium flex items-center gap-1 cursor-pointer"
                                  >
                                    <Send className="w-3 h-3" />
                                    Send Request
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Card Action Footer */}
                          <div className="p-4 border-t border-[#E9DCC7] bg-[#F8F3E8]/50 space-y-2">
                            <button
                              type="button"
                              onClick={() => openPoApprovalModal(q)}
                              disabled={q.status === 'rejected'}
                              className="w-full py-2.5 bg-[#B05330] text-[#FFFCF6] text-xs font-medium uppercase tracking-[0.1em] hover:bg-[#974426] disabled:opacity-50 cursor-pointer"
                            >
                              {q.status === 'accepted'
                                ? 'Accepted — Draft Additional PO'
                                : 'Select Supplier & Draft PO'}
                            </button>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setRevisionQuoteId(revisionQuoteId === q.id ? null : q.id);
                                  setRevisionNote('');
                                }}
                                className="py-2 px-2 border border-[#E9DCC7] bg-[#FFFCF6] text-[11px] font-medium text-[#3A2319] hover:border-[#3A2319] cursor-pointer"
                              >
                                Request Revision
                              </button>
                              <button
                                type="button"
                                onClick={() => downloadQuotationPdf(q)}
                                className="py-2 px-2 border border-[#E9DCC7] bg-[#FFFCF6] text-[11px] font-medium text-[#3A2319] hover:border-[#3A2319] flex items-center justify-center gap-1 cursor-pointer"
                              >
                                <FileDown className="w-3.5 h-3.5" />
                                Quote PDF
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Compact Comparative Matrix Table */}
                  <div className="bg-[#FFFCF6] border border-[#E9DCC7] overflow-x-auto">
                    <div className="px-5 py-4 border-b border-[#E9DCC7] flex items-center justify-between">
                      <h3 className="font-serif text-xl font-semibold text-[#3A2319]">
                        Normalized Landed Cost & Lead Time Matrix
                      </h3>
                      <span className="text-[11px] text-[#7A5E4B]">
                        All values in INR · Demo commercial comparison
                      </span>
                    </div>
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#F8F3E8] border-b border-[#E9DCC7] text-[11px] uppercase tracking-[0.1em] text-[#7A5E4B]">
                        <tr>
                          <th className="py-3 px-4">Supplier</th>
                          <th className="py-3 px-4 text-right">Unit Price</th>
                          <th className="py-3 px-4 text-right">Product Total</th>
                          <th className="py-3 px-4 text-right">Freight</th>
                          <th className="py-3 px-4 text-right">Total Landed</th>
                          <th className="py-3 px-4 text-right">MOQ</th>
                          <th className="py-3 px-4 text-right">Lead Days</th>
                          <th className="py-3 px-4">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E9DCC7]">
                        {compareQuotes.map((q) => (
                          <tr key={q.id} className="hover:bg-[#F8F3E8]/50">
                            <td className="py-3 px-4 font-medium text-[#3A2319]">
                              {q.supplierName}
                              <span className="block text-[11px] text-[#7A5E4B] font-normal">
                                {q.supplierCity}, {q.supplierState}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums">
                              {formatInr(q.unitPriceInr)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums">
                              {formatInr(q.totalProductCostInr)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums">
                              {formatInr(q.shippingEstimateInr)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-semibold text-[#B05330] tabular-nums">
                              {formatInr(q.totalLandedCostInr)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums">{q.moq}</td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums">
                              {q.estimatedProductionDays}d
                            </td>
                            <td className="py-3 px-4">{formatOrderStatus(q.status)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 5: ORDERS & PURCHASE ORDERS                                */}
          {/* ============================================================== */}
          {activeTab === 'orders' && (
            <OrderLifecycleView
              orders={orders}
              user={user}
              onRefresh={loadAll}
              onToast={onToast}
            />
          )}

          {/* ============================================================== */}
          {/* TAB 6: SAVED COLLECTIONS                                       */}
          {/* ============================================================== */}
          {activeTab === 'saved' && (
            <div className="space-y-8">
              <div>
                <p className="text-[11px] uppercase tracking-[0.14em] text-[#B05330]">
                  Curated Procurement Shortlist
                </p>
                <h2 className="font-serif text-3xl font-semibold text-[#3A2319] mt-0.5">
                  Saved Products & Artisan Makers
                </h2>
              </div>

              <section className="space-y-4">
                <h3 className="font-serif text-2xl font-semibold text-[#3A2319]">
                  Saved Craft Products ({savedData.products.length})
                </h3>
                {savedData.products.length === 0 ? (
                  <div className="bg-[#FFFCF6] border border-[#E9DCC7] p-8 text-sm text-[#7A5E4B]">
                    No products saved yet. Explore the marketplace to bookmark items for future
                    RFQs.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {savedData.products.map((p) => (
                      <div key={p.id} className="bg-[#FFFCF6] border border-[#E9DCC7]">
                        <div className="aspect-[4/3] overflow-hidden bg-[#E9DCC7]/30">
                          <CraftImage
                            src={p.imageUrl}
                            alt={p.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="p-4 space-y-2">
                          <p className="text-[11px] uppercase tracking-[0.12em] text-[#7A5E4B]">
                            {p.originCity}, {p.originState} · MOQ {p.moq}
                          </p>
                          <h4 className="font-serif text-xl font-semibold text-[#3A2319]">
                            {p.name}
                          </h4>
                          <p className="font-mono text-sm font-semibold text-[#B05330] tabular-nums">
                            {formatInr(p.indicativePriceInr)} / unit (indicative)
                          </p>
                          <div className="pt-2 flex gap-2">
                            <button
                              type="button"
                              onClick={() => onNavigate(`/products/${p.id}`)}
                              className="flex-1 py-2 bg-[#3A2319] text-[#FFFCF6] text-xs font-medium cursor-pointer"
                            >
                              Inspect Spec
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleSavedProduct(p.id)}
                              className="px-3 py-2 border border-[#E9DCC7] text-xs text-[#7A5E4B] hover:text-[#B05330] cursor-pointer"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="space-y-4">
                <h3 className="font-serif text-2xl font-semibold text-[#3A2319]">
                  Saved Suppliers ({savedData.suppliers.length})
                </h3>
                {savedData.suppliers.length === 0 ? (
                  <div className="bg-[#FFFCF6] border border-[#E9DCC7] p-8 text-sm text-[#7A5E4B]">
                    No suppliers saved yet.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {savedData.suppliers.map((s) => (
                      <div
                        key={s.id}
                        className="bg-[#FFFCF6] border border-[#E9DCC7] p-5 flex items-start justify-between gap-4"
                      >
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.12em] text-[#7A5E4B]">
                            {s.city}, {s.state} · {s.supplierType}
                          </p>
                          <h4 className="font-serif text-xl font-semibold text-[#3A2319] mt-0.5">
                            {s.businessName}
                          </h4>
                          <p className="text-xs text-[#5C4537] mt-1 line-clamp-2">
                            {s.craftHeritageSummary}
                          </p>
                        </div>
                        <div className="flex flex-col gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => onNavigate(`/suppliers/${s.id}`)}
                            className="px-3 py-1.5 bg-[#3A2319] text-[#FFFCF6] text-xs cursor-pointer"
                          >
                            Storefront
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleSavedSupplier(s.id)}
                            className="px-3 py-1.5 border border-[#E9DCC7] text-xs text-[#7A5E4B] cursor-pointer"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 7: MESSAGES & NOTIFICATIONS                                */}
          {/* ============================================================== */}
          {activeTab === 'messages' && (
            <MessagingCenter user={user} onToast={onToast} onNavigate={onNavigate} />
          )}

          {/* ============================================================== */}
          {/* TAB 8: SPEND ANALYTICS                                         */}
          {/* ============================================================== */}
          {activeTab === 'analytics' && (
            <div className="space-y-6">
              <div>
                <p className="text-[11px] uppercase tracking-[0.14em] text-[#B05330]">
                  Procurement Intelligence · Demo Ledger
                </p>
                <h2 className="font-serif text-3xl font-semibold text-[#3A2319] mt-0.5">
                  Buyer Spend by Craft Category
                </h2>
              </div>

              <div className="bg-[#FFFCF6] border border-[#E9DCC7] p-6">
                <h3 className="font-serif text-xl font-semibold text-[#3A2319] mb-4">
                  Total Purchase Order Spend (INR)
                </h3>
                {spendByCategory.length === 0 ? (
                  <p className="text-sm text-[#7A5E4B] py-12 text-center">
                    No purchase orders recorded yet.
                  </p>
                ) : (
                  <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={spendByCategory}
                        margin={{ top: 10, right: 20, left: 20, bottom: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#E9DCC7" />
                        <XAxis dataKey="category" tick={{ fill: '#3A2319', fontSize: 12 }} />
                        <YAxis
                          tick={{ fill: '#7A5E4B', fontSize: 11 }}
                          tickFormatter={(v) => `₹${Math.round(Number(v) / 1000)}k`}
                        />
                        <Tooltip
                          formatter={(val: any) => [formatInr(Number(val)), 'PO Spend']}
                          contentStyle={{
                            backgroundColor: '#FFFCF6',
                            borderColor: '#E9DCC7',
                            fontSize: 12,
                          }}
                        />
                        <Bar dataKey="spendInr" fill="#B05330" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              <div className="bg-[#FFFCF6] border border-[#E9DCC7] overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F8F3E8] border-b border-[#E9DCC7] text-[11px] uppercase tracking-[0.1em] text-[#7A5E4B]">
                    <tr>
                      <th className="py-3 px-4">Craft Category</th>
                      <th className="py-3 px-4 text-right">Purchase Orders</th>
                      <th className="py-3 px-4 text-right">Committed Value (INR)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E9DCC7]">
                    {spendByCategory.map((row) => (
                      <tr key={row.category}>
                        <td className="py-3 px-4 font-medium text-[#3A2319]">{row.category}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">
                          {row.orders}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-[#B05330] tabular-nums">
                          {formatInr(row.spendInr)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ==================================================================== */}
      {/* MODAL: HUMAN APPROVAL & PURCHASE ORDER DRAFT                         */}
      {/* ==================================================================== */}
      {poModalQuote && (
        <div className="fixed inset-0 z-50 bg-[#3A2319]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FFFCF6] border border-[#E9DCC7] max-w-xl w-full p-6 sm:p-8 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.14em] text-[#B05330] font-medium">
                  Procurement Agent · Explicit Human Approval Gate
                </p>
                <h3 className="font-serif text-2xl sm:text-3xl font-semibold text-[#3A2319] mt-1">
                  Draft & Authorize Purchase Order
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPoModalQuote(null)}
                className="p-1.5 text-[#7A5E4B] hover:text-[#3A2319] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-[#F8F3E8] border border-[#E9DCC7] p-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[#7A5E4B]">Selected Supplier</span>
                <span className="font-semibold text-[#3A2319]">{poModalQuote.supplierName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#7A5E4B]">Quotation Reference</span>
                <span className="font-mono text-[#3A2319]">{poModalQuote.quoteCode}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#7A5E4B]">Unit Price × Quantity</span>
                <span className="font-mono tabular-nums text-[#3A2319]">
                  {formatInr(poModalQuote.unitPriceInr)} × {poModalQuote.rfqQuantity} units
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#7A5E4B]">Product Subtotal</span>
                <span className="font-mono tabular-nums text-[#3A2319]">
                  {formatInr(poModalQuote.totalProductCostInr)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#7A5E4B]">Estimated Logistics / Packing</span>
                <span className="font-mono tabular-nums text-[#3A2319]">
                  {formatInr(poModalQuote.shippingEstimateInr)}
                </span>
              </div>
              <div className="pt-2 border-t border-[#E9DCC7] flex justify-between text-sm font-semibold">
                <span className="text-[#3A2319]">Total Landed PO Value</span>
                <span className="font-mono text-[#B05330] tabular-nums">
                  {formatInr(poModalQuote.totalLandedCostInr)}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#3A2319] mb-1">
                Confirmed Delivery Destination
              </label>
              <input
                type="text"
                value={poDeliveryLocation}
                onChange={(e) => setPoDeliveryLocation(e.target.value)}
                className="w-full bg-[#FFFCF6] border border-[#3A2319]/30 px-3 py-2 text-sm text-[#3A2319]"
              />
            </div>

            <label className="flex items-start gap-3 p-3.5 border border-[#E9DCC7] bg-[#F8F3E8]/60 text-xs text-[#3A2319] cursor-pointer">
              <input
                type="checkbox"
                checked={poHumanConfirmed}
                onChange={(e) => setPoHumanConfirmed(e.target.checked)}
                className="mt-0.5 accent-[#B05330]"
              />
              <span>
                <strong>Formal Buyer Commercial Approval:</strong> I confirm the unit pricing,
                lead time ({poModalQuote.estimatedProductionDays} days), and supplier terms. No AI
                agent executes a binding Purchase Order without this confirmation. Settlement uses
                Folkform&apos;s simulated demo escrow adapter.
              </span>
            </label>

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={poSubmitting}
                onClick={() => handleCreatePurchaseOrder(false)}
                className="px-4 py-2.5 border border-[#3A2319] text-xs font-medium text-[#3A2319] hover:bg-[#F8F3E8] cursor-pointer"
              >
                Save as Draft (Approve Later)
              </button>
              <button
                type="button"
                disabled={poSubmitting || !poHumanConfirmed}
                onClick={() => handleCreatePurchaseOrder(true)}
                className="px-5 py-2.5 bg-[#B05330] text-[#FFFCF6] text-xs font-medium hover:bg-[#974426] disabled:opacity-45 flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                {poSubmitting ? 'Issuing PO…' : 'Approve & Issue Purchase Order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: CREATE STRUCTURED RFQ                                         */}
      {/* ==================================================================== */}
      {showNewRfqModal && (
        <div className="fixed inset-0 z-50 bg-[#3A2319]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FFFCF6] border border-[#E9DCC7] max-w-2xl w-full p-6 sm:p-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <p className="text-[11px] uppercase tracking-[0.14em] text-[#B05330]">
                  Structured Bulk Procurement Brief
                </p>
                <h3 className="font-serif text-3xl font-semibold text-[#3A2319] mt-0.5">
                  Create New Request for Quotation
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowNewRfqModal(false)}
                className="p-1.5 text-[#7A5E4B] hover:text-[#3A2319] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRfq} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block font-medium text-[#3A2319] mb-1">RFQ Title *</label>
                  <input
                    required
                    value={newRfq.title}
                    onChange={(e) => setNewRfq({ ...newRfq, title: e.target.value })}
                    placeholder="e.g., 300 Hand-Hammered Brass Table Lamps for Lobby Suite"
                    className="w-full bg-[#FFFCF6] border border-[#E9DCC7] px-3 py-2 text-sm text-[#3A2319]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#3A2319] mb-1">Craft Category *</label>
                  <select
                    value={newRfq.categorySlugOrId}
                    onChange={(e) => setNewRfq({ ...newRfq, categorySlugOrId: e.target.value })}
                    className="w-full bg-[#FFFCF6] border border-[#E9DCC7] px-3 py-2 text-sm text-[#3A2319]"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.slug}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-[#3A2319] mb-1">
                    Order Quantity (Units) *
                  </label>
                  <input
                    required
                    type="number"
                    min={10}
                    value={newRfq.quantity}
                    onChange={(e) => setNewRfq({ ...newRfq, quantity: Number(e.target.value) })}
                    className="w-full bg-[#FFFCF6] border border-[#E9DCC7] px-3 py-2 text-sm font-mono text-[#3A2319]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#3A2319] mb-1">
                    Budget Min (INR / unit)
                  </label>
                  <input
                    type="number"
                    value={newRfq.budgetMinInr}
                    onChange={(e) => setNewRfq({ ...newRfq, budgetMinInr: Number(e.target.value) })}
                    className="w-full bg-[#FFFCF6] border border-[#E9DCC7] px-3 py-2 text-sm font-mono text-[#3A2319]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#3A2319] mb-1">
                    Budget Max (INR / unit)
                  </label>
                  <input
                    type="number"
                    value={newRfq.budgetMaxInr}
                    onChange={(e) =>
                      setNewRfq({
                        ...newRfq,
                        budgetMaxInr: Number(e.target.value),
                        targetUnitPriceInr: Number(e.target.value),
                      })
                    }
                    className="w-full bg-[#FFFCF6] border border-[#E9DCC7] px-3 py-2 text-sm font-mono text-[#3A2319]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#3A2319] mb-1">
                    Preferred Materials
                  </label>
                  <input
                    value={newRfq.preferredMaterials}
                    onChange={(e) => setNewRfq({ ...newRfq, preferredMaterials: e.target.value })}
                    placeholder="e.g., Lead-free ceramic, solid brass"
                    className="w-full bg-[#FFFCF6] border border-[#E9DCC7] px-3 py-2 text-sm text-[#3A2319]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#3A2319] mb-1">Craft Technique</label>
                  <input
                    value={newRfq.craftTechnique}
                    onChange={(e) => setNewRfq({ ...newRfq, craftTechnique: e.target.value })}
                    placeholder="e.g., Wheel-thrown blue pottery, sand-casting"
                    className="w-full bg-[#FFFCF6] border border-[#E9DCC7] px-3 py-2 text-sm text-[#3A2319]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#3A2319] mb-1">
                    Delivery Destination *
                  </label>
                  <input
                    required
                    value={newRfq.deliveryLocation}
                    onChange={(e) => setNewRfq({ ...newRfq, deliveryLocation: e.target.value })}
                    className="w-full bg-[#FFFCF6] border border-[#E9DCC7] px-3 py-2 text-sm text-[#3A2319]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#3A2319] mb-1">
                    Required Lead Time (Days)
                  </label>
                  <input
                    type="number"
                    min={7}
                    value={newRfq.requiredLeadDays}
                    onChange={(e) =>
                      setNewRfq({ ...newRfq, requiredLeadDays: Number(e.target.value) })
                    }
                    className="w-full bg-[#FFFCF6] border border-[#E9DCC7] px-3 py-2 text-sm font-mono text-[#3A2319]"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-medium text-[#3A2319] mb-1">
                    Detailed Product & Hospitality / Retail Brief *
                  </label>
                  <textarea
                    required
                    rows={3}
                    value={newRfq.description}
                    onChange={(e) => setNewRfq({ ...newRfq, description: e.target.value })}
                    placeholder="Specify dimensions, colourways, electrical/food-safe requirements, and quality inspection criteria..."
                    className="w-full bg-[#FFFCF6] border border-[#E9DCC7] px-3 py-2 text-sm text-[#3A2319]"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-medium text-[#3A2319] mb-1">
                    Customisation & Packaging Requirements
                  </label>
                  <input
                    value={newRfq.customisationRequirements}
                    onChange={(e) =>
                      setNewRfq({ ...newRfq, customisationRequirements: e.target.value })
                    }
                    placeholder="e.g., Custom glaze tone, debossed private label hangtag, CE wiring"
                    className="w-full bg-[#FFFCF6] border border-[#E9DCC7] px-3 py-2 text-sm text-[#3A2319]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-[#E9DCC7]">
                <button
                  type="button"
                  onClick={() => setShowNewRfqModal(false)}
                  className="px-4 py-2 border border-[#E9DCC7] text-xs text-[#3A2319] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingRfq}
                  className="px-5 py-2 bg-[#B05330] text-[#FFFCF6] text-xs font-medium hover:bg-[#974426] cursor-pointer"
                >
                  {creatingRfq ? 'Dispatching RFQ…' : 'Submit & Notify Matched Suppliers'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
