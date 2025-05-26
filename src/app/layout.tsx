"use client";

import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "react-toastify";

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

  const handleStaleSession = useCallback(async (isAdminBlocked: boolean = false) => {
    if (isAdminBlocked) {
      setShowAdminBlockPopup(true);
      console.log('[Layout] Admin blocked: Server-side undeploy should have been triggered by admin API. Redirecting...');
      toast.dismiss();
      setTimeout(() => {
        setShowAdminBlockPopup(false);
        router.push("/signin");
      }, 5000);
    } else {
      toast.dismiss();
      router.push("/signin");
    }
  }, [router]); // Removed isDeployed from dependencies as it's no longer directly used for client-side undeploy trigger


  const pathname = usePathname();

  useEffect(() => {
    // Only fetch deployment status if not on the sign-in or sign-up page
    if (pathname !== '/signin' && pathname !== '/signup') {
      fetchDeploymentStatus();
    }

    const handleGlobalSessionTerminated = (event: Event) => {
      const customEvent = event as CustomEvent<{ isAdminBlocked: boolean }>;
      handleStaleSession(customEvent.detail.isAdminBlocked);
    };

    window.addEventListener('globalSessionTerminated', handleGlobalSessionTerminated);

    return () => {
      window.removeEventListener('globalSessionTerminated', handleGlobalSessionTerminated);
    };
  }, [fetchDeploymentStatus, handleStaleSession, pathname]);

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        {showAdminBlockPopup && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
            <div className="bg-red-600 text-white p-8 rounded-lg shadow-xl text-center">
              <h2 className="text-2xl font-bold mb-4">Session Terminated</h2>
              <p className="text-lg">
                Admin has Blocked or removed you. You will be redirected to the
                sign-in page shortly.
              </p>
              <p className="text-sm mt-2">
                Stopping and undeploying services...
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
