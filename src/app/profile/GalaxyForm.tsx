"use client";
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Play, Square, RefreshCw, LogOut, CheckCircle, X, MessageSquare, Bell, UserCircle } from 'lucide-react';
import styles from '../styles/GalaxyControl.module.css';
import { useRouter } from 'next/navigation';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

type FormData = {
  RC1: string;
  RC2: string;
  RC1_startAttackTime: string;
  RC1_stopAttackTime: string;
  RC1_attackIntervalTime: string;
  RC1_startDefenceTime: string;
  RC1_stopDefenceTime: string;
  RC1_defenceIntervalTime: string;
  RC2_startAttackTime: string;
  RC2_attackIntervalTime: string;
  RC2_stopAttackTime: string;
  RC2_startDefenceTime: string;
  RC2_defenceIntervalTime: string;
  RC2_stopDefenceTime: string;
  PlanetName: string;
  Rival: string;
  standOnEnemy: boolean;
  actionOnEnemy: boolean;
  aiChatToggle: boolean;
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
  const [showAdminBlockPopup, setShowAdminBlockPopup] = useState<boolean>(false);
  const [showTokenExpiredPopup, setShowTokenExpiredPopup] = useState<boolean>(false);
  const [tokenExpiryDisplay, setTokenExpiryDisplay] = useState<string | null>(null);
  const [currentUserIdState, setCurrentUserIdState] = useState<string | null>(null);
  const [showDiscordTooltip, setShowDiscordTooltip] = useState<boolean>(false);
  const [showNotificationBell, setShowNotificationBell] = useState<boolean>(false);
  const [newFeaturesMessage, setNewFeaturesMessage] = useState<string>('');
  const [showNewFeaturesPopup, setShowNewFeaturesPopup] = useState<boolean>(false);
  const [showLoadingBar, setShowLoadingBar] = useState<boolean>(false);
  const [loadingBarProgress, setLoadingBarProgress] = useState<number>(0);
  const [showProfilePopup, setShowProfilePopup] = useState<boolean>(false);
  const [showDiscordQrNotification, setShowDiscordQrNotification] = useState<boolean>(false);
  const [discordQrMessage, setDiscordQrMessage] = useState<string>('');

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
  const getInitialFormData = (): FormData => {
    return {
      RC1: '',
      RC2: '',
      RC1_startAttackTime: '',
      RC1_stopAttackTime: '',
      RC1_attackIntervalTime: '',
      RC1_startDefenceTime: '',
      RC1_stopDefenceTime: '',
      RC1_defenceIntervalTime: '',
      PlanetName: '',
      Rival: '',
      RC2_startAttackTime: '',
      RC2_attackIntervalTime: '',
      RC2_stopAttackTime: '',
      RC2_startDefenceTime: '',
      RC2_defenceIntervalTime: '',
      RC2_stopDefenceTime: '',
      standOnEnemy: false,
      actionOnEnemy: false,
      aiChatToggle: false
    };
  };

  const [formData1, setFormData1] = useState<FormData>(getInitialFormData());
  const [formData2, setFormData2] = useState<FormData>(getInitialFormData());
  const [formData3, setFormData3] = useState<FormData>(getInitialFormData());
  const [formData4, setFormData4] = useState<FormData>(getInitialFormData());
  const [formData5, setFormData5] = useState<FormData>(getInitialFormData());

  const [buttonStates1, setButtonStates1] = useState<ButtonStates>(initialButtonStates);
  const [buttonStates2, setButtonStates2] = useState<ButtonStates>(initialButtonStates);
  const [buttonStates3, setButtonStates3] = useState<ButtonStates>(initialButtonStates);
  const [buttonStates4, setButtonStates4] = useState<ButtonStates>(initialButtonStates);
  const [buttonStates5, setButtonStates5] = useState<ButtonStates>(initialButtonStates);

  const [error1, setError1] = useState<string[]>([]);
  const [error2, setError2] = useState<string[]>([]);
  const [error3, setError3] = useState<string[]>([]);
  const [error4, setError4] = useState<string[]>([]);
  const [error5, setError5] = useState<string[]>([]);

  const pollForCancelledStatus = useCallback(async (runId: number): Promise<void> => {
    return new Promise((resolve, reject) => {
      const pollTimeout = 60 * 1000;
      const pollInterval = 5 * 1000;
      const startTime = Date.now();
      const authHeaders = getApiAuthHeaders();
      const check = async () => {
        if (Date.now() - startTime > pollTimeout) {
          if (cancelPollTimerRef.current !== null) window.clearInterval(cancelPollTimerRef.current);
          cancelPollTimerRef.current = null;
          setDeploymentStatus('Timed out waiting for cancellation confirmation.');
          setIsUndeploying(false);
          setIsPollingStatus(false);
          setIsDeployed(false);
          setRedeployMode(true);
          setShowDeployPopup(true);
          resolve();
          return;
        }
        try {
          const response = await fetch(`/git/galaxyapi/runs?runId=${runId}`, { headers: authHeaders });
          if (!response.ok) {
            if (cancelPollTimerRef.current !== null) window.clearInterval(cancelPollTimerRef.current);
            cancelPollTimerRef.current = null;
            setDeploymentStatus(`Error fetching run status during undeploy. ${await response.text()}`);
            setIsUndeploying(false);
            setIsPollingStatus(false);
            setIsDeployed(false);
            setRedeployMode(true);
            setShowDeployPopup(true);
            reject(new Error('Error fetching run status during undeploy.'));
            return;
          }
          const runDetails = await response.json();
          if (runDetails.status === 'completed' && runDetails.conclusion === 'cancelled') {
            if (cancelPollTimerRef.current !== null) window.clearInterval(cancelPollTimerRef.current);
            cancelPollTimerRef.current = null;
            setDeploymentStatus('Deployment successfully cancelled.');
            setIsDeployed(false);
            setIsUndeploying(false);
            setIsPollingStatus(false);
            setShowDeployPopup(true);
            setRedeployMode(true);
            resolve();
          } else if (runDetails.status === 'completed') {
            if (cancelPollTimerRef.current !== null) window.clearInterval(cancelPollTimerRef.current);
            cancelPollTimerRef.current = null;
            setDeploymentStatus(`Undeploy failed: Workflow completed (${runDetails.conclusion}), not cancelled.`);
            setIsUndeploying(false);
            setIsPollingStatus(false);
            setIsDeployed(false);
            setRedeployMode(true);
            setShowDeployPopup(true);
            reject(new Error('Undeploy failed: Workflow completed, not cancelled.'));
          } else {
            setDeploymentStatus(`Waiting for cancellation... Current status: ${runDetails.status}`);
            cancelPollTimerRef.current = window.setTimeout(check, pollInterval);
          }
        } catch (error) {
          if (cancelPollTimerRef.current !== null) window.clearInterval(cancelPollTimerRef.current);
          cancelPollTimerRef.current = null;
          setDeploymentStatus('Error checking cancellation status.');
          setIsUndeploying(false);
          setIsPollingStatus(false);
          setIsDeployed(false);
          setRedeployMode(true);
          setShowDeployPopup(true);
          reject(error);
        }
      };
      cancelPollTimerRef.current = window.setTimeout(check, 0);
    });
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
    const errorSetters = [setError1, setError2, setError3, setError4, setError5];  // Fixed: changed setErrorpricing to setError2
    const formDatas = [formData1, formData2, formData3, formData4, formData5];
    const allButtonStates = [buttonStates1, buttonStates2, buttonStates3, buttonStates4, buttonStates5];

    const stopPromises: Promise<void>[] = [];
    for (let i = 0; i < formDatas.length; i++) {
      const formNumber = i + 1;
      const currentButtonStatesSetter = formDataSetters[i];
      const currentButtonStatesValue = allButtonStates[i];

      if (formDatas[i].RC1 && currentButtonStatesValue.start.active) {
        currentButtonStatesSetter(prev => ({ ...prev, stop: { ...prev.stop, loading: true } }));
        stopPromises.push(
          (async () => {
            try {
              const authHeaders = getApiAuthHeaders();
              const modifiedFormData = Object.entries(formDatas[i]).reduce((acc, [key, value]) => {
                acc[`${key}${formNumber}`] = value.toString(); // Convert all values to strings for API
                return acc;
              }, {} as Record<string, string>);
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

    await Promise.all(stopPromises);

    setDeploymentStatus('Attempting to cancel current deployment...');
    const authHeaders = getApiAuthHeaders();
    const suffixedUsernameForJobSearch = username;
    try {
      if (!suffixedUsernameForJobSearch) {
        alert('Logical username not available for undeploy operation.');
        setIsUndeploying(false);
        setShowDeployPopup(true);
        return;
      }
      const latestRunResponse = await fetch(`/api/git/latest-user-run?logicalUsername=${suffixedUsernameForJobSearch}&activeOnly=true`, { headers: authHeaders });
      if (latestRunResponse.ok) {
        const latestRunData = await latestRunResponse.json() as LatestUserRunResponse;
        if (latestRunData.jobName !== `Run for ${suffixedUsernameForJobSearch}`) {
          setDeploymentStatus(`Found an active run, but not the target deployment for "Run for ${suffixedUsernameForJobSearch}".`);
          setIsUndeploying(false);
          setShowDeployPopup(true);
          return;
        }
        if (latestRunData.status === 'in_progress' || latestRunData.status === 'queued' || latestRunData.status === 'waiting') {
          const runIdToCancel = latestRunData.runId;
          const cancelResponse = await fetch(`/git/galaxyapi/runs?cancelRunId=${runIdToCancel}`, { method: 'POST', headers: authHeaders });
          if (cancelResponse.status === 202) {
            setDeploymentStatus(`Cancellation request sent for run ${runIdToCancel}. Monitoring...`);
            await pollForCancelledStatus(runIdToCancel); // Await the polling
          } else {
            throw new Error(`Failed to cancel workflow run ${runIdToCancel}: ${cancelResponse.status} ${(await cancelResponse.json().catch(() => ({}))).message || await cancelResponse.text()}`);
          }
        } else {
          setDeploymentStatus(`No active (in_progress/queued) deployment found for job "Run for ${suffixedUsernameForJobSearch}" to cancel. Latest status: ${latestRunData.status}.`);
          setIsUndeploying(false);
          setShowDeployPopup(true);
          return;
        }
      } else if (latestRunResponse.status === 404) {
        setDeploymentStatus(`No active deployment found for job "Run for ${suffixedUsernameForJobSearch}" to cancel.`);
        setIsUndeploying(false);
        setIsDeployed(false);
        setRedeployMode(true);
        setShowDeployPopup(true);
        return;
      } else {
        throw new Error(`Failed to fetch latest run for undeploy: ${latestRunResponse.status} ${await latestRunResponse.text()}`);
      }
    } catch (error: any) {
      setDeploymentStatus(`An error occurred during undeployment. Please try again.`);
      setIsUndeploying(false);
      setIsDeployed(false);
      setRedeployMode(true);
      setShowDeployPopup(true);
    }
  }, [
    username,
    clearAllPollingTimers,
    activationProgressTimerId,
    pollForCancelledStatus,
    setActivationProgressTimerId,
    setActivationProgressPercent,
    setButtonStates1,
    setButtonStates2,
    setButtonStates3,
    setButtonStates4,
    setButtonStates5,
    setError1,
    setError2,
    setError3,
    setError4,
    setError5,
    setIsUndeploying,
    setIsPollingStatus,
    setShowDeployPopup,
    setDeploymentStatus,
    setIsDeployed,
    setRedeployMode,
    formData1,
    formData2,
    formData3,
    formData4,
    formData5,
    buttonStates1,
    buttonStates2,
    buttonStates3,
    buttonStates4,
    buttonStates5
  ]);

  const handleLogout = useCallback(async () => {
    if (activationProgressTimerId !== null) {
      window.clearInterval(activationProgressTimerId);
      setActivationProgressTimerId(null);
    }
    if (isDeployed) {
      setShowDeployPopup(true);
      try {
        await handleUndeploy();
      } catch (err) {
        console.error("Error during undeploy on logout.");
      }
    }
    try {
      const response = await fetch('/api/auth/signout', { method: 'POST', headers: getApiAuthHeaders() });
      if (!response.ok) {
        // Suppress console error for logout API call failure
      }
    } catch (apiError) {
      // Suppress console error for network/client-side errors during logout
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
          setIsDeployed(true);
          setShowDeployPopup(false);
          setRedeployMode(false);
          setIsPollingStatus(false);
          setDeploymentStatus(`Active deployment detected (Run ID: ${data.runId}, Status: ${data.status}).`);
        } else {
          setIsDeployed(false);
          setShowDeployPopup(true);
          setRedeployMode(true);
          setIsPollingStatus(false);
          setDeploymentStatus(`Deployment not active. Latest run: ${data.status} (Conclusion: ${data.conclusion || 'N/A'}). Redeploy if needed.`);
        }
      } else if (response.status === 404) {
        setIsDeployed(false);
        setShowDeployPopup(true);
        setRedeployMode(true);
        setIsPollingStatus(false);
        setDeploymentStatus('No deployment found for your user. Deployment is required.');
      } else {
        const errorData = await response.json();
        setDeploymentStatus(`Error checking status. Please try again.`);
        setIsDeployed(false);
        setShowDeployPopup(true);
        setRedeployMode(true);
        setIsPollingStatus(false);
      }
    } catch (error) {
      setDeploymentStatus('Error connecting for status check. Please try again.');
      setIsDeployed(false);
      setShowDeployPopup(true);
      setRedeployMode(true);
      setIsPollingStatus(false);
    }
  }, [setDeploymentStatus, setIsDeployed, setShowDeployPopup, setRedeployMode, setIsPollingStatus]);

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
          } else {
            sessionStorage.removeItem(STORAGE_KEYS.USER_ID);
          }
          const suffix = '7890';
          const suffixedUsername = `${details.username}${suffix}`;
          setUsername(suffixedUsername);
          setShowDeployPopup(true);
          checkInitialDeploymentStatus(suffixedUsername);
        } else {
          setDeploymentStatus('Please sign in to manage deployments.');
          setIsDeployed(false);
          setShowDeployPopup(true);
          sessionStorage.removeItem(STORAGE_KEYS.USER_ID);
        }
        if (details.tokenExpiresAt) {
          const expiryDate = new Date(details.tokenExpiresAt);
          const today = new Date();
          const expiryDateMidnight = new Date(expiryDate.getFullYear(), expiryDate.getMonth(), expiryDate.getDate());
          const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
          const day = String(expiryDate.getDate()).padStart(2, '0');
          const month = String(expiryDate.getMonth() + 1).padStart(2, '0');
          const year = expiryDate.getFullYear();
          const formattedDate = `${day}-${month}-${year}`;
          let daysRemainingString = "";
          if (expiryDateMidnight < todayMidnight) {
            daysRemainingString = "(Expired)";
            setShowTokenExpiredPopup(true);
            setIsDeployed(false);
            setRedeployMode(true);
          } else {
            const diffTime = Math.abs(expiryDateMidnight.getTime() - todayMidnight.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            daysRemainingString = `(${diffDays} day${diffDays !== 1 ? 's' : ''} remaining)`;
          }
          setTokenExpiryDisplay(`${formattedDate} ${daysRemainingString}`);
        }
      } else {
        setDeploymentStatus('Session details unavailable. Please sign in.');
        setIsDeployed(false);
        setShowDeployPopup(true);
        sessionStorage.removeItem(STORAGE_KEYS.USER_ID);
        if (response.status === 401) router.push('/signin');
      }
    } catch (error) {
      setDeploymentStatus('Error fetching session. Please try signing in again.');
      setIsDeployed(false);
      setShowDeployPopup(true);
      sessionStorage.removeItem(STORAGE_KEYS.USER_ID);
    }
  }, [checkInitialDeploymentStatus, router, setCurrentUserIdState, setDisplayedUsername, setUsername, setShowDeployPopup, setDeploymentStatus, setIsDeployed, setTokenExpiryDisplay, setShowTokenExpiredPopup, setRedeployMode]);

  useEffect(() => {
    setIsClient(true);
    // Simulate new features being added after a delay
    const timer = setTimeout(() => {
      setShowNotificationBell(true);
      setNewFeaturesMessage('Exciting new features have been added! Check them out now!');
    }, 5000); // Show notification after 5 seconds for demonstration

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isClient || !username) return;

    const userSpecificKey = `${STORAGE_KEYS.FORMS_DATA}_${username}`;
    const savedData = localStorage.getItem(userSpecificKey);
    if (savedData) {
      try {
        const parsedData = JSON.parse(savedData);
        setFormData1(prev => ({ ...prev, ...(parsedData.formData1 || getInitialFormData()) }));
        setFormData2(prev => ({ ...prev, ...(parsedData.formData2 || getInitialFormData()) }));
        setFormData3(prev => ({ ...prev, ...(parsedData.formData3 || getInitialFormData()) }));
        setFormData4(prev => ({ ...prev, ...(parsedData.formData4 || getInitialFormData()) }));
        setFormData5(prev => ({ ...prev, ...(parsedData.formData5 || getInitialFormData()) }));
      } catch (e) {
        console.error("Failed to parse form data from local storage", e);
        // On error, reset to initial state to prevent issues
        setFormData1(getInitialFormData());
        setFormData2(getInitialFormData());
        setFormData3(getInitialFormData());
        setFormData4(getInitialFormData());
        setFormData5(getInitialFormData());
      }
    } else {
      // If no saved data for this user, ensure forms are reset to initial state
      setFormData1(getInitialFormData());
      setFormData2(getInitialFormData());
      setFormData3(getInitialFormData());
      setFormData4(getInitialFormData());
      setFormData5(getInitialFormData());
    }
  }, [isClient, username]); // Depend on isClient and username

  useEffect(() => {
    if (!isClient) return;
    let supabaseInstance: SupabaseClient | null = null;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (supabaseUrl && supabaseAnonKey) supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
    else {
      console.error('Database URL or Anon Key not configured.');
      return;
    }

    fetchSessionDetails();
    const channel = supabaseInstance.channel('session_updates');
    channel
      .on('broadcast', { event: 'session_terminated' }, (message) => {
        console.log('[GalaxyForm] Received broadcast (masked).');
        const storedUserId = sessionStorage.getItem(STORAGE_KEYS.USER_ID);
        console.log('[GalaxyForm] Stored UserId (masked).');
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
      .on('broadcast', { event: 'token_expired' }, async (message) => {
        console.log('[GalaxyForm] Received token_expired broadcast (masked).');
        const storedUserId = sessionStorage.getItem(STORAGE_KEYS.USER_ID);
        if (message.payload && message.payload.userId && storedUserId && message.payload.userId.toString() === storedUserId) {
          console.log('[GalaxyForm] Token expired for current user. Showing token expired popup.');
          setShowTokenExpiredPopup(true);
          setIsDeployed(false);
          setRedeployMode(true);
          setShowDeployPopup(true);
          setDeploymentStatus('Your token has expired. Please renew it by reaching out to the Owner on Discord GalaxyKickLock.');

          try {
            await handleUndeploy();
          } catch (undeployError) {
            console.error('Error during undeploy triggered by token_expired (masked).');
          }
          await handleLogout();
        }
      })
      .subscribe(status => {
        console.log('[GalaxyForm] Channel status:', status);
      });
    const beforeUnloadHandler = () => {
      const storedUser = sessionStorage.getItem(STORAGE_KEYS.USERNAME);
      if (storedUser && navigator.sendBeacon) navigator.sendBeacon('/api/auth/beacon-signout-undeploy', new Blob([JSON.stringify({})], {type : 'application/json'}));
    };
    window.addEventListener('beforeunload', beforeUnloadHandler);
    return () => {
      if (channel) supabaseInstance?.removeChannel(channel).catch(err => console.error("Error removing channel (masked).", err));
      if (activationProgressTimerId !== null) window.clearInterval(activationProgressTimerId);
      window.removeEventListener('beforeunload', beforeUnloadHandler);
    };
  }, [isClient, fetchSessionDetails, activationProgressTimerId, setShowTokenExpiredPopup, setIsDeployed, setRedeployMode, setShowDeployPopup, setDeploymentStatus]);

  const pollRunStatus = useCallback((runIdToPoll: number) => {
    setDeploymentStatus(`Monitoring run ID: ${runIdToPoll}. Waiting for status updates...`);
    setLoadingBarProgress(40); // Update progress
    const pollingTimeout = 3 * 60 * 1000;
    const pollIntervalTime = 10 * 1000;
    const statusPollStartTime = Date.now();
    const authHeaders = getApiAuthHeaders();
    const performStatusPoll = async () => {
      if (Date.now() - statusPollStartTime > pollingTimeout) {
        if (statusPollTimerRef.current !== null) window.clearInterval(statusPollTimerRef.current);
        statusPollTimerRef.current = null;
        setDeploymentStatus('Deployment timed out while waiting for "in_progress" status. Please try again.');
        setIsDeployed(false);
        setIsPollingStatus(false);
        setRedeployMode(true);
        setShowLoadingBar(false); // Hide on timeout
        return;
      }
      try {
        const runStatusResponse = await fetch(`/git/galaxyapi/runs?runId=${runIdToPoll}`, { headers: authHeaders });
        if (!runStatusResponse.ok) {
          if (statusPollTimerRef.current !== null) window.clearInterval(statusPollTimerRef.current);
          statusPollTimerRef.current = null;
          setDeploymentStatus(`Failed to fetch deployment status from backend. ${await runStatusResponse.text()}`);
          setIsPollingStatus(false);
          setIsDeployed(false);
          setRedeployMode(true);
          setShowLoadingBar(false); // Hide on error
          return;
        }
        const runDetails = await runStatusResponse.json();
        if (runDetails.status === 'in_progress') {
          if (statusPollTimerRef.current !== null) window.clearInterval(statusPollTimerRef.current);
          statusPollTimerRef.current = null;
          setIsDeployed(true);
          setRedeployMode(false);
          setLoadingBarProgress(70); // Update progress
          try {
            const setActiveRunResponse = await fetch('/api/auth/set-active-run', {
              method: 'POST',
              headers: getApiAuthHeaders(),
              body: JSON.stringify({ runId: runIdToPoll }),
            });
            if (!setActiveRunResponse.ok) console.error('Failed to set active run ID via API:', (await setActiveRunResponse.json().catch(() => ({}))).message || setActiveRunResponse.statusText);
            else console.log(`Successfully notified server of active run ID: ${runIdToPoll}`);
          } catch (apiError) {
            console.error('Error calling /api/auth/set-active-run:', apiError);
          }
          setDeploymentStatus('Finalizing KickLock activation...');
          setIsPollingStatus(true);
          setActivationProgressPercent(0);
          let currentProgress = 0;
          const totalDuration = 30;
          const newActivationTimerId = window.setInterval(() => {
            currentProgress += 1;
            const percent = Math.min(100, (currentProgress / totalDuration) * 100);
            setActivationProgressPercent(percent);
            setLoadingBarProgress(70 + (percent * 0.3)); // Progress from 70 to 100
            if (currentProgress >= totalDuration) {
              window.clearInterval(newActivationTimerId);
              setActivationProgressTimerId(null);
              setShowDeployPopup(false);
              setIsPollingStatus(false);
              setActivationProgressPercent(100);
              setDeploymentStatus('KickLock activated successfully!');
              setShowLoadingBar(false); // Hide on completion
              setLoadingBarProgress(100); // Ensure 100%
            }
          }, 1000);
          setActivationProgressTimerId(newActivationTimerId);
        } else {
          if (statusPollTimerRef.current !== null) window.clearInterval(statusPollTimerRef.current);
          statusPollTimerRef.current = null;
          setDeploymentStatus(`Workflow status: ${runDetails.status} (Conclusion: ${runDetails.conclusion || 'N/A'}). Redeploy if needed.`);
          setIsDeployed(false);
          setIsPollingStatus(false);
          setRedeployMode(true);
          setShowLoadingBar(false); // Hide if not in_progress
        }
      } catch (pollError) {
        if (statusPollTimerRef.current !== null) window.clearInterval(statusPollTimerRef.current);
        statusPollTimerRef.current = null;
        setDeploymentStatus('Error polling deployment status. Please try again.');
        setIsDeployed(false);
        setIsPollingStatus(false);
        setRedeployMode(true);
        setShowLoadingBar(false); // Hide on error
      }
    };
    statusPollTimerRef.current = window.setTimeout(performStatusPoll, 0);
  }, [setDeploymentStatus, setIsDeployed, setRedeployMode, setIsPollingStatus, setActivationProgressPercent, setActivationProgressTimerId, setShowDeployPopup, setShowLoadingBar, setLoadingBarProgress]);

  const startDeploymentCheck = useCallback(async (suffixedUsernameForJobSearch: string | null) => {
    if (!suffixedUsernameForJobSearch) {
      setDeploymentStatus('Logical username (suffixed) not available for status check.');
      setIsPollingStatus(false);
      return;
    }
    if (activationProgressTimerId !== null) {
      window.clearInterval(activationProgressTimerId);
      setActivationProgressTimerId(null);
    }
    setIsPollingStatus(true);
    setRedeployMode(false);
    const jobNameToFind = `Run for ${suffixedUsernameForJobSearch}`;
    const authHeaders = getApiAuthHeaders();
    const findRunIdTimeoutDuration = 90 * 1000;
    const findRunIdInterval = 5 * 1000;
    const findRunIdStartTime = Date.now();
    const attemptToFindRunId = async () => {
      const attemptNumber = Math.floor((Date.now() - findRunIdStartTime) / findRunIdInterval) + 1;
      setDeploymentStatus(`Locating workflow run (attempt ${attemptNumber})...`);
      if (Date.now() - findRunIdStartTime > findRunIdTimeoutDuration) {
        if (findRunIdTimerRef.current !== null) window.clearInterval(findRunIdTimerRef.current);
        findRunIdTimerRef.current = null;
        setDeploymentStatus('Could not locate the triggered workflow run in time. Please try redeploying.');
        setIsPollingStatus(false);
        setRedeployMode(true);
        return;
      }
      try {
        const response = await fetch(`/api/git/latest-user-run?logicalUsername=${suffixedUsernameForJobSearch}&activeOnly=true`, { headers: authHeaders });
        if (response.ok) {
          const data = await response.json() as LatestUserRunResponse;
          if (data.runId && data.jobName === jobNameToFind) {
            if (findRunIdTimerRef.current !== null) window.clearInterval(findRunIdTimerRef.current);
            findRunIdTimerRef.current = null;
            pollRunStatus(data.runId);
          } else {
            findRunIdTimerRef.current = window.setTimeout(attemptToFindRunId, Date.now() - findRunIdStartTime <= findRunIdTimeoutDuration - findRunIdInterval ? findRunIdInterval : 1000);
          }
        } else if (response.status === 404) {
          findRunIdTimerRef.current = window.setTimeout(attemptToFindRunId, Date.now() - findRunIdStartTime <= findRunIdTimeoutDuration - findRunIdInterval ? findRunIdInterval : 1000);
        } else {
          throw new Error(`Failed to find run: ${response.status} ${(await response.json()).message || ''}`);
        }
      } catch (error) {
        if (Date.now() - findRunIdStartTime <= findRunIdTimeoutDuration - findRunIdInterval) findRunIdTimerRef.current = window.setTimeout(attemptToFindRunId, findRunIdInterval);
        else if (Date.now() - findRunIdStartTime <= findRunIdTimeoutDuration) findRunIdTimerRef.current = window.setTimeout(attemptToFindRunId, 1000);
        else {
          if (findRunIdTimerRef.current !== null) window.clearInterval(findRunIdTimerRef.current);
          findRunIdTimerRef.current = null;
          setDeploymentStatus(`An error occurred while locating the workflow run.`);
          setIsPollingStatus(false);
          setRedeployMode(true);
        }
      }
    };
    attemptToFindRunId();
  }, [activationProgressTimerId, pollRunStatus, setDeploymentStatus, setIsPollingStatus, setActivationProgressTimerId, setRedeployMode]);

  const handleDeploy = useCallback(async () => {
    clearAllPollingTimers();
    if (!username) { return; }
    if (showTokenExpiredPopup) {
      setDeploymentStatus('Cannot deploy: Your token has expired. Please renew it.');
      setShowDeployPopup(true);
      return;
    }
    if (activationProgressTimerId !== null) {
      window.clearInterval(activationProgressTimerId);
      setActivationProgressTimerId(null);
    }
    setActivationProgressPercent(0);
    setIsDeploying(true);
    setRedeployMode(false);
    setShowDeployPopup(true);
    setDeploymentStatus('Dispatching workflow...');
    setShowLoadingBar(true); // Show loading bar
    setLoadingBarProgress(0); // Reset progress
    const authHeaders = getApiAuthHeaders();
    try {
      const response = await fetch(`/git/galaxyapi/workflow-dispatch`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ username: username })
      });
      setIsDeploying(false);
      if (response.status === 204) {
        setDeploymentStatus('Waiting 10s for run to initialize...');
        setIsPollingStatus(true);
        setShowDeployPopup(true);
        setLoadingBarProgress(20); // Initial progress
        window.setTimeout(() => {
          if (username) startDeploymentCheck(username);
          else {
            setDeploymentStatus("Error: User details not loaded.");
            setIsPollingStatus(false);
            setRedeployMode(true);
            setShowLoadingBar(false); // Hide on error
          }
        }, 10000);
      } else {
        const errorData = await response.json().catch(() => ({}));
        setDeploymentStatus(`Dispatch failed: ${response.status} ${errorData.message || await response.text()}`);
        setIsDeployed(false);
        setIsPollingStatus(false);
        setRedeployMode(true);
        setShowLoadingBar(false); // Hide on error
      }
    } catch (error) {
      setIsDeploying(false);
      setDeploymentStatus(`An error occurred during deployment dispatch.`);
      setIsDeployed(false);
      setIsPollingStatus(false);
      setRedeployMode(true);
      setShowLoadingBar(false); // Hide on error
    }
  }, [username, clearAllPollingTimers, activationProgressTimerId, startDeploymentCheck, showTokenExpiredPopup, setActivationProgressTimerId, setActivationProgressPercent, setIsDeploying, setRedeployMode, setShowDeployPopup, setDeploymentStatus, setIsPollingStatus, setIsDeployed, setShowLoadingBar, setLoadingBarProgress]);

  const saveAllFormDataToLocalStorage = useCallback(() => {
    if (typeof window !== 'undefined' && username) {
      const allFormData = {
        formData1,
        formData2,
        formData3,
        formData4,
        formData5,
      };
      const userSpecificKey = `${STORAGE_KEYS.FORMS_DATA}_${username}`;
      localStorage.setItem(userSpecificKey, JSON.stringify(allFormData));
    }
  }, [formData1, formData2, formData3, formData4, formData5, username]);

  useEffect(() => {
    if (username) { // Only save if username is available
      saveAllFormDataToLocalStorage();
    }
  }, [formData1, formData2, formData3, formData4, formData5, saveAllFormDataToLocalStorage, username]);

  const handleInputChange = (formNumber: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    const setFormData = [setFormData1, setFormData2, setFormData3, setFormData4, setFormData5][formNumber - 1];
    if (type === 'checkbox') {
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else {
      const timeFields = ['startAttackTime', 'stopAttackTime', 'attackIntervalTime', 'startDefenceTime', 'stopDefenceTime', 'defenceIntervalTime'];
      const numericValue = timeFields.includes(name) ? value.replace(/\D/g, '').slice(0, 5) : value;
      setFormData(prev => ({ ...prev, [name]: numericValue }));
    }
    setToastMessage(null);
  };

  const handleAction = (formNumber: number) => async (action: ActionType) => {
    const formDataSetters = [setButtonStates1, setButtonStates2, setButtonStates3, setButtonStates4, setButtonStates5];
    const errorSetters = [setError1, setError2, setError3, setError4, setError5];
    const formDatas = [formData1, formData2, formData3, formData4, formData5];
    const setButtonStates = formDataSetters[formNumber - 1];
    const setError = errorSetters[formNumber - 1];
    const formData = formDatas[formNumber - 1];
    const requiredFields: (keyof FormData)[] = [
      'RC1',
      'RC2',
      'RC1_startAttackTime',
      'RC1_stopAttackTime',
      'RC1_attackIntervalTime',
      'RC1_startDefenceTime',
      'RC1_stopDefenceTime',
      'RC1_defenceIntervalTime',
      'RC2_startAttackTime',
      'RC2_stopAttackTime',
      'RC2_attackIntervalTime',
      'RC2_startDefenceTime',
      'RC2_stopDefenceTime',
      'RC2_defenceIntervalTime',
      'PlanetName',
      'Rival'
    ];
    const emptyFields = requiredFields.filter(field => !formData[field]);
    if (emptyFields.length > 0) {
      setError(emptyFields);
      setToastMessage(`Please fill all highlighted fields.`);
      setButtonStates(prev => ({ ...prev, [action]: { ...prev[action], loading: false, active: false, text: action } }));
      return;
    }

    if (showLoadingBar) {
      setToastMessage("Please wait until the progressing bar gets disappear.");
      setButtonStates(prev => ({ ...prev, [action]: { ...prev[action], loading: false, active: false, text: action } }));
      return;
    }

    // RC validation logic
    if (action === 'start') {
      const allRcs = new Set<string>();
      let hasDuplicate = false;
      let duplicateMessage = '';

      const allFormDatas = [formData1, formData2, formData3, formData4, formData5];

      // Check for duplicates within the current form
      if (formData.RC1 && formData.RC2 && formData.RC1 === formData.RC2) {
        setError(['RC1', 'RC2']);
        setToastMessage("Same RC should not be used, please use another RC in that appropriate field.");
        setButtonStates(prev => ({ ...prev, [action]: { ...prev[action], loading: false, active: false, text: action } }));
        return;
      }

      // Check for duplicates across all forms
      for (let i = 0; i < allFormDatas.length; i++) {
        const currentForm = allFormDatas[i];
        const currentFormNumber = i + 1;

        if (currentForm.RC1) {
          if (allRcs.has(currentForm.RC1)) {
            hasDuplicate = true;
            duplicateMessage = `RC1 value '${currentForm.RC1}' in Kick ${currentFormNumber} is already used in another form.`;
            setError(prev => [...prev, 'RC1']); // Highlight RC1 in the current form
            break;
          }
          allRcs.add(currentForm.RC1);
        }
        if (currentForm.RC2) {
          if (allRcs.has(currentForm.RC2)) {
            hasDuplicate = true;
            duplicateMessage = `RC2 value '${currentForm.RC2}' in Kick ${currentFormNumber} is already used in another form.`;
            setError(prev => [...prev, 'RC2']); // Highlight RC2 in the current form
            break;
          }
          allRcs.add(currentForm.RC2);
        }
      }

      if (hasDuplicate) {
        setToastMessage(`Same RC should not be used, please use another RC in that appropriate field. ${duplicateMessage}`);
        setButtonStates(prev => ({ ...prev, [action]: { ...prev[action], loading: false, active: false, text: action } }));
        return;
      }
    }

    setButtonStates(prev => ({ ...prev, [action]: { ...prev[action], loading: true } }));
    setError([]);
    const authHeaders = getApiAuthHeaders();
    try {
      if (!username) {
        setError(['Logical username not available.']);
        setButtonStates(prev => ({ ...prev, [action]: { ...prev[action], loading: false } }));
        return;
      }
      const modifiedFormData = Object.entries(formData).reduce((acc, [key, value]) => {
        acc[`${key}${formNumber}`] = value.toString(); // Convert all values to strings for API
        return acc;
      }, {} as Record<string, string>);
      const response = await fetch(`/api/localt/action`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ action: action, formNumber: formNumber, formData: modifiedFormData, logicalUsername: username })
      });
      if (response.ok) {
        setButtonStates(prev => ({
          ...prev,
          [action]: { loading: false, active: true, text: action === 'start' ? 'Running' : action === 'stop' ? 'Stopped' : 'Updated' },
          ...(action === 'start' ? { stop: { ...prev.stop, active: false, text: 'Stop' } } : {}),
          ...(action === 'stop' ? { start: { ...prev.start, active: false, text: 'Start' } } : {}),
          ...(action === 'update' ? { update: { loading: false, active: true, text: 'Updated' } } : {})
        }));
        setError([]);
        setToastMessage(null);
      } else if (response.status === 409) {
        const errorData = await response.json();
        if (errorData.autoUndeployed) {
          setAutoUndeployMessage(errorData.message);
          setShowAutoUndeployPopup(true);
          setIsDeployed(false);
          setRedeployMode(true);
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
    const currentFormData = [formData1, formData2, formData3, formData4, formData5][formNumber - 1];
    const currentButtonStates = [buttonStates1, buttonStates2, buttonStates3, buttonStates4, buttonStates5][formNumber - 1];
    const currentError = [error1, error2, error3, error4, error5][formNumber - 1];
    const inputFields = [
      { key: 'RC1', label: 'RC1', placeholder: 'Enter RC1', color: '#FFFF00', type: 'text' },
      { key: 'RC2', label: 'RC2', placeholder: 'Enter RC2', color: '#FFFF00', type: 'text' },
      { key: 'PlanetName', label: 'Planet Name', placeholder: 'Enter Planet', color: '#FFFFFF', type: 'text' },
      { key: 'RC1_startAttackTime', label: 'RC1 Start Attack Time', placeholder: '', color: '#FF0000', type: 'text', maxLength: 5, className: `${styles.input} ${styles.timeInput}` },
      { key: 'RC1_attackIntervalTime', label: 'RC1 Attack Interval Time', placeholder: '', color: '#FFFFFF', type: 'text', maxLength: 5, className: `${styles.input} ${styles.timeInput}` },
      { key: 'RC1_stopAttackTime', label: 'RC1 Stop Attack Time', placeholder: '', color: '#FF0000', type: 'text', maxLength: 5, className: `${styles.input} ${styles.timeInput}` },
      { key: 'RC1_startDefenceTime', label: 'RC1 Start Defence Time', placeholder: '', color: '#00FFFF', type: 'text', maxLength: 5, className: `${styles.input} ${styles.timeInput}` },
      { key: 'RC1_defenceIntervalTime', label: 'RC1 Defence Interval Time', placeholder: '', color: '#FFFFFF', type: 'text', maxLength: 5, className: `${styles.input} ${styles.timeInput}` },
      { key: 'RC1_stopDefenceTime', label: 'RC1 Stop Defence Time', placeholder: '', color: '#00FFFF', type: 'text', maxLength: 5, className: `${styles.input} ${styles.timeInput}` },
      { key: 'RC2_startAttackTime', label: 'RC2 Start Attack Time', placeholder: '', color: '#FF0000', type: 'text', maxLength: 5, className: `${styles.input} ${styles.timeInput}` },
      { key: 'RC2_attackIntervalTime', label: 'RC2 Attack Interval Time', placeholder: '', color: '#FFFFFF', type: 'text', maxLength: 5, className: `${styles.input} ${styles.timeInput}` },
      { key: 'RC2_stopAttackTime', label: 'RC2 Stop Attack Time', placeholder: '', color: '#FF0000', type: 'text', maxLength: 5, className: `${styles.input} ${styles.timeInput}` },
      { key: 'RC2_startDefenceTime', label: 'RC2 Start Defence Time', placeholder: '', color: '#00FFFF', type: 'text', maxLength: 5, className: `${styles.input} ${styles.timeInput}` },
      { key: 'RC2_defenceIntervalTime', label: 'RC2 Defence Interval Time', placeholder: '', color: '#FFFFFF', type: 'text', maxLength: 5, className: `${styles.input} ${styles.timeInput}` },
      { key: 'RC2_stopDefenceTime', label: 'RC2 Stop Defence Time', placeholder: '', color: '#00FFFF', type: 'text', maxLength: 5, className: `${styles.input} ${styles.timeInput}` },
      { key: 'Rival', label: 'Rival', placeholder: 'Enter Rival', color: '#FFA500', type: 'text' },
      { key: 'standOnEnemy', label: 'Stand On Enemy', color: '#FFFFFF', type: 'checkbox' },
      { key: 'actionOnEnemy', label: 'Action On Enemy', color: '#FFFFFF', type: 'checkbox' }
      // aiChatToggle removed from here
    ];

    return (
      <div className={styles.formContent} style={{ display: activeTab === formNumber ? 'block' : 'none' }}>
        <div className={styles.form}>
          {inputFields.map(({ key, label, color, type, maxLength, className, placeholder }) => (
            <div key={key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%' }}>
              <label style={{ color: color, marginBottom: '0.5rem', textAlign: 'left', width: '100%' }}>{label}</label>
              {type === 'checkbox' ? (
                <div
                  onClick={() => {
                    const currentValue = currentFormData[key as keyof FormData] as boolean;
                    const setFormData = [setFormData1, setFormData2, setFormData3, setFormData4, setFormData5][formNumber - 1];
                    setFormData(prev => ({ ...prev, [key]: !currentValue }));
                    setToastMessage(null);
                  }}
                  style={{
                    width: '40px',
                    height: '24px',
                    borderRadius: '12px',
                    backgroundColor: currentFormData[key as keyof FormData] ? '#e74c3c' : '#444', /* Red for active, darker grey for inactive */
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'background-color 0.2s',
                    marginTop: '5px'
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      backgroundColor: 'white',
                      top: '2px',
                      left: currentFormData[key as keyof FormData] ? '18px' : '2px',
                      transition: 'left 0.2s',
                    }}
                  />
                </div>
              ) : (
                <>
                  <input
                    type={type}
                    name={key}
                    value={currentFormData[key as keyof FormData] as string}
                    onChange={handleInputChange(formNumber)}
                    className={className || styles.input}
                    maxLength={maxLength}
                    autoComplete="off"
                    onFocus={(e) => e.target.setAttribute('autocomplete', 'off')}
                    placeholder={placeholder}
                    style={{
                      backgroundColor: '#2a2a2a',
                      border: currentError.includes(key) ? '2px solid #ff4444' : '1px solid #444',
                      color: '#fff',
                      WebkitTextFillColor: '#fff',
                      width: '100%',
                      padding: '0.5rem',
                      boxSizing: 'border-box',
                      boxShadow: currentError.includes(key) ? '0 0 5px rgba(255,0,0,0.3)' : 'none'
                    }}
                    title={currentError.includes(key) ? `${label} is required` : undefined}
                  />
                </>
              )}
            </div>
          ))}
          <div className={styles.buttonGroup}>
            <button
              type="button"
              onClick={() => handleAction(formNumber)('start')}
              className={`${styles.button} ${currentButtonStates.start.loading ? styles.loadingButton : ''} ${currentButtonStates.start.active ? styles.buttonRunning : ''}`}
              disabled={!isDeployed || isDeploying || isPollingStatus || isUndeploying || currentButtonStates.start.loading || showTokenExpiredPopup}
              style={{ backgroundColor: currentButtonStates.start.active ? '#22c55e' : '#e74c3c' }}
              data-action="start"
            >
              <Play size={16} />
              <span>Start</span>
            </button>
            <button
              type="button"
              onClick={() => handleAction(formNumber)('stop')}
              className={`${styles.button} ${currentButtonStates.stop.loading ? styles.loadingButton : ''} ${currentButtonStates.stop.active ? styles.buttonStopped : ''}`}
              disabled={!isDeployed || isDeploying || isPollingStatus || isUndeploying || currentButtonStates.stop.loading || showTokenExpiredPopup}
              style={{ backgroundColor: currentButtonStates.stop.active ? '#dc2626' : '#444' }}
              data-action="stop"
            >
              <Square size={16} />
              <span>Stop</span>
            </button>
            <button
              type="button"
              onClick={() => handleAction(formNumber)('update')}
              className={`${styles.button} ${currentButtonStates.update.loading ? styles.loadingButton : ''} ${currentButtonStates.update.active ? styles.buttonUpdated : ''}`}
              disabled={!isDeployed || isDeploying || isPollingStatus || isUndeploying || currentButtonStates.update.loading || showTokenExpiredPopup}
              style={{ backgroundColor: currentButtonStates.update.active ? '#3b82f6' : '#e67e22' }}
              data-action="update"
            >
              <RefreshCw size={16} />
              <span>Update</span>
            </button>
            <button
              onClick={isDeployed ? handleUndeploy : handleDeploy}
              disabled={isDeploying || isPollingStatus || showTokenExpiredPopup || (isDeployed && isUndeploying)}
              className={`${styles.button}`}
              style={{ minWidth: '120px', backgroundColor: isDeployed ? '#22c55e' : '#e74c3c', border: 'none' }}
              data-action={isDeployed ? "deployed" : "deploy"}
            >
              {isDeployed ? (
                isUndeploying ? (
                  <>
                    <RefreshCw size={16} />
                    <span>Undeploying...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle size={16} />
                    <span>Deployed</span>
                  </>
                )
              ) : (
                <>
                  <RefreshCw size={16} />
                  <span>Deploy</span>
                </>
              )}
            </button>
            <button
              onClick={() => {
                const setFormData = [setFormData1, setFormData2, setFormData3, setFormData4, setFormData5][formNumber - 1];
                setFormData(prev => ({ ...prev, aiChatToggle: !prev.aiChatToggle }));
              }}
              className={`${styles.button}`}
              style={{ 
                backgroundColor: currentFormData.aiChatToggle ? '#22c55e' : '#e74c3c',
                minWidth: '120px'
              }}
              data-action="ai-chat"
            >
              <MessageSquare size={16} />
              <span>AI Chat {currentFormData.aiChatToggle ? 'On' : 'Off'}</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={styles.container}>
      {toastMessage && (
        <div className={styles.toastMessage}>
          <span>{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className={styles.toastCloseButton}>
            <X size={20} />
          </button>
        </div>
      )}
      <div className={styles.header}>
        <div>
          {displayedUsername && (
            <>
              <button
                onClick={() => setShowProfilePopup(true)}
                className={styles.profileButton}
                aria-label="User Profile"
              >
                <UserCircle size={24} />
              </button>
              <span className={styles.usernameDisplay}>{displayedUsername}</span>
            </>
          )}
        </div>
        <h1 className={styles.title}>
          <span className={styles.kickLock}>KICK ~ LOCK</span>
        </h1>
        <div>
          <button
            onClick={() => setShowNewFeaturesPopup(true)}
            className={styles.headerButton}
            aria-label="New Features"
          >
            <span className={`${styles.notificationBell} ${showNotificationBell ? styles.blinkingBell : ''}`}>
              <Bell size={16} />
              {showNotificationBell && (
                <span style={{ 
                  position: 'absolute', 
                  top: '0', 
                  right: '0', 
                  backgroundColor: 'red', 
                  borderRadius: '50%', 
                  width: '8px', 
                  height: '8px',
                  pointerEvents: 'none'
                }} />
              )}
            </span>
          </button>
          <button
            onClick={() => {
              setShowDiscordQrNotification(true);
              setDiscordQrMessage("Scan this QR code to connect with GalaxyKickLock on Discord!");
              setTimeout(() => {
                setShowDiscordQrNotification(false);
                setDiscordQrMessage('');
              }, 7000); // Hide after 7 seconds
            }}
            className={styles.headerButton}
            aria-label="Reach out on Discord"
          >
            <MessageSquare size={16} />
          </button>
          <button onClick={handleLogout} className={`${styles.button} ${styles.logoutButton}`}>
            <LogOut size={16} />
            <span>Logout</span>
          </button>
        </div>
        {showLoadingBar && (
          <div className={styles.headerBottomLoadingBarContainer}>
            <div className={styles.loadingBar} style={{ width: `${loadingBarProgress}%` }} />
          </div>
        )}
      </div>
      <div className={styles.mainContent}>
        <div className={styles.formContainer}>
          <div className={styles.tabsContainer}>
            {[1, 2, 3, 4, 5].map(num => (
              <button
                key={num}
                className={`${styles.tabButton} ${activeTab === num ? styles.activeTab : ''}`}
                onClick={() => setActiveTab(num)}
              >
                {formNames[num as keyof typeof formNames]}
              </button>
            ))}
          </div>
          {renderForm(1)}
          {renderForm(2)}
          {renderForm(3)}
          {renderForm(4)}
          {renderForm(5)}
        </div>
      </div>
      {showDeployPopup && (
        <div className={styles.popupOverlay}>
          <div className={styles.popupContent}>
            <h2 className={styles.popupTitle}>
              {isDeployed && isPollingStatus && activationProgressTimerId !== null
                ? 'Activating KickLock'
                : (isDeployed && !redeployMode && !isPollingStatus)
                ? 'KickLock Active'
                : 'Deploy KickLock'}
            </h2>
            <p className={styles.popupMessage}>
              {deploymentStatus}
            </p>
            {isDeployed && isPollingStatus && activationProgressTimerId !== null && (
              <div className={styles.progressBarContainer}>
                <div className={styles.progressBar} style={{ width: `${activationProgressPercent}%` }} />
              </div>
            )}
            <div className={styles.popupActions}>
              {redeployMode && !isDeploying && !isPollingStatus ? (
                <button
                  onClick={handleDeploy}
                  disabled={isDeploying || isPollingStatus || showTokenExpiredPopup}
                  className={styles.popupActionButton}
                  style={{ backgroundColor: (isDeploying || isPollingStatus || showTokenExpiredPopup) ? '#555' : '#e67e22' }}
                >
                  Redeploy Again
                </button>
              ) : (isDeployed && !redeployMode && !isPollingStatus && activationProgressTimerId === null) ? (
                <p className={styles.activeDeploymentText}>Deployment is active!</p>
              ) : null}
            </div>
            {(!isDeploying && activationProgressTimerId === null && !showTokenExpiredPopup) && (
              <button onClick={() => setShowDeployPopup(false)} className={styles.popupCloseButton}>
                Close
              </button>
            )}
          </div>
        </div>
      )}
      {showThankYouMessage && (
        <div className={styles.popupOverlay}>
          <div className={styles.popupContent}>
            <h2 className={styles.popupTitle}>
              Thank You for using KickLock
            </h2>
            <div className={styles.popupActions}>
              <button
                onClick={async () => {
                  setShowThankYouMessage(false);
                  await handleDeploy();
                }}
                className={styles.popupActionButton}
                style={{ backgroundColor: '#d32f2f' }}
              >
                Deploy Again
              </button>
            </div>
          </div>
        </div>
      )}
      {showAutoUndeployPopup && autoUndeployMessage && (
        <div className={styles.popupOverlay}>
          <div className={styles.popupContent} style={{ width: '400px' }}>
            <h2 className={styles.popupTitle} style={{ color: '#f39c12' }}>
              Session Expired
            </h2>
            <p className={styles.popupMessage}>
              {autoUndeployMessage}
            </p>
            <div className={styles.popupActions} style={{ justifyContent: 'space-around', gap: '15px' }}>
              <button
                onClick={() => {
                  setShowAutoUndeployPopup(false);
                  setAutoUndeployMessage(null);
                  setShowDeployPopup(true);
                  handleDeploy();
                }}
                className={styles.popupActionButton}
                style={{ backgroundColor: '#e67e22', flex: 1 }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#d35400'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#e67e22'}
              >
                Redeploy KickLock
              </button>
              <button
                onClick={() => {
                  setShowAutoUndeployPopup(false);
                  setAutoUndeployMessage(null);
                  setShowDeployPopup(true);
                }}
                className={styles.popupCloseButton}
                style={{ border: '1px solid #555', backgroundColor: '#444', color: '#ccc', flex: 1 }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#555'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#444'}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {showTokenExpiredPopup && (
        <div className={styles.popupOverlay}>
          <div className={styles.popupContent} style={{ width: '400px' }}>
            <h2 className={styles.popupTitle} style={{ color: '#f39c12' }}>
              Token Expired
            </h2>
            <p className={styles.popupMessage}>
              Your token has expired. Please renew it by reaching out to the Owner on Discord GalaxyKickLock.
            </p>
          </div>
        </div>
      )}
      {showNewFeaturesPopup && (
        <div className={styles.popupOverlay}>
          <div className={styles.popupContent} style={{ width: '400px' }}>
            <h2 className={styles.popupTitle} style={{ color: '#2ecc71' }}>
              New Features!
            </h2>
            <p className={styles.popupMessage}>
              {newFeaturesMessage}
            </p>
            <div className={styles.popupActions}>
              <button
                onClick={() => {
                  setShowNewFeaturesPopup(false);
                  setShowNotificationBell(false); // Turn off blinking after user sees
                }}
                className={styles.popupCloseButton}
                style={{ border: '1px solid #555', backgroundColor: '#444', color: '#ccc', flex: 1 }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#555'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#444'}
              >
                Got it!
              </button>
            </div>
          </div>
        </div>
      )}
      {showProfilePopup && (
        <div className={styles.popupOverlay}>
          <div className={styles.popupContent} style={{ width: '300px' }}>
            <h2 className={styles.popupTitle} style={{ color: '#00FFFF' }}>
              Profile Details
            </h2>
            <p className={styles.popupMessage}>
              {tokenExpiryDisplay ? `Token Expires: ${tokenExpiryDisplay}` : 'Token expiry details not available.'}
            </p>
            <div className={styles.popupActions}>
              <button
                onClick={() => setShowProfilePopup(false)}
                className={styles.popupCloseButton}
                style={{ border: '1px solid #555', backgroundColor: '#444', color: '#ccc', flex: 1 }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#555'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#444'}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {showDiscordQrNotification && (
        <div className={styles.toastMessage} style={{ bottom: '20px', right: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '15px', backgroundColor: '#2c3e50', border: '1px solid #34495e', borderRadius: '8px', boxShadow: '0 4px 8px rgba(0,0,0,0.2)', maxWidth: '250px' }}>
          <img src="/images/discord_qr.png" alt="Discord QR Code" style={{ width: '150px', height: '150px', marginBottom: '10px' }} />
          <span style={{ color: '#fff', textAlign: 'center', fontSize: '0.9em' }}>{discordQrMessage}</span>
          <button onClick={() => setShowDiscordQrNotification(false)} className={styles.toastCloseButton} style={{ position: 'absolute', top: '5px', right: '5px' }}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
};
export default GalaxyForm;

