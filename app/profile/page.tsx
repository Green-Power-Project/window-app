'use client';

import { useState, useEffect, FormEvent } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import CustomerLayout from '@/components/CustomerLayout';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { auth } from '@/lib/firebase';

export default function ProfilePage() {
  return (
    <ProtectedRoute>
      <CustomerLayout title="Profile Settings">
        <ProfileContent />
      </CustomerLayout>
    </ProtectedRoute>
  );
}

function ProfileContent() {
  const { currentUser } = useAuth();
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
  }, [currentUser]);

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
      }

    } catch (error) {
      console.error('Error loading profile:', error);
      setError('Failed to load profile information');
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

        setSuccess('Profile updated successfully');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError('Customer profile not found');
      }
    } catch (error: any) {
      console.error('Error updating profile:', error);
      setError(error.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    if (!currentUser) return;
    if (!auth) {
      setError('Authentication not initialized');
      return;
    }
    const authInstance = auth;

    setSaving(true);
    setError('');
    setSuccess('');

    if (!currentPassword) {
      setError('Current password is required');
      setSaving(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      setSaving(false);
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      setSaving(false);
      return;
    }

    try {
      // Get the current user directly from auth (not from context)
      const authUser = authInstance.currentUser;
      if (!authUser) {
        throw new Error('No user is currently signed in');
      }

      // Re-authenticate user using auth.currentUser directly
      const credential = EmailAuthProvider.credential(
        authUser.email || '',
        currentPassword
      );
      await reauthenticateWithCredential(authUser, credential);

      // Update password using the authenticated user
      await updatePassword(authUser, newPassword);

      setSuccess('Password updated successfully');
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
        setError('Current password is incorrect');
      } else if (error.code === 'auth/weak-password') {
        setError('Password is too weak');
      } else {
        setError(error.message || 'Failed to update password');
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="px-8 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
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
    <div className="px-6 sm:px-8 py-6 sm:py-8 bg-gray-50 min-h-screen">
      <div className="max-w-5xl mx-auto">
        {/* Header Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Profile Settings</h1>
          <p className="text-sm text-gray-600">Manage your account information and security settings</p>
        </div>

        {/* Alert Messages */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-3">
            <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <p className="text-sm text-red-700 font-medium">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-start gap-3">
            <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <p className="text-sm text-green-700 font-medium">{success}</p>
          </div>
        )}

        {/* Profile Header Card */}
        <div className="bg-gradient-to-br from-green-power-600 to-green-power-700 rounded-2xl shadow-lg mb-8 overflow-hidden">
          <div className="px-8 py-8">
            <div className="flex items-center gap-6">
              <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center shadow-xl">
                <span className="text-3xl font-bold text-green-power-700">
                  {name ? name.charAt(0).toUpperCase() : currentUser?.email?.charAt(0).toUpperCase() || 'C'}
                </span>
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-white mb-1">
                  {name || currentUser?.email?.split('@')[0] || 'Customer'}
                </h2>
                <p className="text-green-power-100 text-sm">{currentUser?.email}</p>
                <p className="text-green-power-200 text-xs mt-1">
                  {customerNumber && customerNumber !== 'N/A' 
                    ? customerNumber.charAt(0).toUpperCase() + customerNumber.slice(1)
                    : 'Customer Account'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Main Settings */}
          <div className="lg:col-span-2 space-y-6">
            {/* Profile Information Section */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b-2 border-blue-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">Personal Information</h3>
                </div>
              </div>
              <div className="p-6">
                <form onSubmit={handleSaveProfile} className="space-y-5">
                  <div>
                    <label htmlFor="name" className="block text-sm font-semibold text-gray-700 mb-2">
                      Full Name
                    </label>
                    <input
                      id="name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-power-500 focus:border-green-power-500 transition-all"
                      placeholder="Enter your full name"
                    />
                    <p className="mt-2 text-xs text-gray-500">This name will be displayed in your profile</p>
                  </div>
                  <div>
                    <label htmlFor="mobileNumber" className="block text-sm font-semibold text-gray-700 mb-2">
                      Mobile Number
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
                          Saving...
                        </span>
                      ) : (
                        'Save Changes'
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
                    <h3 className="text-lg font-semibold text-gray-900">Password</h3>
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
                    {showPasswordSection ? 'Cancel' : 'Change'}
                  </button>
                </div>
              </div>
              {showPasswordSection && (
                <div className="p-6 border-t border-gray-100 bg-gray-50/50">
                  <form onSubmit={handleChangePassword} className="space-y-5">
                    <div>
                      <label htmlFor="currentPassword" className="block text-sm font-semibold text-gray-700 mb-2">
                        Current Password <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          id="currentPassword"
                          type={showCurrentPassword ? 'text' : 'password'}
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          className="w-full px-4 py-3 pr-12 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all"
                          placeholder="Enter your current password"
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
                        New Password <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          id="newPassword"
                          type={showNewPassword ? 'text' : 'password'}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="w-full px-4 py-3 pr-12 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all"
                          placeholder="Enter new password (min 6 characters)"
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
                        Confirm New Password <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          id="confirmPassword"
                          type={showConfirmPassword ? 'text' : 'password'}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="w-full px-4 py-3 pr-12 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all"
                          placeholder="Confirm new password"
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
                            Updating...
                          </span>
                        ) : (
                          'Update Password'
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Account Info */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden sticky top-6">
              <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">Account Info</h3>
                </div>
              </div>
              <div className="p-6 space-y-6">
                <div className="pb-6 border-b border-gray-200">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Customer Number</p>
                  <div className="inline-flex items-center gap-2 px-3 py-2 bg-green-power-50 text-green-power-700 rounded-lg border border-green-power-200">
                    <span className="text-sm font-semibold">
                      {customerNumber && customerNumber !== 'N/A' 
                        ? customerNumber.charAt(0).toUpperCase() + customerNumber.slice(1)
                        : 'N/A'}
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Account Status</p>
                  <div className="space-y-2">
                    <span
                      className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold ${
                        enabled
                          ? 'bg-green-100 text-green-700 border border-green-200'
                          : 'bg-red-100 text-red-700 border border-red-200'
                      }`}
                    >
                      <div className={`w-2 h-2 rounded-full ${enabled ? 'bg-green-500' : 'bg-red-500'}`}></div>
                      {enabled ? 'Enabled' : 'Disabled'}
                    </span>
                    <p className="text-xs text-gray-500">Account status can only be changed by administrator</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
