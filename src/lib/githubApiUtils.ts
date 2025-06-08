import { NextResponse } from 'next/server';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
// These are already defined in your runs/route.ts, ensure they are consistently available
// For a library, it might be better to pass them as arguments or have a config object
// For now, assuming they are accessible as process.env here as well, or they will be passed.
// Let's define them here for clarity, ensure your .env.local or environment setup has them.
const ORG = process.env.GITHUB_ORG || 'galaxykicklock7'; // SECURITY FIX: Use server-side only env var
const REPO = process.env.GITHUB_REPO || 'GalaxyKickPipeline7'; // SECURITY FIX: Use server-side only env var
// WORKFLOW_FILE_NAME is used when listing runs for a specific workflow.

export const GITHUB_API_BASE_URL = 'https://api.github.com';

/**
 * SECURITY FIX: Secure logging utility that masks sensitive information
 * Prevents exposure of tokens, URLs with sensitive data, and other confidential info
 */
function secureLog(level: 'error' | 'warn' | 'info', message: string, data?: any) {
  // Mask sensitive information in the message
  const maskedMessage = message
    .replace(/token [a-zA-Z0-9_-]+/gi, 'token [MASKED]')
    .replace(/Bearer [a-zA-Z0-9_-]+/gi, 'Bearer [MASKED]')
    .replace(/github_pat_[a-zA-Z0-9_-]+/gi, 'github_pat_[MASKED]')
    .replace(/https:\/\/api\.github\.com\/repos\/[^\/]+\/[^\/]+/gi, 'https://api.github.com/repos/[ORG]/[REPO]')
    .replace(/\/repos\/[^\/]+\/[^\/]+/gi, '/repos/[ORG]/[REPO]');

  // Create a sanitized version of data for logging
  let sanitizedData = null;
  if (data) {
    if (typeof data === 'string') {
      // For string data, only log error type and status, not full content
      sanitizedData = {
        type: 'string_error',
        length: data.length,
        preview: data.length > 0 ? '[CONTENT_MASKED]' : '[EMPTY]'
      };
    } else if (typeof data === 'object') {
      // For object data, create a sanitized version
      sanitizedData = {
        type: 'object_error',
        hasMessage: 'message' in data,
        hasError: 'error' in data,
        keys: Object.keys(data).length
      };
    } else {
      sanitizedData = {
        type: typeof data,
        value: '[MASKED]'
      };
    }
  }

  // Log based on level
  switch (level) {
    case 'error':
      console.error(`[SECURE] ${maskedMessage}`, sanitizedData ? { sanitized: sanitizedData } : '');
      break;
    case 'warn':
      console.warn(`[SECURE] ${maskedMessage}`, sanitizedData ? { sanitized: sanitizedData } : '');
      break;
    case 'info':
      console.info(`[SECURE] ${maskedMessage}`, sanitizedData ? { sanitized: sanitizedData } : '');
      break;
  }
}

/**
 * SECURITY FIX: Sanitizes error data before sending to client
 * Removes sensitive information while preserving useful error context
 */
function sanitizeErrorForClient(errorData: any, status: number): any {
  // Define safe error information that can be sent to client
  const safeErrorInfo = {
    status: status,
    timestamp: new Date().toISOString(),
    type: 'automation_service_error'
  };

  // For specific GitHub API errors, provide helpful but safe messages
  switch (status) {
    case 401:
      return { ...safeErrorInfo, message: 'Authentication failed with automation service' };
    case 403:
      return { ...safeErrorInfo, message: 'Access denied by automation service' };
    case 404:
      return { ...safeErrorInfo, message: 'Resource not found in automation service' };
    case 422:
      return { ...safeErrorInfo, message: 'Invalid request to automation service' };
    case 429:
      return { ...safeErrorInfo, message: 'Rate limit exceeded for automation service' };
    case 500:
    case 502:
    case 503:
    case 504:
      return { ...safeErrorInfo, message: 'Automation service temporarily unavailable' };
    default:
      return { ...safeErrorInfo, message: 'Automation service error occurred' };
  }
}

export const getGitHubApiHeaders = (): Record<string, string> => {
  if (!GITHUB_TOKEN) {
    // This message will be part of the error returned to client if this throw is caught by fetchFromGitHub
    throw new Error('Automation service token not configured on the server.');
  }
  return {
    'Accept': 'application/vnd.github+json',
    'Authorization': `token ${GITHUB_TOKEN}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
};

export async function fetchFromGitHub(
  endpoint: string, // e.g., /repos/{ORG}/{REPO}/actions/runs
  options: RequestInit = {},
  baseUrl: string = GITHUB_API_BASE_URL
) {
  let headers;
  try {
    headers = getGitHubApiHeaders();
  } catch (error: any) {
    // SECURITY FIX: Use secure logging
    secureLog('error', 'Failed to get automation service headers', error.message);
    return NextResponse.json({ message: `Server configuration error: ${error.message}` }, { status: 500 });
  }

  const url = `${baseUrl}${endpoint}`;
  const response = await fetch(url, { ...options, headers: { ...headers, ...options.headers } });

  if (!response.ok) {
    const errorData = await response.text();
    
    // SECURITY FIX: Secure logging that doesn't expose sensitive information
    secureLog('error', `Automation service API error: ${response.status} for endpoint`, {
      status: response.status,
      statusText: response.statusText,
      endpoint: endpoint.replace(/\/repos\/[^\/]+\/[^\/]+/gi, '/repos/[ORG]/[REPO]'), // Mask org/repo in endpoint
      hasErrorData: errorData.length > 0,
      errorDataLength: errorData.length
    });

    // SECURITY FIX: Sanitize error data before sending to client
    const sanitizedError = sanitizeErrorForClient(errorData, response.status);
    
    try {
      const jsonData = JSON.parse(errorData);
      // Return sanitized error instead of raw GitHub API response
      return NextResponse.json({ 
        message: `Automation service API Error: ${response.status}`, 
        error: sanitizedError 
      }, { status: response.status });
    } catch (e) {
      // Return sanitized error instead of raw error data
      return NextResponse.json({ 
        message: `Automation service API Error: ${response.status}`, 
        error: sanitizedError 
      }, { status: response.status });
    }
  }

  if (options.method === 'POST' && response.status === 202) { // e.g. cancel run
    return NextResponse.json({ message: 'Request accepted by the automation service.' }, { status: 202 });
  }
  if (options.method === 'POST' && response.status === 204) { // e.g. workflow dispatch
    return NextResponse.json({ message: 'Workflow dispatched successfully.' }, { status: 204 });
  }

  if (response.status === 204) { // No content for GET
    return NextResponse.json(null, { status: 204 });
  }

  try {
    const rawData = await response.json();
    // Always return a NextResponse
    return NextResponse.json(rawData, { status: response.status });
  } catch (e: any) {
    // SECURITY FIX: Secure logging for JSON parsing errors
    secureLog('error', `Failed to parse JSON response from automation service`, {
      status: response.status,
      endpoint: endpoint.replace(/\/repos\/[^\/]+\/[^\/]+/gi, '/repos/[ORG]/[REPO]'),
      errorType: e.constructor.name,
      hasMessage: 'message' in e
    });
    
    // Always return a NextResponse for errors too
    // Generic client message
    return NextResponse.json({ message: 'Failed to parse response from the automation service.' }, { status: 502 });
  }
}

// Define shared interfaces for GitHub API responses (can be expanded)
export interface GitHubRun {
  id: number;
  name: string | null;
  status: string | null;
  conclusion: string | null;
  created_at: string;
  updated_at: string;
  html_url: string;
  run_number: number;
  jobs_url: string;
  workflow_id: number;
}

export interface GitHubJob {
  id: number;
  run_id: number;
  name: string;
  status: string; // "queued", "in_progress", "completed"
  conclusion: string | null; // "success", "failure", "neutral", "cancelled", "skipped", "timed_out", "action_required"
  html_url: string;
  started_at: string;
  completed_at: string | null;
}

export interface GitHubWorkflowRunsResponse {
  total_count: number;
  workflow_runs: GitHubRun[];
}

export interface GitHubRunJobsResponse {
  total_count: number;
  jobs: GitHubJob[];
}
