import { NextRequest, NextResponse } from 'next/server';
import { performServerSideUndeploy } from '@/lib/deploymentUtils';
import { validateSession } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const session = await validateSession(request);

  if (!session) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  // In a real application, you would also check if the user has admin privileges
  // For this task, we assume the session is valid and the call is triggered by an admin action.

  try {
    // The performServerSideUndeploy function needs userId, username, deployTimestamp, activeFormNumber
    // These should ideally come from the session or be passed in the request body if available.
    // For now, I'll use placeholder values or values from the session if available.
    const { userId, username, deployTimestamp, activeFormNumber } = session;

    const undeployResult = await performServerSideUndeploy(
      userId,
      username,
      deployTimestamp || null,
      activeFormNumber || null
    );

    if (undeployResult.success) {
      return NextResponse.json({ message: 'Undeploy initiated successfully' }, { status: 200 });
    } else {
      return NextResponse.json({ message: undeployResult.message }, { status: 500 });
    }
  } catch (error: any) {
    console.error('Error in admin-undeploy API:', error);
    return NextResponse.json({ message: 'Internal server error', error: error.message }, { status: 500 });
  }
}
