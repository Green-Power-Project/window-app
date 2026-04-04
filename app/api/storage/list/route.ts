import { NextRequest, NextResponse } from 'next/server';
import { listProjectResourcesByPrefix } from '@/lib/server/vpsStorage';

const ADMIN_ONLY = '09_Admin_Only';

function isAdminOnlyPath(p: string): boolean {
  return p === ADMIN_ONLY || p.startsWith(`${ADMIN_ONLY}/`);
}

export async function GET(request: NextRequest) {
  const folder = request.nextUrl.searchParams.get('folder') || '';

  if (isAdminOnlyPath(folder)) {
    return NextResponse.json({ error: 'Forbidden', resources: [] }, { status: 403 });
  }

  try {
    const resources = await listProjectResourcesByPrefix(folder);
    return NextResponse.json({ resources });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to list files';
    console.error('[storage/list]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
