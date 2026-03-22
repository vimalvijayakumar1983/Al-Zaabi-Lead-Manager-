'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Mail, Sparkles, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://al-zaabi-lead-manager-production.up.railway.app/api';
      const res = await fetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send reset email');
      }
      
      setSent(true);
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel - Branding */}
      <div className="hidden lg:flex lg:w-[55%] bg-gradient-to-br from-brand-950 via-brand-900 to-brand-800 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-1/4 -left-20 h-80 w-80 rounded-full bg-brand-400 blur-[100px]" />
          <div className="absolute bottom-1/4 right-10 h-60 w-60 rounded-full bg-cyan-400 blur-[80px]" />
          <div className="absolute top-10 right-1/4 h-40 w-40 rounded-full bg-violet-400 blur-[60px]" />
        </div>

        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
          backgroundSize: '40px 40px'
        }} />

        <div className="relative z-10 flex flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center border border-white/20">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight">Al-Zaabi Lead Manager</span>
          </div>

          <div className="max-w-lg">
            <h1 className="text-4xl font-bold tracking-tight leading-tight mb-4">
              Forgot your
              <span className="block mt-1 bg-gradient-to-r from-white to-brand-200 bg-clip-text text-transparent">
                password?
              </span>
            </h1>
            <p className="text-lg text-brand-200 leading-relaxed mb-10">
              No worries! We&apos;ll send you a secure reset link to get back into your account in seconds.
            </p>
            
            <div className="flex items-start gap-4 bg-white/5 rounded-2xl p-5 border border-white/10">
              <div className="h-10 w-10 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                <Mail className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Check your email</h3>
                <p className="text-brand-200 text-sm">After submitting, check your inbox for a reset link. The link expires in 1 hour for security.</p>
              </div>
            </div>
          </div>

          <p className="text-brand-300 text-sm">
            © {new Date().getFullYear()} Al-Zaabi Group · Enterprise Lead Manager
          </p>
        </div>
      </div>

      {/* Right panel - Form */}
      <div className="w-full lg:w-[45%] flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-brand-600 to-brand-700 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-gray-900">Al-Zaabi Lead Manager</span>
          </div>

          {!sent ? (
            <>
              <Link href="/login" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-8">
                <ArrowLeft className="h-4 w-4" />
                Back to login
              </Link>
              
              <div className="mb-8">
                <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 mb-5 shadow-lg shadow-blue-500/20">
                  <Mail className="h-7 w-7 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Reset your password</h2>
                <p className="text-gray-500">Enter the email address associated with your account and we&apos;ll send you a link to reset your password.</p>
              </div>

              {error && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 mb-6">
                  <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Email address</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      required
                      className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      autoFocus
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || !email}
                  className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold text-sm hover:from-blue-700 hover:to-purple-700 transition-all duration-200 shadow-lg shadow-blue-500/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Sending reset link...
                    </>
                  ) : (
                    'Send Reset Link'
                  )}
                </button>
              </form>
            </>
          ) : (
            <div className="text-center">
              <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-green-100 mb-6">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-3">Check your email</h2>
              <p className="text-gray-500 mb-2">We&apos;ve sent a password reset link to:</p>
              <p className="text-gray-900 font-semibold mb-6">{email}</p>
              <p className="text-sm text-gray-400 mb-8">
                Didn&apos;t receive the email? Check your spam folder or{' '}
                <button onClick={() => { setSent(false); setError(''); }} className="text-blue-600 hover:text-blue-700 font-medium">
                  try again
                </button>
              </p>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to login
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
