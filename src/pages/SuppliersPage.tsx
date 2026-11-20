import React, { useEffect, useState } from 'react';
import { ArrowLeft, Bookmark, Check, MapPin, Search, ShieldCheck } from 'lucide-react';
import { apiRequest, formatInr, formatVerificationLabel } from '../lib/api';
import { CraftImage } from '../components/CraftImage';
import type { AuthUser, Product, SupplierProfile } from '../types';

interface SuppliersPageProps {
  supplierId?: string;
  user: AuthUser | null;
  onNavigate: (path: string) => void;
  onToast: (msg: string) => void;
}

export const SuppliersPage: React.FC<SuppliersPageProps> = ({
  supplierId,
  user,
  onNavigate,
  onToast,
}) => {
  const [suppliers, setSuppliers] = useState<SupplierProfile[]>([]);
  const [detail, setDetail] = useState<{
    supplier: SupplierProfile & { contactName?: string };
    verification: {
      documentType: string;
      documentRef: string;
      status: string;
      reviewNotes?: string;
      isDemo?: boolean;
    } | null;
    products: Product[];
  } | null>(null);
  const [q, setQ] = useState('');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savedSup, setSavedSup] = useState(false);

  useEffect(() => {
    setLoading(true);
    if (supplierId) {
      apiRequest(`/suppliers/${supplierId}`)
        .then((res) => setDetail(res))
        .catch((err) => onToast(err.message))
        .finally(() => setLoading(false));
    } else {
      const qs = new URLSearchParams();
      if (q.trim()) qs.set('q', q.trim());
      if (verifiedOnly) qs.set('verifiedOnly', 'true');
      apiRequest<{ suppliers: SupplierProfile[] }>(`/suppliers?${qs.toString()}`)
        .then((res) => setSuppliers(res.suppliers))
        .catch((err) => onToast(err.message))
        .finally(() => setLoading(false));
    }
  }, [supplierId, q, verifiedOnly]);

  const toggleSaveSupplier = async (id: string) => {
    if (!user) {
      onToast('Sign in to save supplier workshops.');
      onNavigate('/auth');
      return;
    }
    try {
      const res = await apiRequest<{ saved: boolean }>(`/saved/suppliers/${id}`, {
        method: 'POST',
      });
      setSavedSup(res.saved);
      onToast(res.saved ? 'Supplier saved to your shortlist.' : 'Removed from saved suppliers.');
    } catch (err: any) {
      onToast(err.message);
    }
  };

  // Single Supplier Storefront View
  if (supplierId) {
    if (loading) {
      return (
        <div className="max-w-[1360px] mx-auto px-6 py-12">
          <div className="h-96 bg-[#FFFCF6] border border-[#E9DCC7] animate-pulse" />
        </div>
      );
    }
    if (!detail) {
      return (
        <div className="max-w-[1360px] mx-auto px-6 py-20 text-center">
          <h1 className="font-serif text-3xl text-[#3A2319]">Supplier storefront not found</h1>
          <button
            type="button"
            onClick={() => onNavigate('/suppliers')}
            className="mt-4 px-5 py-2.5 bg-[#3A2319] text-[#FFFCF6] text-xs font-medium cursor-pointer"
          >
            Back to Makers Directory
          </button>
        </div>
      );
    }

    const { supplier, verification, products } = detail;

    return (
      <div className="max-w-[1360px] mx-auto px-6 py-10">
        <button
          type="button"
          onClick={() => onNavigate('/suppliers')}
          className="inline-flex items-center gap-2 text-xs font-medium text-[#7A5E4B] hover:text-[#3A2319] mb-6 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>All Artisan Makers</span>
        </button>

        {/* Storefront Header */}
        <div className="bg-[#FFFCF6] border border-[#E9DCC7] p-8">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#7A5E4B]">
                <span>{supplier.supplierType}</span>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-[#B05330]" />
                  {supplier.city}, {supplier.state}
                </span>
                {supplier.clusterName && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{supplier.clusterName}</span>
                  </>
                )}
              </div>

              <h1 className="font-serif text-4xl font-semibold text-[#3A2319] mt-2">
                {supplier.businessName}
              </h1>
              <p className="text-sm text-[#5C4334] leading-relaxed mt-4">
                {supplier.craftHeritageSummary}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => toggleSaveSupplier(supplier.id)}
                className="px-4 py-2.5 border border-[#E9DCC7] bg-[#F8F3E8] hover:border-[#B05330] text-xs font-medium text-[#3A2319] flex items-center gap-1.5 cursor-pointer"
              >
                <Bookmark className="w-3.5 h-3.5" fill={savedSup ? 'currentColor' : 'none'} />
                <span>{savedSup ? 'Saved' : 'Save Maker'}</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  onNavigate(user?.role === 'buyer' ? '/buyer/rfqs' : '/auth')
                }
                className="px-5 py-2.5 bg-[#B05330] hover:bg-[#964425] text-[#FFFCF6] text-xs font-medium cursor-pointer"
              >
                Request Bulk Quote
              </button>
            </div>
          </div>

          {/* Declared Capacity & Verification Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mt-8 pt-6 border-t border-[#E9DCC7]">
            <div>
              <p className="text-xs text-[#7A5E4B]">Declared Monthly Capacity</p>
              <p className="font-mono text-2xl font-medium text-[#3A2319] tabular-nums mt-1">
                {supplier.monthlyCapacityUnits.toLocaleString('en-IN')}
              </p>
              <p className="text-[11px] text-[#7A5E4B]">units / month (self-declared)</p>
            </div>
            <div>
              <p className="text-xs text-[#7A5E4B]">Default MOQ</p>
              <p className="font-mono text-2xl font-medium text-[#3A2319] tabular-nums mt-1">
                {supplier.defaultMoq}
              </p>
              <p className="text-[11px] text-[#7A5E4B]">units per SKU</p>
            </div>
            <div>
              <p className="text-xs text-[#7A5E4B]">Estimated Lead Time</p>
              <p className="font-mono text-2xl font-medium text-[#3A2319] tabular-nums mt-1">
                {supplier.defaultLeadTimeDays}d
              </p>
              <p className="text-[11px] text-[#7A5E4B]">standard production cycle</p>
            </div>
            <div>
              <p className="text-xs text-[#7A5E4B]">Verification Status</p>
              <p className="text-base font-semibold text-[#4A5945] mt-1 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" />
                {formatVerificationLabel(supplier.verificationStatus, supplier.isDemo)}
              </p>
              <p className="text-[11px] text-[#7A5E4B]">
                {verification
                  ? `${verification.documentType} (${verification.documentRef})`
                  : 'Pending document submission'}
              </p>
            </div>
          </div>
        </div>

        {/* Capabilities */}
        {supplier.capabilities && supplier.capabilities.length > 0 && (
          <div className="mt-8 bg-[#FFFCF6] border border-[#E9DCC7] p-7">
            <h2 className="font-serif text-2xl font-semibold text-[#3A2319]">
              Declared Workshop Capabilities
            </h2>
            <div className="overflow-x-auto mt-4">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-[#E9DCC7] text-xs text-[#7A5E4B]">
                    <th className="text-left py-2.5 pr-4 font-medium">Category</th>
                    <th className="text-left py-2.5 px-4 font-medium">Craft Technique</th>
                    <th className="text-left py-2.5 px-4 font-medium">Materials</th>
                    <th className="text-right py-2.5 px-4 font-medium">Min MOQ</th>
                    <th className="text-right py-2.5 pl-4 font-medium">Avg Lead Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9DCC7]">
                  {supplier.capabilities.map((cap) => (
                    <tr key={cap.id}>
                      <td className="py-3 pr-4 font-medium text-[#3A2319]">{cap.categoryName}</td>
                      <td className="py-3 px-4 text-[#5C4334]">{cap.craftTechnique}</td>
                      <td className="py-3 px-4 text-[#5C4334]">{cap.materialSpecialty}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">{cap.minMoq}</td>
                      <td className="py-3 pl-4 text-right font-mono tabular-nums">
                        {cap.avgLeadTimeDays}d
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Supplier Catalogue */}
        <div className="mt-10">
          <h2 className="font-serif text-3xl font-semibold text-[#3A2319] mb-6">
            Workshop Trade Catalogue ({products.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {products.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onNavigate(`/products/${p.id}`)}
                className="group text-left bg-[#FFFCF6] border border-[#E9DCC7] hover:border-[#B05330] transition-colors cursor-pointer"
              >
                <div className="aspect-[4/3] overflow-hidden">
                  <CraftImage src={p.imageUrl} alt={p.name} />
                </div>
                <div className="p-5">
                  <p className="text-xs text-[#7A5E4B]">{p.categoryName}</p>
                  <h3 className="font-sans text-sm font-semibold text-[#3A2319] mt-1 group-hover:text-[#B05330]">
                    {p.name}
                  </h3>
                  <div className="flex justify-between mt-4 pt-3 border-t border-[#E9DCC7] text-xs font-mono">
                    <span>{formatInr(p.indicativePriceInr)}/unit</span>
                    <span className="text-[#7A5E4B]">
                      MOQ {p.moq} · {p.leadTimeDays}d
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Makers Directory View
  return (
    <div className="max-w-[1360px] mx-auto px-6 py-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-[#E9DCC7]">
        <div>
          <p className="text-xs font-medium text-[#7A5E4B]">
            Indian Craft Cooperatives, Weavers & Workshops · Demo Directory
          </p>
          <h1 className="font-serif text-4xl font-semibold text-[#3A2319] mt-1">
            Discover Artisan Makers
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-72">
            <Search className="w-4 h-4 text-[#7A5E4B] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search workshop, city, craft..."
              className="w-full pl-10 pr-4 py-2.5 bg-[#FFFCF6] border border-[#E9DCC7] text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-[#3A2319] bg-[#FFFCF6] border border-[#E9DCC7] px-3.5 py-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={verifiedOnly}
              onChange={(e) => setVerifiedOnly(e.target.checked)}
              className="accent-[#B05330]"
            />
            <span>Demo-Verified Only</span>
          </label>
          <button
            type="button"
            onClick={() => onNavigate('/onboard-supplier')}
            className="px-4 py-2.5 bg-[#B05330] hover:bg-[#964425] text-[#FFFCF6] text-xs font-medium whitespace-nowrap cursor-pointer"
          >
            Join as a Maker
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-64 bg-[#FFFCF6] border border-[#E9DCC7] animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
          {suppliers.map((sup) => (
            <button
              key={sup.id}
              type="button"
              onClick={() => onNavigate(`/suppliers/${sup.id}`)}
              className="group text-left bg-[#FFFCF6] border border-[#E9DCC7] hover:border-[#B05330] transition-all p-6 flex flex-col justify-between cursor-pointer"
            >
              <div>
                <div className="flex items-center justify-between text-xs text-[#7A5E4B]">
                  <span>
                    {sup.city}, {sup.state}
                  </span>
                  <span
                    className={
                      sup.verificationStatus === 'approved'
                        ? 'text-[#4A5945] font-medium'
                        : 'text-[#8E6B2D]'
                    }
                  >
                    {formatVerificationLabel(sup.verificationStatus, sup.isDemo)}
                  </span>
                </div>
                <h2 className="font-serif text-2xl font-semibold text-[#3A2319] mt-2 group-hover:text-[#B05330]">
                  {sup.businessName}
                </h2>
                <p className="text-xs text-[#7A5E4B] mt-1">
                  {sup.supplierType} · {(sup.categories ?? []).slice(0, 2).join(', ')}
                </p>
                <p className="text-sm text-[#5C4334] mt-3 leading-relaxed line-clamp-3">
                  {sup.craftHeritageSummary}
                </p>
              </div>

              <div className="mt-5 pt-4 border-t border-[#E9DCC7] flex items-center justify-between text-xs font-mono text-[#3A2319]">
                <span>Cap: {sup.monthlyCapacityUnits}/mo</span>
                <span>MOQ {sup.defaultMoq}</span>
                <span>{sup.defaultLeadTimeDays}d lead</span>
              </div>
              <div className="mt-2 flex items-center gap-3 text-[11px] text-[#7A5E4B]">
                {sup.customisationSupported && (
                  <span className="inline-flex items-center gap-1">
                    <Check className="w-3 h-3 text-[#4A5945]" /> Customisation
                  </span>
                )}
                {sup.exportReady && (
                  <span className="inline-flex items-center gap-1">
                    <Check className="w-3 h-3 text-[#4A5945]" /> Export Ready
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
