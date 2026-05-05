'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithCustomerNumber: (customerNumber: string, projectNumber: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  async function login(email: string, password: string): Promise<void> {
    if (!auth) {
      throw new Error('Firebase Auth is not initialized');
    }
    if (typeof window !== 'undefined') {
      // Email login should not inherit project-scoped restrictions from a previous session.
      sessionStorage.removeItem('loggedInProjectId');
      sessionStorage.setItem('canViewAllProjects', 'true');
      sessionStorage.setItem('loginScope', 'all-projects');
    }
    await signInWithEmailAndPassword(auth, email, password);
  }

  async function loginWithCustomerNumber(customerNumber: string, projectNumber: string): Promise<void> {
    if (!auth) {
      throw new Error('Firebase Auth is not initialized');
    }

    // Call API to get custom token
    const response = await fetch('/api/auth/customer-login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ customerNumber, projectNumber }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to authenticate');
    }

    if (!data.customToken) {
      throw new Error('No token received from server');
    }

    // Project-number login is always project-scoped.
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('canViewAllProjects', 'false');
      sessionStorage.setItem('loginScope', 'single-project');
      if (data.loggedInProjectId) {
        sessionStorage.setItem('loggedInProjectId', data.loggedInProjectId);
      }
    }

    // Sign in with custom token
    await signInWithCustomToken(auth, data.customToken);
  }

  function logout() {
    if (!auth) {
      throw new Error('Firebase Auth is not initialized');
    }
    // Clear sessionStorage on logout
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('canViewAllProjects');
      sessionStorage.removeItem('loggedInProjectId');
      sessionStorage.removeItem('loginScope');
    }
    return signOut(auth);
  }

  function resetPassword(email: string) {
    if (!auth) {
      throw new Error('Firebase Auth is not initialized');
    }
    return sendPasswordResetEmail(auth, email);
  }

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      setLoading(false);

      if (!user || typeof window === 'undefined') return;

      try {
        const tokenResult = await user.getIdTokenResult();
        const claimScope = tokenResult.claims.loginScope;
        const claimProjectId = tokenResult.claims.projectId;
        if (claimScope === 'single-project' && typeof claimProjectId === 'string' && claimProjectId) {
          sessionStorage.setItem('loginScope', 'single-project');
          sessionStorage.setItem('canViewAllProjects', 'false');
          sessionStorage.setItem('loggedInProjectId', claimProjectId);
          return;
        }
      } catch (e) {
        console.warn('Could not read auth token claims:', e);
      }

      // Email+password login: set canViewAllProjects from customer doc so dashboard shows all authorized projects.
      // Project-based login already sets project-scoped markers in loginWithCustomerNumber.
      // Skip getDocs if we already have canViewAllProjects in session (same session, e.g. page refresh).
      if (!sessionStorage.getItem('loggedInProjectId')) {
        if (sessionStorage.getItem('canViewAllProjects') !== null) {
          // Already loaded this session; skip Firestore read
        } else {
          try {
            if (db) {
              const q = query(collection(db, 'customers'), where('uid', '==', user.uid));
              const snap = await getDocs(q);
              if (!snap.empty) {
                const canViewAllProjects = snap.docs[0].data().canViewAllProjects === true;
                sessionStorage.setItem('canViewAllProjects', String(canViewAllProjects));
                sessionStorage.setItem('loginScope', canViewAllProjects ? 'all-projects' : 'single-project');
              }
            }
          } catch (e) {
            console.warn('Could not load customer canViewAllProjects:', e);
          }
        }
      }
    });

    return unsubscribe;
  }, []);

  const value: AuthContextType = {
    currentUser,
    loading,
    login,
    loginWithCustomerNumber,
    logout,
    resetPassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

