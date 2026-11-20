const TOKEN_KEY = 'folkform_session_token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore storage restriction
  }
}

export async function apiRequest<T = any>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(path.startsWith('/api') ? path : `/api${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  const text = await res.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text || 'Unexpected server response.' };
  }

  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export function formatInr(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—';
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

export function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatOrderStatus(status: string): string {
  const map: Record<string, string> = {
    rfq_submitted: 'RFQ Submitted',
    submitted: 'Submitted',
    supplier_contacted: 'Suppliers Invited',
    quotation_received: 'Quotations Received',
    negotiation: 'Negotiation',
    awaiting_buyer_approval: 'Awaiting Buyer Approval',
    purchase_order_created: 'Purchase Order Issued',
    supplier_confirmed: 'Supplier Confirmed',
    production_started: 'Production Started',
    quality_check: 'Quality Check',
    ready_for_dispatch: 'Ready for Dispatch',
    shipped: 'Shipped',
    delivered: 'Delivered',
    completed: 'Completed',
    disputed: 'Disputed',
    cancelled: 'Cancelled',
  };
  return map[status] || status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatVerificationLabel(status: string, isDemo?: boolean): string {
  const base: Record<string, string> = {
    approved: isDemo ? 'Demo Verified' : 'Verified Partner',
    under_review: 'Under Review',
    pending: 'Verification Pending',
    rejected: 'Action Needed',
    unverified: 'Unverified',
  };
  return base[status] || status;
}
