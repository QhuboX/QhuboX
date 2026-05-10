import React from 'react';
import './SirisModal.css';

const SirisModal = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <div className="siris-modal-overlay" onClick={onClose}>
            <div className="siris-modal-content" onClick={(e) => e.stopPropagation()}>
                <button className="siris-close-btn" onClick={onClose}>×</button>
                <iframe
                    title="SiriS"
                    className="siris-iframe"
                    src="/Siris/siris.html"
                    allow="autoplay"
                />
            </div>
        </div>
    );
};

export default SirisModal;
