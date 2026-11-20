export type UserRole = 'buyer' | 'supplier' | 'admin';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  status: string;
  isDemo: boolean;
  buyerProfile?: BuyerProfile | null;
  supplierProfile?: SupplierProfile | null;
}

export interface BuyerProfile {
  id: string;
  userId: string;
  companyName: string;
  buyerType: string;
  country: string;
  city: string;
  website?: string;
  annualSourcingVolume?: string;
  subscriptionPlan: string;
}

export interface SupplierProfile {
  id: string;
  userId: string;
  businessName: string;
  supplierType: string;
  clusterId?: string;
  clusterName?: string;
  state: string;
  city: string;
  address?: string;
  craftHeritageSummary: string;
  monthlyCapacityUnits: number;
  defaultMoq: number;
  defaultLeadTimeDays: number;
  customisationSupported: boolean;
  exportReady: boolean;
  verificationStatus: 'unverified' | 'pending' | 'under_review' | 'approved' | 'rejected';
  isDemo: boolean;
  productCount?: number;
  primaryImageUrl?: string;
  categories?: string[];
  capabilities?: SupplierCapability[];
}

export interface SupplierCapability {
  id: string;
  supplierId: string;
  categoryId: string;
  categoryName?: string;
  craftTechnique: string;
  materialSpecialty: string;
  minMoq: number;
  maxMonthlyCapacity: number;
  avgLeadTimeDays: number;
  supportsCustomisation: boolean;
  notes?: string;
}

export interface ArtisanCluster {
  id: string;
  name: string;
  state: string;
  region: string;
  primaryCrafts: string;
  artisanCountEst: number;
  description: string;
  mapX: number;
  mapY: number;
  supplierCount?: number;
  productCount?: number;
}

export interface ProductCategory {
  id: string;
  slug: string;
  name: string;
  description: string;
  imageUrl: string;
  displayOrder: number;
  productCount?: number;
}

export interface ProductSpecification {
  id: string;
  specKey: string;
  specValue: string;
}

export interface Product {
  id: string;
  supplierId: string;
  supplierName: string;
  supplierVerificationStatus: string;
  supplierType?: string;
  supplierMonthlyCapacity?: number;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  sku: string;
  name: string;
  slug: string;
  description: string;
  craftTechnique: string;
  materials: string;
  originCity: string;
  originState: string;
  moq: number;
  indicativePriceInr: number;
  availableQty: number;
  leadTimeDays: number;
  customisationOptions: string;
  imageUrl: string;
  popularityScore: number;
  status: string;
  isDemo: boolean;
  specifications?: ProductSpecification[];
  gallery?: { id: string; imageUrl: string; caption: string }[];
  createdAt?: string;
}

export interface RfqRecord {
  id: string;
  rfqCode: string;
  buyerId: string;
  buyerName?: string;
  buyerCompany?: string;
  title: string;
  categoryId?: string;
  categoryName?: string;
  description: string;
  quantity: number;
  targetUnitPriceInr?: number;
  budgetMinInr?: number;
  budgetMaxInr?: number;
  preferredMaterials?: string;
  craftTechnique?: string;
  customisationRequirements?: string;
  moqPreference?: number;
  deliveryLocation: string;
  requiredDeliveryDate?: string;
  requiredLeadDays?: number;
  shippingRequirements?: string;
  additionalInstructions?: string;
  status: string;
  selectedSupplierId?: string;
  aiWorkflowId?: string;
  isDemo: boolean;
  suppliersContactedCount?: number;
  quotationsReceivedCount?: number;
  matchedSuppliers?: RfqSupplierMatch[];
  quotations?: QuotationRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface MatchDimensionScore {
  dimension: string;
  weight: number;
  score: number;
  rationale: string;
}

export interface RfqSupplierMatch {
  id?: string;
  supplierId: string;
  supplierName: string;
  city: string;
  state: string;
  supplierType: string;
  verificationStatus: string;
  monthlyCapacityUnits: number;
  defaultMoq: number;
  defaultLeadTimeDays: number;
  customisationSupported: boolean;
  overallScore: number;
  dimensions: MatchDimensionScore[];
  missingRequirements: string[];
  potentialConcerns: string[];
  recommendationReason: string;
  matchedProducts: {
    id: string;
    name: string;
    indicativePriceInr: number;
    moq: number;
    leadTimeDays: number;
    imageUrl: string;
    craftTechnique: string;
  }[];
  indicativeUnitRangeInr: { min: number; max: number } | null;
  estimatedTotalInr: { min: number; max: number } | null;
  status?: string;
}

export interface QuotationRecord {
  id: string;
  quoteCode: string;
  rfqId: string;
  rfqCode?: string;
  rfqTitle?: string;
  rfqQuantity?: number;
  supplierId: string;
  supplierName: string;
  supplierCity?: string;
  supplierState?: string;
  supplierVerificationStatus?: string;
  supplierMonthlyCapacity?: number;
  unitPriceInr: number;
  totalProductCostInr: number;
  moq: number;
  availableCapacity: number;
  estimatedProductionDays: number;
  shippingEstimateInr: number;
  totalLandedCostInr: number;
  customisationNotes?: string;
  conditions?: string;
  validityDays: number;
  status: string;
  isSaved: boolean;
  isDemo: boolean;
  createdAt: string;
}

export type OrderStatus =
  | 'rfq_submitted'
  | 'supplier_contacted'
  | 'quotation_received'
  | 'negotiation'
  | 'awaiting_buyer_approval'
  | 'purchase_order_created'
  | 'supplier_confirmed'
  | 'production_started'
  | 'quality_check'
  | 'ready_for_dispatch'
  | 'shipped'
  | 'delivered'
  | 'completed'
  | 'disputed'
  | 'cancelled';

export interface OrderMilestone {
  id: string;
  orderId: string;
  stage: string;
  status: string;
  notes: string;
  updatedByName?: string;
  isDelayed: boolean;
  createdAt: string;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  rfqId?: string;
  rfqCode?: string;
  quotationId?: string;
  quoteCode?: string;
  buyerId: string;
  buyerName: string;
  buyerCompany: string;
  supplierId: string;
  supplierName: string;
  supplierLocation?: string;
  title: string;
  quantity: number;
  unitPriceInr: number;
  subtotalInr: number;
  shippingInr: number;
  totalAmountInr: number;
  commissionRate: number;
  platformCommissionInr: number;
  status: OrderStatus;
  deliveryLocation: string;
  expectedDeliveryDate?: string;
  buyerApprovedAt?: string;
  supplierConfirmedAt?: string;
  paymentStatus: string;
  paymentAdapterNote?: string;
  disputeReason?: string;
  isDemo: boolean;
  milestones?: OrderMilestone[];
  createdAt: string;
  updatedAt: string;
}

export interface ConversationThread {
  id: string;
  buyerId: string;
  buyerName: string;
  buyerCompany?: string;
  supplierId: string;
  supplierName: string;
  rfqId?: string;
  rfqCode?: string;
  orderId?: string;
  poNumber?: string;
  subject: string;
  lastMessageAt: string;
  unreadCount: number;
  lastMessagePreview?: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  body: string;
  attachmentName?: string;
  attachmentUrl?: string;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  linkPath?: string;
  isRead: boolean;
  createdAt: string;
}

export interface AgentLogEntry {
  id: string;
  workflowId: string;
  agentName: string;
  stepOrder: number;
  status: string;
  durationMs: number;
  inputSummary: string;
  outputSummary: string;
  toolCalls: string[];
  createdAt: string;
}

export interface ExtractedRequirementSpec {
  productTitle: string;
  categorySlug: string;
  categoryName: string;
  quantity: number;
  budgetMinInr: number | null;
  budgetMaxInr: number | null;
  preferredRegion: string | null;
  preferredMaterials: string;
  craftTechnique: string;
  requiredLeadDays: number | null;
  buyerUseCase: string;
  deliveryLocation: string;
  customisationRequirements: string;
  missingInformation: string[];
  clarificationQuestions: string[];
}

export interface SourcingWorkflowResult {
  workflowId: string;
  rawPrompt: string;
  providerUsed: string;
  status: string;
  humanApprovalStatus: string;
  extractedSpec: ExtractedRequirementSpec;
  shortlist: RfqSupplierMatch[];
  pricingSummary: {
    estimatedUnitRangeInr: { min: number; max: number } | null;
    estimatedOrderTotalRangeInr: { min: number; max: number } | null;
    budgetAlignmentNote: string;
    costTradeoffs: string[];
    disclaimer: string;
  };
  riskFlags: string[];
  suggestedActions: string[];
  insufficientMatchesNotice: string | null;
  agentLogs: AgentLogEntry[];
  createdAt: string;
}

export interface AdminRevenueAnalytics {
  gmvTotalInr: number;
  realisedGmvInr: number;
  pendingGmvInr: number;
  realisedPlatformRevenueInr: number;
  realisedCommissionInr: number;
  managedSourcingFeesInr: number;
  completedTransactionsCount: number;
  totalOrdersCount: number;
  averageOrderValueInr: number;
  activeBuyersCount: number;
  activeSuppliersCount: number;
  repeatBuyerRatePct: number;
  rfqConversionRatePct: number;
  avgTimeToQuotationHours: number;
  commissionRateDefault: number;
  managedSourcingFeePct: number;
  buyerSubscriptionMonthlyInr: number;
  monthlySeries: { month: string; gmvInr: number; platformRevenueInr: number; orders: number }[];
  categorySeries: { category: string; gmvInr: number; products: number }[];
}
