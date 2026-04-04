import { NextRequest, NextResponse } from 'next/server';
import { DuplicateFileNameError, saveProjectUpload } from '@/lib/server/vpsStorage';

const ADMIN_ONLY = '09_Admin_Only';

function isAdminOnlyPath(p: string): boolean {
  return p === ADMIN_ONLY || p.includes(ADMIN_ONLY);
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const folder = (formData.get('folder') as string) || '';
    const publicId = formData.get('public_id') as string | null;

    if (isAdminOnlyPath(folder) || (publicId && isAdminOnlyPath(publicId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const f = file as File;
    const originalName = f.name || 'upload.bin';
    const buffer = Buffer.from(await f.arrayBuffer());

    let targetPublicId: string;
    if (publicId && publicId.trim()) {
      targetPublicId = publicId.trim();
    } else if (folder) {
      const base = originalName.replace(/\.[^/.]+$/, '');
      const safe = base.replace(/[^a-zA-Z0-9._-]/g, '-') || 'file';
      targetPublicId = `${folder.replace(/\/+$/, '')}/${safe}`;
    } else {
      return NextResponse.json({ error: 'folder or public_id required' }, { status: 400 });
    }

    const result = await saveProjectUpload({
      buffer,
      publicId: targetPublicId,
      originalName,
    });

    return NextResponse.json({
      public_id: result.public_id,
      secure_url: result.secure_url,
      bytes: result.bytes,
      format: result.format,
      resource_type: result.resource_type,
      storagePath: result.storagePath,
      storageProvider: result.storageProvider,
    });
  } catch (error: unknown) {
    if (error instanceof DuplicateFileNameError) {
      return NextResponse.json(
        { error: 'duplicate_file_name', fileName: error.fileName },
        { status: 409 }
      );
    }
    const message = error instanceof Error ? error.message : 'Upload failed';
    console.error('[storage/upload]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
