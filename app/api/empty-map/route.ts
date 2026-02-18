import { NextResponse } from 'next/server';

/** Minimal valid source map to avoid 404 when browser requests .map for sw/workbox. */
const EMPTY_SOURCE_MAP = {
  version: 3,
  sources: [],
  names: [],
  mappings: '',
};

export async function GET() {
  return NextResponse.json(EMPTY_SOURCE_MAP, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
