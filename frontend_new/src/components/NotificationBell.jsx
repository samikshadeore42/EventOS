import { useState, useRef, useEffect } from 'react';
import { useNotifications } from '../context/NotificationContext';

function formatNotifTime(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const then = new Date(dateStr);
  const timeStr = then.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });

  // Same calendar day → "Today, 5:14 PM"
  if (now.toDateString() === then.toDateString()) {
    return `Today, ${timeStr}`;
  }

  // Yesterday
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (yesterday.toDateString() === then.toDateString()) {
    return `Yesterday, ${timeStr}`;
  }

  // Older → "Jun 11, 3:20 PM"
  const datePartStr = then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${datePartStr}, ${timeStr}`;
}

export function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-full hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500"
      >
        <svg 
          className="w-6 h-6 text-slate-600" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold text-white transform translate-x-1/4 -translate-y-1/4 bg-red-600 rounded-full border-2 border-slate-50 shadow-sm">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-slate-900 border border-slate-700/50 rounded-xl shadow-2xl z-50 overflow-hidden backdrop-blur-xl">
          <div className="p-4 border-b border-slate-700/50 flex justify-between items-center bg-slate-800/50">
            <h3 className="text-sm font-semibold text-white">Notifications</h3>
            <div className="flex items-center gap-3">
              {unreadCount > 0 && (
                <button 
                  onClick={(e) => { e.stopPropagation(); markAllAsRead(); }}
                  className="text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  Mark all read
                </button>
              )}
              {unreadCount > 0 && (
                <span className="text-xs text-cyan-400 font-medium bg-cyan-400/10 px-2 py-1 rounded-full">
                  {unreadCount} new
                </span>
              )}
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-sm">
                No notifications yet.
              </div>
            ) : (
              <ul className="divide-y divide-slate-800">
                {notifications.map((notif) => (
                  <li 
                    key={notif.id} 
                    className={`p-4 hover:bg-slate-800/50 transition-colors cursor-pointer ${notif.is_read ? 'opacity-70' : 'bg-cyan-900/10'}`}
                    onClick={() => !notif.is_read && markAsRead(notif.id)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className={`text-sm ${notif.is_read ? 'text-slate-300' : 'text-white font-medium'}`}>
                          {notif.message}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-xs text-slate-500 capitalize">
                            {notif.type.replace('_', ' ')}
                          </p>
                          <span className="text-[10px] text-slate-600">•</span>
                          <p className="text-xs text-slate-500">
                            {formatNotifTime(notif.created_at)}
                          </p>
                        </div>
                      </div>
                      {!notif.is_read && (
                        <span className="w-2 h-2 bg-cyan-400 rounded-full mt-1.5 ml-3 flex-shrink-0"></span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
