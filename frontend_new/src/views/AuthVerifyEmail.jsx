import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Loader2, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import EventOSLogo from '../components/EventOSLogo';
import { authApi } from '../services/api';

export default function AuthVerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState(() => token ? 'verifying' : 'invalid');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!token) return;
    
    (async () => {
      try {
        const res = await authApi.verifyEmail(token);
        if (res.status === 'already_verified') {
          setStatus('already_verified');
        } else {
          setStatus('success');
        }
      } catch (err) {
        const detail = err.message || '';
        if (detail.includes('TOKEN_EXPIRED') || detail.includes('expired')) {
          setStatus('expired');
        } else if (detail.includes('INVALID_TOKEN') || detail.includes('Invalid')) {
          setStatus('invalid');
        } else {
          setStatus('error');
          setError(detail);
        }
      }
    })();
  }, [token]);

  const renderContent = () => {
    switch (status) {
      case 'verifying':
        return (
          <div className="text-center">
            <Loader2 className="animate-spin h-12 w-12 text-amber-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground">Verifying your email...</h3>
          </div>
        );
      case 'success':
        return (
          <div className="text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">Email Verified!</h3>
            <p className="text-sm text-muted mb-6">Your email has been verified. You can now sign in.</p>
            <Link to="/auth/login" className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium text-white bg-amber-600 hover:bg-amber-500">
              Sign in
            </Link>
          </div>
        );
      case 'already_verified':
        return (
          <div className="text-center">
            <CheckCircle className="h-12 w-12 text-blue-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">Already Verified</h3>
            <p className="text-sm text-muted mb-6">This email has already been verified.</p>
            <Link to="/auth/login" className="font-medium text-amber-600 hover:text-amber-500">Sign in</Link>
          </div>
        );
      case 'expired':
        return (
          <div className="text-center">
            <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">Link Expired</h3>
            <p className="text-sm text-muted mb-6">This verification link has expired. Please request a new one from the login page.</p>
            <Link to="/auth/login" className="font-medium text-amber-600 hover:text-amber-500">Return to sign in</Link>
          </div>
        );
      case 'invalid':
        return (
          <div className="text-center">
            <XCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">Invalid Link</h3>
            <p className="text-sm text-muted mb-6">This verification link is invalid or has already been used.</p>
            <Link to="/auth/login" className="font-medium text-amber-600 hover:text-amber-500">Return to sign in</Link>
          </div>
        );
      default:
        return (
          <div className="text-center">
            <XCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">Verification Failed</h3>
            <p className="text-sm text-muted mb-6">{error || 'An unexpected error occurred.'}</p>
            <Link to="/auth/login" className="font-medium text-amber-600 hover:text-amber-500">Return to sign in</Link>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden text-foreground">
      <div className="sm:mx-auto sm:w-full sm:max-w-md z-10">
        <div className="flex justify-center text-amber-600">
          <EventOSLogo size={64} />
        </div>
        <h2 className="mt-4 text-center text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-amber-600 to-orange-500">
          Email Verification
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
