import React, { useState } from 'react';
import { AlertTriangle, Check, CreditCard, FileDown, ShieldCheck } from 'lucide-react';
import { apiRequest, formatDate, formatInr, formatOrderStatus } from '../lib/api';
import { downloadPurchaseOrderPdf } from '../lib/pdf';
import type { AuthUser, PurchaseOrder } from '../types';

interface OrderLifecycleViewProps {
  orders: PurchaseOrder[];
  user: AuthUser;
  onRefresh: () => void;
  onToast: (msg: string) => void;
}

const TIMELINE_STAGES = [
  'awaiting_buyer_approval',
  'purchase_order_created',
  'supplier_confirmed',
  'production_started',
  'quality_check',
  'ready_for_dispatch',
  'shipped',
  'delivered',
  'completed',
] as const;

const NEXT_SUPPLIER_STAGES = [
  { value: 'production_started', label: 'Production Started' },
  { value: 'quality_check', label: 'Quality Check' },
  { value: 'ready_for_dispatch', label: 'Ready for Dispatch' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'completed', label: 'Completed (Realises Commission)' },
];

export const OrderLifecycleView: React.FC<OrderLifecycleViewProps> = ({
  orders,
  user,
  onRefresh,
  onToast,
}) => {
  const [selectedId, setSelectedId] = useState<string>(orders[0]?.id || '');
  const [milestoneStage, setMilestoneStage] = useState('production_started');
  const [milestoneNotes, setMilestoneNotes] = useState('');
  const [milestoneDelayed, setMilestoneDelayed] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [showDispute, setShowDispute] = useState(false);
  const [busy, setBusy] = useState(false);

  const selected = orders.find((o) => o.id === selectedId) || orders[0];

  const handleBuyerApprove = async (orderId: string) => {
    setBusy(true);
    try {
      await apiRequest(`/orders/${orderId}/approve`, { method: 'POST' });
      onToast('Purchase Order approved & released to supplier.');
      onRefresh();
    } catch (err: any) {
      onToast(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSimulatedEscrow = async (orderId: string) => {
    setBusy(true);
    try {
      const res = await apiRequest<{ referenceCode: string }>(`/orders/${orderId}/pay`, {
        method: 'POST',
      });
      onToast(`Simulated escrow funding recorded (${res.referenceCode}).`);
      onRefresh();
    } catch (err: any) {
      onToast(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSupplierConfirm = async (orderId: string) => {
    setBusy(true);
    try {
      await apiRequest(`/orders/${orderId}/confirm`, {
        method: 'POST',
        body: {
          note: 'Workshop confirmed materials, kiln/loom schedule, and export packing timeline.',
        },
      });
      onToast('Purchase Order confirmed! You can now log production milestones.');
      onRefresh();
    } catch (err: any) {
      onToast(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleAddMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !milestoneNotes.trim()) return;
    setBusy(true);
    try {
      await apiRequest(`/orders/${selected.id}/milestones`, {
        method: 'POST',
        body: {
          stage: milestoneStage,
          notes: milestoneNotes.trim(),
          isDelayed: milestoneDelayed,
        },
      });
      setMilestoneNotes('');
      setMilestoneDelayed(false);
      onToast(`Order status updated to ${formatOrderStatus(milestoneStage)}.`);
      onRefresh();
    } catch (err: any) {
      onToast(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleBuyerComplete = async (orderId: string) => {
    setBusy(true);
    try {
      await apiRequest(`/orders/${orderId}/milestones`, {
        method: 'POST',
        body: {
          stage: 'completed',
          notes: 'Buyer confirmed consignment delivery & quality inspection complete. Simulated escrow released.',
          isDelayed: false,
        },
      });
      onToast('Order marked Completed! Platform revenue is now recorded as realised in Admin Analytics.');
      onRefresh();
    } catch (err: any) {
      onToast(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleOpenDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    try {
      await apiRequest(`/orders/${selected.id}/dispute`, {
        method: 'POST',
        body: { reason: disputeReason },
      });
      setShowDispute(false);
      setDisputeReason('');
      onToast('Dispute escalated to Folkform Admin Operations.');
      onRefresh();
    } catch (err: any) {
      onToast(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (orders.length === 0) {
    return (
      <div className="bg-[#FFFCF6] border border-[#E9DCC7] p-12 text-center">
        <h3 className="font-serif text-2xl font-semibold text-[#3A2319]">No Purchase Orders Yet</h3>
        <p className="text-sm text-[#5C4334] mt-2">
          Accept a quotation in the Comparison Workspace to draft and approve your first Purchase
          Order.
        </p>
      </div>
    );
  }

  const currentStageIndex = selected
    ? TIMELINE_STAGES.indexOf(selected.status as (typeof TIMELINE_STAGES)[number])
    : -1;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left Order List */}
      <div className="lg:col-span-4 bg-[#FFFCF6] border border-[#E9DCC7] divide-y divide-[#E9DCC7]">
        <div className="p-4 bg-[#F8F3E8]">
          <p className="text-xs font-medium text-[#7A5E4B]">
            Purchase Orders ({orders.length})
          </p>
        </div>
        {orders.map((o) => {
          const active = selected?.id === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => setSelectedId(o.id)}
              className={`w-full text-left p-4 transition-colors cursor-pointer ${
                active ? 'bg-[#F8F3E8]' : 'hover:bg-[#F8F3E8]/50'
              }`}
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono font-medium text-[#3A2319]">{o.poNumber}</span>
                <span
                  className={`font-medium ${
                    o.status === 'completed'
                      ? 'text-[#4A5945]'
                      : o.status === 'disputed'
                        ? 'text-[#B05330]'
                        : 'text-[#8E6B2D]'
                  }`}
                >
                  {formatOrderStatus(o.status)}
                </span>
              </div>
              <p className="text-sm font-semibold text-[#3A2319] mt-1 line-clamp-1">{o.title}</p>
              <p className="text-xs text-[#7A5E4B] mt-0.5">
                {user.role === 'supplier' ? o.buyerCompany : o.supplierName}
              </p>
              <div className="flex justify-between text-xs font-mono text-[#5C4334] mt-2 tabular-nums">
                <span>{o.quantity} units</span>
                <span>{formatInr(o.totalAmountInr)}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Right Order Detail & Lifecycle Controls */}
      {selected && (
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-[#FFFCF6] border border-[#E9DCC7] p-6 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-[#E9DCC7]">
              <div>
                <p className="text-xs font-mono text-[#7A5E4B]">
                  {selected.poNumber}
                  {selected.rfqCode ? ` · ${selected.rfqCode}` : ''}
                  {selected.quoteCode ? ` · ${selected.quoteCode}` : ''}
                </p>
                <h3 className="font-serif text-3xl font-semibold text-[#3A2319] mt-1">
                  {selected.title}
                </h3>
                <p className="text-xs text-[#5C4334] mt-1">
                  Buyer: <strong>{selected.buyerCompany}</strong> · Supplier:{' '}
                  <strong>{selected.supplierName}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => downloadPurchaseOrderPdf(selected)}
                className="px-4 py-2 border border-[#3A2319] text-[#3A2319] hover:bg-[#3A2319] hover:text-[#FFFCF6] text-xs font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span>Download PO PDF</span>
              </button>
            </div>

            {/* Key Financials */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-5 border-b border-[#E9DCC7] text-xs">
              <div>
                <span className="text-[#7A5E4B] block">Quantity × Rate</span>
                <span className="font-mono text-sm font-medium text-[#3A2319] tabular-nums">
                  {selected.quantity} × {formatInr(selected.unitPriceInr)}
                </span>
              </div>
              <div>
                <span className="text-[#7A5E4B] block">Product Subtotal</span>
                <span className="font-mono text-sm font-medium text-[#3A2319] tabular-nums">
                  {formatInr(selected.subtotalInr)}
                </span>
              </div>
              <div>
                <span className="text-[#7A5E4B] block">Freight Estimate</span>
                <span className="font-mono text-sm font-medium text-[#3A2319] tabular-nums">
                  {formatInr(selected.shippingInr)}
                </span>
              </div>
              <div>
                <span className="text-[#7A5E4B] block">Total Order Value</span>
                <span className="font-mono text-base font-semibold text-[#B05330] tabular-nums">
                  {formatInr(selected.totalAmountInr)}
                </span>
              </div>
            </div>

            {/* Lifecycle Stage Progress Bar */}
            <div className="py-5 border-b border-[#E9DCC7]">
              <div className="flex items-center justify-between text-xs mb-3">
                <span className="font-medium text-[#3A2319]">
                  Current Stage: {formatOrderStatus(selected.status)}
                </span>
                <span className="text-[#7A5E4B]">
                  Target Delivery: {formatDate(selected.expectedDeliveryDate)} · {selected.deliveryLocation}
                </span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-9 gap-1.5">
                {TIMELINE_STAGES.map((stage, i) => {
                  const done = currentStageIndex >= i;
                  return (
                    <div key={stage} className="space-y-1">
                      <div
                        className={`h-1.5 ${
                          selected.status === 'disputed' && i === Math.max(0, currentStageIndex)
                            ? 'bg-[#B05330]'
                            : done
                              ? 'bg-[#4A5945]'
                              : 'bg-[#E9DCC7]'
                        }`}
                      />
                      <p className="text-[10px] leading-tight text-[#5C4334] truncate">
                        {formatOrderStatus(stage)}
                      </p>
                    </div>
                  );
                })}
              </div>

              {selected.disputeReason && (
                <div className="mt-4 p-3.5 bg-[#B05330]/10 border border-[#B05330]/35 text-xs text-[#3A2319] flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-[#B05330] shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-[#B05330]">Active Commercial Dispute</p>
                    <p className="mt-0.5">{selected.disputeReason}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Role-Specific Action Controls */}
            <div className="pt-5 flex flex-wrap items-center gap-3">
              {/* Buyer Explicit Human Approval Gate */}
              {(user.role === 'buyer' || user.role === 'admin') &&
                selected.status === 'awaiting_buyer_approval' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleBuyerApprove(selected.id)}
                    className="px-5 py-2.5 bg-[#B05330] hover:bg-[#964425] text-[#FFFCF6] text-xs font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>Approve & Release Purchase Order</span>
                  </button>
                )}

              {/* Buyer Simulated Escrow Funding */}
              {(user.role === 'buyer' || user.role === 'admin') &&
                selected.paymentStatus === 'unpaid' &&
                selected.status !== 'awaiting_buyer_approval' &&
                selected.status !== 'cancelled' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleSimulatedEscrow(selected.id)}
                    className="px-4 py-2.5 bg-[#3A2319] hover:bg-[#2A1912] text-[#FFFCF6] text-xs font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Fund Escrow (Simulated Adapter)</span>
                  </button>
                )}

              {/* Buyer Final Acceptance -> Completes Order & Realises Revenue */}
              {(user.role === 'buyer' || user.role === 'admin') &&
                ['shipped', 'delivered', 'quality_check', 'production_started', 'supplier_confirmed'].includes(
                  selected.status,
                ) && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleBuyerComplete(selected.id)}
                    className="px-4 py-2.5 bg-[#4A5945] hover:bg-[#3B4837] text-[#FFFCF6] text-xs font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Confirm Receipt & Complete Order</span>
                  </button>
                )}

              {/* Supplier Confirmation Gate */}
              {user.role === 'supplier' && selected.status === 'purchase_order_created' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleSupplierConfirm(selected.id)}
                  className="px-5 py-2.5 bg-[#B05330] hover:bg-[#964425] text-[#FFFCF6] text-xs font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>Confirm Purchase Order & Lock Production Slot</span>
                </button>
              )}

              {/* Dispute Button */}
              {selected.status !== 'completed' &&
                selected.status !== 'cancelled' &&
                selected.status !== 'disputed' && (
                  <button
                    type="button"
                    onClick={() => setShowDispute(!showDispute)}
                    className="px-3.5 py-2.5 border border-[#E9DCC7] text-xs text-[#7A5E4B] hover:text-[#B05330] hover:border-[#B05330] cursor-pointer"
                  >
                    Raise Dispute
                  </button>
                )}

              <span className="text-[11px] text-[#7A5E4B] ml-auto">
                Settlement: {selected.paymentStatus.replace(/_/g, ' ')} (Simulated Mock Adapter)
              </span>
            </div>

            {showDispute && (
              <form
                onSubmit={handleOpenDispute}
                className="mt-4 pt-4 border-t border-[#E9DCC7] space-y-3"
              >
                <textarea
                  required
                  minLength={8}
                  rows={2}
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  placeholder="Describe delay, quality variance, or logistics concern for Folkform Admin mediation..."
                  className="w-full px-3 py-2 bg-[#F8F3E8] border border-[#E9DCC7] text-xs"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDispute(false)}
                    className="px-3 py-1.5 text-xs border border-[#E9DCC7] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className="px-4 py-1.5 bg-[#B05330] text-[#FFFCF6] text-xs font-medium cursor-pointer"
                  >
                    Escalate to Admin
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Supplier / Admin Production Milestone Update Panel */}
          {(user.role === 'supplier' || user.role === 'admin') &&
            selected.status !== 'awaiting_buyer_approval' &&
            selected.status !== 'completed' &&
            selected.status !== 'cancelled' && (
              <form
                onSubmit={handleAddMilestone}
                className="bg-[#FFFCF6] border border-[#E9DCC7] p-6 space-y-4"
              >
                <div>
                  <h4 className="font-serif text-xl font-semibold text-[#3A2319]">
                    Update Production & Dispatch Milestone
                  </h4>
                  <p className="text-xs text-[#7A5E4B]">
                    Updates the shared order timeline and sends a live notification to the buyer.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[#7A5E4B] mb-1">
                      Next Milestone Stage
                    </label>
                    <select
                      value={milestoneStage}
                      onChange={(e) => setMilestoneStage(e.target.value)}
                      className="w-full px-3 py-2 bg-[#F8F3E8] border border-[#E9DCC7] text-sm"
                    >
                      {NEXT_SUPPLIER_STAGES.map((st) => (
                        <option key={st.value} value={st.value}>
                          {st.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end pb-2">
                    <label className="flex items-center gap-2 text-xs text-[#3A2319] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={milestoneDelayed}
                        onChange={(e) => setMilestoneDelayed(e.target.checked)}
                        className="accent-[#B05330]"
                      />
                      <span>Flag potential production delay (alerts Fulfilment Agent)</span>
                    </label>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#7A5E4B] mb-1">
                    Production / Inspection Note *
                  </label>
                  <input
                    required
                    minLength={4}
                    value={milestoneNotes}
                    onChange={(e) => setMilestoneNotes(e.target.value)}
                    placeholder="e.g. 500 glazed ceramic bases passed QC check; packing in 5-ply export cartons..."
                    className="w-full px-3.5 py-2 bg-[#F8F3E8] border border-[#E9DCC7] text-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-5 py-2.5 bg-[#3A2319] hover:bg-[#B05330] text-[#FFFCF6] text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                >
                  Record Milestone Update
                </button>
              </form>
            )}

          {/* Recorded Milestone Audit History */}
          <div className="bg-[#FFFCF6] border border-[#E9DCC7] p-6">
            <h4 className="font-serif text-xl font-semibold text-[#3A2319] mb-4">
              Order Audit Timeline
            </h4>
            <ol className="space-y-4">
              {(selected.milestones ?? []).map((m) => (
                <li
                  key={m.id}
                  className="pb-4 border-b border-[#E9DCC7] last:border-b-0 last:pb-0 flex flex-col sm:flex-row sm:items-start justify-between gap-2"
                >
                  <div>
                    <p className="text-sm font-semibold text-[#3A2319]">
                      {formatOrderStatus(m.stage)}
                      {m.isDelayed && (
                        <span className="ml-2 text-xs font-normal text-[#B05330]">
                          (Delay Flagged)
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-[#5C4334] mt-0.5">{m.notes}</p>
                    <p className="text-[11px] text-[#7A5E4B] mt-1">
                      Updated by {m.updatedByName || 'System'}
                    </p>
                  </div>
                  <span className="text-xs font-mono text-[#7A5E4B] shrink-0">
                    {formatDate(m.createdAt)}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
};
