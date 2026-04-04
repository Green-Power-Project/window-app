import { NextRequest, NextResponse } from 'next/server';
import { deleteFolderPrefixRecursive } from '@/lib/server/vpsStorage';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const folderPath = typeof body?.folderPath === 'string' ? body.folderPath.trim() : '';
    if (!folderPath) {
      return NextResponse.json({ error: 'Folder path required' }, { status: 400 });
    }

    await deleteFolderPrefixRecursive(folderPath);
    return NextResponse.json({ success: true, deleted: 1 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Delete folder failed';
    console.error('[storage/delete-folder]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
