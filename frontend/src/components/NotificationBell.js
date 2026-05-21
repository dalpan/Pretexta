import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, Trophy, Info, AlertTriangle, Clock } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';

export default function NotificationBell() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, []);

  const loadNotifications = async () => {
    try {
      if (!isAuthenticated) return;
      const response = await api.get('/notifications?limit=20');
      setNotifications(response.data.notifications || []);
      setUnreadCount(response.data.unread_count || 0);
    } catch {
      // Silent fail — notification errors should not disrupt the user
    }
  };

  const markAllRead = async () => {
    try {
      await api.put('/notifications/read-all', {});
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      // Silent fail
    }
  };

  const getIcon = (type) => {
    switch (type) {
      case 'achievement': return <Trophy className="w-4 h-4 text-yellow-400" />;
      case 'alert': return <AlertTriangle className="w-4 h-4 text-red-400" />;
      case 'reminder': return <Clock className="w-4 h-4 text-blue-400" />;
      default: return <Info className="w-4 h-4 text-primary" />;
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-muted-foreground hover:text-primary transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-10 z-50 w-80 glass-panel border border-primary/30 shadow-2xl max-h-96 overflow-hidden">
            <div className="p-3 border-b border-primary/20 flex items-center justify-between">
              <span className="font-mono text-xs uppercase tracking-widest text-primary">{t('notifications.title')}</span>
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-[10px] text-muted-foreground hover:text-primary font-mono">
                  {t('notifications.mark_all_read')}
                </button>
              )}
            </div>
            <div className="overflow-y-auto max-h-72">
              {notifications.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground font-mono text-xs">{t('notifications.no_notifications')}</div>
              ) : (
                notifications.map((notif) => (
                  <div
                    key={notif.id}
                    className={`p-3 border-b border-white/5 flex items-start gap-3 transition-colors ${
                      !notif.read ? 'bg-primary/5' : ''
                    }`}
                  >
                    {getIcon(notif.type)}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono font-bold truncate">{notif.title}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{notif.message}</p>
                      <p className="text-[9px] text-muted-foreground/50 mt-1">
                        {new Date(notif.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
