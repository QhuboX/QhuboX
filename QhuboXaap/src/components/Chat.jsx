import React, { useState, useEffect, useRef } from 'react';
import MessageList from './MessageList';
import Footer from './Footer';
import VideoCall from './VideoCall'; // Make sure to import VideoCall
import { getSocket } from './services/webrtc';
import { sendSol } from './services/solana';
import Peer from 'simple-peer';
import './Chat.css';

const Chat = ({ walletAddress, wallet }) => {
    const [recipientAddress, setRecipientAddress] = useState('');
    const [message, setMessage] = useState('');
    const [messages, setMessages] = useState([]);
    const [solAmount, setSolAmount] = useState('');
    const [isCalling, setIsCalling] = useState(false);
    const [callerId, setCallerId] = useState('');
    const [callAccepted, setCallAccepted] = useState(false);
    const [stream, setStream] = useState();

    const localVideoRef = useRef();
    const remoteVideoRef = useRef();
    const connectionRef = useRef();

    useEffect(() => {
        const getMedia = async () => {
            try {
                const currentStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                setStream(currentStream);
                if (localVideoRef.current) {
                    localVideoRef.current.srcObject = currentStream;
                }
            } catch (err) {
                console.error("Error accessing user media.", err); // Translation of "Error al acceder a los medios del usuario."
            }
        };

        const socket = getSocket();

        if (socket) {
            getMedia();

            // Logic for receiving incoming calls
            socket.on('call-made', ({ signal, from }) => {
                setCallerId(from);
                const peer = new Peer({ initiator: false, trickle: false, stream: stream });
                peer.on('signal', (data) => {
                    socket.emit('accept-call', { signal: data, to: from });
                });
                peer.on('stream', (currentStream) => {
                    if (remoteVideoRef.current) {
                        remoteVideoRef.current.srcObject = currentStream;
                    }
                });
                peer.signal(signal);
                connectionRef.current = peer;
                setIsCalling(true);
            });

            // Logic for call answer/acceptance
            socket.on('call-accepted', (signal) => {
                setCallAccepted(true);
                connectionRef.current.signal(signal);
            });
            
            // Logic for text messages
            socket.on('new-message', (data) => {
                setMessages((prevMessages) => [...prevMessages, { text: data.message, from: data.from, type: 'other' }]);
            });
        }
    }, [stream]);

    // Function to start the call
    const startCall = (peerId) => { // Translation of "Función para iniciar la llamada"
        const socket = getSocket();
        if (!socket) return;
        
        const peer = new Peer({ initiator: true, trickle: false, stream: stream });
        
        peer.on('signal', (data) => {
            socket.emit('call-user', { to: recipientAddress, signal: data });
        });
        
        peer.on('stream', (currentStream) => {
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = currentStream;
            }
        });

        connectionRef.current = peer;
        setIsCalling(true);
    };

    // Function to end the call
    const endCall = () => { // Translation of "Función para terminar la llamada"
        if (connectionRef.current) {
            connectionRef.current.destroy();
        }
        setIsCalling(false);
        setCallAccepted(false);
        setCallerId('');
        if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = null;
        }
    };

    // Logic to toggle microphone
    const toggleMic = (isOn) => { // Translation of "Lógica para alternar micrófono"
        if (stream) {
            stream.getAudioTracks().forEach(track => track.enabled = isOn);
        }
    };

    // Logic to toggle video
    const toggleVideo = (isOn) => { // Translation of "Lógica para alternar video"
        if (stream) {
            stream.getVideoTracks().forEach(track => track.enabled = isOn);
        }
    };

    // Text messaging and payment logic (no changes needed for logic, only internal comments)
    const handleSendMessage = (e) => { // Translation of "Lógica de mensajería de texto y pagos de Chat.jsx (sin cambios)"
        e.preventDefault();
        const socket = getSocket();
        if (socket && message.trim() && recipientAddress) {
            socket.emit('send-message', {
                to: recipientAddress,
                from: walletAddress,
                message: message.trim()
            });
            setMessages((prevMessages) => [...prevMessages, { text: message.trim(), from: walletAddress, type: 'me' }]);
            setMessage('');
        }
    };
    
    const handleSendSol = async () => {
        if (wallet && recipientAddress && solAmount) {
            const amount = parseFloat(solAmount);
            if (isNaN(amount) || amount <= 0) {
                alert("Please enter a valid SOL amount."); // Translation of "Por favor, ingresa una cantidad válida de SOL."
                return;
            }
            const signature = await sendSol(wallet, recipientAddress, amount);
            if (signature) {
                const transactionMessage = `Transaction of ${amount} SOL sent. Signature: ${signature.substring(0, 10)}...`; // Translation of "Transacción de X SOL enviada. Firma: Y..."
                setMessages((prevMessages) => [...prevMessages, { text: transactionMessage, from: walletAddress, type: 'transaction' }]);
                setSolAmount('');
            } else {
                alert("The transaction failed."); // Translation of "La transacción falló."
            }
        }
    };

    return (
        <div className="chat-container">
            <div className="chat-header">
                <h2>Chat and Video Calls</h2> {/* Translation of "Chat y Videollamadas" */}
                <input
                    type="text"
                    value={recipientAddress}
                    onChange={(e) => setRecipientAddress(e.target.value)}
                    placeholder="Recipient wallet address" 
                    className="recipient-input"
                />
            </div>
            
            <VideoCall localVideoRef={localVideoRef} remoteVideoRef={remoteVideoRef} inCall={isCalling || callAccepted} />

            <MessageList messages={messages} />

            {/* Incoming call message */} {/* Translation of "Mensaje de llamada entrante" */}
            {callerId && !callAccepted && (
                <div className="call-notification">
                    <span>Incoming call from {callerId}</span> {/* Translation of "Llamada entrante de" */}
                    <button onClick={() => setCallAccepted(true)}>Accept</button> {/* Translation of "Aceptar" */}
                    <button onClick={endCall}>Decline</button> {/* Translation of "Rechazar" */}
                </div>
            )}
            
            <form onSubmit={handleSendMessage} className="chat-input-form">
                <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Type a message..." 
                    className="message-input"
                />
                <button type="submit" className="send-message-btn">Send Message</button> {/* Translation of "Enviar Mensaje" */}
            </form>

            <div className="payment-section">
                <input
                    type="text"
                    value={solAmount}
                    onChange={(e) => setSolAmount(e.target.value)}
                    placeholder="Amount of SOL to send" 
                    className="sol-amount-input"
                />
                <button onClick={handleSendSol} className="send-sol-btn">Send SOL</button> {/* Translation of "Enviar SOL" */}
            </div>
            
            <Footer 
                onStartCall={() => startCall(recipientAddress)} 
                onEndCall={endCall} 
                onToggleMic={toggleMic} 
                onToggleVideo={toggleVideo} 
            />
        </div>
    );
};

export default Chat;