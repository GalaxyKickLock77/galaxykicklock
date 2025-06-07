import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { 
  fetchFromGitHub, 
  GitHubRun, 
  GitHubJob, 
  GitHubWorkflowRunsResponse, 
  GitHubRunJobsResponse 
} from '@/lib/githubApiUtils';
import NodeCache from 'node-cache';

// Initialize cache: stdTTL is standard TTL in seconds, checkperiod is how often expired items are deleted
const GITHUB_API_CACHE_TTL_SECONDS = 120; // 2 minutes
const apiCache = new NodeCache({ stdTTL: GITHUB_API_CACHE_TTL_SECONDS, checkperiod: GITHUB_API_CACHE_TTL_SECONDS * 0.2 });

const ORG = process.env.GITHUB_ORG || 'galaxykicklock7'; // SECURITY FIX: Use server-side only env var
const REPO = process.env.GITHUB_REPO || 'GalaxyKickPipeline7'; // SECURITY FIX: Use server-side only env var
const WORKFLOW_FILE_NAME = process.env.GITHUB_WORKFLOW_FILE || 'blank.yml'; // SECURITY FIX: Use server-side only env var

interface ClientSafeRunResponse { // Fields adjusted
  runId: number;
  status: string | null;
  conclusion: string | null;
  jobName: string; // Essential for client logic
  // createdAt: string; // To be removed
  // htmlUrl: string; // To be removed
}

export async function GET(request: NextRequest) {
  const session = await validateSession(request);
  if (!session) {
    return NextResponse.json({ message: 'Authentication required.' }, { status: 401 });
  }

  if (!process.env.GITHUB_TOKEN) {
    console.error('Critical: GitHub token not configured on the server for latest-user-run.');
    return NextResponse.json({ message: 'Server configuration error: Required integration token missing.' }, { status: 500 });
  }

  const searchParams = request.nextUrl.searchParams;
  const logicalUsername = searchParams.get('logicalUsername');

  if (!logicalUsername) {
    return NextResponse.json({ message: 'Missing logicalUsername query parameter.' }, { status: 400 });
  }

  const targetJobName = `Run for ${logicalUsername}`;
  console.log(`Searching for latest run with job name: "${targetJobName}"`);

  try {
    // 1. Fetch recent workflow runs (cached)
    const runsCacheKey = `github_runs_${ORG}_${REPO}_${WORKFLOW_FILE_NAME}_per_page_30`;
    let runsResponse: GitHubWorkflowRunsResponse | undefined | null = apiCache.get<GitHubWorkflowRunsResponse>(runsCacheKey);
    let runsResultOk = true;
    let runsResultStatus = 200;

    if (runsResponse) {
      console.log(`[CACHE HIT] Workflow runs for ${runsCacheKey}`);
    } else {
      console.log(`[CACHE MISS] Workflow runs for ${runsCacheKey}. Fetching from GitHub.`);
      const runsEndpoint = `/repos/${ORG}/${REPO}/actions/workflows/${WORKFLOW_FILE_NAME}/runs?per_page=30`;
      const freshRunsResult = await fetchFromGitHub(runsEndpoint); // This returns a Response or NextResponse

      if (typeof freshRunsResult.json !== 'function' || !freshRunsResult.ok) {
        // fetchFromGitHub returned an error NextResponse or a Response with !ok
        console.error(`Failed to fetch workflow runs. Status: ${freshRunsResult.status}`);
        // If fetchFromGitHub returns a NextResponse directly on error, we can just return it.
        // Otherwise, construct one. Assuming fetchFromGitHub returns NextResponse on error.
        return freshRunsResult;
      }

      try {
        runsResponse = await freshRunsResult.json() as GitHubWorkflowRunsResponse;
        apiCache.set(runsCacheKey, runsResponse); // Cache the successfully fetched and parsed data
        runsResultOk = freshRunsResult.ok;
        runsResultStatus = freshRunsResult.status;
      } catch (jsonParseError: any) {
        console.error('Failed to parse runsResponse from GitHub:', jsonParseError.message);
        return NextResponse.json({ message: 'Error parsing workflow runs data from GitHub.' }, { status: 500 });
      }
    }

    if (!runsResponse) {
        // This case should ideally be caught by the error handling above if fetch failed.
        // This handles if cache is empty and fetch somehow resulted in no runsResponse without erroring earlier.
        console.error(`Failed to get workflow runs either from cache or fetch. Status: ${runsResultStatus}`);
        return NextResponse.json({ message: 'Failed to retrieve workflow runs.' }, { status: runsResultStatus || 500 });
    }

    if (!runsResponse.workflow_runs || runsResponse.workflow_runs.length === 0) {
      console.log(`No workflow runs found for ${WORKFLOW_FILE_NAME} (ORG: ${ORG}, REPO: ${REPO}).`);
      return NextResponse.json({ message: `No recent background processes found.` }, { status: 404 });
    }

    // The runs are already sorted newest first by the GitHub API.
    const BATCH_SIZE = 5; // Batch size for fetching jobs
    const workflowRuns = runsResponse.workflow_runs; // Use this variable for the loop

    for (let i = 0; i < workflowRuns.length; i += BATCH_SIZE) {
      const batchRuns = workflowRuns.slice(i, i + BATCH_SIZE);
      
      const jobPromises = batchRuns.map(async (run) => {
        const jobCacheKey = `github_jobs_run_${run.id}`;
        const cachedJobs = apiCache.get<GitHubRunJobsResponse>(jobCacheKey);

        if (cachedJobs) {
          console.log(`[CACHE HIT] Jobs for run ${run.id}`);
          return { run, jobsData: cachedJobs, errorStatus: null, source: 'cache', errorResponse: null };
        }

        console.log(`[CACHE MISS] Jobs for run ${run.id}. Fetching from GitHub.`);
        const jobsEndpoint = `/repos/${ORG}/${REPO}/actions/runs/${run.id}/jobs`;

        try {
          const fetchResponse = await fetchFromGitHub(jobsEndpoint); // Returns Response or NextResponse

          // Check if fetchFromGitHub returned an error (e.g., a NextResponse) or if response.ok is false
          if (typeof fetchResponse.json !== 'function' || !fetchResponse.ok) {
             // fetchFromGitHub likely returned an error NextResponse, or it's a Response where ok is false.
            console.warn(`Failed to fetch jobs for run ${run.id} from GitHub. Status: ${fetchResponse.status}`);
            return { run, jobsData: null, errorStatus: fetchResponse.status || 500, source: 'network', errorResponse: fetchResponse };
          }

          // If we are here, fetchResponse is a successful Response object
          const jobsData = await fetchResponse.json() as GitHubRunJobsResponse;
          apiCache.set(jobCacheKey, jobsData); // Cache successful fetch
          return { run, jobsData, errorStatus: null, source: 'network', errorResponse: null };

        } catch (error: any) {
          // Catch any unexpected errors during the fetch or json parsing
          console.error(`Exception while fetching jobs for run ${run.id}:`, error.message);
          return { run, jobsData: null, errorStatus: 500, source: 'network', errorResponse: null, exceptionMessage: error.message };
        }
      });

      const batchResults = await Promise.all(jobPromises);

      for (const result of batchResults) {
        const { run, jobsData, errorStatus, errorResponse, exceptionMessage } = result;

        if (errorStatus) {
          let logMessage = `Could not fetch or parse jobs for run ${run.id}, skipping. Status: ${errorStatus}.`;
          if (exceptionMessage) {
            logMessage += ` Exception: ${exceptionMessage}`;
          } else if (errorResponse && typeof errorResponse.json === 'function') {
            try {
              // Attempt to parse error from NextResponse if it exists
              const errJson = await errorResponse.json();
              logMessage += ` GitHub Message: ${errJson.message || 'N/A'}`;
            } catch (_) { /* ignore if can't parse json from errorResponse */ }
          }
          console.warn(logMessage);
          continue;
        }

        if (jobsData && jobsData.jobs && jobsData.jobs.length > 0) {
          const matchingJob = jobsData.jobs.find(job => job.name === targetJobName);
          if (matchingJob) {
            console.log(`Found matching job in run ${run.id}. Job ID: ${matchingJob.id}, Job Name: ${matchingJob.name}, Status: ${run.status}, Conclusion: ${run.conclusion}`);
            const clientResponsePayload: ClientSafeRunResponse = {
              runId: run.id,
              status: run.status,
              conclusion: run.conclusion,
              jobName: matchingJob.name,
            };
            return NextResponse.json(clientResponsePayload, { status: 200 });
          }
        }
      }
    }

    // If loop completes, no matching run was found
    console.log(`No runs found with a job named "${targetJobName}" after checking all runs.`); // Keep server log specific
    return NextResponse.json({ message: `No matching task found for your request.` }, { status: 404 }); // Generic client message

  } catch (error: any) {
    console.error('Error in latest-user-run endpoint:', error);
    return NextResponse.json({ message: `An unexpected error occurred: ${error.message}` }, { status: 500 });
  }
}
