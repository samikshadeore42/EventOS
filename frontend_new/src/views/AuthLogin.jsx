import { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader2, Lock, Mail } from 'lucide-react';
import EventOSLogo from '../components/EventOSLogo';
import { authApi } from '../services/api';


export default function AuthLogin() {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setAuthTokens } = useAuth();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setVerificationRequired(false);
    try {
      // If user inputs a legacy username without '@', we try the fallback first
      let emailPayload = formData.email;
      if (!emailPayload.includes('@')) {
        emailPayload = `${emailPayload}@legacy.eventos.invalid`;
      }

      const res = await authApi.login({
        email: emailPayload,
        password: formData.password
      });
      setAuthTokens(res.access_token, res.refresh_token);
      const redirectUrl = searchParams.get('redirect') || '/admin';
      navigate(redirectUrl);
    } catch (err) {
      const msg = err.message || '';
      if (msg.includes('EMAIL_VERIFICATION_REQUIRED') || msg.includes('verify your email')) {
        setVerificationRequired(true);
      } else {
        setError(msg || 'Login failed. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    try {
      await authApi.resendVerification({ email: formData.email });
      setResendSuccess(true);
    } catch {
      // Always show success to prevent enumeration
      setResendSuccess(true);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden text-foreground">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=\\'60\\' height=\\'60\\' viewBox=\\'0 0 60 60\\' xmlns=\\'http://www.w3.org/2000/svg\\'%3E%3Cg fill=\\'none\\' fill-rule=\\'evenodd\\'%3E%3Cg fill=\\'%230f172a\\' fill-opacity=\\'0.03\\'%3E%3Cpath d=\\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] pointer-events-none opacity-50 z-0"></div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md z-10">
        <div className="flex justify-center shrink-0">
          <EventOSLogo size={64} />
        </div>
        <h2 className="mt-4 text-center text-3xl font-extrabold text-foreground">
          Sign in to EventOS
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md z-10">
        <div className="app-card py-8 px-4 sm:rounded-2xl sm:px-10">
          <form className="space-y-6" onSubmit={handleLogin}>
            {error && (
              <div className="bg-cardSoft border border-border shrink-0 p-3 rounded-lg text-sm text-center">
                {error}
              </div>
            )}

            {verificationRequired && (
              <div className="bg-cardSoft border border-border text-primary p-3 rounded-lg text-sm text-center">
                <p className="font-medium mb-1">Email verification required</p>
                <p className="mb-2">Please check your inbox and verify your email before signing in.</p>
                {resendSuccess ? (
                  <p className="text-green-600 font-medium">Verification email sent!</p>
                ) : (
                  <button type="button" onClick={handleResendVerification}
                    className="shrink-0 hover:text-warning font-medium underline">
                    Resend verification email
                  </button>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-foreground">Email address</label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-muted" />
                </div>
                <input
                  type="text"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="block w-full pl-10 bg-surface text-foreground placeholder-muted border border-border rounded-lg focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm p-2.5"
                  placeholder="you@example.com (or username)"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground">Password</label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-muted" />
                </div>
                <input
                  type="password"
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="block w-full pl-10 bg-surface text-foreground placeholder-muted border border-border rounded-lg focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm p-2.5"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-sm">
                <Link to="/auth/forgot-password" className="font-medium shrink-0 hover:text-warning">
                  Forgot your password?
                </Link>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2.5 px-4 app-btn-primary w-full !py-2.5"
            >
              {loading ? <Loader2 className="animate-spin h-5 w-5" /> : 'Sign in'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm">
            <span className="text-muted">Don't have an organization? </span>
            <Link to="/auth/register" className="font-medium shrink-0 hover:text-warning">
              Create one
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
