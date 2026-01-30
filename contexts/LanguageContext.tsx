'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

export type Language = 'en' | 'de';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

// Import translations
import enTranslations from '@/locales/en/common.json';
import deTranslations from '@/locales/de/common.json';

const translations: Record<Language, any> = {
  en: enTranslations,
  de: deTranslations,
};

// Helper function to get nested translation
// Supports both nested keys (e.g. folders.02_Photos.description) and flat keys with dots (e.g. folders["02_Photos.description"])
function getNestedTranslation(obj: any, path: string): string {
  const keys = path.split('.');
  let value: any = obj;

  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key];
    } else {
      // Fallback: try first segment as parent, rest as single key (e.g. folders["02_Photos.description"])
      if (keys.length >= 2) {
        const parent = obj[keys[0]];
        const flatKey = keys.slice(1).join('.');
        if (parent && typeof parent === 'object' && flatKey in parent) {
          const flatValue = parent[flatKey];
          return typeof flatValue === 'string' ? flatValue : path;
        }
      }
      return path;
    }
  }

  return typeof value === 'string' ? value : path;
}

// Helper function to replace params in translation
function replaceParams(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  
  let result = text;
  for (const [key, value] of Object.entries(params)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
  }
  return result;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth();
  const [language, setLanguageState] = useState<Language>(() => {
    // Initialize from localStorage if available; otherwise default to German
    if (typeof window !== 'undefined') {
      const savedLang = localStorage.getItem('customer-language') as Language;
      if (savedLang === 'en' || savedLang === 'de') {
        return savedLang;
      }
    }
    return 'de';
  });
  const [loading, setLoading] = useState(true);

  // Load language preference from Firestore or localStorage
  useEffect(() => {
    async function loadLanguagePreference() {
      // First check localStorage for immediate load
      if (typeof window !== 'undefined') {
        const savedLang = localStorage.getItem('customer-language') as Language;
        if (savedLang === 'en' || savedLang === 'de') {
          setLanguageState(savedLang);
        }
      }

      // If we have a user and db, try to load from Firestore
      if (currentUser && db) {
        const dbInstance = db;

        try {
          const customerDoc = await getDoc(doc(dbInstance, 'customers', currentUser.uid));
          if (customerDoc.exists()) {
            const data = customerDoc.data();
            const savedLanguage = data.language as Language;
            if (savedLanguage === 'en' || savedLanguage === 'de') {
              setLanguageState(savedLanguage);
              if (typeof window !== 'undefined') {
                localStorage.setItem('customer-language', savedLanguage);
              }
            }
          }
        } catch (error) {
          console.error('Error loading language preference:', error);
        }
      }
      
      setLoading(false);
    }

    loadLanguagePreference();
  }, [currentUser]);

  // Save language preference to Firestore
  const setLanguage = async (lang: Language) => {
    setLanguageState(lang);
    if (typeof window !== 'undefined') {
      localStorage.setItem('customer-language', lang);
    }

    // Try to save to Firestore if user is available
    if (currentUser && db) {
      const dbInstance = db;

      try {
        const customerDocRef = doc(dbInstance, 'customers', currentUser.uid);
        const customerDoc = await getDoc(customerDocRef);

        if (customerDoc.exists()) {
          await updateDoc(customerDocRef, {
            language: lang,
            updatedAt: new Date(),
          });
        } else {
          await setDoc(customerDocRef, {
            language: lang,
            email: currentUser.email || '',
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
      } catch (error) {
        console.error('Error saving language preference:', error);
      }
    }
  };

  // Translation function
  const t = (key: string, params?: Record<string, string | number>): string => {
    const translation = getNestedTranslation(translations[language], key);
    return replaceParams(translation, params);
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
