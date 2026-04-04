import { NextRequest, NextResponse } from 'next/server';
import { access, readFile } from 'fs/promises';
import { constants } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

function mimeFromExt(ext: string): string {
  const e = ext.toLowerCase();
  if (e === '.pdf') return 'application/pdf';
  if (e === '.png') return 'image/png';
  if (e === '.jpg' || e === '.jpeg') return 'image/jpeg';
  if (e === '.gif') return 'image/gif';
  if (e === '.webp') return 'image/webp';
  if (e === '.svg') return 'image/svg+xml';
  return 'application/octet-stream';
}

/**
 * Internal target for rewrite from `/uploads/*` (see next.config.js).
 * Rewrites run before `public/` static checks, so this reliably runs for missing files.
 * 1) `window-app/public/uploads/...` 2) proxy to admin `NEXT_PUBLIC_ADMIN_API_BASE_URL`.
 */
export async function GET(
  _request: NextRequest,
  context: { params: { path: string[] } }
) {
  const segments = context.params.path;
  if (!segments?.length || segments.some((s) => !s || s === '.' || s === '..' || s.includes('\0'))) {
    return new NextResponse('Not found', { status: 404 });
  }

  const base = path.resolve(process.cwd(), 'public', 'uploads');
  const abs = path.resolve(base, ...segments);
  if (!abs.startsWith(base)) {
    return new NextResponse('Not found', { status: 404 });
  }

  try {
    await access(abs, constants.R_OK);
    const buf = await readFile(abs);
    const ext = path.extname(abs);
    return new NextResponse(buf, {
      headers: {
        'Content-Type': mimeFromExt(ext),
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch {
    // fall through to admin proxy
  }

  const adminBase = (process.env.NEXT_PUBLIC_ADMIN_API_BASE_URL || '').trim().replace(/\/$/, '');
  if (!adminBase) {
    return new NextResponse('Not found', { status: 404 });
  }

  const uploadPath = segments.map(encodeURIComponent).join('/');
  const upstream = await fetch(`${adminBase}/uploads/${uploadPath}`, { cache: 'no-store' });
  if (!upstream.ok) {
    return new NextResponse('Not found', { status: 404 });
  }
  const buf = await upstream.arrayBuffer();
  const last = segments[segments.length - 1] || '';
  const ct =
    upstream.headers.get('content-type') || mimeFromExt(path.extname(last));
  return new NextResponse(buf, {
    headers: {
      'Content-Type': ct,
      'Cache-Control': 'private, max-age=300',
    },
  });
}
