import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/server/firebaseAdmin';

// Prevent Next.js from caching this route so customer panel always gets fresh data from Firebase
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const adminDb = getAdminDb();
    if (!adminDb) {
      console.warn('[gallery/images] Firebase Admin not initialized. Set FIREBASE_SERVICE_ACCOUNT_KEY in window-app .env to match admin panel project.');
      const res = NextResponse.json([]);
      setNoCacheHeaders(res);
      return res;
    }

    // Fetch all gallery docs and filter/sort in memory to avoid requiring a composite index
    const gallerySnapshot = await adminDb.collection('gallery').get();

    const images = gallerySnapshot.docs
      .filter((doc) => doc.data().isActive !== false)
      .sort((a, b) => {
        const aTime = a.data().uploadedAt?.toMillis?.() ?? a.data().uploadedAt?.seconds ?? 0;
        const bTime = b.data().uploadedAt?.toMillis?.() ?? b.data().uploadedAt?.seconds ?? 0;
        return bTime - aTime;
      })
      .map((doc: any) => {
        const data = doc.data();
        return {
          id: doc.id,
          url: data.url,
          category: data.category,
          title: data.title || '',
        };
      });

    const res = NextResponse.json(images);
    setNoCacheHeaders(res);
    return res;
  } catch (error) {
    console.error('Error fetching gallery images:', error);
    const res = NextResponse.json([]);
    setNoCacheHeaders(res);
    return res;
  }
}

/** Headers so browsers and CDN/edge (e.g. Vercel) never cache gallery responses in production */
function setNoCacheHeaders(res: NextResponse) {
  res.headers.set('Cache-Control', 'no-store, no-cache, max-age=0, must-revalidate, s-maxage=0');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  // Tell CDN/edge not to cache (Vercel and other CDNs respect these)
  res.headers.set('CDN-Cache-Control', 'no-store');
  res.headers.set('Vercel-CDN-Cache-Control', 'no-store');
}
