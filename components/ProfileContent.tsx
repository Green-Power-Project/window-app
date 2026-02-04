'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, updateDoc, doc, setDoc } from 'firebase/firestore';
import { updatePassword, updateProfile, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { auth } from '@/lib/firebase';

const PROFILE_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
const profileCache: { uid: string; docId: string; name: string; mobileNumber: string; customerNumber: string; enabled: boolean; language?: string; ts: number }[] = [];

function getCachedProfile(uid: string): typeof profileCache[0] | null {
  const entry = profileCache.find((e) => e.uid === uid);
  if (!entry || Date.now() - entry.ts > PROFILE_CACHE_TTL_MS) return null;
  return entry;
}

function setCachedProfile(uid: string, docId: string, data: { name: string; mobileNumber: string; customerNumber: string; enabled: boolean; language?: string }) {
  const idx = profileCache.findIndex((e) => e.uid === uid);
  if (idx >= 0) profileCache.splice(idx, 1);
  profileCache.push({ uid, docId, ...data, ts: Date.now() });
  if (profileCache.length > 20) profileCache.shift();
}

export default function ProfileContent() {
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
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [savedName, setSavedName] = useState('');
  const [savedMobileNumber, setSavedMobileNumber] = useState('');
  const [customerDocId, setCustomerDocId] = useState<string | null>(null);

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, language]);

  async function loadProfile() {
    if (!currentUser || !db) return;
    const dbInstance = db;
    const cached = getCachedProfile(currentUser.uid);
    if (cached) {
      setName(cached.name);
      setMobileNumber(cached.mobileNumber);
      setSavedName(cached.name);
      setSavedMobileNumber(cached.mobileNumber);
      setCustomerNumber(cached.customerNumber);
      setEnabled(cached.enabled);
      setCustomerDocId(cached.docId);
      if (cached.language && cached.language !== language && (cached.language === 'en' || cached.language === 'de')) {
        setLanguage(cached.language);
      }
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const customerQuery = query(
        collection(dbInstance, 'customers'),
        where('uid', '==', currentUser.uid)
      );
      const customerSnapshot = await getDocs(customerQuery);
      if (!customerSnapshot.empty) {
        const customerDoc = customerSnapshot.docs[0];
        const data = customerDoc.data();
        const loadedName = data.name || '';
        const loadedMobile = data.mobileNumber || '';
        setName(loadedName);
        setMobileNumber(loadedMobile);
        setSavedName(loadedName);
        setSavedMobileNumber(loadedMobile);
        setCustomerNumber(data.customerNumber || 'N/A');
        setEnabled(data.enabled !== false);
        setCustomerDocId(customerDoc.id);
        setCachedProfile(currentUser.uid, customerDoc.id, {
          name: loadedName,
          mobileNumber: loadedMobile,
          customerNumber: data.customerNumber || 'N/A',
          enabled: data.enabled !== false,
          language: data.language,
        });
        if (data.language && data.language !== language && (data.language === 'en' || data.language === 'de')) {
          setLanguage(data.language);
        }
      }
    } catch (err) {
      console.error('Error loading profile:', err);
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
      let docId = customerDocId;
      if (!docId) {
        const customerQuery = query(
          collection(dbInstance, 'customers'),
          where('uid', '==', currentUser.uid)
        );
        const customerSnapshot = await getDocs(customerQuery);
        if (customerSnapshot.empty) {
          setError(t('messages.error.notFound'));
          setSaving(false);
          return;
        }
        docId = customerSnapshot.docs[0].id;
        setCustomerDocId(docId);
      }
      const formattedName = name.trim() ? name.trim().charAt(0).toUpperCase() + name.trim().slice(1).toLowerCase() : '';
      await updateDoc(doc(dbInstance, 'customers', docId), {
          name: formattedName,
          mobileNumber: mobileNumber.trim() || '',
          updatedAt: new Date(),
        });
        if (auth?.currentUser) {
          await updateProfile(auth.currentUser, { displayName: formattedName || '' });
        }
        setSavedName(formattedName);
        setSavedMobileNumber(mobileNumber.trim() || '');
        setSuccess(t('profile.nameUpdated'));
        setIsEditingProfile(false);
        setTimeout(() => setSuccess(''), 3000);
        setCachedProfile(currentUser.uid, docId, {
          name: formattedName,
          mobileNumber: mobileNumber.trim() || '',
          customerNumber,
          enabled,
          language: language,
        });
    } catch (err: unknown) {
      console.error('Error updating profile:', err);
      setError((err as Error)?.message || t('profile.nameUpdateFailed'));
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    if (!currentUser || !auth) {
      setError(t('messages.error.generic'));
      return;
    }
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
      const authUser = auth.currentUser;
      if (!authUser) throw new Error(t('messages.error.generic'));
      const credential = EmailAuthProvider.credential(authUser.email || '', currentPassword);
      await reauthenticateWithCredential(authUser, credential);
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
    } catch (err: unknown) {
      const errAny = err as { code?: string; message?: string };
      if (errAny.code === 'auth/wrong-password') setError(t('profile.invalidPassword'));
      else if (errAny.code === 'auth/weak-password') setError(t('profile.passwordTooWeak'));
      else setError(errAny.message || t('profile.passwordUpdateFailed'));
    } finally {
      setSaving(false);
    }
  }

  async function handleLanguageChange(newLanguage: string) {
    if (!currentUser || !db) return;
    const dbInstance = db;
    try {
      let docId = customerDocId;
      if (!docId) {
        const customerQuery = query(
          collection(dbInstance, 'customers'),
          where('uid', '==', currentUser.uid)
        );
        const customerSnapshot = await getDocs(customerQuery);
        if (!customerSnapshot.empty) {
          docId = customerSnapshot.docs[0].id;
          setCustomerDocId(docId);
        }
      }
      if (docId) {
        await updateDoc(doc(dbInstance, 'customers', docId), {
          language: newLanguage,
          updatedAt: new Date(),
        });
      } else {
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
    } catch (err) {
      console.error('Error updating language:', err);
      setError(t('profile.languageUpdateFailed'));
    }
  }

  const displayName = name.trim() || currentUser?.displayName || currentUser?.email?.split('@')[0] || '';
  const initial = (displayName.charAt(0) || currentUser?.email?.charAt(0) || 'C').toUpperCase();

  if (loading) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        <div className="max-w-4xl mx-auto animate-pulse space-y-6">
          <div className="h-40 rounded-2xl bg-gray-200" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="h-64 rounded-2xl bg-gray-100" />
            <div className="h-64 rounded-2xl bg-gray-100" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 min-h-full">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Toasts */}
        {(error || success) && (
          <div className={`rounded-xl px-4 py-3 text-sm ${error ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
            {error || success}
          </div>
        )}

        {/* Top header – light green gradient, rounded bottom */}
        <div
          className="rounded-b-2xl overflow-hidden px-6 py-5 flex flex-wrap items-center gap-6"
          style={{
            background: 'linear-gradient(135deg, rgba(72, 164, 127, 0.22) 0%, rgba(72, 164, 127, 0.08) 50%, rgba(240, 247, 242, 0.95) 100%)',
            boxShadow: '0 4px 24px rgba(72, 164, 127, 0.12)',
          }}
        >
          <div className="relative flex-shrink-0">
            <div className="w-20 h-20 rounded-full bg-white border-2 border-white shadow-md flex items-center justify-center text-2xl font-semibold text-green-power-700">
              {initial}
            </div>
            <span className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-green-power-500 border-2 border-white flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{displayName || t('common.customerRole')}</h1>
            <p className="text-sm text-gray-600 mt-0.5 truncate">{currentUser?.email}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-sm font-medium text-gray-700">{enabled ? t('profile.active') : t('profile.disabled')}</span>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md hover:shadow-lg transition-all"
              style={{ background: 'linear-gradient(135deg, #72a47f 0%, #5d8a6a 50%, #0d9488 100%)' }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              {t('profile.editProfile')}
            </button>
          </div>
        </div>

        {/* Two panels: Your Info | Quick Preferences */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left: Your Info */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-power-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-green-power-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-gray-900">{t('profile.yourInfo')}</h2>
              </div>
            </div>
            <form onSubmit={handleSaveProfile} className="p-6 space-y-4" noValidate>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('profile.personalDetails')}</p>
                <div className="space-y-4">
                  <div>
                    <label htmlFor="profile-name" className="block text-sm font-medium text-gray-700 mb-1">{t('profile.name')}</label>
                    <input
                      id="profile-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={!isEditingProfile}
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm focus:ring-2 focus:ring-green-power-500 focus:border-green-power-500 disabled:opacity-70 disabled:cursor-not-allowed"
                      placeholder={t('profile.enterFullName')}
                    />
                  </div>
                  <div>
                    <label htmlFor="profile-phone" className="block text-sm font-medium text-gray-700 mb-1">{t('profile.mobileNumber')}</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                      </span>
                      <input
                        id="profile-phone"
                        type="tel"
                        value={mobileNumber}
                        onChange={(e) => setMobileNumber(e.target.value)}
                        disabled={!isEditingProfile}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm focus:ring-2 focus:ring-green-power-500 focus:border-green-power-500 disabled:opacity-70 disabled:cursor-not-allowed"
                        placeholder={t('profile.enterMobileNumber')}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('profile.language')}</label>
                    <p className="text-sm text-gray-900">{language === 'en' ? t('profile.english') : t('profile.german')}</p>
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                {isEditingProfile ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setName(savedName);
                        setMobileNumber(savedMobileNumber);
                        setError('');
                        setSuccess('');
                        setIsEditingProfile(false);
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-green-power-500 hover:bg-green-power-600 disabled:opacity-50 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                      {t('profile.updateProfile')}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setError('');
                      setSuccess('');
                      setIsEditingProfile(true);
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-green-power-500 hover:bg-green-power-600 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    {t('profile.editDetails')}
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Right: Quick Preferences */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-power-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-green-power-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0h.5a2.5 2.5 0 002.5-2.5V3.935M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-gray-900">{t('profile.quickPreferences')}</h2>
              </div>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{t('profile.language')}</p>
                <div className="inline-flex rounded-xl border border-gray-200 overflow-hidden bg-gray-50">
                  <button
                    type="button"
                    onClick={() => handleLanguageChange('en')}
                    className={`px-4 py-2.5 text-sm font-medium transition-colors ${language === 'en' ? 'bg-green-power-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
                  >
                    EN
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLanguageChange('de')}
                    className={`px-4 py-2.5 text-sm font-medium transition-colors ${language === 'de' ? 'bg-green-power-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
                  >
                    DE
                  </button>
                </div>
              </div>

              {/* Security – Update password button opens password modal */}
              <div className="rounded-xl border-2 border-amber-200 bg-amber-50/50 p-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <span className="text-sm font-semibold text-gray-900">{t('profile.security')}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPasswordSection(true)}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 transition-colors"
                  >
                    {t('profile.changePassword')}
                  </button>
                </div>
                <p className="text-sm text-gray-600">{t('profile.lastPasswordChange')}: —</p>
              </div>
            </div>
          </div>
        </div>

        {/* Change password modal */}
        {showPasswordSection && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            onClick={() => {
              setShowPasswordSection(false);
              setCurrentPassword('');
              setNewPassword('');
              setConfirmPassword('');
              setError('');
            }}
            aria-hidden
          >
            <div
              className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-md overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-4 border-b border-amber-200 bg-amber-50/50">
                <h3 className="text-lg font-semibold text-gray-900">{t('profile.changePassword')}</h3>
              </div>
              <div className="p-6">
                <form onSubmit={handleChangePassword} className="space-y-4">
                <div>
                  <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 mb-1">{t('profile.currentPassword')} *</label>
                  <div className="relative">
                    <input
                      id="currentPassword"
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="w-full px-4 py-2.5 pr-10 rounded-xl border border-gray-200 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                      placeholder={t('profile.enterCurrentPassword')}
                      required
                    />
                    <button type="button" onClick={() => setShowCurrentPassword(!showCurrentPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                      {showCurrentPassword ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                      )}
                    </button>
                  </div>
                </div>
                <div>
                  <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">{t('profile.newPassword')} *</label>
                  <div className="relative">
                    <input
                      id="newPassword"
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-4 py-2.5 pr-10 rounded-xl border border-gray-200 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                      placeholder={t('profile.enterNewPassword')}
                      required
                      minLength={6}
                    />
                    <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                      {showNewPassword ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                      )}
                    </button>
                  </div>
                </div>
                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">{t('profile.confirmPassword')} *</label>
                  <div className="relative">
                    <input
                      id="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full px-4 py-2.5 pr-10 rounded-xl border border-gray-200 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                      placeholder={t('profile.confirmNewPassword')}
                      required
                      minLength={6}
                    />
                    <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                      {showConfirmPassword ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                      )}
                    </button>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowPasswordSection(false);
                      setCurrentPassword('');
                      setNewPassword('');
                      setConfirmPassword('');
                      setError('');
                    }}
                    className="px-4 py-2.5 rounded-xl text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200"
                  >
                    {t('profile.cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50"
                  >
                    {saving ? (
                      <span className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        {t('common.saving')}
                      </span>
                    ) : (
                      t('profile.changePassword')
                    )}
                  </button>
                </div>
              </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
