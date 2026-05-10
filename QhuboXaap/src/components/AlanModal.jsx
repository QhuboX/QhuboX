import React from 'react';
import './AlanModal.css';

const AlanModal = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <div className="alan-modal-overlay" onClick={onClose}>
            <div className="alan-modal-content" onClick={(e) => e.stopPropagation()}>
                <button className="alan-close-btn" onClick={onClose}>×</button>
                <iframe
                    src="http://localhost:8000"
                    className="alan-iframe"
                    title="Alan Chatbot"
                ></iframe>
            </div>
        </div>
    );
};

export default AlanModal;