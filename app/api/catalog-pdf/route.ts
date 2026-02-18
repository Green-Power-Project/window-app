import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxies a PDF from the given URL so the client can load it same-origin.
 * Used by the catalogue PDF viewer (PDF.js) so the rendered canvas can be captured in screenshots.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'Missing url' }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: 'Invalid url' }, { status: 400 });
  }

  const allowedHosts = [
    'res.cloudinary.com',
    'firebasestorage.googleapis.com',
    'storage.googleapis.com',
    'localhost',
  ];
  if (!allowedHosts.some((h) => parsed.hostname === h || parsed.hostname.endsWith('.' + h))) {
    return NextResponse.json({ error: 'URL not allowed' }, { status: 403 });
  }

  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/pdf,*/*' },
      cache: 'no-store',
    });
    if (!res.ok) {
      return NextResponse.json({ error: 'Upstream error' }, { status: res.status });
    }
    const contentType = res.headers.get('content-type') || 'application/pdf';
    const body = await res.arrayBuffer();
    return new NextResponse(body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (e) {
    console.error('[catalog-pdf] proxy error:', e);
    return NextResponse.json({ error: 'Proxy failed' }, { status: 502 });
  }
}
