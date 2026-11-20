import React, { useEffect, useState } from 'react';
import { Bookmark, Check, Scale, Search, SlidersHorizontal, X } from 'lucide-react';
import { apiRequest, formatInr, formatVerificationLabel } from '../lib/api';
import { CraftImage } from '../components/CraftImage';
import type { AuthUser, Product, ProductCategory } from '../types';

interface MarketplacePageProps {
  user: AuthUser | null;
  initialQuery?: string;
  onNavigate: (path: string) => void;
  onToast: (msg: string) => void;
}

export const MarketplacePage: React.FC<MarketplacePageProps> = ({
  user,
  initialQuery = '',
  onNavigate,
  onToast,
}) => {
  const urlParams = new URLSearchParams(initialQuery);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Filters
  const [q, setQ] = useState(urlParams.get('q') || '');
  const [category, setCategory] = useState(urlParams.get('category') || 'all');
  const [stateFilter, setStateFilter] = useState(urlParams.get('state') || 'all');
  const [material, setMaterial] = useState('');
  const [technique, setTechnique] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [maxMoq, setMaxMoq] = useState('');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [sort, setSort] = useState('popularity');

  useEffect(() => {
    apiRequest<{ categories: ProductCategory[] }>('/categories')
      .then((res) => setCategories(res.categories))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    apiRequest<{ products: Product[] }>('/saved')
      .then((res) => setSavedIds(new Set(res.products.map((p) => p.id))))
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const qs = new URLSearchParams();
    if (q.trim()) qs.set('q', q.trim());
    if (category !== 'all') qs.set('category', category);
    if (stateFilter !== 'all') qs.set('state', stateFilter);
    if (material.trim()) qs.set('material', material.trim());
    if (technique.trim()) qs.set('technique', technique.trim());
    if (maxPrice) qs.set('maxPrice', maxPrice);
    if (maxMoq) qs.set('maxMoq', maxMoq);
    if (verifiedOnly) qs.set('verifiedOnly', 'true');
    if (sort) qs.set('sort', sort);

    apiRequest<{ products: Product[]; states: string[] }>(`/products?${qs.toString()}`, {
      signal: controller.signal,
    })
      .then((res) => {
        setProducts(res.products);
        if (res.states?.length) setStates(res.states);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') onToast(err.message);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [q, category, stateFilter, material, technique, maxPrice, maxMoq, verifiedOnly, sort]);

  const toggleSave = async (e: React.MouseEvent, productId: string) => {
    e.stopPropagation();
    if (!user) {
      onToast('Sign in to save trade products to your collection.');
      onNavigate('/auth');
      return;
    }
    try {
      const res = await apiRequest<{ saved: boolean }>(`/saved/products/${productId}`, {
        method: 'POST',
      });
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (res.saved) next.add(productId);
        else next.delete(productId);
        return next;
      });
      onToast(res.saved ? 'Saved to your collection.' : 'Removed from saved collection.');
    } catch (err: any) {
      onToast(err.message);
    }
  };

  const toggleCompare = (e: React.MouseEvent, productId: string) => {
    e.stopPropagation();
    setCompareIds((prev) => {
      if (prev.includes(productId)) return prev.filter((id) => id !== productId);
      if (prev.length >= 3) {
        onToast('You can compare up to 3 products side by side.');
        return prev;
      }
      return [...prev, productId];
    });
  };

  const resetFilters = () => {
    setQ('');
    setCategory('all');
    setStateFilter('all');
    setMaterial('');
    setTechnique('');
    setMaxPrice('');
    setMaxMoq('');
    setVerifiedOnly(false);
    setSort('popularity');
  };

  const comparedProducts = products.filter((p) => compareIds.includes(p.id));

  return (
    <div className="max-w-[1360px] mx-auto px-6 py-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-[#E9DCC7]">
        <div>
          <p className="text-xs font-medium text-[#7A5E4B]">
            Global Wholesale Craft Directory · Seeded Demo Catalogue
          </p>
          <h1 className="font-serif text-4xl font-semibold text-[#3A2319] mt-1">
            Explore Indian Craft Collections
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-80">
            <Search className="w-4 h-4 text-[#7A5E4B] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search blue pottery, brass, silk, Jaipur..."
              aria-label="Search products"
              className="w-full pl-10 pr-4 py-2.5 bg-[#FFFCF6] border border-[#E9DCC7] text-sm text-[#3A2319] placeholder:text-[#7A5E4B]/70"
            />
          </div>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="Sort products"
            className="px-3.5 py-2.5 bg-[#FFFCF6] border border-[#E9DCC7] text-sm text-[#3A2319]"
          >
            <option value="popularity">Sort: Popularity</option>
            <option value="relevance">Sort: Relevance</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="moq_asc">MOQ: Lowest First</option>
          </select>

          <button
            type="button"
            onClick={() => setFiltersOpen(!filtersOpen)}
            className="lg:hidden px-3.5 py-2.5 bg-[#FFFCF6] border border-[#E9DCC7] text-sm font-medium text-[#3A2319] flex items-center gap-2 cursor-pointer"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Filters</span>
          </button>
        </div>
      </div>

      {/* Category Filter Strip */}
      <div className="flex items-center gap-2 overflow-x-auto py-4 border-b border-[#E9DCC7]">
        <button
          type="button"
          onClick={() => setCategory('all')}
          className={`px-3.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer border ${
            category === 'all'
              ? 'bg-[#3A2319] text-[#FFFCF6] border-[#3A2319]'
              : 'bg-[#FFFCF6] text-[#3A2319] border-[#E9DCC7] hover:border-[#B05330]'
          }`}
        >
          All Categories
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setCategory(cat.slug)}
            className={`px-3.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer border ${
              category === cat.slug
                ? 'bg-[#3A2319] text-[#FFFCF6] border-[#3A2319]'
                : 'bg-[#FFFCF6] text-[#3A2319] border-[#E9DCC7] hover:border-[#B05330]'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-8">
        {/* Left Filter Sidebar */}
        <aside
          className={`lg:col-span-3 space-y-6 ${filtersOpen ? 'block' : 'hidden lg:block'}`}
        >
          <div className="bg-[#FFFCF6] border border-[#E9DCC7] p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#E9DCC7]">
              <h2 className="font-sans text-sm font-semibold text-[#3A2319]">Refine Catalogue</h2>
              <button
                type="button"
                onClick={resetFilters}
                className="text-xs text-[#B05330] hover:underline cursor-pointer"
              >
                Reset
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#7A5E4B] mb-1.5">
                State / Craft Region
              </label>
              <select
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value)}
                className="w-full px-3 py-2 bg-[#F8F3E8] border border-[#E9DCC7] text-sm text-[#3A2319]"
              >
                <option value="all">All Indian States</option>
                {states.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#7A5E4B] mb-1.5">
                Material Keyword
              </label>
              <input
                type="text"
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
                placeholder="e.g. ceramic, brass, silk, teak"
                className="w-full px-3 py-2 bg-[#F8F3E8] border border-[#E9DCC7] text-sm text-[#3A2319]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#7A5E4B] mb-1.5">
                Craft Technique
              </label>
              <input
                type="text"
                value={technique}
                onChange={(e) => setTechnique(e.target.value)}
                placeholder="e.g. blue pottery, Ajrakh, hammered"
                className="w-full px-3 py-2 bg-[#F8F3E8] border border-[#E9DCC7] text-sm text-[#3A2319]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#7A5E4B] mb-1.5">
                  Max Unit Price (₹)
                </label>
                <input
                  type="number"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  placeholder="3500"
                  className="w-full px-3 py-2 bg-[#F8F3E8] border border-[#E9DCC7] text-sm font-mono text-[#3A2319]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#7A5E4B] mb-1.5">
                  Max MOQ
                </label>
                <input
                  type="number"
                  value={maxMoq}
                  onChange={(e) => setMaxMoq(e.target.value)}
                  placeholder="200"
                  className="w-full px-3 py-2 bg-[#F8F3E8] border border-[#E9DCC7] text-sm font-mono text-[#3A2319]"
                />
              </div>
            </div>

            <label className="flex items-center gap-2.5 pt-2 cursor-pointer">
              <input
                type="checkbox"
                checked={verifiedOnly}
                onChange={(e) => setVerifiedOnly(e.target.checked)}
                className="accent-[#B05330] w-4 h-4"
              />
              <span className="text-xs font-medium text-[#3A2319]">
                Demo-verified suppliers only
              </span>
            </label>
          </div>

          <div className="bg-[#3A2319] text-[#FFFCF6] p-6">
            <p className="text-xs text-[#BE9753]">Need Custom Bulk Sourcing?</p>
            <h3 className="font-serif text-xl font-semibold mt-1">
              Let Folkform AI Match Suppliers
            </h3>
            <p className="text-xs text-[#E9DCC7]/85 mt-2 leading-relaxed">
              Describe quantity, unit price range, and delivery timeline to shortlist workshops
              automatically.
            </p>
            <button
              type="button"
              onClick={() =>
                onNavigate(user?.role === 'buyer' ? '/buyer/ai-sourcing' : '/ai-preview')
              }
              className="mt-4 w-full py-2.5 bg-[#B05330] hover:bg-[#C6613A] text-xs font-medium text-[#FFFCF6] transition-colors cursor-pointer"
            >
              Open Sourcing Intelligence
            </button>
          </div>
        </aside>

        {/* Product Results Grid */}
        <div className="lg:col-span-9">
          <div className="flex items-center justify-between mb-6 text-xs text-[#7A5E4B]">
            <span>
              Showing <strong className="font-mono text-[#3A2319]">{products.length}</strong> trade
              products · All prices indicative wholesale (Demo)
            </span>
            {compareIds.length > 0 && (
              <button
                type="button"
                onClick={() => setShowCompareModal(true)}
                className="px-3.5 py-1.5 bg-[#3A2319] text-[#FFFCF6] font-medium flex items-center gap-1.5 cursor-pointer"
              >
                <Scale className="w-3.5 h-3.5" />
                <span>Compare ({compareIds.length}/3)</span>
              </button>
            )}
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div key={n} className="h-96 bg-[#FFFCF6] border border-[#E9DCC7] animate-pulse" />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="bg-[#FFFCF6] border border-[#E9DCC7] p-12 text-center">
              <h3 className="font-serif text-2xl font-semibold text-[#3A2319]">
                No products match your current filters
              </h3>
              <p className="text-sm text-[#5C4334] mt-2">
                Try clearing a material or MOQ constraint, or submit a custom sourcing brief.
              </p>
              <button
                type="button"
                onClick={resetFilters}
                className="mt-5 px-5 py-2.5 bg-[#3A2319] text-[#FFFCF6] text-xs font-medium cursor-pointer"
              >
                Reset All Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
              {products.map((p) => {
                const isSaved = savedIds.has(p.id);
                const isCompared = compareIds.includes(p.id);
                return (
                  <div
                    key={p.id}
                    onClick={() => onNavigate(`/products/${p.id}`)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onNavigate(`/products/${p.id}`);
                    }}
                    className="group bg-[#FFFCF6] border border-[#E9DCC7] hover:border-[#B05330]/70 transition-all duration-200 hover:-translate-y-0.5 flex flex-col cursor-pointer"
                  >
                    <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#E9DCC7]/30">
                      <CraftImage
                        src={p.imageUrl}
                        alt={p.name}
                        className="group-hover:scale-[1.03] transition-transform duration-300"
                      />
                      <div className="absolute top-3 right-3 flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => toggleCompare(e, p.id)}
                          title="Compare product"
                          aria-label={`Compare ${p.name}`}
                          className={`p-2 border transition-colors cursor-pointer ${
                            isCompared
                              ? 'bg-[#3A2319] text-[#FFFCF6] border-[#3A2319]'
                              : 'bg-[#FFFCF6]/92 text-[#3A2319] border-[#E9DCC7] hover:border-[#3A2319]'
                          }`}
                        >
                          {isCompared ? <Check className="w-3.5 h-3.5" /> : <Scale className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => toggleSave(e, p.id)}
                          title="Save product"
                          aria-label={`Save ${p.name}`}
                          className={`p-2 border transition-colors cursor-pointer ${
                            isSaved
                              ? 'bg-[#B05330] text-[#FFFCF6] border-[#B05330]'
                              : 'bg-[#FFFCF6]/92 text-[#3A2319] border-[#E9DCC7] hover:border-[#B05330]'
                          }`}
                        >
                          <Bookmark className="w-3.5 h-3.5" fill={isSaved ? 'currentColor' : 'none'} />
                        </button>
                      </div>
                    </div>

                    <div className="p-5 flex-1 flex flex-col justify-between">
                      <div>
                        <p className="text-xs text-[#7A5E4B] truncate">
                          {p.categoryName} · {p.originCity}, {p.originState}
                        </p>
                        <h3 className="font-sans text-[15px] font-semibold text-[#3A2319] mt-1.5 leading-snug group-hover:text-[#B05330] transition-colors">
                          {p.name}
                        </h3>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onNavigate(`/suppliers/${p.supplierId}`);
                          }}
                          className="text-xs text-[#5C4334] hover:text-[#B05330] hover:underline mt-1 block text-left truncate max-w-full cursor-pointer"
                        >
                          {p.supplierName}
                        </button>
                        <p className="text-xs text-[#4A5945] mt-1.5">
                          {formatVerificationLabel(p.supplierVerificationStatus, p.isDemo)}
                        </p>
                      </div>

                      <div className="mt-5 pt-3.5 border-t border-[#E9DCC7] flex items-baseline justify-between gap-2">
                        <span className="font-mono text-base font-medium text-[#3A2319] tabular-nums">
                          {formatInr(p.indicativePriceInr)}
                          <span className="font-sans text-[11px] text-[#7A5E4B] font-normal"> /u</span>
                        </span>
                        <span className="font-mono text-xs text-[#7A5E4B] tabular-nums whitespace-nowrap">
                          MOQ {p.moq} · {p.leadTimeDays}d
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Product Side-by-Side Comparison Modal */}
      {showCompareModal && comparedProducts.length > 0 && (
        <div className="fixed inset-0 z-50 bg-[#24140D]/60 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#FFFCF6] border border-[#E9DCC7] max-w-5xl w-full p-6 sm:p-8 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-[#E9DCC7]">
              <div>
                <p className="text-xs text-[#7A5E4B]">Side-by-Side Catalogue Comparison</p>
                <h2 className="font-serif text-2xl font-semibold text-[#3A2319]">
                  Compare Selected Products
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowCompareModal(false)}
                className="p-2 text-[#3A2319] hover:bg-[#F8F3E8] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-x-auto mt-6">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-[#E9DCC7]">
                    <th className="text-left py-3 pr-4 text-xs font-medium text-[#7A5E4B] w-40">
                      Specification
                    </th>
                    {comparedProducts.map((p) => (
                      <th key={p.id} className="text-left py-3 px-4 align-top">
                        <div className="aspect-[4/3] w-44 overflow-hidden mb-2 border border-[#E9DCC7]">
                          <CraftImage src={p.imageUrl} alt={p.name} />
                        </div>
                        <p className="font-semibold text-[#3A2319]">{p.name}</p>
                        <p className="text-xs font-normal text-[#7A5E4B]">{p.supplierName}</p>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9DCC7]">
                  {[
                    ['Indicative Wholesale', (p: Product) => `${formatInr(p.indicativePriceInr)} / unit`],
                    ['MOQ', (p: Product) => `${p.moq} units`],
                    ['Lead Time (Declared)', (p: Product) => `${p.leadTimeDays} days`],
                    ['Origin', (p: Product) => `${p.originCity}, ${p.originState}`],
                    ['Craft Technique', (p: Product) => p.craftTechnique],
                    ['Materials', (p: Product) => p.materials],
                    ['Customisation', (p: Product) => p.customisationOptions],
                    ['Verification', (p: Product) => formatVerificationLabel(p.supplierVerificationStatus, p.isDemo)],
                  ].map(([label, getter]) => (
                    <tr key={label as string}>
                      <td className="py-3 pr-4 text-xs font-medium text-[#7A5E4B] align-top">
                        {label as string}
                      </td>
                      {comparedProducts.map((p) => (
                        <td key={p.id} className="py-3 px-4 text-xs text-[#3A2319] align-top">
                          {(getter as (x: Product) => string)(p)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center mt-6 pt-4 border-t border-[#E9DCC7]">
              <button
                type="button"
                onClick={() => {
                  setCompareIds([]);
                  setShowCompareModal(false);
                }}
                className="text-xs text-[#7A5E4B] hover:text-[#3A2319] cursor-pointer"
              >
                Clear comparison list
              </button>
              <button
                type="button"
                onClick={() => setShowCompareModal(false)}
                className="px-5 py-2 bg-[#3A2319] text-[#FFFCF6] text-xs font-medium cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
