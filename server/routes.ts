import express, { type Request, type Response, type NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { z } from 'zod';
import { createNotification, db, getSetting, nowIso, uuid, writeAuditLog } from './db.ts';
import {
  DEFAULT_SCORING_WEIGHTS,
  draftProvenanceDescription,
  runFulfilmentScan,
  runSourcingWorkflow,
  scoreSuppliersForSpec,
  type ScoringWeights,
} from './agents/orchestrator.ts';
import type { AuthUser, UserRole } from '../src/types.ts';

interface AuthedRequest extends Request {
  authUser?: AuthUser;
}

// Simple API rate limiter (per IP sliding window)
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function rateLimit(maxPerMinute: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || 'local';
    const key = `${req.path}:${ip}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || bucket.resetAt < now) {
      rateBuckets.set(key, { count: 1, resetAt: now + 60_000 });
      next();
      return;
    }
    if (bucket.count >= maxPerMinute) {
      res.status(429).json({ error: 'Rate limit exceeded. Please wait a moment before retrying.' });
      return;
    }
    bucket.count += 1;
    next();
  };
}

function hydrateAuthUser(userId: string): AuthUser | null {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
  if (!user || user.status === 'suspended') return null;

  let buyerProfile = null;
  let supplierProfile = null;

  if (user.role === 'buyer') {
    const bp = db.prepare('SELECT * FROM buyer_profiles WHERE user_id = ?').get(user.id) as any;
    if (bp) {
      buyerProfile = {
        id: bp.id,
        userId: bp.user_id,
        companyName: bp.company_name,
        buyerType: bp.buyer_type,
        country: bp.country,
        city: bp.city,
        website: bp.website,
        annualSourcingVolume: bp.annual_sourcing_volume,
        subscriptionPlan: bp.subscription_plan,
      };
    }
  } else if (user.role === 'supplier') {
    const sp = db
      .prepare(`
        SELECT sp.*, ac.name as cluster_name
        FROM supplier_profiles sp
        LEFT JOIN artisan_clusters ac ON ac.id = sp.cluster_id
        WHERE sp.user_id = ?
      `)
      .get(user.id) as any;
    if (sp) {
      supplierProfile = {
        id: sp.id,
        userId: sp.user_id,
        businessName: sp.business_name,
        supplierType: sp.supplier_type,
        clusterId: sp.cluster_id,
        clusterName: sp.cluster_name,
        state: sp.state,
        city: sp.city,
        address: sp.address,
        craftHeritageSummary: sp.craft_heritage_summary,
        monthlyCapacityUnits: sp.monthly_capacity_units,
        defaultMoq: sp.default_moq,
        defaultLeadTimeDays: sp.default_lead_time_days,
        customisationSupported: Boolean(sp.customisation_supported),
        exportReady: Boolean(sp.export_ready),
        verificationStatus: sp.verification_status,
        isDemo: Boolean(sp.is_demo),
      };
    }
  }

  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    role: user.role as UserRole,
    status: user.status,
    isDemo: Boolean(user.is_demo),
    buyerProfile,
    supplierProfile,
  };
}

function createSessionToken(userId: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 86400 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
    token,
    userId,
    expiresAt,
    nowIso(),
  );
  return token;
}

function attachAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    const token = header.slice(7).trim();
    const sess = db
      .prepare('SELECT user_id, expires_at FROM sessions WHERE token = ?')
      .get(token) as { user_id: string; expires_at: string } | undefined;
    if (sess && sess.expires_at > nowIso()) {
      const hydrated = hydrateAuthUser(sess.user_id);
      if (hydrated) req.authUser = hydrated;
    }
  }
  next();
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.authUser) {
    res.status(401).json({ error: 'Authentication required. Please sign in to continue.' });
    return;
  }
  next();
}

function requireRole(...roles: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!roles.includes(req.authUser.role)) {
      res.status(403).json({ error: `Access restricted to ${roles.join(' or ')} accounts.` });
      return;
    }
    next();
  };
}

function mapProductRow(row: any) {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    supplierVerificationStatus: row.supplier_verification_status,
    supplierType: row.supplier_type,
    supplierMonthlyCapacity: row.supplier_monthly_capacity,
    categoryId: row.category_id,
    categoryName: row.category_name,
    categorySlug: row.category_slug,
    sku: row.sku,
    name: row.name,
    slug: row.slug,
    description: row.description,
    craftTechnique: row.craft_technique,
    materials: row.materials,
    originCity: row.origin_city,
    originState: row.origin_state,
    moq: row.moq,
    indicativePriceInr: row.indicative_price_inr,
    availableQty: row.available_qty,
    leadTimeDays: row.lead_time_days,
    customisationOptions: row.customisation_options,
    imageUrl: row.image_url,
    popularityScore: row.popularity_score,
    status: row.status,
    isDemo: Boolean(row.is_demo),
    createdAt: row.created_at,
  };
}

function mapOrderRow(o: any) {
  return {
    id: o.id,
    poNumber: o.po_number,
    rfqId: o.rfq_id,
    rfqCode: o.rfq_code,
    quotationId: o.quotation_id,
    quoteCode: o.quote_code,
    buyerId: o.buyer_id,
    buyerName: o.buyer_name,
    buyerCompany: o.buyer_company || o.buyer_name,
    supplierId: o.supplier_id,
    supplierName: o.supplier_name,
    supplierLocation: o.supplier_city ? `${o.supplier_city}, ${o.supplier_state}` : undefined,
    title: o.title,
    quantity: o.quantity,
    unitPriceInr: o.unit_price_inr,
    subtotalInr: o.subtotal_inr,
    shippingInr: o.shipping_inr,
    totalAmountInr: o.total_amount_inr,
    commissionRate: o.commission_rate,
    platformCommissionInr: o.platform_commission_inr,
    status: o.status,
    deliveryLocation: o.delivery_location,
    expectedDeliveryDate: o.expected_delivery_date,
    buyerApprovedAt: o.buyer_approved_at,
    supplierConfirmedAt: o.supplier_confirmed_at,
    paymentStatus: o.payment_status,
    paymentAdapterNote: o.payment_adapter_note,
    disputeReason: o.dispute_reason,
    isDemo: Boolean(o.is_demo),
    createdAt: o.created_at,
    updatedAt: o.updated_at,
  };
}

export function createApiRouter() {
  const router = express.Router();
  router.use(attachAuth);

  // =========================================================================
  // 1. AUTHENTICATION & DEMO ROLE ACCESS
  // =========================================================================
  const registerSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    fullName: z.string().min(2),
    role: z.enum(['buyer', 'supplier']),
    companyName: z.string().min(2),
    organizationType: z.string().min(2),
    city: z.string().min(2).default('Mumbai'),
    stateOrCountry: z.string().min(2).default('India'),
  });

  router.post('/auth/register', rateLimit(30), (req: Request, res: Response) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid registration details.', details: parsed.error.flatten() });
      return;
    }
    const d = parsed.data;
    const emailLower = d.email.toLowerCase().trim();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(emailLower);
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const userId = uuid();
    const now = nowIso();
    const hash = bcrypt.hashSync(d.password, 8);

    db.prepare(`
      INSERT INTO users (id, email, password_hash, role, full_name, status, is_demo, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', 0, ?, ?)
    `).run(userId, emailLower, hash, d.role, d.fullName.trim(), now, now);

    db.prepare(`
      INSERT INTO profiles (id, user_id, locale, created_at, updated_at)
      VALUES (?, ?, 'en-IN', ?, ?)
    `).run(uuid(), userId, now, now);

    if (d.role === 'buyer') {
      db.prepare(`
        INSERT INTO buyer_profiles (id, user_id, company_name, buyer_type, country, city, subscription_plan, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'standard', ?, ?)
      `).run(uuid(), userId, d.companyName.trim(), d.organizationType, d.stateOrCountry, d.city, now, now);
    } else {
      const supId = uuid();
      db.prepare(`
        INSERT INTO supplier_profiles (
          id, user_id, business_name, supplier_type, state, city, craft_heritage_summary,
          monthly_capacity_units, default_moq, default_lead_time_days, customisation_supported,
          export_ready, verification_status, is_demo, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 250, 50, 21, 1, 0, 'pending', 0, ?, ?)
      `).run(
        supId,
        userId,
        d.companyName.trim(),
        d.organizationType,
        d.stateOrCountry,
        d.city,
        `Artisan workshop established in ${d.city}, ${d.stateOrCountry}. Complete business profile in Supplier Settings.`,
        now,
        now,
      );
      db.prepare(`
        INSERT INTO supplier_verification (id, supplier_id, document_type, document_ref, submitted_notes, status, is_demo, created_at, updated_at)
        VALUES (?, ?, 'Initial Registration Profile', ?, 'New supplier onboarding application awaiting review.', 'pending', 0, ?, ?)
      `).run(uuid(), supId, `APP-${supId.slice(0, 6).toUpperCase()}`, now, now);
    }

    writeAuditLog({
      actorId: userId,
      actorRole: d.role,
      action: 'user_registered',
      entityType: 'user',
      entityId: userId,
      details: { email: emailLower, companyName: d.companyName },
    });

    const token = createSessionToken(userId);
    const user = hydrateAuthUser(userId);
    res.status(201).json({ token, user });
  });

  router.post('/auth/login', rateLimit(40), (req: Request, res: Response) => {
    const schema = z.object({ email: z.string().email(), password: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Please provide a valid email and password.' });
      return;
    }
    const userRow = db
      .prepare('SELECT * FROM users WHERE email = ?')
      .get(parsed.data.email.toLowerCase().trim()) as any;
    if (!userRow || !bcrypt.compareSync(parsed.data.password, userRow.password_hash)) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }
    if (userRow.status === 'suspended') {
      res.status(403).json({ error: 'This account is suspended. Contact Folkform operations.' });
      return;
    }

    const token = createSessionToken(userRow.id);
    const user = hydrateAuthUser(userRow.id);
    res.json({ token, user });
  });

  router.post('/auth/demo-login', rateLimit(60), (req: Request, res: Response) => {
    const schema = z.object({
      role: z.enum(['buyer', 'supplier', 'admin']).optional(),
      email: z.string().email().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid demo login request.' });
      return;
    }

    let email = parsed.data.email;
    if (!email) {
      if (parsed.data.role === 'supplier') email = 'supplier@folkform.demo';
      else if (parsed.data.role === 'admin') email = 'admin@folkform.demo';
      else email = 'buyer@folkform.demo';
    }

    const userRow = db.prepare('SELECT * FROM users WHERE email = ? AND is_demo = 1').get(email) as any;
    if (!userRow) {
      res.status(404).json({ error: 'Demo account not found.' });
      return;
    }

    const token = createSessionToken(userRow.id);
    const user = hydrateAuthUser(userRow.id);
    res.json({ token, user });
  });

  router.get('/auth/me', (req: AuthedRequest, res: Response) => {
    res.json({ user: req.authUser ?? null });
  });

  router.post('/auth/logout', (req: AuthedRequest, res: Response) => {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(header.slice(7).trim());
    }
    res.json({ ok: true });
  });

  // =========================================================================
  // 2. PUBLIC MARKETPLACE, CATEGORIES, CLUSTERS, PRODUCTS & SUPPLIERS
  // =========================================================================
  router.get('/public/summary', (_req: Request, res: Response) => {
    const stats = {
      clustersCount: (db.prepare('SELECT COUNT(*) as c FROM artisan_clusters').get() as any).c,
      categoriesCount: (db.prepare('SELECT COUNT(*) as c FROM product_categories').get() as any).c,
      productsCount: (db.prepare("SELECT COUNT(*) as c FROM products WHERE status = 'active'").get() as any).c,
      suppliersCount: (db.prepare('SELECT COUNT(*) as c FROM supplier_profiles').get() as any).c,
      rfqsCount: (db.prepare('SELECT COUNT(*) as c FROM rfqs').get() as any).c,
    };

    const categories = db
      .prepare(`
        SELECT pc.*, COUNT(p.id) as product_count
        FROM product_categories pc
        LEFT JOIN products p ON p.category_id = pc.id AND p.status = 'active'
        GROUP BY pc.id
        ORDER BY pc.display_order ASC
      `)
      .all()
      .map((c: any) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        description: c.description,
        imageUrl: c.image_url,
        displayOrder: c.display_order,
        productCount: c.product_count,
      }));

    const clusters = db
      .prepare(`
        SELECT ac.*,
          (SELECT COUNT(*) FROM supplier_profiles sp WHERE sp.cluster_id = ac.id) as supplier_count,
          (SELECT COUNT(*) FROM products p JOIN supplier_profiles sp ON sp.id = p.supplier_id WHERE sp.cluster_id = ac.id AND p.status = 'active') as product_count
        FROM artisan_clusters ac
        ORDER BY ac.name ASC
      `)
      .all()
      .map((c: any) => ({
        id: c.id,
        name: c.name,
        state: c.state,
        region: c.region,
        primaryCrafts: c.primary_crafts,
        artisanCountEst: c.artisan_count_est,
        description: c.description,
        mapX: c.map_x,
        mapY: c.map_y,
        supplierCount: c.supplier_count,
        productCount: c.product_count,
      }));

    const featuredProducts = db
      .prepare(`
        SELECT p.*, sp.business_name as supplier_name, sp.verification_status as supplier_verification_status,
          sp.supplier_type, sp.monthly_capacity_units as supplier_monthly_capacity,
          pc.name as category_name, pc.slug as category_slug
        FROM products p
        JOIN supplier_profiles sp ON sp.id = p.supplier_id
        JOIN product_categories pc ON pc.id = p.category_id
        WHERE p.status = 'active'
        ORDER BY p.popularity_score DESC
        LIMIT 6
      `)
      .all()
      .map(mapProductRow);

    const featuredSuppliers = db
      .prepare(`
        SELECT sp.*, ac.name as cluster_name,
          (SELECT COUNT(*) FROM products p WHERE p.supplier_id = sp.id AND p.status = 'active') as product_count,
          (SELECT p.image_url FROM products p WHERE p.supplier_id = sp.id AND p.status = 'active' ORDER BY p.popularity_score DESC LIMIT 1) as primary_image_url
        FROM supplier_profiles sp
        LEFT JOIN artisan_clusters ac ON ac.id = sp.cluster_id
        ORDER BY CASE WHEN sp.verification_status = 'approved' THEN 0 ELSE 1 END, sp.monthly_capacity_units DESC
        LIMIT 6
      `)
      .all()
      .map((s: any) => ({
        id: s.id,
        userId: s.user_id,
        businessName: s.business_name,
        supplierType: s.supplier_type,
        clusterId: s.cluster_id,
        clusterName: s.cluster_name,
        state: s.state,
        city: s.city,
        craftHeritageSummary: s.craft_heritage_summary,
        monthlyCapacityUnits: s.monthly_capacity_units,
        defaultMoq: s.default_moq,
        defaultLeadTimeDays: s.default_lead_time_days,
        customisationSupported: Boolean(s.customisation_supported),
        exportReady: Boolean(s.export_ready),
        verificationStatus: s.verification_status,
        isDemo: Boolean(s.is_demo),
        productCount: s.product_count,
        primaryImageUrl: s.primary_image_url,
      }));

    res.json({ stats, categories, clusters, featuredProducts, featuredSuppliers });
  });

  router.get('/categories', (_req: Request, res: Response) => {
    const categories = db
      .prepare(`
        SELECT pc.*, COUNT(p.id) as product_count
        FROM product_categories pc
        LEFT JOIN products p ON p.category_id = pc.id AND p.status = 'active'
        GROUP BY pc.id
        ORDER BY pc.display_order ASC
      `)
      .all()
      .map((c: any) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        description: c.description,
        imageUrl: c.image_url,
        displayOrder: c.display_order,
        productCount: c.product_count,
      }));
    res.json({ categories });
  });

  router.get('/clusters', (_req: Request, res: Response) => {
    const clusters = db
      .prepare(`
        SELECT ac.*,
          (SELECT COUNT(*) FROM supplier_profiles sp WHERE sp.cluster_id = ac.id) as supplier_count,
          (SELECT COUNT(*) FROM products p JOIN supplier_profiles sp ON sp.id = p.supplier_id WHERE sp.cluster_id = ac.id AND p.status = 'active') as product_count
        FROM artisan_clusters ac
        ORDER BY ac.name ASC
      `)
      .all()
      .map((c: any) => ({
        id: c.id,
        name: c.name,
        state: c.state,
        region: c.region,
        primaryCrafts: c.primary_crafts,
        artisanCountEst: c.artisan_count_est,
        description: c.description,
        mapX: c.map_x,
        mapY: c.map_y,
        supplierCount: c.supplier_count,
        productCount: c.product_count,
      }));
    res.json({ clusters });
  });

  router.get('/products', (req: Request, res: Response) => {
    const {
      q,
      category,
      state,
      material,
      technique,
      minPrice,
      maxPrice,
      maxMoq,
      verifiedOnly,
      supplierId,
      sort = 'popularity',
    } = req.query as Record<string, string | undefined>;

    const where: string[] = ["p.status = 'active'"];
    const params: any[] = [];

    if (q?.trim()) {
      const term = `%${q.trim().toLowerCase()}%`;
      where.push(
        '(LOWER(p.name) LIKE ? OR LOWER(p.description) LIKE ? OR LOWER(p.craft_technique) LIKE ? OR LOWER(p.materials) LIKE ? OR LOWER(p.origin_city) LIKE ? OR LOWER(p.origin_state) LIKE ? OR LOWER(sp.business_name) LIKE ?)',
      );
      params.push(term, term, term, term, term, term, term);
    }
    if (category && category !== 'all') {
      where.push('(pc.slug = ? OR pc.id = ?)');
      params.push(category, category);
    }
    if (state && state !== 'all') {
      where.push('LOWER(p.origin_state) = ?');
      params.push(state.toLowerCase());
    }
    if (material?.trim()) {
      where.push('LOWER(p.materials) LIKE ?');
      params.push(`%${material.trim().toLowerCase()}%`);
    }
    if (technique?.trim()) {
      where.push('LOWER(p.craft_technique) LIKE ?');
      params.push(`%${technique.trim().toLowerCase()}%`);
    }
    if (minPrice && !Number.isNaN(Number(minPrice))) {
      where.push('p.indicative_price_inr >= ?');
      params.push(Number(minPrice));
    }
    if (maxPrice && !Number.isNaN(Number(maxPrice))) {
      where.push('p.indicative_price_inr <= ?');
      params.push(Number(maxPrice));
    }
    if (maxMoq && !Number.isNaN(Number(maxMoq))) {
      where.push('p.moq <= ?');
      params.push(Number(maxMoq));
    }
    if (verifiedOnly === 'true') {
      where.push("sp.verification_status = 'approved'");
    }
    if (supplierId) {
      where.push('p.supplier_id = ?');
      params.push(supplierId);
    }

    let orderBy = 'p.popularity_score DESC, p.created_at DESC';
    if (sort === 'price_asc') orderBy = 'p.indicative_price_inr ASC';
    else if (sort === 'price_desc') orderBy = 'p.indicative_price_inr DESC';
    else if (sort === 'moq_asc') orderBy = 'p.moq ASC';
    else if (sort === 'relevance' && q?.trim()) orderBy = 'p.popularity_score DESC';

    const rows = db
      .prepare(`
        SELECT p.*, sp.business_name as supplier_name, sp.verification_status as supplier_verification_status,
          sp.supplier_type, sp.monthly_capacity_units as supplier_monthly_capacity,
          pc.name as category_name, pc.slug as category_slug
        FROM products p
        JOIN supplier_profiles sp ON sp.id = p.supplier_id
        JOIN product_categories pc ON pc.id = p.category_id
        WHERE ${where.join(' AND ')}
        ORDER BY ${orderBy}
      `)
      .all(...params) as any[];

    const states = (db.prepare("SELECT DISTINCT origin_state FROM products WHERE status = 'active' ORDER BY origin_state ASC").all() as any[]).map(
      (r) => r.origin_state,
    );

    res.json({ products: rows.map(mapProductRow), states });
  });

  router.get('/products/:id', (req: Request, res: Response) => {
    const row = db
      .prepare(`
        SELECT p.*, sp.business_name as supplier_name, sp.verification_status as supplier_verification_status,
          sp.supplier_type, sp.monthly_capacity_units as supplier_monthly_capacity,
          pc.name as category_name, pc.slug as category_slug
        FROM products p
        JOIN supplier_profiles sp ON sp.id = p.supplier_id
        JOIN product_categories pc ON pc.id = p.category_id
        WHERE p.id = ?
      `)
      .get(req.params.id) as any;

    if (!row) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }

    const specs = (
      db.prepare('SELECT id, spec_key, spec_value FROM product_specifications WHERE product_id = ?').all(row.id) as any[]
    ).map((s) => ({ id: s.id, specKey: s.spec_key, specValue: s.spec_value }));

    const gallery = (
      db.prepare('SELECT id, image_url, caption FROM product_images WHERE product_id = ? ORDER BY sort_order ASC').all(row.id) as any[]
    ).map((g) => ({ id: g.id, imageUrl: g.image_url, caption: g.caption }));

    const supplier = db
      .prepare(`
        SELECT sp.*, ac.name as cluster_name
        FROM supplier_profiles sp
        LEFT JOIN artisan_clusters ac ON ac.id = sp.cluster_id
        WHERE sp.id = ?
      `)
      .get(row.supplier_id) as any;

    const similar = db
      .prepare(`
        SELECT p.*, sp.business_name as supplier_name, sp.verification_status as supplier_verification_status,
          sp.supplier_type, sp.monthly_capacity_units as supplier_monthly_capacity,
          pc.name as category_name, pc.slug as category_slug
        FROM products p
        JOIN supplier_profiles sp ON sp.id = p.supplier_id
        JOIN product_categories pc ON pc.id = p.category_id
        WHERE p.category_id = ? AND p.id != ? AND p.status = 'active'
        ORDER BY p.popularity_score DESC
        LIMIT 3
      `)
      .all(row.category_id, row.id)
      .map(mapProductRow);

    res.json({
      product: {
        ...mapProductRow(row),
        specifications: specs,
        gallery: gallery.length > 0 ? gallery : [{ id: 'primary', imageUrl: row.image_url, caption: row.name }],
      },
      supplier: supplier
        ? {
            id: supplier.id,
            userId: supplier.user_id,
            businessName: supplier.business_name,
            supplierType: supplier.supplier_type,
            clusterId: supplier.cluster_id,
            clusterName: supplier.cluster_name,
            state: supplier.state,
            city: supplier.city,
            address: supplier.address,
            craftHeritageSummary: supplier.craft_heritage_summary,
            monthlyCapacityUnits: supplier.monthly_capacity_units,
            defaultMoq: supplier.default_moq,
            defaultLeadTimeDays: supplier.default_lead_time_days,
            customisationSupported: Boolean(supplier.customisation_supported),
            exportReady: Boolean(supplier.export_ready),
            verificationStatus: supplier.verification_status,
            isDemo: Boolean(supplier.is_demo),
          }
        : null,
      similarProducts: similar,
    });
  });

  router.get('/suppliers', (req: Request, res: Response) => {
    const { state, clusterId, q, verifiedOnly } = req.query as Record<string, string | undefined>;
    const where: string[] = ['1=1'];
    const params: any[] = [];

    if (state && state !== 'all') {
      where.push('LOWER(sp.state) = ?');
      params.push(state.toLowerCase());
    }
    if (clusterId && clusterId !== 'all') {
      where.push('sp.cluster_id = ?');
      params.push(clusterId);
    }
    if (verifiedOnly === 'true') {
      where.push("sp.verification_status = 'approved'");
    }
    if (q?.trim()) {
      const term = `%${q.trim().toLowerCase()}%`;
      where.push('(LOWER(sp.business_name) LIKE ? OR LOWER(sp.city) LIKE ? OR LOWER(sp.state) LIKE ? OR LOWER(sp.craft_heritage_summary) LIKE ?)');
      params.push(term, term, term, term);
    }

    const rows = db
      .prepare(`
        SELECT sp.*, ac.name as cluster_name,
          (SELECT COUNT(*) FROM products p WHERE p.supplier_id = sp.id AND p.status = 'active') as product_count,
          (SELECT p.image_url FROM products p WHERE p.supplier_id = sp.id AND p.status = 'active' ORDER BY p.popularity_score DESC LIMIT 1) as primary_image_url
        FROM supplier_profiles sp
        LEFT JOIN artisan_clusters ac ON ac.id = sp.cluster_id
        WHERE ${where.join(' AND ')}
        ORDER BY CASE WHEN sp.verification_status = 'approved' THEN 0 ELSE 1 END, sp.monthly_capacity_units DESC
      `)
      .all(...params) as any[];

    const caps = db
      .prepare(`
        SELECT sc.supplier_id, pc.name as category_name
        FROM supplier_capabilities sc
        JOIN product_categories pc ON pc.id = sc.category_id
      `)
      .all() as any[];

    const suppliers = rows.map((s) => ({
      id: s.id,
      userId: s.user_id,
      businessName: s.business_name,
      supplierType: s.supplier_type,
      clusterId: s.cluster_id,
      clusterName: s.cluster_name,
      state: s.state,
      city: s.city,
      address: s.address,
      craftHeritageSummary: s.craft_heritage_summary,
      monthlyCapacityUnits: s.monthly_capacity_units,
      defaultMoq: s.default_moq,
      defaultLeadTimeDays: s.default_lead_time_days,
      customisationSupported: Boolean(s.customisation_supported),
      exportReady: Boolean(s.export_ready),
      verificationStatus: s.verification_status,
      isDemo: Boolean(s.is_demo),
      productCount: s.product_count,
      primaryImageUrl: s.primary_image_url,
      categories: Array.from(new Set(caps.filter((c) => c.supplier_id === s.id).map((c) => c.category_name))),
    }));

    res.json({ suppliers });
  });

  router.get('/suppliers/:id', (req: Request, res: Response) => {
    const s = db
      .prepare(`
        SELECT sp.*, ac.name as cluster_name, u.full_name as contact_name
        FROM supplier_profiles sp
        JOIN users u ON u.id = sp.user_id
        LEFT JOIN artisan_clusters ac ON ac.id = sp.cluster_id
        WHERE sp.id = ?
      `)
      .get(req.params.id) as any;

    if (!s) {
      res.status(404).json({ error: 'Supplier profile not found.' });
      return;
    }

    const capabilities = (
      db
        .prepare(`
          SELECT sc.*, pc.name as category_name
          FROM supplier_capabilities sc
          JOIN product_categories pc ON pc.id = sc.category_id
          WHERE sc.supplier_id = ?
        `)
        .all(s.id) as any[]
    ).map((c) => ({
      id: c.id,
      supplierId: c.supplier_id,
      categoryId: c.category_id,
      categoryName: c.category_name,
      craftTechnique: c.craft_technique,
      materialSpecialty: c.material_specialty,
      minMoq: c.min_moq,
      maxMonthlyCapacity: c.max_monthly_capacity,
      avgLeadTimeDays: c.avg_lead_time_days,
      supportsCustomisation: Boolean(c.supports_customisation),
      notes: c.notes,
    }));

    const products = db
      .prepare(`
        SELECT p.*, sp.business_name as supplier_name, sp.verification_status as supplier_verification_status,
          sp.supplier_type, sp.monthly_capacity_units as supplier_monthly_capacity,
          pc.name as category_name, pc.slug as category_slug
        FROM products p
        JOIN supplier_profiles sp ON sp.id = p.supplier_id
        JOIN product_categories pc ON pc.id = p.category_id
        WHERE p.supplier_id = ? AND p.status = 'active'
        ORDER BY p.popularity_score DESC
      `)
      .all(s.id)
      .map(mapProductRow);

    const verification = db
      .prepare('SELECT * FROM supplier_verification WHERE supplier_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(s.id) as any;

    res.json({
      supplier: {
        id: s.id,
        userId: s.user_id,
        contactName: s.contact_name,
        businessName: s.business_name,
        supplierType: s.supplier_type,
        clusterId: s.cluster_id,
        clusterName: s.cluster_name,
        state: s.state,
        city: s.city,
        address: s.address,
        craftHeritageSummary: s.craft_heritage_summary,
        monthlyCapacityUnits: s.monthly_capacity_units,
        defaultMoq: s.default_moq,
        defaultLeadTimeDays: s.default_lead_time_days,
        customisationSupported: Boolean(s.customisation_supported),
        exportReady: Boolean(s.export_ready),
        verificationStatus: s.verification_status,
        isDemo: Boolean(s.is_demo),
        capabilities,
      },
      verification: verification
        ? {
            documentType: verification.document_type,
            documentRef: verification.document_ref,
            status: verification.status,
            reviewNotes: verification.review_notes,
            isDemo: Boolean(verification.is_demo),
          }
        : null,
      products,
    });
  });

  // =========================================================================
  // 3. SAVED PRODUCTS & SUPPLIERS
  // =========================================================================
  router.get('/saved', requireAuth, (req: AuthedRequest, res: Response) => {
    const uid = req.authUser!.id;
    const products = db
      .prepare(`
        SELECT p.*, sp.business_name as supplier_name, sp.verification_status as supplier_verification_status,
          sp.supplier_type, sp.monthly_capacity_units as supplier_monthly_capacity,
          pc.name as category_name, pc.slug as category_slug
        FROM saved_products sv
        JOIN products p ON p.id = sv.product_id
        JOIN supplier_profiles sp ON sp.id = p.supplier_id
        JOIN product_categories pc ON pc.id = p.category_id
        WHERE sv.user_id = ?
        ORDER BY sv.created_at DESC
      `)
      .all(uid)
      .map(mapProductRow);

    const suppliers = db
      .prepare(`
        SELECT sp.*, ac.name as cluster_name
        FROM saved_suppliers sv
        JOIN supplier_profiles sp ON sp.id = sv.supplier_id
        LEFT JOIN artisan_clusters ac ON ac.id = sp.cluster_id
        WHERE sv.user_id = ?
        ORDER BY sv.created_at DESC
      `)
      .all(uid)
      .map((s: any) => ({
        id: s.id,
        userId: s.user_id,
        businessName: s.business_name,
        supplierType: s.supplier_type,
        clusterName: s.cluster_name,
        state: s.state,
        city: s.city,
        craftHeritageSummary: s.craft_heritage_summary,
        monthlyCapacityUnits: s.monthly_capacity_units,
        defaultMoq: s.default_moq,
        defaultLeadTimeDays: s.default_lead_time_days,
        customisationSupported: Boolean(s.customisation_supported),
        exportReady: Boolean(s.export_ready),
        verificationStatus: s.verification_status,
        isDemo: Boolean(s.is_demo),
      }));

    res.json({ products, suppliers });
  });

  router.post('/saved/products/:id', requireAuth, (req: AuthedRequest, res: Response) => {
    const uid = req.authUser!.id;
    const pid = req.params.id;
    const existing = db.prepare('SELECT id FROM saved_products WHERE user_id = ? AND product_id = ?').get(uid, pid);
    if (existing) {
      db.prepare('DELETE FROM saved_products WHERE user_id = ? AND product_id = ?').run(uid, pid);
      res.json({ saved: false });
    } else {
      db.prepare('INSERT INTO saved_products (id, user_id, product_id, created_at) VALUES (?, ?, ?, ?)').run(
        uuid(),
        uid,
        pid,
        nowIso(),
      );
      res.json({ saved: true });
    }
  });

  router.post('/saved/suppliers/:id', requireAuth, (req: AuthedRequest, res: Response) => {
    const uid = req.authUser!.id;
    const sid = req.params.id;
    const existing = db.prepare('SELECT id FROM saved_suppliers WHERE user_id = ? AND supplier_id = ?').get(uid, sid);
    if (existing) {
      db.prepare('DELETE FROM saved_suppliers WHERE user_id = ? AND supplier_id = ?').run(uid, sid);
      res.json({ saved: false });
    } else {
      db.prepare('INSERT INTO saved_suppliers (id, user_id, supplier_id, created_at) VALUES (?, ?, ?, ?)').run(
        uuid(),
        uid,
        sid,
        nowIso(),
      );
      res.json({ saved: true });
    }
  });

  // =========================================================================
  // 4. FOLKFORM SOURCING INTELLIGENCE (MULTI-AGENT AI WORKFLOWS)
  // =========================================================================
  router.post('/ai/sourcing', requireAuth, rateLimit(20), async (req: AuthedRequest, res: Response) => {
    const schema = z.object({
      prompt: z.string().min(10, 'Please describe your sourcing requirement in at least 10 characters.'),
      weights: z
        .object({
          categoryRelevance: z.number().min(0).max(50),
          craftTechnique: z.number().min(0).max(50),
          materials: z.number().min(0).max(50),
          geographicPreference: z.number().min(0).max(50),
          moqCompatibility: z.number().min(0).max(50),
          capacityCompatibility: z.number().min(0).max(50),
          leadTimeCompatibility: z.number().min(0).max(50),
          customisationAbility: z.number().min(0).max(50),
        })
        .optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid sourcing brief.' });
      return;
    }

    try {
      const result = await runSourcingWorkflow({
        userId: req.authUser!.id,
        rawPrompt: parsed.data.prompt.trim(),
        weights: parsed.data.weights,
      });

      writeAuditLog({
        actorId: req.authUser!.id,
        actorRole: req.authUser!.role,
        action: 'ai_sourcing_workflow_executed',
        entityType: 'agent_workflow',
        entityId: result.workflowId,
        details: { shortlistCount: result.shortlist.length, providerUsed: result.providerUsed },
      });

      res.json({ workflow: result });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Sourcing workflow failed.' });
    }
  });

  router.post('/ai/workflows/:id/rescore', requireAuth, (req: AuthedRequest, res: Response) => {
    const wf = db.prepare('SELECT * FROM agent_workflows WHERE id = ?').get(req.params.id) as any;
    if (!wf) {
      res.status(404).json({ error: 'Workflow not found.' });
      return;
    }
    const weights: ScoringWeights = { ...DEFAULT_SCORING_WEIGHTS, ...(req.body?.weights ?? {}) };
    const spec = JSON.parse(wf.extracted_spec_json);
    const { shortlist, insufficientNotice } = scoreSuppliersForSpec(spec, wf.raw_prompt, weights);

    db.prepare('UPDATE agent_workflows SET shortlist_json = ?, updated_at = ? WHERE id = ?').run(
      JSON.stringify(shortlist),
      nowIso(),
      wf.id,
    );
    res.json({ shortlist, insufficientMatchesNotice: insufficientNotice });
  });

  router.post('/ai/provenance-draft', requireRole('supplier', 'admin'), async (req: AuthedRequest, res: Response) => {
    const schema = z.object({
      productName: z.string().min(2),
      originCity: z.string().min(2),
      originState: z.string().min(2),
      materials: z.string().min(2),
      craftTechnique: z.string().min(2),
      customisationOptions: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Provide product name, origin, materials, and craft technique.' });
      return;
    }
    const draft = await draftProvenanceDescription({
      userId: req.authUser!.id,
      ...parsed.data,
    });
    res.json(draft);
  });

  router.post('/ai/fulfilment-check', requireRole('admin', 'buyer', 'supplier'), (req: AuthedRequest, res: Response) => {
    const report = runFulfilmentScan(req.authUser!.id);
    res.json(report);
  });

  // =========================================================================
  // 5. RFQs & SUPPLIER MATCHING
  // =========================================================================
  router.get('/rfqs', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = req.authUser!;
    let rows: any[] = [];

    if (user.role === 'buyer') {
      rows = db
        .prepare(`
          SELECT r.*, pc.name as category_name, u.full_name as buyer_name, bp.company_name as buyer_company
          FROM rfqs r
          LEFT JOIN product_categories pc ON pc.id = r.category_id
          JOIN users u ON u.id = r.buyer_id
          LEFT JOIN buyer_profiles bp ON bp.user_id = r.buyer_id
          WHERE r.buyer_id = ?
          ORDER BY r.created_at DESC
        `)
        .all(user.id) as any[];
    } else if (user.role === 'supplier' && user.supplierProfile) {
      const supId = user.supplierProfile.id;
      rows = db
        .prepare(`
          SELECT DISTINCT r.*, pc.name as category_name, u.full_name as buyer_name, bp.company_name as buyer_company
          FROM rfqs r
          LEFT JOIN product_categories pc ON pc.id = r.category_id
          JOIN users u ON u.id = r.buyer_id
          LEFT JOIN buyer_profiles bp ON bp.user_id = r.buyer_id
          LEFT JOIN rfq_supplier_matches rsm ON rsm.rfq_id = r.id
          LEFT JOIN supplier_capabilities sc ON sc.category_id = r.category_id AND sc.supplier_id = ?
          WHERE rsm.supplier_id = ? OR sc.supplier_id = ?
          ORDER BY r.created_at DESC
        `)
        .all(supId, supId, supId) as any[];
    } else {
      rows = db
        .prepare(`
          SELECT r.*, pc.name as category_name, u.full_name as buyer_name, bp.company_name as buyer_company
          FROM rfqs r
          LEFT JOIN product_categories pc ON pc.id = r.category_id
          JOIN users u ON u.id = r.buyer_id
          LEFT JOIN buyer_profiles bp ON bp.user_id = r.buyer_id
          ORDER BY r.created_at DESC
        `)
        .all() as any[];
    }

    const rfqs = rows.map((r) => {
      const matches = db
        .prepare(`
          SELECT rsm.*, sp.business_name as supplier_name, sp.city, sp.state, sp.supplier_type,
            sp.verification_status, sp.monthly_capacity_units, sp.default_moq, sp.default_lead_time_days,
            sp.customisation_supported
          FROM rfq_supplier_matches rsm
          JOIN supplier_profiles sp ON sp.id = rsm.supplier_id
          WHERE rsm.rfq_id = ?
          ORDER BY rsm.overall_score DESC
        `)
        .all(r.id) as any[];

      const quotesQuery =
        user.role === 'supplier' && user.supplierProfile
          ? db
              .prepare(`
                SELECT q.*, sp.business_name as supplier_name, sp.city as supplier_city, sp.state as supplier_state,
                  sp.verification_status as supplier_verification_status, sp.monthly_capacity_units as supplier_monthly_capacity
                FROM quotations q
                JOIN supplier_profiles sp ON sp.id = q.supplier_id
                WHERE q.rfq_id = ? AND q.supplier_id = ?
                ORDER BY q.created_at DESC
              `)
              .all(r.id, user.supplierProfile.id)
          : db
              .prepare(`
                SELECT q.*, sp.business_name as supplier_name, sp.city as supplier_city, sp.state as supplier_state,
                  sp.verification_status as supplier_verification_status, sp.monthly_capacity_units as supplier_monthly_capacity
                FROM quotations q
                JOIN supplier_profiles sp ON sp.id = q.supplier_id
                WHERE q.rfq_id = ?
                ORDER BY q.total_landed_cost_inr ASC
              `)
              .all(r.id);

      const quotations = (quotesQuery as any[]).map((q) => ({
        id: q.id,
        quoteCode: q.quote_code,
        rfqId: q.rfq_id,
        rfqCode: r.rfq_code,
        rfqTitle: r.title,
        rfqQuantity: r.quantity,
        supplierId: q.supplier_id,
        supplierName: q.supplier_name,
        supplierCity: q.supplier_city,
        supplierState: q.supplier_state,
        supplierVerificationStatus: q.supplier_verification_status,
        supplierMonthlyCapacity: q.supplier_monthly_capacity,
        unitPriceInr: q.unit_price_inr,
        totalProductCostInr: q.total_product_cost_inr,
        moq: q.moq,
        availableCapacity: q.available_capacity,
        estimatedProductionDays: q.estimated_production_days,
        shippingEstimateInr: q.shipping_estimate_inr,
        totalLandedCostInr: q.total_landed_cost_inr,
        customisationNotes: q.customisation_notes,
        conditions: q.conditions,
        validityDays: q.validity_days,
        status: q.status,
        isSaved: Boolean(q.is_saved),
        isDemo: Boolean(q.is_demo),
        createdAt: q.created_at,
      }));

      return {
        id: r.id,
        rfqCode: r.rfq_code,
        buyerId: r.buyer_id,
        buyerName: r.buyer_name,
        buyerCompany: r.buyer_company || r.buyer_name,
        title: r.title,
        categoryId: r.category_id,
        categoryName: r.category_name || 'General Craft',
        description: r.description,
        quantity: r.quantity,
        targetUnitPriceInr: r.target_unit_price_inr,
        budgetMinInr: r.budget_min_inr,
        budgetMaxInr: r.budget_max_inr,
        preferredMaterials: r.preferred_materials,
        craftTechnique: r.craft_technique,
        customisationRequirements: r.customisation_requirements,
        moqPreference: r.moq_preference,
        deliveryLocation: r.delivery_location,
        requiredDeliveryDate: r.required_delivery_date,
        requiredLeadDays: r.required_lead_days,
        shippingRequirements: r.shipping_requirements,
        additionalInstructions: r.additional_instructions,
        status: r.status,
        selectedSupplierId: r.selected_supplier_id,
        aiWorkflowId: r.ai_workflow_id,
        isDemo: Boolean(r.is_demo),
        suppliersContactedCount: matches.length,
        quotationsReceivedCount: quotations.length,
        matchedSuppliers: matches.map((m) => ({
          id: m.id,
          supplierId: m.supplier_id,
          supplierName: m.supplier_name,
          city: m.city,
          state: m.state,
          supplierType: m.supplier_type,
          verificationStatus: m.verification_status,
          monthlyCapacityUnits: m.monthly_capacity_units,
          defaultMoq: m.default_moq,
          defaultLeadTimeDays: m.default_lead_time_days,
          customisationSupported: Boolean(m.customisation_supported),
          overallScore: m.overall_score,
          dimensions: JSON.parse(m.dimension_scores_json || '[]'),
          missingRequirements: JSON.parse(m.missing_requirements_json || '[]'),
          potentialConcerns: JSON.parse(m.potential_concerns_json || '[]'),
          recommendationReason: m.recommendation_reason,
          matchedProducts: [],
          indicativeUnitRangeInr: null,
          estimatedTotalInr: null,
          status: m.status,
        })),
        quotations,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    });

    res.json({ rfqs });
  });

  router.post('/rfqs', requireRole('buyer', 'admin'), (req: AuthedRequest, res: Response) => {
    const schema = z.object({
      title: z.string().min(4),
      categorySlugOrId: z.string().optional(),
      description: z.string().min(10),
      quantity: z.coerce.number().int().positive(),
      targetUnitPriceInr: z.coerce.number().positive().optional().nullable(),
      budgetMinInr: z.coerce.number().positive().optional().nullable(),
      budgetMaxInr: z.coerce.number().positive().optional().nullable(),
      preferredMaterials: z.string().optional(),
      craftTechnique: z.string().optional(),
      customisationRequirements: z.string().optional(),
      moqPreference: z.coerce.number().int().positive().optional().nullable(),
      deliveryLocation: z.string().min(2),
      requiredDeliveryDate: z.string().optional().nullable(),
      requiredLeadDays: z.coerce.number().int().positive().optional().nullable(),
      shippingRequirements: z.string().optional(),
      additionalInstructions: z.string().optional(),
      invitedSupplierIds: z.array(z.string()).optional(),
      aiWorkflowId: z.string().optional().nullable(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Please complete all required RFQ fields.', details: parsed.error.flatten() });
      return;
    }
    const d = parsed.data;
    const rfqId = uuid();
    const now = nowIso();
    const count = (db.prepare('SELECT COUNT(*) as c FROM rfqs').get() as any).c;
    const rfqCode = `RFQ-2026-${String(count + 1).padStart(3, '0')}`;

    let categoryId: string | null = null;
    if (d.categorySlugOrId) {
      const cat = db
        .prepare('SELECT id FROM product_categories WHERE id = ? OR slug = ?')
        .get(d.categorySlugOrId, d.categorySlugOrId) as { id: string } | undefined;
      categoryId = cat?.id ?? null;
    }

    // Determine invited suppliers (either explicitly picked by buyer or matched from DB)
    let supplierIds = d.invitedSupplierIds?.filter(Boolean) ?? [];
    if (supplierIds.length === 0 && categoryId) {
      const capSups = db
        .prepare('SELECT DISTINCT supplier_id FROM supplier_capabilities WHERE category_id = ? LIMIT 4')
        .all(categoryId) as { supplier_id: string }[];
      supplierIds = capSups.map((s) => s.supplier_id);
    }
    if (supplierIds.length === 0) {
      const fallbackSups = db.prepare('SELECT id FROM supplier_profiles LIMIT 3').all() as { id: string }[];
      supplierIds = fallbackSups.map((s) => s.id);
    }

    const status = supplierIds.length > 0 ? 'supplier_contacted' : 'submitted';

    db.prepare(`
      INSERT INTO rfqs (
        id, rfq_code, buyer_id, title, category_id, description, quantity,
        target_unit_price_inr, budget_min_inr, budget_max_inr, preferred_materials,
        craft_technique, customisation_requirements, moq_preference, delivery_location,
        required_delivery_date, required_lead_days, shipping_requirements, additional_instructions,
        status, ai_workflow_id, is_demo, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      rfqId,
      rfqCode,
      req.authUser!.id,
      d.title.trim(),
      categoryId,
      d.description.trim(),
      d.quantity,
      d.targetUnitPriceInr ?? d.budgetMaxInr ?? null,
      d.budgetMinInr ?? null,
      d.budgetMaxInr ?? null,
      d.preferredMaterials ?? null,
      d.craftTechnique ?? null,
      d.customisationRequirements ?? null,
      d.moqPreference ?? null,
      d.deliveryLocation.trim(),
      d.requiredDeliveryDate ?? null,
      d.requiredLeadDays ?? null,
      d.shippingRequirements ?? null,
      d.additionalInstructions ?? null,
      status,
      d.aiWorkflowId ?? null,
      req.authUser!.isDemo ? 1 : 0,
      now,
      now,
    );

    if (d.preferredMaterials) {
      db.prepare('INSERT INTO rfq_requirements (id, rfq_id, req_key, req_value, priority, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
        uuid(), rfqId, 'Materials', d.preferredMaterials, 'required', now,
      );
    }
    if (d.craftTechnique) {
      db.prepare('INSERT INTO rfq_requirements (id, rfq_id, req_key, req_value, priority, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
        uuid(), rfqId, 'Craft Technique', d.craftTechnique, 'required', now,
      );
    }

    const insertMatch = db.prepare(`
      INSERT INTO rfq_supplier_matches (
        id, rfq_id, supplier_id, overall_score, dimension_scores_json,
        missing_requirements_json, potential_concerns_json, recommendation_reason,
        match_source, invited_at, status, created_at
      ) VALUES (?, ?, ?, ?, '[]', '[]', '[]', ?, ?, ?, 'invited', ?)
    `);

    for (const supId of supplierIds) {
      const sup = db.prepare('SELECT id, user_id, business_name FROM supplier_profiles WHERE id = ?').get(supId) as any;
      if (!sup) continue;
      insertMatch.run(
        uuid(),
        rfqId,
        sup.id,
        88,
        d.aiWorkflowId
          ? 'Buyer confirmed AI Sourcing Intelligence shortlist invitation.'
          : 'Invited directly by buyer during RFQ submission.',
        d.aiWorkflowId ? 'ai_engine' : 'buyer_selected',
        now,
        now,
      );
      createNotification({
        userId: sup.user_id,
        type: 'new_rfq',
        title: `New Bulk RFQ: ${rfqCode}`,
        message: `${req.authUser!.buyerProfile?.companyName || req.authUser!.fullName} requested ${d.quantity} units of "${d.title}".`,
        linkPath: '/supplier/rfqs',
      });
    }

    if (d.aiWorkflowId) {
      db.prepare(`
        UPDATE agent_workflows
        SET rfq_id = ?, human_approval_status = 'confirmed_rfq_submitted', updated_at = ?
        WHERE id = ?
      `).run(rfqId, now, d.aiWorkflowId);
    }

    writeAuditLog({
      actorId: req.authUser!.id,
      actorRole: req.authUser!.role,
      action: 'rfq_created',
      entityType: 'rfq',
      entityId: rfqId,
      details: { rfqCode, quantity: d.quantity, invitedSuppliers: supplierIds.length },
    });

    res.status(201).json({ id: rfqId, rfqCode, invitedSuppliersCount: supplierIds.length });
  });

  // =========================================================================
  // 6. QUOTATIONS & COMPARISON WORKSPACE ACTIONS
  // =========================================================================
  router.get('/quotations', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = req.authUser!;
    let rows: any[] = [];
    if (user.role === 'supplier' && user.supplierProfile) {
      rows = db
        .prepare(`
          SELECT q.*, r.rfq_code, r.title as rfq_title, r.quantity as rfq_quantity,
            sp.business_name as supplier_name, sp.city as supplier_city, sp.state as supplier_state,
            sp.verification_status as supplier_verification_status, sp.monthly_capacity_units as supplier_monthly_capacity
          FROM quotations q
          JOIN rfqs r ON r.id = q.rfq_id
          JOIN supplier_profiles sp ON sp.id = q.supplier_id
          WHERE q.supplier_id = ?
          ORDER BY q.created_at DESC
        `)
        .all(user.supplierProfile.id) as any[];
    } else if (user.role === 'buyer') {
      rows = db
        .prepare(`
          SELECT q.*, r.rfq_code, r.title as rfq_title, r.quantity as rfq_quantity,
            sp.business_name as supplier_name, sp.city as supplier_city, sp.state as supplier_state,
            sp.verification_status as supplier_verification_status, sp.monthly_capacity_units as supplier_monthly_capacity
          FROM quotations q
          JOIN rfqs r ON r.id = q.rfq_id
          JOIN supplier_profiles sp ON sp.id = q.supplier_id
          WHERE r.buyer_id = ?
          ORDER BY q.created_at DESC
        `)
        .all(user.id) as any[];
    } else {
      rows = db
        .prepare(`
          SELECT q.*, r.rfq_code, r.title as rfq_title, r.quantity as rfq_quantity,
            sp.business_name as supplier_name, sp.city as supplier_city, sp.state as supplier_state,
            sp.verification_status as supplier_verification_status, sp.monthly_capacity_units as supplier_monthly_capacity
          FROM quotations q
          JOIN rfqs r ON r.id = q.rfq_id
          JOIN supplier_profiles sp ON sp.id = q.supplier_id
          ORDER BY q.created_at DESC
        `)
        .all() as any[];
    }

    res.json({
      quotations: rows.map((q) => ({
        id: q.id,
        quoteCode: q.quote_code,
        rfqId: q.rfq_id,
        rfqCode: q.rfq_code,
        rfqTitle: q.rfq_title,
        rfqQuantity: q.rfq_quantity,
        supplierId: q.supplier_id,
        supplierName: q.supplier_name,
        supplierCity: q.supplier_city,
        supplierState: q.supplier_state,
        supplierVerificationStatus: q.supplier_verification_status,
        supplierMonthlyCapacity: q.supplier_monthly_capacity,
        unitPriceInr: q.unit_price_inr,
        totalProductCostInr: q.total_product_cost_inr,
        moq: q.moq,
        availableCapacity: q.available_capacity,
        estimatedProductionDays: q.estimated_production_days,
        shippingEstimateInr: q.shipping_estimate_inr,
        totalLandedCostInr: q.total_landed_cost_inr,
        customisationNotes: q.customisation_notes,
        conditions: q.conditions,
        validityDays: q.validity_days,
        status: q.status,
        isSaved: Boolean(q.is_saved),
        isDemo: Boolean(q.is_demo),
        createdAt: q.created_at,
      })),
    });
  });

  router.post('/quotations', requireRole('supplier'), (req: AuthedRequest, res: Response) => {
    const schema = z.object({
      rfqId: z.string().min(1),
      unitPriceInr: z.coerce.number().positive(),
      moq: z.coerce.number().int().positive(),
      availableCapacity: z.coerce.number().int().positive(),
      estimatedProductionDays: z.coerce.number().int().positive(),
      shippingEstimateInr: z.coerce.number().min(0).default(0),
      customisationNotes: z.string().optional(),
      conditions: z.string().optional(),
      validityDays: z.coerce.number().int().positive().default(21),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Please complete all quotation pricing and capacity fields.' });
      return;
    }

    const sup = req.authUser!.supplierProfile;
    if (!sup) {
      res.status(400).json({ error: 'Supplier business profile required.' });
      return;
    }

    const rfq = db.prepare('SELECT * FROM rfqs WHERE id = ?').get(parsed.data.rfqId) as any;
    if (!rfq) {
      res.status(404).json({ error: 'RFQ not found.' });
      return;
    }

    const d = parsed.data;
    const quoteId = uuid();
    const now = nowIso();
    const count = (db.prepare('SELECT COUNT(*) as c FROM quotations').get() as any).c;
    const quoteCode = `QT-2026-${String(count + 101).padStart(3, '0')}`;
    const productTotal = d.unitPriceInr * rfq.quantity;
    const landedTotal = productTotal + d.shippingEstimateInr;

    db.prepare(`
      INSERT INTO quotations (
        id, quote_code, rfq_id, supplier_id, unit_price_inr, total_product_cost_inr,
        moq, available_capacity, estimated_production_days, shipping_estimate_inr,
        total_landed_cost_inr, customisation_notes, conditions, validity_days,
        status, is_saved, is_demo, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', 0, ?, ?, ?)
    `).run(
      quoteId,
      quoteCode,
      rfq.id,
      sup.id,
      d.unitPriceInr,
      productTotal,
      d.moq,
      d.availableCapacity,
      d.estimatedProductionDays,
      d.shippingEstimateInr,
      landedTotal,
      d.customisationNotes ?? null,
      d.conditions ?? null,
      d.validityDays,
      req.authUser!.isDemo ? 1 : 0,
      now,
      now,
    );

    db.prepare(`
      INSERT INTO quotation_items (id, quotation_id, item_description, quantity, unit_price_inr, line_total_inr, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(uuid(), quoteId, rfq.title, rfq.quantity, d.unitPriceInr, productTotal, now);

    db.prepare("UPDATE rfqs SET status = 'quotation_received', updated_at = ? WHERE id = ? AND status IN ('submitted','supplier_contacted')").run(
      now,
      rfq.id,
    );
    db.prepare("UPDATE rfq_supplier_matches SET status = 'quoted' WHERE rfq_id = ? AND supplier_id = ?").run(rfq.id, sup.id);

    createNotification({
      userId: rfq.buyer_id,
      type: 'new_quotation',
      title: `New Quotation ${quoteCode} Received`,
      message: `${sup.businessName} quoted ₹${d.unitPriceInr.toLocaleString('en-IN')}/unit (${d.estimatedProductionDays} days) for ${rfq.rfq_code}.`,
      linkPath: '/buyer/compare',
    });

    writeAuditLog({
      actorId: req.authUser!.id,
      actorRole: 'supplier',
      action: 'quotation_submitted',
      entityType: 'quotation',
      entityId: quoteId,
      details: { quoteCode, rfqCode: rfq.rfq_code, unitPriceInr: d.unitPriceInr },
    });

    res.status(201).json({ id: quoteId, quoteCode, totalLandedCostInr: landedTotal });
  });

  router.patch('/quotations/:id/action', requireRole('buyer', 'admin'), (req: AuthedRequest, res: Response) => {
    const schema = z.object({
      action: z.enum(['save', 'unsave', 'request_revision', 'reject']),
      note: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid quotation action.' });
      return;
    }

    const q = db
      .prepare(`
        SELECT q.*, r.buyer_id, r.rfq_code, r.title as rfq_title, sp.user_id as supplier_user_id, sp.business_name as supplier_name
        FROM quotations q
        JOIN rfqs r ON r.id = q.rfq_id
        JOIN supplier_profiles sp ON sp.id = q.supplier_id
        WHERE q.id = ?
      `)
      .get(req.params.id) as any;

    if (!q) {
      res.status(404).json({ error: 'Quotation not found.' });
      return;
    }
    if (req.authUser!.role === 'buyer' && q.buyer_id !== req.authUser!.id) {
      res.status(403).json({ error: 'You can only act on quotations for your own RFQs.' });
      return;
    }

    const now = nowIso();
    const { action, note } = parsed.data;
    if (action === 'save' || action === 'unsave') {
      db.prepare('UPDATE quotations SET is_saved = ?, updated_at = ? WHERE id = ?').run(action === 'save' ? 1 : 0, now, q.id);
    } else if (action === 'request_revision') {
      db.prepare("UPDATE quotations SET status = 'clarification_requested', updated_at = ? WHERE id = ?").run(now, q.id);
      db.prepare("UPDATE rfqs SET status = 'negotiation', updated_at = ? WHERE id = ?").run(now, q.rfq_id);

      // Ensure an RFQ conversation thread exists & append the revision request
      let conv = db
        .prepare('SELECT id FROM conversations WHERE buyer_id = ? AND supplier_id = ? AND rfq_id = ?')
        .get(q.buyer_id, q.supplier_id, q.rfq_id) as { id: string } | undefined;
      if (!conv) {
        const cid = uuid();
        db.prepare(`
          INSERT INTO conversations (id, buyer_id, supplier_id, rfq_id, subject, last_message_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(cid, q.buyer_id, q.supplier_id, q.rfq_id, `${q.rfq_code} · Quotation Clarification (${q.quote_code})`, now, now, now);
        conv = { id: cid };
      }
      db.prepare('INSERT INTO messages (id, conversation_id, sender_id, body, is_read, created_at) VALUES (?, ?, ?, ?, 0, ?)').run(
        uuid(),
        conv.id,
        req.authUser!.id,
        note?.trim() || `Requesting revised commercial terms or clarification on quotation ${q.quote_code}.`,
        now,
      );
      db.prepare('UPDATE conversations SET last_message_at = ?, updated_at = ? WHERE id = ?').run(now, now, conv.id);

      createNotification({
        userId: q.supplier_user_id,
        type: 'buyer_message',
        title: `Revision / Clarification Requested on ${q.quote_code}`,
        message: note?.trim() || `Buyer requested clarification or revised pricing on ${q.rfq_code}.`,
        linkPath: '/supplier/messages',
      });
    } else if (action === 'reject') {
      db.prepare("UPDATE quotations SET status = 'rejected', updated_at = ? WHERE id = ?").run(now, q.id);
    }

    writeAuditLog({
      actorId: req.authUser!.id,
      actorRole: req.authUser!.role,
      action: `quotation_${action}`,
      entityType: 'quotation',
      entityId: q.id,
      details: { quoteCode: q.quote_code, note },
    });

    res.json({ ok: true });
  });

  // =========================================================================
  // 7. PURCHASE ORDERS, HUMAN APPROVAL, MILESTONES, ESCROW & DISPUTES
  // =========================================================================
  router.get('/orders', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = req.authUser!;
    let rows: any[] = [];

    const baseSelect = `
      SELECT po.*, r.rfq_code, q.quote_code,
        u.full_name as buyer_name, bp.company_name as buyer_company,
        sp.business_name as supplier_name, sp.city as supplier_city, sp.state as supplier_state
      FROM purchase_orders po
      LEFT JOIN rfqs r ON r.id = po.rfq_id
      LEFT JOIN quotations q ON q.id = po.quotation_id
      JOIN users u ON u.id = po.buyer_id
      LEFT JOIN buyer_profiles bp ON bp.user_id = po.buyer_id
      JOIN supplier_profiles sp ON sp.id = po.supplier_id
    `;

    if (user.role === 'buyer') {
      rows = db.prepare(`${baseSelect} WHERE po.buyer_id = ? ORDER BY po.created_at DESC`).all(user.id) as any[];
    } else if (user.role === 'supplier' && user.supplierProfile) {
      rows = db.prepare(`${baseSelect} WHERE po.supplier_id = ? ORDER BY po.created_at DESC`).all(user.supplierProfile.id) as any[];
    } else {
      rows = db.prepare(`${baseSelect} ORDER BY po.created_at DESC`).all() as any[];
    }

    const orders = rows.map((o) => {
      const milestones = (
        db
          .prepare(`
            SELECT m.*, u.full_name as updated_by_name
            FROM order_milestones m
            LEFT JOIN users u ON u.id = m.updated_by
            WHERE m.order_id = ?
            ORDER BY m.created_at ASC
          `)
          .all(o.id) as any[]
      ).map((m) => ({
        id: m.id,
        orderId: m.order_id,
        stage: m.stage,
        status: m.status,
        notes: m.notes,
        updatedByName: m.updated_by_name || 'System',
        isDelayed: Boolean(m.is_delayed),
        createdAt: m.created_at,
      }));
      return { ...mapOrderRow(o), milestones };
    });

    res.json({ orders });
  });

  // Draft Purchase Order from a Quotation (starts as awaiting_buyer_approval unless buyer explicitly confirms)
  router.post('/orders', requireRole('buyer', 'admin'), (req: AuthedRequest, res: Response) => {
    const schema = z.object({
      quotationId: z.string().min(1),
      deliveryLocation: z.string().optional(),
      approveImmediately: z.boolean().default(false),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Quotation ID is required to draft a Purchase Order.' });
      return;
    }

    const q = db
      .prepare(`
        SELECT q.*, r.buyer_id, r.title as rfq_title, r.quantity as rfq_quantity,
          r.delivery_location as rfq_delivery_location, r.rfq_code,
          sp.user_id as supplier_user_id, sp.business_name as supplier_name
        FROM quotations q
        JOIN rfqs r ON r.id = q.rfq_id
        JOIN supplier_profiles sp ON sp.id = q.supplier_id
        WHERE q.id = ?
      `)
      .get(parsed.data.quotationId) as any;

    if (!q) {
      res.status(404).json({ error: 'Quotation not found.' });
      return;
    }
    if (req.authUser!.role === 'buyer' && q.buyer_id !== req.authUser!.id) {
      res.status(403).json({ error: 'Not authorized to draft a PO from this quotation.' });
      return;
    }

    const now = nowIso();
    const orderId = uuid();
    const count = (db.prepare('SELECT COUNT(*) as c FROM purchase_orders').get() as any).c;
    const poNumber = `PO-2026-${String(count + 1).padStart(3, '0')}`;
    const commissionRate = Number(getSetting('commission_rate_default', '0.08')) || 0.08;
    const subtotal = q.total_product_cost_inr;
    const shipping = q.shipping_estimate_inr;
    const totalAmount = subtotal + shipping;
    const platformCommission = Math.round(subtotal * commissionRate);
    const expectedDelivery = new Date(Date.now() + (q.estimated_production_days + 5) * 86400 * 1000)
      .toISOString()
      .slice(0, 10);
    const initialStatus = parsed.data.approveImmediately ? 'purchase_order_created' : 'awaiting_buyer_approval';

    db.prepare(`
      INSERT INTO purchase_orders (
        id, po_number, rfq_id, quotation_id, buyer_id, supplier_id, title,
        quantity, unit_price_inr, subtotal_inr, shipping_inr, total_amount_inr,
        commission_rate, platform_commission_inr, status, delivery_location,
        expected_delivery_date, buyer_approved_at, payment_status, payment_adapter_note,
        is_demo, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unpaid', ?, ?, ?, ?)
    `).run(
      orderId,
      poNumber,
      q.rfq_id,
      q.id,
      q.buyer_id,
      q.supplier_id,
      q.rfq_title,
      q.rfq_quantity,
      q.unit_price_inr,
      subtotal,
      shipping,
      totalAmount,
      commissionRate,
      platformCommission,
      initialStatus,
      parsed.data.deliveryLocation?.trim() || q.rfq_delivery_location,
      expectedDelivery,
      parsed.data.approveImmediately ? now : null,
      'Simulated Settlement Adapter (Demo — no external funds transferred)',
      req.authUser!.isDemo ? 1 : 0,
      now,
      now,
    );

    db.prepare(`
      INSERT INTO order_items (id, order_id, description, quantity, unit_price_inr, line_total_inr, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(uuid(), orderId, q.rfq_title, q.rfq_quantity, q.unit_price_inr, subtotal, now);

    db.prepare(`
      INSERT INTO order_milestones (id, order_id, stage, status, notes, updated_by, is_delayed, created_at, updated_at)
      VALUES (?, ?, ?, 'completed', ?, ?, 0, ?, ?)
    `).run(
      uuid(),
      orderId,
      initialStatus,
      parsed.data.approveImmediately
        ? `PO ${poNumber} drafted from ${q.quote_code} and explicitly approved by buyer.`
        : `PO draft ${poNumber} prepared from ${q.quote_code}. Awaiting explicit human buyer approval before release to supplier.`,
      req.authUser!.id,
      now,
      now,
    );

    db.prepare(`
      INSERT INTO platform_commissions (id, order_id, gmv_inr, commission_rate, commission_amount_inr, managed_sourcing_fee_inr, status, created_at)
      VALUES (?, ?, ?, ?, ?, 0, 'pending', ?)
    `).run(uuid(), orderId, subtotal, commissionRate, platformCommission, now);

    db.prepare("UPDATE quotations SET status = 'accepted', updated_at = ? WHERE id = ?").run(now, q.id);
    db.prepare("UPDATE rfqs SET status = ?, selected_supplier_id = ?, updated_at = ? WHERE id = ?").run(
      initialStatus,
      q.supplier_id,
      now,
      q.rfq_id,
    );

    if (parsed.data.approveImmediately) {
      createNotification({
        userId: q.supplier_user_id,
        type: 'quotation_accepted',
        title: `Purchase Order ${poNumber} Issued!`,
        message: `Buyer approved ${poNumber} (${q.rfq_quantity} units, ₹${totalAmount.toLocaleString('en-IN')}). Please review and confirm production schedule.`,
        linkPath: '/supplier/orders',
      });
    } else {
      createNotification({
        userId: q.buyer_id,
        type: 'approval_required',
        title: `Approval Required: ${poNumber}`,
        message: `Review Purchase Order draft ${poNumber} for ${q.supplier_name} and grant formal approval to issue.`,
        linkPath: '/buyer/orders',
      });
    }

    writeAuditLog({
      actorId: req.authUser!.id,
      actorRole: req.authUser!.role,
      action: parsed.data.approveImmediately ? 'purchase_order_approved_and_created' : 'purchase_order_drafted',
      entityType: 'purchase_order',
      entityId: orderId,
      details: { poNumber, quotationId: q.id, totalAmountInr: totalAmount },
    });

    res.status(201).json({ id: orderId, poNumber, status: initialStatus });
  });

  // Buyer Human Approval Gate on drafted PO
  router.post('/orders/:id/approve', requireRole('buyer', 'admin'), (req: AuthedRequest, res: Response) => {
    const o = db
      .prepare(`
        SELECT po.*, sp.user_id as supplier_user_id
        FROM purchase_orders po
        JOIN supplier_profiles sp ON sp.id = po.supplier_id
        WHERE po.id = ?
      `)
      .get(req.params.id) as any;

    if (!o) {
      res.status(404).json({ error: 'Purchase Order not found.' });
      return;
    }
    if (req.authUser!.role === 'buyer' && o.buyer_id !== req.authUser!.id) {
      res.status(403).json({ error: 'Not authorized to approve this order.' });
      return;
    }

    const now = nowIso();
    db.prepare("UPDATE purchase_orders SET status = 'purchase_order_created', buyer_approved_at = ?, updated_at = ? WHERE id = ?").run(
      now,
      now,
      o.id,
    );
    if (o.rfq_id) {
      db.prepare("UPDATE rfqs SET status = 'purchase_order_created', updated_at = ? WHERE id = ?").run(now, o.rfq_id);
    }
    db.prepare(`
      INSERT INTO order_milestones (id, order_id, stage, status, notes, updated_by, is_delayed, created_at, updated_at)
      VALUES (?, ?, 'purchase_order_created', 'completed', 'Explicit buyer commercial approval recorded; Purchase Order released to supplier.', ?, 0, ?, ?)
    `).run(uuid(), o.id, req.authUser!.id, now, now);

    createNotification({
      userId: o.supplier_user_id,
      type: 'quotation_accepted',
      title: `Purchase Order ${o.po_number} Approved by Buyer`,
      message: `${o.title} (${o.quantity} units) is approved and ready for supplier workshop confirmation.`,
      linkPath: '/supplier/orders',
    });

    writeAuditLog({
      actorId: req.authUser!.id,
      actorRole: req.authUser!.role,
      action: 'purchase_order_buyer_approved',
      entityType: 'purchase_order',
      entityId: o.id,
      details: { poNumber: o.po_number },
    });

    res.json({ ok: true, status: 'purchase_order_created' });
  });

  // Supplier confirms Purchase Order
  router.post('/orders/:id/confirm', requireRole('supplier', 'admin'), (req: AuthedRequest, res: Response) => {
    const o = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id) as any;
    if (!o) {
      res.status(404).json({ error: 'Purchase Order not found.' });
      return;
    }
    if (req.authUser!.role === 'supplier' && o.supplier_id !== req.authUser!.supplierProfile?.id) {
      res.status(403).json({ error: 'Not authorized to confirm this order.' });
      return;
    }

    const now = nowIso();
    const note = typeof req.body?.note === 'string' && req.body.note.trim()
      ? req.body.note.trim()
      : 'Supplier confirmed commercial terms, raw material availability, and production slot.';

    db.prepare("UPDATE purchase_orders SET status = 'supplier_confirmed', supplier_confirmed_at = ?, updated_at = ? WHERE id = ?").run(
      now,
      now,
      o.id,
    );
    db.prepare(`
      INSERT INTO order_milestones (id, order_id, stage, status, notes, updated_by, is_delayed, created_at, updated_at)
      VALUES (?, ?, 'supplier_confirmed', 'completed', ?, ?, 0, ?, ?)
    `).run(uuid(), o.id, note, req.authUser!.id, now, now);

    createNotification({
      userId: o.buyer_id,
      type: 'order_status',
      title: `${o.po_number} Confirmed by Supplier`,
      message: `${req.authUser!.supplierProfile?.businessName || 'Supplier'} confirmed production for "${o.title}".`,
      linkPath: '/buyer/orders',
    });

    writeAuditLog({
      actorId: req.authUser!.id,
      actorRole: req.authUser!.role,
      action: 'purchase_order_supplier_confirmed',
      entityType: 'purchase_order',
      entityId: o.id,
      details: { poNumber: o.po_number },
    });

    res.json({ ok: true, status: 'supplier_confirmed' });
  });

  // Advance order milestone (production_started -> quality_check -> ready_for_dispatch -> shipped -> delivered -> completed)
  router.post('/orders/:id/milestones', requireAuth, (req: AuthedRequest, res: Response) => {
    const schema = z.object({
      stage: z.enum([
        'production_started',
        'quality_check',
        'ready_for_dispatch',
        'shipped',
        'delivered',
        'completed',
      ]),
      notes: z.string().min(3),
      isDelayed: z.boolean().default(false),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Please select a valid milestone stage and progress note.' });
      return;
    }

    const o = db
      .prepare(`
        SELECT po.*, sp.user_id as supplier_user_id, sp.business_name as supplier_name
        FROM purchase_orders po
        JOIN supplier_profiles sp ON sp.id = po.supplier_id
        WHERE po.id = ?
      `)
      .get(req.params.id) as any;

    if (!o) {
      res.status(404).json({ error: 'Purchase Order not found.' });
      return;
    }
    const user = req.authUser!;
    const isOrderBuyer = user.role === 'buyer' && o.buyer_id === user.id;
    const isOrderSupplier = user.role === 'supplier' && o.supplier_id === user.supplierProfile?.id;
    if (!isOrderBuyer && !isOrderSupplier && user.role !== 'admin') {
      res.status(403).json({ error: 'Not authorized to update milestones for this order.' });
      return;
    }

    const now = nowIso();
    const { stage, notes, isDelayed } = parsed.data;

    db.prepare('UPDATE purchase_orders SET status = ?, updated_at = ? WHERE id = ?').run(stage, now, o.id);
    db.prepare(`
      INSERT INTO order_milestones (id, order_id, stage, status, notes, updated_by, is_delayed, created_at, updated_at)
      VALUES (?, ?, ?, 'completed', ?, ?, ?, ?, ?)
    `).run(uuid(), o.id, stage, notes.trim(), user.id, isDelayed ? 1 : 0, now, now);

    // Realise platform commission ONLY upon completion!
    if (stage === 'completed') {
      db.prepare("UPDATE purchase_orders SET payment_status = 'settled_simulated', updated_at = ? WHERE id = ?").run(now, o.id);
      db.prepare("UPDATE platform_commissions SET status = 'realised', realised_at = ? WHERE order_id = ?").run(now, o.id);
      if (o.rfq_id) {
        db.prepare("UPDATE rfqs SET status = 'completed', updated_at = ? WHERE id = ?").run(now, o.rfq_id);
      }

      // Notify Admin of realised revenue
      const admins = db.prepare("SELECT id FROM users WHERE role = 'admin'").all() as { id: string }[];
      for (const a of admins) {
        createNotification({
          userId: a.id,
          type: 'order_status',
          title: `Order Completed & Commission Realised (${o.po_number})`,
          message: `GMV ₹${o.subtotal_inr.toLocaleString('en-IN')} · Platform commission ₹${o.platform_commission_inr.toLocaleString('en-IN')} recorded as realised.`,
          linkPath: '/admin/revenue',
        });
      }
    }

    const recipientId = isOrderSupplier ? o.buyer_id : o.supplier_user_id;
    createNotification({
      userId: recipientId,
      type: isDelayed ? 'production_delayed' : 'order_status',
      title: `${o.po_number} · ${stage.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}`,
      message: notes.trim(),
      linkPath: isOrderSupplier ? '/buyer/orders' : '/supplier/orders',
    });

    writeAuditLog({
      actorId: user.id,
      actorRole: user.role,
      action: 'order_milestone_updated',
      entityType: 'purchase_order',
      entityId: o.id,
      details: { poNumber: o.po_number, stage, isDelayed },
    });

    res.json({ ok: true, status: stage });
  });

  // Simulated Escrow Payment Adapter (clearly labelled)
  router.post('/orders/:id/pay', requireRole('buyer', 'admin'), (req: AuthedRequest, res: Response) => {
    const o = db
      .prepare(`
        SELECT po.*, sp.user_id as supplier_user_id
        FROM purchase_orders po
        JOIN supplier_profiles sp ON sp.id = po.supplier_id
        WHERE po.id = ?
      `)
      .get(req.params.id) as any;

    if (!o) {
      res.status(404).json({ error: 'Purchase Order not found.' });
      return;
    }
    if (req.authUser!.role === 'buyer' && o.buyer_id !== req.authUser!.id) {
      res.status(403).json({ error: 'Not authorized to fund this order.' });
      return;
    }

    const now = nowIso();
    const refCode = `SIM-ESCROW-${Date.now().toString().slice(-6)}`;
    db.prepare(`
      INSERT INTO payments (id, order_id, buyer_id, amount_inr, currency, method, adapter_mode, status, reference_code, is_demo, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'INR', 'Simulated Escrow Settlement', 'simulated_mock', 'escrow_funded_simulated', ?, 1, ?, ?)
    `).run(uuid(), o.id, o.buyer_id, o.total_amount_inr, refCode, now, now);

    db.prepare("UPDATE purchase_orders SET payment_status = 'escrow_funded_simulated', updated_at = ? WHERE id = ?").run(now, o.id);

    createNotification({
      userId: o.supplier_user_id,
      type: 'order_status',
      title: `Simulated Escrow Recorded for ${o.po_number}`,
      message: `Buyer recorded simulated escrow funding (${refCode}, ₹${o.total_amount_inr.toLocaleString('en-IN')}).`,
      linkPath: '/supplier/orders',
    });

    writeAuditLog({
      actorId: req.authUser!.id,
      actorRole: req.authUser!.role,
      action: 'simulated_escrow_recorded',
      entityType: 'payment',
      entityId: o.id,
      details: { poNumber: o.po_number, referenceCode: refCode, adapterMode: 'simulated_mock' },
    });

    res.json({ ok: true, referenceCode: refCode, paymentStatus: 'escrow_funded_simulated' });
  });

  // Raise Dispute
  router.post('/orders/:id/dispute', requireAuth, (req: AuthedRequest, res: Response) => {
    const reason = String(req.body?.reason ?? '').trim();
    if (reason.length < 8) {
      res.status(400).json({ error: 'Please describe the dispute issue (minimum 8 characters).' });
      return;
    }
    const o = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id) as any;
    if (!o) {
      res.status(404).json({ error: 'Purchase Order not found.' });
      return;
    }
    const now = nowIso();
    db.prepare("UPDATE purchase_orders SET status = 'disputed', dispute_reason = ?, updated_at = ? WHERE id = ?").run(
      reason,
      now,
      o.id,
    );
    db.prepare(`
      INSERT INTO order_milestones (id, order_id, stage, status, notes, updated_by, is_delayed, created_at, updated_at)
      VALUES (?, ?, 'disputed', 'flagged', ?, ?, 1, ?, ?)
    `).run(uuid(), o.id, `Dispute opened: ${reason}`, req.authUser!.id, now, now);

    const admins = db.prepare("SELECT id FROM users WHERE role = 'admin'").all() as { id: string }[];
    for (const a of admins) {
      createNotification({
        userId: a.id,
        type: 'production_delayed',
        title: `Dispute Escalated: ${o.po_number}`,
        message: reason,
        linkPath: '/admin/disputes',
      });
    }

    writeAuditLog({
      actorId: req.authUser!.id,
      actorRole: req.authUser!.role,
      action: 'order_dispute_opened',
      entityType: 'purchase_order',
      entityId: o.id,
      details: { poNumber: o.po_number, reason },
    });

    res.json({ ok: true });
  });

  // =========================================================================
  // 8. BUYER & SUPPLIER DASHBOARD ANALYTICS, CATALOGUE & ONBOARDING
  // =========================================================================
  router.get('/buyer/dashboard', requireRole('buyer', 'admin'), (req: AuthedRequest, res: Response) => {
    const uid = req.authUser!.id;
    const activeRfqs = (
      db.prepare("SELECT COUNT(*) as c FROM rfqs WHERE buyer_id = ? AND status NOT IN ('completed','cancelled')").get(uid) as any
    ).c;
    const receivedQuotes = (
      db
        .prepare('SELECT COUNT(*) as c FROM quotations q JOIN rfqs r ON r.id = q.rfq_id WHERE r.buyer_id = ?')
        .get(uid) as any
    ).c;
    const pendingApprovals = (
      db.prepare("SELECT COUNT(*) as c FROM purchase_orders WHERE buyer_id = ? AND status = 'awaiting_buyer_approval'").get(uid) as any
    ).c;
    const activeOrders = (
      db
        .prepare("SELECT COUNT(*) as c FROM purchase_orders WHERE buyer_id = ? AND status NOT IN ('completed','cancelled')")
        .get(uid) as any
    ).c;
    const totalProcurementValue = (
      db
        .prepare("SELECT COALESCE(SUM(total_amount_inr), 0) as s FROM purchase_orders WHERE buyer_id = ? AND status != 'cancelled'")
        .get(uid) as any
    ).s;

    const spendByCategory = db
      .prepare(`
        SELECT COALESCE(pc.name, 'Artisan Crafts') as category, COALESCE(SUM(po.total_amount_inr), 0) as spendInr, COUNT(po.id) as orders
        FROM purchase_orders po
        LEFT JOIN rfqs r ON r.id = po.rfq_id
        LEFT JOIN product_categories pc ON pc.id = r.category_id
        WHERE po.buyer_id = ? AND po.status != 'cancelled'
        GROUP BY category
        ORDER BY spendInr DESC
      `)
      .all(uid) as any[];

    const recommendedSuppliers = db
      .prepare(`
        SELECT sp.*, ac.name as cluster_name,
          (SELECT COUNT(*) FROM products p WHERE p.supplier_id = sp.id AND p.status = 'active') as product_count
        FROM supplier_profiles sp
        LEFT JOIN artisan_clusters ac ON ac.id = sp.cluster_id
        WHERE sp.verification_status = 'approved'
        ORDER BY sp.monthly_capacity_units DESC
        LIMIT 4
      `)
      .all()
      .map((s: any) => ({
        id: s.id,
        businessName: s.business_name,
        supplierType: s.supplier_type,
        city: s.city,
        state: s.state,
        clusterName: s.cluster_name,
        monthlyCapacityUnits: s.monthly_capacity_units,
        defaultMoq: s.default_moq,
        defaultLeadTimeDays: s.default_lead_time_days,
        verificationStatus: s.verification_status,
        productCount: s.product_count,
        isDemo: Boolean(s.is_demo),
      }));

    res.json({
      kpis: {
        activeRfqs,
        receivedQuotes,
        pendingApprovals,
        activeOrders,
        totalProcurementValueInr: totalProcurementValue,
      },
      spendByCategory,
      recommendedSuppliers,
    });
  });

  router.get('/supplier/dashboard', requireRole('supplier', 'admin'), (req: AuthedRequest, res: Response) => {
    const sup = req.authUser!.supplierProfile;
    if (!sup) {
      res.status(400).json({ error: 'Supplier profile missing.' });
      return;
    }

    const totalProducts = (
      db.prepare("SELECT COUNT(*) as c FROM products WHERE supplier_id = ? AND status = 'active'").get(sup.id) as any
    ).c;
    const activeRfqs = (
      db
        .prepare(`
          SELECT COUNT(DISTINCT r.id) as c
          FROM rfqs r
          LEFT JOIN rfq_supplier_matches rsm ON rsm.rfq_id = r.id
          LEFT JOIN supplier_capabilities sc ON sc.category_id = r.category_id AND sc.supplier_id = ?
          WHERE (rsm.supplier_id = ? OR sc.supplier_id = ?) AND r.status NOT IN ('completed','cancelled')
        `)
        .get(sup.id, sup.id, sup.id) as any
    ).c;
    const pendingQuotations = (
      db
        .prepare("SELECT COUNT(*) as c FROM quotations WHERE supplier_id = ? AND status IN ('submitted','under_review','clarification_requested')")
        .get(sup.id) as any
    ).c;
    const activeOrders = (
      db
        .prepare("SELECT COUNT(*) as c FROM purchase_orders WHERE supplier_id = ? AND status NOT IN ('completed','cancelled')")
        .get(sup.id) as any
    ).c;
    const realisedRevenue = (
      db
        .prepare("SELECT COALESCE(SUM(subtotal_inr - platform_commission_inr), 0) as s FROM purchase_orders WHERE supplier_id = ? AND status = 'completed'")
        .get(sup.id) as any
    ).s;
    const pipelineOrderValue = (
      db
        .prepare("SELECT COALESCE(SUM(subtotal_inr), 0) as s FROM purchase_orders WHERE supplier_id = ? AND status NOT IN ('completed','cancelled')")
        .get(sup.id) as any
    ).s;

    const myProducts = db
      .prepare(`
        SELECT p.*, sp.business_name as supplier_name, sp.verification_status as supplier_verification_status,
          sp.supplier_type, sp.monthly_capacity_units as supplier_monthly_capacity,
          pc.name as category_name, pc.slug as category_slug
        FROM products p
        JOIN supplier_profiles sp ON sp.id = p.supplier_id
        JOIN product_categories pc ON pc.id = p.category_id
        WHERE p.supplier_id = ?
        ORDER BY p.created_at DESC
      `)
      .all(sup.id)
      .map(mapProductRow);

    const verification = db
      .prepare('SELECT * FROM supplier_verification WHERE supplier_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(sup.id) as any;

    res.json({
      kpis: {
        totalProducts,
        activeRfqs,
        pendingQuotations,
        activeOrders,
        realisedRevenueInr: realisedRevenue,
        pipelineOrderValueInr: pipelineOrderValue,
      },
      myProducts,
      verification: verification
        ? {
            documentType: verification.document_type,
            documentRef: verification.document_ref,
            status: verification.status,
            reviewNotes: verification.review_notes,
            submittedNotes: verification.submitted_notes,
          }
        : null,
    });
  });

  router.post('/supplier/products', requireRole('supplier', 'admin'), (req: AuthedRequest, res: Response) => {
    const schema = z.object({
      name: z.string().min(3),
      categoryId: z.string().min(1),
      description: z.string().min(10),
      craftTechnique: z.string().min(2),
      materials: z.string().min(2),
      moq: z.coerce.number().int().positive(),
      indicativePriceInr: z.coerce.number().positive(),
      availableQty: z.coerce.number().int().positive(),
      leadTimeDays: z.coerce.number().int().positive(),
      customisationOptions: z.string().optional(),
      imageUrl: z.string().optional(),
      specifications: z.array(z.object({ specKey: z.string(), specValue: z.string() })).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Please fill in all required product fields.', details: parsed.error.flatten() });
      return;
    }

    const sup = req.authUser!.supplierProfile;
    if (!sup) {
      res.status(400).json({ error: 'Supplier profile required to add products.' });
      return;
    }

    const d = parsed.data;
    const cat = db.prepare('SELECT * FROM product_categories WHERE id = ? OR slug = ?').get(d.categoryId, d.categoryId) as any;
    if (!cat) {
      res.status(400).json({ error: 'Invalid craft category.' });
      return;
    }

    const pid = uuid();
    const now = nowIso();
    const sku = `FF-${sup.city.slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-4)}`;
    const slug = d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + sku.slice(-4);
    const imgUrl = d.imageUrl?.trim() || cat.image_url;

    db.prepare(`
      INSERT INTO products (
        id, supplier_id, category_id, sku, name, slug, description, craft_technique,
        materials, origin_city, origin_state, moq, indicative_price_inr, available_qty,
        lead_time_days, customisation_options, image_url, popularity_score, status, is_demo, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 75, 'active', ?, ?, ?)
    `).run(
      pid,
      sup.id,
      cat.id,
      sku,
      d.name.trim(),
      slug,
      d.description.trim(),
      d.craftTechnique.trim(),
      d.materials.trim(),
      sup.city,
      sup.state,
      d.moq,
      d.indicativePriceInr,
      d.availableQty,
      d.leadTimeDays,
      d.customisationOptions?.trim() || 'Custom dimensions & packaging available upon inquiry',
      imgUrl,
      req.authUser!.isDemo ? 1 : 0,
      now,
      now,
    );

    db.prepare('INSERT INTO product_images (id, product_id, image_url, caption, is_primary, sort_order, created_at) VALUES (?, ?, ?, ?, 1, 0, ?)').run(
      uuid(),
      pid,
      imgUrl,
      `${d.name.trim()} — Primary Catalogue Photo`,
      now,
    );

    for (const sp of d.specifications ?? []) {
      if (sp.specKey.trim() && sp.specValue.trim()) {
        db.prepare('INSERT INTO product_specifications (id, product_id, spec_key, spec_value, created_at) VALUES (?, ?, ?, ?, ?)').run(
          uuid(),
          pid,
          sp.specKey.trim(),
          sp.specValue.trim(),
          now,
        );
      }
    }

    // Ensure supplier capability covers this category
    const hasCap = db.prepare('SELECT id FROM supplier_capabilities WHERE supplier_id = ? AND category_id = ?').get(sup.id, cat.id);
    if (!hasCap) {
      db.prepare(`
        INSERT INTO supplier_capabilities (id, supplier_id, category_id, craft_technique, material_specialty, min_moq, max_monthly_capacity, avg_lead_time_days, supports_customisation, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      `).run(uuid(), sup.id, cat.id, d.craftTechnique, d.materials, d.moq, sup.monthlyCapacityUnits, d.leadTimeDays, now);
    }

    writeAuditLog({
      actorId: req.authUser!.id,
      actorRole: req.authUser!.role,
      action: 'product_created',
      entityType: 'product',
      entityId: pid,
      details: { sku, name: d.name, moq: d.moq, indicativePriceInr: d.indicativePriceInr },
    });

    res.status(201).json({ id: pid, sku });
  });

  router.patch('/supplier/profile', requireRole('supplier'), (req: AuthedRequest, res: Response) => {
    const sup = req.authUser!.supplierProfile;
    if (!sup) {
      res.status(400).json({ error: 'Supplier profile not found.' });
      return;
    }
    const schema = z.object({
      businessName: z.string().min(2).optional(),
      craftHeritageSummary: z.string().min(10).optional(),
      monthlyCapacityUnits: z.coerce.number().int().positive().optional(),
      defaultMoq: z.coerce.number().int().positive().optional(),
      defaultLeadTimeDays: z.coerce.number().int().positive().optional(),
      customisationSupported: z.boolean().optional(),
      exportReady: z.boolean().optional(),
      verificationDocType: z.string().optional(),
      verificationDocRef: z.string().optional(),
      verificationNotes: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid profile update.' });
      return;
    }
    const d = parsed.data;
    const now = nowIso();

    db.prepare(`
      UPDATE supplier_profiles
      SET business_name = COALESCE(?, business_name),
          craft_heritage_summary = COALESCE(?, craft_heritage_summary),
          monthly_capacity_units = COALESCE(?, monthly_capacity_units),
          default_moq = COALESCE(?, default_moq),
          default_lead_time_days = COALESCE(?, default_lead_time_days),
          customisation_supported = COALESCE(?, customisation_supported),
          export_ready = COALESCE(?, export_ready),
          updated_at = ?
      WHERE id = ?
    `).run(
      d.businessName ?? null,
      d.craftHeritageSummary ?? null,
      d.monthlyCapacityUnits ?? null,
      d.defaultMoq ?? null,
      d.defaultLeadTimeDays ?? null,
      d.customisationSupported !== undefined ? (d.customisationSupported ? 1 : 0) : null,
      d.exportReady !== undefined ? (d.exportReady ? 1 : 0) : null,
      now,
      sup.id,
    );

    if (d.verificationDocType && d.verificationDocRef) {
      db.prepare(`
        INSERT INTO supplier_verification (id, supplier_id, document_type, document_ref, submitted_notes, status, is_demo, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'under_review', ?, ?, ?)
      `).run(
        uuid(),
        sup.id,
        d.verificationDocType,
        d.verificationDocRef,
        d.verificationNotes ?? 'Submitted via supplier dashboard',
        req.authUser!.isDemo ? 1 : 0,
        now,
        now,
      );
      db.prepare("UPDATE supplier_profiles SET verification_status = 'under_review', updated_at = ? WHERE id = ?").run(now, sup.id);
    }

    res.json({ ok: true, user: hydrateAuthUser(req.authUser!.id) });
  });

  // Complete 10-step Supplier Onboarding Flow (persists account + profile + capabilities + initial product + verification docs)
  router.post('/supplier/onboard', rateLimit(20), (req: AuthedRequest, res: Response) => {
    const schema = z.object({
      fullName: z.string().min(2),
      email: z.string().email(),
      password: z.string().min(6),
      businessName: z.string().min(2),
      supplierType: z.string().min(2),
      city: z.string().min(2),
      state: z.string().min(2),
      clusterId: z.string().optional().nullable(),
      craftHeritageSummary: z.string().min(10),
      categoryIds: z.array(z.string()).min(1),
      monthlyCapacityUnits: z.coerce.number().int().positive(),
      defaultMoq: z.coerce.number().int().positive(),
      defaultLeadTimeDays: z.coerce.number().int().positive(),
      customisationSupported: z.boolean().default(true),
      exportReady: z.boolean().default(true),
      firstProductName: z.string().min(3),
      firstProductMaterials: z.string().min(2),
      firstProductTechnique: z.string().min(2),
      firstProductPriceInr: z.coerce.number().positive(),
      documentType: z.string().default('Artisan Guild / MSME Registration'),
      documentRef: z.string().default('PENDING-UPLOAD'),
      documentNotes: z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Please complete all supplier onboarding details.', details: parsed.error.flatten() });
      return;
    }

    const d = parsed.data;
    const emailLower = d.email.toLowerCase().trim();
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(emailLower)) {
      res.status(409).json({ error: 'An account with this email already exists. Please sign in instead.' });
      return;
    }

    const now = nowIso();
    const userId = uuid();
    const supId = uuid();
    const hash = bcrypt.hashSync(d.password, 8);

    db.prepare(`
      INSERT INTO users (id, email, password_hash, role, full_name, status, is_demo, created_at, updated_at)
      VALUES (?, ?, ?, 'supplier', ?, 'active', 0, ?, ?)
    `).run(userId, emailLower, hash, d.fullName.trim(), now, now);

    db.prepare('INSERT INTO profiles (id, user_id, bio, locale, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      uuid(), userId, d.craftHeritageSummary, 'en-IN', now, now,
    );

    db.prepare(`
      INSERT INTO supplier_profiles (
        id, user_id, business_name, supplier_type, cluster_id, state, city,
        craft_heritage_summary, monthly_capacity_units, default_moq, default_lead_time_days,
        customisation_supported, export_ready, verification_status, is_demo, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'under_review', 0, ?, ?)
    `).run(
      supId,
      userId,
      d.businessName.trim(),
      d.supplierType,
      d.clusterId || null,
      d.state,
      d.city,
      d.craftHeritageSummary.trim(),
      d.monthlyCapacityUnits,
      d.defaultMoq,
      d.defaultLeadTimeDays,
      d.customisationSupported ? 1 : 0,
      d.exportReady ? 1 : 0,
      now,
      now,
    );

    let firstCat: any = null;
    for (const cid of d.categoryIds) {
      const cat = db.prepare('SELECT * FROM product_categories WHERE id = ? OR slug = ?').get(cid, cid) as any;
      if (!cat) continue;
      if (!firstCat) firstCat = cat;
      db.prepare(`
        INSERT INTO supplier_capabilities (id, supplier_id, category_id, craft_technique, material_specialty, min_moq, max_monthly_capacity, avg_lead_time_days, supports_customisation, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        uuid(),
        supId,
        cat.id,
        d.firstProductTechnique,
        d.firstProductMaterials,
        d.defaultMoq,
        d.monthlyCapacityUnits,
        d.defaultLeadTimeDays,
        d.customisationSupported ? 1 : 0,
        now,
      );
    }

    if (firstCat) {
      const pid = uuid();
      const sku = `FF-${d.city.slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-4)}`;
      db.prepare(`
        INSERT INTO products (
          id, supplier_id, category_id, sku, name, slug, description, craft_technique,
          materials, origin_city, origin_state, moq, indicative_price_inr, available_qty,
          lead_time_days, customisation_options, image_url, popularity_score, status, is_demo, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 70, 'active', 0, ?, ?)
      `).run(
        pid,
        supId,
        firstCat.id,
        sku,
        d.firstProductName.trim(),
        d.firstProductName.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + sku.slice(-4),
        `${d.firstProductName.trim()} crafted in ${d.city}, ${d.state} by ${d.businessName.trim()} using ${d.firstProductTechnique}.`,
        d.firstProductTechnique,
        d.firstProductMaterials,
        d.city,
        d.state,
        d.defaultMoq,
        d.firstProductPriceInr,
        d.monthlyCapacityUnits,
        d.defaultLeadTimeDays,
        d.customisationSupported ? 'Custom dimensions, finish, and export packaging supported' : 'Standard catalogue run',
        firstCat.image_url,
        now,
        now,
      );
    }

    db.prepare(`
      INSERT INTO supplier_verification (id, supplier_id, document_type, document_ref, submitted_notes, status, is_demo, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'under_review', 0, ?, ?)
    `).run(uuid(), supId, d.documentType, d.documentRef, d.documentNotes ?? 'Submitted during supplier onboarding.', now, now);

    // Notify admins of new supplier application
    const admins = db.prepare("SELECT id FROM users WHERE role = 'admin'").all() as { id: string }[];
    for (const a of admins) {
      createNotification({
        userId: a.id,
        type: 'approval_required',
        title: `New Supplier Application: ${d.businessName}`,
        message: `${d.supplierType} in ${d.city}, ${d.state} submitted onboarding & verification evidence.`,
        linkPath: '/admin/verifications',
      });
    }

    writeAuditLog({
      actorId: userId,
      actorRole: 'supplier',
      action: 'supplier_onboarded',
      entityType: 'supplier_profile',
      entityId: supId,
      details: { businessName: d.businessName, city: d.city, state: d.state },
    });

    const token = createSessionToken(userId);
    res.status(201).json({ token, user: hydrateAuthUser(userId) });
  });

  // =========================================================================
  // 9. MESSAGING & NOTIFICATIONS
  // =========================================================================
  router.get('/conversations', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = req.authUser!;
    let rows: any[] = [];
    const base = `
      SELECT c.*, u.full_name as buyer_name, bp.company_name as buyer_company,
        sp.business_name as supplier_name, r.rfq_code, po.po_number,
        (SELECT m.body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message_preview,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.sender_id != ? AND m.is_read = 0) as unread_count
      FROM conversations c
      JOIN users u ON u.id = c.buyer_id
      LEFT JOIN buyer_profiles bp ON bp.user_id = c.buyer_id
      JOIN supplier_profiles sp ON sp.id = c.supplier_id
      LEFT JOIN rfqs r ON r.id = c.rfq_id
      LEFT JOIN purchase_orders po ON po.id = c.order_id
    `;
    if (user.role === 'buyer') {
      rows = db.prepare(`${base} WHERE c.buyer_id = ? ORDER BY c.last_message_at DESC`).all(user.id, user.id) as any[];
    } else if (user.role === 'supplier' && user.supplierProfile) {
      rows = db.prepare(`${base} WHERE c.supplier_id = ? ORDER BY c.last_message_at DESC`).all(user.id, user.supplierProfile.id) as any[];
    } else {
      rows = db.prepare(`${base} ORDER BY c.last_message_at DESC`).all(user.id) as any[];
    }

    res.json({
      conversations: rows.map((c) => ({
        id: c.id,
        buyerId: c.buyer_id,
        buyerName: c.buyer_name,
        buyerCompany: c.buyer_company,
        supplierId: c.supplier_id,
        supplierName: c.supplier_name,
        rfqId: c.rfq_id,
        rfqCode: c.rfq_code,
        orderId: c.order_id,
        poNumber: c.po_number,
        subject: c.subject,
        lastMessageAt: c.last_message_at,
        unreadCount: c.unread_count,
        lastMessagePreview: c.last_message_preview,
      })),
    });
  });

  router.post('/conversations', requireAuth, (req: AuthedRequest, res: Response) => {
    const schema = z.object({
      supplierId: z.string().min(1),
      subject: z.string().min(3),
      initialMessage: z.string().min(2),
      rfqId: z.string().optional().nullable(),
      orderId: z.string().optional().nullable(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid conversation payload.' });
      return;
    }

    const d = parsed.data;
    const now = nowIso();
    const cid = uuid();
    const buyerId = req.authUser!.id;
    const sup = db.prepare('SELECT id, user_id, business_name FROM supplier_profiles WHERE id = ?').get(d.supplierId) as any;
    if (!sup) {
      res.status(404).json({ error: 'Supplier not found.' });
      return;
    }

    db.prepare(`
      INSERT INTO conversations (id, buyer_id, supplier_id, rfq_id, order_id, subject, last_message_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(cid, buyerId, sup.id, d.rfqId ?? null, d.orderId ?? null, d.subject.trim(), now, now, now);

    db.prepare('INSERT INTO messages (id, conversation_id, sender_id, body, is_read, created_at) VALUES (?, ?, ?, ?, 0, ?)').run(
      uuid(), cid, buyerId, d.initialMessage.trim(), now,
    );

    createNotification({
      userId: sup.user_id,
      type: 'buyer_message',
      title: `New Message: ${d.subject.trim()}`,
      message: d.initialMessage.trim().slice(0, 120),
      linkPath: '/supplier/messages',
    });

    res.status(201).json({ id: cid });
  });

  router.get('/conversations/:id/messages', requireAuth, (req: AuthedRequest, res: Response) => {
    const cid = req.params.id;
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(cid) as any;
    if (!conv) {
      res.status(404).json({ error: 'Conversation not found.' });
      return;
    }
    const user = req.authUser!;
    if (
      user.role !== 'admin' &&
      conv.buyer_id !== user.id &&
      conv.supplier_id !== user.supplierProfile?.id
    ) {
      res.status(403).json({ error: 'Not authorized to view this conversation.' });
      return;
    }

    db.prepare('UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND sender_id != ?').run(cid, user.id);

    const messages = (
      db
        .prepare(`
          SELECT m.*, u.full_name as sender_name, u.role as sender_role
          FROM messages m
          JOIN users u ON u.id = m.sender_id
          WHERE m.conversation_id = ?
          ORDER BY m.created_at ASC
        `)
        .all(cid) as any[]
    ).map((m) => ({
      id: m.id,
      conversationId: m.conversation_id,
      senderId: m.sender_id,
      senderName: m.sender_name,
      senderRole: m.sender_role,
      body: m.body,
      attachmentName: m.attachment_name,
      attachmentUrl: m.attachment_url,
      isRead: Boolean(m.is_read),
      createdAt: m.created_at,
    }));

    res.json({ messages });
  });

  router.post('/conversations/:id/messages', requireAuth, (req: AuthedRequest, res: Response) => {
    const cid = req.params.id;
    const body = String(req.body?.body ?? '').trim();
    const attachmentName = typeof req.body?.attachmentName === 'string' ? req.body.attachmentName.trim() : null;
    if (!body) {
      res.status(400).json({ error: 'Message body cannot be empty.' });
      return;
    }

    const conv = db
      .prepare(`
        SELECT c.*, sp.user_id as supplier_user_id
        FROM conversations c
        JOIN supplier_profiles sp ON sp.id = c.supplier_id
        WHERE c.id = ?
      `)
      .get(cid) as any;
    if (!conv) {
      res.status(404).json({ error: 'Conversation not found.' });
      return;
    }

    const user = req.authUser!;
    const now = nowIso();
    const mid = uuid();
    db.prepare(`
      INSERT INTO messages (id, conversation_id, sender_id, body, attachment_name, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?)
    `).run(mid, cid, user.id, body, attachmentName, now);
    db.prepare('UPDATE conversations SET last_message_at = ?, updated_at = ? WHERE id = ?').run(now, now, cid);

    const recipientId = user.id === conv.buyer_id ? conv.supplier_user_id : conv.buyer_id;
    createNotification({
      userId: recipientId,
      type: user.role === 'buyer' ? 'buyer_message' : 'supplier_message',
      title: `Message from ${user.fullName}`,
      message: body.slice(0, 120),
      linkPath: user.id === conv.buyer_id ? '/supplier/messages' : '/buyer/messages',
    });

    res.status(201).json({ id: mid });
  });

  router.get('/notifications', requireAuth, (req: AuthedRequest, res: Response) => {
    const rows = db
      .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 40')
      .all(req.authUser!.id) as any[];
    res.json({
      notifications: rows.map((n) => ({
        id: n.id,
        userId: n.user_id,
        type: n.type,
        title: n.title,
        message: n.message,
        linkPath: n.link_path,
        isRead: Boolean(n.is_read),
        createdAt: n.created_at,
      })),
    });
  });

  router.post('/notifications/read-all', requireAuth, (req: AuthedRequest, res: Response) => {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.authUser!.id);
    res.json({ ok: true });
  });

  // =========================================================================
  // 10. ADMIN CONTROL CENTER (REVENUE, VERIFICATIONS, MODERATION, AI LOGS)
  // =========================================================================
  router.get('/admin/overview', requireRole('admin'), (_req: Request, res: Response) => {
    const orders = db.prepare('SELECT * FROM purchase_orders').all() as any[];
    const comms = db.prepare('SELECT * FROM platform_commissions').all() as any[];

    const nonCancelled = orders.filter((o) => o.status !== 'cancelled');
    const completed = orders.filter((o) => o.status === 'completed');

    const gmvTotalInr = nonCancelled.reduce((s, o) => s + Number(o.subtotal_inr), 0);
    const realisedGmvInr = completed.reduce((s, o) => s + Number(o.subtotal_inr), 0);
    const pendingGmvInr = gmvTotalInr - realisedGmvInr;

    const realisedComms = comms.filter((c) => c.status === 'realised');
    const realisedCommissionInr = realisedComms.reduce((s, c) => s + Number(c.commission_amount_inr), 0);
    const managedSourcingFeesInr = realisedComms.reduce((s, c) => s + Number(c.managed_sourcing_fee_inr), 0);
    const realisedPlatformRevenueInr = realisedCommissionInr + managedSourcingFeesInr;

    const averageOrderValueInr = completed.length > 0 ? Math.round(realisedGmvInr / completed.length) : 0;
    const activeBuyersCount = (db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'buyer' AND status = 'active'").get() as any).c;
    const activeSuppliersCount = (db.prepare('SELECT COUNT(*) as c FROM supplier_profiles').get() as any).c;

    // Repeat buyer rate
    const buyerOrderCounts = new Map<string, number>();
    for (const o of nonCancelled) {
      buyerOrderCounts.set(o.buyer_id, (buyerOrderCounts.get(o.buyer_id) ?? 0) + 1);
    }
    const repeatBuyers = Array.from(buyerOrderCounts.values()).filter((c) => c >= 2).length;
    const repeatBuyerRatePct = buyerOrderCounts.size > 0 ? Math.round((repeatBuyers / buyerOrderCounts.size) * 100) : 0;

    // RFQ conversion rate
    const totalRfqs = (db.prepare('SELECT COUNT(*) as c FROM rfqs').get() as any).c;
    const convertedRfqs = (
      db
        .prepare("SELECT COUNT(*) as c FROM rfqs WHERE status IN ('purchase_order_created','completed')")
        .get() as any
    ).c;
    const rfqConversionRatePct = totalRfqs > 0 ? Math.round((convertedRfqs / totalRfqs) * 100) : 0;

    // Avg time to quotation (hours)
    const quoteDiffs = db
      .prepare(`
        SELECT (julianday(q.created_at) - julianday(r.created_at)) * 24.0 as hrs
        FROM quotations q
        JOIN rfqs r ON r.id = q.rfq_id
        WHERE q.created_at >= r.created_at
      `)
      .all() as { hrs: number }[];
    const avgTimeToQuotationHours =
      quoteDiffs.length > 0
        ? Math.max(4, Math.round(quoteDiffs.reduce((s, d) => s + Math.abs(d.hrs), 0) / quoteDiffs.length))
        : 28;

    // Monthly series derived from actual orders (grouped by month)
    const monthBuckets = new Map<string, { month: string; gmvInr: number; platformRevenueInr: number; orders: number }>();
    for (const o of nonCancelled) {
      const d = new Date(o.created_at);
      const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      const entry = monthBuckets.get(label) ?? { month: label, gmvInr: 0, platformRevenueInr: 0, orders: 0 };
      entry.gmvInr += Number(o.subtotal_inr);
      if (o.status === 'completed') {
        entry.platformRevenueInr += Number(o.platform_commission_inr);
      }
      entry.orders += 1;
      monthBuckets.set(label, entry);
    }

    const categorySeries = db
      .prepare(`
        SELECT pc.name as category,
          COUNT(DISTINCT p.id) as products,
          COALESCE((
            SELECT SUM(po.subtotal_inr)
            FROM purchase_orders po
            JOIN rfqs r ON r.id = po.rfq_id
            WHERE r.category_id = pc.id AND po.status != 'cancelled'
          ), 0) as gmvInr
        FROM product_categories pc
        LEFT JOIN products p ON p.category_id = pc.id AND p.status = 'active'
        GROUP BY pc.id
        ORDER BY gmvInr DESC, products DESC
      `)
      .all() as any[];

    res.json({
      analytics: {
        gmvTotalInr,
        realisedGmvInr,
        pendingGmvInr,
        realisedPlatformRevenueInr,
        realisedCommissionInr,
        managedSourcingFeesInr,
        completedTransactionsCount: completed.length,
        totalOrdersCount: nonCancelled.length,
        averageOrderValueInr,
        activeBuyersCount,
        activeSuppliersCount,
        repeatBuyerRatePct,
        rfqConversionRatePct,
        avgTimeToQuotationHours,
        commissionRateDefault: Number(getSetting('commission_rate_default', '0.08')),
        managedSourcingFeePct: Number(getSetting('managed_sourcing_fee_pct', '0.035')),
        buyerSubscriptionMonthlyInr: Number(getSetting('buyer_subscription_monthly_inr', '14999')),
        monthlySeries: Array.from(monthBuckets.values()),
        categorySeries,
      },
    });
  });

  router.get('/admin/users', requireRole('admin'), (_req: Request, res: Response) => {
    const rows = db
      .prepare(`
        SELECT u.id, u.email, u.role, u.full_name, u.status, u.is_demo, u.created_at,
          bp.company_name, bp.buyer_type,
          sp.business_name, sp.supplier_type, sp.verification_status, sp.city as supplier_city, sp.state as supplier_state
        FROM users u
        LEFT JOIN buyer_profiles bp ON bp.user_id = u.id
        LEFT JOIN supplier_profiles sp ON sp.user_id = u.id
        ORDER BY u.created_at DESC
      `)
      .all() as any[];

    res.json({
      users: rows.map((u) => ({
        id: u.id,
        email: u.email,
        role: u.role,
        fullName: u.full_name,
        status: u.status,
        isDemo: Boolean(u.is_demo),
        organization: u.company_name || u.business_name || 'Folkform Operations',
        orgType: u.buyer_type || u.supplier_type || 'Admin',
        verificationStatus: u.verification_status,
        location: u.supplier_city ? `${u.supplier_city}, ${u.supplier_state}` : undefined,
        createdAt: u.created_at,
      })),
    });
  });

  router.patch('/admin/users/:id/status', requireRole('admin'), (req: AuthedRequest, res: Response) => {
    const status = req.body?.status;
    if (!['active', 'suspended'].includes(status)) {
      res.status(400).json({ error: 'Invalid user status.' });
      return;
    }
    db.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?').run(status, nowIso(), req.params.id);
    writeAuditLog({
      actorId: req.authUser!.id,
      actorRole: 'admin',
      action: 'admin_user_status_updated',
      entityType: 'user',
      entityId: req.params.id,
      details: { status },
    });
    res.json({ ok: true });
  });

  router.get('/admin/verifications', requireRole('admin'), (_req: Request, res: Response) => {
    const rows = db
      .prepare(`
        SELECT sv.*, sp.business_name, sp.supplier_type, sp.city, sp.state, sp.monthly_capacity_units,
          sp.craft_heritage_summary, sp.verification_status as current_status, u.full_name as owner_name, u.email as owner_email
        FROM supplier_verification sv
        JOIN supplier_profiles sp ON sp.id = sv.supplier_id
        JOIN users u ON u.id = sp.user_id
        ORDER BY CASE WHEN sv.status IN ('pending','under_review') THEN 0 ELSE 1 END, sv.created_at DESC
      `)
      .all() as any[];

    res.json({
      verifications: rows.map((v) => ({
        id: v.id,
        supplierId: v.supplier_id,
        businessName: v.business_name,
        supplierType: v.supplier_type,
        ownerName: v.owner_name,
        ownerEmail: v.owner_email,
        location: `${v.city}, ${v.state}`,
        monthlyCapacityUnits: v.monthly_capacity_units,
        craftHeritageSummary: v.craft_heritage_summary,
        documentType: v.document_type,
        documentRef: v.document_ref,
        submittedNotes: v.submitted_notes,
        status: v.status,
        reviewNotes: v.review_notes,
        isDemo: Boolean(v.is_demo),
        createdAt: v.created_at,
      })),
    });
  });

  router.post('/admin/verifications/:id/review', requireRole('admin'), (req: AuthedRequest, res: Response) => {
    const schema = z.object({
      decision: z.enum(['approved', 'rejected']),
      reviewNotes: z.string().min(3),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Provide decision and review notes.' });
      return;
    }

    const v = db
      .prepare(`
        SELECT sv.*, sp.user_id as supplier_user_id, sp.business_name
        FROM supplier_verification sv
        JOIN supplier_profiles sp ON sp.id = sv.supplier_id
        WHERE sv.id = ?
      `)
      .get(req.params.id) as any;

    if (!v) {
      res.status(404).json({ error: 'Verification record not found.' });
      return;
    }

    const now = nowIso();
    db.prepare(`
      UPDATE supplier_verification
      SET status = ?, reviewed_by = ?, review_notes = ?, updated_at = ?
      WHERE id = ?
    `).run(parsed.data.decision, req.authUser!.id, parsed.data.reviewNotes.trim(), now, v.id);

    db.prepare('UPDATE supplier_profiles SET verification_status = ?, updated_at = ? WHERE id = ?').run(
      parsed.data.decision,
      now,
      v.supplier_id,
    );

    createNotification({
      userId: v.supplier_user_id,
      type: 'approval_required',
      title: `Verification ${parsed.data.decision === 'approved' ? 'Approved' : 'Update Required'}`,
      message: `${v.business_name}: ${parsed.data.reviewNotes.trim()}`,
      linkPath: '/supplier/profile',
    });

    writeAuditLog({
      actorId: req.authUser!.id,
      actorRole: 'admin',
      action: `supplier_verification_${parsed.data.decision}`,
      entityType: 'supplier_verification',
      entityId: v.id,
      details: { supplierId: v.supplier_id, reviewNotes: parsed.data.reviewNotes },
    });

    res.json({ ok: true });
  });

  router.patch('/admin/products/:id/status', requireRole('admin'), (req: AuthedRequest, res: Response) => {
    const status = req.body?.status;
    if (!['active', 'flagged', 'archived'].includes(status)) {
      res.status(400).json({ error: 'Invalid product moderation status.' });
      return;
    }
    db.prepare('UPDATE products SET status = ?, updated_at = ? WHERE id = ?').run(status, nowIso(), req.params.id);
    writeAuditLog({
      actorId: req.authUser!.id,
      actorRole: 'admin',
      action: 'admin_product_moderated',
      entityType: 'product',
      entityId: req.params.id,
      details: { status },
    });
    res.json({ ok: true });
  });

  router.post('/admin/disputes/:orderId/resolve', requireRole('admin'), (req: AuthedRequest, res: Response) => {
    const schema = z.object({
      resolution: z.enum(['resume_delivery', 'complete_with_credit', 'cancel_order']),
      notes: z.string().min(5),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Provide dispute resolution action and notes.' });
      return;
    }

    const o = db
      .prepare(`
        SELECT po.*, sp.user_id as supplier_user_id
        FROM purchase_orders po
        JOIN supplier_profiles sp ON sp.id = po.supplier_id
        WHERE po.id = ?
      `)
      .get(req.params.orderId) as any;

    if (!o) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }

    const now = nowIso();
    const nextStatus =
      parsed.data.resolution === 'cancel_order'
        ? 'cancelled'
        : parsed.data.resolution === 'complete_with_credit'
          ? 'completed'
          : 'shipped';

    db.prepare('UPDATE purchase_orders SET status = ?, dispute_reason = NULL, updated_at = ? WHERE id = ?').run(
      nextStatus,
      now,
      o.id,
    );
    db.prepare(`
      INSERT INTO order_milestones (id, order_id, stage, status, notes, updated_by, is_delayed, created_at, updated_at)
      VALUES (?, ?, ?, 'completed', ?, ?, 0, ?, ?)
    `).run(uuid(), o.id, nextStatus, `Admin dispute resolution: ${parsed.data.notes.trim()}`, req.authUser!.id, now, now);

    if (nextStatus === 'completed') {
      db.prepare("UPDATE platform_commissions SET status = 'realised', realised_at = ? WHERE order_id = ?").run(now, o.id);
    } else if (nextStatus === 'cancelled') {
      db.prepare("UPDATE platform_commissions SET status = 'cancelled' WHERE order_id = ?").run(o.id);
    }

    createNotification({
      userId: o.buyer_id,
      type: 'order_status',
      title: `Dispute Resolved on ${o.po_number}`,
      message: parsed.data.notes.trim(),
      linkPath: '/buyer/orders',
    });
    createNotification({
      userId: o.supplier_user_id,
      type: 'order_status',
      title: `Dispute Resolved on ${o.po_number}`,
      message: parsed.data.notes.trim(),
      linkPath: '/supplier/orders',
    });

    writeAuditLog({
      actorId: req.authUser!.id,
      actorRole: 'admin',
      action: 'admin_dispute_resolved',
      entityType: 'purchase_order',
      entityId: o.id,
      details: { resolution: parsed.data.resolution, notes: parsed.data.notes },
    });

    res.json({ ok: true, status: nextStatus });
  });

  router.get('/admin/workflows', requireRole('admin'), (_req: Request, res: Response) => {
    const workflows = db
      .prepare(`
        SELECT aw.*, u.full_name as user_name, u.email as user_email, r.rfq_code
        FROM agent_workflows aw
        JOIN users u ON u.id = aw.user_id
        LEFT JOIN rfqs r ON r.id = aw.rfq_id
        ORDER BY aw.created_at DESC
        LIMIT 40
      `)
      .all() as any[];

    const logs = db
      .prepare('SELECT * FROM agent_execution_logs ORDER BY step_order ASC, created_at ASC')
      .all() as any[];

    res.json({
      workflows: workflows.map((w) => ({
        id: w.id,
        userName: w.user_name,
        userEmail: w.user_email,
        rfqCode: w.rfq_code,
        rawPrompt: w.raw_prompt,
        extractedSpec: JSON.parse(w.extracted_spec_json || '{}'),
        shortlist: JSON.parse(w.shortlist_json || '[]'),
        pricingSummary: JSON.parse(w.pricing_summary_json || '{}'),
        riskFlags: JSON.parse(w.risk_flags_json || '[]'),
        providerUsed: w.provider_used,
        status: w.status,
        humanApprovalStatus: w.human_approval_status,
        createdAt: w.created_at,
        logs: logs
          .filter((l) => l.workflow_id === w.id)
          .map((l) => ({
            id: l.id,
            agentName: l.agent_name,
            stepOrder: l.step_order,
            status: l.status,
            durationMs: l.duration_ms,
            inputSummary: l.input_summary,
            outputSummary: l.output_summary,
            toolCalls: JSON.parse(l.tool_calls_json || '[]'),
            createdAt: l.created_at,
          })),
      })),
    });
  });

  router.patch('/admin/settings', requireRole('admin'), (req: AuthedRequest, res: Response) => {
    const schema = z.object({
      commissionRateDefault: z.coerce.number().min(0.01).max(0.25),
      managedSourcingFeePct: z.coerce.number().min(0).max(0.2),
      buyerSubscriptionMonthlyInr: z.coerce.number().min(0),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid commercial configuration values.' });
      return;
    }

    const now = nowIso();
    const upsert = db.prepare('INSERT OR REPLACE INTO platform_settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, ?)');
    upsert.run('commission_rate_default', String(parsed.data.commissionRateDefault), req.authUser!.id, now);
    upsert.run('managed_sourcing_fee_pct', String(parsed.data.managedSourcingFeePct), req.authUser!.id, now);
    upsert.run('buyer_subscription_monthly_inr', String(parsed.data.buyerSubscriptionMonthlyInr), req.authUser!.id, now);

    writeAuditLog({
      actorId: req.authUser!.id,
      actorRole: 'admin',
      action: 'admin_settings_updated',
      entityType: 'platform_settings',
      entityId: 'commercial_assumptions',
      details: parsed.data,
    });

    res.json({ ok: true });
  });

  router.get('/admin/audit-logs', requireRole('admin'), (_req: Request, res: Response) => {
    const rows = db
      .prepare(`
        SELECT al.*, u.full_name as actor_name
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.actor_id
        ORDER BY al.created_at DESC
        LIMIT 80
      `)
      .all() as any[];

    res.json({
      logs: rows.map((r) => ({
        id: r.id,
        actorName: r.actor_name || 'System',
        actorRole: r.actor_role,
        action: r.action,
        entityType: r.entity_type,
        entityId: r.entity_id,
        details: JSON.parse(r.details_json || '{}'),
        createdAt: r.created_at,
      })),
    });
  });

  router.get('/admin/products', requireRole('admin'), (_req: Request, res: Response) => {
    const rows = db
      .prepare(`
        SELECT p.*, sp.business_name as supplier_name, sp.verification_status as supplier_verification_status,
          sp.supplier_type, sp.monthly_capacity_units as supplier_monthly_capacity,
          pc.name as category_name, pc.slug as category_slug
        FROM products p
        JOIN supplier_profiles sp ON sp.id = p.supplier_id
        JOIN product_categories pc ON pc.id = p.category_id
        ORDER BY p.created_at DESC
      `)
      .all()
      .map(mapProductRow);
    res.json({ products: rows });
  });

  return router;
}
