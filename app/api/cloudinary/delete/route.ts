import { NextRequest, NextResponse } from 'next/server';

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

function getAuthHeader() {
  if (!API_KEY || !API_SECRET) return null;
  return `Basic ${Buffer.from(`${API_KEY}:${API_SECRET}`).toString('base64')}`;
}

export async function POST(request: NextRequest) {
  if (!CLOUD_NAME) {
    return NextResponse.json({ error: 'Cloudinary not configured' }, { status: 500 });
  }

  const authHeader = getAuthHeader();
  if (!authHeader) {
    return NextResponse.json({ error: 'Cloudinary credentials missing' }, { status: 500 });
  }

  try {
    const { publicId } = await request.json();
    if (!publicId) {
      return NextResponse.json({ error: 'Public ID required' }, { status: 400 });
    }

    const deleteUrl = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/resources/${encodeURIComponent(
      publicId
    )}`;

    const response = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: { Authorization: authHeader } as HeadersInit,
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: `Delete failed: ${error}` },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Cloudinary delete error:', error);
    return NextResponse.json(
      { error: error.message || 'Delete failed' },
      { status: 500 }
    );
  }
}

