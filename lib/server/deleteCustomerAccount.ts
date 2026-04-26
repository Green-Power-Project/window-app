import type { Firestore } from 'firebase-admin/firestore';
import { getAdminDb, getAdminAuth, getAdminRealtimeDb } from '@/lib/server/firebaseAdmin';
import { deleteFolderPrefixRecursive } from '@/lib/server/vpsStorage';

const CHUNK = 400;

async function deleteWhereEqual(db: Firestore, collectionId: string, field: string, value: string) {
  for (;;) {
    const snap = await db.collection(collectionId).where(field, '==', value).limit(CHUNK).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

async function deleteProjectScoped(db: Firestore, collectionId: string, projectId: string) {
  await deleteWhereEqual(db, collectionId, 'projectId', projectId);
}

/**
 * Removes all customer-owned Firebase data (Firestore + RTDB chat + VPS project uploads)
 * for the given Auth uid, then deletes the Auth user. Caller must verify identity first.
 */
export async function deleteCustomerAccountCascade(uid: string, email: string | null): Promise<void> {
  const db = getAdminDb();
  const auth = getAdminAuth();
  const rtdb = getAdminRealtimeDb();
  if (!db || !auth) {
    throw new Error('Firebase Admin is not configured');
  }

  const projectsSnap = await db.collection('projects').where('customerId', '==', uid).get();
  const projectIds = projectsSnap.docs.map((d) => d.id);

  for (const projectId of projectIds) {
    if (rtdb) {
      try {
        await rtdb.ref(`chats/${projectId}`).remove();
      } catch (e) {
        console.warn('[deleteCustomerAccount] RTDB chats/%s:', projectId, e);
      }
    }

    const folderRefs = await db.collection('files').doc('projects').collection(projectId).listDocuments();
    for (const ref of folderRefs) {
      try {
        await db.recursiveDelete(ref);
      } catch (e) {
        console.warn('[deleteCustomerAccount] recursiveDelete %s:', ref.path, e);
      }
    }

    try {
      await deleteFolderPrefixRecursive(`projects/${projectId}`);
    } catch (e) {
      console.warn('[deleteCustomerAccount] VPS projects/%s:', projectId, e);
    }

    await deleteProjectScoped(db, 'fileReadStatus', projectId);
    await deleteProjectScoped(db, 'reportApprovals', projectId);
    await deleteProjectScoped(db, 'reportSignatures', projectId);

    try {
      await db.recursiveDelete(db.collection('projects').doc(projectId));
    } catch (e) {
      console.warn('[deleteCustomerAccount] recursiveDelete projects/%s:', projectId, e);
    }
  }

  await deleteWhereEqual(db, 'customerMessages', 'customerId', uid);
  await deleteWhereEqual(db, 'fileReadStatus', 'customerId', uid);
  await deleteWhereEqual(db, 'reportApprovals', 'customerId', uid);
  await deleteWhereEqual(db, 'reportSignatures', 'customerId', uid);

  if (email && email.trim()) {
    const trimmed = email.trim();
    const variants = [...new Set([trimmed, trimmed.toLowerCase()])];
    for (const em of variants) {
      await deleteWhereEqual(db, 'offerRequests', 'email', em);
    }
  }

  const customersByUid = await db.collection('customers').where('uid', '==', uid).get();
  for (const d of customersByUid.docs) {
    await d.ref.delete();
  }
  const custDocRef = db.collection('customers').doc(uid);
  const custSnap = await custDocRef.get();
  if (custSnap.exists) {
    await custDocRef.delete();
  }

  await auth.deleteUser(uid);
}
