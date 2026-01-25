import { getApps, initializeApp, cert, App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

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

    app = initializeApp({
      credential: cert(serviceAccount),
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
