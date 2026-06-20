import { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader2, Lock, Mail, Eye, EyeOff } from 'lucide-react';
import EventOSLogo from '../components/EventOSLogo';
import { authApi } from '../services/api';

export default function AuthLogin() {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 relative overflow-hidden flex flex-col justify-center py-12 sm:px-6 lg:px-8 text-slate-950 font-sans">
      
      {/* Decorative circles */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-red-100/50 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-blue-100/50 rounded-full blur-3xl pointer-events-none"></div>
      
      {/* Dotted patterns */}
      <div className="absolute top-20 right-20 grid grid-cols-4 gap-3 opacity-40 pointer-events-none hidden md:grid">
        {Array.from({ length: 24 }).map((_, i) => <div key={`tr-${i}`} className="w-1 h-1 bg-red-300 rounded-full"></div>)}
      </div>
      <div className="absolute bottom-20 left-20 grid grid-cols-4 gap-3 opacity-40 pointer-events-none hidden md:grid">
        {Array.from({ length: 24 }).map((_, i) => <div key={`bl-${i}`} className="w-1 h-1 bg-blue-300 rounded-full"></div>)}
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md z-10 relative">
        <div className="flex justify-center">
          <EventOSLogo size={60} className="text-red-500" />
        </div>
        <h2 className="mt-6 text-center text-3xl font-black text-slate-950">
          Sign in to <span className="text-red-500">EventOS</span>
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md z-10 relative">
        <div className="bg-white/90 border border-slate-200/80 rounded-[20px] shadow-[0_18px_45px_rgba(15,23,42,0.08)] backdrop-blur p-8">
          <form className="space-y-5" onSubmit={handleLogin}>
            
            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-xl text-sm text-center font-medium">
                {error}
              </div>
            )}

            {verificationRequired && (
              <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-xl text-sm text-center">
                <p className="font-bold mb-1">Email verification required</p>
                <p className="mb-2 font-medium">Please check your inbox and verify your email before signing in.</p>
                {resendSuccess ? (
                  <p className="text-emerald-600 font-bold">Verification email sent!</p>
                ) : (
                  <button type="button" onClick={handleResendVerification}
                    className="font-bold underline hover:text-red-700 transition-colors">
                    Resend verification email
                  </button>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">Email address</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                  <Mail className="h-5 w-5" />
                </div>
                <input
                  type="text"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="block w-full pl-11 pr-4 h-12 bg-white text-slate-700 placeholder:text-slate-400 border border-slate-200 rounded-xl focus:ring-4 focus:ring-red-100 focus:border-red-300 transition-all font-medium sm:text-sm outline-none"
                  placeholder="you@example.com or username"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                  <Lock className="h-5 w-5" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="block w-full pl-11 pr-12 h-12 bg-white text-slate-700 placeholder:text-slate-400 border border-slate-200 rounded-xl focus:ring-4 focus:ring-red-100 focus:border-red-300 transition-all font-medium sm:text-sm outline-none"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              <div className="flex justify-end mt-2">
                <Link to="/auth/forgot-password" className="text-sm font-bold text-red-500 hover:text-red-600 transition-colors">
                  Forgot your password?
                </Link>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 flex justify-center items-center rounded-xl bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-bold shadow-[0_10px_24px_rgba(239,68,68,0.25)] transition-all mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="animate-spin h-5 w-5" /> : 'Sign in'}
            </button>
          </form>

          <div className="relative mt-8 mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-3 bg-white text-slate-400 font-medium">or</span>
            </div>
          </div>

          <div className="text-center text-sm font-medium text-slate-500">
            Don't have an organization?{' '}
            <Link to="/auth/register" className="font-bold text-red-500 hover:text-red-600 transition-colors">
              Create one
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
