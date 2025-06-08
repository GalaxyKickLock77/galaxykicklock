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
  
  // Create Supabase client if not provided
  let supabase = supabaseService;
  if (!supabase) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return { success: false, message: 'Supabase configuration missing' };
    }
    
    supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
  }

  try {
    // Generate logical username
    const logicalUsername = getLogicalUsername({ username: usernameForLogical });
    
    if (logicalUsername.startsWith('invalid_user_')) {
      return { success: false, message: 'Invalid username for undeploy operation' };
    }

    // Call loca.lt stop endpoint if deployment is active
    if (deployTimestamp && activeFormNumber) {
      const stopUrl = `https://${logicalUsername}.loca.lt/stop/${activeFormNumber}`;
      
      try {
        await fetch(stopUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'bypass-tunnel-reminder': 'true',
            'User-Agent': 'MyCustomApp/1.0 (ServerSideUndeploy)'
          },
          body: JSON.stringify({})
        });
        
        secureLog.info(`Server-side undeploy call to ${stopUrl} completed for user ${userId}`, userId, 'performServerSideUndeploy');
      } catch (fetchError) {
        secureLog.error(`Error during server-side undeploy fetch for ${stopUrl} for user ${userId}`, fetchError, 'performServerSideUndeploy');
        // Continue with database update even if fetch fails
      }
    }

    // Update user deploy status in database
    await updateUserDeployStatus(userId, null, null);
    
    // If activeRunId is provided, attempt to cancel the GitHub Actions run
    if (activeRunId) {
      try {
        const cancelResult = await cancelGitHubRun(activeRunId);
        if (cancelResult.success) {
          secureLog.info(`GitHub Actions run ${activeRunId} cancelled successfully for user ${userId}`, userId, 'performServerSideUndeploy');
        } else {
          secureLog.warn(`Failed to cancel GitHub Actions run ${activeRunId} for user ${userId}: ${cancelResult.message}`, userId, 'performServerSideUndeploy');
        }
      } catch (cancelError) {
        secureLog.error(`Error cancelling GitHub Actions run ${activeRunId} for user ${userId}`, cancelError, 'performServerSideUndeploy');
      }
    }

    return { success: true, message: 'Server-side undeploy completed successfully' };
    
  } catch (error) {
    secureLog.error(`Error in performServerSideUndeploy for user ${userId}`, error, 'performServerSideUndeploy');
    return { success: false, message: 'Server-side undeploy failed' };
  }
}

/**
 * Cancels a GitHub Actions workflow run.
 * @param runId The ID of the workflow run to cancel.
 * @returns A promise that resolves to an object indicating success and a message.
 */
export async function cancelGitHubRun(runId: number | string): Promise<{ success: boolean; message: string }> {
  try {
    const cancelUrl = `https://api.github.com/repos/${GITHUB_ORG}/${GITHUB_REPO}/actions/runs/${runId}/cancel`;
    
    const response = await fetchFromGitHub(cancelUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
      }
    });

    if (response.ok) {
      return { success: true, message: 'GitHub Actions run cancelled successfully' };
    } else {
      const errorData = await response.json().catch(() => ({}));
      return { success: false, message: `Failed to cancel run: ${response.status} ${errorData.message || ''}` };
    }
  } catch (error) {
    secureLog.error('Error cancelling GitHub Actions run', error, 'cancelGitHubRun');
    return { success: false, message: 'Error cancelling GitHub Actions run' };
  }
}

/**
 * Gets the status of a GitHub Actions workflow run.
 * @param runId The ID of the workflow run to check.
 * @returns A promise that resolves to the run data or null if not found.
 */
export async function getGitHubRunStatus(runId: number | string): Promise<GitHubRun | null> {
  try {
    const runUrl = `https://api.github.com/repos/${GITHUB_ORG}/${GITHUB_REPO}/actions/runs/${runId}`;
    
    const response = await fetchFromGitHub(runUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
      }
    });

    if (response.ok) {
      const runData = await response.json();
      return runData as GitHubRun;
    } else {
      secureLog.warn(`Failed to get GitHub run status: ${response.status}`, null, 'getGitHubRunStatus');
      return null;
    }
  } catch (error) {
    secureLog.error('Error getting GitHub Actions run status', error, 'getGitHubRunStatus');
    return null;
  }
}

// ============================================
// NEW: Deployment Progress Bar Utilities
// ============================================

/**
 * Triggers the deployment progress bar to start showing.
 * Call this when a deployment begins.
 */
export const triggerDeploymentProgress = () => {
  // Only trigger if we're in a browser environment
  if (typeof window !== 'undefined') {
    const event = new CustomEvent('deploymentStart');
    window.dispatchEvent(event);
  }
};

/**
 * Hides the deployment progress bar.
 * Call this if you need to manually hide the progress bar (e.g., on error).
 */
export const hideDeploymentProgress = () => {
  // Only trigger if we're in a browser environment
  if (typeof window !== 'undefined') {
    const event = new CustomEvent('deploymentComplete');
    window.dispatchEvent(event);
  }
};

// Example usage in your existing deploy button click handler:
/*
const handleDeployClick = async () => {
  // Start the progress bar
  triggerDeploymentProgress();
  
  // Your existing deployment logic here
  try {
    // ... your deployment code
    
    // When deployment is complete/active, the progress bar will auto-hide
  } catch (error) {
    // If deployment fails, you can manually hide the progress bar
    hideDeploymentProgress();
  }
};
*/
