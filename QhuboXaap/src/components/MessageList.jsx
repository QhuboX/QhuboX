import React, { useEffect, useRef } from 'react';
import './MessageList.css';

const MessageList = ({ messages }) => {
    const messagesEndRef = useRef(null);

    useEffect(() => {
        // Scrolls to the bottom of the list when messages change
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    return (
        <div className="message-list-container">
            {messages.length > 0 ? (
                messages.map((msg, index) => (
                    <div
                        key={index}
                        className={`message-bubble ${msg.type === 'sent' ? 'sent' : 'received'}`}
                    >
                        {msg.audio ? (
                            // Renders the audio player if the message has the 'audio' property
                            <div className="audio-message-content">
                                <p>{msg.text}</p> {/* Displays the text "🔊 Voice Message" */}
                                <audio controls src={msg.audio} />
                            </div>
                        ) : (
                            // Renders only the text if it is not an audio message
                            <p>{msg.text}</p>
                        )}
                    </div>
                ))
            ) : (
                <div className="empty-chat-message">
                    <p></p>
                </div>
            )}
            <div ref={messagesEndRef} />
        </div>
    );
};

export default MessageList;