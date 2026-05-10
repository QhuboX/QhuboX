import React from 'react';
import './ChatList.css';

const ChatList = ({ chats, onSelectChat, contacts, onDeleteChat }) => {
    
    // Función para truncar direcciones de wallet
    const truncateAddress = (address) => {
        if (!address) return '';
        const start = address.substring(0, 4);
        const end = address.substring(address.length - 4);
        return `${start}...${end}`;
    };

    // Función para obtener el nombre del contacto o la wallet truncada
    const getContactNameByAddress = (address) => {
        const contact = contacts.find(c => c.address === address);
        return contact ? contact.name : truncateAddress(address);
    };

    // Función para obtener el texto del último mensaje
    const getLatestMessage = (address) => {
        const chatMessages = chats[address];
        if (chatMessages && chatMessages.length > 0) {
            const lastMessage = chatMessages[chatMessages.length - 1];
            return lastMessage.text;
        }
        return 'No messages.'; 
    };

    // Preparamos la lista de conversaciones mapeando el objeto chats
    const conversationList = Object.keys(chats).map(address => {
        return {
            address: address,
            name: getContactNameByAddress(address),
            lastMessage: getLatestMessage(address)
        };
    });

    return (
        <div className="chat-list-container">
            <h2 className="chat-list-title">Cypher Chats</h2>
            <div className="chat-list-content">
                {conversationList.length === 0 ? (
                    <p className="no-chats-message">No active conversations.</p>
                ) : (
                    conversationList.map(conversation => (
                        <div
                            key={conversation.address}
                            className="chat-item"
                            onClick={() => onSelectChat(conversation.address, conversation.name)}
                        >
                            <div className="chat-info">
                                <h4 className="chat-name">{conversation.name}</h4>
                                <p className="last-message">{conversation.lastMessage}</p>
                            </div>

                           
                            <button 
                                className="delete-chat-btn" 
                                onClick={(e) => onDeleteChat(conversation.address, e)}
                                title="Eliminar conversación"
                            >
                                ✕
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default ChatList;