import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Mail, Lock, User, Building } from 'lucide-react';
import EventOSLogo from '../components/EventOSLogo';
import { authApi } from '../services/api';


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
    <div className="min-h-screen bg-surface flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden text-foreground">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=\\'60\\' height=\\'60\\' viewBox=\\'0 0 60 60\\' xmlns=\\'http://www.w3.org/2000/svg\\'%3E%3Cg fill=\\'none\\' fill-rule=\\'evenodd\\'%3E%3Cg fill=\\'%230f172a\\' fill-opacity=\\'0.03\\'%3E%3Cpath d=\\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] pointer-events-none opacity-50 z-0"></div>
      
      <div className="sm:mx-auto sm:w-full sm:max-w-md z-10">
        <div className="flex justify-center text-teal-600">
          <EventOSLogo size={64} />
        </div>
        <h2 className="mt-4 text-center text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-teal-600 to-sky-600">
          Create an Organization
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-xl z-10">
        <div className="bg-white/80 dark:bg-slate-900/80 py-8 px-4 shadow-sm backdrop-blur-xl border border-slate-200/50 dark:border-slate-700/50 sm:rounded-2xl sm:px-10">
          {registered ? (
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
                <Mail className="h-6 w-6 text-green-600" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">Check your email</h3>
              <p className="text-sm text-muted mb-6">
                We've sent a verification link to <strong>{formData.email}</strong>. 
                Please verify your email address before signing in.
              </p>
              <Link to="/auth/login" className="font-medium text-teal-600 hover:text-teal-500">
                Go to sign in
              </Link>
            </div>
          ) : (
          <form className="space-y-6" onSubmit={handleRegister}>
            {error && (
              <div className="bg-teal-50 border border-teal-200 text-teal-600 p-3 rounded-lg text-sm text-center">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-foreground">First Name</label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-muted" />
                  </div>
                  <input
                    type="text"
                    required
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    className="block w-full pl-10 bg-surface text-foreground placeholder-slate-400 border border-border rounded-lg focus:ring-teal-500 focus:border-teal-500 sm:text-sm p-2.5"
                    placeholder="Jane"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground">Last Name</label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-muted" />
                  </div>
                  <input
                    type="text"
                    required
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    className="block w-full pl-10 bg-surface text-foreground placeholder-slate-400 border border-border rounded-lg focus:ring-teal-500 focus:border-teal-500 sm:text-sm p-2.5"
                    placeholder="Doe"
                  />
                </div>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-foreground">Email address</label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-muted" />
                </div>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="block w-full pl-10 bg-surface text-foreground placeholder-slate-400 border border-border rounded-lg focus:ring-teal-500 focus:border-teal-500 sm:text-sm p-2.5"
                  placeholder="jane@example.com"
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
                  minLength={8}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="block w-full pl-10 bg-surface text-foreground placeholder-slate-400 border border-border rounded-lg focus:ring-teal-500 focus:border-teal-500 sm:text-sm p-2.5"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <hr className="border-border" />

            <div>
              <label className="block text-sm font-medium text-foreground">Organization Name</label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Building className="h-5 w-5 text-muted" />
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
                  className="block w-full pl-10 bg-surface text-foreground placeholder-slate-400 border border-border rounded-lg focus:ring-teal-500 focus:border-teal-500 sm:text-sm p-2.5"
                  placeholder="Acme Hackathon Inc."
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground">Organization Slug</label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="text-muted font-mono text-sm">/</span>
                </div>
                <input
                  type="text"
                  required
                  value={formData.organization_slug}
                  onChange={(e) => setFormData({ ...formData, organization_slug: e.target.value })}
                  className="block w-full pl-10 font-mono bg-surface text-foreground border border-border rounded-lg focus:ring-teal-500 focus:border-teal-500 sm:text-sm p-2.5"
                  placeholder="acme-hackathon"
                />
              </div>
              <p className="mt-1 text-xs text-muted">This will be used for your public profile URL.</p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2.5 px-4 border border-teal-400/20 rounded-lg shadow-lg shadow-teal-500/25 text-sm font-medium text-white bg-gradient-to-r from-teal-600 to-teal-600 hover:from-teal-500 hover:to-teal-500 focus:outline-none transition-all disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin h-5 w-5" /> : 'Register Organization'}
            </button>
          </form>
          )}

          <div className="mt-6 text-center text-sm">
            <span className="text-muted">Already have an account? </span>
            <Link to="/auth/login" className="font-medium text-teal-600 hover:text-teal-500">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
