import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, getAdminAuth } from '@/lib/server/firebaseAdmin';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customerNumber, projectNumber } = body;

    if (!customerNumber || !projectNumber) {
      return NextResponse.json(
        { error: 'Missing required fields: customerNumber and projectNumber' },
        { status: 400 }
      );
    }

    const adminDb = getAdminDb();
    const adminAuth = getAdminAuth();

    if (!adminDb || !adminAuth) {
      return NextResponse.json(
        { error: 'Firebase Admin not initialized' },
        { status: 500 }
      );
    }

    // Find customer by customerNumber
    const customersSnapshot = await adminDb
      .collection('customers')
      .where('customerNumber', '==', customerNumber.trim())
      .limit(1)
      .get();

    if (customersSnapshot.empty) {
      return NextResponse.json(
        { error: 'Invalid customer number' },
        { status: 401 }
      );
    }

    const customerDoc = customersSnapshot.docs[0];
    const customerData = customerDoc.data();

    // Check if customer is enabled
    if (customerData.enabled === false) {
      return NextResponse.json(
        { error: 'Customer account is disabled' },
        { status: 403 }
      );
    }

    const customerUid = customerData.uid;

    // Find project by projectNumber
    const projectsSnapshot = await adminDb
      .collection('projects')
      .where('projectNumber', '==', projectNumber.trim())
      .limit(1)
      .get();

    if (projectsSnapshot.empty) {
      return NextResponse.json(
        { error: 'Invalid project number' },
        { status: 401 }
      );
    }

    const projectDoc = projectsSnapshot.docs[0];
    const projectData = projectDoc.data();

    if (projectData?.customerId !== customerUid) {
      return NextResponse.json(
        { error: 'Project does not belong to this customer' },
        { status: 403 }
      );
    }

    // Generate custom token for the customer
    const customToken = await adminAuth.createCustomToken(customerUid);

    // Get canViewAllProjects flag from customer document
    const canViewAllProjects = customerData.canViewAllProjects === true;

    return NextResponse.json({
      success: true,
      customToken,
      customerUid,
      canViewAllProjects,
      loggedInProjectId: projectDoc.id, // Store the project ID they logged in with
    });
  } catch (error: any) {
    console.error('Error in customer login:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to authenticate' },
      { status: 500 }
    );
  }
}
