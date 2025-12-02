import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/button';
import { Terminal, LayoutDashboard, FileCode, ListChecks, Activity, Settings, LogOut } from 'lucide-react';

export default function Layout({ children, onLogout }) {
  const { t } = useTranslation();
  const location = useLocation();

  const navigation = [
    { name: t('nav.dashboard'), path: '/', icon: LayoutDashboard },
    { name: t('nav.scenarios'), path: '/scenarios', icon: FileCode },
    { name: t('nav.quizzes'), path: '/quizzes', icon: ListChecks },
    { name: t('nav.ai_challenge'), path: '/ai-challenge', icon: Activity },
    { name: t('nav.history'), path: '/simulations', icon: Activity },
    { name: t('nav.settings'), path: '/settings', icon: Settings }
  ];

  const handleLogout = () => {
    localStorage.removeItem('soceng_token');
    localStorage.removeItem('soceng_user');
    onLogout();
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <div className="fixed inset-y-0 left-0 w-64 bg-card border-r border-border">
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-6 border-b border-border">
            <Link to="/" className="flex items-center space-x-3 group">
              <Terminal className="w-8 h-8 text-primary group-hover:animate-pulse-slow" />
              <span className="text-xl font-bold glitch text-primary">
                SOCENG_LAB
              </span>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-2">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center space-x-3 px-4 py-3 rounded-md transition-colors font-mono text-sm ${
                    isActive
                      ? 'bg-primary/10 text-primary border border-primary/30'
                      : 'text-muted-foreground hover:bg-muted/10 hover:text-foreground'
                  }`}
                  data-testid={`nav-${item.path.replace('/', '') || 'dashboard'}`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* Logout */}
          <div className="p-4 border-t border-border">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={handleLogout}
              data-testid="logout-btn"
            >
              <LogOut className="w-4 h-4 mr-2" />
              {t('auth.logout')}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="ml-64 min-h-screen">
        <div className="p-8">
          {children}
        </div>
      </div>
    </div>
  );
}