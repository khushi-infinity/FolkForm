import React, { useEffect, useState } from 'react';
import { ArrowLeft, Bookmark, Check, MapPin, MessageSquare, Send } from 'lucide-react';
import { apiRequest, formatInr, formatVerificationLabel } from '../lib/api';
import { CraftImage } from '../components/CraftImage';
import type { AuthUser, Product, SupplierProfile } from '../types';

interface ProductDetailPageProps {
  productId: string;
  user: AuthUser | null;
  onNavigate: (path: string) => void;
  onToast: (msg: string) => void;
}

export const ProductDetailPage: React.FC<ProductDetailPageProps> = ({
  productId,
  user,
  onNavigate,
  onToast,
}) => {
  const [product, setProduct] = useState<Product | null>(null);
  const [supplier, setSupplier] = useState<SupplierProfile | null>(null);
  const [similar, setSimilar] = useState<Product[]>([]);
  const [activeImage, setActiveImage] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  // Quick Direct RFQ Modal
  const [rfqOpen, setRfqOpen] = useState(false);
  const [rfqQty, setRfqQty] = useState(200);
  const [rfqBudget, setRfqBudget] = useState(1200);
  const [rfqLocation, setRfqLocation] = useState('Mumbai, India');
  const [rfqLeadDays, setRfqLeadDays] = useState(30);
  const [rfqNotes, setRfqNotes] = useState('');
  const [submittingRfq, setSubmittingRfq] = useState(false);

  useEffect(() => {
    setLoading(true);
    apiRequest<{ product: Product; supplier: SupplierProfile | null; similarProducts: Product[] }>(
      `/products/${productId}`,
    )
      .then((res) => {
        setProduct(res.product);
        setSupplier(res.supplier);
        setSimilar(res.similarProducts);
        setActiveImage(res.product.imageUrl);
        setRfqQty(Math.max(res.product.moq, 100));
        setRfqBudget(Math.round(res.product.indicativePriceInr));
        setRfqLeadDays(Math.max(res.product.leadTimeDays, 21));
      })
      .catch((err) => onToast(err.message))
      .finally(() => setLoading(false));
  }, [productId]);

  const handleSave = async () => {
    if (!user) {
      onToast('Please sign in to save products.');
      onNavigate('/auth');
      return;
    }
    try {
      const res = await apiRequest<{ saved: boolean }>(`/saved/products/${productId}`, {
        method: 'POST',
      });
      setSaved(res.saved);
      onToast(res.saved ? 'Product saved to your collection.' : 'Removed from saved collection.');
    } catch (err: any) {
      onToast(err.message);
    }
  };

  const handleContactMaker = async () => {
    if (!user || !product || !supplier) {
      onToast('Sign in as a buyer to message artisan workshops.');
      onNavigate('/auth');
      return;
    }
    try {
      await apiRequest('/conversations', {
        method: 'POST',
        body: {
          supplierId: supplier.id,
          subject: `Product Enquiry: ${product.name} (${product.sku})`,
          initialMessage: `Hello ${supplier.businessName}, we are interested in bulk procurement of ${product.name} (MOQ ${product.moq}). Could you share current kiln/loom availability and sample dispatch lead time?`,
        },
      });
      onToast('Conversation started with the supplier.');
      onNavigate(user.role === 'buyer' ? '/buyer/messages' : '/supplier/messages');
    } catch (err: any) {
      onToast(err.message);
    }
  };

  const handleSubmitDirectRfq = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !product || !supplier) {
      onToast('Sign in as a Buyer to submit a formal Request for Quotation.');
      onNavigate('/auth');
      return;
    }
    if (user.role !== 'buyer' && user.role !== 'admin') {
      onToast('Switch to a Buyer account to submit RFQs.');
      return;
    }
    setSubmittingRfq(true);
    try {
      const res = await apiRequest<{ rfqCode: string }>('/rfqs', {
        method: 'POST',
        body: {
          title: `${rfqQty} x ${product.name}`,
          categorySlugOrId: product.categoryId,
          description: `Direct RFQ for ${product.name} (${product.sku}). ${rfqNotes || product.customisationOptions}`,
          quantity: rfqQty,
          targetUnitPriceInr: rfqBudget,
          budgetMinInr: Math.round(rfqBudget * 0.9),
          budgetMaxInr: rfqBudget,
          preferredMaterials: product.materials,
          craftTechnique: product.craftTechnique,
          customisationRequirements: rfqNotes || product.customisationOptions,
          moqPreference: product.moq,
          deliveryLocation: rfqLocation,
          requiredLeadDays: rfqLeadDays,
          invitedSupplierIds: [supplier.id],
        },
      });
      setRfqOpen(false);
      onToast(`${res.rfqCode} submitted directly to ${supplier.businessName}.`);
      onNavigate('/buyer/rfqs');
    } catch (err: any) {
      onToast(err.message);
    } finally {
      setSubmittingRfq(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-[1360px] mx-auto px-6 py-12">
        <div className="h-[520px] bg-[#FFFCF6] border border-[#E9DCC7] animate-pulse" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="max-w-[1360px] mx-auto px-6 py-20 text-center">
        <h1 className="font-serif text-3xl text-[#3A2319]">Product not found</h1>
        <button
          type="button"
          onClick={() => onNavigate('/marketplace')}
          className="mt-4 px-5 py-2.5 bg-[#3A2319] text-[#FFFCF6] text-xs font-medium cursor-pointer"
        >
          Back to Marketplace
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-[1360px] mx-auto px-6 py-10">
      <button
        type="button"
        onClick={() => onNavigate('/marketplace')}
        className="inline-flex items-center gap-2 text-xs font-medium text-[#7A5E4B] hover:text-[#3A2319] mb-6 cursor-pointer"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Back to Collections</span>
      </button>

      {/* Main Contiguous Two-Column PDP */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        {/* Left: Sticky Editorial Gallery */}
        <div className="lg:col-span-7 lg:sticky lg:top-24 space-y-4">
          <div className="aspect-[4/3] w-full overflow-hidden border border-[#E9DCC7] bg-[#FFFCF6]">
            <CraftImage src={activeImage || product.imageUrl} alt={product.name} />
          </div>
          {product.gallery && product.gallery.length > 1 && (
            <div className="grid grid-cols-4 gap-3">
              {product.gallery.map((img) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setActiveImage(img.imageUrl)}
                  className={`aspect-[4/3] overflow-hidden border cursor-pointer ${
                    activeImage === img.imageUrl
                      ? 'border-[#B05330] ring-1 ring-[#B05330]'
                      : 'border-[#E9DCC7] opacity-80 hover:opacity-100'
                  }`}
                >
                  <CraftImage src={img.imageUrl} alt={img.caption || product.name} />
                </button>
              ))}
            </div>
          )}

          {/* Product Specifications Table */}
          <div className="bg-[#FFFCF6] border border-[#E9DCC7] p-6 mt-6">
            <h2 className="font-serif text-2xl font-semibold text-[#3A2319]">
              Craft Provenance & Technical Specifications
            </h2>
            <p className="text-xs text-[#7A5E4B] mt-1">
              Recorded from supplier-submitted product specifications · No unverified external
              certifications implied.
            </p>
            <dl className="mt-5 divide-y divide-[#E9DCC7] text-sm">
              <div className="py-3 grid grid-cols-3 gap-4">
                <dt className="text-[#7A5E4B]">Craft Technique</dt>
                <dd className="col-span-2 font-medium text-[#3A2319]">{product.craftTechnique}</dd>
              </div>
              <div className="py-3 grid grid-cols-3 gap-4">
                <dt className="text-[#7A5E4B]">Materials</dt>
                <dd className="col-span-2 text-[#3A2319]">{product.materials}</dd>
              </div>
              <div className="py-3 grid grid-cols-3 gap-4">
                <dt className="text-[#7A5E4B]">Geographic Origin</dt>
                <dd className="col-span-2 text-[#3A2319]">
                  {product.originCity}, {product.originState}, India
                </dd>
              </div>
              <div className="py-3 grid grid-cols-3 gap-4">
                <dt className="text-[#7A5E4B]">Customisation Options</dt>
                <dd className="col-span-2 text-[#3A2319]">{product.customisationOptions}</dd>
              </div>
              {(product.specifications ?? []).map((sp) => (
                <div key={sp.id} className="py-3 grid grid-cols-3 gap-4">
                  <dt className="text-[#7A5E4B]">{sp.specKey}</dt>
                  <dd className="col-span-2 text-[#3A2319]">{sp.specValue}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        {/* Right: Contiguous B2B Procurement Module */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-[#FFFCF6] border border-[#E9DCC7] p-7">
            <div className="flex items-center justify-between text-xs text-[#7A5E4B]">
              <span>
                {product.categoryName} · {product.sku}
              </span>
              {product.isDemo && <span>Demo Trade Listing</span>}
            </div>

            <h1 className="font-serif text-3xl sm:text-4xl font-semibold text-[#3A2319] mt-2 leading-tight">
              {product.name}
            </h1>

            <div className="flex items-center gap-2 text-xs text-[#5C4334] mt-3">
              <MapPin className="w-3.5 h-3.5 text-[#B05330]" />
              <span>
                {product.originCity}, {product.originState}
              </span>
              <span aria-hidden="true">·</span>
              <span className="text-[#4A5945] font-medium">
                {formatVerificationLabel(product.supplierVerificationStatus, product.isDemo)}
              </span>
            </div>

            <p className="text-sm text-[#5C4334] leading-relaxed mt-5">{product.description}</p>

            {/* Indicative Wholesale Commercial Grid */}
            <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-[#E9DCC7]">
              <div>
                <p className="text-xs text-[#7A5E4B]">Indicative Wholesale Price</p>
                <p className="font-mono text-2xl font-medium text-[#3A2319] tabular-nums mt-0.5">
                  {formatInr(product.indicativePriceInr)}
                </p>
                <p className="text-[11px] text-[#7A5E4B]">per unit (ex-workshop estimate)</p>
              </div>
              <div>
                <p className="text-xs text-[#7A5E4B]">Minimum Order Quantity</p>
                <p className="font-mono text-2xl font-medium text-[#3A2319] tabular-nums mt-0.5">
                  {product.moq}
                </p>
                <p className="text-[11px] text-[#7A5E4B]">units minimum batch</p>
              </div>
              <div>
                <p className="text-xs text-[#7A5E4B]">Declared Lead Time</p>
                <p className="font-mono text-lg font-medium text-[#3A2319] tabular-nums mt-0.5">
                  {product.leadTimeDays} days
                </p>
              </div>
              <div>
                <p className="text-xs text-[#7A5E4B]">Declared Available Qty</p>
                <p className="font-mono text-lg font-medium text-[#3A2319] tabular-nums mt-0.5">
                  {product.availableQty.toLocaleString('en-IN')} units
                </p>
              </div>
            </div>

            <div className="mt-7 space-y-3">
              <button
                type="button"
                onClick={() => {
                  if (!user) {
                    onToast('Sign in or use Buyer Demo to request a formal quotation.');
                    onNavigate('/auth');
                    return;
                  }
                  setRfqOpen(true);
                }}
                className="w-full py-3.5 px-6 bg-[#B05330] hover:bg-[#964425] text-[#FFFCF6] text-sm font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>Request Bulk Quotation</span>
              </button>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleContactMaker}
                  className="py-2.5 px-4 bg-[#F8F3E8] hover:bg-[#EFE6D6] border border-[#E9DCC7] text-xs font-medium text-[#3A2319] flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Contact Maker</span>
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="py-2.5 px-4 bg-[#F8F3E8] hover:bg-[#EFE6D6] border border-[#E9DCC7] text-xs font-medium text-[#3A2319] flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Bookmark className="w-3.5 h-3.5" fill={saved ? 'currentColor' : 'none'} />
                  <span>{saved ? 'Saved' : 'Save Product'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Supplier Workshop Card */}
          {supplier && (
            <div className="bg-[#FFFCF6] border border-[#E9DCC7] p-6">
              <p className="text-xs text-[#7A5E4B]">Crafted By · {supplier.supplierType}</p>
              <h2 className="font-serif text-2xl font-semibold text-[#3A2319] mt-1">
                {supplier.businessName}
              </h2>
              <p className="text-xs text-[#5C4334] mt-1">
                {supplier.city}, {supplier.state} · Declared monthly capacity:{' '}
                <span className="font-mono tabular-nums">{supplier.monthlyCapacityUnits}</span>{' '}
                units/mo
              </p>
              <p className="text-sm text-[#5C4334] leading-relaxed mt-3">
                {supplier.craftHeritageSummary}
              </p>
              <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-[#E9DCC7] text-xs text-[#3A2319]">
                {supplier.customisationSupported && (
                  <span className="flex items-center gap-1">
                    <Check className="w-3.5 h-3.5 text-[#4A5945]" /> Customisation Supported
                  </span>
                )}
                {supplier.exportReady && (
                  <span className="flex items-center gap-1">
                    <Check className="w-3.5 h-3.5 text-[#4A5945]" /> Export Packing Declared
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => onNavigate(`/suppliers/${supplier.id}`)}
                className="mt-5 w-full py-2.5 border border-[#3A2319] text-[#3A2319] hover:bg-[#3A2319] hover:text-[#FFFCF6] text-xs font-medium transition-colors cursor-pointer"
              >
                Inspect Maker Storefront & Capabilities
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Similar Products */}
      {similar.length > 0 && (
        <section className="mt-16 pt-12 border-t border-[#E9DCC7]">
          <h2 className="font-serif text-3xl font-semibold text-[#3A2319] mb-8">
            Similar Handcrafted Trade Products
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {similar.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onNavigate(`/products/${s.id}`)}
                className="group text-left bg-[#FFFCF6] border border-[#E9DCC7] hover:border-[#B05330] transition-colors cursor-pointer"
              >
                <div className="aspect-[4/3] overflow-hidden">
                  <CraftImage src={s.imageUrl} alt={s.name} />
                </div>
                <div className="p-5">
                  <p className="text-xs text-[#7A5E4B]">
                    {s.originCity}, {s.originState}
                  </p>
                  <h3 className="font-sans text-sm font-semibold text-[#3A2319] mt-1 group-hover:text-[#B05330]">
                    {s.name}
                  </h3>
                  <div className="flex justify-between mt-3 pt-3 border-t border-[#E9DCC7] text-xs font-mono">
                    <span className="text-[#3A2319]">{formatInr(s.indicativePriceInr)}/u</span>
                    <span className="text-[#7A5E4B]">MOQ {s.moq}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Direct RFQ Modal */}
      {rfqOpen && (
        <div className="fixed inset-0 z-50 bg-[#24140D]/60 flex items-center justify-center p-4">
          <div className="bg-[#FFFCF6] border border-[#E9DCC7] max-w-lg w-full p-7">
            <h2 className="font-serif text-2xl font-semibold text-[#3A2319]">
              Request Bulk Quotation
            </h2>
            <p className="text-xs text-[#7A5E4B] mt-1">
              Sending structured RFQ directly to {supplier?.businessName} for {product.name}.
            </p>
            <form onSubmit={handleSubmitDirectRfq} className="space-y-4 mt-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#7A5E4B] mb-1">
                    Order Quantity (MOQ {product.moq})
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={rfqQty}
                    onChange={(e) => setRfqQty(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-[#F8F3E8] border border-[#E9DCC7] text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#7A5E4B] mb-1">
                    Target Unit Price (₹)
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={rfqBudget}
                    onChange={(e) => setRfqBudget(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-[#F8F3E8] border border-[#E9DCC7] text-sm font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#7A5E4B] mb-1">
                    Delivery Destination
                  </label>
                  <input
                    type="text"
                    required
                    value={rfqLocation}
                    onChange={(e) => setRfqLocation(e.target.value)}
                    className="w-full px-3 py-2 bg-[#F8F3E8] border border-[#E9DCC7] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#7A5E4B] mb-1">
                    Desired Lead Time (Days)
                  </label>
                  <input
                    type="number"
                    min={5}
                    required
                    value={rfqLeadDays}
                    onChange={(e) => setRfqLeadDays(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-[#F8F3E8] border border-[#E9DCC7] text-sm font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#7A5E4B] mb-1">
                  Customisation & Packaging Notes
                </label>
                <textarea
                  rows={3}
                  value={rfqNotes}
                  onChange={(e) => setRfqNotes(e.target.value)}
                  placeholder="Specify voltage, shade fabric, export cartons, or private-label hangtags..."
                  className="w-full px-3 py-2 bg-[#F8F3E8] border border-[#E9DCC7] text-sm"
                />
              </div>
              <div className="flex justify-end gap-3 pt-3 border-t border-[#E9DCC7]">
                <button
                  type="button"
                  onClick={() => setRfqOpen(false)}
                  className="px-4 py-2 text-xs text-[#5C4334] border border-[#E9DCC7] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingRfq}
                  className="px-5 py-2 bg-[#B05330] hover:bg-[#964425] text-[#FFFCF6] text-xs font-medium cursor-pointer disabled:opacity-60"
                >
                  {submittingRfq ? 'Dispatching RFQ…' : 'Confirm & Submit RFQ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
