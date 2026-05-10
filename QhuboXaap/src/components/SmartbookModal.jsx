import React from 'react';
import './SmartbookModal.css';

const SmartbookModal = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <div className="smartbook-modal-overlay" onClick={onClose}>
            <div className="smartbook-modal-content" onClick={(e) => e.stopPropagation()}>
                <button className="smartbook-close-btn" onClick={onClose}>×</button>
                <iframe
                    src="http://localhost:5174"
                    className="smartbook-iframe"
                    title="Smartbook"
                ></iframe>
            </div>
        </div>
    );
};

export default SmartbookModal;