import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/button';
import NotificationBell from './NotificationBell';
import { useAuth } from '../contexts/AuthContext';
import {
  Terminal, LayoutDashboard, FileCode, ListChecks, Activity, Settings, LogOut,
  BookOpen, Trophy, BarChart3, Flag, Pencil, Zap, Sun, Moon, User, Globe,
  Menu, X, Users, ClipboardList, ShieldAlert, Radio, Target, Inbox,
  Shield, UserCog, History, BookMarked,
} from 'lucide-react';

const LANGUAGES = [
  { code: 'en', label: 'EN', name: 'English' },
  { code: 'id', label: 'ID', name: 'Bahasa Indonesia' },
];

// ── Navigation definitions per role ───────────────────────────────────────

function buildAdminNav(t) {
  return [
    {
      section: 'COMMAND',
      items: [
        { name: 'Command Center', path: '/', icon: Radio },
        { name: 'All Users', path: '/users', icon: UserCog },
        { name: t('instructor.groups'), path: '/trainer/groups', icon: Users },
        { name: t('instructor.assignments'), path: '/trainer/assignments', icon: ClipboardList },
        { name: t('instructor.reports'), path: '/trainer/reports', icon: ShieldAlert },
        { name: 'Riwayat User', path: '/trainer/user-history', icon: History },
      ],
    },
    {
      section: 'TRAINING',
      items: [
        { name: t('nav.scenarios'), path: '/scenarios', icon: FileCode },
        { name: t('nav.campaigns'), path: '/campaigns', icon: Flag },
        { name: t('nav.quizzes'), path: '/quizzes', icon: ListChecks },
        { name: t('nav.ai_challenge'), path: '/ai-challenge', icon: Zap },
        { name: t('nav.scenario_builder'), path: '/scenario-builder', icon: Pencil },
      ],
    },
    {
      section: 'SYSTEM',
      items: [
        { name: t('nav.analytics'), path: '/analytics', icon: BarChart3 },
        { name: 'Glosarium', path: '/glossary', icon: BookMarked },
        { name: t('nav.settings'), path: '/settings', icon: Settings },
      ],
    },
  ];
}

function buildTrainerNav(t) {
  return [
    {
      section: 'TRAINING MGMT',
      items: [
        { name: 'Command Center', path: '/', icon: Radio },
        { name: 'Users', path: '/users', icon: UserCog },
        { name: t('instructor.groups'), path: '/trainer/groups', icon: Users },
        { name: t('instructor.assignments'), path: '/trainer/assignments', icon: ClipboardList },
        { name: t('instructor.reports'), path: '/trainer/reports', icon: ShieldAlert },
        { name: 'Riwayat User', path: '/trainer/user-history', icon: History },
      ],
    },
    {
      section: 'CONTENT',
      items: [
        { name: t('nav.scenarios'), path: '/scenarios', icon: FileCode },
        { name: t('nav.campaigns'), path: '/campaigns', icon: Flag },
        { name: t('nav.quizzes'), path: '/quizzes', icon: ListChecks },
        { name: t('nav.ai_challenge'), path: '/ai-challenge', icon: Zap },
        { name: t('nav.scenario_builder'), path: '/scenario-builder', icon: Pencil },
      ],
    },
    {
      section: 'ACCOUNT',
      items: [
        { name: t('nav.analytics'), path: '/analytics', icon: BarChart3 },
        { name: 'Glosarium', path: '/glossary', icon: BookMarked },
        { name: t('nav.settings'), path: '/settings', icon: Settings },
      ],
    },
  ];
}

function buildUserNav(t) {
  return [
    {
      section: 'TRAINING',
      items: [
        { name: t('nav.dashboard'), path: '/', icon: LayoutDashboard },
        { name: 'My Assignments', path: '/my-assignments', icon: Inbox },
        { name: t('nav.scenarios'), path: '/scenarios', icon: Target },
        { name: t('nav.quizzes'), path: '/quizzes', icon: ListChecks },
        { name: t('nav.ai_challenge'), path: '/ai-challenge', icon: Zap },
        { name: t('nav.campaigns'), path: '/campaigns', icon: Flag },
      ],
    },
    {
      section: 'PROGRESS',
      items: [
        { name: t('nav.history'), path: '/simulations', icon: Activity },
        { name: t('nav.analytics'), path: '/analytics', icon: BarChart3 },
        { name: t('nav.leaderboard'), path: '/leaderboard', icon: Trophy },
        { name: t('nav.glossary'), path: '/glossary', icon: BookOpen },
      ],
    },
    {
      section: 'ACCOUNT',
      items: [
        { name: t('nav.settings'), path: '/settings', icon: Settings },
      ],
    },
  ];
}

// ── Role badge config ──────────────────────────────────────────────────────

const ROLE_CONFIG = {
  admin: {
    label: 'Admin',
    color: 'text-red-400 border-red-400/30',
    description: 'Full Access',
  },
  trainer: {
    label: 'Trainer',
    color: 'text-yellow-400 border-yellow-400/30',
    description: 'Training Management',
  },
  user: {
    label: 'User',
    color: 'text-primary/60 border-primary/20',
    description: 'Participant',
  },
};

export default function Layout({ children, onLogout }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const location = useLocation();
  const [theme, setTheme] = useState(localStorage.getItem('soceng_theme') || 'dark');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);

  const role = user?.role || 'user';
  const roleConfig = ROLE_CONFIG[role] || ROLE_CONFIG.user;

  const navGroups = role === 'admin'
    ? buildAdminNav(t)
    : role === 'trainer'
      ? buildTrainerNav(t)
      : buildUserNav(t);

  const handleLogout = () => {
    localStorage.removeItem('soceng_token');
    localStorage.removeItem('soceng_user');
    onLogout();
  };

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('soceng_theme', newTheme);
    document.documentElement.classList.toggle('light', newTheme === 'light');
  };

  const changeLanguage = (code) => {
    i18n.changeLanguage(code);
    localStorage.setItem('soceng_language', code);
    setLangMenuOpen(false);
  };

  const currentLang = LANGUAGES.find((l) => l.code === i18n.language) || LANGUAGES[0];

  const SidebarContent = ({ mobile = false }) => (
    <div className={`${mobile ? 'relative' : 'fixed inset-y-0 left-0'} w-72 bg-black/70 backdrop-blur-md border-r border-primary/20 flex flex-col z-40`}>

      {/* Logo */}
      <div className="p-5 border-b border-primary/20 relative overflow-hidden group">
        <div className="absolute inset-0 bg-primary/5 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
        <div className="relative z-10 flex items-center justify-between">
          <Link to="/" onClick={() => setSidebarOpen(false)}>
            <div className="flex items-center space-x-2.5 mb-1">
              <Terminal className="w-6 h-6 text-primary animate-pulse-slow" />
              <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary via-white to-primary glitch" data-text="PRETEXTA">
                PRETEXTA
              </h1>
            </div>
            <p className="text-[9px] text-primary/50 tracking-widest uppercase pl-9">
              {t('app.tagline')}
            </p>
          </Link>
          {mobile && (
            <button onClick={() => setSidebarOpen(false)} className="text-muted-foreground hover:text-primary p-1">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* User identity + role badge */}
      {user && (
        <div className="px-4 py-2.5 border-b border-primary/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 bg-primary/10 border border-primary/25 flex items-center justify-center flex-shrink-0">
                <User className="w-3.5 h-3.5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-mono font-bold text-foreground truncate max-w-[140px]">
                  {user.display_name || user.username}
                </p>
                <p className="text-[9px] text-muted-foreground font-mono truncate">
                  @{user.username}
                </p>
              </div>
            </div>
            <span className={`text-[9px] font-mono uppercase tracking-widest border px-1.5 py-0.5 flex-shrink-0 ${roleConfig.color}`}>
              {roleConfig.label}
            </span>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2">
        {navGroups.map((group) => (
          <div key={group.section} className="mb-1">
            <p className="px-4 pt-3 pb-1 text-[9px] font-mono font-bold text-muted-foreground/40 uppercase tracking-[0.2em]">
              {group.section}
            </p>
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path ||
                (item.path !== '/' && location.pathname.startsWith(item.path));
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-4 py-2 border-l-2 transition-all duration-150 group relative overflow-hidden ${
                    isActive
                      ? 'border-primary bg-primary/8 text-primary'
                      : 'border-transparent text-muted-foreground hover:text-primary hover:bg-primary/5 hover:border-primary/30'
                  }`}
                >
                  <div className={`absolute inset-0 bg-primary/4 translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-150 ${isActive ? 'translate-x-0' : ''}`} />
                  <Icon className={`w-3.5 h-3.5 relative z-10 flex-shrink-0 ${isActive ? 'drop-shadow-[0_0_4px_rgba(0,229,255,0.5)]' : ''}`} />
                  <span className="relative z-10 text-[11px] font-mono font-semibold tracking-wide truncate">
                    {isActive && <span className="mr-1 blink">&gt;</span>}
                    {item.name}
                  </span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Bottom bar */}
      <div className="p-3 border-t border-primary/20 bg-black/30 space-y-2">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1">
            <button
              onClick={toggleTheme}
              className="p-1.5 text-muted-foreground hover:text-primary transition-colors"
              title={theme === 'dark' ? t('settings.light_mode') : t('settings.dark_mode')}
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>

            <div className="relative">
              <button
                onClick={() => setLangMenuOpen((v) => !v)}
                className="p-1.5 text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
              >
                <Globe className="w-3.5 h-3.5" />
                <span className="text-[9px] font-mono font-bold">{currentLang.label}</span>
              </button>
              {langMenuOpen && (
                <div className="absolute bottom-full left-0 mb-1 bg-black/95 border border-primary/30 shadow-xl z-50 min-w-[160px]">
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => changeLanguage(lang.code)}
                      className={`w-full text-left px-3 py-2 text-[11px] font-mono hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2 ${
                        lang.code === i18n.language ? 'text-primary bg-primary/5' : 'text-muted-foreground'
                      }`}
                    >
                      <span className="font-bold w-5">{lang.label}</span>
                      <span>{lang.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <NotificationBell />
          </div>

          <Link
            to="/profile"
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 text-muted-foreground hover:text-primary transition-colors"
          >
            <User className="w-3.5 h-3.5" />
          </Link>
        </div>

        <Button
          variant="ghost"
          className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 border border-transparent hover:border-destructive/30 rounded-none transition-all uppercase tracking-widest text-[10px] font-bold h-8"
          onClick={handleLogout}
          data-testid="logout-btn"
        >
          <LogOut className="w-3.5 h-3.5 mr-2" />
          {t('auth.logout')}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground font-mono relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none z-50 scanlines opacity-20" />

      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <SidebarContent />
      </div>

      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-black/80 backdrop-blur-md border-b border-primary/20 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-primary" />
          <span className="font-bold text-sm font-mono text-primary">PRETEXTA</span>
          <span className={`text-[9px] font-mono uppercase tracking-widest border px-1.5 py-0.5 ${roleConfig.color}`}>
            {roleConfig.label}
          </span>
        </div>
        <button onClick={() => setSidebarOpen(true)} className="p-2 text-muted-foreground hover:text-primary transition-colors">
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <div className="relative z-50 w-72 h-full overflow-y-auto">
            <SidebarContent mobile />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="lg:ml-72 min-h-screen relative z-10">
        <div className="pt-14 lg:pt-0">
          <div className="p-4 md:p-8 max-w-7xl mx-auto">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
