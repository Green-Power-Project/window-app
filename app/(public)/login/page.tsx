'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import PublicGallery from '@/components/PublicGallery';
import PartnersSlider from '@/components/PartnersSlider';

type LoginMethod = 'email' | 'customer';

export default function LoginPage() {
  const { t } = useLanguage();
  const [loginMethod, setLoginMethod] = useState<LoginMethod>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
      const errorMessage = err?.message || '';
      if (loginMethod === 'email') {
        const errorCode = err?.code || '';
        if (errorCode === 'auth/invalid-credential' || errorCode === 'auth/user-not-found' || errorCode === 'auth/wrong-password') {
          setError(t('login.invalidCredentials'));
        } else if (errorCode === 'auth/too-many-requests') {
          setError(t('login.tooManyRequests'));
        } else if (errorCode === 'auth/network-request-failed') {
          setError(t('login.networkError'));
        } else {
          setError(t('login.signInError'));
        }
      } else {
        if (errorMessage.includes('Invalid customer number') || errorMessage.includes('Invalid project number')) {
          setError(t('login.invalidCustomerNumber'));
        } else if (errorMessage.includes('disabled')) {
          setError(t('login.customerDisabled'));
        } else if (errorMessage.includes('does not belong')) {
          setError(t('login.projectNotFound'));
        } else {
          setError(errorMessage || t('login.signInError'));
        }
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col relative overflow-y-auto w-full">
      <div className="relative z-10 flex flex-1 flex-col w-full px-3 sm:px-4 pt-2 sm:pt-3 pb-2 sm:pb-3">
        <div className="flex flex-1 flex-col items-center justify-center md:justify-start gap-3 sm:gap-4 min-h-0">
          {/* ——— LOGIN CARD ——— */}
          <div className="w-full max-w-[320px] sm:max-w-[360px] flex-shrink-0">
            <div
              className="rounded-2xl overflow-hidden border border-white/80"
              style={{
                background: 'linear-gradient(180deg, rgba(255,255,255,0.72) 0%, rgba(248,252,249,0.65) 50%, rgba(240,247,242,0.58) 100%)',
                backdropFilter: 'blur(28px) saturate(190%)',
                WebkitBackdropFilter: 'blur(28px) saturate(190%)',
                boxShadow: '0 0 0 1px rgba(255,255,255,0.6) inset, 0 0 56px -12px rgba(72, 164, 127, 0.4), 0 12px 40px rgba(0,0,0,0.1)',
              }}
            >
              <div className="px-4 py-3">
                <div className="flex justify-center mb-1">
                  <Image src="/logo.png" alt="" width={28} height={28} className="object-contain" />
                </div>
                <p className="text-center font-display text-sm font-bold text-gray-900">Grün Power</p>
                <p className="text-center text-[11px] text-gray-600 mb-2">{t('navigation.customerPortal')}</p>
                <h2 className="text-sm font-bold text-gray-900 mb-2">{t('login.title')}</h2>
                <div className="grid grid-cols-2 gap-1.5 mb-2">
                  <button
                    type="button"
                    onClick={() => setLoginMethod('email')}
                    className={`flex items-center justify-center gap-1 px-2 py-1.5 rounded-xl text-[11px] font-medium transition-all duration-200 ${
                      loginMethod === 'email'
                        ? 'bg-gradient-to-r from-green-power-500 to-teal-500 text-white shadow-lg'
                        : 'bg-gray-100/90 text-gray-600 hover:bg-gray-200/90 hover:border-gray-300/50 border border-transparent'
                    }`}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    {t('login.emailLogin')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setLoginMethod('customer')}
                    className={`flex items-center justify-center gap-1 px-2 py-1.5 rounded-xl text-[11px] font-medium transition-all duration-200 ${
                      loginMethod === 'customer'
                        ? 'bg-gradient-to-r from-green-power-500 to-teal-500 text-white shadow-lg'
                        : 'bg-gray-100/90 text-gray-600 hover:bg-gray-200/90 hover:border-gray-300/50 border border-transparent'
                    }`}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                    {t('login.customerLogin')}
                  </button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-2">
                  {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-2 py-1.5 rounded-lg text-[10px]">
                      {error}
                    </div>
                  )}
                  {loginMethod === 'email' ? (
                    <>
                      <div>
                        <label htmlFor="email" className="block text-[10px] font-medium text-gray-600 mb-0.5">{t('login.email')}</label>
                        <input
                          id="email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                          className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs bg-white/90 focus:outline-none focus:ring-2 focus:ring-green-power-400/80 focus:border-green-power-400 transition-shadow focus:shadow-md"
                          placeholder={t('login.emailPlaceholder')}
                        />
                      </div>
                      <div>
                        <label htmlFor="password" className="block text-[10px] font-medium text-gray-600 mb-0.5">{t('login.password')}</label>
                        <div className="relative">
                          <input
                            id="password"
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs bg-white/90 focus:outline-none focus:ring-2 focus:ring-green-power-400/80 focus:border-green-power-400 transition-shadow focus:shadow-md pr-8"
                            placeholder={t('login.passwordPlaceholder')}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-700"
                          >
                            {showPassword ? (
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                              </svg>
                            ) : (
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                        <label htmlFor="customerNumber" className="block text-[10px] font-medium text-gray-600 mb-0.5">{t('login.customerNumber')}</label>
                        <input
                          id="customerNumber"
                          type="text"
                          value={customerNumber}
                          onChange={(e) => setCustomerNumber(e.target.value)}
                          required
                          className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs bg-white/90 focus:outline-none focus:ring-2 focus:ring-green-power-400/80 focus:border-green-power-400 transition-shadow focus:shadow-md"
                          placeholder={t('login.customerNumberPlaceholder')}
                        />
                      </div>
                      <div>
                        <label htmlFor="projectNumber" className="block text-[10px] font-medium text-gray-600 mb-0.5">{t('login.projectNumber')}</label>
                        <input
                          id="projectNumber"
                          type="text"
                          value={projectNumber}
                          onChange={(e) => setProjectNumber(e.target.value)}
                          required
                          className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs bg-white/90 focus:outline-none focus:ring-2 focus:ring-green-power-400/80 focus:border-green-power-400 transition-shadow focus:shadow-md"
                          placeholder={t('login.projectNumberPlaceholder')}
                        />
                      </div>
                    </>
                  )}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full text-white py-2.5 px-3 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-green-power-400 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:scale-[1.02] active:scale-[0.99]"
                    style={{
                      background: 'linear-gradient(180deg, #7ab88a 0%, #5d8a6a 45%, #0d9488 100%)',
                      boxShadow: '0 1px 0 rgba(255,255,255,0.2) inset, 0 4px 20px rgba(72, 164, 127, 0.5)',
                    }}
                  >
                    {loading ? t('login.signingIn') : t('login.signIn')}
                  </button>
                </form>
                <p className="mt-2 text-center">
                  {loginMethod === 'email' ? (
                    <button type="button" onClick={() => setLoginMethod('customer')} className="text-[10px] font-medium text-teal-600 hover:text-teal-500 underline-offset-2 hover:underline transition-colors">
                      {t('login.orCustomerLogin')}
                    </button>
                  ) : (
                    <button type="button" onClick={() => setLoginMethod('email')} className="text-[10px] font-medium text-teal-600 hover:text-teal-500 underline-offset-2 hover:underline transition-colors">
                      {t('login.orEmailLogin')}
                    </button>
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* ——— PARTNER COMPANIES SLIDER (same width as gallery, above gallery) ——— */}
          <PartnersSlider />

          {/* ——— GALLERY SECTION (on mobile: part of centered block; on md+: sticks to bottom) ——— */}
          <div className="w-full min-w-0 flex flex-col min-h-0 flex-shrink-0 md:flex-1 md:mt-auto">
            <div
              className="rounded-2xl min-w-0 overflow-hidden border border-white/80 md:mt-auto"
              style={{
                background: 'linear-gradient(180deg, rgba(255,255,255,0.7) 0%, rgba(248,252,249,0.62) 50%, rgba(240,247,242,0.55) 100%)',
                backdropFilter: 'blur(28px) saturate(190%)',
                WebkitBackdropFilter: 'blur(28px) saturate(190%)',
                boxShadow: '0 0 0 1px rgba(255,255,255,0.5) inset, 0 0 48px -10px rgba(72, 164, 127, 0.35), 0 10px 36px rgba(0,0,0,0.08)',
              }}
            >
              <div className="rounded-2xl min-w-0">
                <PublicGallery />
              </div>
            </div>
          </div>
        </div>

        <p className="mt-auto flex-shrink-0 text-center text-sm sm:text-base text-white font-semibold py-3 sm:py-4" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.25), 0 0 20px rgba(0,0,0,0.15)' }}>
          {t('login.copyright', { year: new Date().getFullYear() })}
        </p>
      </div>
    </div>
  );
}
