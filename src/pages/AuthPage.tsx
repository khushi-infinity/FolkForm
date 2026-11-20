import React, { useState } from 'react';
import { ArrowRight, Building2, Shield, Sparkles } from 'lucide-react';
import { apiRequest, setStoredToken } from '../lib/api';
import type { AuthUser } from '../types';

interface AuthPageProps {
  onAuthSuccess: (user: AuthUser) => void;
  onNavigate: (path: string) => void;
  onToast: (msg: string) => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onAuthSuccess, onNavigate, onToast }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);

  // Login form
  const [email, setEmail] = useState('buyer@folkform.demo');
  const [password, setPassword] = useState('folkform123');

  // Register form
  const [reg, setReg] = useState({
    fullName: '',
    email: '',
    password: '',
    role: 'buyer' as 'buyer' | 'supplier',
    companyName: '',
    organizationType: 'Hospitality Business',
    city: 'Mumbai',
    stateOrCountry: 'India',
  });

  const redirectForRole = (role: AuthUser['role']) => {
    if (role === 'admin') onNavigate('/admin/overview');
    else if (role === 'supplier') onNavigate('/supplier/overview');
    else onNavigate('/buyer/overview');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiRequest<{ token: string; user: AuthUser }>('/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      setStoredToken(res.token);
      onAuthSuccess(res.user);
      onToast(`Signed in as ${res.user.fullName}.`);
      redirectForRole(res.user.role);
    } catch (err: any) {
      onToast(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiRequest<{ token: string; user: AuthUser }>('/auth/register', {
        method: 'POST',
        body: reg,
      });
      setStoredToken(res.token);
      onAuthSuccess(res.user);
      onToast(`Account created for ${res.user.fullName}.`);
      redirectForRole(res.user.role);
    } catch (err: any) {
      onToast(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemo = async (role: 'buyer' | 'supplier' | 'admin') => {
    setLoading(true);
    try {
      const res = await apiRequest<{ token: string; user: AuthUser }>('/auth/demo-login', {
        method: 'POST',
        body: { role },
      });
      setStoredToken(res.token);
      onAuthSuccess(res.user);
      onToast(`Signed into Demo ${role.charAt(0).toUpperCase() + role.slice(1)} Workspace.`);
      redirectForRole(res.user.role);
    } catch (err: any) {
      onToast(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        {/* Left: Instant Demo Role Access */}
        <div className="lg:col-span-6 space-y-6">
          <div>
            <p className="text-xs font-medium text-[#7A5E4B]">
              End-to-End Platform Demonstration · Role-Based Access Control
            </p>
            <h1 className="font-serif text-4xl font-semibold text-[#3A2319] mt-1">
              Sign In to Folkform
            </h1>
            <p className="text-sm text-[#5C4334] mt-3 leading-relaxed">
              Test the complete 17-step global procurement journey — from natural-language AI
              sourcing and supplier quotations to buyer PO approval, workshop production tracking,
              and Admin GMV revenue realization.
            </p>
          </div>

          <div className="space-y-4">
            <p className="text-xs font-medium text-[#7A5E4B]">
              One-Click Seeded Demo Accounts (Password: <span className="font-mono">folkform123</span>)
            </p>

            {[
              {
                role: 'buyer' as const,
                icon: Sparkles,
                title: 'Buyer Procurement Desk',
                person: 'Meera Kapoor · Aranya Boutique Hotels & Resorts',
                email: 'buyer@folkform.demo',
                desc: 'Run Folkform AI Sourcing, compare 3 Jaipur ceramic lamp quotations side by side, draft & approve POs, and track orders.',
              },
              {
                role: 'supplier' as const,
                icon: Building2,
                title: 'Artisan / Supplier Portal',
                person: 'Raghav Kumawat · Sanganer Clay & Kiln Collective (Jaipur)',
                email: 'supplier@folkform.demo',
                desc: 'Inspect incoming buyer RFQs, submit competitive quotations, confirm POs, update production milestones, and manage SKUs.',
              },
              {
                role: 'admin' as const,
                icon: Shield,
                title: 'Admin Control Center',
                person: 'Ananya Deshmukh · Folkform Operations',
                email: 'admin@folkform.demo',
                desc: 'Monitor GMV vs realised platform revenue, review supplier verifications, inspect 8-agent AI logs, and mediate disputes.',
              },
            ].map((card) => (
              <div
                key={card.role}
                className="bg-[#FFFCF6] border border-[#E9DCC7] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <card.icon className="w-4 h-4 text-[#B05330]" />
                    <h2 className="font-sans text-sm font-semibold text-[#3A2319]">{card.title}</h2>
                  </div>
                  <p className="text-xs font-medium text-[#5C4334] mt-1">{card.person}</p>
                  <p className="text-xs text-[#7A5E4B] mt-1 leading-relaxed">{card.desc}</p>
                  <p className="text-[11px] font-mono text-[#7A5E4B] mt-1.5">{card.email}</p>
                </div>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleQuickDemo(card.role)}
                  className="px-4 py-2.5 bg-[#3A2319] hover:bg-[#B05330] text-[#FFFCF6] text-xs font-medium transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <span>Enter</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Standard Email / Password Auth Form */}
        <div className="lg:col-span-6 bg-[#FFFCF6] border border-[#E9DCC7] p-8">
          <div className="flex border-b border-[#E9DCC7] mb-6">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`pb-3 pr-6 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                mode === 'login'
                  ? 'border-[#B05330] text-[#3A2319]'
                  : 'border-transparent text-[#7A5E4B]'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setMode('register')}
              className={`pb-3 px-6 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                mode === 'register'
                  ? 'border-[#B05330] text-[#3A2319]'
                  : 'border-transparent text-[#7A5E4B]'
              }`}
            >
              Create Account
            </button>
          </div>

          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#7A5E4B] mb-1">
                  Work Email Address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#F8F3E8] border border-[#E9DCC7] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#7A5E4B] mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#F8F3E8] border border-[#E9DCC7] text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-[#B05330] hover:bg-[#964425] text-[#FFFCF6] text-sm font-medium transition-colors cursor-pointer disabled:opacity-60"
              >
                {loading ? 'Signing In…' : 'Sign In'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#7A5E4B] mb-1.5">
                  Account Role
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setReg({ ...reg, role: 'buyer', organizationType: 'Hospitality Business' })
                    }
                    className={`py-2.5 text-xs font-medium border cursor-pointer ${
                      reg.role === 'buyer'
                        ? 'bg-[#3A2319] text-[#FFFCF6] border-[#3A2319]'
                        : 'bg-[#F8F3E8] text-[#3A2319] border-[#E9DCC7]'
                    }`}
                  >
                    B2B Buyer / Retailer
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setReg({ ...reg, role: 'supplier', organizationType: 'Craft Cooperative' })
                    }
                    className={`py-2.5 text-xs font-medium border cursor-pointer ${
                      reg.role === 'supplier'
                        ? 'bg-[#3A2319] text-[#FFFCF6] border-[#3A2319]'
                        : 'bg-[#F8F3E8] text-[#3A2319] border-[#E9DCC7]'
                    }`}
                  >
                    Artisan / Supplier
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#7A5E4B] mb-1">
                    Full Name *
                  </label>
                  <input
                    required
                    value={reg.fullName}
                    onChange={(e) => setReg({ ...reg, fullName: e.target.value })}
                    className="w-full px-3 py-2 bg-[#F8F3E8] border border-[#E9DCC7] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#7A5E4B] mb-1">
                    {reg.role === 'buyer' ? 'Company Name *' : 'Workshop / Collective Name *'}
                  </label>
                  <input
                    required
                    value={reg.companyName}
                    onChange={(e) => setReg({ ...reg, companyName: e.target.value })}
                    className="w-full px-3 py-2 bg-[#F8F3E8] border border-[#E9DCC7] text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#7A5E4B] mb-1">
                    Organisation Type
                  </label>
                  <select
                    value={reg.organizationType}
                    onChange={(e) => setReg({ ...reg, organizationType: e.target.value })}
                    className="w-full px-3 py-2 bg-[#F8F3E8] border border-[#E9DCC7] text-sm"
                  >
                    {reg.role === 'buyer' ? (
                      <>
                        <option>Retail Business</option>
                        <option>International Wholesaler</option>
                        <option>Hospitality Business</option>
                        <option>Interior Designer</option>
                        <option>Corporate Gifting Company</option>
                        <option>Exporter & Distributor</option>
                      </>
                    ) : (
                      <>
                        <option>Individual Artisan</option>
                        <option>Weavers</option>
                        <option>Craft Cooperative</option>
                        <option>Self-Help Group</option>
                        <option>Small Manufacturer</option>
                        <option>Artisan Collective</option>
                      </>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#7A5E4B] mb-1">
                    City & State/Country
                  </label>
                  <input
                    required
                    value={reg.city}
                    onChange={(e) => setReg({ ...reg, city: e.target.value })}
                    placeholder="e.g. Udaipur"
                    className="w-full px-3 py-2 bg-[#F8F3E8] border border-[#E9DCC7] text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#7A5E4B] mb-1">Email *</label>
                <input
                  type="email"
                  required
                  value={reg.email}
                  onChange={(e) => setReg({ ...reg, email: e.target.value })}
                  className="w-full px-3 py-2 bg-[#F8F3E8] border border-[#E9DCC7] text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#7A5E4B] mb-1">
                  Password (min 6 characters) *
                </label>
                <input
                  type="password"
                  minLength={6}
                  required
                  value={reg.password}
                  onChange={(e) => setReg({ ...reg, password: e.target.value })}
                  className="w-full px-3 py-2 bg-[#F8F3E8] border border-[#E9DCC7] text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-[#B05330] hover:bg-[#964425] text-[#FFFCF6] text-sm font-medium transition-colors cursor-pointer disabled:opacity-60"
              >
                {loading ? 'Creating Account…' : 'Create Account & Continue'}
              </button>

              {reg.role === 'supplier' && (
                <p className="text-xs text-[#7A5E4B] text-center">
                  Need full workshop onboarding with catalogue & verification docs?{' '}
                  <button
                    type="button"
                    onClick={() => onNavigate('/onboard-supplier')}
                    className="text-[#B05330] underline cursor-pointer"
                  >
                    Use 5-Step Supplier Onboarding
                  </button>
                </p>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
