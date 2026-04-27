import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/server/firebaseAdmin';

export async function POST(request: NextRequest) {
  try {
    const db = getAdminDb();
    const auth = getAdminAuth();
    if (!db || !auth) {
      return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
    }

    const header = request.headers.get('Authorization');
    if (!header?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const idToken = header.slice(7);

    let uid: string;
    try {
      const decoded = await auth.verifyIdToken(idToken);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as {
      projectId?: unknown;
      folderPath?: unknown;
      fileDocId?: unknown;
      filePath?: unknown;
    } | null;

    const projectId = typeof body?.projectId === 'string' ? body.projectId.trim() : '';
    const folderPath = typeof body?.folderPath === 'string' ? body.folderPath.trim() : '';
    const fileDocId = typeof body?.fileDocId === 'string' ? body.fileDocId.trim() : '';
    const filePath = typeof body?.filePath === 'string' ? body.filePath.trim() : '';
    if (!projectId || !folderPath || (!fileDocId && !filePath)) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const projectSnap = await db.collection('projects').doc(projectId).get();
    if (!projectSnap.exists) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const customerId = projectSnap.data()?.customerId;
    if (typeof customerId !== 'string' || customerId !== uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const folderPathId = folderPath.split('/').filter(Boolean).join('__');
    if (!folderPathId) {
      return NextResponse.json({ error: 'Invalid folderPath' }, { status: 400 });
    }

    const filesCollectionRef = db
      .collection('files')
      .doc('projects')
      .collection(projectId)
      .doc(folderPathId)
      .collection('files');

    let fileRef = fileDocId ? filesCollectionRef.doc(fileDocId) : null;
    let fileSnap = fileRef ? await fileRef.get() : null;

    if ((!fileSnap || !fileSnap.exists) && filePath) {
      const byPathSnap = await filesCollectionRef.where('filePath', '==', filePath).limit(1).get();
      if (!byPathSnap.empty) {
        fileSnap = byPathSnap.docs[0];
        fileRef = byPathSnap.docs[0].ref;
      }
    }

    if (!fileRef || !fileSnap || !fileSnap.exists) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    await fileRef.set(
      {
        customerDownloadCount: FieldValue.increment(1),
        lastCustomerDownloadAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const updatedSnap = await fileRef.get();
    const data = updatedSnap.data() as { customerDownloadCount?: unknown } | undefined;
    const customerDownloadCount =
      typeof data?.customerDownloadCount === 'number' && Number.isFinite(data.customerDownloadCount)
        ? Math.max(0, Math.floor(data.customerDownloadCount))
        : 0;

    return NextResponse.json({ ok: true, customerDownloadCount });
  } catch (e) {
    console.error('[file-downloads/track]', e);
    return NextResponse.json({ error: 'Failed to track download' }, { status: 500 });
  }
}
