import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';
import type { AuthUser } from '../types';

interface NavbarProps {
  currentPath: string;
  user: AuthUser | null;
  onNavigate: (path: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentPath, user, onNavigate }) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { label: 'Collections', path: '/marketplace' },
    { label: 'Makers', path: '/suppliers' },
    { label: 'AI Sourcing', path: user?.role === 'buyer' ? '/buyer/ai-sourcing' : '/ai-preview' },
    { label: 'For Artisans', path: '/onboard-supplier' },
  ];

  const workspacePath =
    user?.role === 'admin'
      ? '/admin/overview'
      : user?.role === 'supplier'
        ? '/supplier/overview'
        : '/buyer/overview';

  const handleLink = (path: string) => {
    setMobileOpen(false);
    onNavigate(path);
  };

  return (
    <header className="sticky top-0 z-40 bg-[#F8F3E8]/95 backdrop-blur-sm border-b border-[#E9DCC7]">
      <div className="max-w-[1360px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => handleLink('/')}
          className="font-serif text-2xl font-semibold tracking-tight text-[#3A2319] whitespace-nowrap shrink-0 cursor-pointer"
        >
          Folkform
        </button>

        {/* Zone 2: Clean single-line text links */}
        <nav className="hidden md:flex items-center gap-8" aria-label="Primary Navigation">
          {navItems.map((item) => {
            const active =
              currentPath === item.path ||
              (item.path === '/marketplace' && currentPath.startsWith('/products'));
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => handleLink(item.path)}
                className={`text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer pb-0.5 border-b ${
                  active
                    ? 'text-[#B05330] border-[#B05330]'
                    : 'text-[#3A2319]/80 border-transparent hover:text-[#3A2319] hover:border-[#3A2319]/40'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Single Primary Action */}
        <div className="hidden md:flex items-center shrink-0">
          <button
            type="button"
            onClick={() => handleLink(user ? workspacePath : '/auth')}
            className="px-5 py-2.5 bg-[#3A2319] hover:bg-[#2A1912] text-[#FFFCF6] text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {user ? 'Open Workspace' : 'Sign In / Demo'}
          </button>
        </div>

        {/* Mobile menu button */}
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden p-2 text-[#3A2319] cursor-pointer"
          aria-label="Toggle navigation menu"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden bg-[#FFFCF6] border-b border-[#E9DCC7] px-6 py-4 space-y-3">
          {navItems.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => handleLink(item.path)}
              className="block w-full text-left py-2 text-sm font-medium text-[#3A2319] border-b border-[#E9DCC7]/60"
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => handleLink(user ? workspacePath : '/auth')}
            className="w-full py-2.5 bg-[#3A2319] text-[#FFFCF6] text-sm font-medium mt-2"
          >
            {user ? 'Open Workspace' : 'Sign In / Demo'}
          </button>
        </div>
      )}
    </header>
  );
};
