'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

export default function ForgotPasswordPage() {
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const { resetPassword } = useAuth();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      await resetPassword(email);
      setMessage(t('forgotPassword.checkInbox'));
    } catch (err: any) {
      setError(err.message || t('forgotPassword.resetFailed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo/Branding */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-2xl shadow-lg mb-4 p-2">
            <img src="/logo.png" alt="AppGrün Power Logo" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight mb-1">
            AppGrün Power
          </h1>
          <p className="text-sm text-gray-500 font-normal">{t('navigation.customerPortal')}</p>
        </div>

        {/* Reset Password Card */}
        <div className="bg-white border border-gray-200 rounded-sm shadow-sm">
          <div className="px-8 py-10">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('forgotPassword.title')}</h2>
            <p className="text-sm text-gray-600 mb-6">
              {t('forgotPassword.description')}
            </p>

            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="bg-red-50 border-l-4 border-red-400 text-red-700 px-4 py-3 text-sm">
                  {error}
                </div>
              )}

              {message && (
                <div className="bg-green-50 border-l-4 border-green-power-500 text-green-power-700 px-4 py-3 text-sm">
                  {message}
                </div>
              )}

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t('forgotPassword.email')}
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-1 focus:ring-green-power-500 focus:border-green-power-500"
                  placeholder={t('forgotPassword.emailPlaceholder')}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-green-power-500 text-white py-2.5 px-4 rounded-sm text-sm font-medium hover:bg-green-power-600 focus:outline-none focus:ring-2 focus:ring-green-power-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? t('forgotPassword.sending') : t('forgotPassword.sendResetLink')}
              </button>
            </form>
          </div>

          <div className="px-8 py-4 bg-gray-50 border-t border-gray-200 rounded-b-sm">
            <Link
              href="/login"
              className="text-xs text-green-power-600 hover:text-green-power-700 font-medium block text-center"
            >
              {t('forgotPassword.backToSignIn')}
            </Link>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-gray-500">
          {t('forgotPassword.copyright', { year: new Date().getFullYear() })}
        </p>
      </div>
    </div>
  );
}

