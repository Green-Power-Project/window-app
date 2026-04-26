import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/server/firebaseAdmin';
import { deleteCustomerAccountCascade } from '@/lib/server/deleteCustomerAccount';

/**
 * Self-service account deletion. Requires a fresh Firebase ID token (client re-authenticates first).
 */
export async function POST(request: NextRequest) {
  const adminAuth = getAdminAuth();
  if (!adminAuth) {
    return NextResponse.json({ error: 'server_config' }, { status: 500 });
  }

  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return NextResponse.json({ error: 'missing_token' }, { status: 401 });
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;
    const email = decoded.email ?? null;
    await deleteCustomerAccountCascade(uid, email);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[api/account/delete]', e);
    return NextResponse.json({ error: 'delete_failed' }, { status: 500 });
  }
}
