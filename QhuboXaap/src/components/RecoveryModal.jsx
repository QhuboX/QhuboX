import React, { useState } from 'react';
import { TOTP } from '@otplib/totp';
import './RecoveryModal.css';

const authenticator = new TOTP();
/**
 * RecoveryModal — verifica PIN + 2FA contra los valores guardados en localStorage.
 * Si ambos son correctos, llama onVerify() para restaurar el acceso.
 */
const RecoveryModal = ({ onClose, onVerify }) => {
    const [securityCode, setSecurityCode] = useState('');
    const [gAuthToken,   setGAuthToken]   = useState('');
    const [error,        setError]        = useState('');
    const [isVerifying,  setIsVerifying]  = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsVerifying(true);

        const storedPin    = localStorage.getItem('wallet_pin');
        const storedSecret = localStorage.getItem('wallet_2fa_secret');

        // PIN check
        if (storedPin && securityCode !== storedPin) {
            setError('❌ Incorrect security code. Access denied.');
            setIsVerifying(false);
            return;
        }

        // 2FA check
        if (storedSecret) {
            const cleanToken = gAuthToken.replace(/\s/g, '');
            if (!cleanToken || !authenticator.verifySync(cleanToken, storedSecret)) {
                setError('❌ Invalid 2FA code. Please try again.');
                setIsVerifying(false);
                return;
            }
        }

        // Both passed — small delay for UX
        await new Promise(r => setTimeout(r, 400));
        setIsVerifying(false);
        onVerify(securityCode, gAuthToken);
    };

    return (
        <div className="modal-overlay">
            <div className="recovery-card">
                <div className="recovery-header">
                    <h2>Recover Access</h2>
                    <button className="close-btn" onClick={onClose}>&times;</button>
                </div>

                <p className="recovery-desc">
                    Enter your <strong>Withdrawal PIN</strong> and <strong>2FA code</strong> to restore wallet access.
                </p>

                <form onSubmit={handleSubmit} className="recovery-form">
                    <div className="input-group">
                        <label>Withdrawal PIN</label>
                        <input
                            type="password"
                            placeholder="••••••"
                            value={securityCode}
                            onChange={e => { setSecurityCode(e.target.value.replace(/\D/g, '')); setError(''); }}
                            maxLength={6}
                            required
                        />
                    </div>

                    <div className="input-group">
                        <label>Google Authenticator Code</label>
                        <input
                            type="text"
                            placeholder="000000"
                            maxLength={6}
                            value={gAuthToken}
                            onChange={e => { setGAuthToken(e.target.value.replace(/\D/g, '')); setError(''); }}
                            style={{ textAlign: 'center', letterSpacing: '6px', fontSize: '1.1rem' }}
                            required
                        />
                    </div>

                    {error && (
                        <p style={{ color: '#ff4d4d', fontSize: '0.78rem', textAlign: 'center', margin: '-4px 0 0', padding: '8px 12px', background: 'rgba(255,77,77,0.08)', borderRadius: 8 }}>
                            {error}
                        </p>
                    )}

                    <button type="submit" className="verify-btn" disabled={isVerifying}>
                        {isVerifying ? '⏳ Verifying...' : '🔓 Verify and Restore'}
                    </button>
                </form>

                <p style={{ textAlign: 'center', fontSize: '0.65rem', color: '#333', marginTop: 12 }}>
                    This uses your configured PIN + 2FA — no seed phrase needed.
                </p>
            </div>
        </div>
    );
};

export default RecoveryModal;
