import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import api from '../services/api'; // Default import

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { userId, authenticated } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [ws, setWs] = useState(null);

  const effectiveUserId = userId || 'test_user_id';

  // Fetch initial history
  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const res = await api.get(`/notifications/${effectiveUserId}`);
        const data = Array.isArray(res) ? res : (res.data || []);
        setNotifications(data);
        setUnreadCount(data.filter(n => !n.is_read).length);
      } catch (error) {
        console.error("Failed to fetch notifications:", error);
      }
    };
    fetchNotifications();
  }, [effectiveUserId]);

  // WebSocket Connection
  useEffect(() => {
    let websocket = null;
    let reconnectTimeout = null;

    const connectWs = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//localhost:8000/ws/notifications/${effectiveUserId}`;
      websocket = new WebSocket(wsUrl);

      websocket.onopen = () => {
        console.log('Connected to Notification WebSocket');
        setWs(websocket);
      };

      websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log("New real-time notification:", data);
          setNotifications((prev) => [data, ...prev]);
          setUnreadCount((prev) => prev + 1);
        } catch (err) {
          console.error("Error parsing WS message:", err);
        }
      };

      websocket.onclose = () => {
        console.log('Disconnected from Notification WebSocket, attempting to reconnect in 3s...');
        setWs(null);
        reconnectTimeout = setTimeout(connectWs, 3000);
      };
      
      websocket.onerror = (err) => {
        console.error('WebSocket encountered an error:', err);
        websocket.close();
      };
    };

    connectWs();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (websocket) {
        websocket.onclose = null; // Prevent reconnect loop on unmount
        websocket.close();
      }
    };
  }, [effectiveUserId]);

  const markAsRead = useCallback(async (notificationId) => {
    setNotifications((prev) => prev.map(n => 
      n.id === notificationId ? { ...n, is_read: true } : n
    ));
    setUnreadCount((prev) => Math.max(0, prev - 1));
    try {
      await api.post(`/notifications/${notificationId}/read`);
    } catch (err) {
      console.error('Failed to mark as read', err);
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    setNotifications((prev) => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
    try {
      await api.post(`/notifications/user/${effectiveUserId}/read-all`);
    } catch (err) {
      console.error('Failed to mark all as read', err);
    }
  }, [effectiveUserId]);

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markAsRead, markAllAsRead }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used inside <NotificationProvider>');
  return ctx;
}
