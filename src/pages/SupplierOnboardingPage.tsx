import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { apiRequest, setStoredToken } from '../lib/api';
import type { ArtisanCluster, AuthUser, ProductCategory } from '../types';

interface SupplierOnboardingPageProps {
  onAuthSuccess: (user: AuthUser) => void;
  onNavigate: (path: string) => void;
  onToast: (msg: string) => void;
}

const STEPS = [
  'Business & Artisan Details',
  'Cluster & Craft Categories',
  'Capacity, MOQ & Lead Times',
  'First Catalogue Product',
  'Verification Evidence',
];

export const SupplierOnboardingPage: React.FC<SupplierOnboardingPageProps> = ({
  onAuthSuccess,
  onNavigate,
  onToast,
}) => {
  const [step, setStep] = useState(0);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [clusters, setClusters] = useState<ArtisanCluster[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    businessName: '',
    supplierType: 'Craft Cooperative',
    city: 'Jaipur',
    state: 'Rajasthan',
    clusterId: 'cluster-jaipur',
    craftHeritageSummary: '',
    categoryIds: ['cat-pottery'] as string[],
    monthlyCapacityUnits: 450,
    defaultMoq: 75,
    defaultLeadTimeDays: 21,
    customisationSupported: true,
    exportReady: true,
    firstProductName: '',
    firstProductMaterials: '',
    firstProductTechnique: '',
    firstProductPriceInr: 1200,
    documentType: 'Artisan Identity Card / MSME Udyam Certificate',
    documentRef: '',
    documentNotes: '',
  });

  useEffect(() => {
    Promise.all([
      apiRequest<{ categories: ProductCategory[] }>('/categories'),
      apiRequest<{ clusters: ArtisanCluster[] }>('/clusters'),
    ])
      .then(([cRes, clRes]) => {
        setCategories(cRes.categories);
        setClusters(clRes.clusters);
      })
      .catch(() => {});
  }, []);

  const toggleCategory = (id: string) => {
    setForm((prev) => ({
      ...prev,
      categoryIds: prev.categoryIds.includes(id)
        ? prev.categoryIds.filter((c) => c !== id)
        : [...prev.categoryIds, id],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.categoryIds.length === 0) {
      onToast('Select at least one craft category.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiRequest<{ token: string; user: AuthUser }>('/supplier/onboard', {
        method: 'POST',
        body: form,
      });
      setStoredToken(res.token);
      onAuthSuccess(res.user);
      onToast('Workshop onboarded! Welcome to your Folkform Supplier Dashboard.');
      onNavigate('/supplier/overview');
    } catch (err: any) {
      onToast(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="mb-8">
        <p className="text-xs font-medium text-[#7A5E4B]">Artisan & Workshop Onboarding</p>
        <h1 className="font-serif text-4xl font-semibold text-[#3A2319] mt-1">
          Build Your Digital Trade Storefront on Folkform
        </h1>
        <p className="text-sm text-[#5C4334] mt-2 max-w-2xl">
          Connect your craft collective, weaving unit, or studio directly to hospitality, retail,
          and international B2B procurement teams.
        </p>
      </div>

      {/* Stepper */}
      <div className="grid grid-cols-5 gap-2 mb-8">
        {STEPS.map((label, idx) => (
          <button
            key={label}
            type="button"
            onClick={() => idx <= step && setStep(idx)}
            className={`text-left p-3 border transition-colors cursor-pointer ${
              idx === step
                ? 'bg-[#3A2319] text-[#FFFCF6] border-[#3A2319]'
                : idx < step
                  ? 'bg-[#EFE6D6] text-[#3A2319] border-[#D6C3A8]'
                  : 'bg-[#FFFCF6] text-[#7A5E4B] border-[#E9DCC7]'
            }`}
          >
            <span className="font-mono text-[11px] block">0{idx + 1}</span>
            <span className="text-xs font-medium line-clamp-1 mt-0.5">{label}</span>
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="bg-[#FFFCF6] border border-[#E9DCC7] p-8 space-y-6">
        {step === 0 && (
          <div className="space-y-5">
            <h2 className="font-serif text-2xl font-semibold text-[#3A2319]">
              01. Business & Artisan Organisation Details
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#7A5E4B] mb-1">
                  Artisan / Representative Full Name *
                </label>
                <input
                  required
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  placeholder="e.g. Mahesh Prajapati"
                  className="w-full px-3.5 py-2.5 bg-[#F8F3E8] border border-[#E9DCC7] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#7A5E4B] mb-1">
                  Workshop / Cooperative Name *
                </label>
                <input
                  required
                  value={form.businessName}
                  onChange={(e) => setForm({ ...form, businessName: e.target.value })}
                  placeholder="e.g. Bagru Clay & Loom Collective"
                  className="w-full px-3.5 py-2.5 bg-[#F8F3E8] border border-[#E9DCC7] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#7A5E4B] mb-1">
                  Organisation Type *
                </label>
                <select
                  value={form.supplierType}
                  onChange={(e) => setForm({ ...form, supplierType: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[#F8F3E8] border border-[#E9DCC7] text-sm"
                >
                  <option>Individual Artisan</option>
                  <option>Weavers</option>
                  <option>Craft Cooperative</option>
                  <option>Self-Help Group</option>
                  <option>Small Manufacturer</option>
                  <option>Artisan Collective</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#7A5E4B] mb-1">
                  Business Email *
                </label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="studio@example.com"
                  className="w-full px-3.5 py-2.5 bg-[#F8F3E8] border border-[#E9DCC7] text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#7A5E4B] mb-1">
                Account Password (min 6 characters) *
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Create a secure password"
                className="w-full px-3.5 py-2.5 bg-[#F8F3E8] border border-[#E9DCC7] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#7A5E4B] mb-1">
                Craftsmanship & Heritage Story *
              </label>
              <textarea
                rows={3}
                required
                value={form.craftHeritageSummary}
                onChange={(e) => setForm({ ...form, craftHeritageSummary: e.target.value })}
                placeholder="Describe your craft lineage, number of artisans, and workshop techniques..."
                className="w-full px-3.5 py-2.5 bg-[#F8F3E8] border border-[#E9DCC7] text-sm"
              />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <h2 className="font-serif text-2xl font-semibold text-[#3A2319]">
              02. Location, Craft Cluster & Categories
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#7A5E4B] mb-1">City / Town *</label>
                <input
                  required
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[#F8F3E8] border border-[#E9DCC7] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#7A5E4B] mb-1">State *</label>
                <input
                  required
                  value={form.state}
                  onChange={(e) => setForm({ ...form, state: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[#F8F3E8] border border-[#E9DCC7] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#7A5E4B] mb-1">
                  Artisan Craft Cluster
                </label>
                <select
                  value={form.clusterId}
                  onChange={(e) => setForm({ ...form, clusterId: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[#F8F3E8] border border-[#E9DCC7] text-sm"
                >
                  <option value="">Independent / Other Region</option>
                  {clusters.map((cl) => (
                    <option key={cl.id} value={cl.id}>
                      {cl.name} ({cl.state})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-[#7A5E4B] mb-2">
                Select Your Craft Categories (at least 1) *
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {categories.map((cat) => {
                  const selected = form.categoryIds.includes(cat.id);
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => toggleCategory(cat.id)}
                      className={`p-3.5 text-left border text-xs font-medium transition-colors flex items-center justify-between cursor-pointer ${
                        selected
                          ? 'bg-[#3A2319] text-[#FFFCF6] border-[#3A2319]'
                          : 'bg-[#F8F3E8] text-[#3A2319] border-[#E9DCC7] hover:border-[#B05330]'
                      }`}
                    >
                      <span>{cat.name}</span>
                      {selected && <Check className="w-3.5 h-3.5" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <h2 className="font-serif text-2xl font-semibold text-[#3A2319]">
              03. Production Capacity, MOQ & Lead Times
            </h2>
            <p className="text-xs text-[#7A5E4B]">
              Note: Figures entered here are displayed to buyers as supplier-declared capacity until
              confirmed per RFQ.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#7A5E4B] mb-1">
                  Monthly Capacity (Units) *
                </label>
                <input
                  type="number"
                  min={10}
                  required
                  value={form.monthlyCapacityUnits}
                  onChange={(e) =>
                    setForm({ ...form, monthlyCapacityUnits: Number(e.target.value) })
                  }
                  className="w-full px-3.5 py-2.5 bg-[#F8F3E8] border border-[#E9DCC7] text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#7A5E4B] mb-1">
                  Standard MOQ (Units) *
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={form.defaultMoq}
                  onChange={(e) => setForm({ ...form, defaultMoq: Number(e.target.value) })}
                  className="w-full px-3.5 py-2.5 bg-[#F8F3E8] border border-[#E9DCC7] text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#7A5E4B] mb-1">
                  Average Lead Time (Days) *
                </label>
                <input
                  type="number"
                  min={3}
                  required
                  value={form.defaultLeadTimeDays}
                  onChange={(e) =>
                    setForm({ ...form, defaultLeadTimeDays: Number(e.target.value) })
                  }
                  className="w-full px-3.5 py-2.5 bg-[#F8F3E8] border border-[#E9DCC7] text-sm font-mono"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-6 pt-2">
              <label className="flex items-center gap-2.5 text-sm text-[#3A2319] cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.customisationSupported}
                  onChange={(e) => setForm({ ...form, customisationSupported: e.target.checked })}
                  className="accent-[#B05330] w-4 h-4"
                />
                <span>Supports custom dimensions, finishes & private-label packaging</span>
              </label>
              <label className="flex items-center gap-2.5 text-sm text-[#3A2319] cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.exportReady}
                  onChange={(e) => setForm({ ...form, exportReady: e.target.checked })}
                  className="accent-[#B05330] w-4 h-4"
                />
                <span>Export-ready protective packaging & IEC documentation</span>
              </label>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <h2 className="font-serif text-2xl font-semibold text-[#3A2319]">
              04. Add Your First Signature Trade Product
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#7A5E4B] mb-1">
                  Product Name *
                </label>
                <input
                  required
                  value={form.firstProductName}
                  onChange={(e) => setForm({ ...form, firstProductName: e.target.value })}
                  placeholder="e.g. Hand-Painted Ceramic Hospitality Lamp"
                  className="w-full px-3.5 py-2.5 bg-[#F8F3E8] border border-[#E9DCC7] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#7A5E4B] mb-1">
                  Indicative Wholesale Price (₹ / unit) *
                </label>
                <input
                  type="number"
                  min={50}
                  required
                  value={form.firstProductPriceInr}
                  onChange={(e) =>
                    setForm({ ...form, firstProductPriceInr: Number(e.target.value) })
                  }
                  className="w-full px-3.5 py-2.5 bg-[#F8F3E8] border border-[#E9DCC7] text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#7A5E4B] mb-1">
                  Materials Used *
                </label>
                <input
                  required
                  value={form.firstProductMaterials}
                  onChange={(e) => setForm({ ...form, firstProductMaterials: e.target.value })}
                  placeholder="e.g. Stoneware clay, natural cobalt glaze, solid brass"
                  className="w-full px-3.5 py-2.5 bg-[#F8F3E8] border border-[#E9DCC7] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#7A5E4B] mb-1">
                  Craft Technique *
                </label>
                <input
                  required
                  value={form.firstProductTechnique}
                  onChange={(e) => setForm({ ...form, firstProductTechnique: e.target.value })}
                  placeholder="e.g. Wheel-thrown & hand-brushed glazing"
                  className="w-full px-3.5 py-2.5 bg-[#F8F3E8] border border-[#E9DCC7] text-sm"
                />
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5">
            <h2 className="font-serif text-2xl font-semibold text-[#3A2319]">
              05. Supporting Verification Evidence (Optional)
            </h2>
            <p className="text-sm text-[#5C4334]">
              Folkform operations reviews artisan registration documents before granting verified
              status. Your profile will enter the Admin Verification Queue immediately upon
              submission.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#7A5E4B] mb-1">
                  Document Type
                </label>
                <select
                  value={form.documentType}
                  onChange={(e) => setForm({ ...form, documentType: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[#F8F3E8] border border-[#E9DCC7] text-sm"
                >
                  <option>Artisan Identity Card / MSME Udyam Certificate</option>
                  <option>Handloom / Handicraft Cooperative Registration</option>
                  <option>GSTIN & Export IEC Reference</option>
                  <option>Workshop Portfolio & Craft Cluster Letter</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#7A5E4B] mb-1">
                  Document Reference Number / Filename
                </label>
                <input
                  value={form.documentRef}
                  onChange={(e) => setForm({ ...form, documentRef: e.target.value })}
                  placeholder="e.g. UDYAM-RJ-17-0048192"
                  className="w-full px-3.5 py-2.5 bg-[#F8F3E8] border border-[#E9DCC7] text-sm font-mono"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#7A5E4B] mb-1">
                Notes for Folkform Verification Team
              </label>
              <textarea
                rows={3}
                value={form.documentNotes}
                onChange={(e) => setForm({ ...form, documentNotes: e.target.value })}
                placeholder="Share workshop headcount, kiln/loom setup, or export history..."
                className="w-full px-3.5 py-2.5 bg-[#F8F3E8] border border-[#E9DCC7] text-sm"
              />
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between pt-6 border-t border-[#E9DCC7]">
          <button
            type="button"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            className="px-4 py-2.5 border border-[#E9DCC7] text-xs font-medium text-[#3A2319] disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Previous</span>
          </button>

          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
              className="px-6 py-2.5 bg-[#3A2319] hover:bg-[#2A1912] text-[#FFFCF6] text-xs font-medium flex items-center gap-1.5 cursor-pointer"
            >
              <span>Continue</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={submitting}
              className="px-7 py-2.5 bg-[#B05330] hover:bg-[#964425] text-[#FFFCF6] text-xs font-medium cursor-pointer disabled:opacity-60"
            >
              {submitting ? 'Creating Workshop Storefront…' : 'Complete Onboarding & Open Portal'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
};
