import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/server/firebaseAdmin';
import { deleteProjectFileByPublicId, unlinkQuiet } from '@/lib/server/vpsStorage';

function getFolderPathId(folderPath: string): string {
  return folderPath
    .split('/')
    .filter(Boolean)
    .join('__');
}

export async function POST(request: NextRequest) {
  try {
    const db = getAdminDb();
    if (!db) {
      return NextResponse.json({ error: 'Database not available' }, { status: 500 });
    }

    const body = await request.json().catch(() => null);
    const projectId = typeof body?.projectId === 'string' ? body.projectId.trim() : '';
    const folderPath = typeof body?.folderPath === 'string' ? body.folderPath.trim() : '';
    const docId = typeof body?.docId === 'string' ? body.docId.trim() : '';
    const publicId = typeof body?.publicId === 'string' ? body.publicId.trim() : '';

    if (!projectId || !folderPath || !docId || !publicId) {
      return NextResponse.json({ error: 'projectId, folderPath, docId and publicId are required' }, { status: 400 });
    }

    const folderPathId = getFolderPathId(folderPath);
    const fileRef = db
      .collection('files')
      .doc('projects')
      .collection(projectId)
      .doc(folderPathId)
      .collection('files')
      .doc(docId);

    const snap = await fileRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
    const data = snap.data() || {};
    const storagePath = typeof data.storagePath === 'string' ? data.storagePath : '';
    const fileName = typeof data.fileName === 'string' ? data.fileName : undefined;

    if (storagePath) {
      await unlinkQuiet(storagePath);
    } else {
      await deleteProjectFileByPublicId(publicId, fileName);
    }

    await fileRef.delete();

    const sigSnap = await db
      .collection('reportSignatures')
      .where('filePath', '==', publicId)
      .get();
    await Promise.all(sigSnap.docs.map((d) => d.ref.delete()));

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete file';
    console.error('[project-files/delete] POST error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
