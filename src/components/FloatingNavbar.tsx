import React from 'react';
import { LogOut, LogIn, Layers } from 'lucide-react';
import type { UserDocument } from '../types';

interface FloatingNavbarProps {
  activeView: 'landing' | 'workspace' | 'auth';
  setActiveView: (view: 'landing' | 'workspace' | 'auth') => void;
  currentUser: UserDocument | null;
  onLogout: () => void;
  onOpenAuth: () => void;
}

export const FloatingNavbar: React.FC<FloatingNavbarProps> = ({
  activeView,
  setActiveView,
  currentUser,
  onLogout,
  onOpenAuth,
}) => {
  // Removed Results tab per user request
  const navItems = [
    { label: 'Home', href: '#home' },
    { label: 'Courses', href: '#courses' },
    { label: 'Mentors', href: '#mentors' },
    { label: 'Contact', href: '#contact' },
  ];

  const handleNavClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string
  ) => {
    e.preventDefault();
    if (activeView !== 'landing') {
      setActiveView('landing');
      setTimeout(() => {
        const el = document.querySelector(href);
        el?.scrollIntoView({ behavior: 'smooth' });
      }, 60);
    } else {
      const el = document.querySelector(href);
      el?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <header className="fixed top-4 md:top-5 inset-x-4 md:inset-x-6 z-50 mx-auto max-w-[1280px]">
      <nav
        aria-label="Primary Navigation"
        className="glass-nav rounded-full px-4 sm:px-5 md:px-7 py-3 sm:py-3.5 flex items-center justify-between gap-2 sm:gap-4 md:gap-8"
      >
        {/* Zone 1: Brand Wordmark */}
        <a
          href="#home"
          onClick={(e) => handleNavClick(e, '#home')}
          className="font-display text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)] whitespace-nowrap shrink-0"
        >
          GRASP<span className="text-[var(--red)]">IT</span>
        </a>

        {/* Zone 2: Four centered text links (Home, Courses, Mentors, Contact) */}
        <div className="hidden md:flex items-center justify-center gap-7 text-sm font-medium text-[var(--text-body)]">
          {navItems.map((item) => (
            <a
              key={item.label}
              href={item.href}
              onClick={(e) => handleNavClick(e, item.href)}
              className="hover:text-[var(--red)] transition-colors whitespace-nowrap shrink-0 py-1"
            >
              {item.label}
            </a>
          ))}
        </div>

        {/* Zone 3: Workspace / Auth Controls + Logout Button (Replaces Hamburger Menu) */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {currentUser ? (
            <>
              <button
                type="button"
                onClick={() =>
                  setActiveView(
                    activeView === 'workspace' ? 'landing' : 'workspace'
                  )
                }
                className="btn-secondary-outline rounded-full px-3 sm:px-4 py-1.5 sm:py-2 text-xs font-semibold whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5 text-[var(--red)]" />
                <span>
                  {activeView === 'workspace'
                    ? 'Home'
                    : `${currentUser.role.toUpperCase()} Portal`}
                </span>
              </button>

              <button
                type="button"
                onClick={onLogout}
                title={`Signed in as ${currentUser.name} (${currentUser.role})`}
                className="btn-crimson rounded-full px-3 sm:px-4 md:px-5 py-1.5 sm:py-2 text-xs font-semibold whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5 text-[var(--red)]" />
                <span>Logout</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onOpenAuth}
              className="btn-crimson rounded-full px-4 sm:px-5 py-2 text-xs md:text-sm font-semibold whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5 text-[var(--red)]" />
              <span>Login / Sign Up</span>
            </button>
          )}
        </div>
      </nav>
    </header>
  );
};
