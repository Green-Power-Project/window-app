'use client';

import { useState, useEffect, FormEvent } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import CustomerLayout from '@/components/CustomerLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, updateDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { auth } from '@/lib/firebase';

export default function ProfilePage() {
  const { t } = useLanguage();
  return (
    <ProtectedRoute>
      <CustomerLayout title={t('profile.title')}>
        <ProfileContent />
      </CustomerLayout>
    </ProtectedRoute>
  );
}

function ProfileContent() {
  const { currentUser } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const [name, setName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [customerNumber, setCustomerNumber] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, language]);

  async function loadProfile() {
    if (!currentUser || !db) return;
    const dbInstance = db;

    setLoading(true);
    try {
      // Load customer data from Firestore
      const customerQuery = query(
        collection(dbInstance, 'customers'),
        where('uid', '==', currentUser.uid)
      );
      const customerSnapshot = await getDocs(customerQuery);

      if (!customerSnapshot.empty) {
        const customerDoc = customerSnapshot.docs[0];
        const data = customerDoc.data();
        setName(data.name || '');
        setMobileNumber(data.mobileNumber || '');
        setCustomerNumber(data.customerNumber || 'N/A');
        setEnabled(data.enabled !== false);
        // Load language preference
        if (data.language && data.language !== language) {
          setLanguage(data.language);
        }
      }

    } catch (error) {
      console.error('Error loading profile:', error);
      setError(t('messages.error.generic'));
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    if (!currentUser || !db) return;
    const dbInstance = db;

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      // Find customer document
      const customerQuery = query(
        collection(dbInstance, 'customers'),
        where('uid', '==', currentUser.uid)
      );
      const customerSnapshot = await getDocs(customerQuery);

      if (!customerSnapshot.empty) {
        const customerDoc = customerSnapshot.docs[0];
        await updateDoc(doc(dbInstance, 'customers', customerDoc.id), {
          name: name.trim() ? name.trim().charAt(0).toUpperCase() + name.trim().slice(1).toLowerCase() : '',
          mobileNumber: mobileNumber.trim() || '',
          updatedAt: new Date(),
        });

        setSuccess(t('profile.nameUpdated'));
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(t('messages.error.notFound'));
      }
    } catch (error: any) {
      console.error('Error updating profile:', error);
      setError(error.message || t('profile.nameUpdateFailed'));
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    if (!currentUser) return;
    if (!auth) {
      setError(t('messages.error.generic'));
      return;
    }
    const authInstance = auth;

    setSaving(true);
    setError('');
    setSuccess('');

    if (!currentPassword) {
      setError(t('profile.currentPasswordRequired'));
      setSaving(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t('profile.passwordMismatch'));
      setSaving(false);
      return;
    }

    if (newPassword.length < 6) {
      setError(t('profile.passwordTooShort'));
      setSaving(false);
      return;
    }

    try {
      // Get the current user directly from auth (not from context)
      const authUser = authInstance.currentUser;
      if (!authUser) {
        throw new Error(t('messages.error.generic'));
      }

      // Re-authenticate user using auth.currentUser directly
      const credential = EmailAuthProvider.credential(
        authUser.email || '',
        currentPassword
      );
      await reauthenticateWithCredential(authUser, credential);

      // Update password using the authenticated user
      await updatePassword(authUser, newPassword);

      setSuccess(t('profile.passwordUpdated'));
      setShowPasswordSection(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      setTimeout(() => setSuccess(''), 3000);
    } catch (error: any) {
      console.error('Error updating password:', error);
      if (error.code === 'auth/wrong-password') {
        setError(t('profile.invalidPassword'));
      } else if (error.code === 'auth/weak-password') {
        setError(t('profile.passwordTooWeak'));
      } else {
        setError(error.message || t('profile.passwordUpdateFailed'));
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleLanguageChange(newLanguage: string) {
    if (!currentUser || !db) return;
    const dbInstance = db;

    try {
      // Find customer document
      const customerQuery = query(
        collection(dbInstance, 'customers'),
        where('uid', '==', currentUser.uid)
      );
      const customerSnapshot = await getDocs(customerQuery);

      if (!customerSnapshot.empty) {
        const customerDoc = customerSnapshot.docs[0];
        await updateDoc(doc(dbInstance, 'customers', customerDoc.id), {
          language: newLanguage,
          updatedAt: new Date(),
        });
      } else {
        // Create customer doc if it doesn't exist
        await setDoc(doc(dbInstance, 'customers', currentUser.uid), {
          language: newLanguage,
          email: currentUser.email || '',
          uid: currentUser.uid,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      setLanguage(newLanguage as 'en' | 'de');
      setSuccess(t('profile.languageUpdated'));
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      console.error('Error updating language:', error);
      setError(t('profile.languageUpdateFailed'));
    }
  }

  if (loading) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8">
            <div className="animate-pulse space-y-4">
              <div className="h-8 bg-gray-200 rounded w-48"></div>
              <div className="h-32 bg-gray-100 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 bg-gray-50 min-h-screen">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">{t('profile.title')}</h1>
          <p className="text-sm text-gray-500">
            {currentUser?.email}
            {customerNumber && customerNumber !== 'N/A' && ` · ${customerNumber}`}
            {enabled !== undefined && (
              <span className={`ml-2 inline-flex items-center gap-1 text-xs font-medium ${enabled ? 'text-green-600' : 'text-amber-600'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${enabled ? 'bg-green-500' : 'bg-amber-500'}`} />
                {enabled ? t('profile.enabled') : t('profile.disabled')}
              </span>
            )}
          </p>
        </div>

        {(error || success) && (
          <div className={`mb-6 rounded-lg px-4 py-3 text-sm ${error ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
            {error || success}
          </div>
        )}

        <div className="max-w-2xl space-y-6">
            {/* Language Section */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 bg-gradient-to-r from-purple-50 to-pink-50 border-b-2 border-purple-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{t('profile.language')}</h3>
                    <p className="text-xs text-gray-600 mt-0.5">{t('profile.languageDescription')}</p>
                  </div>
                </div>
              </div>
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{language === 'en' ? '🇬🇧' : '🇩🇪'}</span>
                      <span className="text-sm font-medium text-gray-700">
                        {language === 'en' ? t('profile.english') : t('profile.german')}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleLanguageChange('en')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        language === 'en'
                          ? 'bg-green-power-600 text-white shadow-md'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      🇬🇧 {t('profile.english')}
                    </button>
                    <button
                      onClick={() => handleLanguageChange('de')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        language === 'de'
                          ? 'bg-green-power-600 text-white shadow-md'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      🇩🇪 {t('profile.german')}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Profile Information Section */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b-2 border-blue-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">{t('profile.nameSection')}</h3>
                </div>
              </div>
              <div className="p-6">
                <form onSubmit={handleSaveProfile} className="space-y-5">
                  <div>
                    <label htmlFor="name" className="block text-sm font-semibold text-gray-700 mb-2">
                      {t('profile.name')}
                    </label>
                    <input
                      id="name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-power-500 focus:border-green-power-500 transition-all"
                      placeholder={t('profile.enterFullName')}
                    />
                    <p className="mt-2 text-xs text-gray-500">{t('profile.nameDescription')}</p>
                  </div>
                  <div>
                    <label htmlFor="mobileNumber" className="block text-sm font-semibold text-gray-700 mb-2">
                      {t('profile.mobileNumber')}
                    </label>
                    <input
                      id="mobileNumber"
                      type="tel"
                      value={mobileNumber}
                      onChange={(e) => setMobileNumber(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-power-500 focus:border-green-power-500 transition-all"
                      placeholder="e.g., +1234567890"
                    />
                  </div>
                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-6 py-2.5 bg-gradient-to-r from-green-power-600 to-green-power-700 text-white text-sm font-semibold rounded-xl hover:from-green-power-700 hover:to-green-power-800 focus:outline-none focus:ring-2 focus:ring-green-power-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-all"
                    >
                      {saving ? (
                        <span className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          {t('common.saving')}
                        </span>
                      ) : (
                        t('profile.updateName')
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* Password Section */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 bg-gradient-to-r from-amber-50 to-orange-50 border-b-2 border-amber-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                      <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900">{t('profile.passwordSection')}</h3>
                  </div>
                  <button
                    onClick={() => {
                      setShowPasswordSection(!showPasswordSection);
                      setError('');
                      setSuccess('');
                      setCurrentPassword('');
                      setNewPassword('');
                      setConfirmPassword('');
                      setShowCurrentPassword(false);
                      setShowNewPassword(false);
                      setShowConfirmPassword(false);
                    }}
                    className="px-4 py-2 text-sm font-semibold text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors"
                  >
                    {showPasswordSection ? t('common.cancel') : t('profile.changePassword')}
                  </button>
                </div>
              </div>
              {showPasswordSection && (
                <div className="p-6 border-t border-gray-100 bg-gray-50/50">
                  <form onSubmit={handleChangePassword} className="space-y-5">
                    <div>
                      <label htmlFor="currentPassword" className="block text-sm font-semibold text-gray-700 mb-2">
                        {t('profile.currentPassword')} <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          id="currentPassword"
                          type={showCurrentPassword ? 'text' : 'password'}
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          className="w-full px-4 py-3 pr-12 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all"
                          placeholder={t('profile.enterCurrentPassword')}
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
                        >
                          {showCurrentPassword ? (
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
                    <div>
                      <label htmlFor="newPassword" className="block text-sm font-semibold text-gray-700 mb-2">
                        {t('profile.newPassword')} <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          id="newPassword"
                          type={showNewPassword ? 'text' : 'password'}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="w-full px-4 py-3 pr-12 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all"
                          placeholder={t('profile.enterNewPassword')}
                          required
                          minLength={6}
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
                        >
                          {showNewPassword ? (
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
                    <div>
                      <label htmlFor="confirmPassword" className="block text-sm font-semibold text-gray-700 mb-2">
                        {t('profile.confirmPassword')} <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          id="confirmPassword"
                          type={showConfirmPassword ? 'text' : 'password'}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="w-full px-4 py-3 pr-12 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all"
                          placeholder={t('profile.confirmNewPassword')}
                          required
                          minLength={6}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
                        >
                          {showConfirmPassword ? (
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
                    <div className="flex justify-end pt-2">
                      <button
                        type="submit"
                        disabled={saving}
                        className="px-6 py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 text-white text-sm font-semibold rounded-xl hover:from-amber-700 hover:to-orange-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-all"
                      >
                        {saving ? (
                          <span className="flex items-center gap-2">
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            {t('common.saving')}
                          </span>
                        ) : (
                          t('profile.updatePassword')
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
        </div>
      </div>
    </div>
  );
}
