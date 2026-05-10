import React from 'react';
import './Footer.css';

const Footer = ({ onOpenSiris, onOpenAlan, onOpenSmartbook, onOpenKiara }) => {
    return (
        <div className="footer-apps">
            <div className="footer-inner">
                <button type="button" className="app-button" onClick={onOpenSiris}>
                    <img src="/logos/siris-logo.png" alt="Siris" className="app-logo" />
                    <span className="app-label">sAIgnalx</span>
                </button>
                <button type="button" className="app-button" onClick={onOpenAlan}>
                    <img src="/logos/alan.png" alt="Alan" className="app-logo" />
                    <span className="app-label">Assistant</span>
                </button>
                <button type="button" className="app-button" onClick={onOpenSmartbook}>
                    <img src="/logos/Sollower.png" alt="Sollower" className="app-logo" />
                    <span className="app-label">Sollower</span>
                </button>
                <button type="button" className="app-button" onClick={onOpenKiara}>
                    <img src="/logos/kiara-logo.png" alt="Kiara" className="app-logo" />
                    <span className="app-label">Kiaraap</span>
                </button>
            </div>
        </div>
    );
};

export default Footer;

