import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/server/firebaseAdmin';

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

function getAuthHeader() {
  if (!API_KEY || !API_SECRET) return null;
  return `Basic ${Buffer.from(`${API_KEY}:${API_SECRET}`).toString('base64')}`;
}

function getFolderPathId(folderPath: string): string {
  return folderPath
    .split('/')
    .filter(Boolean)
    .join('__');
}

async function deleteCloudinaryAsset(publicId: string): Promise<void> {
  if (!CLOUD_NAME) throw new Error('Cloudinary not configured');
  const authHeader = getAuthHeader();
  if (!authHeader) throw new Error('Cloudinary credentials missing');

  const deleteUrl = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/resources/${encodeURIComponent(publicId)}`;
  const response = await fetch(deleteUrl, {
    method: 'DELETE',
    headers: { Authorization: authHeader },
  });

  // Cloudinary returns 404 when resource is already missing; treat as success (idempotent delete).
  if (!response.ok && response.status !== 404) {
    const error = await response.text().catch(() => '');
    throw new Error(error || 'Failed to delete file from Cloudinary');
  }
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

    // Strict mode: only delete Firestore after storage delete succeeds.
    await deleteCloudinaryAsset(publicId);
    await fileRef.delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete file';
    console.error('[project-files/delete] POST error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

