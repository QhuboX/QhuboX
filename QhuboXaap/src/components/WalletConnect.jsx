import React from 'react';
import './WalletConnect.css';

const WalletConnect = ({ onConnect, connectedAddress }) => {
    return (
        <button 
            className={`wallet-minimal-btn ${connectedAddress ? 'is-connected' : ''}`} 
            onClick={onConnect}
        >
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="1.5" fill="none">
                <path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4" />
                <path d="M4 6v12c0 1.1.9 2 2 2h14v-4" />
                <path d="M18 12a2 2 0 0 0-2 2c0 1.1.9 2 2 2h4v-4h-4z" />
            </svg>
            {connectedAddress && <div className="status-glow"></div>}
        </button>
    );
};

export default WalletConnect;