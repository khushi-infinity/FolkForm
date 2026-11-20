import React, { useEffect, useState } from 'react';
import { ArrowRight, Check, Compass, ShieldCheck, Sparkles } from 'lucide-react';
import { apiRequest, formatInr, formatVerificationLabel } from '../lib/api';
import { CraftImage } from '../components/CraftImage';
import { IndiaCraftMap } from '../components/IndiaCraftMap';
import type { ArtisanCluster, AuthUser, Product, ProductCategory, SupplierProfile } from '../types';

interface HomePageProps {
  user: AuthUser | null;
  onNavigate: (path: string) => void;
  onLaunchAiPrompt: (prompt: string) => void;
  onDemoLogin: (role: 'buyer' | 'supplier' | 'admin') => Promise<void>;
}

const HERO_IMG = '/src/assets/images/hero_folkform_collection_1795162285246.jpg';
const WORKSHOP_IMG = '/src/assets/images/editorial_artisan_workshop_1795162284510.jpg';

const SAMPLE_PROMPTS = [
  'I need 500 handcrafted ceramic table lamps from Rajasthan for a boutique hotel. My budget is ₹1,000 to ₹1,500 per unit. Delivery required within 30 days.',
  'Sourcing 300 hand-hammered antique brass urlis and taper candle holders from Moradabad for a Nordic retail launch under ₹2,000/unit.',
  'Looking for 250 organic handloom Kala cotton throws and Ajrakh table runners from Kutch for an eco-resort opening in 25 days.',
];

const DEMO_TESTIMONIALS = [
  {
    quote:
      'Sourcing 500 matching hand-glazed ceramic guestroom lamps used to require three weeks of broker calls. Folkform matched three Jaipur studios in minutes with transparent capacity and landed pricing.',
    name: 'Meera Kapoor',
    role: 'VP of Procurement',
    org: 'Aranya Boutique Hotels & Resorts',
    outcome: 'Cut hotel sourcing cycle from 21 days to 4 days across 3 Rajasthan workshops.',
  },
  {
    quote:
      'Having side-by-side landed cost, MOQ, and kiln lead-time comparisons gave our Stockholm buying team the confidence to place direct bulk orders with Moradabad and Odisha cooperatives.',
    name: 'Claire Voss',
    role: 'Head of Homeware Buying',
    org: 'Nordik Living Retail AB',
    outcome: 'Direct cluster procurement with traceable provenance for 14 Nordic retail stores.',
  },
  {
    quote:
      'Every piece arrives with honest origin documentation and milestone updates from bisque firing to export crating. It operates like modern procurement software built for heritage craft.',
    name: 'Devansh Mehta',
    role: 'Principal Architect',
    org: 'Studio Verma Architecture & Interiors',
    outcome: 'Consolidated 4 Indian craft clusters into a single traceable PO workflow.',
  },
];

export const HomePage: React.FC<HomePageProps> = ({
  user,
  onNavigate,
  onLaunchAiPrompt,
  onDemoLogin,
}) => {
  const [summary, setSummary] = useState<{
    stats: {
      clustersCount: number;
      categoriesCount: number;
      productsCount: number;
      suppliersCount: number;
      rfqsCount: number;
    };
    categories: ProductCategory[];
    clusters: ArtisanCluster[];
    featuredProducts: Product[];
    featuredSuppliers: SupplierProfile[];
  } | null>(null);
  const [quickPrompt, setQuickPrompt] = useState(SAMPLE_PROMPTS[0]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest('/public/summary')
      .then((res) => setSummary(res))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="bg-[#F8F3E8] text-[#3A2319]">
      {/* 1. EDITORIAL HERO SECTION */}
      <section className="max-w-[1360px] mx-auto px-6 pt-10 pb-14 lg:pt-14 lg:pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
          <div className="lg:col-span-5 flex flex-col justify-between py-2">
            <div>
              <p className="text-xs font-medium tracking-wide text-[#7A5E4B]">
                Where Culture Meets Commerce · Global B2B Craft Procurement
              </p>
              <h1
                className="font-serif font-semibold text-[#3A2319] mt-4 leading-[1.05] tracking-tight"
                style={{ fontSize: 'clamp(2.5rem, 4.4vw, 4.1rem)' }}
              >
                India’s Craft. The World’s Marketplace.
              </h1>
              <p className="text-base sm:text-lg text-[#5C4334] leading-relaxed mt-6 max-w-lg">
                Discover extraordinary craftsmanship. Source directly from India’s makers. Procure
                with intelligence.
              </p>

              <div className="flex flex-wrap items-center gap-4 mt-8">
                <button
                  type="button"
                  onClick={() => onNavigate('/marketplace')}
                  className="px-6 py-3.5 bg-[#B05330] hover:bg-[#964425] text-[#FFFCF6] text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer"
                >
                  <span>Explore Collections</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    user?.role === 'buyer'
                      ? onNavigate('/buyer/ai-sourcing')
                      : onLaunchAiPrompt(SAMPLE_PROMPTS[0])
                  }
                  className="px-6 py-3.5 bg-[#FFFCF6] hover:bg-[#EFE6D6] text-[#3A2319] border border-[#3A2319]/25 text-sm font-medium transition-colors whitespace-nowrap cursor-pointer"
                >
                  Source for Your Business
                </button>
              </div>
            </div>

            <div className="mt-10 pt-6 border-t border-[#E9DCC7]">
              <p className="text-xs text-[#7A5E4B]">Instant Interactive Demo Environments</p>
              <div className="flex flex-wrap gap-x-5 gap-y-2 mt-2.5 text-sm">
                <button
                  type="button"
                  onClick={() => onDemoLogin('buyer')}
                  className="font-medium text-[#3A2319] underline decoration-[#B05330]/50 underline-offset-4 hover:text-[#B05330] cursor-pointer whitespace-nowrap"
                >
                  Enter Buyer Procurement Desk
                </button>
                <button
                  type="button"
                  onClick={() => onDemoLogin('supplier')}
                  className="font-medium text-[#3A2319] underline decoration-[#B05330]/50 underline-offset-4 hover:text-[#B05330] cursor-pointer whitespace-nowrap"
                >
                  Enter Artisan Supplier Portal
                </button>
                <button
                  type="button"
                  onClick={() => onDemoLogin('admin')}
                  className="font-medium text-[#3A2319] underline decoration-[#B05330]/50 underline-offset-4 hover:text-[#B05330] cursor-pointer whitespace-nowrap"
                >
                  Admin Control Center
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="w-full h-full min-h-[340px] lg:min-h-[490px] overflow-hidden border border-[#E9DCC7] bg-[#E9DCC7]/40 relative">
              <CraftImage
                src={HERO_IMG}
                alt="Editorial composition of Jaipur blue pottery ceramic lamp, Moradabad hammered brass vessel, and Banarasi silk and Ajrakh handloom textiles"
                className="lg:h-full"
                aspectClass="aspect-[16/10]"
              />
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-[#24140D]/80 via-[#24140D]/35 to-transparent p-6 text-[#FFFCF6]">
                <p className="text-xs text-[#E9DCC7]">
                  Jaipur Ceramics · Moradabad Brass · Varanasi Silk · Kutch Handloom (Demo Catalogue)
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Full-width 4-column Live Database Strip below Hero Split */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mt-10 pt-8 border-t border-[#E9DCC7]">
          <div>
            <p className="font-mono text-2xl sm:text-3xl font-medium text-[#3A2319] tabular-nums">
              {summary?.stats.clustersCount ?? 8}
            </p>
            <p className="text-xs text-[#7A5E4B] mt-1">Indian Craft Clusters Mapped</p>
          </div>
          <div>
            <p className="font-mono text-2xl sm:text-3xl font-medium text-[#3A2319] tabular-nums">
              {summary?.stats.suppliersCount ?? 12}
            </p>
            <p className="text-xs text-[#7A5E4B] mt-1">Seeded Demo Artisan Partners</p>
          </div>
          <div>
            <p className="font-mono text-2xl sm:text-3xl font-medium text-[#3A2319] tabular-nums">
              {summary?.stats.productsCount ?? 28}
            </p>
            <p className="text-xs text-[#7A5E4B] mt-1">Wholesale Trade SKUs Available</p>
          </div>
          <div>
            <p className="font-mono text-2xl sm:text-3xl font-medium text-[#3A2319] tabular-nums">
              8 Agents
            </p>
            <p className="text-xs text-[#7A5E4B] mt-1">Multi-Agent Sourcing Architecture</p>
          </div>
        </div>
      </section>

      {/* 2. FEATURED CRAFT COLLECTIONS */}
      <section className="border-t border-[#E9DCC7] bg-[#FFFCF6]">
        <div className="max-w-[1360px] mx-auto px-6 py-20">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-12">
            <div>
              <p className="text-xs font-medium text-[#7A5E4B]">Curated B2B Trade Categories</p>
              <h2 className="font-serif text-3xl sm:text-4xl font-semibold text-[#3A2319] mt-2">
                Featured Craft Collections
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('/marketplace')}
              className="text-sm font-medium text-[#B05330] hover:text-[#964425] flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <span>View all {summary?.stats.productsCount ?? 28} trade SKUs</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-80 bg-[#F8F3E8] animate-pulse border border-[#E9DCC7]" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {(summary?.categories ?? []).slice(0, 6).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => onNavigate(`/marketplace?category=${encodeURIComponent(cat.slug)}`)}
                  className="group text-left bg-[#F8F3E8] border border-[#E9DCC7] hover:border-[#B05330]/60 transition-all duration-200 hover:-translate-y-0.5 cursor-pointer flex flex-col"
                >
                  <div className="aspect-[4/3] w-full overflow-hidden bg-[#E9DCC7]/40">
                    <CraftImage
                      src={cat.imageUrl}
                      alt={cat.name}
                      className="group-hover:scale-[1.03] transition-transform duration-300"
                    />
                  </div>
                  <div className="p-6 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between text-xs text-[#7A5E4B]">
                        <span>Craft Category</span>
                        <span className="font-mono tabular-nums">{cat.productCount ?? 0} SKUs</span>
                      </div>
                      <h3 className="font-serif text-2xl font-semibold text-[#3A2319] mt-2 group-hover:text-[#B05330] transition-colors">
                        {cat.name}
                      </h3>
                      <p className="text-sm text-[#5C4334] mt-2 leading-relaxed line-clamp-2">
                        {cat.description}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 3. AI-POWERED PROCUREMENT & HOW FOLKFORM WORKS */}
      <section className="border-t border-[#E9DCC7] bg-[#F8F3E8]">
        <div className="max-w-[1360px] mx-auto px-6 py-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
            {/* Left: How Folkform Works */}
            <div className="lg:col-span-5">
              <p className="text-xs font-medium text-[#7A5E4B]">Operating System for Artisan Trade</p>
              <h2 className="font-serif text-3xl sm:text-4xl font-semibold text-[#3A2319] mt-2 leading-tight">
                How Folkform Connects Culture to Global Procurement
              </h2>
              <p className="text-sm text-[#5C4334] leading-relaxed mt-4">
                Replace opaque middlemen and fragmented WhatsApp threads with an intelligent,
                human-approved sourcing pipeline grounded in real workshop capabilities.
              </p>

              <ol className="mt-8 space-y-6 border-t border-[#E9DCC7] pt-6">
                {[
                  {
                    num: '01',
                    title: 'Describe Your Bulk Specification',
                    desc: 'Enter quantities, craft origin, target unit budget, and delivery window in natural language or a structured RFQ.',
                  },
                  {
                    num: '02',
                    title: 'Multi-Agent Discovery & Explainable Matching',
                    desc: 'Specialized agents search real workshop capabilities, evaluate declared capacity and MOQ, and flag timeline risks transparently.',
                  },
                  {
                    num: '03',
                    title: 'Side-by-Side Quotation Comparison',
                    desc: 'Receive binding supplier quotations, compare landed cost vs lead time, request revisions, and download PDF offers.',
                  },
                  {
                    num: '04',
                    title: 'Human-Approved POs & Production Tracking',
                    desc: 'Issue approved Purchase Orders, monitor firing, weaving, and QC milestones, and maintain full provenance records.',
                  },
                ].map((step) => (
                  <li key={step.num} className="flex gap-4">
                    <span className="font-mono text-sm font-medium text-[#B05330] pt-0.5 tabular-nums shrink-0">
                      {step.num}.
                    </span>
                    <div>
                      <h3 className="font-sans text-sm font-semibold text-[#3A2319]">
                        {step.title}
                      </h3>
                      <p className="text-sm text-[#5C4334] mt-1 leading-relaxed">{step.desc}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            {/* Right: Interactive Folkform Sourcing Intelligence Launcher */}
            <div className="lg:col-span-7 bg-[#3A2319] text-[#FFFCF6] p-8 sm:p-10">
              <div className="flex items-center justify-between gap-4 pb-5 border-b border-[#FFFCF6]/15">
                <div className="flex items-center gap-2.5">
                  <Sparkles className="w-4 h-4 text-[#BE9753]" />
                  <span className="text-xs font-medium tracking-wide text-[#E9DCC7]">
                    Folkform Sourcing Intelligence
                  </span>
                </div>
                <span className="text-xs font-mono text-[#E9DCC7]/75">
                  Human-Approved · DB-Grounded
                </span>
              </div>

              <h3 className="font-serif text-3xl font-semibold text-[#FFFCF6] mt-6 leading-snug">
                Turn a natural-language brief into a vetted Indian supplier shortlist in seconds.
              </h3>
              <p className="text-sm text-[#E9DCC7]/85 mt-3 leading-relaxed">
                Our 8-agent orchestration graph parses specifications, queries live SQLite workshop
                records, scores 8 procurement dimensions, and drafts an RFQ — never committing funds
                without your explicit approval.
              </p>

              <div className="mt-6">
                <label htmlFor="hero-ai-brief" className="block text-xs text-[#E9DCC7] mb-2">
                  Try a B2B Sourcing Brief
                </label>
                <textarea
                  id="hero-ai-brief"
                  rows={3}
                  value={quickPrompt}
                  onChange={(e) => setQuickPrompt(e.target.value)}
                  className="w-full bg-[#2B1912] border border-[#FFFCF6]/20 p-4 text-sm text-[#FFFCF6] placeholder:text-[#E9DCC7]/50 focus:border-[#BE9753] focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap gap-2 mt-3">
                {['Rajasthan Lamps (500)', 'Moradabad Brass (300)', 'Kutch Textiles (250)'].map(
                  (label, idx) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setQuickPrompt(SAMPLE_PROMPTS[idx])}
                      className="text-xs px-3 py-1.5 border border-[#FFFCF6]/20 text-[#E9DCC7] hover:border-[#BE9753] hover:text-[#FFFCF6] transition-colors cursor-pointer whitespace-nowrap"
                    >
                      {label}
                    </button>
                  ),
                )}
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-4 pt-5 border-t border-[#FFFCF6]/15">
                <p className="text-xs text-[#E9DCC7]/75">
                  Searches actual database suppliers only · Never fabricates availability
                </p>
                <button
                  type="button"
                  onClick={() => onLaunchAiPrompt(quickPrompt)}
                  className="px-6 py-3 bg-[#B05330] hover:bg-[#C6613A] text-[#FFFCF6] text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer"
                >
                  <span>Run Sourcing Intelligence</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. EXPLORE ARTISAN COMMUNITIES (INTERACTIVE INDIA MAP) */}
      <section className="border-t border-[#E9DCC7] bg-[#FFFCF6]">
        <div className="max-w-[1360px] mx-auto px-6 py-20">
          <div className="max-w-2xl mb-12">
            <p className="text-xs font-medium text-[#7A5E4B]">Regional Craft Provenance</p>
            <h2 className="font-serif text-3xl sm:text-4xl font-semibold text-[#3A2319] mt-2">
              Explore Artisan Communities Across India
            </h2>
            <p className="text-sm text-[#5C4334] mt-3 leading-relaxed">
              Source directly from geographically distinct craft clusters — from Jaipur’s blue
              pottery kilns and Moradabad’s brass foundries to Bhujodi’s organic cotton pit looms.
            </p>
          </div>

          {summary?.clusters && summary.clusters.length > 0 && (
            <IndiaCraftMap
              clusters={summary.clusters}
              onExploreCluster={(state) =>
                onNavigate(`/marketplace?state=${encodeURIComponent(state)}`)
              }
            />
          )}
        </div>
      </section>

      {/* 5. FEATURED MAKERS & FEATURED WHOLESALE PRODUCTS */}
      <section className="border-t border-[#E9DCC7] bg-[#F8F3E8]">
        <div className="max-w-[1360px] mx-auto px-6 py-20">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-12">
            <div>
              <p className="text-xs font-medium text-[#7A5E4B]">
                Direct Workshop Partnerships · Demo Network
              </p>
              <h2 className="font-serif text-3xl sm:text-4xl font-semibold text-[#3A2319] mt-2">
                Featured Makers & Collectives
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('/suppliers')}
              className="text-sm font-medium text-[#B05330] hover:text-[#964425] flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <span>Browse all {summary?.stats.suppliersCount ?? 12} makers</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {(summary?.featuredSuppliers ?? []).map((sup) => (
              <button
                key={sup.id}
                type="button"
                onClick={() => onNavigate(`/suppliers/${sup.id}`)}
                className="group text-left bg-[#FFFCF6] border border-[#E9DCC7] hover:border-[#B05330]/60 transition-all duration-200 p-6 flex flex-col justify-between cursor-pointer"
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
                  <h3 className="font-serif text-2xl font-semibold text-[#3A2319] mt-2 group-hover:text-[#B05330] transition-colors">
                    {sup.businessName}
                  </h3>
                  <p className="text-xs text-[#7A5E4B] mt-1">
                    {sup.supplierType} · {sup.productCount ?? 0} trade SKUs
                  </p>
                  <p className="text-sm text-[#5C4334] mt-4 leading-relaxed line-clamp-3">
                    {sup.craftHeritageSummary}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3 mt-6 pt-4 border-t border-[#E9DCC7] text-xs">
                  <div>
                    <span className="text-[#7A5E4B] block">Declared Cap.</span>
                    <span className="font-mono font-medium text-[#3A2319] tabular-nums">
                      {sup.monthlyCapacityUnits}/mo
                    </span>
                  </div>
                  <div>
                    <span className="text-[#7A5E4B] block">Default MOQ</span>
                    <span className="font-mono font-medium text-[#3A2319] tabular-nums">
                      {sup.defaultMoq} units
                    </span>
                  </div>
                  <div>
                    <span className="text-[#7A5E4B] block">Lead Time</span>
                    <span className="font-mono font-medium text-[#3A2319] tabular-nums">
                      {sup.defaultLeadTimeDays} days
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Curated Trade SKUs */}
          <div className="mt-20 pt-16 border-t border-[#E9DCC7]">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
              <div>
                <p className="text-xs font-medium text-[#7A5E4B]">Indicative Wholesale Pricing (Demo)</p>
                <h2 className="font-serif text-3xl font-semibold text-[#3A2319] mt-1">
                  Ready for Bulk Procurement
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('/marketplace')}
                className="text-sm font-medium text-[#B05330] hover:text-[#964425] flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <span>Open Full Marketplace</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {(summary?.featuredProducts ?? []).slice(0, 3).map((prod) => (
                <button
                  key={prod.id}
                  type="button"
                  onClick={() => onNavigate(`/products/${prod.id}`)}
                  className="group text-left bg-[#FFFCF6] border border-[#E9DCC7] hover:border-[#B05330]/60 transition-all duration-200 hover:-translate-y-0.5 cursor-pointer flex flex-col"
                >
                  <div className="aspect-[4/3] w-full overflow-hidden bg-[#E9DCC7]/30">
                    <CraftImage
                      src={prod.imageUrl}
                      alt={prod.name}
                      className="group-hover:scale-[1.03] transition-transform duration-300"
                    />
                  </div>
                  <div className="p-6 flex-1 flex flex-col justify-between">
                    <div>
                      <p className="text-xs text-[#7A5E4B]">
                        {prod.categoryName} · {prod.originCity}, {prod.originState}
                      </p>
                      <h3 className="font-sans text-base font-semibold text-[#3A2319] mt-1.5 group-hover:text-[#B05330] transition-colors">
                        {prod.name}
                      </h3>
                      <p className="text-xs text-[#5C4334] mt-1">{prod.supplierName}</p>
                    </div>
                    <div className="flex items-baseline justify-between mt-5 pt-4 border-t border-[#E9DCC7]">
                      <span className="font-mono text-base font-medium text-[#3A2319] tabular-nums">
                        {formatInr(prod.indicativePriceInr)}
                        <span className="font-sans text-xs text-[#7A5E4B] font-normal"> / unit</span>
                      </span>
                      <span className="font-mono text-xs text-[#7A5E4B] tabular-nums">
                        MOQ {prod.moq} · {prod.leadTimeDays}d
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 6. IMPACT, CRAFTSMANSHIP STORYTELLING & WHY BUSINESSES SOURCE THROUGH FOLKFORM */}
      <section className="border-t border-[#E9DCC7] bg-[#FFFCF6]">
        <div className="max-w-[1360px] mx-auto px-6 py-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-stretch">
            <div className="lg:col-span-6 overflow-hidden border border-[#E9DCC7] min-h-[340px]">
              <CraftImage
                src={WORKSHOP_IMG}
                alt="Artisan hands shaping wet terracotta clay on a traditional stoneware potter's wheel in Rajasthan"
                className="lg:h-full"
                aspectClass="aspect-[16/10]"
              />
            </div>

            <div className="lg:col-span-6 flex flex-col justify-center">
              <p className="text-xs font-medium text-[#7A5E4B]">
                Why Businesses Source Through Folkform
              </p>
              <h2 className="font-serif text-3xl sm:text-4xl font-semibold text-[#3A2319] mt-2 leading-tight">
                Preserving India’s Living Craft Economies Through Modern Trade Infrastructure
              </h2>
              <p className="text-sm text-[#5C4334] leading-relaxed mt-4">
                Traditional Indian workshops craft extraordinary objects yet remain disconnected
                from international hospitality, architectural, and retail supply chains. Folkform
                gives collectives structured catalogues, bulk demand, and predictable order
                milestones while giving procurement teams commercial transparency.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-8 pt-6 border-t border-[#E9DCC7]">
                {[
                  {
                    icon: Compass,
                    title: 'Direct Cluster Access',
                    body: 'Source directly from cooperatives, family ateliers, and self-help groups without opaque multi-tier markups.',
                  },
                  {
                    icon: ShieldCheck,
                    title: 'Transparent Commercial Controls',
                    body: 'Clear distinction between declared capacity and confirmed quotes, plus mandatory human sign-off before PO release.',
                  },
                ].map((item) => (
                  <div key={item.title}>
                    <item.icon className="w-5 h-5 text-[#B05330]" strokeWidth={1.6} />
                    <h3 className="font-sans text-sm font-semibold text-[#3A2319] mt-3">
                      {item.title}
                    </h3>
                    <p className="text-sm text-[#5C4334] mt-1.5 leading-relaxed">{item.body}</p>
                  </div>
                ))}
              </div>

              <ul className="mt-6 space-y-2 text-sm text-[#3A2319]">
                {[
                  'Standardized RFQ specifications with customisation & export packaging fields',
                  'Side-by-side landed cost, MOQ, and kiln/loom lead-time comparisons',
                  'Traceable origin documentation generated strictly from supplier-approved facts',
                ].map((pt) => (
                  <li key={pt} className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-[#4A5945] mt-0.5 shrink-0" />
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* 7. DEMO BUYER TESTIMONIALS */}
      <section className="border-t border-[#E9DCC7] bg-[#F8F3E8]">
        <div className="max-w-[1360px] mx-auto px-6 py-20">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-12">
            <div>
              <p className="text-xs font-medium text-[#7A5E4B]">
                Buyer Procurement Outcomes · Illustrative Demo Testimonials
              </p>
              <h2 className="font-serif text-3xl sm:text-4xl font-semibold text-[#3A2319] mt-2">
                Built for Hospitality, Retail & Design Teams
              </h2>
            </div>
            <span className="text-xs text-[#7A5E4B]">
              Demo content until live customer reviews are collected
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {DEMO_TESTIMONIALS.map((t) => (
              <div
                key={t.name}
                className="bg-[#FFFCF6] border border-[#E9DCC7] p-7 flex flex-col justify-between"
              >
                <div>
                  <p className="font-serif text-xl text-[#3A2319] leading-relaxed">
                    “{t.quote}”
                  </p>
                  <p className="text-xs font-medium text-[#4A5945] mt-5 pt-4 border-t border-[#E9DCC7]">
                    {t.outcome}
                  </p>
                </div>
                <div className="mt-5">
                  <p className="text-sm font-semibold text-[#3A2319]">{t.name}</p>
                  <p className="text-xs text-[#7A5E4B]">
                    {t.role}, {t.org} (Demo)
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 8. DUAL CTA FOR BUYERS & ARTISANS */}
      <section className="border-t border-[#E9DCC7] bg-[#3A2319] text-[#FFFCF6]">
        <div className="max-w-[1360px] mx-auto px-6 py-20">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <div className="pb-8 md:pb-0 md:pr-10 md:border-r border-[#FFFCF6]/15">
              <p className="text-xs text-[#BE9753]">For International Buyers & Hospitality Teams</p>
              <h2 className="font-serif text-3xl sm:text-4xl font-semibold mt-2">
                Source authentic Indian craft at commercial scale.
              </h2>
              <p className="text-sm text-[#E9DCC7]/85 mt-3 leading-relaxed max-w-md">
                Launch an AI-assisted sourcing brief, compare binding workshop quotations, and
                manage Purchase Orders in one disciplined operating system.
              </p>
              <button
                type="button"
                onClick={() => onDemoLogin('buyer')}
                className="mt-6 px-6 py-3 bg-[#B05330] hover:bg-[#C6613A] text-[#FFFCF6] text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
              >
                Launch Buyer Workspace
              </button>
            </div>

            <div className="md:pl-4">
              <p className="text-xs text-[#BE9753]">For Indian Artisans, Collectives & Weavers</p>
              <h2 className="font-serif text-3xl sm:text-4xl font-semibold mt-2">
                Bring your workshop to global B2B buyers.
              </h2>
              <p className="text-sm text-[#E9DCC7]/85 mt-3 leading-relaxed max-w-md">
                Build a trade-ready digital storefront, receive structured bulk RFQs matching your
                capacity, submit quotations, and track production orders cleanly.
              </p>
              <div className="mt-6 flex flex-wrap gap-4">
                <button
                  type="button"
                  onClick={() => onNavigate('/onboard-supplier')}
                  className="px-6 py-3 bg-[#FFFCF6] hover:bg-[#E9DCC7] text-[#3A2319] text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
                >
                  Onboard Your Workshop
                </button>
                <button
                  type="button"
                  onClick={() => onDemoLogin('supplier')}
                  className="px-6 py-3 border border-[#FFFCF6]/30 hover:border-[#FFFCF6] text-[#FFFCF6] text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
                >
                  Try Supplier Demo
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 9. EDITORIAL FOOTER */}
      <footer className="bg-[#2B1912] text-[#E9DCC7]/80 border-t border-[#FFFCF6]/10">
        <div className="max-w-[1360px] mx-auto px-6 py-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <p className="font-serif text-2xl font-semibold text-[#FFFCF6]">Folkform</p>
            <p className="text-xs text-[#E9DCC7]/70 mt-1">
              Where Culture Meets Commerce · AI-Powered Global Artisan Procurement Infrastructure
            </p>
            <p className="text-xs text-[#E9DCC7]/55 mt-2">
              Note: Seeded suppliers, prices, reviews, and settlement flows are marked as
              demonstration records for evaluation.
            </p>
          </div>
          <div className="flex flex-wrap gap-6 text-xs">
            <button
              type="button"
              onClick={() => onNavigate('/marketplace')}
              className="hover:text-[#FFFCF6] cursor-pointer"
            >
              Marketplace
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/suppliers')}
              className="hover:text-[#FFFCF6] cursor-pointer"
            >
              Artisan Makers
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/onboard-supplier')}
              className="hover:text-[#FFFCF6] cursor-pointer"
            >
              Supplier Onboarding
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/auth')}
              className="hover:text-[#FFFCF6] cursor-pointer"
            >
              Sign In
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
