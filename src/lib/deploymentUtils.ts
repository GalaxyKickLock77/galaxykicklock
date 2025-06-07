import { SupabaseClient, createClient } from '@supabase/supabase-js'; // Import createClient
import { updateUserDeployStatus } from '@/lib/auth'; 
import { fetchFromGitHub, GitHubRun } from '@/lib/githubApiUtils'; // Import for direct GitHub API calls
import { secureLog } from '@/lib/secureLogger'; // SECURITY FIX: Import secure logging

// Constants for GitHub API, mirroring those in /git/galaxyapi/runs/route.ts
const GITHUB_ORG = process.env.NEXT_PUBLIC_GITHUB_ORG || 'galaxykicklock7';
const GITHUB_REPO = process.env.NEXT_PUBLIC_GITHUB_REPO || 'GalaxyKickPipeline7';

/**
 * Generates the logical username for loca.lt services.
 * @param user An object containing the plain username.
 * @returns The logical username string.
 */
export function getLogicalUsername(user: { username: string }): string {
  if (!user || !user.username) {
    // Fallback or error if username is not provided, though callers should ensure it.
    // SECURITY FIX: Use secure logging
    secureLog.error('Username is missing for logical username generation', null, 'getLogicalUsername');
    return 'invalid_user_7890'; 
  }
  return `${user.username}7890`;
}

/**
 * Performs a server-side undeploy operation for a user.
 * This includes calling the loca.lt stop endpoint and updating Supabase.
 * @param userId The ID of the user.
 * @param usernameForLogical The plain username (for generating logical username).
 * @param deployTimestamp The timestamp of the current deployment.
 * @param activeFormNumber The active form number of the current deployment.
 * @param supabaseService The Supabase service client instance.
 * @returns A promise that resolves to an object indicating success and a message.
 */
export async function performServerSideUndeploy(
  userId: string,
  usernameForLogical: string,
  deployTimestamp: string | null | undefined,
  activeFormNumber: number | null | undefined,
  activeRunId?: number | string | null, // Made activeRunId optional for calls not having it (like beacon)
  supabaseService?: SupabaseClient // Make supabaseService optional if it can create its own
): Promise<{ success: boolean; message: string }> {

  // Ensure Supabase client is available
  let SClient = supabaseService; // Renamed to avoid conflict with 'client' if it's a global/module var
  if (!SClient) {
const supabaseUrl = process.env.SUPABASE_URL; // SECURITY FIX: Use server-side only URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      // SECURITY FIX: Use secure logging
      secureLog.error('Supabase client cannot be initialized due to missing configuration', 
        { hasUrl: !!supabaseUrl, hasServiceKey: !!supabaseServiceRoleKey }, 
        'ServerUndeploy');
      return { success: false, message: 'Server configuration error for undeploy.' };
    }
    SClient = createClient(supabaseUrl, supabaseServiceRoleKey);
  }

  let locaLtStopSuccess = true; // Assume success if no loca.lt stop is needed or if it succeeds
  let locaLtMessage = "No loca.lt service stop required or attempted.";

  // Attempt to stop loca.lt service ONLY if activeFormNumber is present and valid (including 0 for main deployment)
  if (deployTimestamp && typeof activeFormNumber === 'number' && activeFormNumber >= 0) { 
    const logicalUsername = getLogicalUsername({ username: usernameForLogical });
    if (logicalUsername.startsWith('invalid_user_')) {
      // SECURITY FIX: Use secure logging with masked user ID
      secureLog.error('Cannot stop loca.lt service due to invalid username', 
        { userIdMasked: 'user_[MASKED]', logicalUsernamePrefix: 'invalid_user_' }, 
        'ServerUndeploy');
      // This is a partial failure; GitHub Action might still be processed if activeRunId is present.
      locaLtStopSuccess = false;
      locaLtMessage = 'Failed to stop loca.lt service: Username missing.';
    } else {
      const stopLocaltUrl = `https://${logicalUsername}.loca.lt/stop/${activeFormNumber}`;
      console.log(`[ServerUndeploy] Attempting to stop loca.lt service for user ${userId} (${usernameForLogical}) at ${stopLocaltUrl}`);
      try {
        const undeployResponse = await fetch(stopLocaltUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'bypass-tunnel-reminder': 'true', 'User-Agent': 'GalaxyApp/1.0 (ServerSideUndeploy)' },
          body: JSON.stringify({}),
        });
        if (undeployResponse.ok) {
          console.log(`[ServerUndeploy] Successfully sent stop command to loca.lt for user ${userId}, form ${activeFormNumber}. Status: ${undeployResponse.status}`);
          locaLtMessage = `loca.lt service for form ${activeFormNumber} stop command sent.`;
        } else {
          locaLtStopSuccess = false;
          const errorText = await undeployResponse.text();
          locaLtMessage = `Failed to send stop command to loca.lt (form ${activeFormNumber}): Status ${undeployResponse.status}, Response: ${errorText}`;
          // SECURITY FIX: Use secure logging that masks sensitive response data
          secureLog.error('Failed to send stop command to loca.lt service', {
            formNumber: activeFormNumber,
            status: undeployResponse.status,
            statusText: undeployResponse.statusText,
            hasErrorText: errorText.length > 0,
            errorTextLength: errorText.length
          }, 'ServerUndeploy');
        }
      } catch (e: any) {
        locaLtStopSuccess = false;
        locaLtMessage = `Network error stopping loca.lt (form ${activeFormNumber}): ${e.message}`;
        // SECURITY FIX: Use secure logging
        secureLog.error('Network error stopping loca.lt service', {
          formNumber: activeFormNumber,
          errorType: e.constructor.name,
          hasMessage: 'message' in e
        }, 'ServerUndeploy');
      }
    }
  }

  // Attempt to cancel GitHub Actions run if activeRunId is provided, without polling.
  let githubCancelSuccess = true;
  let githubCancelMessage = "No GitHub Action cancellation required or attempted.";

  if (activeRunId) {
    console.log(`[ServerUndeploy] Active run ID ${activeRunId} found. Attempting to request cancellation via GitHub API.`);
    const cancelEndpoint = `/repos/${GITHUB_ORG}/${GITHUB_REPO}/actions/runs/${activeRunId}/cancel`;
    try {
      const cancelApiResponse = await fetchFromGitHub(cancelEndpoint, { method: 'POST' });
      if (cancelApiResponse.ok || cancelApiResponse.status === 202) { // 202 Accepted is success for cancel
        console.log(`[ServerUndeploy] GitHub API request to cancel run ${activeRunId} sent successfully (Status: ${cancelApiResponse.status}).`);
        githubCancelMessage = `GitHub Action run ${activeRunId} cancellation request sent.`;
      } else {
        githubCancelSuccess = false;
        const errorText = await cancelApiResponse.text().catch(() => `Status ${cancelApiResponse.status}`);
        githubCancelMessage = `Failed to send cancellation request for GitHub run ${activeRunId}: Status ${cancelApiResponse.status}, Response: ${errorText}.`;
        // SECURITY FIX: Use secure logging that masks sensitive response data
        secureLog.error('Failed to send cancellation request to automation service', {
          runIdMasked: 'run_[MASKED]',
          status: cancelApiResponse.status,
          statusText: cancelApiResponse.statusText,
          hasErrorText: errorText.length > 0,
          errorTextLength: errorText.length
        }, 'ServerUndeploy');
      }
    } catch (cancelError: any) {
      githubCancelSuccess = false;
      githubCancelMessage = `Exception calling GitHub API to cancel run ${activeRunId}: ${cancelError.message}.`;
      // SECURITY FIX: Use secure logging
      secureLog.error('Exception calling automation service API for cancellation', {
        runIdMasked: 'run_[MASKED]',
        errorType: cancelError.constructor.name,
        hasMessage: 'message' in cancelError
      }, 'ServerUndeploy');
    }
  }

  // After all operations, clear the user's deployment status in DB
  await updateUserDeployStatus(userId, null, null, null); // Clear timestamp, formNumber, and runId
  console.log(`[ServerUndeploy] Cleared all deployment fields (timestamp, form, runId) in Supabase for user ${userId}.`);

  const overallSuccess = locaLtStopSuccess && githubCancelSuccess;
  // The detailed messages are for server-side logging/debugging.
  // For the client, we want a more generic message on failure.
  const detailedLogMessage = `loca.lt: ${locaLtMessage} GitHub: ${githubCancelMessage} DB status cleared.`;

  if (overallSuccess) {
    return { success: true, message: detailedLogMessage };
  } else {
    // For partial or full failure, provide a user-friendly message.
    // The detailed log messages are already securely logged above for GitHub/loca.lt failures.
    return { success: false, message: `Failed to undeploy previous active session. Undeploy partially failed. Please try again or contact support.` };
  }
}
