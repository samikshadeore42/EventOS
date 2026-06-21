import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Mail, Lock, User, Building2, Link as LinkIcon, Eye, EyeOff, RefreshCw, CheckCircle } from 'lucide-react';
import EventOSLogo from '../components/EventOSLogo';
import { authApi } from '../services/api';

const RESEND_COOLDOWN = 60; // seconds

function RegistrationSuccess({ email }) {
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState(null);
  const [resendError, setResendError] = useState(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleResend = useCallback(async () => {
    if (resending || cooldown > 0) return;
    setResending(true);
    setResendMsg(null);
    setResendError(null);
    try {
      await authApi.resendVerification({ email });
      setResendMsg('Verification email sent! Check your inbox.');
      setCooldown(RESEND_COOLDOWN);
    } catch (err) {
      setResendError(
        err?.response?.data?.detail || err?.message || 'Failed to resend. Please try again.'
      );
    } finally {
      setResending(false);
    }
  }, [email, resending, cooldown]);

  return (
    <div className="text-center py-4">
      <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-emerald-50 text-emerald-500 mb-6">
        <Mail className="h-8 w-8" />
      </div>
      <h3 className="text-xl font-black text-slate-950 mb-2">Check your email</h3>
      <p className="text-sm font-medium text-slate-500 mb-6 max-w-sm mx-auto">
        We&apos;ve sent a verification link to <strong className="text-slate-950">{email}</strong>.
        Please verify your email address before signing in.
      </p>

      {resendMsg && (
        <div className="flex items-center justify-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-4 py-2.5 text-sm font-medium mb-4 max-w-sm mx-auto">
          <CheckCircle className="h-4 w-4 shrink-0" />
          {resendMsg}
        </div>
      )}
      {resendError && (
        <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-2.5 text-sm font-medium mb-4 max-w-sm mx-auto">
          {resendError}
        </div>
      )}

      <button
        type="button"
        onClick={handleResend}
        disabled={resending || cooldown > 0}
        className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-6"
      >
        {resending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
        {cooldown > 0
          ? `Resend in ${cooldown}s`
          : 'Resend verification email'}
      </button>

      <div className="block">
        <Link to="/auth/login" className="font-bold text-red-500 hover:text-red-600 transition-colors">
          Go to sign in
        </Link>
      </div>
    </div>
  );
}

export default function AuthRegister() {
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    organization_name: '',
    organization_slug: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [registered, setRegistered] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await authApi.registerOrganization(formData);
      setRegistered(true);
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const generateSlug = (name) => {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
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
          Create an <span className="text-red-500">Organization</span>
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-xl z-10 relative">
        <div className="bg-white/90 border border-slate-200/80 rounded-[20px] shadow-[0_18px_45px_rgba(15,23,42,0.08)] backdrop-blur p-8">
          {registered ? (
            <RegistrationSuccess email={formData.email} />
          ) : (
          <form className="space-y-5" onSubmit={handleRegister}>
            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-xl text-sm text-center font-medium">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">First Name</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                    <User className="h-5 w-5" />
                  </div>
                  <input
                    type="text"
                    required
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    className="block w-full pl-11 pr-4 h-12 bg-white text-slate-700 placeholder:text-slate-400 border border-slate-200 rounded-xl focus:ring-4 focus:ring-red-100 focus:border-red-300 transition-all font-medium sm:text-sm outline-none"
                    placeholder="Jane"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Last Name</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                    <User className="h-5 w-5" />
                  </div>
                  <input
                    type="text"
                    required
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    className="block w-full pl-11 pr-4 h-12 bg-white text-slate-700 placeholder:text-slate-400 border border-slate-200 rounded-xl focus:ring-4 focus:ring-red-100 focus:border-red-300 transition-all font-medium sm:text-sm outline-none"
                    placeholder="Doe"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">Email address</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                  <Mail className="h-5 w-5" />
                </div>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="block w-full pl-11 pr-4 h-12 bg-white text-slate-700 placeholder:text-slate-400 border border-slate-200 rounded-xl focus:ring-4 focus:ring-red-100 focus:border-red-300 transition-all font-medium sm:text-sm outline-none"
                  placeholder="jane@example.com"
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
                  minLength={8}
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
            </div>

            <hr className="border-slate-200 my-6" />

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">Organization Name</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                  <Building2 className="h-5 w-5" />
                </div>
                <input
                  type="text"
                  required
                  value={formData.organization_name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setFormData({
                      ...formData,
                      organization_name: name,
                      organization_slug: generateSlug(name)
                    });
                  }}
                  className="block w-full pl-11 pr-4 h-12 bg-white text-slate-700 placeholder:text-slate-400 border border-slate-200 rounded-xl focus:ring-4 focus:ring-red-100 focus:border-red-300 transition-all font-medium sm:text-sm outline-none"
                  placeholder="Acme Hackathon Inc."
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">Organization Slug</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                  <LinkIcon className="h-5 w-5" />
                </div>
                <input
                  type="text"
                  required
                  value={formData.organization_slug}
                  onChange={(e) => setFormData({ ...formData, organization_slug: e.target.value })}
                  className="block w-full pl-11 pr-4 h-12 bg-white text-slate-700 border border-slate-200 rounded-xl focus:ring-4 focus:ring-red-100 focus:border-red-300 transition-all font-mono text-sm outline-none"
                  placeholder="acme-hackathon"
                />
              </div>
              <p className="mt-2 text-xs font-medium text-slate-500">This will be used for your public profile URL.</p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 flex justify-center items-center rounded-xl bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-bold shadow-[0_10px_24px_rgba(239,68,68,0.25)] transition-all mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="animate-spin h-5 w-5" /> : 'Register Organization'}
            </button>
          </form>
          )}

          <div className="relative mt-8 mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-3 bg-white text-slate-400 font-medium">or</span>
            </div>
          </div>

          <div className="text-center text-sm font-medium text-slate-500">
            Already have an account?{' '}
            <Link to="/auth/login" className="font-bold text-red-500 hover:text-red-600 transition-colors">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
