import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Loader2, Lock, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import EventOSLogo from '../components/EventOSLogo';
import { authApi } from '../services/api';

export default function AuthResetPasswordConfirm() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(token ? 'ready' : 'invalid'); // ready | success | invalid | expired | error

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await authApi.resetPassword({ token, new_password: password });
      setStatus('success');
    } catch (err) {
      const detail = err.message || '';
      if (detail.includes('TOKEN_EXPIRED') || detail.includes('expired')) {
        setStatus('expired');
      } else if (detail.includes('TOKEN_USED') || detail.includes('used')) {
        setStatus('invalid');
      } else if (detail.includes('INVALID_TOKEN') || detail.includes('Invalid')) {
        setStatus('invalid');
      } else {
        setError(detail || 'Failed to reset password.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (status === 'invalid') {
    return (
      <PageWrapper>
        <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-slate-900 mb-2">Invalid Reset Link</h3>
        <p className="text-sm text-slate-600 mb-6">This password reset link is invalid or has already been used.</p>
        <Link to="/auth/forgot-password" className="font-medium text-indigo-600 hover:text-indigo-500">Request a new link</Link>
      </PageWrapper>
    );
  }

  if (status === 'expired') {
    return (
      <PageWrapper>
        <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-slate-900 mb-2">Link Expired</h3>
        <p className="text-sm text-slate-600 mb-6">This password reset link has expired.</p>
        <Link to="/auth/forgot-password" className="font-medium text-indigo-600 hover:text-indigo-500">Request a new link</Link>
      </PageWrapper>
    );
  }

  if (status === 'success') {
    return (
      <PageWrapper>
        <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-slate-900 mb-2">Password Reset!</h3>
        <p className="text-sm text-slate-600 mb-6">Your password has been updated. You can now sign in with your new password.</p>
        <Link to="/auth/login" className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500">
          Sign in
        </Link>
      </PageWrapper>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden text-slate-700">
      <div className="sm:mx-auto sm:w-full sm:max-w-md z-10">
        <div className="flex justify-center text-indigo-600">
          <EventOSLogo size={64} />
        </div>
        <h2 className="mt-4 text-center text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-sky-600">
          Set New Password
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md z-10">
        <div className="bg-white/80 py-8 px-4 shadow-sm backdrop-blur-xl border border-slate-200/50 sm:rounded-2xl sm:px-10">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg text-sm text-center">
                {error}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700">New Password</label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 bg-slate-50 text-slate-900 placeholder-slate-400 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2.5"
                  placeholder="••••••••"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Confirm Password</label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="block w-full pl-10 bg-slate-50 text-slate-900 placeholder-slate-400 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2.5"
                  placeholder="••••••••"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2.5 px-4 border border-indigo-400/20 rounded-lg shadow-lg shadow-indigo-500/25 text-sm font-medium text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 focus:outline-none transition-all disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin h-5 w-5" /> : 'Reset Password'}
            </button>
          </form>
          <div className="mt-6 text-center text-sm">
            <Link to="/auth/login" className="font-medium text-slate-500 hover:text-slate-700">
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function PageWrapper({ children }) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden text-slate-700">
      <div className="sm:mx-auto sm:w-full sm:max-w-md z-10">
        <div className="bg-white/80 py-8 px-4 shadow-sm backdrop-blur-xl border border-slate-200/50 sm:rounded-2xl sm:px-10 text-center">
          {children}
        </div>
      </div>
    </div>
  );
}
