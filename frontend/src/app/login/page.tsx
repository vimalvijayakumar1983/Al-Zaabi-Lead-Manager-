'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { Sparkles, ArrowRight, Eye, EyeOff, CheckCircle2, Zap, Shield, BarChart3 } from 'lucide-react';

const features = [
  { icon: Zap, title: 'Smart Automation', description: 'Automate follow-ups, assignments, and scoring' },
  { icon: BarChart3, title: 'Advanced Analytics', description: 'Real-time insights and conversion funnels' },
  { icon: Shield, title: 'Enterprise Security', description: 'Role-based access and audit logging' },
];

export default function LoginPage() {
  const router = useRouter();
  const { login, register } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegister) {
        await register({ email, password, firstName, lastName, organizationName: orgName });
      } else {
        await login(email, password);
      }
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel - Branding */}
      <div className="hidden lg:flex lg:w-[55%] bg-gradient-to-br from-brand-950 via-brand-900 to-brand-800 relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-1/4 -left-20 h-80 w-80 rounded-full bg-brand-400 blur-[100px]" />
          <div className="absolute bottom-1/4 right-10 h-60 w-60 rounded-full bg-cyan-400 blur-[80px]" />
          <div className="absolute top-10 right-1/4 h-40 w-40 rounded-full bg-violet-400 blur-[60px]" />
        </div>

        {/* Grid pattern */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
          backgroundSize: '40px 40px'
        }} />

        <div className="relative z-10 flex flex-col justify-between p-12 text-white">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center border border-white/20">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight">LeadFlow</span>
          </div>

          {/* Main content */}
          <div className="max-w-lg">
            <h1 className="text-4xl font-bold tracking-tight leading-tight mb-4 animate-fade-in-up">
              The modern platform for
              <span className="block mt-1 bg-gradient-to-r from-white to-brand-200 bg-clip-text text-transparent">
                lead management
              </span>
            </h1>
            <p className="text-lg text-brand-200 leading-relaxed mb-10 animate-fade-in-up stagger-1">
              Track, nurture, and convert leads with intelligent automation.
              Built for teams that move fast.
            </p>

            {/* Features */}
            <div className="space-y-5">
              {features.map((feature, i) => {
                const Icon = feature.icon;
                return (
                  <div key={feature.title} className={`flex items-start gap-4 animate-fade-in-up stagger-${i + 2}`}>
                    <div className="h-10 w-10 rounded-lg bg-white/10 backdrop-blur border border-white/10 flex items-center justify-center flex-shrink-0">
                      <Icon className="h-5 w-5 text-brand-200" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white mb-0.5">{feature.title}</h3>
                      <p className="text-sm text-brand-300">{feature.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Social proof */}
          <div className="animate-fade-in-up stagger-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex -space-x-2">
                {['bg-cyan-500', 'bg-violet-500', 'bg-amber-500', 'bg-emerald-500'].map((bg, i) => (
                  <div key={i} className={`h-8 w-8 rounded-full ${bg} ring-2 ring-brand-900 flex items-center justify-center text-xs font-bold text-white`}>
                    {String.fromCharCode(65 + i)}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-1 text-amber-400">
                {[1,2,3,4,5].map(i => (
                  <svg key={i} className="h-3.5 w-3.5 fill-current" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
            </div>
            <p className="text-sm text-brand-300">
              Trusted by 2,000+ sales teams worldwide
            </p>
          </div>
        </div>
      </div>

      {/* Right panel - Form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-white">
        <div className="w-full max-w-[400px]">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2.5 mb-10">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-soft">
              <Sparkles className="h-4.5 w-4.5 text-white" />
            </div>
            <span className="text-xl font-bold text-text-primary tracking-tight">LeadFlow</span>
          </div>

          <div className="animate-fade-in-up">
            <h2 className="text-2xl font-bold text-text-primary tracking-tight">
              {isRegister ? 'Create your account' : 'Welcome back'}
            </h2>
            <p className="text-sm text-text-secondary mt-1.5 mb-8">
              {isRegister
                ? 'Start managing your leads in minutes'
                : 'Sign in to your LeadFlow account'}
            </p>
          </div>

          {error && (
            <div className="mb-6 flex items-start gap-2.5 rounded-xl bg-red-50 border border-red-100 p-3.5 text-sm text-red-700 animate-fade-in-down">
              <div className="h-5 w-5 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs font-bold">!</span>
              </div>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5 animate-fade-in-up stagger-1">
            {isRegister && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">First name</label>
                    <input type="text" className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="John" required />
                  </div>
                  <div>
                    <label className="label">Last name</label>
                    <input type="text" className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Doe" required />
                  </div>
                </div>
                <div>
                  <label className="label">Organization</label>
                  <input type="text" className="input" value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Acme Corp" required />
                </div>
              </>
            )}

            <div>
              <label className="label">Email</label>
              <input
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                autoFocus={!isRegister}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-text-primary">Password</label>
                {!isRegister && (
                  <button type="button" className="text-xs text-brand-600 hover:text-brand-700 font-medium">
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isRegister ? 'Min 8 characters' : 'Enter your password'}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn-primary w-full h-11 text-base group"
              disabled={loading}
            >
              {loading ? (
                <div className="h-5 w-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              ) : (
                <>
                  {isRegister ? 'Create account' : 'Sign in'}
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 text-center">
            <p className="text-sm text-text-secondary">
              {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button
                onClick={() => { setIsRegister(!isRegister); setError(''); }}
                className="font-semibold text-brand-600 hover:text-brand-700 transition-colors"
              >
                {isRegister ? 'Sign in' : 'Create one'}
              </button>
            </p>
          </div>

          {!isRegister && (
            <div className="mt-8 pt-6 border-t border-border-subtle">
              <p className="text-xs text-text-tertiary text-center">
                By signing in, you agree to our Terms of Service and Privacy Policy.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
