import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Check,
  ChevronDown,
  ChevronUp,
  Cpu,
  LayoutDashboard,
  LogOut,
  Package,
  RefreshCw,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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
import type { AdminRevenueAnalytics, AuthUser, Product, PurchaseOrder } from '../types';

interface AdminDashboardProps {
  user: AuthUser;
  tab: string;
  onNavigate: (path: string) => void;
  onDemoSwitch: (role: 'buyer' | 'supplier' | 'admin') => Promise<void>;
  onLogout: () => void;
  onToast: (msg: string) => void;
}

const NAV_ITEMS = [
  { id: 'overview', label: 'Revenue & GMV', icon: LayoutDashboard },
  { id: 'verifications', label: 'Supplier KYC', icon: ShieldCheck },
  { id: 'ai-monitor', label: 'AI Agent Monitor', icon: Cpu },
  { id: 'orders', label: 'Orders & Disputes', icon: Package },
  { id: 'moderation', label: 'Users & Products', icon: Users },
  { id: 'settings', label: 'Settings & Audit', icon: Settings },
];

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  user,
  tab,
  onNavigate,
  onDemoSwitch,
  onLogout,
  onToast,
}) => {
  const activeTab = NAV_ITEMS.some((n) => n.id === tab) ? tab : 'overview';

  const [analytics, setAnalytics] = useState<AdminRevenueAnalytics | null>(null);
  const [verifications, setVerifications] = useState<any[]>([]);
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [productsList, setProductsList] = useState<Product[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Interactive controls
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [expandedWorkflow, setExpandedWorkflow] = useState<string | null>(null);
  const [fulfilmentReport, setFulfilmentReport] = useState<{
    scannedOrdersCount: number;
    healthyOrdersCount: number;
    exceptions: {
      orderId: string;
      poNumber: string;
      title: string;
      supplierName: string;
      status: string;
      severity: 'high' | 'medium';
      reason: string;
    }[];
    workflowId: string;
  } | null>(null);
  const [runningScan, setRunningScan] = useState(false);

  const [disputeNotes, setDisputeNotes] = useState<Record<string, string>>({});
  const [settingsForm, setSettingsForm] = useState({
    commissionRateDefault: 8,
    managedSourcingFeePct: 3.5,
    buyerSubscriptionMonthlyInr: 14999,
  });
  const [savingSettings, setSavingSettings] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [ovRes, verRes, wfRes, ordRes, usrRes, prodRes, audRes] = await Promise.all([
        apiRequest<{ analytics: AdminRevenueAnalytics }>('/admin/overview'),
        apiRequest<{ verifications: any[] }>('/admin/verifications'),
        apiRequest<{ workflows: any[] }>('/admin/workflows'),
        apiRequest<{ orders: PurchaseOrder[] }>('/orders'),
        apiRequest<{ users: any[] }>('/admin/users'),
        apiRequest<{ products: Product[] }>('/admin/products'),
        apiRequest<{ logs: any[] }>('/admin/audit-logs'),
      ]);
      setAnalytics(ovRes.analytics);
      setSettingsForm({
        commissionRateDefault: Number((ovRes.analytics.commissionRateDefault * 100).toFixed(2)),
        managedSourcingFeePct: Number((ovRes.analytics.managedSourcingFeePct * 100).toFixed(2)),
        buyerSubscriptionMonthlyInr: ovRes.analytics.buyerSubscriptionMonthlyInr,
      });
      setVerifications(verRes.verifications);
      setWorkflows(wfRes.workflows);
      if (!expandedWorkflow && wfRes.workflows.length > 0) {
        setExpandedWorkflow(wfRes.workflows[0].id);
      }
      setOrders(ordRes.orders);
      setUsersList(usrRes.users);
      setProductsList(prodRes.products);
      setAuditLogs(audRes.logs);
    } catch (err: any) {
      onToast(err.message || 'Failed to load admin console.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [user.id]);

  const handleReviewVerification = async (id: string, decision: 'approved' | 'rejected') => {
    const note =
      reviewNotes[id]?.trim() ||
      (decision === 'approved'
        ? 'Verified craft workshop documentation and declared capacity baseline.'
        : 'Additional cluster registration or workshop capacity proof required.');
    try {
      await apiRequest(`/admin/verifications/${id}/review`, {
        method: 'POST',
        body: { decision, reviewNotes: note },
      });
      onToast(`Supplier verification marked ${decision}.`);
      await loadAll();
    } catch (err: any) {
      onToast(err.message);
    }
  };

  const handleRunFulfilmentScan = async () => {
    setRunningScan(true);
    try {
      const report = await apiRequest<NonNullable<typeof fulfilmentReport>>('/ai/fulfilment-check', {
        method: 'POST',
      });
      setFulfilmentReport(report);
      onToast(
        `Fulfilment Agent scanned ${report.scannedOrdersCount} active orders (${report.exceptions.length} exception${report.exceptions.length === 1 ? '' : 's'} detected).`,
      );
      await loadAll();
    } catch (err: any) {
      onToast(err.message);
    } finally {
      setRunningScan(false);
    }
  };

  const handleResolveDispute = async (
    orderId: string,
    resolution: 'resume_delivery' | 'complete_with_credit' | 'cancel_order',
  ) => {
    const notes =
      disputeNotes[orderId]?.trim() ||
      'Admin mediation completed with buyer and supplier acknowledgement.';
    try {
      await apiRequest(`/admin/disputes/${orderId}/resolve`, {
        method: 'POST',
        body: { resolution, notes },
      });
      onToast('Dispute resolved & both parties notified.');
      await loadAll();
    } catch (err: any) {
      onToast(err.message);
    }
  };

  const handleToggleUserStatus = async (userId: string, currentStatus: string) => {
    const next = currentStatus === 'active' ? 'suspended' : 'active';
    try {
      await apiRequest(`/admin/users/${userId}/status`, {
        method: 'PATCH',
        body: { status: next },
      });
      onToast(`Account status changed to ${next}.`);
      await loadAll();
    } catch (err: any) {
      onToast(err.message);
    }
  };

  const handleModerateProduct = async (productId: string, status: 'active' | 'flagged' | 'archived') => {
    try {
      await apiRequest(`/admin/products/${productId}/status`, {
        method: 'PATCH',
        body: { status },
      });
      onToast(`Product status set to ${status}.`);
      await loadAll();
    } catch (err: any) {
      onToast(err.message);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await apiRequest('/admin/settings', {
        method: 'PATCH',
        body: {
          commissionRateDefault: Number(settingsForm.commissionRateDefault) / 100,
          managedSourcingFeePct: Number(settingsForm.managedSourcingFeePct) / 100,
          buyerSubscriptionMonthlyInr: Number(settingsForm.buyerSubscriptionMonthlyInr),
        },
      });
      onToast('Commercial platform settings updated & logged to audit trail.');
      await loadAll();
    } catch (err: any) {
      onToast(err.message);
    } finally {
      setSavingSettings(false);
    }
  };

  const pendingVerificationsCount = verifications.filter((v) =>
    ['pending', 'under_review'].includes(v.status),
  ).length;
  const disputedOrders = orders.filter((o) => o.status === 'disputed');

  return (
    <div className="min-h-screen bg-[#F8F3E8] text-[#3A2319] flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 bg-[#3A2319] text-[#FFFCF6] sticky top-0 h-screen">
        <div className="px-6 h-16 border-b border-[#FFFCF6]/15 flex items-center justify-between">
          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="font-serif text-2xl font-semibold text-[#FFFCF6] cursor-pointer"
          >
            Folkform
          </button>
          <span className="text-[10px] uppercase tracking-[0.14em] text-[#BE9753] font-medium">
            Admin
          </span>
        </div>

        <div className="px-5 py-4 border-b border-[#FFFCF6]/10">
          <p className="text-xs font-semibold text-[#FFFCF6] truncate">{user.fullName}</p>
          <p className="text-[11px] text-[#E9DCC7]/75 truncate mt-0.5">
            Marketplace Governance & AI Ops
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
                onClick={() => onNavigate(`/admin/${item.id}`)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#B05330] text-[#FFFCF6] font-medium'
                    : 'text-[#E9DCC7] hover:bg-[#FFFCF6]/10'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
                {item.id === 'verifications' && pendingVerificationsCount > 0 && (
                  <span className="ml-auto font-mono text-[11px] text-[#BE9753] tabular-nums">
                    {pendingVerificationsCount}
                  </span>
                )}
                {item.id === 'orders' && disputedOrders.length > 0 && (
                  <span className="ml-auto font-mono text-[11px] text-[#BE9753] tabular-nums">
                    {disputedOrders.length}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#FFFCF6]/15 space-y-2">
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#E9DCC7] hover:text-[#FFFCF6] cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
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
              Admin Control Center ·{' '}
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
                className="px-2.5 py-1 text-[#3A2319] hover:bg-[#FFFCF6] cursor-pointer"
              >
                Artisan
              </button>
              <button
                type="button"
                onClick={() => onDemoSwitch('admin')}
                className="px-2.5 py-1 bg-[#3A2319] text-[#FFFCF6] font-medium cursor-pointer"
              >
                Admin
              </button>
            </div>
            <button
              type="button"
              onClick={loadAll}
              className="px-3 py-1.5 border border-[#E9DCC7] text-xs text-[#3A2319] hover:bg-[#F8F3E8] flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
          </div>
        </header>

        {/* Mobile Nav */}
        <div className="lg:hidden overflow-x-auto bg-[#FFFCF6] border-b border-[#E9DCC7] px-4 py-2 flex gap-1.5">
          {NAV_ITEMS.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(`/admin/${item.id}`)}
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
          {loading && !analytics ? (
            <div className="py-16 text-center text-sm text-[#7A5E4B]">
              Loading governance telemetry…
            </div>
          ) : null}

          {/* ============================================================== */}
          {/* TAB 1: REVENUE ANALYTICS & GMV SEPARATION                      */}
          {/* ============================================================== */}
          {activeTab === 'overview' && analytics && (
            <div className="space-y-8">
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-[#B05330] font-medium">
                  Financial Integrity & Marketplace Operations · Demonstration Dataset
                </p>
                <h1 className="font-serif text-4xl font-semibold text-[#3A2319] mt-1">
                  GMV vs Realised Platform Revenue
                </h1>
                <p className="text-xs text-[#7A5E4B] mt-2 max-w-3xl leading-relaxed">
                  Accounting discipline: <strong>Gross Merchandise Value (GMV)</strong> reflects
                  total non-cancelled order subtotals across the marketplace.{' '}
                  <strong>Realised Platform Revenue</strong> counts commissions and managed
                  sourcing fees strictly from <strong>completed</strong> transactions—in-production
                  or pending POs are excluded until delivery completion.
                </p>
              </div>

              {/* Primary Financial KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-[#FFFCF6] border border-[#E9DCC7] p-5">
                  <span className="text-[11px] uppercase tracking-[0.12em] text-[#7A5E4B]">
                    Total Marketplace GMV
                  </span>
                  <p className="font-mono text-2xl font-semibold text-[#3A2319] tabular-nums mt-2">
                    {formatInr(analytics.gmvTotalInr)}
                  </p>
                  <span className="text-[11px] text-[#7A5E4B] mt-1 block">
                    Realised: {formatInr(analytics.realisedGmvInr)} · Pending:{' '}
                    {formatInr(analytics.pendingGmvInr)}
                  </span>
                </div>

                <div className="bg-[#3A2319] text-[#FFFCF6] p-5">
                  <span className="text-[11px] uppercase tracking-[0.12em] text-[#BE9753]">
                    Realised Platform Revenue
                  </span>
                  <p className="font-mono text-2xl font-semibold text-[#FFFCF6] tabular-nums mt-2">
                    {formatInr(analytics.realisedPlatformRevenueInr)}
                  </p>
                  <span className="text-[11px] text-[#E9DCC7]/80 mt-1 block">
                    Commission {formatInr(analytics.realisedCommissionInr)} + Managed{' '}
                    {formatInr(analytics.managedSourcingFeesInr)} ({analytics.completedTransactionsCount}{' '}
                    completed POs)
                  </span>
                </div>

                <div className="bg-[#FFFCF6] border border-[#E9DCC7] p-5">
                  <span className="text-[11px] uppercase tracking-[0.12em] text-[#7A5E4B]">
                    Average Order Value (Completed)
                  </span>
                  <p className="font-mono text-2xl font-semibold text-[#3A2319] tabular-nums mt-2">
                    {formatInr(analytics.averageOrderValueInr)}
                  </p>
                  <span className="text-[11px] text-[#7A5E4B] mt-1 block">
                    {analytics.completedTransactionsCount} completed of {analytics.totalOrdersCount}{' '}
                    active POs
                  </span>
                </div>

                <div className="bg-[#FFFCF6] border border-[#E9DCC7] p-5">
                  <span className="text-[11px] uppercase tracking-[0.12em] text-[#7A5E4B]">
                    Marketplace Liquidity
                  </span>
                  <p className="font-mono text-2xl font-semibold text-[#3A2319] tabular-nums mt-2">
                    {analytics.activeBuyersCount}B / {analytics.activeSuppliersCount}S
                  </p>
                  <span className="text-[11px] text-[#7A5E4B] mt-1 block">
                    Repeat buyer rate {analytics.repeatBuyerRatePct}% · RFQ conv.{' '}
                    {analytics.rfqConversionRatePct}% · Avg quote {analytics.avgTimeToQuotationHours}h
                  </span>
                </div>
              </div>

              {/* Charts Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-[#FFFCF6] border border-[#E9DCC7] p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-serif text-xl font-semibold text-[#3A2319]">
                      Monthly GMV vs Realised Platform Revenue
                    </h3>
                    <BarChart3 className="w-4 h-4 text-[#7A5E4B]" />
                  </div>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={analytics.monthlySeries}
                        margin={{ top: 10, right: 16, left: 10, bottom: 10 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#E9DCC7" />
                        <XAxis dataKey="month" tick={{ fill: '#3A2319', fontSize: 12 }} />
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
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="gmvInr" name="GMV (INR)" fill="#BE9753" />
                        <Bar
                          dataKey="platformRevenueInr"
                          name="Realised Revenue (INR)"
                          fill="#B05330"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-[#FFFCF6] border border-[#E9DCC7] p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-serif text-xl font-semibold text-[#3A2319]">
                      GMV Distribution by Craft Category
                    </h3>
                    <Activity className="w-4 h-4 text-[#7A5E4B]" />
                  </div>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={analytics.categorySeries.filter((c) => c.gmvInr > 0 || c.products > 0).slice(0, 6)}
                        margin={{ top: 10, right: 16, left: 10, bottom: 24 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#E9DCC7" />
                        <XAxis
                          dataKey="category"
                          tick={{ fill: '#3A2319', fontSize: 10 }}
                          interval={0}
                          angle={-15}
                          textAnchor="end"
                        />
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
                        <Bar dataKey="gmvInr" name="Category GMV" fill="#3A2319" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Active Commercial Assumptions Strip */}
              <div className="bg-[#FFFCF6] border border-[#E9DCC7] p-5 flex flex-wrap items-center justify-between gap-4 text-xs">
                <div>
                  <span className="uppercase tracking-[0.12em] text-[#7A5E4B] block">
                    Active Commercial Model Assumptions (Editable in Settings)
                  </span>
                  <p className="text-[#3A2319] mt-1">
                    Marketplace Commission:{' '}
                    <strong className="font-mono">
                      {(analytics.commissionRateDefault * 100).toFixed(1)}%
                    </strong>{' '}
                    · Managed Sourcing Fee:{' '}
                    <strong className="font-mono">
                      {(analytics.managedSourcingFeePct * 100).toFixed(1)}%
                    </strong>{' '}
                    · Buyer Enterprise Plan Assumption:{' '}
                    <strong className="font-mono">
                      {formatInr(analytics.buyerSubscriptionMonthlyInr)}/mo
                    </strong>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('/admin/settings')}
                  className="px-4 py-2 border border-[#3A2319] text-[#3A2319] hover:bg-[#F8F3E8] cursor-pointer"
                >
                  Configure Assumptions
                </button>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 2: SUPPLIER VERIFICATION QUEUE                             */}
          {/* ============================================================== */}
          {activeTab === 'verifications' && (
            <div className="space-y-6">
              <div>
                <p className="text-[11px] uppercase tracking-[0.14em] text-[#B05330]">
                  Artisan Trust & Provenance Governance
                </p>
                <h2 className="font-serif text-3xl font-semibold text-[#3A2319] mt-0.5">
                  Supplier Verification Review Queue ({verifications.length})
                </h2>
              </div>

              <div className="space-y-4">
                {verifications.map((v) => {
                  const isPending = ['pending', 'under_review'].includes(v.status);
                  return (
                    <div
                      key={v.id}
                      className={`bg-[#FFFCF6] border p-6 space-y-4 ${
                        isPending ? 'border-[#B05330]' : 'border-[#E9DCC7]'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-[#7A5E4B]">
                            <span className="font-semibold text-[#3A2319]">
                              {formatVerificationLabel(v.status, v.isDemo)}
                            </span>
                            <span>·</span>
                            <span>{v.location}</span>
                            <span>·</span>
                            <span>{v.supplierType}</span>
                            <span>·</span>
                            <span className="font-mono">
                              Declared {v.monthlyCapacityUnits} units/mo
                            </span>
                          </div>
                          <h3 className="font-serif text-2xl font-semibold text-[#3A2319] mt-1">
                            {v.businessName}
                          </h3>
                          <p className="text-xs text-[#5C4537] mt-1 max-w-2xl">
                            {v.craftHeritageSummary}
                          </p>
                        </div>
                        <div className="text-right text-xs">
                          <span className="text-[#7A5E4B] block">Evidence Filed</span>
                          <span className="font-medium text-[#3A2319]">{v.documentType}</span>
                          <span className="font-mono text-[#B05330] block">{v.documentRef}</span>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-[#E9DCC7]/70 flex flex-wrap items-end justify-between gap-4">
                        <div className="flex-1 min-w-[240px]">
                          <label className="block text-[11px] text-[#7A5E4B] mb-1">
                            Verification Review Note
                          </label>
                          <input
                            value={reviewNotes[v.id] ?? v.reviewNotes ?? ''}
                            onChange={(e) =>
                              setReviewNotes({ ...reviewNotes, [v.id]: e.target.value })
                            }
                            placeholder="Record workshop check, document match, or follow-up requirement..."
                            className="w-full bg-[#F8F3E8] border border-[#E9DCC7] px-3 py-2 text-xs text-[#3A2319]"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleReviewVerification(v.id, 'approved')}
                            className="px-4 py-2 bg-[#6F8069] text-[#FFFCF6] text-xs font-medium hover:bg-[#5b6b56] flex items-center gap-1 cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Approve Verification
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReviewVerification(v.id, 'rejected')}
                            className="px-4 py-2 border border-[#B05330] text-[#B05330] text-xs font-medium hover:bg-[#B05330] hover:text-[#FFFCF6] cursor-pointer"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 3: AI WORKFLOW & MULTI-AGENT MONITORING                    */}
          {/* ============================================================== */}
          {activeTab === 'ai-monitor' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-[#B05330]">
                    Multi-Agent Orchestration Telemetry
                  </p>
                  <h2 className="font-serif text-3xl font-semibold text-[#3A2319] mt-0.5">
                    AI Sourcing Workflows & Agent Logs ({workflows.length})
                  </h2>
                </div>
                <button
                  type="button"
                  disabled={runningScan}
                  onClick={handleRunFulfilmentScan}
                  className="px-4 py-2.5 bg-[#3A2319] text-[#FFFCF6] text-xs font-medium hover:bg-[#523326] flex items-center gap-2 cursor-pointer"
                >
                  <Activity className="w-4 h-4 text-[#BE9753]" />
                  {runningScan ? 'Scanning Orders…' : 'Run Fulfilment Agent Scan (Agent 7)'}
                </button>
              </div>

              {/* Live Fulfilment Agent Scan Output */}
              {fulfilmentReport && (
                <div className="bg-[#FFFCF6] border border-[#B05330] p-5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-serif text-xl font-semibold text-[#3A2319] flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-[#B05330]" />
                      Fulfilment Agent Scan Report ({fulfilmentReport.scannedOrdersCount} active
                      orders audited · {fulfilmentReport.healthyOrdersCount} on track)
                    </h3>
                    <span className="font-mono text-[11px] text-[#7A5E4B]">
                      Run #{fulfilmentReport.workflowId.slice(0, 8)}
                    </span>
                  </div>
                  {fulfilmentReport.exceptions.length === 0 ? (
                    <p className="text-xs text-[#6F8069]">
                      No overdue milestones, production delays, or unresolved disputes detected.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {fulfilmentReport.exceptions.map((ex, idx) => (
                        <div
                          key={`${ex.orderId}-${idx}`}
                          className="p-3 bg-[#F8F3E8] border border-[#E9DCC7] text-xs flex flex-wrap justify-between gap-3"
                        >
                          <div>
                            <span className="font-mono font-semibold text-[#B05330]">
                              {ex.poNumber} · {ex.severity.toUpperCase()} · {formatOrderStatus(ex.status)}
                            </span>
                            <p className="font-medium text-[#3A2319] mt-0.5">
                              {ex.title} ({ex.supplierName})
                            </p>
                          </div>
                          <p className="text-[#5C4537] max-w-md">{ex.reason}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Executed Workflows Accordion */}
              <div className="space-y-4">
                {workflows.map((wf) => {
                  const isOpen = expandedWorkflow === wf.id;
                  return (
                    <div key={wf.id} className="bg-[#FFFCF6] border border-[#E9DCC7]">
                      <button
                        type="button"
                        onClick={() => setExpandedWorkflow(isOpen ? null : wf.id)}
                        className="w-full text-left p-5 flex flex-wrap items-center justify-between gap-4 cursor-pointer hover:bg-[#F8F3E8]/40"
                      >
                        <div className="space-y-1 max-w-3xl">
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#7A5E4B]">
                            <span className="font-mono text-[#3A2319]">{wf.id.slice(0, 8)}</span>
                            <span>·</span>
                            <span>{wf.userName}</span>
                            <span>·</span>
                            <span>{wf.rfqCode ? `Linked ${wf.rfqCode}` : 'Not yet converted to RFQ'}</span>
                            <span>·</span>
                            <span className="text-[#B05330] font-medium">
                              Gate: {wf.humanApprovalStatus.replace(/_/g, ' ')}
                            </span>
                            <span>·</span>
                            <span>{wf.logs.length} agent steps</span>
                          </div>
                          <p className="text-sm font-medium text-[#3A2319] line-clamp-2">
                            “{wf.rawPrompt}”
                          </p>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-[#7A5E4B]">
                          <span>{formatDate(wf.createdAt)}</span>
                          {isOpen ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </div>
                      </button>

                      {isOpen && (
                        <div className="px-5 pb-5 pt-2 border-t border-[#E9DCC7] space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs bg-[#F8F3E8] p-4">
                            <div>
                              <span className="text-[10px] uppercase tracking-[0.12em] text-[#7A5E4B]">
                                Extracted Requirement
                              </span>
                              <p className="font-medium text-[#3A2319] mt-1">
                                {wf.extractedSpec?.productTitle || 'N/A'} (
                                {wf.extractedSpec?.quantity || 0} units)
                              </p>
                            </div>
                            <div>
                              <span className="text-[10px] uppercase tracking-[0.12em] text-[#7A5E4B]">
                                Shortlisted Suppliers
                              </span>
                              <p className="font-mono font-medium text-[#3A2319] mt-1">
                                {(wf.shortlist || []).length} candidates scored
                              </p>
                            </div>
                            <div>
                              <span className="text-[10px] uppercase tracking-[0.12em] text-[#7A5E4B]">
                                Risk Flags Raised
                              </span>
                              <p className="text-[#3A2319] mt-1">
                                {(wf.riskFlags || []).length > 0
                                  ? wf.riskFlags.join(' · ')
                                  : 'No critical risks flagged'}
                              </p>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <h4 className="text-[11px] uppercase tracking-[0.12em] text-[#7A5E4B] font-semibold">
                              Step-by-Step Agent Execution Logs
                            </h4>
                            {wf.logs.map((log: any) => (
                              <div
                                key={log.id}
                                className="p-3.5 border border-[#E9DCC7] bg-[#FFFCF6] text-xs space-y-1"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="font-semibold text-[#3A2319]">
                                    Step {log.stepOrder}: {log.agentName}
                                  </span>
                                  <span className="font-mono text-[11px] text-[#7A5E4B] tabular-nums">
                                    {log.durationMs}ms · {log.status}
                                  </span>
                                </div>
                                <p className="text-[#5C4537]">{log.outputSummary}</p>
                                {log.toolCalls?.length > 0 && (
                                  <p className="font-mono text-[11px] text-[#7A5E4B]">
                                    Tools: {log.toolCalls.join(', ')}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 4: ORDERS & DISPUTES MEDIATION                             */}
          {/* ============================================================== */}
          {activeTab === 'orders' && (
            <div className="space-y-6">
              <div>
                <p className="text-[11px] uppercase tracking-[0.14em] text-[#B05330]">
                  Marketplace Order Oversight
                </p>
                <h2 className="font-serif text-3xl font-semibold text-[#3A2319] mt-0.5">
                  All Purchase Orders ({orders.length}) & Active Disputes ({disputedOrders.length})
                </h2>
              </div>

              {disputedOrders.length > 0 && (
                <div className="space-y-4">
                  <h3 className="font-serif text-2xl font-semibold text-[#B05330]">
                    Disputed Orders Requiring Admin Mediation
                  </h3>
                  {disputedOrders.map((o) => (
                    <div
                      key={o.id}
                      className="bg-[#FFFCF6] border border-[#B05330] p-6 space-y-4 text-xs"
                    >
                      <div className="flex flex-wrap justify-between gap-4">
                        <div>
                          <span className="font-mono font-semibold text-[#B05330]">
                            {o.poNumber} · DISPUTED
                          </span>
                          <h4 className="font-serif text-2xl font-semibold text-[#3A2319] mt-0.5">
                            {o.title}
                          </h4>
                          <p className="text-[#7A5E4B]">
                            Buyer: {o.buyerCompany} · Supplier: {o.supplierName} · Value:{' '}
                            <strong className="font-mono text-[#3A2319]">
                              {formatInr(o.totalAmountInr)}
                            </strong>
                          </p>
                          <p className="text-[#B05330] mt-2 font-medium">
                            Dispute Reason: {o.disputeReason}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-end gap-3 pt-3 border-t border-[#E9DCC7]">
                        <div className="flex-1 min-w-[240px]">
                          <label className="block text-[11px] text-[#7A5E4B] mb-1">
                            Admin Mediation & Resolution Notes
                          </label>
                          <input
                            value={disputeNotes[o.id] || ''}
                            onChange={(e) =>
                              setDisputeNotes({ ...disputeNotes, [o.id]: e.target.value })
                            }
                            placeholder="Record inspection result, replacement batch terms, or credit adjustment..."
                            className="w-full bg-[#F8F3E8] border border-[#E9DCC7] px-3 py-2 text-xs text-[#3A2319]"
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleResolveDispute(o.id, 'resume_delivery')}
                            className="px-3.5 py-2 bg-[#3A2319] text-[#FFFCF6] font-medium cursor-pointer"
                          >
                            Resume Delivery
                          </button>
                          <button
                            type="button"
                            onClick={() => handleResolveDispute(o.id, 'complete_with_credit')}
                            className="px-3.5 py-2 bg-[#6F8069] text-[#FFFCF6] font-medium cursor-pointer"
                          >
                            Complete with Credit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleResolveDispute(o.id, 'cancel_order')}
                            className="px-3.5 py-2 border border-[#B05330] text-[#B05330] font-medium cursor-pointer"
                          >
                            Cancel Order
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="bg-[#FFFCF6] border border-[#E9DCC7] overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F8F3E8] border-b border-[#E9DCC7] text-[11px] uppercase tracking-[0.1em] text-[#7A5E4B]">
                    <tr>
                      <th className="py-3 px-4">PO Number</th>
                      <th className="py-3 px-4">Buyer → Supplier</th>
                      <th className="py-3 px-4 text-right">GMV Subtotal</th>
                      <th className="py-3 px-4 text-right">Commission</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Revenue Recognition</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E9DCC7]">
                    {orders.map((o) => (
                      <tr key={o.id}>
                        <td className="py-3 px-4 font-mono font-medium text-[#3A2319]">
                          {o.poNumber}
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-medium text-[#3A2319]">{o.buyerCompany}</span> →{' '}
                          <span>{o.supplierName}</span>
                          <span className="block text-[11px] text-[#7A5E4B]">{o.title}</span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">
                          {formatInr(o.subtotalInr)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-[#B05330]">
                          {formatInr(o.platformCommissionInr)}
                        </td>
                        <td className="py-3 px-4 font-medium">{formatOrderStatus(o.status)}</td>
                        <td className="py-3 px-4">
                          {o.status === 'completed' ? (
                            <span className="text-[#6F8069] font-medium">Realised</span>
                          ) : o.status === 'cancelled' ? (
                            <span className="text-[#7A5E4B]">Cancelled</span>
                          ) : (
                            <span className="text-[#7A5E4B]">Pending Completion</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 5: USERS & PRODUCT MODERATION                              */}
          {/* ============================================================== */}
          {activeTab === 'moderation' && (
            <div className="space-y-8">
              <div className="space-y-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-[#B05330]">
                    Account Access Governance
                  </p>
                  <h2 className="font-serif text-3xl font-semibold text-[#3A2319] mt-0.5">
                    Platform Users ({usersList.length})
                  </h2>
                </div>
                <div className="bg-[#FFFCF6] border border-[#E9DCC7] overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#F8F3E8] border-b border-[#E9DCC7] text-[11px] uppercase tracking-[0.1em] text-[#7A5E4B]">
                      <tr>
                        <th className="py-3 px-4">User</th>
                        <th className="py-3 px-4">Role</th>
                        <th className="py-3 px-4">Organization</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E9DCC7]">
                      {usersList.map((u) => (
                        <tr key={u.id}>
                          <td className="py-3 px-4">
                            <span className="font-medium text-[#3A2319]">{u.fullName}</span>
                            <span className="block text-[11px] text-[#7A5E4B]">{u.email}</span>
                          </td>
                          <td className="py-3 px-4 uppercase text-[11px] tracking-[0.08em]">
                            {u.role}
                          </td>
                          <td className="py-3 px-4">{u.organization}</td>
                          <td className="py-3 px-4 font-medium">{u.status}</td>
                          <td className="py-3 px-4 text-right">
                            {u.role !== 'admin' && (
                              <button
                                type="button"
                                onClick={() => handleToggleUserStatus(u.id, u.status)}
                                className="px-3 py-1 border border-[#E9DCC7] hover:border-[#3A2319] text-[#3A2319] cursor-pointer"
                              >
                                {u.status === 'active' ? 'Suspend' : 'Reactivate'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-4">
                <h2 className="font-serif text-3xl font-semibold text-[#3A2319]">
                  Product Catalogue Moderation ({productsList.length})
                </h2>
                <div className="bg-[#FFFCF6] border border-[#E9DCC7] overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#F8F3E8] border-b border-[#E9DCC7] text-[11px] uppercase tracking-[0.1em] text-[#7A5E4B]">
                      <tr>
                        <th className="py-3 px-4">Product</th>
                        <th className="py-3 px-4">Supplier</th>
                        <th className="py-3 px-4 text-right">Indicative Rate</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Moderation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E9DCC7]">
                      {productsList.slice(0, 18).map((p) => (
                        <tr key={p.id}>
                          <td className="py-3 px-4">
                            <span className="font-medium text-[#3A2319]">{p.name}</span>
                            <span className="block text-[11px] text-[#7A5E4B]">
                              {p.categoryName} · {p.originCity}, {p.originState}
                            </span>
                          </td>
                          <td className="py-3 px-4">{p.supplierName}</td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums">
                            {formatInr(p.indicativePriceInr)}
                          </td>
                          <td className="py-3 px-4 font-medium">{p.status}</td>
                          <td className="py-3 px-4 text-right space-x-1.5">
                            {(['active', 'flagged', 'archived'] as const).map((st) => (
                              <button
                                key={st}
                                type="button"
                                onClick={() => handleModerateProduct(p.id, st)}
                                className={`px-2 py-1 text-[11px] border cursor-pointer ${
                                  p.status === st
                                    ? 'bg-[#3A2319] text-[#FFFCF6] border-[#3A2319]'
                                    : 'border-[#E9DCC7] text-[#3A2319]'
                                }`}
                              >
                                {st}
                              </button>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 6: COMMERCIAL SETTINGS & IMMUTABLE AUDIT LOGS              */}
          {/* ============================================================== */}
          {activeTab === 'settings' && (
            <div className="space-y-8">
              <div className="max-w-2xl space-y-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-[#B05330]">
                    Configurable Platform Parameters
                  </p>
                  <h2 className="font-serif text-3xl font-semibold text-[#3A2319] mt-0.5">
                    Commercial Model Assumptions
                  </h2>
                  <p className="text-xs text-[#7A5E4B] mt-1">
                    These values represent Folkform&apos;s configurable initial commercial
                    assumptions (not guaranteed investor forecasts). Updates apply to newly drafted
                    Purchase Orders and are logged immutably below.
                  </p>
                </div>

                <form
                  onSubmit={handleSaveSettings}
                  className="bg-[#FFFCF6] border border-[#E9DCC7] p-6 space-y-4 text-xs"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block font-medium text-[#3A2319] mb-1">
                        Marketplace Commission (%)
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min={1}
                        max={25}
                        value={settingsForm.commissionRateDefault}
                        onChange={(e) =>
                          setSettingsForm({
                            ...settingsForm,
                            commissionRateDefault: Number(e.target.value),
                          })
                        }
                        className="w-full bg-[#FFFCF6] border border-[#E9DCC7] px-3 py-2 text-sm font-mono text-[#3A2319]"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-[#3A2319] mb-1">
                        Managed Sourcing Fee (%)
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min={0}
                        max={20}
                        value={settingsForm.managedSourcingFeePct}
                        onChange={(e) =>
                          setSettingsForm({
                            ...settingsForm,
                            managedSourcingFeePct: Number(e.target.value),
                          })
                        }
                        className="w-full bg-[#FFFCF6] border border-[#E9DCC7] px-3 py-2 text-sm font-mono text-[#3A2319]"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-[#3A2319] mb-1">
                        Buyer Subscription (INR/mo)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={settingsForm.buyerSubscriptionMonthlyInr}
                        onChange={(e) =>
                          setSettingsForm({
                            ...settingsForm,
                            buyerSubscriptionMonthlyInr: Number(e.target.value),
                          })
                        }
                        className="w-full bg-[#FFFCF6] border border-[#E9DCC7] px-3 py-2 text-sm font-mono text-[#3A2319]"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={savingSettings}
                    className="px-5 py-2.5 bg-[#3A2319] text-[#FFFCF6] text-xs font-medium hover:bg-[#523326] cursor-pointer"
                  >
                    {savingSettings ? 'Saving Settings…' : 'Save Commercial Settings'}
                  </button>
                </form>
              </div>

              <div className="space-y-4">
                <h2 className="font-serif text-3xl font-semibold text-[#3A2319]">
                  Immutable Platform Audit Trail ({auditLogs.length})
                </h2>
                <div className="bg-[#FFFCF6] border border-[#E9DCC7] overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#F8F3E8] border-b border-[#E9DCC7] text-[11px] uppercase tracking-[0.1em] text-[#7A5E4B]">
                      <tr>
                        <th className="py-3 px-4">Timestamp</th>
                        <th className="py-3 px-4">Actor</th>
                        <th className="py-3 px-4">Action</th>
                        <th className="py-3 px-4">Entity</th>
                        <th className="py-3 px-4">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E9DCC7]">
                      {auditLogs.map((l) => (
                        <tr key={l.id}>
                          <td className="py-2.5 px-4 font-mono text-[11px] text-[#7A5E4B] whitespace-nowrap">
                            {formatDate(l.createdAt)}
                          </td>
                          <td className="py-2.5 px-4">
                            <span className="font-medium text-[#3A2319]">{l.actorName}</span>{' '}
                            <span className="text-[11px] text-[#7A5E4B]">({l.actorRole})</span>
                          </td>
                          <td className="py-2.5 px-4 font-mono text-[#B05330]">{l.action}</td>
                          <td className="py-2.5 px-4 font-mono text-[11px]">
                            {l.entityType}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-[11px] text-[#5C4537] max-w-md truncate">
                            {JSON.stringify(l.details)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
