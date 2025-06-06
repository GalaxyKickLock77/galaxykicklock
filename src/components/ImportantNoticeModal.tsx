"use client";

import React from 'react';

interface ImportantNoticeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
}

const ImportantNoticeModal: React.FC<ImportantNoticeModalProps> = ({ isOpen, onClose, onConfirm }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 border border-red-500">
                <h2 className="text-2xl font-bold text-red-500 mb-4 text-center">Important Notice: Kick Lock – Rules and Regulations</h2>
                <div className="text-gray-300 text-sm leading-relaxed space-y-3">
                    <p>1. <strong>Purpose</strong>: This application is primarily used for automatically imprisoning Galaxy users located on low-security planets.</p>
                    <p>2. <strong>Deployment & Usage</strong>: Deploy via the <strong>Deploy</strong> button. Ensure all required fields are filled before clicking <strong>Start</strong>. Always click <strong>Update</strong> to save changes.</p>
                    <p>3. <strong>RC Configuration & AI Chat</strong>: RC settings define kick intervals. An AI chat toggle enables human-like conversation.</p>
                    <p>4. <strong>Session & Token Management</strong>: Sessions auto-undeploy after one hour; redeploy as needed. Contact <strong>GalaxyKickLock</strong> for token renewal upon expiry.</p>
                    <p>5. <strong>Conduct & Abuse Policy</strong>: Automated abuse monitoring is active; misuse results in a <strong>permanent ban</strong> with <strong>no FCB refunds</strong>. Disrespectful behavior towards <strong>GalaxyKickLock (Discord)</strong> or the <strong>application owner</strong> will lead to a <strong>permanent block</strong> and <strong>no FCB refund</strong>. Maintain respectful communication.</p>
                </div>
                <div className="flex justify-center mt-6">
                    <button
                        onClick={onConfirm}
                        className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-lg transition duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50"
                    >
                        I Understand and Agree
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ImportantNoticeModal;