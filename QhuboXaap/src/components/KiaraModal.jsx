import React from 'react';
import './kiaraModal.css';

const KiaraModal = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <div className="kiara-modal-overlay" onClick={onClose}>
            <div className="kiara-modal-content" onClick={(e) => e.stopPropagation()}>
                <button className="kiara-close-btn" onClick={onClose}>×</button>
                <iframe
                    title="Kiara"
                    className="kiara-iframe"
                    src="KIARA.html"
                    allow="autoplay; fullscreen"
                />
            </div>
        </div>
    );
};

export default KiaraModal;