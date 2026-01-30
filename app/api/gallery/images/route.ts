import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/server/firebaseAdmin';

export async function GET(request: NextRequest) {
  try {
    const adminDb = getAdminDb();
    if (!adminDb) {
      console.warn('[gallery/images] Firebase Admin not initialized. Set FIREBASE_SERVICE_ACCOUNT_KEY in window-app .env to match admin panel project.');
      return NextResponse.json([]);
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

    return NextResponse.json(images);
  } catch (error) {
    console.error('Error fetching gallery images:', error);
    return NextResponse.json([]);
  }
}
