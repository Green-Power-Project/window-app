import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/server/firebaseAdmin';

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const db = getAdminDb();
    const auth = getAdminAuth();
    if (!db || !auth) {
      return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
    }

    // Verify customer auth token
    const header = request.headers.get('Authorization');
    if (!header?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const idToken = header.slice(7);
    let uid: string;
    try {
      const decoded = await auth.verifyIdToken(idToken);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { projectId } = params;
    if (!projectId) {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
    }

    // Verify this customer belongs to this project
    const projectSnap = await db.collection('projects').doc(projectId).get();
    if (!projectSnap.exists) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const customerId = projectSnap.data()?.customerId;
    if (typeof customerId !== 'string' || customerId !== uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch income entries (payments received from customer)
    const incomeSnap = await db
      .collection('projectIncome')
      .where('projectId', '==', projectId)
      .get();

    const payments = incomeSnap.docs.map((d) => {
      const data = d.data();
      const rawDate = data.date;
      let dateMs: number = Date.now();
      if (rawDate && typeof rawDate.toMillis === 'function') {
        dateMs = rawDate.toMillis();
      } else if (typeof rawDate === 'string') {
        dateMs = new Date(rawDate).getTime();
      }
      return {
        id: d.id,
        type: typeof data.type === 'string' ? data.type : 'progress_payment',
        amount: typeof data.amount === 'number' ? data.amount : 0,
        dateMs,
        note: typeof data.note === 'string' ? data.note : '',
      };
    });

    // Sort newest first
    payments.sort((a, b) => b.dateMs - a.dateMs);

    // Fetch gross contract value only (net is internal — never expose to customer)
    let contractValueGross: number | null = null;
    try {
      const configSnap = await db.collection('projectFinanceConfig').doc(projectId).get();
      if (configSnap.exists) {
        const val = configSnap.data()?.contractValueGross;
        contractValueGross = typeof val === 'number' ? val : null;
      }
    } catch {
      // config not set yet — fine
    }

    return NextResponse.json({ payments, contractValueGross });
  } catch (e) {
    console.error('[project-finance]', e);
    return NextResponse.json({ error: 'Failed to load finance data' }, { status: 500 });
  }
}
