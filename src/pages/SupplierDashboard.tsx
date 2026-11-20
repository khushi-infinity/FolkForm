import React, { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  BarChart3,
  Check,
  FileDown,
  FileText,
  Inbox,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Package,
  Plus,
  ShieldCheck,
  Sparkles,
  Store,
  UserCheck,
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
} from '../types';

interface SupplierDashboardProps {
  user: AuthUser;
  tab: string;
  onNavigate: (path: string) => void;
  onDemoSwitch: (role: 'buyer' | 'supplier' | 'admin') => Promise<void>;
  onUserUpdated: (user: AuthUser) => void;
  onLogout: () => void;
  onToast: (msg: string) => void;
}

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'rfqs', label: 'RFQ Inbox', icon: Inbox },
  { id: 'products', label: 'My Catalogue', icon: Store },
  { id: 'quotations', label: 'Quotations', icon: FileText },
  { id: 'orders', label: 'Production & Orders', icon: Package },
  { id: 'messages', label: 'Messages', icon: MessageSquare },
  { id: 'profile', label: 'Workshop & KYC', icon: UserCheck },
  { id: 'analytics', label: 'Revenue & Payouts', icon: BarChart3 },
];

export const SupplierDashboard: React.FC<SupplierDashboardProps> = ({
  user,
  tab,
  onNavigate,
  onDemoSwitch,
  onUserUpdated,
  onLogout,
  onToast,
}) => {
  const activeTab = NAV_ITEMS.some((n) => n.id === tab) ? tab : 'overview';
  const sup = user.supplierProfile;

  const [kpis, setKpis] = useState({
    totalProducts: 0,
    activeRfqs: 0,
    pendingQuotations: 0,
    activeOrders: 0,
    realisedRevenueInr: 0,
    pipelineOrderValueInr: 0,
  });
  const [myProducts, setMyProducts] = useState<Product[]>([]);
  const [verification, setVerification] = useState<{
    documentType: string;
    documentRef: string;
    status: string;
    reviewNotes?: string;
    submittedNotes?: string;
  } | null>(null);
  const [rfqs, setRfqs] = useState<RfqRecord[]>([]);
  const [quotations, setQuotations] = useState<QuotationRecord[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);

  // Submit Quotation modal state
  const [quoteRfq, setQuoteRfq] = useState<RfqRecord | null>(null);
  const [quoteForm, setQuoteForm] = useState({
    unitPriceInr: 1080,
    moq: 100,
    availableCapacity: 600,
    estimatedProductionDays: 22,
    shippingEstimateInr: 22000,
    customisationNotes: '',
    conditions: '30% advance upon PO confirmation, 70% prior to dispatch; export-grade crating included.',
    validityDays: 21,
  });
  const [submittingQuote, setSubmittingQuote] = useState(false);

  // Add Product modal state + Provenance Assistant (Agent 8)
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [addingProduct, setAddingProduct] = useState(false);
  const [draftingProvenance, setDraftingProvenance] = useState(false);
  const [provenanceNote, setProvenanceNote] = useState<string | null>(null);
  const [prodForm, setProdForm] = useState({
    name: '',
    categoryId: 'cat-pottery',
    description: '',
    craftTechnique: 'Hand-thrown stoneware & cobalt mineral glaze',
    materials: 'Quartz-blended local clay, lead-free mineral pigment, solid brass fitting',
    moq: 50,
    indicativePriceInr: 1150,
    availableQty: 400,
    leadTimeDays: 21,
    customisationOptions: 'Custom glaze palette, linen shade finish, CE/UL export wiring',
    specDimensions: 'Height 38 cm × Diameter 21 cm',
    specPackaging: 'Individual 5-ply corrugated box with honeycomb dividers',
  });

  // Profile & KYC update form
  const [profileForm, setProfileForm] = useState({
    businessName: sup?.businessName || '',
    craftHeritageSummary: sup?.craftHeritageSummary || '',
    monthlyCapacityUnits: sup?.monthlyCapacityUnits || 500,
    defaultMoq: sup?.defaultMoq || 100,
    defaultLeadTimeDays: sup?.defaultLeadTimeDays || 21,
    customisationSupported: sup?.customisationSupported ?? true,
    exportReady: sup?.exportReady ?? true,
    verificationDocType: 'Craft Cluster / MSME Udyam Certificate',
    verificationDocRef: '',
    verificationNotes: '',
  });
  const [savingProfile, setSavingProfile] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [dashRes, rfqRes, quoteRes, ordRes, catRes] = await Promise.all([
        apiRequest<{
          kpis: typeof kpis;
          myProducts: Product[];
          verification: typeof verification;
        }>('/supplier/dashboard'),
        apiRequest<{ rfqs: RfqRecord[] }>('/rfqs'),
        apiRequest<{ quotations: QuotationRecord[] }>('/quotations'),
        apiRequest<{ orders: PurchaseOrder[] }>('/orders'),
        apiRequest<{ categories: ProductCategory[] }>('/categories'),
      ]);
      setKpis(dashRes.kpis);
      setMyProducts(dashRes.myProducts);
      setVerification(dashRes.verification);
      setRfqs(rfqRes.rfqs);
      setQuotations(quoteRes.quotations);
      setOrders(ordRes.orders);
      setCategories(catRes.categories);
    } catch (err: any) {
      onToast(err.message || 'Unable to load supplier portal.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [user.id]);

  const openQuoteModal = (rfq: RfqRecord) => {
    setQuoteRfq(rfq);
    const suggestedUnit =
      rfq.budgetMinInr && rfq.budgetMaxInr
        ? Math.round((rfq.budgetMinInr + rfq.budgetMaxInr) / 2)
        : rfq.targetUnitPriceInr || 1100;
    setQuoteForm({
      unitPriceInr: suggestedUnit,
      moq: Math.min(sup?.defaultMoq || 100, rfq.quantity),
      availableCapacity: sup?.monthlyCapacityUnits || 600,
      estimatedProductionDays: Math.min(
        sup?.defaultLeadTimeDays || 22,
        rfq.requiredLeadDays || 25,
      ),
      shippingEstimateInr: Math.round(rfq.quantity * 45),
      customisationNotes: rfq.customisationRequirements || 'Custom finish & export packaging supported.',
      conditions: '30% advance upon PO confirmation, 70% prior to dispatch; breakage buffer 2%.',
      validityDays: 21,
    });
  };

  const handleSubmitQuotation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quoteRfq) return;
    setSubmittingQuote(true);
    try {
      const res = await apiRequest<{ id: string; quoteCode: string }>('/quotations', {
        method: 'POST',
        body: {
          rfqId: quoteRfq.id,
          ...quoteForm,
        },
      });
      onToast(`Submitted quotation ${res.quoteCode} to ${quoteRfq.buyerCompany || 'Buyer'}.`);
      setQuoteRfq(null);
      await loadAll();
    } catch (err: any) {
      onToast(err.message);
    } finally {
      setSubmittingQuote(false);
    }
  };

  const handleDraftProvenance = async () => {
    if (!prodForm.name.trim() || !prodForm.materials.trim() || !prodForm.craftTechnique.trim()) {
      onToast('Enter product name, materials, and craft technique first so Provenance Assistant stays strictly factual.');
      return;
    }
    setDraftingProvenance(true);
    setProvenanceNote(null);
    try {
      const res = await apiRequest<{
        description: string;
        provenanceNote: string;
        providerUsed: string;
      }>('/ai/provenance-draft', {
        method: 'POST',
        body: {
          productName: prodForm.name,
          originCity: sup?.city || 'Jaipur',
          originState: sup?.state || 'Rajasthan',
          materials: prodForm.materials,
          craftTechnique: prodForm.craftTechnique,
          customisationOptions: prodForm.customisationOptions,
        },
      });
      setProdForm((prev) => ({ ...prev, description: res.description }));
      setProvenanceNote(res.provenanceNote);
      onToast('Provenance Assistant drafted honest catalog copy from your workshop facts.');
    } catch (err: any) {
      onToast(err.message);
    } finally {
      setDraftingProvenance(false);
    }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddingProduct(true);
    try {
      const res = await apiRequest<{ id: string; sku: string }>('/supplier/products', {
        method: 'POST',
        body: {
          name: prodForm.name,
          categoryId: prodForm.categoryId,
          description: prodForm.description,
          craftTechnique: prodForm.craftTechnique,
          materials: prodForm.materials,
          moq: prodForm.moq,
          indicativePriceInr: prodForm.indicativePriceInr,
          availableQty: prodForm.availableQty,
          leadTimeDays: prodForm.leadTimeDays,
          customisationOptions: prodForm.customisationOptions,
          specifications: [
            { specKey: 'Dimensions', specValue: prodForm.specDimensions },
            { specKey: 'Export Packaging', specValue: prodForm.specPackaging },
          ],
        },
      });
      onToast(`Published product ${res.sku} to the Folkform B2B marketplace.`);
      setShowAddProduct(false);
      setProvenanceNote(null);
      setProdForm((prev) => ({ ...prev, name: '', description: '' }));
      await loadAll();
    } catch (err: any) {
      onToast(err.message);
    } finally {
      setAddingProduct(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const payload: Record<string, any> = {
        businessName: profileForm.businessName,
        craftHeritageSummary: profileForm.craftHeritageSummary,
        monthlyCapacityUnits: profileForm.monthlyCapacityUnits,
        defaultMoq: profileForm.defaultMoq,
        defaultLeadTimeDays: profileForm.defaultLeadTimeDays,
        customisationSupported: profileForm.customisationSupported,
        exportReady: profileForm.exportReady,
      };
      if (profileForm.verificationDocRef.trim()) {
        payload.verificationDocType = profileForm.verificationDocType;
        payload.verificationDocRef = profileForm.verificationDocRef.trim();
        payload.verificationNotes = profileForm.verificationNotes.trim() || undefined;
      }
      const res = await apiRequest<{ ok: boolean; user: AuthUser }>('/supplier/profile', {
        method: 'PATCH',
        body: payload,
      });
      if (res.user) onUserUpdated(res.user);
      setProfileForm((p) => ({ ...p, verificationDocRef: '', verificationNotes: '' }));
      onToast(
        payload.verificationDocRef
          ? 'Workshop profile updated & verification evidence submitted for admin review.'
          : 'Workshop capacity & heritage profile updated.',
      );
      await loadAll();
    } catch (err: any) {
      onToast(err.message);
    } finally {
      setSavingProfile(false);
    }
  };

  const orderRevenueChart = orders
    .filter((o) => o.status !== 'cancelled')
    .map((o) => ({
      po: o.poNumber.replace('PO-2026-', '#'),
      grossInr: o.subtotalInr,
      netPayoutInr: o.subtotalInr - o.platformCommissionInr,
    }));

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
          <span className="text-[10px] uppercase tracking-[0.14em] text-[#6F8069] font-medium">
            Artisan Hub
          </span>
        </div>

        <div className="px-5 py-4 border-b border-[#E9DCC7]/70">
          <p className="text-xs font-semibold text-[#3A2319] truncate">
            {sup?.businessName || user.fullName}
          </p>
          <p className="text-[11px] text-[#7A5E4B] truncate mt-0.5">
            {sup?.city}, {sup?.state} ·{' '}
            {formatVerificationLabel(sup?.verificationStatus || 'pending', sup?.isDemo)}
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
                onClick={() => onNavigate(`/supplier/${item.id}`)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#3A2319] text-[#FFFCF6] font-medium'
                    : 'text-[#3A2319]/80 hover:bg-[#F8F3E8] hover:text-[#3A2319]'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
                {item.id === 'rfqs' && rfqs.length > 0 && (
                  <span
                    className={`ml-auto font-mono text-[11px] tabular-nums ${
                      active ? 'text-[#BE9753]' : 'text-[#7A5E4B]'
                    }`}
                  >
                    {rfqs.length}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#E9DCC7] space-y-2">
          {sup && (
            <button
              type="button"
              onClick={() => onNavigate(`/suppliers/${sup.id}`)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs text-[#3A2319] border border-[#E9DCC7] hover:bg-[#F8F3E8] cursor-pointer"
            >
              <span>View Public Storefront</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          )}
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
              Artisan Supplier Portal ·{' '}
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
                className="px-2.5 py-1 text-[#3A2319] hover:bg-[#FFFCF6] cursor-pointer"
              >
                Buyer
              </button>
              <button
                type="button"
                onClick={() => onDemoSwitch('supplier')}
                className="px-2.5 py-1 bg-[#3A2319] text-[#FFFCF6] font-medium cursor-pointer"
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
              onClick={() => setShowAddProduct(true)}
              className="px-3.5 py-1.5 bg-[#B05330] text-[#FFFCF6] text-xs font-medium hover:bg-[#974426] flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Craft SKU
            </button>
          </div>
        </header>

        {/* Mobile Touch-Friendly Nav */}
        <div className="lg:hidden overflow-x-auto bg-[#FFFCF6] border-b border-[#E9DCC7] px-4 py-2 flex gap-1.5">
          {NAV_ITEMS.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(`/supplier/${item.id}`)}
                className={`px-3 py-1.5 text-xs whitespace-nowrap cursor-pointer ${
                  active ? 'bg-[#3A2319] text-[#FFFCF6] font-medium' : 'text-[#3A2319] bg-[#F8F3E8]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <main className="flex-1 p-5 sm:p-8 max-w-[1360px] w-full mx-auto">
          {loading && activeTab === 'overview' ? (
            <div className="py-16 text-center text-sm text-[#7A5E4B]">
              Loading artisan studio workspace…
            </div>
          ) : null}

          {/* ============================================================== */}
          {/* TAB 1: OVERVIEW                                                */}
          {/* ============================================================== */}
          {activeTab === 'overview' && (
            <div className="space-y-8">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-[#6F8069] font-medium">
                    {sup?.supplierType || 'Artisan Workshop'} · {sup?.city}, {sup?.state}
                  </p>
                  <h1 className="font-serif text-4xl font-semibold text-[#3A2319] mt-1">
                    {sup?.businessName || user.fullName}
                  </h1>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onNavigate('/supplier/rfqs')}
                    className="px-4 py-2.5 bg-[#3A2319] text-[#FFFCF6] text-xs font-medium hover:bg-[#523326] cursor-pointer"
                  >
                    Open RFQ Inbox ({rfqs.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('/supplier/orders')}
                    className="px-4 py-2.5 border border-[#3A2319] text-[#3A2319] text-xs font-medium hover:bg-[#E9DCC7]/40 cursor-pointer"
                  >
                    Manage Production ({kpis.activeOrders})
                  </button>
                </div>
              </div>

              {/* KPI Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
                {[
                  { label: 'Active Products', value: String(kpis.totalProducts) },
                  { label: 'Matching RFQs', value: String(kpis.activeRfqs) },
                  { label: 'Open Quotations', value: String(kpis.pendingQuotations) },
                  { label: 'Active Orders', value: String(kpis.activeOrders) },
                  {
                    label: 'Realised Net Payout',
                    value: formatInr(kpis.realisedRevenueInr),
                  },
                  {
                    label: 'Active Pipeline',
                    value: formatInr(kpis.pipelineOrderValueInr),
                  },
                ].map((k) => (
                  <div key={k.label} className="bg-[#FFFCF6] border border-[#E9DCC7] p-4">
                    <span className="text-[11px] uppercase tracking-[0.1em] text-[#7A5E4B]">
                      {k.label}
                    </span>
                    <p className="font-mono text-xl font-semibold text-[#3A2319] tabular-nums mt-2">
                      {k.value}
                    </p>
                  </div>
                ))}
              </div>

              {/* Incoming RFQs + Orders Requiring Workshop Action */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-[#FFFCF6] border border-[#E9DCC7] p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-serif text-2xl font-semibold text-[#3A2319]">
                      Incoming Buyer RFQs
                    </h3>
                    <button
                      type="button"
                      onClick={() => onNavigate('/supplier/rfqs')}
                      className="text-xs text-[#B05330] font-medium hover:underline cursor-pointer"
                    >
                      All RFQs
                    </button>
                  </div>
                  <div className="divide-y divide-[#E9DCC7]">
                    {rfqs.slice(0, 4).map((r) => {
                      const alreadyQuoted = (r.quotations?.length ?? 0) > 0;
                      return (
                        <div key={r.id} className="py-3.5 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[11px] text-[#7A5E4B]">
                              <span className="font-mono font-medium text-[#3A2319]">
                                {r.rfqCode}
                              </span>{' '}
                              · {r.quantity} units · {r.deliveryLocation}
                            </p>
                            <p className="text-sm font-medium text-[#3A2319] truncate mt-0.5">
                              {r.title}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => openQuoteModal(r)}
                            className={`px-3 py-1.5 text-xs shrink-0 cursor-pointer ${
                              alreadyQuoted
                                ? 'border border-[#E9DCC7] text-[#7A5E4B] hover:border-[#3A2319]'
                                : 'bg-[#B05330] text-[#FFFCF6] font-medium'
                            }`}
                          >
                            {alreadyQuoted ? 'Revise Quote' : 'Submit Quote'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-[#FFFCF6] border border-[#E9DCC7] p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-serif text-2xl font-semibold text-[#3A2319]">
                      Production & Order Queue
                    </h3>
                    <button
                      type="button"
                      onClick={() => onNavigate('/supplier/orders')}
                      className="text-xs text-[#B05330] font-medium hover:underline cursor-pointer"
                    >
                      Update Milestones
                    </button>
                  </div>
                  <div className="divide-y divide-[#E9DCC7]">
                    {orders.slice(0, 4).map((o) => (
                      <div key={o.id} className="py-3.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[11px] text-[#7A5E4B]">
                            <span className="font-mono font-medium text-[#3A2319]">
                              {o.poNumber}
                            </span>{' '}
                            · {o.buyerCompany} · {o.quantity} units
                          </p>
                          <p className="text-sm font-medium text-[#3A2319] truncate mt-0.5">
                            {o.title}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-mono text-xs font-semibold text-[#3A2319] tabular-nums">
                            {formatInr(o.subtotalInr)}
                          </p>
                          <p className="text-[11px] text-[#B05330]">
                            {formatOrderStatus(o.status)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 2: SUPPLIER RFQ INBOX                                      */}
          {/* ============================================================== */}
          {activeTab === 'rfqs' && (
            <div className="space-y-6">
              <div>
                <p className="text-[11px] uppercase tracking-[0.14em] text-[#B05330]">
                  Matched Global Bulk Demand
                </p>
                <h2 className="font-serif text-3xl font-semibold text-[#3A2319] mt-0.5">
                  RFQ Inbox ({rfqs.length})
                </h2>
              </div>

              <div className="space-y-4">
                {rfqs.map((r) => {
                  const myQuotes = r.quotations ?? [];
                  return (
                    <div
                      key={r.id}
                      className="bg-[#FFFCF6] border border-[#E9DCC7] p-6 space-y-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-[#7A5E4B]">
                            <span className="font-mono font-semibold text-[#3A2319]">
                              {r.rfqCode}
                            </span>
                            <span>·</span>
                            <span>{r.buyerCompany || r.buyerName}</span>
                            <span>·</span>
                            <span>{r.categoryName}</span>
                            <span>·</span>
                            <span className="text-[#B05330] font-medium">
                              {formatOrderStatus(r.status)}
                            </span>
                          </div>
                          <h3 className="font-serif text-2xl font-semibold text-[#3A2319] mt-1">
                            {r.title}
                          </h3>
                          <p className="text-sm text-[#5C4537] mt-1 max-w-3xl leading-relaxed">
                            {r.description}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => openQuoteModal(r)}
                          className="px-5 py-2.5 bg-[#B05330] text-[#FFFCF6] text-xs font-medium uppercase tracking-[0.1em] hover:bg-[#974426] shrink-0 cursor-pointer"
                        >
                          {myQuotes.length > 0 ? 'Submit Revised Quotation' : 'Submit Quotation'}
                        </button>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 pt-4 border-t border-[#E9DCC7]/70 text-xs">
                        <div>
                          <span className="text-[#7A5E4B] block">Quantity Needed</span>
                          <span className="font-mono font-semibold text-[#3A2319] tabular-nums">
                            {r.quantity.toLocaleString('en-IN')} units
                          </span>
                        </div>
                        <div>
                          <span className="text-[#7A5E4B] block">Buyer Target Budget</span>
                          <span className="font-mono font-semibold text-[#3A2319] tabular-nums">
                            {r.budgetMinInr && r.budgetMaxInr
                              ? `${formatInr(r.budgetMinInr)} – ${formatInr(r.budgetMaxInr)}`
                              : formatInr(r.targetUnitPriceInr)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#7A5E4B] block">Delivery Location</span>
                          <span className="font-medium text-[#3A2319]">{r.deliveryLocation}</span>
                        </div>
                        <div>
                          <span className="text-[#7A5E4B] block">Target Lead Time</span>
                          <span className="font-mono font-medium text-[#3A2319] tabular-nums">
                            {r.requiredLeadDays ? `${r.requiredLeadDays} days` : 'Flexible'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#7A5E4B] block">Your Quotes Submitted</span>
                          <span className="font-mono font-semibold text-[#6F8069] tabular-nums">
                            {myQuotes.length}
                          </span>
                        </div>
                      </div>

                      {myQuotes.length > 0 && (
                        <div className="bg-[#F8F3E8] border border-[#E9DCC7] p-3 text-xs flex flex-wrap items-center justify-between gap-2">
                          <span>
                            Latest offer: <strong className="font-mono">{myQuotes[0].quoteCode}</strong>{' '}
                            at <strong className="font-mono">{formatInr(myQuotes[0].unitPriceInr)}/unit</strong>{' '}
                            (Total landed {formatInr(myQuotes[0].totalLandedCostInr)} ·{' '}
                            {myQuotes[0].estimatedProductionDays} days)
                          </span>
                          <span className="text-[#B05330] font-medium">
                            {formatOrderStatus(myQuotes[0].status)}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 3: MY PRODUCT CATALOGUE + PROVENANCE ASSISTANT             */}
          {/* ============================================================== */}
          {activeTab === 'products' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-[#B05330]">
                    B2B Export Catalogue
                  </p>
                  <h2 className="font-serif text-3xl font-semibold text-[#3A2319] mt-0.5">
                    Workshop Products ({myProducts.length})
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddProduct(true)}
                  className="px-4 py-2.5 bg-[#B05330] text-[#FFFCF6] text-xs font-medium hover:bg-[#974426] flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add New Craft Product
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {myProducts.map((p) => (
                  <div key={p.id} className="bg-[#FFFCF6] border border-[#E9DCC7] flex flex-col">
                    <div className="aspect-[4/3] bg-[#E9DCC7]/30 overflow-hidden">
                      <CraftImage
                        src={p.imageUrl}
                        alt={p.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="p-5 flex-1 flex flex-col justify-between space-y-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.12em] text-[#7A5E4B]">
                          <span className="font-mono text-[#3A2319]">{p.sku}</span> ·{' '}
                          {p.categoryName} · {p.status}
                        </p>
                        <h3 className="font-serif text-xl font-semibold text-[#3A2319] mt-1">
                          {p.name}
                        </h3>
                        <p className="text-xs text-[#5C4537] mt-1 line-clamp-2">{p.description}</p>
                      </div>
                      <div className="pt-3 border-t border-[#E9DCC7] grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <span className="text-[10px] text-[#7A5E4B] block">Indicative</span>
                          <span className="font-mono font-semibold text-[#B05330] tabular-nums">
                            {formatInr(p.indicativePriceInr)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-[#7A5E4B] block">MOQ</span>
                          <span className="font-mono font-medium text-[#3A2319] tabular-nums">
                            {p.moq}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-[#7A5E4B] block">Lead Time</span>
                          <span className="font-mono font-medium text-[#3A2319] tabular-nums">
                            {p.leadTimeDays}d
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 4: SUBMITTED QUOTATIONS                                    */}
          {/* ============================================================== */}
          {activeTab === 'quotations' && (
            <div className="space-y-6">
              <div>
                <p className="text-[11px] uppercase tracking-[0.14em] text-[#B05330]">
                  Commercial Proposals Issued
                </p>
                <h2 className="font-serif text-3xl font-semibold text-[#3A2319] mt-0.5">
                  Submitted Quotations ({quotations.length})
                </h2>
              </div>

              <div className="bg-[#FFFCF6] border border-[#E9DCC7] overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F8F3E8] border-b border-[#E9DCC7] text-[11px] uppercase tracking-[0.1em] text-[#7A5E4B]">
                    <tr>
                      <th className="py-3 px-4">Quote Code</th>
                      <th className="py-3 px-4">RFQ & Product</th>
                      <th className="py-3 px-4 text-right">Unit Price</th>
                      <th className="py-3 px-4 text-right">Landed Total</th>
                      <th className="py-3 px-4 text-right">Lead Time</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Document</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E9DCC7]">
                    {quotations.map((q) => (
                      <tr key={q.id} className="hover:bg-[#F8F3E8]/50">
                        <td className="py-3 px-4 font-mono font-medium text-[#3A2319]">
                          {q.quoteCode}
                          <span className="block text-[10px] text-[#7A5E4B]">
                            {formatDate(q.createdAt)}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-mono text-[#7A5E4B]">{q.rfqCode}</span>
                          <p className="font-medium text-[#3A2319]">{q.rfqTitle}</p>
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">
                          {formatInr(q.unitPriceInr)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-[#B05330] tabular-nums">
                          {formatInr(q.totalLandedCostInr)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">
                          {q.estimatedProductionDays}d
                        </td>
                        <td className="py-3 px-4 font-medium">{formatOrderStatus(q.status)}</td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => downloadQuotationPdf(q)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 border border-[#E9DCC7] hover:border-[#3A2319] text-[#3A2319] cursor-pointer"
                          >
                            <FileDown className="w-3.5 h-3.5" />
                            PDF
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 5: PRODUCTION & ORDER LIFECYCLE                            */}
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
          {/* TAB 6: MESSAGES                                                */}
          {/* ============================================================== */}
          {activeTab === 'messages' && (
            <MessagingCenter user={user} onToast={onToast} onNavigate={onNavigate} />
          )}

          {/* ============================================================== */}
          {/* TAB 7: WORKSHOP PROFILE & VERIFICATION                         */}
          {/* ============================================================== */}
          {activeTab === 'profile' && (
            <div className="space-y-6 max-w-3xl">
              <div>
                <p className="text-[11px] uppercase tracking-[0.14em] text-[#B05330]">
                  Declared Workshop Capability & Verification
                </p>
                <h2 className="font-serif text-3xl font-semibold text-[#3A2319] mt-0.5">
                  Business Profile & KYC Evidence
                </h2>
              </div>

              <div className="bg-[#FFFCF6] border border-[#E9DCC7] p-5 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-[#3A2319] flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-[#6F8069]" />
                    Current Verification Status:{' '}
                    {formatVerificationLabel(sup?.verificationStatus || 'pending', sup?.isDemo)}
                  </p>
                  {verification && (
                    <p className="text-xs text-[#7A5E4B] mt-1">
                      Latest filing: {verification.documentType} ({verification.documentRef}) —{' '}
                      {verification.reviewNotes || verification.submittedNotes}
                    </p>
                  )}
                </div>
              </div>

              <form
                onSubmit={handleSaveProfile}
                className="bg-[#FFFCF6] border border-[#E9DCC7] p-6 space-y-5 text-xs"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block font-medium text-[#3A2319] mb-1">
                      Studio / Cooperative Business Name
                    </label>
                    <input
                      value={profileForm.businessName}
                      onChange={(e) =>
                        setProfileForm({ ...profileForm, businessName: e.target.value })
                      }
                      className="w-full bg-[#FFFCF6] border border-[#E9DCC7] px-3 py-2 text-sm text-[#3A2319]"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-[#3A2319] mb-1">
                      Declared Monthly Capacity (Units)
                    </label>
                    <input
                      type="number"
                      value={profileForm.monthlyCapacityUnits}
                      onChange={(e) =>
                        setProfileForm({
                          ...profileForm,
                          monthlyCapacityUnits: Number(e.target.value),
                        })
                      }
                      className="w-full bg-[#FFFCF6] border border-[#E9DCC7] px-3 py-2 text-sm font-mono text-[#3A2319]"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-[#3A2319] mb-1">
                      Default MOQ (Units)
                    </label>
                    <input
                      type="number"
                      value={profileForm.defaultMoq}
                      onChange={(e) =>
                        setProfileForm({ ...profileForm, defaultMoq: Number(e.target.value) })
                      }
                      className="w-full bg-[#FFFCF6] border border-[#E9DCC7] px-3 py-2 text-sm font-mono text-[#3A2319]"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-[#3A2319] mb-1">
                      Average Production Lead Time (Days)
                    </label>
                    <input
                      type="number"
                      value={profileForm.defaultLeadTimeDays}
                      onChange={(e) =>
                        setProfileForm({
                          ...profileForm,
                          defaultLeadTimeDays: Number(e.target.value),
                        })
                      }
                      className="w-full bg-[#FFFCF6] border border-[#E9DCC7] px-3 py-2 text-sm font-mono text-[#3A2319]"
                    />
                  </div>
                  <div className="flex items-center gap-6 pt-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={profileForm.customisationSupported}
                        onChange={(e) =>
                          setProfileForm({
                            ...profileForm,
                            customisationSupported: e.target.checked,
                          })
                        }
                        className="accent-[#B05330]"
                      />
                      Custom Orders Supported
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={profileForm.exportReady}
                        onChange={(e) =>
                          setProfileForm({ ...profileForm, exportReady: e.target.checked })
                        }
                        className="accent-[#B05330]"
                      />
                      Export Ready
                    </label>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-medium text-[#3A2319] mb-1">
                      Craft Heritage & Cluster Lineage
                    </label>
                    <textarea
                      rows={3}
                      value={profileForm.craftHeritageSummary}
                      onChange={(e) =>
                        setProfileForm({ ...profileForm, craftHeritageSummary: e.target.value })
                      }
                      className="w-full bg-[#FFFCF6] border border-[#E9DCC7] px-3 py-2 text-sm text-[#3A2319]"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-[#E9DCC7] space-y-3">
                  <h4 className="font-serif text-lg font-semibold text-[#3A2319]">
                    Submit New Verification Evidence (Optional)
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-medium text-[#3A2319] mb-1">
                        Document Type
                      </label>
                      <select
                        value={profileForm.verificationDocType}
                        onChange={(e) =>
                          setProfileForm({ ...profileForm, verificationDocType: e.target.value })
                        }
                        className="w-full bg-[#FFFCF6] border border-[#E9DCC7] px-3 py-2 text-sm text-[#3A2319]"
                      >
                        <option>Craft Cluster / MSME Udyam Certificate</option>
                        <option>Import Export Code (IEC) Registration</option>
                        <option>Artisan Guild / Cooperative Charter</option>
                        <option>GST Registration & Workshop Audit</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-medium text-[#3A2319] mb-1">
                        Registration / Reference ID
                      </label>
                      <input
                        value={profileForm.verificationDocRef}
                        onChange={(e) =>
                          setProfileForm({ ...profileForm, verificationDocRef: e.target.value })
                        }
                        placeholder="e.g., UDYAM-RJ-17-0049218"
                        className="w-full bg-[#FFFCF6] border border-[#E9DCC7] px-3 py-2 text-sm font-mono text-[#3A2319]"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="px-5 py-2.5 bg-[#3A2319] text-[#FFFCF6] text-xs font-medium hover:bg-[#523326] cursor-pointer"
                  >
                    {savingProfile ? 'Saving…' : 'Save Workshop Profile'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 8: REVENUE & SIMULATED SETTLEMENT PAYOUTS                  */}
          {/* ============================================================== */}
          {activeTab === 'analytics' && (
            <div className="space-y-6">
              <div>
                <p className="text-[11px] uppercase tracking-[0.14em] text-[#B05330]">
                  Artisan Earnings & Settlement Ledger (Simulated Adapter)
                </p>
                <h2 className="font-serif text-3xl font-semibold text-[#3A2319] mt-0.5">
                  Gross Order Value vs Net Artisan Payout
                </h2>
              </div>

              <div className="bg-[#FFFCF6] border border-[#E9DCC7] p-6">
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={orderRevenueChart}
                      margin={{ top: 10, right: 20, left: 20, bottom: 10 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#E9DCC7" />
                      <XAxis dataKey="po" tick={{ fill: '#3A2319', fontSize: 12 }} />
                      <YAxis
                        tick={{ fill: '#7A5E4B', fontSize: 11 }}
                        tickFormatter={(v) => `₹${Math.round(Number(v) / 1000)}k`}
                      />
                      <Tooltip
                        formatter={(val: any) => formatInr(Number(val))}
                        contentStyle={{
                          backgroundColor: '#FFFCF6',
                          borderColor: '#E9DCC7',
                          fontSize: 12,
                        }}
                      />
                      <Bar dataKey="grossInr" name="Gross Order Value" fill="#E9DCC7" />
                      <Bar dataKey="netPayoutInr" name="Net Artisan Payout" fill="#6F8069" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-[#FFFCF6] border border-[#E9DCC7] overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F8F3E8] border-b border-[#E9DCC7] text-[11px] uppercase tracking-[0.1em] text-[#7A5E4B]">
                    <tr>
                      <th className="py-3 px-4">PO Number</th>
                      <th className="py-3 px-4">Buyer</th>
                      <th className="py-3 px-4 text-right">Order Subtotal</th>
                      <th className="py-3 px-4 text-right">Platform Fee (8%)</th>
                      <th className="py-3 px-4 text-right">Net Artisan Payout</th>
                      <th className="py-3 px-4">Lifecycle Status</th>
                      <th className="py-3 px-4">Settlement</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E9DCC7]">
                    {orders.map((o) => (
                      <tr key={o.id}>
                        <td className="py-3 px-4 font-mono font-medium text-[#3A2319]">
                          {o.poNumber}
                        </td>
                        <td className="py-3 px-4">{o.buyerCompany}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">
                          {formatInr(o.subtotalInr)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-[#7A5E4B]">
                          {formatInr(o.platformCommissionInr)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-[#6F8069] tabular-nums">
                          {formatInr(o.subtotalInr - o.platformCommissionInr)}
                        </td>
                        <td className="py-3 px-4">{formatOrderStatus(o.status)}</td>
                        <td className="py-3 px-4 text-[#7A5E4B]">
                          {o.paymentStatus.replace(/_/g, ' ')} (Demo)
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
      {/* MODAL: SUBMIT SUPPLIER QUOTATION                                     */}
      {/* ==================================================================== */}
      {quoteRfq && (
        <div className="fixed inset-0 z-50 bg-[#3A2319]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FFFCF6] border border-[#E9DCC7] max-w-xl w-full p-6 sm:p-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.14em] text-[#B05330]">
                  Commercial Quotation · {quoteRfq.rfqCode}
                </p>
                <h3 className="font-serif text-2xl sm:text-3xl font-semibold text-[#3A2319] mt-0.5">
                  Quote for {quoteRfq.title}
                </h3>
                <p className="text-xs text-[#7A5E4B] mt-1">
                  Quantity: {quoteRfq.quantity} units · Deliver to {quoteRfq.deliveryLocation}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQuoteRfq(null)}
                className="p-1.5 text-[#7A5E4B] hover:text-[#3A2319] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitQuotation} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-[#3A2319] mb-1">
                    Unit Price (INR) *
                  </label>
                  <input
                    required
                    type="number"
                    min={1}
                    value={quoteForm.unitPriceInr}
                    onChange={(e) =>
                      setQuoteForm({ ...quoteForm, unitPriceInr: Number(e.target.value) })
                    }
                    className="w-full bg-[#FFFCF6] border border-[#E9DCC7] px-3 py-2 text-sm font-mono text-[#3A2319]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#3A2319] mb-1">
                    Shipping & Packing Estimate (INR)
                  </label>
                  <input
                    required
                    type="number"
                    min={0}
                    value={quoteForm.shippingEstimateInr}
                    onChange={(e) =>
                      setQuoteForm({ ...quoteForm, shippingEstimateInr: Number(e.target.value) })
                    }
                    className="w-full bg-[#FFFCF6] border border-[#E9DCC7] px-3 py-2 text-sm font-mono text-[#3A2319]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#3A2319] mb-1">MOQ (Units) *</label>
                  <input
                    required
                    type="number"
                    min={1}
                    value={quoteForm.moq}
                    onChange={(e) => setQuoteForm({ ...quoteForm, moq: Number(e.target.value) })}
                    className="w-full bg-[#FFFCF6] border border-[#E9DCC7] px-3 py-2 text-sm font-mono text-[#3A2319]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#3A2319] mb-1">
                    Available Monthly Capacity *
                  </label>
                  <input
                    required
                    type="number"
                    min={1}
                    value={quoteForm.availableCapacity}
                    onChange={(e) =>
                      setQuoteForm({ ...quoteForm, availableCapacity: Number(e.target.value) })
                    }
                    className="w-full bg-[#FFFCF6] border border-[#E9DCC7] px-3 py-2 text-sm font-mono text-[#3A2319]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#3A2319] mb-1">
                    Production Lead Time (Days) *
                  </label>
                  <input
                    required
                    type="number"
                    min={3}
                    value={quoteForm.estimatedProductionDays}
                    onChange={(e) =>
                      setQuoteForm({
                        ...quoteForm,
                        estimatedProductionDays: Number(e.target.value),
                      })
                    }
                    className="w-full bg-[#FFFCF6] border border-[#E9DCC7] px-3 py-2 text-sm font-mono text-[#3A2319]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#3A2319] mb-1">
                    Offer Validity (Days)
                  </label>
                  <input
                    type="number"
                    min={7}
                    value={quoteForm.validityDays}
                    onChange={(e) =>
                      setQuoteForm({ ...quoteForm, validityDays: Number(e.target.value) })
                    }
                    className="w-full bg-[#FFFCF6] border border-[#E9DCC7] px-3 py-2 text-sm font-mono text-[#3A2319]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-[#3A2319] mb-1">
                  Customisation & Glaze / Material Notes
                </label>
                <textarea
                  rows={2}
                  value={quoteForm.customisationNotes}
                  onChange={(e) =>
                    setQuoteForm({ ...quoteForm, customisationNotes: e.target.value })
                  }
                  className="w-full bg-[#FFFCF6] border border-[#E9DCC7] px-3 py-2 text-sm text-[#3A2319]"
                />
              </div>

              <div>
                <label className="block font-medium text-[#3A2319] mb-1">
                  Commercial Terms & Packing Conditions
                </label>
                <input
                  value={quoteForm.conditions}
                  onChange={(e) => setQuoteForm({ ...quoteForm, conditions: e.target.value })}
                  className="w-full bg-[#FFFCF6] border border-[#E9DCC7] px-3 py-2 text-sm text-[#3A2319]"
                />
              </div>

              {/* Live Calculation Summary */}
              <div className="bg-[#F8F3E8] border border-[#E9DCC7] p-4 flex items-center justify-between">
                <div>
                  <span className="text-[11px] uppercase tracking-[0.1em] text-[#7A5E4B] block">
                    Product Subtotal ({quoteRfq.quantity} units)
                  </span>
                  <span className="font-mono text-sm font-semibold text-[#3A2319] tabular-nums">
                    {formatInr(quoteForm.unitPriceInr * quoteRfq.quantity)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[11px] uppercase tracking-[0.1em] text-[#7A5E4B] block">
                    Total Landed Offer
                  </span>
                  <span className="font-mono text-xl font-semibold text-[#B05330] tabular-nums">
                    {formatInr(
                      quoteForm.unitPriceInr * quoteRfq.quantity + quoteForm.shippingEstimateInr,
                    )}
                  </span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setQuoteRfq(null)}
                  className="px-4 py-2 border border-[#E9DCC7] text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingQuote}
                  className="px-5 py-2 bg-[#B05330] text-[#FFFCF6] text-xs font-medium hover:bg-[#974426] flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  {submittingQuote ? 'Submitting…' : 'Send Binding Commercial Quote'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: ADD PRODUCT + PROVENANCE ASSISTANT (AGENT 8)                  */}
      {/* ==================================================================== */}
      {showAddProduct && (
        <div className="fixed inset-0 z-50 bg-[#3A2319]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FFFCF6] border border-[#E9DCC7] max-w-2xl w-full p-6 sm:p-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.14em] text-[#B05330]">
                  Workshop Catalogue · Provenance Assistant Enabled
                </p>
                <h3 className="font-serif text-3xl font-semibold text-[#3A2319] mt-0.5">
                  Publish New Craft Product
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddProduct(false)}
                className="p-1.5 text-[#7A5E4B] hover:text-[#3A2319] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddProduct} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-[#3A2319] mb-1">Product Name *</label>
                  <input
                    required
                    value={prodForm.name}
                    onChange={(e) => setProdForm({ ...prodForm, name: e.target.value })}
                    placeholder="e.g., Amber Fluted Stoneware Bedside Lamp"
                    className="w-full bg-[#FFFCF6] border border-[#E9DCC7] px-3 py-2 text-sm text-[#3A2319]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#3A2319] mb-1">Craft Category *</label>
                  <select
                    value={prodForm.categoryId}
                    onChange={(e) => setProdForm({ ...prodForm, categoryId: e.target.value })}
                    className="w-full bg-[#FFFCF6] border border-[#E9DCC7] px-3 py-2 text-sm text-[#3A2319]"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-[#3A2319] mb-1">Craft Technique *</label>
                  <input
                    required
                    value={prodForm.craftTechnique}
                    onChange={(e) => setProdForm({ ...prodForm, craftTechnique: e.target.value })}
                    className="w-full bg-[#FFFCF6] border border-[#E9DCC7] px-3 py-2 text-sm text-[#3A2319]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#3A2319] mb-1">Materials *</label>
                  <input
                    required
                    value={prodForm.materials}
                    onChange={(e) => setProdForm({ ...prodForm, materials: e.target.value })}
                    className="w-full bg-[#FFFCF6] border border-[#E9DCC7] px-3 py-2 text-sm text-[#3A2319]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#3A2319] mb-1">
                    Indicative Unit Price (INR) *
                  </label>
                  <input
                    required
                    type="number"
                    min={50}
                    value={prodForm.indicativePriceInr}
                    onChange={(e) =>
                      setProdForm({ ...prodForm, indicativePriceInr: Number(e.target.value) })
                    }
                    className="w-full bg-[#FFFCF6] border border-[#E9DCC7] px-3 py-2 text-sm font-mono text-[#3A2319]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#3A2319] mb-1">MOQ (Units) *</label>
                  <input
                    required
                    type="number"
                    min={1}
                    value={prodForm.moq}
                    onChange={(e) => setProdForm({ ...prodForm, moq: Number(e.target.value) })}
                    className="w-full bg-[#FFFCF6] border border-[#E9DCC7] px-3 py-2 text-sm font-mono text-[#3A2319]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#3A2319] mb-1">
                    Available Monthly Qty *
                  </label>
                  <input
                    required
                    type="number"
                    min={1}
                    value={prodForm.availableQty}
                    onChange={(e) =>
                      setProdForm({ ...prodForm, availableQty: Number(e.target.value) })
                    }
                    className="w-full bg-[#FFFCF6] border border-[#E9DCC7] px-3 py-2 text-sm font-mono text-[#3A2319]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#3A2319] mb-1">
                    Lead Time (Days) *
                  </label>
                  <input
                    required
                    type="number"
                    min={3}
                    value={prodForm.leadTimeDays}
                    onChange={(e) =>
                      setProdForm({ ...prodForm, leadTimeDays: Number(e.target.value) })
                    }
                    className="w-full bg-[#FFFCF6] border border-[#E9DCC7] px-3 py-2 text-sm font-mono text-[#3A2319]"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-medium text-[#3A2319]">
                    Catalog & Provenance Description *
                  </label>
                  <button
                    type="button"
                    disabled={draftingProvenance}
                    onClick={handleDraftProvenance}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#3A2319] text-[#FFFCF6] text-[11px] font-medium hover:bg-[#523326] cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3 text-[#BE9753]" />
                    {draftingProvenance
                      ? 'Drafting Copy…'
                      : 'Draft with Provenance Assistant'}
                  </button>
                </div>
                <textarea
                  required
                  rows={4}
                  value={prodForm.description}
                  onChange={(e) => setProdForm({ ...prodForm, description: e.target.value })}
                  placeholder="Describe craftsmanship, origin, dimensions, and hospitality/retail use cases..."
                  className="w-full bg-[#FFFCF6] border border-[#E9DCC7] px-3 py-2 text-sm text-[#3A2319]"
                />
                {provenanceNote && (
                  <p className="text-[11px] text-[#6F8069] mt-1">{provenanceNote}</p>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#E9DCC7]">
                <button
                  type="button"
                  onClick={() => setShowAddProduct(false)}
                  className="px-4 py-2 border border-[#E9DCC7] text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingProduct}
                  className="px-5 py-2 bg-[#B05330] text-[#FFFCF6] text-xs font-medium hover:bg-[#974426] cursor-pointer"
                >
                  {addingProduct ? 'Publishing…' : 'Publish to Marketplace'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
