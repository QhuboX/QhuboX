import React from 'react';
import vaultsLogo from './media/vaults.png';
import WalletConnect from './WalletConnect.jsx';
import './Header.css';

const Header = ({ onOpenWallet, onGoToContacts, onOpenRecovery, connectedAddress }) => {
    return (
        <header className="header-container">
            <div className="header-left">
                <div className="app-logo">
                    <img src={vaultsLogo} alt="Logo" />
                    <h1>Qhubox</h1>
                </div>
            </div>
            
            
<div className="header-right">
                {/* BOTÓN CONTACTOS */}
                <button className="wallet-button" onClick={onGoToContacts} title="Contacts">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                        <circle cx="9" cy="7" r="4"></circle>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                </button>

                {/* BOTÓN RECUPERAR */}
                <button 
                    className="wallet-button" 
                    onClick={onOpenRecovery} 
                    title="Import Wallet"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                        <circle cx="12" cy="16" r="1"></circle>
                    </svg>
                </button>

                {/* WALLET CONNECT LOGO */}
                <WalletConnect 
                    onConnect={onOpenWallet} 
                    connectedAddress={connectedAddress} 
                />
            </div>
        </header>
    );
};

export default Header;







