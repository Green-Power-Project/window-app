'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import PublicGallery from '@/components/PublicGallery';

type LoginMethod = 'email' | 'customer';

export default function LoginPage() {
  const { t } = useLanguage();
  const [loginMethod, setLoginMethod] = useState<LoginMethod>('email');
  
  // Email/Password fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // Customer/Project fields
  const [customerNumber, setCustomerNumber] = useState('');
  const [projectNumber, setProjectNumber] = useState('');
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, loginWithCustomerNumber } = useAuth();
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (loginMethod === 'email') {
        await login(email, password);
      } else {
        await loginWithCustomerNumber(customerNumber, projectNumber);
      }
      router.push('/dashboard');
    } catch (err: any) {
      // Handle authentication errors
      const errorMessage = err?.message || '';
      
      if (loginMethod === 'email') {
        const errorCode = err?.code || '';
        if (errorCode === 'auth/invalid-credential' || 
            errorCode === 'auth/user-not-found' || 
            errorCode === 'auth/wrong-password') {
          setError(t('login.invalidCredentials'));
        } else if (errorCode === 'auth/too-many-requests') {
          setError(t('login.tooManyRequests'));
        } else if (errorCode === 'auth/network-request-failed') {
          setError(t('login.networkError'));
        } else {
          setError(t('login.signInError'));
        }
      } else {
        // Customer/Project login errors
        if (errorMessage.includes('Invalid customer number') || 
            errorMessage.includes('Invalid project number')) {
          setError(t('login.invalidCustomerNumber'));
        } else if (errorMessage.includes('disabled')) {
          setError(t('login.customerDisabled'));
        } else if (errorMessage.includes('does not belong')) {
          setError(t('login.projectNotFound'));
        } else if (errorMessage.includes('Network')) {
          setError(t('login.networkError'));
        } else {
          setError(errorMessage || t('login.signInError'));
        }
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-screen min-h-screen max-h-screen overflow-hidden bg-gradient-to-br from-green-power-50 via-white to-green-power-50 flex flex-col lg:flex-row">
      {/* Login Section – fixed width on large screens, scrolls on small */}
      <div className="flex-1 min-h-0 flex items-center justify-center px-4 py-12 overflow-auto">
          <div className="w-full max-w-md">
            {/* Logo/Branding */}
            <div className="text-center mb-10">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-2xl shadow-lg mb-4 p-2">
                <img src="/logo.png" alt="Grün Power Logo" className="w-full h-full object-contain" />
              </div>
              <h1 className="text-3xl font-bold text-gray-900 tracking-tight mb-1">
                Grün Power
              </h1>
              <p className="text-sm text-gray-600 font-medium">{t('navigation.customerPortal')}</p>
            </div>

            {/* Login Card */}
            <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
              <div className="px-8 py-10">
                <h2 className="text-xl font-bold text-gray-900 mb-6">{t('login.title')}</h2>

                {/* Login Method Toggle */}
                <div className="mb-6">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    {t('login.loginMethod')}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setLoginMethod('email')}
                      className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                        loginMethod === 'email'
                          ? 'bg-green-power-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {t('login.emailLogin')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setLoginMethod('customer')}
                      className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                        loginMethod === 'customer'
                          ? 'bg-green-power-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {t('login.customerLogin')}
                    </button>
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                      {error}
                    </div>
                  )}

                  {loginMethod === 'email' ? (
                    <>
                      <div>
                        <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-1.5">
                          {t('login.email')}
                        </label>
                        <input
                          id="email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-power-500 focus:border-green-power-500 transition-all"
                          placeholder={t('login.emailPlaceholder')}
                        />
                      </div>

                      <div>
                        <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-1.5">
                          {t('login.password')}
                        </label>
                        <div className="relative">
                          <input
                            id="password"
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-power-500 focus:border-green-power-500 transition-all pr-10"
                            placeholder={t('login.passwordPlaceholder')}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-700"
                          >
                            {showPassword ? (
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                              </svg>
                            ) : (
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <label htmlFor="customerNumber" className="block text-sm font-semibold text-gray-700 mb-1.5">
                          {t('login.customerNumber')}
                        </label>
                        <input
                          id="customerNumber"
                          type="text"
                          value={customerNumber}
                          onChange={(e) => setCustomerNumber(e.target.value)}
                          required
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-power-500 focus:border-green-power-500 transition-all"
                          placeholder={t('login.customerNumberPlaceholder')}
                        />
                      </div>

                      <div>
                        <label htmlFor="projectNumber" className="block text-sm font-semibold text-gray-700 mb-1.5">
                          {t('login.projectNumber')}
                        </label>
                        <input
                          id="projectNumber"
                          type="text"
                          value={projectNumber}
                          onChange={(e) => setProjectNumber(e.target.value)}
                          required
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-power-500 focus:border-green-power-500 transition-all"
                          placeholder={t('login.projectNumberPlaceholder')}
                        />
                      </div>
                    </>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-green-power-600 to-green-power-700 text-white py-3 px-4 rounded-lg text-sm font-semibold hover:from-green-power-700 hover:to-green-power-800 focus:outline-none focus:ring-2 focus:ring-green-power-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transition-all duration-200"
                  >
                    {loading ? t('login.signingIn') : t('login.signIn')}
                  </button>
                </form>
              </div>
            </div>

            <p className="mt-6 text-center text-xs text-gray-600 font-medium">
              {t('login.copyright', { year: new Date().getFullYear() })}
            </p>
            <Link
              href="/gallery"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-green-power-600 hover:text-green-power-700 transition-colors"
            >
              {t('gallery.viewGallery')}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>

        {/* Gallery Section – fixed height, one row + Open gallery button */}
        <div className="flex-1 min-h-0 max-h-screen overflow-auto bg-gray-50/80 border-t lg:border-t-0 lg:border-l border-gray-200 flex items-center justify-center py-4 lg:py-6">
          <PublicGallery />
        </div>
    </div>
  );
}
