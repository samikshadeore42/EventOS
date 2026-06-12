import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { NotificationBell } from '../components/NotificationBell';
import api from '../services/api';

export default function DemoNotificationPage() {
  const { userId, authenticated } = useAuth();
  const [message, setMessage] = useState('');
  const [type, setType] = useState('stage_update');
  const [status, setStatus] = useState('');

  const sendNotification = async () => {
    if (!message) return;
    setStatus('Sending...');
    try {
      await api.post('/notifications/trigger', {
        user_id: userId || 'test_user_id', // Fallback for demo
        message,
        type
      });
      setStatus('Sent successfully!');
      setMessage('');
      setTimeout(() => setStatus(''), 2000);
    } catch (err) {
      setStatus(`Failed: ${err.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-8">
      <div className="max-w-4xl mx-auto">
        <header className="flex justify-between items-center mb-12 border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Notification System Demo</h1>
            <p className="text-slate-400 mt-2">Real-time WebSocket & Redis Pub/Sub</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium">
              {authenticated ? `Logged in as: ${userId}` : 'Not logged in (Demo Mode)'}
            </span>
            <NotificationBell />
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Demo Trigger Panel */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm">
            <h2 className="text-xl font-semibold text-white mb-6">Trigger Event</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Notification Type</label>
                <select 
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                >
                  <option value="stage_update">Stage Update</option>
                  <option value="score_update">Score Update</option>
                  <option value="approval">Approval Request</option>
                  <option value="system">System Alert</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Message</label>
                <textarea 
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Enter notification message..."
                  rows={3}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 resize-none"
                />
              </div>

              <button 
                onClick={sendNotification}
                disabled={!message}
                className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:hover:bg-cyan-600 text-white font-medium py-2.5 rounded-lg transition-colors"
              >
                Broadcast to self
              </button>
              
              {status && (
                <p className={`text-sm mt-2 ${status.includes('Failed') ? 'text-red-400' : 'text-emerald-400'}`}>
                  {status}
                </p>
              )}
            </div>
          </div>

          {/* Info Panel */}
          <div className="space-y-6">
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm">
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                System Architecture
              </h3>
              <ul className="space-y-3 text-sm text-slate-400">
                <li className="flex items-start gap-2">
                  <span className="text-cyan-400 mt-0.5">⚡</span>
                  <span><strong>WebSockets:</strong> Maintaining persistent connections to the FastAPI backend.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyan-400 mt-0.5">📡</span>
                  <span><strong>Redis Pub/Sub:</strong> Broadcasting messages across all server instances instantly.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyan-400 mt-0.5">💾</span>
                  <span><strong>PostgreSQL:</strong> Persisting notification history for offline users.</span>
                </li>
              </ul>
            </div>
            
            <div className="bg-cyan-900/20 border border-cyan-800/30 rounded-2xl p-6">
              <p className="text-sm text-cyan-200">
                <strong>Try it out:</strong> Type a message and hit broadcast. The notification will travel through the API to Redis, back to the FastAPI listener, down the WebSocket, and instantly update the bell icon above.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
