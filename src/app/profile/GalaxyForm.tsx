import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Play, Square, RefreshCw, LogOut, CheckCircle, X } from 'lucide-react';
import styles from '../styles/GalaxyControl.module.css';
import { useRouter } from 'next/navigation';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

type FormData = {
  RC: string;
  startAttackTime: string;
  stopAttackTime: string;
  attackIntervalTime: string;
  startDefenceTime: string;
  stopDefenceTime: string;
  defenceIntervalTime: string;
  PlanetName: string;
  Rival: string;
};

type ButtonState = { loading: boolean; active: boolean; text: string; };
type ButtonStates = { start: ButtonState; stop: ButtonState; update: ButtonState; };
type ActionType = keyof ButtonStates;

const initialButtonStates: ButtonStates = {
  start: { loading: false, active: false, text: 'Start' },
  stop: { loading: false, active: false, text: 'Stop' },
  update: { loading: false, active: false, text: 'Update' },
};

const STORAGE_KEYS = { USER_ID: 'userId', USERNAME: 'username', FORMS_DATA: 'galaxyFormsData' };

const GalaxyForm: React.FC = () => {
  const router = useRouter();
  const [isClient, setIsClient] = useState(false);
  const [activeTab, setActiveTab] = useState<number>(1);
  const [username, setUsername] = useState<string | null>(null);
  const [displayedUsername, setDisplayedUsername] = useState<string | null>(null);
  const [showDeployPopup, setShowDeployPopup] = useState<boolean>(false);
  const [isDeploying, setIsDeploying] = useState<boolean>(false);
  const [isUndeploying, setIsUndeploying] = useState<boolean>(false);
  const [deploymentStatus, setDeploymentStatus] = useState<string>('Checking deployment status...');
  const [isDeployed, setIsDeployed] = useState<boolean>(false);
  const [isPollingStatus, setIsPollingStatus] = useState<boolean>(false);
  const [redeployMode, setRedeployMode] = useState<boolean>(false);
  const [showThankYouMessage, setShowThankYouMessage] = useState<boolean>(false);
  const [activationProgressTimerId, setActivationProgressTimerId] = useState<number | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [activationProgressPercent, setActivationProgressPercent] = useState<number>(0);
  const [autoUndeployMessage, setAutoUndeployMessage] = useState<string | null>(null);
  const [showAutoUndeployPopup, setShowAutoUndeployPopup] = useState<boolean>(false);
  const [showAdminBlockPopup, setShowAdminBlockPopup] = useState<boolean>(false); // New state for admin block popup
  const [showTokenExpiredPopup, setShowTokenExpiredPopup] = useState<boolean>(false); // New state for token expired popup
  const [tokenExpiryDisplay, setTokenExpiryDisplay] = useState<string | null>(null);
  const [currentUserIdState, setCurrentUserIdState] = useState<string | null>(null);

  const findRunIdTimerRef = useRef<number | null>(null);
  const statusPollTimerRef = useRef<number | null>(null);
  const cancelPollTimerRef = useRef<number | null>(null);

  interface LatestUserRunResponse { runId: number; status: string | null; conclusion: string | null; jobName: string; }

  const getApiAuthHeaders = (): Record<string, string> => ({ 'Content-Type': 'application/json' });

  const clearAllPollingTimers = useCallback(() => {
    if (findRunIdTimerRef.current !== null) window.clearInterval(findRunIdTimerRef.current);
    findRunIdTimerRef.current = null;
    if (statusPollTimerRef.current !== null) window.clearInterval(statusPollTimerRef.current);
    statusPollTimerRef.current = null;
    if (cancelPollTimerRef.current !== null) window.clearInterval(cancelPollTimerRef.current);
    cancelPollTimerRef.current = null;
  }, []);

  const formNames = { 1: 'Kick 1', 2: 'Kick 2', 3: 'Kick 3', 4: 'Kick 4', 5: 'Kick 5' };

  // Initialize formData states with a function that attempts to load from local storage
  const getInitialFormData = (formNum: number): FormData => {
    if (typeof window !== 'undefined') {
      const savedData = localStorage.getItem(STORAGE_KEYS.FORMS_DATA);
      if (savedData) {
        try {
          const parsedData = JSON.parse(savedData);
          if (parsedData[`formData${formNum}`]) {
            return parsedData[`formData${formNum}`];
          }
        } catch (e) {
          console.error("Failed to parse form data from local storage", e);
        }
      }
    }
    return { RC: '', startAttackTime: '', stopAttackTime: '', attackIntervalTime: '', startDefenceTime: '', stopDefenceTime: '', defenceIntervalTime: '', PlanetName: '', Rival: '' };
  };

  const [formData1, setFormData1] = useState<FormData>(getInitialFormData(1));
  const [formData2, setFormData2] = useState<FormData>(getInitialFormData(2));
  const [formData3, setFormData3] = useState<FormData>(getInitialFormData(3));
  const [formData4, setFormData4] = useState<FormData>(getInitialFormData(4));
  const [formData5, setFormData5] = useState<FormData>(getInitialFormData(5));

  const [buttonStates1, setButtonStates1] = useState<ButtonStates>(initialButtonStates);
  const [buttonStates2, setButtonStates2] = useState<ButtonStates>(initialButtonStates);
  const [buttonStates3, setButtonStates3] = useState<ButtonStates>(initialButtonStates);
  const [buttonStates4, setButtonStates4] = useState<ButtonStates>(initialButtonStates);
  const [buttonStates5, setButtonStates5] = useState<ButtonStates>(initialButtonStates);

  const [error1, setError1] = useState<string[]>([]); const [error2, setError2] = useState<string[]>([]); const [error3, setError3] = useState<string[]>([]);
  const [error4, setError4] = useState<string[]>([]); const [error5, setError5] = useState<string[]>([]);

  const pollForCancelledStatus = useCallback(async (runId: number) => {
    const pollTimeout = 60 * 1000; const pollInterval = 5 * 1000; const startTime = Date.now();
    const authHeaders = getApiAuthHeaders();
    const check = async () => {
      if (Date.now() - startTime > pollTimeout) {
        if (cancelPollTimerRef.current !== null) window.clearInterval(cancelPollTimerRef.current);
        cancelPollTimerRef.current = null; setDeploymentStatus('Timed out waiting for cancellation confirmation.');
        setIsUndeploying(false); setIsPollingStatus(false); setIsDeployed(false); setRedeployMode(true); setShowDeployPopup(true); return;
      }
      try {
        const response = await fetch(`/git/galaxyapi/runs?runId=${runId}`, { headers: authHeaders });
        if (!response.ok) {
          if (cancelPollTimerRef.current !== null) window.clearInterval(cancelPollTimerRef.current);
          cancelPollTimerRef.current = null; setDeploymentStatus(`Error fetching run status during undeploy. ${await response.text()}`);
          setIsUndeploying(false); setIsPollingStatus(false); setIsDeployed(false); setRedeployMode(true); setShowDeployPopup(true); return;
        }
        const runDetails = await response.json();
        if (runDetails.status === 'completed' && runDetails.conclusion === 'cancelled') {
          if (cancelPollTimerRef.current !== null) window.clearInterval(cancelPollTimerRef.current);
          cancelPollTimerRef.current = null; setDeploymentStatus('Deployment successfully cancelled.');
          setIsDeployed(false); // Ensure isDeployed is false after successful cancellation
          setIsUndeploying(false); setIsPollingStatus(false); setShowDeployPopup(true); setRedeployMode(true); // Set redeployMode to true
        } else if (runDetails.status === 'completed') {
          if (cancelPollTimerRef.current !== null) window.clearInterval(cancelPollTimerRef.current);
          cancelPollTimerRef.current = null; setDeploymentStatus(`Undeploy failed: Workflow completed (${runDetails.conclusion}), not cancelled.`);
          setIsUndeploying(false); setIsPollingStatus(false); setIsDeployed(false); setRedeployMode(true); setShowDeployPopup(true);
        } else {
          setDeploymentStatus(`Waiting for cancellation... Current status: ${runDetails.status}`);
          cancelPollTimerRef.current = window.setTimeout(check, pollInterval);
        }
      } catch (error) {
        if (cancelPollTimerRef.current !== null) window.clearInterval(cancelPollTimerRef.current);
        cancelPollTimerRef.current = null; setDeploymentStatus('Error checking cancellation status.');
        setIsUndeploying(false); setIsPollingStatus(false); setIsDeployed(false); setRedeployMode(true); setShowDeployPopup(true);
      }
    };
    cancelPollTimerRef.current = window.setTimeout(check, 0);
  }, [setDeploymentStatus, setIsDeployed, setIsUndeploying, setIsPollingStatus, setRedeployMode, setShowDeployPopup]);

  const handleUndeploy = useCallback(async () => {
    clearAllPollingTimers();
    if (!username) { return; }
    if (activationProgressTimerId !== null) {
      window.clearInterval(activationProgressTimerId);
      setActivationProgressTimerId(null);
    }
    setActivationProgressPercent(0);

    setIsUndeploying(true);
    setIsPollingStatus(true);
    setShowDeployPopup(true);
    setDeploymentStatus('Stopping active services...');

    const formDataSetters = [setButtonStates1, setButtonStates2, setButtonStates3, setButtonStates4, setButtonStates5];
    const errorSetters = [setError1, setError2, setError3, setError4, setError5];
    const formDatas = [formData1, formData2, formData3, formData4, formData5];
    const allButtonStates = [buttonStates1, buttonStates2, buttonStates3, buttonStates4, buttonStates5]; // Get current state values

    const stopPromises: Promise<void>[] = [];
    for (let i = 0; i < formDatas.length; i++) {
      const formNumber = i + 1;
      const currentButtonStatesSetter = formDataSetters[i];
      const currentButtonStatesValue = allButtonStates[i]; // Use the current state value

      // Check if the 'start' button is active, indicating a running service
      if (formDatas[i].RC && currentButtonStatesValue.start.active) { // Corrected access
        // Temporarily set loading state for the stop button
        currentButtonStatesSetter(prev => ({ ...prev, stop: { ...prev.stop, loading: true } }));
        stopPromises.push(
          (async () => {
            try {
              // Directly call the logic from handleAction for 'stop'
              const authHeaders = getApiAuthHeaders();
              const modifiedFormData = Object.entries(formDatas[i]).reduce((acc, [key, value]) => { acc[`${key}${formNumber}`] = value; return acc; }, {} as Record<string, string>);
              const response = await fetch(`/api/localt/action`, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify({ action: 'stop', formNumber: formNumber, formData: modifiedFormData, logicalUsername: username })
              });

              if (response.ok) {
                currentButtonStatesSetter(prev => ({
                  ...prev,
                  stop: { loading: false, active: true, text: 'Stopped' },
                  start: { ...prev.start, active: false, text: 'Start' },
                }));
                errorSetters[i]([]);
              } else {
                const errorData = await response.json().catch(() => ({ message: "Unknown error" }));
                errorSetters[i]([`Unable to stop form ${formNumber}: ${errorData.message || 'Please try again'}`]);
                currentButtonStatesSetter(prev => ({ ...prev, stop: { ...prev.stop, loading: false, active: false, text: 'Stop' } }));
              }
            } catch (error) {
              errorSetters[i]([`Unable to stop form ${formNumber}: Network error or client-side issue.`]);
              currentButtonStatesSetter(prev => ({ ...prev, stop: { ...prev.stop, loading: false, active: false, text: 'Stop' } }));
            }
          })()
        );
      }
    }

    await Promise.all(stopPromises); // Wait for all stop commands to complete

    setDeploymentStatus('Attempting to cancel current deployment...');
    const authHeaders = getApiAuthHeaders();
    const suffixedUsernameForJobSearch = username;
    try {
      if (!suffixedUsernameForJobSearch) {
        alert('Logical username not available for undeploy operation.');
        setIsUndeploying(false); setShowDeployPopup(true); return;
      }
      const latestRunResponse = await fetch(`/api/git/latest-user-run?logicalUsername=${suffixedUsernameForJobSearch}&activeOnly=true`, { headers: authHeaders });
      if (latestRunResponse.ok) {
        const latestRunData = await latestRunResponse.json() as LatestUserRunResponse;
        if (latestRunData.jobName !== `Run for ${suffixedUsernameForJobSearch}`) {
          setDeploymentStatus(`Found an active run, but not the target deployment for "Run for ${suffixedUsernameForJobSearch}".`);
          setIsUndeploying(false); setShowDeployPopup(true); return;
        }
        if (latestRunData.status === 'in_progress' || latestRunData.status === 'queued' || latestRunData.status === 'waiting') {
          const runIdToCancel = latestRunData.runId;
          const cancelResponse = await fetch(`/git/galaxyapi/runs?cancelRunId=${runIdToCancel}`, { method: 'POST', headers: authHeaders });
          if (cancelResponse.status === 202) {
            setDeploymentStatus(`Cancellation request sent for run ${runIdToCancel}. Monitoring...`);
            pollForCancelledStatus(runIdToCancel);
          }
          else { throw new Error(`Failed to cancel workflow run ${runIdToCancel}: ${cancelResponse.status} ${ (await cancelResponse.json().catch(()=>({}))).message || await cancelResponse.text()}`); }
        } else {
          setDeploymentStatus(`No active (in_progress/queued) deployment found for job "Run for ${suffixedUsernameForJobSearch}" to cancel. Latest status: ${latestRunData.status}.`);
          setIsUndeploying(false); setShowDeployPopup(true); return;
        }
        } else if (latestRunResponse.status === 404) {
          setDeploymentStatus(`No active deployment found for job "Run for ${suffixedUsernameForJobSearch}" to cancel.`);
          setIsUndeploying(false); setIsDeployed(false); setRedeployMode(true); setShowDeployPopup(true); return;
        } else { throw new Error(`Failed to fetch latest run for undeploy: ${latestRunResponse.status} ${await latestRunResponse.text()}`); }
      } catch (error: any) {
        setDeploymentStatus(`An error occurred during undeployment. Please try again.`); // Generic error message
        setIsUndeploying(false); setIsDeployed(false); setRedeployMode(true); setShowDeployPopup(true);
      }
    }, [username, clearAllPollingTimers, activationProgressTimerId, pollForCancelledStatus, setActivationProgressTimerId, setActivationProgressPercent, setButtonStates1, setButtonStates2, setButtonStates3, setButtonStates4, setButtonStates5, setError1, setError2, setError3, setError4, setError5, setIsUndeploying, setIsPollingStatus, setShowDeployPopup, setDeploymentStatus, setIsDeployed, setRedeployMode, formData1, formData2, formData3, formData4, formData5, buttonStates1, buttonStates2, buttonStates3, buttonStates4, buttonStates5 ]);
  
    const handleLogout = useCallback(async () => {
      if (activationProgressTimerId !== null) {
        window.clearInterval(activationProgressTimerId);
        setActivationProgressTimerId(null);
      }
      if (isDeployed) {
        setShowDeployPopup(true);
        try { await handleUndeploy(); } catch (err) { console.error("Error during undeploy on logout."); } // Generic error
      }
      try {
        const response = await fetch('/api/auth/signout', { method: 'POST', headers: getApiAuthHeaders() });
        if (!response.ok) {
          // Suppress console error for logout API call failure, as it might be expected for already logged out users
          // const errorData = await response.json().catch(() => ({}));
          // console.error('Logout API call failed.'); 
        }
      } catch (apiError) { 
        // Suppress console error for network/client-side errors during logout API call
        // console.error('Error calling logout API.'); 
      }
      sessionStorage.removeItem(STORAGE_KEYS.USERNAME);
      sessionStorage.removeItem(STORAGE_KEYS.USER_ID);
      router.push('/signin');
    }, [activationProgressTimerId, isDeployed, router, handleUndeploy, setActivationProgressTimerId, setShowDeployPopup]);
  
    const checkInitialDeploymentStatus = useCallback(async (logicalUsernameToCheck: string) => {
      setDeploymentStatus('Checking deployment status...');
      try {
        const authHeaders = getApiAuthHeaders();
        const response = await fetch(`/api/git/latest-user-run?logicalUsername=${logicalUsernameToCheck}`, { headers: authHeaders });
        if (response.ok) {
          const data = await response.json() as LatestUserRunResponse;
          const isActiveStatus = data.status === 'in_progress' || data.status === 'queued';
          if (isActiveStatus) {
            setIsDeployed(true); setShowDeployPopup(false); setRedeployMode(false); setIsPollingStatus(false);
            setDeploymentStatus(`Active deployment detected (Run ID: ${data.runId}, Status: ${data.status}).`);
          } else {
            setIsDeployed(false); setShowDeployPopup(true); setRedeployMode(true); setIsPollingStatus(false);
            setDeploymentStatus(`Deployment not active. Latest run: ${data.status} (Conclusion: ${data.conclusion || 'N/A'}). Redeploy if needed.`);
          }
        } else if (response.status === 404) {
          setIsDeployed(false); setShowDeployPopup(true); setRedeployMode(true); setIsPollingStatus(false);
          setDeploymentStatus('No deployment found for your user. Deployment is required.');
        } else {
          const errorData = await response.json();
          setDeploymentStatus(`Error checking status. Please try again.`); // Generic error
          setIsDeployed(false); setShowDeployPopup(true); setRedeployMode(true); setIsPollingStatus(false);
        }
      } catch (error) {
        setDeploymentStatus('Error connecting for status check. Please try again.');
        setIsDeployed(false); setShowDeployPopup(true); setRedeployMode(true); setIsPollingStatus(false);
      }
    }, [setDeploymentStatus, setIsDeployed, setShowDeployPopup, setRedeployMode, setIsPollingStatus]);

  // Removed handleStaleSession from here, as it will be handled globally in layout.tsx
  // The session_updates listener will dispatch a custom event.

  const fetchSessionDetails = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/session-details'); 
      if (response.ok) {
        const details = await response.json();
        if (details.username) {
          setDisplayedUsername(details.username);
          if (details.userId) { 
              setCurrentUserIdState(details.userId.toString()); 
              sessionStorage.setItem(STORAGE_KEYS.USER_ID, details.userId.toString());
          } else { sessionStorage.removeItem(STORAGE_KEYS.USER_ID); }
          const suffix = '7890';
          const suffixedUsername = `${details.username}${suffix}`;
          setUsername(suffixedUsername);
          setShowDeployPopup(true);
          checkInitialDeploymentStatus(suffixedUsername); 
        } else {
           setDeploymentStatus('Please sign in to manage deployments.');
           setIsDeployed(false); setShowDeployPopup(true);
           sessionStorage.removeItem(STORAGE_KEYS.USER_ID);
        }
        if (details.tokenExpiresAt) {
            const expiryDate = new Date(details.tokenExpiresAt); const today = new Date();
            const expiryDateMidnight = new Date(expiryDate.getFullYear(), expiryDate.getMonth(), expiryDate.getDate());
            const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            const day = String(expiryDate.getDate()).padStart(2, '0');
            const month = String(expiryDate.getMonth() + 1).padStart(2, '0');
            const year = expiryDate.getFullYear(); const formattedDate = `${day}-${month}-${year}`;
            let daysRemainingString = "";
            if (expiryDateMidnight < todayMidnight) {
              daysRemainingString = "(Expired)";
              setShowTokenExpiredPopup(true); // Show popup if token is expired on session fetch
              setIsDeployed(false); // Disable deploy if token is expired
              setRedeployMode(true); // Force redeploy mode
            }
            else {
              const diffTime = Math.abs(expiryDateMidnight.getTime() - todayMidnight.getTime());
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              daysRemainingString = `(${diffDays} day${diffDays !== 1 ? 's' : ''} remaining)`;
            }
            setTokenExpiryDisplay(`${formattedDate} ${daysRemainingString}`);
        }
      } else {
        setDeploymentStatus('Session details unavailable. Please sign in.');
        setIsDeployed(false); setShowDeployPopup(true);
        sessionStorage.removeItem(STORAGE_KEYS.USER_ID);
        if (response.status === 401) router.push('/signin'); 
      }
    } catch (error) {
      setDeploymentStatus('Error fetching session. Please try signing in again.');
      setIsDeployed(false); setShowDeployPopup(true);
      sessionStorage.removeItem(STORAGE_KEYS.USER_ID);
    }
  }, [checkInitialDeploymentStatus, router, setCurrentUserIdState, setDisplayedUsername, setUsername, setShowDeployPopup, setDeploymentStatus, setIsDeployed, setTokenExpiryDisplay, setShowTokenExpiredPopup, setRedeployMode]);

  useEffect(() => { setIsClient(true); }, []);

  useEffect(() => {
    if (!isClient) return;
    let supabaseInstance: SupabaseClient | null = null;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (supabaseUrl && supabaseAnonKey) supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
    else { console.error('Supabase URL or Anon Key not configured.'); return; }

    fetchSessionDetails();
    const channel = supabaseInstance.channel('session_updates');
    channel
        .on('broadcast', { event: 'session_terminated' }, (message) => {
            console.log('[GalaxyForm] Received broadcast:', message);
            const storedUserId = sessionStorage.getItem(STORAGE_KEYS.USER_ID);
            console.log('[GalaxyForm] Stored UserId:', storedUserId);
            if (message.payload && message.payload.userId && storedUserId && message.payload.userId.toString() === storedUserId) {
                console.log('[GalaxyForm] User ID matched. Dispatching globalSessionTerminated event.');
                const event = new CustomEvent('globalSessionTerminated', {
                    detail: { isAdminBlocked: message.payload.reason === 'admin_blocked' }
                });
                window.dispatchEvent(event);
            } else {
                console.log('[GalaxyForm] User ID mismatch or missing payload data. Not dispatching event.');
            }
        })
        .on('broadcast', { event: 'token_expired' }, async (message) => { // Make the callback async
            console.log('[GalaxyForm] Received token_expired broadcast:', message);
            const storedUserId = sessionStorage.getItem(STORAGE_KEYS.USER_ID);
            if (message.payload && message.payload.userId && storedUserId && message.payload.userId.toString() === storedUserId) {
                console.log('[GalaxyForm] Token expired for current user. Showing token expired popup.');
                setShowTokenExpiredPopup(true);
                setIsDeployed(false); // Treat as not deployed if token is expired
                setRedeployMode(true); // Force redeploy mode
                setShowDeployPopup(true); // Show the main deploy popup, which will then be overridden by token expired popup
                setDeploymentStatus('Your token has expired. Please renew it by reaching out to the Owner on Discord GalaxyKickLock.');

                // Perform undeploy and logout actions
                try {
                    await handleUndeploy();
                } catch (undeployError) {
                    console.error('Error during undeploy triggered by token_expired:', undeployError);
                }
                // After undeploy, proceed to logout and redirect
                await handleLogout();
            }
        })
        .subscribe(status => {
            console.log('[GalaxyForm] Supabase channel status:', status);
        });
    const beforeUnloadHandler = () => {
      const storedUser = sessionStorage.getItem(STORAGE_KEYS.USERNAME);
      if (storedUser && navigator.sendBeacon) navigator.sendBeacon('/api/auth/beacon-signout-undeploy', new Blob([JSON.stringify({})], {type : 'application/json'}));
    };
    window.addEventListener('beforeunload', beforeUnloadHandler);
    return () => {
        if (channel) supabaseInstance?.removeChannel(channel).catch(err => console.error("Error removing channel:", err));
        if (activationProgressTimerId !== null) window.clearInterval(activationProgressTimerId);
        window.removeEventListener('beforeunload', beforeUnloadHandler);
    };
  }, [isClient, fetchSessionDetails, activationProgressTimerId, setShowTokenExpiredPopup, setIsDeployed, setRedeployMode, setShowDeployPopup, setDeploymentStatus]);
  
  const pollRunStatus = useCallback((runIdToPoll: number) => {
    setDeploymentStatus(`Monitoring run ID: ${runIdToPoll}. Waiting for status updates...`);
    const pollingTimeout = 3 * 60 * 1000; const pollIntervalTime = 10 * 1000;
    const statusPollStartTime = Date.now(); const authHeaders = getApiAuthHeaders();
    const performStatusPoll = async () => {
      if (Date.now() - statusPollStartTime > pollingTimeout) {
        if (statusPollTimerRef.current !== null) window.clearInterval(statusPollTimerRef.current);
        statusPollTimerRef.current = null;
        setDeploymentStatus('Deployment timed out while waiting for "in_progress" status. Please try again.');
        setIsDeployed(false); setIsPollingStatus(false); setRedeployMode(true); return;
      }
      try {
        const runStatusResponse = await fetch(`/git/galaxyapi/runs?runId=${runIdToPoll}`, { headers: authHeaders });
        if (!runStatusResponse.ok) {
          if (statusPollTimerRef.current !== null) window.clearInterval(statusPollTimerRef.current);
          statusPollTimerRef.current = null;
          setDeploymentStatus(`Failed to fetch deployment status from backend. ${await runStatusResponse.text()}`);
          setIsPollingStatus(false); setIsDeployed(false); setRedeployMode(true); return;
        }
        const runDetails = await runStatusResponse.json();
        if (runDetails.status === 'in_progress') {
          if (statusPollTimerRef.current !== null) window.clearInterval(statusPollTimerRef.current);
          statusPollTimerRef.current = null; setIsDeployed(true); setRedeployMode(false);
          try {
            const setActiveRunResponse = await fetch('/api/auth/set-active-run', {
              method: 'POST', headers: getApiAuthHeaders(), body: JSON.stringify({ runId: runIdToPoll }),
            });
            if (!setActiveRunResponse.ok) console.error('Failed to set active run ID via API:', (await setActiveRunResponse.json().catch(() => ({}))).message || setActiveRunResponse.statusText);
            else console.log(`Successfully notified server of active run ID: ${runIdToPoll}`);
          } catch (apiError) { console.error('Error calling /api/auth/set-active-run:', apiError); }
          setDeploymentStatus('Finalizing KickLock activation...');
          setIsPollingStatus(true); setActivationProgressPercent(0);
          let currentProgress = 0; const totalDuration = 30;
          const newActivationTimerId = window.setInterval(() => {
            currentProgress += 1; const percent = Math.min(100, (currentProgress / totalDuration) * 100);
            setActivationProgressPercent(percent);
            if (currentProgress >= totalDuration) {
              window.clearInterval(newActivationTimerId); setActivationProgressTimerId(null);
              setShowDeployPopup(false); setIsPollingStatus(false); setActivationProgressPercent(100);
              setDeploymentStatus('KickLock activated successfully!');
            }
          }, 1000);
          setActivationProgressTimerId(newActivationTimerId);
        } else {
          // If status is not 'in_progress', it means it's completed, cancelled, or failed.
          // In these cases, stop polling and set redeploy mode.
          if (statusPollTimerRef.current !== null) window.clearInterval(statusPollTimerRef.current);
          statusPollTimerRef.current = null;
          setDeploymentStatus(`Workflow status: ${runDetails.status} (Conclusion: ${runDetails.conclusion || 'N/A'}). Redeploy if needed.`);
          setIsDeployed(false); // Ensure isDeployed is false if not in_progress
          setIsPollingStatus(false); // Stop polling
          setRedeployMode(true); // Enable redeploy button
        }
      } catch (pollError) {
        if (statusPollTimerRef.current !== null) window.clearInterval(statusPollTimerRef.current);
        statusPollTimerRef.current = null;
        setDeploymentStatus('Error polling deployment status. Please try again.');
        setIsDeployed(false); setIsPollingStatus(false); setRedeployMode(true);
      }
    };
    statusPollTimerRef.current = window.setTimeout(performStatusPoll, 0);
  }, [setDeploymentStatus, setIsDeployed, setRedeployMode, setIsPollingStatus, setActivationProgressPercent, setActivationProgressTimerId, setShowDeployPopup]);

  const startDeploymentCheck = useCallback(async (suffixedUsernameForJobSearch: string | null) => {
    if (!suffixedUsernameForJobSearch) {
      setDeploymentStatus('Logical username (suffixed) not available for status check.');
      setIsPollingStatus(false); return;
    }
    if (activationProgressTimerId !== null) { window.clearInterval(activationProgressTimerId); setActivationProgressTimerId(null); }
    setIsPollingStatus(true); setRedeployMode(false);
    const jobNameToFind = `Run for ${suffixedUsernameForJobSearch}`;
    const authHeaders = getApiAuthHeaders();
    const findRunIdTimeoutDuration = 90 * 1000; // Increased from 30s to 90s
    const findRunIdInterval = 5 * 1000;
    const findRunIdStartTime = Date.now();
    const attemptToFindRunId = async () => {
      const attemptNumber = Math.floor((Date.now() - findRunIdStartTime) / findRunIdInterval) + 1;
      setDeploymentStatus(`Locating workflow run (attempt ${attemptNumber})...`);
      if (Date.now() - findRunIdStartTime > findRunIdTimeoutDuration) {
        if (findRunIdTimerRef.current !== null) window.clearInterval(findRunIdTimerRef.current);
        findRunIdTimerRef.current = null;
        setDeploymentStatus('Could not locate the triggered workflow run in time. Please try redeploying.');
        setIsPollingStatus(false); setRedeployMode(true); return;
      }
      try {
        const response = await fetch(`/api/git/latest-user-run?logicalUsername=${suffixedUsernameForJobSearch}&activeOnly=true`, { headers: authHeaders });
        if (response.ok) {
          const data = await response.json() as LatestUserRunResponse;
          if (data.runId && data.jobName === jobNameToFind) {
            if (findRunIdTimerRef.current !== null) window.clearInterval(findRunIdTimerRef.current);
            findRunIdTimerRef.current = null; pollRunStatus(data.runId);
          } else { findRunIdTimerRef.current = window.setTimeout(attemptToFindRunId, Date.now() - findRunIdStartTime <= findRunIdTimeoutDuration - findRunIdInterval ? findRunIdInterval : 1000); }
        } else if (response.status === 404) { findRunIdTimerRef.current = window.setTimeout(attemptToFindRunId, Date.now() - findRunIdStartTime <= findRunIdTimeoutDuration - findRunIdInterval ? findRunIdInterval : 1000);
        } else { throw new Error(`Failed to find run: ${response.status} ${(await response.json()).message || ''}`); }
      } catch (error) {
        if (Date.now() - findRunIdStartTime <= findRunIdTimeoutDuration - findRunIdInterval) findRunIdTimerRef.current = window.setTimeout(attemptToFindRunId, findRunIdInterval);
        else if (Date.now() - findRunIdStartTime <= findRunIdTimeoutDuration) findRunIdTimerRef.current = window.setTimeout(attemptToFindRunId, 1000);
        else {
          if (findRunIdTimerRef.current !== null) window.clearInterval(findRunIdTimerRef.current);
          findRunIdTimerRef.current = null;
          setDeploymentStatus(`An error occurred while locating the workflow run.`); // Generic error message
          setIsPollingStatus(false); setRedeployMode(true);
        }
      }
    };
    attemptToFindRunId();
  }, [activationProgressTimerId, pollRunStatus, /*setters:*/ setDeploymentStatus, setIsPollingStatus, setActivationProgressTimerId, setRedeployMode]);

  const handleDeploy = useCallback(async () => {
    clearAllPollingTimers(); 
    if (!username) { return; }
    if (showTokenExpiredPopup) { // Prevent deployment if token is expired
      setDeploymentStatus('Cannot deploy: Your token has expired. Please renew it.');
      setShowDeployPopup(true); // Ensure popup is visible
      return;
    }
    if (activationProgressTimerId !== null) { window.clearInterval(activationProgressTimerId); setActivationProgressTimerId(null); }
    setActivationProgressPercent(0); setIsDeploying(true); setRedeployMode(false); setShowDeployPopup(true);
    setDeploymentStatus('Dispatching workflow...'); const authHeaders = getApiAuthHeaders();
    try {
      const response = await fetch(`/git/galaxyapi/workflow-dispatch`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ username: username }) });
      setIsDeploying(false);
      if (response.status === 204) {
        setDeploymentStatus('Waiting 10s for run to initialize...'); setIsPollingStatus(true); setShowDeployPopup(true);
        window.setTimeout(() => {
          if (username) startDeploymentCheck(username);
          else { setDeploymentStatus("Error: User details not loaded."); setIsPollingStatus(false); setRedeployMode(true); }
        }, 10000);
      } else {
        const errorData = await response.json().catch(() => ({}));
        setDeploymentStatus(`Dispatch failed: ${response.status} ${errorData.message || await response.text()}`);
        setIsDeployed(false); setIsPollingStatus(false); setRedeployMode(true);
      }
    } catch (error) {
      setIsDeploying(false);
      setDeploymentStatus(`An error occurred during deployment dispatch.`); // Generic error message
      setIsDeployed(false);
      setIsPollingStatus(false); // Ensure polling status is false on dispatch error
      setRedeployMode(true);
    }
  }, [username, clearAllPollingTimers, activationProgressTimerId, startDeploymentCheck, showTokenExpiredPopup, /*setters:*/ setActivationProgressTimerId, setActivationProgressPercent, setIsDeploying, setRedeployMode, setShowDeployPopup, setDeploymentStatus, setIsPollingStatus, setIsDeployed]);
  
  const saveAllFormDataToLocalStorage = useCallback(() => {
    if (typeof window !== 'undefined') {
      const allFormData = {
        formData1,
        formData2,
        formData3,
        formData4,
        formData5,
      };
      localStorage.setItem(STORAGE_KEYS.FORMS_DATA, JSON.stringify(allFormData));
    }
  }, [formData1, formData2, formData3, formData4, formData5]);

  useEffect(() => {
    saveAllFormDataToLocalStorage();
  }, [formData1, formData2, formData3, formData4, formData5, saveAllFormDataToLocalStorage]);

  const handleInputChange = (formNumber: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const timeFields = ['startAttackTime', 'stopAttackTime', 'attackIntervalTime', 'startDefenceTime', 'stopDefenceTime', 'defenceIntervalTime'];
    const numericValue = timeFields.includes(name) ? value.replace(/\D/g, '').slice(0, 5) : value;
    const setFormData = [setFormData1, setFormData2, setFormData3, setFormData4, setFormData5][formNumber-1];
    setFormData(prev => ({ ...prev, [name]: numericValue }));
    setToastMessage(null); // Clear toast message on any input change
  };

  const handleAction = (formNumber: number) => async (action: ActionType) => {
    const formDataSetters = [setButtonStates1, setButtonStates2, setButtonStates3, setButtonStates4, setButtonStates5];
    const errorSetters = [setError1, setError2, setError3, setError4, setError5];
    const formDatas = [formData1, formData2, formData3, formData4, formData5];
    const setButtonStates = formDataSetters[formNumber-1];
    const setError = errorSetters[formNumber-1];
    const formData = formDatas[formNumber-1];
    const requiredFields: (keyof FormData)[] = ['RC', 'startAttackTime', 'stopAttackTime', 'attackIntervalTime', 'startDefenceTime', 'stopDefenceTime', 'defenceIntervalTime', 'PlanetName', 'Rival'];
    const emptyFields = requiredFields.filter(field => !formData[field]);
    if (emptyFields.length > 0) {
      setError(emptyFields); setToastMessage(`Please fill all highlighted fields.`);
      setButtonStates(prev => ({ ...prev, [action]: { ...prev[action], loading: false, active: false, text: action } })); return;
    }
    setButtonStates(prev => ({ ...prev, [action]: { ...prev[action], loading: true } })); setError([]);
    const authHeaders = getApiAuthHeaders();
    try {
      if (!username) { setError(['Logical username not available.']); setButtonStates(prev => ({ ...prev, [action]: { ...prev[action], loading: false } })); return; }
      const modifiedFormData = Object.entries(formData).reduce((acc, [key, value]) => { acc[`${key}${formNumber}`] = value; return acc; }, {} as Record<string, string>);
      const response = await fetch(`/api/localt/action`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ action: action, formNumber: formNumber, formData: modifiedFormData, logicalUsername: username }) });
      if (response.ok) {
        setButtonStates(prev => ({ 
          ...prev, 
          [action]: { loading: false, active: true, text: action === 'start' ? 'Running' : action === 'stop' ? 'Stopped' : 'Updated' },
          ...(action === 'start' ? { stop: { ...prev.stop, active: false, text: 'Stop' } } : {}),
          ...(action === 'stop' ? { start: { ...prev.start, active: false, text: 'Start' } } : {}),
          ...(action === 'update' ? { update: { loading: false, active: true, text: 'Updated' } } : {})
        })); 
        setError([]);
        setToastMessage(null); // Clear toast message on successful action
      } else if (response.status === 409) {
        const errorData = await response.json();
        if (errorData.autoUndeployed) {
          setAutoUndeployMessage(errorData.message); setShowAutoUndeployPopup(true); setIsDeployed(false); setRedeployMode(true);
          [setButtonStates1, setButtonStates2, setButtonStates3, setButtonStates4, setButtonStates5].forEach(setter => setter(initialButtonStates));
          setError([]);
        } else {
          setError([`Conflict: ${errorData.message || 'Please try again'}`]);
          setButtonStates(prev => ({ ...prev, [action]: { ...prev[action], loading: false, active: false, text: action } }));
        }
      } else {
        const errorData = await response.json().catch(() => ({ message: "Unknown error" }));
        setError([`Unable to ${action}: ${errorData.message || 'Please try again'}`]);
        setButtonStates(prev => ({ ...prev, [action]: { ...prev[action], loading: false, active: false, text: action } }));
      }
    } catch (error) {
      setError([`Unable to ${action}: Network error or client-side issue.`]);
      setButtonStates(prev => ({ ...prev, [action]: { ...prev[action], loading: false, active: false, text: action } }));
    }
  };

  const renderForm = (formNumber: number) => {
    const currentFormData = [formData1, formData2, formData3, formData4, formData5][formNumber-1];
    const currentButtonStates = [buttonStates1, buttonStates2, buttonStates3, buttonStates4, buttonStates5][formNumber-1];
    const currentError = [error1, error2, error3, error4, error5][formNumber-1];
    const inputFields = [
      { key: 'RC', label: 'RC', color: '#FFFF00', type: 'text' }, { key: 'PlanetName', label: 'Planet Name', color: '#FFFFFF', type: 'text' },
      { key: 'Rival', label: 'Rival', color: '#FFA500', type: 'text' }, { key: 'startAttackTime', label: 'Start Attack Time', color: '#FF0000', type: 'text', maxLength: 5, className: `${styles.input} ${styles.timeInput}` },
      { key: 'attackIntervalTime', label: 'Attack Interval Time', color: '#FFFFFF', type: 'text', maxLength: 5, className: `${styles.input} ${styles.timeInput}` }, { key: 'stopAttackTime', label: 'Stop Attack Time', color: '#FF0000', type: 'text', maxLength: 5, className: `${styles.input} ${styles.timeInput}` },
      { key: 'startDefenceTime', label: 'Start Defence Time', color: '#00FFFF', type: 'text', maxLength: 5, className: `${styles.input} ${styles.timeInput}` }, { key: 'defenceIntervalTime', label: 'Defence Interval Time', color: '#FFFFFF', type: 'text', maxLength: 5, className: `${styles.input} ${styles.timeInput}` },
      { key: 'stopDefenceTime', label: 'Stop Defence Time', color: '#00FFFF', type: 'text', maxLength: 5, className: `${styles.input} ${styles.timeInput}` },
    ];
    return (
      <div className={styles.formContent} style={{ display: activeTab === formNumber ? 'block' : 'none' }}>
        <div className={styles.form}>
          {inputFields.map(({ key, label, color, type, maxLength, className }) => (
            <div key={key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <label style={{ color: color, marginBottom: '0.5rem', textAlign: 'center' }}>{label}</label>
              <input type={type} name={key} value={currentFormData[key as keyof FormData]} onChange={handleInputChange(formNumber)} className={className || styles.input} maxLength={maxLength} autoComplete="off" onFocus={(e) => e.target.setAttribute('autocomplete', 'off')} style={{ backgroundColor: 'rgba(25, 0, 0, 0.7)', border: currentError.includes(key) ? '1px solid red' : '1px solid rgba(255, 0, 0, 0.3)', color: '#fff', WebkitTextFillColor: '#fff', width: '100%', padding: '0.5rem', boxSizing: 'border-box' }} title={currentError.includes(key) ? 'This field is required' : undefined} />
            </div>
          ))}
          <div className={styles.buttonGroup} style={{ gap: '20px', display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
            <button type="button" onClick={() => handleAction(formNumber)('start')} className={`${styles.button} ${currentButtonStates.start.loading ? styles.loadingButton : ''} ${currentButtonStates.start.active ? styles.buttonRunning : ''}`} disabled={!isDeployed || isDeploying || isPollingStatus || isUndeploying || currentButtonStates.start.loading || showTokenExpiredPopup} style={{ backgroundColor: currentButtonStates.start.active ? '#22c55e' : undefined }} > <Play size={16} /> <span>Start</span> </button>
            <button type="button" onClick={() => handleAction(formNumber)('stop')} className={`${styles.button} ${currentButtonStates.stop.loading ? styles.loadingButton : ''} ${currentButtonStates.stop.active ? styles.buttonStopped : ''}`} disabled={!isDeployed || isDeploying || isPollingStatus || isUndeploying || currentButtonStates.stop.loading || showTokenExpiredPopup} > <Square size={16} /> <span>Stop</span> </button>
            <button type="button" onClick={() => handleAction(formNumber)('update')} className={`${styles.button} ${currentButtonStates.update.loading ? styles.loadingButton : ''} ${currentButtonStates.update.active ? styles.buttonUpdated : ''}`} disabled={!isDeployed || isDeploying || isPollingStatus || isUndeploying || currentButtonStates.update.loading || showTokenExpiredPopup} style={{ backgroundColor: currentButtonStates.update.active ? '#3b82f6' : undefined }} > <RefreshCw size={16} /> <span>Update</span> </button>
            {renderStatusButton()}
          </div>
        </div>
      </div>
    );
  };

  const renderStatusButton = () => {
    if (isDeployed) {
      return ( <button onClick={handleUndeploy} disabled={isUndeploying || showTokenExpiredPopup} className={`${styles.button}`} style={{ minWidth: '120px', backgroundColor: '#22c55e', border: 'none' }} > {isUndeploying ? ( <> <RefreshCw size={16} /> <span>Undeploying...</span> </> ) : ( <> <CheckCircle size={16} /> <span>Deployed</span> </> )} </button> );
    } else {
      return ( <button onClick={() => setShowDeployPopup(true)} disabled={showTokenExpiredPopup} className={`${styles.button}`} style={{ minWidth: '120px', backgroundColor: '#dc2626', border: 'none' }} > <RefreshCw size={16} /> <span>Deploy</span> </button> );
    }
  };

  return (
    <div className={styles.container}>
      {toastMessage && (
        <div style={{ position: 'fixed', top: '20px', right: '20px', backgroundColor: toastMessage.includes("Redirecting") ? '#3498db' : (toastMessage.includes("Successfully") ? '#2ecc71' : '#f87171'), color: 'white', padding: '12px 20px', borderRadius: '6px', zIndex: 2000, display: 'flex', alignItems: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
          <span>{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} style={{ background: 'none', border: 'none', color: 'white', marginLeft: '15px', cursor: 'pointer', fontSize: '18px', lineHeight: '1' }}>
            <X size={20} />
          </button>
        </div>
      )}
      <div className={styles.header} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '0px', backgroundColor: '#1a1a1a', borderRadius: '0px', margin: '0 0 20px 0', position: 'relative' }}>
        {displayedUsername && (
          <div style={{ color: '#fff', fontSize: '1.1rem', position: 'absolute', left: '-770px', top: '-25px' }}>
            <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
              <span style={{ marginRight: '4px' }}>Welcome:</span> <span>{displayedUsername}</span>
            </div>
            {tokenExpiryDisplay && ( <div style={{ fontSize: '0.85rem', color: '#ccc', marginTop: '4px' }}> Token Expires: {tokenExpiryDisplay} </div> )}
          </div>
        )}
        <div style={{ marginLeft: 'auto' }}> <button onClick={handleLogout} className={`${styles.button} ${styles.logoutButton}`} > <LogOut size={16} /> <span>Logout</span> </button> </div>
      </div>
      <h1 className={styles.title}> <span className={styles.kickLock}>KICK ~ LOCK</span> </h1>
      <div className={styles.formContainer}>
        <div className={styles.tabsContainer}>
          {[1, 2, 3, 4, 5].map(num => ( <button key={num} className={`${styles.tabButton} ${activeTab === num ? styles.activeTab : ''}`} onClick={() => setActiveTab(num)} > {formNames[num as keyof typeof formNames]} </button> ))}
        </div>
        {renderForm(1)} {renderForm(2)} {renderForm(3)} {renderForm(4)} {renderForm(5)}
      </div>
      {showDeployPopup && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0, 0, 0, 0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#1a1a1a', borderRadius: '8px', padding: '20px', width: '350px', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)', border: '1px solid #333', textAlign: 'center' }}>
            <h2 style={{ color: '#fff', marginBottom: '15px' }}>
              {isDeployed && isPollingStatus && activationProgressTimerId !== null ? 'Activating KickLock' : (isDeployed && !redeployMode && !isPollingStatus) ? 'KickLock Active' : 'Deploy KickLock'}
            </h2>
            <p style={{ color: '#aaa', marginBottom: '10px', fontSize: '0.9rem', minHeight: '20px' }}> {deploymentStatus} </p>
            {isDeployed && isPollingStatus && activationProgressTimerId !== null && (
              <div style={{ marginBottom: '20px', width: '100%', backgroundColor: '#333', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${activationProgressPercent}%`, height: '10px', backgroundColor: '#22c55e', transition: 'width 0.5s ease-in-out' }} />
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: (isDeployed && isPollingStatus && activationProgressTimerId !== null) ? '0' : '20px' }}>
              {/* Show Redeploy Again button if in redeploy mode and not currently deploying/activating */}
              {redeployMode && !isDeploying && !isPollingStatus ? (
                <button onClick={handleDeploy} disabled={isDeploying || isPollingStatus || showTokenExpiredPopup} style={{ padding: '10px 20px', borderRadius: '4px', border: 'none', backgroundColor: (isDeploying || isPollingStatus || showTokenExpiredPopup) ? '#555' : '#e67e22', color: 'white', fontWeight: 'bold', cursor: (isDeploying || isPollingStatus || showTokenExpiredPopup) ? 'not-allowed' : 'pointer', opacity: (isDeploying || isPollingStatus || showTokenExpiredPopup) ? 0.7 : 1, transition: 'all 0.3s ease', width: '100%' }} >
                  Redeploy Again
                </button>
              ) : (isDeployed && !redeployMode && !isPollingStatus && activationProgressTimerId === null) ? ( <p style={{color: '#22c55e'}}>Deployment is active!</p> ) : null}
            </div>
            {/* Show close button if not deploying or activating */}
            {(!isDeploying && activationProgressTimerId === null && !showTokenExpiredPopup) && (
              <button onClick={() => setShowDeployPopup(false)} style={{marginTop: '15px', background: 'none', border: '1px solid #555', color: '#aaa', padding: '5px 10px', borderRadius: '4px'}}> Close </button>
            )}
          </div>
        </div>
      )}
      {showThankYouMessage && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0, 0, 0, 0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#1a1a1a', borderRadius: '8px', padding: '20px', width: '300px', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)', border: '1px solid #333' }}>
            <h2 style={{ color: '#fff', marginBottom: '20px', textAlign: 'center' }}>Thank You for using KickLock</h2>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button onClick={async () => { setShowThankYouMessage(false); await handleDeploy(); }} style={{ padding: '10px 20px', borderRadius: '4px', border: 'none', backgroundColor: '#d32f2f', color: 'white', fontWeight: 'bold', cursor: 'pointer', width: '100%' }} > Deploy Again </button>
            </div>
          </div>
        </div>
      )}
      {showAutoUndeployPopup && autoUndeployMessage && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0, 0, 0, 0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1050 }}>
          <div style={{ backgroundColor: '#2a2a2a', color: '#fff', borderRadius: '8px', padding: '30px', width: '400px', boxShadow: '0 5px 25px rgba(0, 0, 0, 0.6)', border: '1px solid #444', textAlign: 'center' }}>
            <h2 style={{ color: '#f39c12', marginBottom: '15px', fontSize: '1.5rem' }}>Session Expired</h2>
            <p style={{ color: '#ccc', marginBottom: '25px', fontSize: '1rem', lineHeight: '1.6' }}>{autoUndeployMessage}</p>
            <div style={{ display: 'flex', justifyContent: 'space-around', gap: '15px' }}>
              <button onClick={() => { setShowAutoUndeployPopup(false); setAutoUndeployMessage(null); setShowDeployPopup(true); handleDeploy(); }} style={{ padding: '12px 25px', borderRadius: '5px', border: 'none', backgroundColor: '#e67e22', color: 'white', fontWeight: 'bold', cursor: 'pointer', flex: 1, transition: 'background-color 0.3s ease' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#d35400'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#e67e22'} >
                Redeploy KickLock
              </button>
              <button onClick={() => { setShowAutoUndeployPopup(false); setAutoUndeployMessage(null); setShowDeployPopup(true); }} style={{ padding: '12px 25px', borderRadius: '5px', border: '1px solid #555', backgroundColor: '#444', color: '#ccc', cursor: 'pointer', flex: 1, transition: 'background-color 0.3s ease' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#555'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#444'} >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {showTokenExpiredPopup && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0, 0, 0, 0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1060 }}>
          <div style={{ backgroundColor: '#2a2a2a', color: '#fff', borderRadius: '8px', padding: '30px', width: '400px', boxShadow: '0 5px 25px rgba(0, 0, 0, 0.6)', border: '1px solid #f39c12', textAlign: 'center' }}>
            <h2 style={{ color: '#f39c12', marginBottom: '15px', fontSize: '1.5rem' }}>Token Expired</h2>
            <p style={{ color: '#ccc', marginBottom: '25px', fontSize: '1rem', lineHeight: '1.6' }}>
              Your token has expired. Please renew it by reaching out to the Owner on Discord GalaxyKickLock.
            </p>
            {/* No close button as per requirement */}
          </div>
        </div>
      )}
    </div>
  );
};

export default GalaxyForm;
