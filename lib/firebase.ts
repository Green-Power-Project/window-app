import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  Firestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { getDatabase, Database } from 'firebase/database';
import { getStorage, FirebaseStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
};

type FirebaseClient = {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  realtimeDb?: Database;
  storage?: FirebaseStorage;
};

const CLIENT_KEY = '__GREEN_POWER_FIREBASE_CLIENT__';

function createFirebaseClient(): FirebaseClient {
  if (getApps().length > 0) {
    const app = getApps()[0]!;
    const client: FirebaseClient = {
      app,
      auth: getAuth(app),
      db: getFirestore(app),
    };
    if (firebaseConfig.databaseURL) {
      client.realtimeDb = getDatabase(app);
    }
    if (firebaseConfig.storageBucket) {
      client.storage = getStorage(app);
    }
    return client;
  }

  const app = initializeApp(firebaseConfig);
  const useMemoryCache = process.env.NODE_ENV === 'development';
  const db = initializeFirestore(app, {
    localCache: useMemoryCache
      ? memoryLocalCache()
      : persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
  });

  const client: FirebaseClient = {
    app,
    auth: getAuth(app),
    db,
  };
  if (firebaseConfig.databaseURL) {
    client.realtimeDb = getDatabase(app);
  }
  if (firebaseConfig.storageBucket) {
    client.storage = getStorage(app);
  }
  return client;
}

function getFirebaseClient(): FirebaseClient | undefined {
  if (typeof window === 'undefined') return undefined;
  const globalStore = globalThis as typeof globalThis & {
    [CLIENT_KEY]?: FirebaseClient;
  };
  if (!globalStore[CLIENT_KEY]) {
    globalStore[CLIENT_KEY] = createFirebaseClient();
  }
  return globalStore[CLIENT_KEY];
}

const client = getFirebaseClient();

export const app = client?.app;
export const auth = client?.auth;
export const db = client?.db;
export const realtimeDb = client?.realtimeDb;
export const storage = client?.storage;
export default app;
