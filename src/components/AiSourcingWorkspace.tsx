import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Cpu,
  Send,
  Sliders,
  Sparkles,
} from 'lucide-react';
import { apiRequest, formatInr, formatVerificationLabel } from '../lib/api';
import { CraftImage } from './CraftImage';
import type { AuthUser, SourcingWorkflowResult } from '../types';

interface AiSourcingWorkspaceProps {
  user: AuthUser | null;
  initialPrompt?: string;
  onNavigate: (path: string) => void;
  onToast: (msg: string) => void;
  onRfqCreated?: () => void;
}

const PRESET_BRIEFS = [
  {
    label: '500 Rajasthan Ceramic Table Lamps (Boutique Hotel)',
    prompt:
      'I need 500 handcrafted ceramic table lamps from Rajasthan for a boutique hotel. My budget is ₹1,000 to ₹1,500 per unit. Delivery required within 30 days.',
  },
  {
    label: '300 Moradabad Hammered Brass Lobby Vessels',
    prompt:
      'Source 300 hand-hammered antique brass urlis and candle holders from Moradabad for a European homeware retailer. Target ₹1,500 to ₹2,200 per unit within 28 days.',
  },
  {
    label: '250 Kutch Handwoven Kala Cotton Throws',
    prompt:
      'Looking for 250 organic handloom Kala cotton bed throws and Ajrakh table runners from Kutch Gujarat under ₹1,400 per unit delivered within 25 days.',
  },
  {
    label: '400 Channapatna Wooden Corporate Gift Hampers',
    prompt:
      'Need 400 eco-friendly Channapatna natural lacquerware wooden gift boxes from Karnataka for executive corporate gifting under ₹1,600 per box in 22 days.',
  },
];

export const AiSourcingWorkspace: React.FC<AiSourcingWorkspaceProps> = ({
  user,
  initialPrompt,
  onNavigate,
  onToast,
  onRfqCreated,
}) => {
  const [prompt, setPrompt] = useState(initialPrompt || PRESET_BRIEFS[0].prompt);
  const [running, setRunning] = useState(false);
  const [workflow, setWorkflow] = useState<SourcingWorkflowResult | null>(null);
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<string[]>([]);
  const [showWeights, setShowWeights] = useState(false);
  const [showAgentLogs, setShowAgentLogs] = useState(true);
  const [expandedSupplier, setExpandedSupplier] = useState<string | null>(null);

  // Configurable 8-dimension matching weights
  const [weights, setWeights] = useState({
    categoryRelevance: 20,
    craftTechnique: 15,
    materials: 10,
    geographicPreference: 15,
    moqCompatibility: 10,
    capacityCompatibility: 10,
    leadTimeCompatibility: 10,
    customisationAbility: 10,
  });

  // Human-editable RFQ confirmation fields
  const [rfqDraft, setRfqDraft] = useState({
    title: '',
    quantity: 500,
    budgetMinInr: 1000,
    budgetMaxInr: 1500,
    deliveryLocation: 'Udaipur, Rajasthan',
    requiredLeadDays: 30,
    preferredMaterials: '',
    craftTechnique: '',
    customisationRequirements: '',
    additionalInstructions: '',
  });
  const [humanConfirmed, setHumanConfirmed] = useState(false);
  const [submittingRfq, setSubmittingRfq] = useState(false);

  useEffect(() => {
    if (initialPrompt) setPrompt(initialPrompt);
  }, [initialPrompt]);

  const executeWorkflow = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!user) {
      onToast('Sign in (or use Buyer Demo) to execute Folkform Sourcing Intelligence.');
      onNavigate('/auth');
      return;
    }
    if (prompt.trim().length < 10) {
      onToast('Please describe your procurement requirements in detail.');
      return;
    }
    setRunning(true);
    setHumanConfirmed(false);
    try {
      const res = await apiRequest<{ workflow: SourcingWorkflowResult }>('/ai/sourcing', {
        method: 'POST',
        body: { prompt: prompt.trim(), weights },
      });
      const wf = res.workflow;
      setWorkflow(wf);
      setSelectedSupplierIds(wf.shortlist.slice(0, 3).map((s) => s.supplierId));
      setExpandedSupplier(wf.shortlist[0]?.supplierId ?? null);
      setRfqDraft({
        title: wf.extractedSpec.productTitle,
        quantity: wf.extractedSpec.quantity,
        budgetMinInr: wf.extractedSpec.budgetMinInr ?? 0,
        budgetMaxInr: wf.extractedSpec.budgetMaxInr ?? 0,
        deliveryLocation: wf.extractedSpec.deliveryLocation,
        requiredLeadDays: wf.extractedSpec.requiredLeadDays ?? 30,
        preferredMaterials: wf.extractedSpec.preferredMaterials,
        craftTechnique: wf.extractedSpec.craftTechnique,
        customisationRequirements: wf.extractedSpec.customisationRequirements,
        additionalInstructions: '',
      });
      onToast(`Sourcing Intelligence completed across 6 active agents (${wf.shortlist.length} makers shortlisted).`);
    } catch (err: any) {
      onToast(err.message);
    } finally {
      setRunning(false);
    }
  };

  const handleRescore = async () => {
    if (!workflow) return;
    try {
      const res = await apiRequest<{
        shortlist: SourcingWorkflowResult['shortlist'];
        insufficientMatchesNotice: string | null;
      }>(`/ai/workflows/${workflow.workflowId}/rescore`, {
        method: 'POST',
        body: { weights },
      });
      setWorkflow({
        ...workflow,
        shortlist: res.shortlist,
        insufficientMatchesNotice: res.insufficientMatchesNotice,
      });
      onToast('Shortlist re-ranked with your custom dimension weights.');
    } catch (err: any) {
      onToast(err.message);
    }
  };

  const toggleSupplierSelection = (id: string) => {
    setSelectedSupplierIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  };

  const handleConfirmDispatchRfq = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workflow) return;
    if (!humanConfirmed) {
      onToast('Please confirm human approval before dispatching the RFQ to workshops.');
      return;
    }
    if (selectedSupplierIds.length === 0) {
      onToast('Select at least one shortlisted supplier to invite.');
      return;
    }
    setSubmittingRfq(true);
    try {
      const res = await apiRequest<{ rfqCode: string; invitedSuppliersCount: number }>('/rfqs', {
        method: 'POST',
        body: {
          title: rfqDraft.title,
          categorySlugOrId: workflow.extractedSpec.categorySlug,
          description: prompt.trim(),
          quantity: rfqDraft.quantity,
          targetUnitPriceInr: rfqDraft.budgetMaxInr || undefined,
          budgetMinInr: rfqDraft.budgetMinInr || undefined,
          budgetMaxInr: rfqDraft.budgetMaxInr || undefined,
          preferredMaterials: rfqDraft.preferredMaterials,
          craftTechnique: rfqDraft.craftTechnique,
          customisationRequirements: rfqDraft.customisationRequirements,
          deliveryLocation: rfqDraft.deliveryLocation,
          requiredLeadDays: rfqDraft.requiredLeadDays,
          additionalInstructions: rfqDraft.additionalInstructions,
          invitedSupplierIds: selectedSupplierIds,
          aiWorkflowId: workflow.workflowId,
        },
      });
      onToast(
        `${res.rfqCode} dispatched to ${res.invitedSuppliersCount} supplier workshop(s). Suppliers have been notified in their RFQ Inbox.`,
      );
      onRfqCreated?.();
      onNavigate('/buyer/rfqs');
    } catch (err: any) {
      onToast(err.message);
    } finally {
      setSubmittingRfq(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header & Prompt Composer */}
      <div className="bg-[#3A2319] text-[#FFFCF6] p-7 sm:p-9">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-[#FFFCF6]/15">
          <div>
            <p className="text-xs text-[#BE9753] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Folkform Sourcing Intelligence · Multi-Agent Procurement Engine</span>
            </p>
            <h2 className="font-serif text-3xl sm:text-4xl font-semibold mt-1">
              Describe Your Bulk Craft Requirement
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setShowWeights(!showWeights)}
            className="px-3.5 py-2 border border-[#FFFCF6]/25 text-xs text-[#E9DCC7] hover:border-[#BE9753] flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Matching Weights</span>
          </button>
        </div>

        <form onSubmit={executeWorkflow} className="mt-6 space-y-4">
          <textarea
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe product, craft origin, quantity, target INR unit price range, customisation needs, and delivery timeline..."
            className="w-full bg-[#2B1912] border border-[#FFFCF6]/20 p-4 text-sm text-[#FFFCF6] placeholder:text-[#E9DCC7]/50 focus:border-[#BE9753] focus:outline-none"
          />

          <div className="flex flex-wrap gap-2">
            {PRESET_BRIEFS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setPrompt(p.prompt)}
                className="text-xs px-3 py-1.5 border border-[#FFFCF6]/20 text-[#E9DCC7] hover:border-[#BE9753] hover:text-[#FFFCF6] transition-colors cursor-pointer"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Configurable Matching Dimension Weights */}
          {showWeights && (
            <div className="p-5 bg-[#2B1912] border border-[#FFFCF6]/15 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-[#BE9753]">
                  Transparent Supplier Matching Engine Weights
                </p>
                {workflow && (
                  <button
                    type="button"
                    onClick={handleRescore}
                    className="px-3 py-1 bg-[#B05330] text-[#FFFCF6] text-xs font-medium cursor-pointer"
                  >
                    Re-score Shortlist Now
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {(Object.keys(weights) as (keyof typeof weights)[]).map((key) => (
                  <label key={key} className="block text-xs text-[#E9DCC7]">
                    <div className="flex justify-between mb-1">
                      <span className="capitalize">
                        {key.replace(/([A-Z])/g, ' $1').trim()}
                      </span>
                      <span className="font-mono tabular-nums">{weights[key]}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={35}
                      value={weights[key]}
                      onChange={(e) =>
                        setWeights({ ...weights, [key]: Number(e.target.value) })
                      }
                      className="w-full accent-[#BE9753]"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4 pt-3">
            <p className="text-xs text-[#E9DCC7]/75">
              Grounded strictly in live database suppliers · Pauses for buyer confirmation before
              submitting RFQs
            </p>
            <button
              type="submit"
              disabled={running}
              className="px-6 py-3 bg-[#B05330] hover:bg-[#C6613A] text-[#FFFCF6] text-sm font-medium transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-60 whitespace-nowrap"
            >
              <span>{running ? 'Running Multi-Agent Orchestrator…' : 'Analyse & Shortlist Suppliers'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>

      {/* Results Workspace */}
      {workflow && (
        <div className="space-y-8">
          {/* 1. Multi-Agent Orchestration Execution Trace */}
          <div className="bg-[#FFFCF6] border border-[#E9DCC7] p-6">
            <button
              type="button"
              onClick={() => setShowAgentLogs(!showAgentLogs)}
              className="w-full flex items-center justify-between text-left cursor-pointer"
            >
              <div>
                <p className="text-xs text-[#7A5E4B] flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-[#B05330]" />
                  <span>Orchestrator Execution Trace · {workflow.providerUsed}</span>
                </p>
                <h3 className="font-serif text-2xl font-semibold text-[#3A2319] mt-0.5">
                  6 Sourcing Agents Completed · Workflow Persisted to Audit Ledger
                </h3>
              </div>
              {showAgentLogs ? (
                <ChevronUp className="w-5 h-5 text-[#7A5E4B]" />
              ) : (
                <ChevronDown className="w-5 h-5 text-[#7A5E4B]" />
              )}
            </button>

            {showAgentLogs && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-5 pt-5 border-t border-[#E9DCC7]">
                {workflow.agentLogs.map((log) => (
                  <div key={log.id} className="p-4 bg-[#F8F3E8] border border-[#E9DCC7]">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[#3A2319]">
                        0{log.stepOrder}. {log.agentName}
                      </span>
                      <span className="font-mono text-[#7A5E4B] tabular-nums">
                        {log.durationMs}ms
                      </span>
                    </div>
                    <p className="text-xs text-[#5C4334] mt-2 leading-relaxed">
                      {log.outputSummary}
                    </p>
                    <p className="text-[11px] font-mono text-[#7A5E4B] mt-2 truncate">
                      Tools: {log.toolCalls.join(', ')}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 2. Extracted Structured Spec + Pricing Intelligence + Risks */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6 bg-[#FFFCF6] border border-[#E9DCC7] p-6 space-y-4">
              <h3 className="font-serif text-2xl font-semibold text-[#3A2319]">
                Extracted Requirement Specification
              </h3>
              <dl className="grid grid-cols-2 gap-4 text-xs pt-2 border-t border-[#E9DCC7]">
                <div>
                  <dt className="text-[#7A5E4B]">Craft Category</dt>
                  <dd className="font-semibold text-[#3A2319] mt-0.5">
                    {workflow.extractedSpec.categoryName}
                  </dd>
                </div>
                <div>
                  <dt className="text-[#7A5E4B]">Order Volume</dt>
                  <dd className="font-mono font-semibold text-[#3A2319] tabular-nums mt-0.5">
                    {workflow.extractedSpec.quantity.toLocaleString('en-IN')} units
                  </dd>
                </div>
                <div>
                  <dt className="text-[#7A5E4B]">Unit Budget Band</dt>
                  <dd className="font-mono font-semibold text-[#3A2319] tabular-nums mt-0.5">
                    {workflow.extractedSpec.budgetMaxInr
                      ? `${formatInr(workflow.extractedSpec.budgetMinInr)} – ${formatInr(workflow.extractedSpec.budgetMaxInr)}`
                      : 'Not specified'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[#7A5E4B]">Region & Lead Window</dt>
                  <dd className="font-semibold text-[#3A2319] mt-0.5">
                    {workflow.extractedSpec.preferredRegion || 'Pan-India'} ·{' '}
                    {workflow.extractedSpec.requiredLeadDays
                      ? `${workflow.extractedSpec.requiredLeadDays} days`
                      : 'Flexible'}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-[#7A5E4B]">Preferred Materials & Technique</dt>
                  <dd className="text-[#3A2319] mt-0.5">
                    {workflow.extractedSpec.preferredMaterials} —{' '}
                    {workflow.extractedSpec.craftTechnique}
                  </dd>
                </div>
              </dl>

              {workflow.extractedSpec.missingInformation.length > 0 && (
                <div className="pt-4 border-t border-[#E9DCC7]">
                  <p className="text-xs font-semibold text-[#8E6B2D]">
                    Missing Details / Recommended Clarifications
                  </p>
                  <ul className="mt-2 space-y-1 text-xs text-[#5C4334]">
                    {workflow.extractedSpec.missingInformation.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="lg:col-span-6 bg-[#FFFCF6] border border-[#E9DCC7] p-6 space-y-4">
              <h3 className="font-serif text-2xl font-semibold text-[#3A2319]">
                Pricing Intelligence & Sourcing Risks
              </h3>
              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-[#E9DCC7]">
                <div>
                  <p className="text-xs text-[#7A5E4B]">Indicative Unit Band</p>
                  <p className="font-mono text-xl font-medium text-[#3A2319] tabular-nums mt-0.5">
                    {workflow.pricingSummary.estimatedUnitRangeInr
                      ? `${formatInr(workflow.pricingSummary.estimatedUnitRangeInr.min)} – ${formatInr(workflow.pricingSummary.estimatedUnitRangeInr.max)}`
                      : 'Insufficient data'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#7A5E4B]">Est. Product Subtotal</p>
                  <p className="font-mono text-xl font-medium text-[#B05330] tabular-nums mt-0.5">
                    {workflow.pricingSummary.estimatedOrderTotalRangeInr
                      ? `${formatInr(workflow.pricingSummary.estimatedOrderTotalRangeInr.min)} – ${formatInr(workflow.pricingSummary.estimatedOrderTotalRangeInr.max)}`
                      : '—'}
                  </p>
                </div>
              </div>
              <p className="text-xs text-[#3A2319]">{workflow.pricingSummary.budgetAlignmentNote}</p>

              {workflow.pricingSummary.costTradeoffs.length > 0 && (
                <ul className="space-y-1.5 text-xs text-[#5C4334]">
                  {workflow.pricingSummary.costTradeoffs.map((t) => (
                    <li key={t}>• {t}</li>
                  ))}
                </ul>
              )}

              <div className="pt-3 border-t border-[#E9DCC7]">
                <p className="text-xs font-semibold text-[#B05330] flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Capacity & Timeline Risk Flags</span>
                </p>
                <ul className="mt-2 space-y-1 text-xs text-[#5C4334]">
                  {workflow.riskFlags.map((rf) => (
                    <li key={rf}>• {rf}</li>
                  ))}
                </ul>
              </div>
              <p className="text-[11px] text-[#7A5E4B]">{workflow.pricingSummary.disclaimer}</p>
            </div>
          </div>

          {/* Insufficient Matches Honest Notice */}
          {workflow.insufficientMatchesNotice && (
            <div className="p-4 bg-[#E9DCC7]/60 border border-[#BE9753] text-xs text-[#3A2319]">
              <strong>Coverage Notice:</strong> {workflow.insufficientMatchesNotice}
            </div>
          )}

          {/* 3. Explainable Supplier Shortlist */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h3 className="font-serif text-3xl font-semibold text-[#3A2319]">
                  Explainable Supplier Shortlist ({workflow.shortlist.length})
                </h3>
                <p className="text-xs text-[#7A5E4B] mt-0.5">
                  AI recommendations grounded in database records — distinct from confirmed supplier
                  commitments. Check workshops to invite into your RFQ.
                </p>
              </div>
              <span className="text-xs font-mono text-[#3A2319]">
                {selectedSupplierIds.length} selected for RFQ dispatch
              </span>
            </div>

            <div className="space-y-4">
              {workflow.shortlist.map((match) => {
                const isSelected = selectedSupplierIds.includes(match.supplierId);
                const isExpanded = expandedSupplier === match.supplierId;
                return (
                  <div
                    key={match.supplierId}
                    className={`bg-[#FFFCF6] border transition-colors ${
                      isSelected ? 'border-[#B05330]' : 'border-[#E9DCC7]'
                    }`}
                  >
                    <div className="p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                      <div className="flex items-start gap-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSupplierSelection(match.supplierId)}
                          aria-label={`Select ${match.supplierName} for RFQ`}
                          className="mt-1.5 w-4 h-4 accent-[#B05330] cursor-pointer"
                        />
                        <div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-[#7A5E4B]">
                            <span>
                              {match.city}, {match.state}
                            </span>
                            <span>·</span>
                            <span>{match.supplierType}</span>
                            <span>·</span>
                            <span className="text-[#4A5945] font-medium">
                              {formatVerificationLabel(match.verificationStatus, true)}
                            </span>
                          </div>
                          <h4 className="font-serif text-2xl font-semibold text-[#3A2319] mt-1">
                            {match.supplierName}
                          </h4>
                          <p className="text-xs text-[#5C4334] mt-1.5 max-w-2xl leading-relaxed">
                            {match.recommendationReason}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-6 shrink-0">
                        <div className="text-right">
                          <span className="text-[11px] text-[#7A5E4B] block">Indicative Unit</span>
                          <span className="font-mono text-base font-medium text-[#3A2319] tabular-nums">
                            {match.indicativeUnitRangeInr
                              ? formatInr(match.indicativeUnitRangeInr.min)
                              : 'On Quote'}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[11px] text-[#7A5E4B] block">MOQ / Lead</span>
                          <span className="font-mono text-sm text-[#3A2319] tabular-nums">
                            {match.defaultMoq}u · {match.defaultLeadTimeDays}d
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[11px] text-[#7A5E4B] block">Declared Cap.</span>
                          <span className="font-mono text-sm text-[#3A2319] tabular-nums">
                            {match.monthlyCapacityUnits}/mo
                          </span>
                        </div>
                        <div className="text-right pl-4 border-l border-[#E9DCC7]">
                          <span className="text-[11px] text-[#7A5E4B] block">Match Score</span>
                          <span className="font-mono text-2xl font-semibold text-[#B05330] tabular-nums">
                            {match.overallScore}
                            <span className="text-xs text-[#7A5E4B] font-normal">/100</span>
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedSupplier(isExpanded ? null : match.supplierId)
                          }
                          className="p-2 border border-[#E9DCC7] hover:border-[#3A2319] cursor-pointer"
                          aria-label="Inspect dimension breakdown"
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="px-6 pb-6 pt-4 border-t border-[#E9DCC7] bg-[#F8F3E8]/60 space-y-5">
                        {/* 8-Dimension Scoring Matrix */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                          {match.dimensions.map((dim) => (
                            <div
                              key={dim.dimension}
                              className="p-3 bg-[#FFFCF6] border border-[#E9DCC7]"
                            >
                              <div className="flex justify-between text-xs">
                                <span className="font-medium text-[#3A2319]">{dim.dimension}</span>
                                <span className="font-mono font-medium text-[#B05330] tabular-nums">
                                  {dim.score}
                                </span>
                              </div>
                              <div className="h-1 bg-[#E9DCC7] mt-1.5">
                                <div
                                  className="h-full bg-[#3A2319]"
                                  style={{ width: `${dim.score}%` }}
                                />
                              </div>
                              <p className="text-[11px] text-[#7A5E4B] mt-1.5 leading-snug">
                                {dim.rationale}
                              </p>
                            </div>
                          ))}
                        </div>

                        {match.potentialConcerns.length > 0 && (
                          <div className="text-xs text-[#B05330]">
                            <strong>Potential Concerns:</strong>{' '}
                            {match.potentialConcerns.join(' · ')}
                          </div>
                        )}

                        {/* Matched Catalog Products */}
                        {match.matchedProducts.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-[#7A5E4B] mb-2">
                              Matched Catalogue Products from This Workshop
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              {match.matchedProducts.map((mp) => (
                                <button
                                  key={mp.id}
                                  type="button"
                                  onClick={() => onNavigate(`/products/${mp.id}`)}
                                  className="flex items-center gap-3 p-2.5 bg-[#FFFCF6] border border-[#E9DCC7] hover:border-[#B05330] text-left cursor-pointer"
                                >
                                  <div className="w-16 h-12 shrink-0 overflow-hidden">
                                    <CraftImage src={mp.imageUrl} alt={mp.name} />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold text-[#3A2319] truncate">
                                      {mp.name}
                                    </p>
                                    <p className="text-[11px] font-mono text-[#7A5E4B] tabular-nums">
                                      {formatInr(mp.indicativePriceInr)}/u · MOQ {mp.moq} ·{' '}
                                      {mp.leadTimeDays}d
                                    </p>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4. Human-in-the-Loop Structured RFQ Confirmation Panel */}
          <form
            onSubmit={handleConfirmDispatchRfq}
            className="bg-[#FFFCF6] border border-[#3A2319] p-7 space-y-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#E9DCC7]">
              <div>
                <p className="text-xs font-medium text-[#B05330]">
                  Procurement Agent · Mandatory Human Approval Gate
                </p>
                <h3 className="font-serif text-2xl font-semibold text-[#3A2319] mt-0.5">
                  Review & Dispatch Structured RFQ
                </h3>
              </div>
              <span className="text-xs font-mono text-[#7A5E4B]">
                Inviting {selectedSupplierIds.length} workshop(s)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-[#7A5E4B] mb-1">RFQ Title *</label>
                <input
                  required
                  value={rfqDraft.title}
                  onChange={(e) => setRfqDraft({ ...rfqDraft, title: e.target.value })}
                  className="w-full px-3 py-2 bg-[#F8F3E8] border border-[#E9DCC7] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#7A5E4B] mb-1">Quantity *</label>
                <input
                  type="number"
                  required
                  min={1}
                  value={rfqDraft.quantity}
                  onChange={(e) => setRfqDraft({ ...rfqDraft, quantity: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-[#F8F3E8] border border-[#E9DCC7] text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#7A5E4B] mb-1">
                  Target Lead Days
                </label>
                <input
                  type="number"
                  min={5}
                  value={rfqDraft.requiredLeadDays}
                  onChange={(e) =>
                    setRfqDraft({ ...rfqDraft, requiredLeadDays: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 bg-[#F8F3E8] border border-[#E9DCC7] text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#7A5E4B] mb-1">
                  Budget Min (₹/u)
                </label>
                <input
                  type="number"
                  value={rfqDraft.budgetMinInr}
                  onChange={(e) =>
                    setRfqDraft({ ...rfqDraft, budgetMinInr: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 bg-[#F8F3E8] border border-[#E9DCC7] text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#7A5E4B] mb-1">
                  Budget Max (₹/u)
                </label>
                <input
                  type="number"
                  value={rfqDraft.budgetMaxInr}
                  onChange={(e) =>
                    setRfqDraft({ ...rfqDraft, budgetMaxInr: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 bg-[#F8F3E8] border border-[#E9DCC7] text-sm font-mono"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-[#7A5E4B] mb-1">
                  Delivery Destination *
                </label>
                <input
                  required
                  value={rfqDraft.deliveryLocation}
                  onChange={(e) => setRfqDraft({ ...rfqDraft, deliveryLocation: e.target.value })}
                  className="w-full px-3 py-2 bg-[#F8F3E8] border border-[#E9DCC7] text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-[#7A5E4B] mb-1">
                  Preferred Materials
                </label>
                <input
                  value={rfqDraft.preferredMaterials}
                  onChange={(e) =>
                    setRfqDraft({ ...rfqDraft, preferredMaterials: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-[#F8F3E8] border border-[#E9DCC7] text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-[#7A5E4B] mb-1">
                  Customisation & Packing Notes
                </label>
                <input
                  value={rfqDraft.customisationRequirements}
                  onChange={(e) =>
                    setRfqDraft({ ...rfqDraft, customisationRequirements: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-[#F8F3E8] border border-[#E9DCC7] text-sm"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-[#E9DCC7] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <label className="flex items-start gap-2.5 text-xs text-[#3A2319] cursor-pointer max-w-xl">
                <input
                  type="checkbox"
                  checked={humanConfirmed}
                  onChange={(e) => setHumanConfirmed(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-[#B05330]"
                />
                <span>
                  I confirm these specifications and authorize Folkform to dispatch this RFQ to the{' '}
                  <strong>{selectedSupplierIds.length} selected supplier(s)</strong>. No financial
                  commitment occurs until I review quotations and approve a Purchase Order.
                </span>
              </label>

              <button
                type="submit"
                disabled={submittingRfq || !humanConfirmed || selectedSupplierIds.length === 0}
                className="px-6 py-3 bg-[#B05330] hover:bg-[#964425] text-[#FFFCF6] text-xs font-medium flex items-center gap-2 whitespace-nowrap cursor-pointer disabled:opacity-50"
              >
                {submittingRfq ? (
                  <span>Dispatching RFQ…</span>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Confirm & Submit RFQ</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
