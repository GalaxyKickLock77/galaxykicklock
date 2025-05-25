"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// SECURITY FIX: Removed client-side Supabase initialization
// All authentication is now handled server-side via secure HTTP-only cookies

export default function SignInPage() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const showToast = (message: string, type: 'success' | 'error' | 'info' = 'error') => {
        toast[type](message, {
            position: "top-right",
            autoClose: type === 'info' ? 7000 : 3000,
            hideProgressBar: false,
            closeOnClick: true,
            pauseOnHover: true,
            draggable: true,
            theme: "dark"
        });
    };

    const validateInputs = () => {
        if (!username.trim() || !password.trim()) {
            showToast("Username and password are required");
            return false;
        }
        if (password.length < 8) {
            showToast("Password must be at least 8 characters");
            return false;
        }
        return true;
    };

    const completeLoginFlow = () => {
        router.push("/profile?username=" + encodeURIComponent(username));
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (isLoading) return;
        
        setIsLoading(true);
        let longLoginTimerId: NodeJS.Timeout | null = null;

        // Set a timer to show a more specific message if login takes too long
        longLoginTimerId = setTimeout(() => {
            showToast("Finalizing previous session, this may take a bit longer. Please wait...", 'info');
        }, 7000);

        try {
            if (!validateInputs()) {
                if (longLoginTimerId) clearTimeout(longLoginTimerId);
                setIsLoading(false);
                return;
            }

            // SECURITY FIX: Added CSRF protection and secure headers
            const response = await fetch('/api/auth/signin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest', // CSRF protection
                },
                credentials: 'same-origin', // Ensure cookies are sent
                body: JSON.stringify({ username, password }),
            });
            
            if (longLoginTimerId) clearTimeout(longLoginTimerId);

            const data = await response.json();

            if (response.ok) {
                // SECURITY FIX: No longer storing session data in client-side storage
                // Session is managed via secure HTTP-only cookies
                showToast(data.message || "Successfully signed in!", 'success');
                setTimeout(() => {
                    completeLoginFlow(); 
                }, 1000);
            } else {
                if (response.status === 409) {
                    showToast(data.message || "Previous session cleanup encountered an issue. Please try signing in again.", 'error');
                } else {
                    showToast(data.message || "Sign in failed. Please try again.", 'error');
                }
            }
        } catch (error) {
            if (longLoginTimerId) clearTimeout(longLoginTimerId);
            console.error("Sign in error:", error);
            showToast("An error occurred during sign in. Please check your connection.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="welcome-container">
            <ToastContainer />
            <div className="auth-card max-w-md w-full p-8">
                <h1 className="text-center mb-8">
                    <span style={{ 
                        color: '#D32F2F',
                        fontFamily: 'Audiowide, cursive',
                        fontSize: '2rem',
                        textShadow: '0 0 10px rgba(211, 47, 47, 0.3)'
                    }}>
                        KICK ~ LOCK
                    </span>
                </h1>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="form-group">
                        <label className="block text-white text-sm font-semibold mb-2 text-left w-full">
                            Username
                        </label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="input-field"
                            placeholder="Enter username"
                            disabled={isLoading}
                            autoComplete="username"
                            maxLength={50}
                        />
                    </div>

                    <div className="form-group">
                        <label className="block text-white text-sm font-semibold mb-2 text-left w-full">
                            Password
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="input-field"
                            placeholder="Enter password"
                            disabled={isLoading}
                            autoComplete="current-password"
                            maxLength={128}
                        />
                    </div>

                    <button
                        type="submit"
                        className="welcome-button w-full mt-6"
                        disabled={isLoading}
                    >
                        {isLoading ? "Signing in..." : "Sign In"}
                    </button>
                </form>

                <div className="mt-6 text-center">
                    <Link href="/signup" className="text-primary-color hover:text-secondary-color transition-colors">
                        Don't have an account? Sign up
                    </Link>
                </div>
            </div>
        </div>
    );
}
