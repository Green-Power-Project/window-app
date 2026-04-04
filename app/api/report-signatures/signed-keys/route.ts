import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/server/firebaseAdmin';

/**
 * Returns filePath keys that already have a report signature in this folder.
 * Customer must own the project (customerId matches Firebase uid).
 */
export async function GET(request: NextRequest) {
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

    const projectId = request.nextUrl.searchParams.get('projectId')?.trim();
    const folderPath = request.nextUrl.searchParams.get('folderPath')?.trim();
    if (!projectId || !folderPath) {
      return NextResponse.json({ error: 'Missing projectId or folderPath' }, { status: 400 });
    }

    const projectSnap = await db.collection('projects').doc(projectId).get();
    if (!projectSnap.exists) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const customerId = projectSnap.data()?.customerId;
    if (typeof customerId !== 'string' || customerId !== uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const snap = await db
      .collection('reportSignatures')
      .where('projectId', '==', projectId)
      .where('folderPath', '==', folderPath)
      .get();

    const paths = new Set<string>();
    for (const d of snap.docs) {
      const fp = d.data()?.filePath;
      if (typeof fp === 'string' && fp) paths.add(fp);
    }

    return NextResponse.json({ signedFilePaths: [...paths] });
  } catch (e) {
    console.error('[report-signatures/signed-keys]', e);
    return NextResponse.json({ error: 'Failed to load' }, { status: 500 });
  }
}
