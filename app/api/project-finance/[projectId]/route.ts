import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/server/firebaseAdmin';
import {
  incomeNetAmount,
  isProjectValueType,
  netToGross,
} from '@/lib/customerProjectFinance';

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

    const projectSnap = await db.collection('projects').doc(projectId).get();
    if (!projectSnap.exists) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const customerId = projectSnap.data()?.customerId;
    if (typeof customerId !== 'string' || customerId !== uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const incomeSnap = await db
      .collection('projectIncome')
      .where('projectId', '==', projectId)
      .get();

    let totalProjectNet = 0;
    let totalPaidNet = 0;
    let hasProjectValue = false;

    const payments = incomeSnap.docs
      .map((d) => {
        const data = d.data();
        const type = typeof data.type === 'string' ? data.type : 'progress_payment';
        const amount = typeof data.amount === 'number' ? data.amount : 0;
        const discount = typeof data.discount === 'number' ? data.discount : null;
        const cashPercent = typeof data.cashPercent === 'number' ? data.cashPercent : null;
        const net = incomeNetAmount({ type, amount, discount, cashPercent });

        if (isProjectValueType(type)) {
          hasProjectValue = true;
          totalProjectNet += net;
          return null;
        }

        totalPaidNet += net;

        const rawDate = data.date;
        let dateMs: number = Date.now();
        if (rawDate && typeof rawDate.toMillis === 'function') {
          dateMs = rawDate.toMillis();
        } else if (typeof rawDate === 'string') {
          dateMs = new Date(rawDate).getTime();
        }

        return {
          id: d.id,
          type,
          amount: netToGross(net),
          dateMs,
          note: typeof data.note === 'string' ? data.note : '',
        };
      })
      .filter((p): p is NonNullable<typeof p> => p != null);

    payments.sort((a, b) => b.dateMs - a.dateMs);

    const totalPaidGross = netToGross(totalPaidNet);
    const totalProjectGross = hasProjectValue ? netToGross(totalProjectNet) : null;
    const outstandingGross =
      totalProjectGross != null ? Math.max(0, totalProjectGross - totalPaidGross) : null;

    return NextResponse.json({
      payments,
      totalProjectGross,
      totalPaidGross,
      outstandingGross,
    });
  } catch (e) {
    console.error('[project-finance]', e);
    return NextResponse.json({ error: 'Failed to load finance data' }, { status: 500 });
  }
}
