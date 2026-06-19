import { useState, useEffect } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle, XCircle, AlertTriangle, Building } from 'lucide-react';
import EventOSLogo from '../components/EventOSLogo';
import { useAuth } from '../context/AuthContext';
import { invitationsApi } from '../services/api';

export default function AuthAcceptInvitation() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const { authenticated, setAuthTokens, loadOrganizations } = useAuth();
  const [status, setStatus] = useState(() => token ? 'loading' : 'invalid');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [accepting, setAccepting] = useState(false);
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const [form, setForm] = useState({ first_name: '', last_name: '', password: '' });

  // Load invitation preview
  useEffect(() => {
    if (!token) return;

    (async () => {
      try {
        const res = await invitationsApi.preview(token);
        setPreview(res);
        setStatus('ready');
      } catch (err) {
        const detail = err.message || '';
        if (detail.includes('TOKEN_EXPIRED') || detail.includes('expired')) {
          setStatus('expired');
        } else {
          setStatus('invalid');
        }
      }
    })();
  }, [token]);

  const handleAccept = async () => {
    if (!authenticated) {
      if (preview?.has_account) {
        navigate(`/auth/login?redirect=/auth/accept-invitation?token=${encodeURIComponent(token)}`);
      } else {
        setShowCreateAccount(true);
      }
      return;
    }
    setAccepting(true);
    setError(null);
    try {
      await invitationsApi.accept(token);
      setStatus('accepted');
    } catch (err) {
      setError(err.message || 'Failed to accept invitation.');
    } finally {
      setAccepting(false);
    }
  };

  const handleCreateAccount = async () => {
    setAccepting(true);
    setError(null);
    try {
      const data = await invitationsApi.registerViaInvitation(token, form);
      setAuthTokens(data.access_token);
      await loadOrganizations();
      window.location.href = '/admin';
    } catch (err) {
      setError(err.message || 'Failed to create account.');
    } finally {
      setAccepting(false);
    }
  };

  const renderContent = () => {
    switch (status) {
      case 'loading':
        return (
          <div className="text-center">
            <Loader2 className="animate-spin h-12 w-12 text-amber-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground">Loading invitation...</h3>
          </div>
        );
      case 'ready':
        return (
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-14 w-14 rounded-full bg-amber-100 dark:bg-amber-900/50 mb-4">
              <Building className="h-7 w-7 text-amber-600 dark:text-amber-400" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">
              You&apos;re invited to join
            </h3>
            <p className="text-xl font-bold text-amber-600 dark:text-amber-400 mb-1">{preview?.organization_name}</p>
            {preview?.inviter_name && (
              <p className="text-sm text-muted mb-1">Invited by {preview.inviter_name}</p>
            )}
            <p className="text-sm text-muted mb-6">
              Role: <span className="font-medium capitalize">{preview?.role}</span>
            </p>
            {error && (
              <div className="bg-amber-50 dark:bg-amber-900/30 border border-teal-200 dark:border-teal-800 text-amber-600 dark:text-amber-400 p-3 rounded-lg text-sm text-center mb-4">
                {error}
              </div>
            )}

            {!showCreateAccount ? (
              <>
                <button
                  onClick={handleAccept}
                  disabled={accepting}
                  className="w-full flex justify-center py-2.5 px-4 border border-amber-400/20 rounded-lg shadow-lg shadow-amber-500/25 text-sm font-medium text-white bg-amber-600 hover:bg-amber-500 focus:outline-none transition-all disabled:opacity-100 disabled:bg-amber-100 dark:disabled:bg-amber-900/50 disabled:text-amber-400 dark:disabled:text-amber-600 disabled:border-transparent disabled:shadow-none disabled:cursor-not-allowed"
                >
                  {accepting ? <Loader2 className="animate-spin h-5 w-5" /> :
                    (authenticated ? 'Accept Invitation' : (preview?.has_account ? 'Sign in to Accept' : 'Create Account & Join'))}
                </button>
                {!authenticated && preview?.has_account && (
                  <p className="text-xs text-muted mt-3">
                    Don&apos;t have an account?{' '}
                    <button onClick={() => setShowCreateAccount(true)} className="text-amber-600 dark:text-amber-400 hover:underline">
                      Create one for {preview?.email}
                    </button>
                  </p>
                )}
              </>
            ) : (
              <div className="space-y-3 text-left">
                <p className="text-xs text-muted mb-2">Creating account for <strong>{preview?.email}</strong></p>
                <input
                  type="text"
                  placeholder="First name"
                  value={form.first_name}
                  onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <input
                  type="text"
                  placeholder="Last name"
                  value={form.last_name}
                  onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <input
                  type="password"
                  placeholder="Password (min 8 characters)"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <button
                  onClick={handleCreateAccount}
                  disabled={accepting || !form.first_name || !form.last_name || form.password.length < 8}
                  className="w-full flex justify-center py-2.5 px-4 rounded-lg shadow-lg shadow-amber-500/25 text-sm font-medium text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-100 disabled:bg-amber-100 dark:disabled:bg-amber-900/50 disabled:text-amber-400 dark:disabled:text-amber-600 disabled:border-transparent disabled:shadow-none disabled:cursor-not-allowed"
                >
                  {accepting ? <Loader2 className="animate-spin h-5 w-5" /> : 'Create Account & Join'}
                </button>
                <button onClick={() => setShowCreateAccount(false)} className="text-xs text-muted hover:underline w-full text-center">
                  Back
                </button>
              </div>
            )}
          </div>
        );
      case 'accepted':
        return (
          <div className="text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">Welcome!</h3>
            <p className="text-sm text-muted mb-6">
              You&apos;ve joined <strong>{preview?.organization_name}</strong> as {preview?.role}.
            </p>
            <Link to="/admin" className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium text-white bg-amber-600 hover:bg-amber-500">
              Go to Dashboard
            </Link>
          </div>
        );
      case 'expired':
        return (
          <div className="text-center">
            <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">Invitation Expired</h3>
            <p className="text-sm text-muted mb-6">This invitation has expired. Please ask the organization admin to send a new one.</p>
            <Link to="/auth/login" className="font-medium text-amber-600 dark:text-amber-400 hover:text-amber-500">Go to sign in</Link>
          </div>
        );
      default:
        return (
          <div className="text-center">
            <XCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">Invalid Invitation</h3>
            <p className="text-sm text-muted mb-6">This invitation link is invalid or has already been used.</p>
            <Link to="/auth/login" className="font-medium text-amber-600 dark:text-amber-400 hover:text-amber-500">Go to sign in</Link>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden text-foreground">
      <div className="sm:mx-auto sm:w-full sm:max-w-md z-10">
        <div className="flex justify-center text-amber-600 dark:text-amber-400">
          <EventOSLogo size={64} />
        </div>
        <h2 className="mt-4 text-center text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-amber-600 to-orange-500">
          Organization Invitation
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md z-10">
        <div className="bg-white/80 dark:bg-slate-900/80 py-8 px-4 shadow-sm backdrop-blur-xl border border-slate-200/50 dark:border-slate-700/50 sm:rounded-2xl sm:px-10">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
