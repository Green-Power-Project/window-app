import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/server/firebaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const db = getAdminDb();
    if (!db) {
      return NextResponse.json({ error: 'Database not available' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const folderId = searchParams.get('folderId');

    if (!folderId) {
      return NextResponse.json({ error: 'folderId is required' }, { status: 400 });
    }

    const snapshot = await db
      .collection('catalogEntries')
      .where('folderId', '==', folderId)
      .get();

    const items = snapshot.docs
      .map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          folderId: data.folderId ?? '',
          name: data.name ?? '',
          description: typeof data.description === 'string' ? data.description : '',
          fileUrl: typeof data.fileUrl === 'string' ? data.fileUrl : '',
          fileName: typeof data.fileName === 'string' ? data.fileName : '',
          order: typeof data.order === 'number' ? data.order : 0,
        };
      })
      .sort((a, b) => a.order - b.order);

    return NextResponse.json(items);
  } catch (error) {
    console.error('[catalog-entries] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch entries' }, { status: 500 });
  }
}
