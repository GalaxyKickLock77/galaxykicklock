"use client";

import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "react-toastify";
import { createClient } from '@supabase/supabase-js'; // Import Supabase client

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [showAdminBlockPopup, setShowAdminBlockPopup] = useState(false);
  const [isDeployed, setIsDeployed] = useState(false);
  const router = useRouter();

  // Function to fetch session details and update isDeployed state
  const fetchDeploymentStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/session-details');
      if (response.ok) {
        const details = await response.json();
        // Assuming session-details returns a flag like 'isDeployed' or similar
        // Or, infer from deployTimestamp and activeFormNumber
        if (details.deployTimestamp && details.activeFormNumber) {
          setIsDeployed(true);
        } else {
          setIsDeployed(false);
        }
      } else {
        console.warn('Failed to fetch session details for deployment status:', await response.text());
        setIsDeployed(false);
      }
    } catch (error) {
      console.error('Error fetching deployment status:', error);
      setIsDeployed(false);
    }
  }, []);

  const handleStaleSession = useCallback(async (reason: 'admin_removed_token' | 'token_expired' | 'session_terminated' | 'new_session_opened_elsewhere') => {
    let message = '';
    let redirectDelay = 5000; // Default delay

    switch (reason) {
      case 'admin_removed_token':
        message = "Admin has blocked or removed your token. Please renew the token to login the application.";
        setShowAdminBlockPopup(true); // Use this for admin block message
        break;
      case 'token_expired':
        message = "Your token has expired. Please renew the token to login the application.";
        setShowAdminBlockPopup(true); // Use this for token expired message
        break;
      case 'new_session_opened_elsewhere': // Handle this specific reason directly
        message = "A new session has been opened in another tab/browser. You have been logged out from this session.";
        redirectDelay = 3500;
        setShowAdminBlockPopup(false);
        break;
      case 'session_terminated': // Generic session termination
      default:
        message = "Your session has been terminated. You will be redirected to the sign-in page shortly.";
        setShowAdminBlockPopup(false);
        redirectDelay = 1000;
        break;
    }

    toast.dismiss(); // Dismiss any existing toasts
    toast.info(message, {
      position: "top-right",
      autoClose: redirectDelay - 500, // Close toast slightly before redirect
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      theme: "dark"
    });

    console.log(`[Layout] Session stale reason: ${reason}. Redirecting...`);
    setTimeout(() => {
      setShowAdminBlockPopup(false); // Hide popup after delay
      router.push("/signin");
    }, redirectDelay);
  }, [router]);


  const pathname = usePathname();

  // Store the current tab's session ID in localStorage for cross-tab communication
  // This is updated whenever session details are fetched, making the current tab primary.
  const updateCurrentTabSessionId = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/session-details');
      if (response.ok) {
        const details = await response.json();
        if (details.sessionId) {
          localStorage.setItem('currentTabSessionId', details.sessionId);
          console.log(`[Layout] Current tab's session ID set in localStorage: ${details.sessionId}`);
        }
      } else {
        console.warn('Failed to fetch session details to set currentTabSessionId:', await response.text());
      }
    } catch (error) {
      console.error('Error fetching session details to set currentTabSessionId:', error);
    }
  }, []);

  useEffect(() => {
    // Only fetch deployment status if not on the sign-in or sign-up page
    if (pathname !== '/signin' && pathname !== '/signup') {
      fetchDeploymentStatus();
    }

    // Initialize Supabase client for client-side real-time updates
    // Only subscribe to session updates if not on an admin page
    if (supabaseUrl && supabaseAnonKey && !pathname.startsWith('/admin')) {
      const supabaseClient = createClient(supabaseUrl, supabaseAnonKey); // Renamed to avoid conflict
      const sessionChannel = supabaseClient.channel('session_updates'); // Renamed channel variable

      sessionChannel.on(
        'broadcast',
        { event: 'token_expired' },
        (payload) => {
          console.log('[Layout] Received token_expired broadcast:', payload);
          handleStaleSession(payload.payload.reason); // Pass the reason from the payload
        }
      ).on(
        'broadcast',
        { event: 'session_terminated' },
        (payload) => {
          console.log('[Layout] Received session_terminated broadcast:', payload);
          // Pass the reason from the payload, which could be 'new_session_opened_elsewhere'
          handleStaleSession(payload.payload.reason); 
        }
      ).subscribe();
      // Removed the 'new_session_opened' listener here as the logic is now handled by validateSession
      // which broadcasts 'session_terminated' with a specific reason.

      return () => {
        sessionChannel.unsubscribe(); // Use sessionChannel here
      };
    } else if (!pathname.startsWith('/admin')) {
      console.error('Supabase client not initialized in RootLayout due to missing env vars (NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY).');
    }
  }, [fetchDeploymentStatus, handleStaleSession, pathname]); // Removed updateCurrentTabSessionId from dependencies

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        {/* The popup is now controlled by the toast messages, but keeping this for specific admin/token messages if needed */}
        {showAdminBlockPopup && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
            <div className="bg-red-600 text-white p-8 rounded-lg shadow-xl text-center">
              <h2 className="text-2xl font-bold mb-4">Session Expired / Blocked</h2>
              <p className="text-lg">
                Your session has ended. You will be redirected to the sign-in page.
              </p>
              <p className="text-sm mt-2">
                Please renew your token to log in.
              </p>
            </div>
          </div>
        )}
        <footer className="app-footer">
          © {new Date().getFullYear()} | Created by THALA
        </footer>
      </body>
    </html>
  );
}
