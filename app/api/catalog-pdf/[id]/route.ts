import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/server/firebaseAdmin';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type CatalogEntryDoc = {
  fileUrl?: string;
  fileName?: string;
};

function resolveUpstreamUrl(fileUrl: string, request: NextRequest): string | null {
  // Relative URLs (e.g. "/uploads/catalogue/xyz.pdf") are served on the same origin.
  if (fileUrl.startsWith('/')) return new URL(fileUrl, request.url).toString();

  // Only allow remote hosts we control or known storage/CDN providers.
  if (!/^https?:\/\//i.test(fileUrl)) return null;
  const url = new URL(fileUrl);
  const host = url.hostname;

  const allowedHosts = new Set([
    'res.cloudinary.com',
    'firebasestorage.googleapis.com',
    'storage.googleapis.com',
  ]);

  if (allowedHosts.has(host)) return url.toString();
  if (host === 'gruen-power.cloud' || host.endsWith('.gruen-power.cloud')) return url.toString();

  return null;
}

function safeFileName(fileName: string | undefined): string {
  const base = (fileName || 'catalog.pdf').split('/').pop() || 'catalog.pdf';
  return base.replace(/[^a-zA-Z0-9._-]/g, '-');
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getAdminDb();
    if (!db) {
      return NextResponse.json({ error: 'Database not available' }, { status: 500 });
    }

    const id = params?.id;
    if (!id) {
      return NextResponse.json({ error: 'Entry ID is required' }, { status: 400 });
    }

    const snap = await db.collection('catalogEntries').doc(id).get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const data = snap.data() as CatalogEntryDoc;
    if (!data?.fileUrl || typeof data.fileUrl !== 'string') {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const upstreamUrl = resolveUpstreamUrl(data.fileUrl, request);
    if (!upstreamUrl) {
      return NextResponse.json({ error: 'URL not allowed' }, { status: 403 });
    }

    const fileName = safeFileName(data.fileName);

    const range = request.headers.get('range');
    const upstreamHeaders: Record<string, string> = {
      Accept: 'application/pdf,*/*',
    };
    if (range) upstreamHeaders.Range = range;

    const upstreamRes = await fetch(upstreamUrl, {
      headers: upstreamHeaders,
      cache: 'no-store',
    });

    if (!upstreamRes.ok) {
      return NextResponse.json({ error: 'Upstream error' }, { status: upstreamRes.status });
    }

    const contentType = upstreamRes.headers.get('content-type') || 'application/pdf';
    const contentLength = upstreamRes.headers.get('content-length');
    const contentRange = upstreamRes.headers.get('content-range');
    const body = await upstreamRes.arrayBuffer();

    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
    headers.set('Cache-Control', 'private, max-age=300');

    if (range) {
      headers.set('Accept-Ranges', 'bytes');
      if (contentLength) headers.set('Content-Length', contentLength);
      if (contentRange) headers.set('Content-Range', contentRange);
    }

    return new NextResponse(body, {
      status: upstreamRes.status,
      headers,
    });
  } catch (error) {
    console.error('[window-app catalog-pdf proxy] GET error:', error);
    return NextResponse.json({ error: 'Proxy failed' }, { status: 502 });
  }
}

