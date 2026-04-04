import { NextRequest, NextResponse } from 'next/server';
import { deleteProjectFileByPublicId } from '@/lib/server/vpsStorage';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const publicId = typeof body?.publicId === 'string' ? body.publicId.trim() : '';
    const hintFileName = typeof body?.fileName === 'string' ? body.fileName : undefined;
    if (!publicId) {
      return NextResponse.json({ error: 'Public ID required' }, { status: 400 });
    }

    await deleteProjectFileByPublicId(publicId, hintFileName);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Delete failed';
    console.error('[storage/delete]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
