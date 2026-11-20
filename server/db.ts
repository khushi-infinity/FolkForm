import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'folkform.db');
export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA busy_timeout = 5000;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

export function uuid(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function initSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('buyer','supplier','admin')),
      full_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','pending')),
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      phone TEXT,
      avatar_url TEXT,
      bio TEXT,
      locale TEXT DEFAULT 'en-IN',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS buyer_profiles (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      company_name TEXT NOT NULL,
      buyer_type TEXT NOT NULL,
      country TEXT NOT NULL DEFAULT 'India',
      city TEXT NOT NULL DEFAULT 'Mumbai',
      website TEXT,
      annual_sourcing_volume TEXT,
      subscription_plan TEXT NOT NULL DEFAULT 'standard',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS artisan_clusters (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      state TEXT NOT NULL,
      region TEXT NOT NULL,
      primary_crafts TEXT NOT NULL,
      artisan_count_est INTEGER NOT NULL DEFAULT 0,
      description TEXT NOT NULL,
      map_x REAL NOT NULL,
      map_y REAL NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS supplier_profiles (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      business_name TEXT NOT NULL,
      supplier_type TEXT NOT NULL,
      cluster_id TEXT REFERENCES artisan_clusters(id),
      state TEXT NOT NULL,
      city TEXT NOT NULL,
      address TEXT,
      craft_heritage_summary TEXT NOT NULL,
      monthly_capacity_units INTEGER NOT NULL DEFAULT 250,
      default_moq INTEGER NOT NULL DEFAULT 50,
      default_lead_time_days INTEGER NOT NULL DEFAULT 21,
      customisation_supported INTEGER NOT NULL DEFAULT 1,
      export_ready INTEGER NOT NULL DEFAULT 1,
      verification_status TEXT NOT NULL DEFAULT 'pending' CHECK(verification_status IN ('unverified','pending','under_review','approved','rejected')),
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS supplier_verification (
      id TEXT PRIMARY KEY,
      supplier_id TEXT NOT NULL REFERENCES supplier_profiles(id) ON DELETE CASCADE,
      document_type TEXT NOT NULL,
      document_ref TEXT NOT NULL,
      submitted_notes TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','under_review','approved','rejected')),
      reviewed_by TEXT REFERENCES users(id),
      review_notes TEXT,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS product_categories (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      image_url TEXT NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      supplier_id TEXT NOT NULL REFERENCES supplier_profiles(id) ON DELETE CASCADE,
      category_id TEXT NOT NULL REFERENCES product_categories(id),
      sku TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT NOT NULL,
      craft_technique TEXT NOT NULL,
      materials TEXT NOT NULL,
      origin_city TEXT NOT NULL,
      origin_state TEXT NOT NULL,
      moq INTEGER NOT NULL DEFAULT 25,
      indicative_price_inr REAL NOT NULL,
      available_qty INTEGER NOT NULL DEFAULT 100,
      lead_time_days INTEGER NOT NULL DEFAULT 21,
      customisation_options TEXT NOT NULL DEFAULT 'Custom finish, dimensions, and packaging on bulk orders',
      image_url TEXT NOT NULL,
      popularity_score INTEGER NOT NULL DEFAULT 50,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','draft','flagged','archived')),
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS product_images (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      image_url TEXT NOT NULL,
      caption TEXT NOT NULL DEFAULT '',
      is_primary INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS product_specifications (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      spec_key TEXT NOT NULL,
      spec_value TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS supplier_capabilities (
      id TEXT PRIMARY KEY,
      supplier_id TEXT NOT NULL REFERENCES supplier_profiles(id) ON DELETE CASCADE,
      category_id TEXT NOT NULL REFERENCES product_categories(id),
      craft_technique TEXT NOT NULL,
      material_specialty TEXT NOT NULL,
      min_moq INTEGER NOT NULL DEFAULT 50,
      max_monthly_capacity INTEGER NOT NULL DEFAULT 300,
      avg_lead_time_days INTEGER NOT NULL DEFAULT 21,
      supports_customisation INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_workflows (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rfq_id TEXT,
      raw_prompt TEXT NOT NULL,
      extracted_spec_json TEXT NOT NULL,
      shortlist_json TEXT NOT NULL,
      pricing_summary_json TEXT NOT NULL,
      risk_flags_json TEXT NOT NULL,
      missing_info_json TEXT NOT NULL,
      suggested_actions_json TEXT NOT NULL,
      provider_used TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed',
      human_approval_status TEXT NOT NULL DEFAULT 'awaiting_confirmation',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_execution_logs (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL REFERENCES agent_workflows(id) ON DELETE CASCADE,
      agent_name TEXT NOT NULL,
      step_order INTEGER NOT NULL,
      status TEXT NOT NULL,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      input_summary TEXT NOT NULL,
      output_summary TEXT NOT NULL,
      tool_calls_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rfqs (
      id TEXT PRIMARY KEY,
      rfq_code TEXT UNIQUE NOT NULL,
      buyer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      category_id TEXT REFERENCES product_categories(id),
      description TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      target_unit_price_inr REAL,
      budget_min_inr REAL,
      budget_max_inr REAL,
      preferred_materials TEXT,
      craft_technique TEXT,
      customisation_requirements TEXT,
      moq_preference INTEGER,
      delivery_location TEXT NOT NULL,
      required_delivery_date TEXT,
      required_lead_days INTEGER,
      shipping_requirements TEXT,
      additional_instructions TEXT,
      reference_image_url TEXT,
      status TEXT NOT NULL DEFAULT 'submitted',
      selected_supplier_id TEXT REFERENCES supplier_profiles(id),
      ai_workflow_id TEXT REFERENCES agent_workflows(id),
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rfq_requirements (
      id TEXT PRIMARY KEY,
      rfq_id TEXT NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
      req_key TEXT NOT NULL,
      req_value TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'required',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rfq_supplier_matches (
      id TEXT PRIMARY KEY,
      rfq_id TEXT NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
      supplier_id TEXT NOT NULL REFERENCES supplier_profiles(id) ON DELETE CASCADE,
      overall_score REAL NOT NULL DEFAULT 0,
      dimension_scores_json TEXT NOT NULL DEFAULT '[]',
      missing_requirements_json TEXT NOT NULL DEFAULT '[]',
      potential_concerns_json TEXT NOT NULL DEFAULT '[]',
      recommendation_reason TEXT NOT NULL DEFAULT '',
      match_source TEXT NOT NULL DEFAULT 'ai_engine',
      invited_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'invited',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quotations (
      id TEXT PRIMARY KEY,
      quote_code TEXT UNIQUE NOT NULL,
      rfq_id TEXT NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
      supplier_id TEXT NOT NULL REFERENCES supplier_profiles(id) ON DELETE CASCADE,
      unit_price_inr REAL NOT NULL,
      total_product_cost_inr REAL NOT NULL,
      moq INTEGER NOT NULL,
      available_capacity INTEGER NOT NULL,
      estimated_production_days INTEGER NOT NULL,
      shipping_estimate_inr REAL NOT NULL DEFAULT 0,
      total_landed_cost_inr REAL NOT NULL,
      customisation_notes TEXT,
      conditions TEXT,
      validity_days INTEGER NOT NULL DEFAULT 21,
      status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','under_review','clarification_requested','revised','accepted','rejected')),
      is_saved INTEGER NOT NULL DEFAULT 0,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quotation_items (
      id TEXT PRIMARY KEY,
      quotation_id TEXT NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
      product_id TEXT REFERENCES products(id),
      item_description TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price_inr REAL NOT NULL,
      line_total_inr REAL NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS purchase_orders (
      id TEXT PRIMARY KEY,
      po_number TEXT UNIQUE NOT NULL,
      rfq_id TEXT REFERENCES rfqs(id),
      quotation_id TEXT REFERENCES quotations(id),
      buyer_id TEXT NOT NULL REFERENCES users(id),
      supplier_id TEXT NOT NULL REFERENCES supplier_profiles(id),
      title TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price_inr REAL NOT NULL,
      subtotal_inr REAL NOT NULL,
      shipping_inr REAL NOT NULL DEFAULT 0,
      total_amount_inr REAL NOT NULL,
      commission_rate REAL NOT NULL DEFAULT 0.08,
      platform_commission_inr REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'awaiting_buyer_approval',
      delivery_location TEXT NOT NULL,
      expected_delivery_date TEXT,
      buyer_approved_at TEXT,
      supplier_confirmed_at TEXT,
      payment_status TEXT NOT NULL DEFAULT 'unpaid',
      payment_adapter_note TEXT,
      dispute_reason TEXT,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      product_id TEXT REFERENCES products(id),
      description TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price_inr REAL NOT NULL,
      line_total_inr REAL NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_milestones (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      stage TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed',
      notes TEXT NOT NULL DEFAULT '',
      updated_by TEXT REFERENCES users(id),
      is_delayed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      buyer_id TEXT NOT NULL REFERENCES users(id),
      amount_inr REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      method TEXT NOT NULL DEFAULT 'Simulated Escrow Wire',
      adapter_mode TEXT NOT NULL DEFAULT 'simulated_mock',
      status TEXT NOT NULL DEFAULT 'captured_simulated',
      reference_code TEXT NOT NULL,
      is_demo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      buyer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      supplier_id TEXT NOT NULL REFERENCES supplier_profiles(id) ON DELETE CASCADE,
      rfq_id TEXT REFERENCES rfqs(id),
      order_id TEXT REFERENCES purchase_orders(id),
      subject TEXT NOT NULL,
      last_message_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      attachment_name TEXT,
      attachment_url TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      link_path TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS saved_products (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS saved_suppliers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      supplier_id TEXT NOT NULL REFERENCES supplier_profiles(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, supplier_id)
    );

    CREATE TABLE IF NOT EXISTS platform_commissions (
      id TEXT PRIMARY KEY,
      order_id TEXT UNIQUE NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      gmv_inr REAL NOT NULL,
      commission_rate REAL NOT NULL,
      commission_amount_inr REAL NOT NULL,
      managed_sourcing_fee_inr REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','realised','cancelled')),
      realised_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS platform_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_by TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_id TEXT REFERENCES users(id),
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      details_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
    CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier_id);
    CREATE INDEX IF NOT EXISTS idx_products_state ON products(origin_state);
    CREATE INDEX IF NOT EXISTS idx_rfqs_buyer ON rfqs(buyer_id);
    CREATE INDEX IF NOT EXISTS idx_rfqs_status ON rfqs(status);
    CREATE INDEX IF NOT EXISTS idx_quotations_rfq ON quotations(rfq_id);
    CREATE INDEX IF NOT EXISTS idx_quotations_supplier ON quotations(supplier_id);
    CREATE INDEX IF NOT EXISTS idx_orders_buyer ON purchase_orders(buyer_id);
    CREATE INDEX IF NOT EXISTS idx_orders_supplier ON purchase_orders(supplier_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON purchase_orders(status);
    CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
    CREATE INDEX IF NOT EXISTS idx_agent_logs_workflow ON agent_execution_logs(workflow_id);
    CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
  `);
}

export function writeAuditLog(params: {
  actorId: string | null;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: Record<string, unknown>;
}): void {
  const stmt = db.prepare(`
    INSERT INTO audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, details_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    uuid(),
    params.actorId,
    params.actorRole,
    params.action,
    params.entityType,
    params.entityId,
    JSON.stringify(params.details ?? {}),
    nowIso(),
  );
}

export function createNotification(params: {
  userId: string;
  type: string;
  title: string;
  message: string;
  linkPath?: string;
}): void {
  const stmt = db.prepare(`
    INSERT INTO notifications (id, user_id, type, title, message, link_path, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?)
  `);
  stmt.run(
    uuid(),
    params.userId,
    params.type,
    params.title,
    params.message,
    params.linkPath ?? null,
    nowIso(),
  );
}

export function getSetting(key: string, fallback: string): string {
  const row = db.prepare('SELECT value FROM platform_settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? fallback;
}
