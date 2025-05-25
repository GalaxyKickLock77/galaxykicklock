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

  const handleStaleSession = useCallback(async (reason: 'admin_removed_token' | 'token_expired' | 'session_terminated') => {
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
      case 'session_terminated':
      default:
        message = "Your session has been terminated. You will be redirected to the sign-in page shortly.";
        setShowAdminBlockPopup(false); // Don't show specific popup for generic termination
        redirectDelay = 1000; // Faster redirect for generic termination
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

  useEffect(() => {
    // Only fetch deployment status if not on the sign-in or sign-up page
    if (pathname !== '/signin' && pathname !== '/signup') {
      fetchDeploymentStatus();
    }

    // Initialize Supabase client for client-side real-time updates
    if (supabaseUrl && supabaseAnonKey) {
      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      const channel = supabase.channel('session_updates');

      channel.on(
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
          handleStaleSession('session_terminated'); // Generic session termination
        }
      ).subscribe();

      return () => {
        channel.unsubscribe();
      };
    } else {
      console.error('Supabase client not initialized in RootLayout due to missing env vars (NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY).');
    }
  }, [fetchDeploymentStatus, handleStaleSession, pathname]);

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
