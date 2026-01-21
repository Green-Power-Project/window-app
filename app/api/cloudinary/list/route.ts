import { NextRequest, NextResponse } from 'next/server';

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

function getAuthHeader() {
  if (!API_KEY || !API_SECRET) return null;
  return `Basic ${Buffer.from(`${API_KEY}:${API_SECRET}`).toString('base64')}`;
}

export async function GET(request: NextRequest) {
  if (!CLOUD_NAME) {
    return NextResponse.json({ error: 'Cloudinary not configured' }, { status: 500 });
  }

  const folder = request.nextUrl.searchParams.get('folder') || '';
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return NextResponse.json({ error: 'Cloudinary credentials missing' }, { status: 500 });
  }

  try {
    const url = new URL(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/resources`);
    url.searchParams.set('resource_type', 'auto');
    url.searchParams.set('type', 'upload');
    if (folder) {
      url.searchParams.set('prefix', `${folder}/`);
    }
    url.searchParams.set('max_results', '500');

    const response = await fetch(url.toString(), {
      headers: { Authorization: authHeader } as HeadersInit,
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: `Failed to list files: ${error}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json({ resources: data.resources || [] });
  } catch (error: any) {
    console.error('Cloudinary list error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to list files' },
      { status: 500 }
    );
  }
}

