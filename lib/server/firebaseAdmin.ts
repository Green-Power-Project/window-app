import { getApps, initializeApp, cert, App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';

let app: App | null = null;

function getFirebaseAdminApp(): App | null {
  if (app) return app;

  try {
    const existingApps = getApps();
    if (existingApps.length > 0) {
      app = existingApps[0]!;
      return app;
    }

    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!serviceAccountJson) {
      console.warn(
        '[firebaseAdmin] FIREBASE_SERVICE_ACCOUNT_KEY is not set. Customer login will be disabled.'
      );
      return null;
    }

    const serviceAccount = JSON.parse(serviceAccountJson);
    const databaseURL =
      process.env.FIREBASE_DATABASE_URL?.trim() ||
      process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL?.trim() ||
      undefined;

    app = initializeApp({
      credential: cert(serviceAccount),
      ...(databaseURL ? { databaseURL } : {}),
    });

    return app;
  } catch (error) {
    console.error('[firebaseAdmin] Failed to initialize Firebase Admin SDK:', error);
    return null;
  }
}

export function getAdminDb() {
  const adminApp = getFirebaseAdminApp();
  if (!adminApp) return null;
  return getFirestore(adminApp);
}

export function getAdminApp() {
  return getFirebaseAdminApp();
}

export function getAdminAuth() {
  const adminApp = getFirebaseAdminApp();
  if (!adminApp) return null;
  return getAuth(adminApp);
}

/** Realtime Database (e.g. project chat under `chats/{projectId}`). */
export function getAdminRealtimeDb() {
  const adminApp = getFirebaseAdminApp();
  if (!adminApp) return null;
  try {
    return getDatabase(adminApp);
  } catch {
    return null;
  }
}
