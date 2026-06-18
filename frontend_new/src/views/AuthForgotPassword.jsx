import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Mail } from 'lucide-react';
import EventOSLogo from '../components/EventOSLogo';
import { authApi } from '../services/api';


export default function AuthForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleReset = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await authApi.forgotPassword({ email });
      setSuccess(true);
    } catch {
      // Always show success to prevent email enumeration
      setSuccess(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden text-foreground">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=\\'60\\' height=\\'60\\' viewBox=\\'0 0 60 60\\' xmlns=\\'http://www.w3.org/2000/svg\\'%3E%3Cg fill=\\'none\\' fill-rule=\\'evenodd\\'%3E%3Cg fill=\\'%230f172a\\' fill-opacity=\\'0.03\\'%3E%3Cpath d=\\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] pointer-events-none opacity-50 z-0"></div>
      
      <div className="sm:mx-auto sm:w-full sm:max-w-md z-10">
        <div className="flex justify-center text-teal-600">
          <EventOSLogo size={64} />
        </div>
        <h2 className="mt-4 text-center text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-teal-600 to-sky-600">
          Reset Password
        </h2>
        <p className="mt-2 text-center text-sm text-muted">
          Enter your email address and we'll send you a link to reset your password.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md z-10">
        <div className="bg-white/80 dark:bg-slate-900/80 py-8 px-4 shadow-sm backdrop-blur-xl border border-slate-200/50 dark:border-slate-700/50 sm:rounded-2xl sm:px-10">
          {success ? (
            <div className="text-center">
              <div className="bg-green-50 border border-green-200 text-green-700 p-4 rounded-lg mb-6">
                If an account exists for that email, we have sent a password reset link.
              </div>
              <Link to="/auth/login" className="font-medium text-teal-600 hover:text-teal-500">
                Return to sign in
              </Link>
            </div>
          ) : (
            <form className="space-y-6" onSubmit={handleReset}>
              {error && (
                <div className="bg-teal-50 border border-teal-200 text-teal-600 p-3 rounded-lg text-sm text-center">
                  {error}
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-foreground">Email address</label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-muted" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full pl-10 bg-surface text-foreground placeholder-slate-400 border border-border rounded-lg focus:ring-teal-500 focus:border-teal-500 sm:text-sm p-2.5"
                    placeholder="you@example.com"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2.5 px-4 border border-teal-400/20 rounded-lg shadow-lg shadow-teal-500/25 text-sm font-medium text-white bg-gradient-to-r from-teal-600 to-teal-600 hover:from-teal-500 hover:to-teal-500 focus:outline-none transition-all disabled:opacity-100 disabled:bg-teal-100 dark:disabled:bg-teal-900/50 disabled:text-teal-400 dark:disabled:text-teal-600 disabled:border-transparent disabled:shadow-none disabled:cursor-not-allowed"
              >
                {loading ? <Loader2 className="animate-spin h-5 w-5" /> : 'Send reset link'}
              </button>
            </form>
          )}

          <div className="mt-6 text-center text-sm">
            <Link to="/auth/login" className="font-medium text-muted hover:text-foreground">
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
