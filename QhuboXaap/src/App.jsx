import React, { useState, useEffect, useRef } from 'react';
import * as Tone from "tone"; 
import { Keypair } from '@solana/web3.js';
import { initSocket, getSocket } from './services/webrtc.js';
import { getSolBalance, sendSol } from './services/solana.js';
import Header from './components/Header.jsx';
import MessageList from './components/MessageList.jsx';
import WalletModal from './components/WalletModal.jsx';
import VideoCall from './components/VideoCall.jsx';
import Footer from './components/Footer.jsx';
import ChatList from './components/ChatList.jsx';
import RecoveryModal from './components/RecoveryModal.jsx'; 
import SirisModal from './components/SirisModal.jsx';
import AlanModal from './components/AlanModal.jsx';
import SmartbookModal from './components/SmartbookModal.jsx';
import KiaraModal from './components/KiaraModal.jsx'; 

import './styles.css';



let reverb = null;
let panner = null;
let vibration = null;
let synth = null;
let audioInitialized = false;

const initAudioEngine = async () => {
    if (!audioInitialized) {
        reverb = new Tone.Reverb({ decay: 2.5, wet: 0.4 }).toDestination();
        panner = new Tone.Panner(0).connect(reverb);
        vibration = new Tone.Tremolo(12, 0.8).connect(panner);
        synth = new Tone.FMSynth({
            harmonicity: 3.5,
            modulationIndex: 15,
            oscillator: { type: "sine" },
            modulation: { type: "sine" },
            envelope: {
                attack: 0.005,
                decay: 0.2,
                sustain: 0.1,
                release: 1.0
            },
            modulationEnvelope: {
                attack: 0.01,
                decay: 0.1,
                sustain: 0,
                release: 0.1
            }
        }).connect(vibration);

        audioInitialized = true;
    }
    // Try to start/resume the AudioContext. If browser blocks it, wait for a user gesture and retry.
    if (Tone && Tone.context && Tone.context.state !== 'running') {
        try {
            await Tone.start();
        } catch (e) {
            // Browser prevented auto-start. Install a one-time user gesture handler to resume.
            await new Promise((resolve) => {
                const onGesture = async () => {
                    try { await Tone.start(); } catch (err) { console.warn('Tone.start on gesture failed', err); }
                    document.body.removeEventListener('click', onGesture);
                    document.body.removeEventListener('touchstart', onGesture);
                    resolve();
                };
                document.body.addEventListener('click', onGesture, { once: true });
                document.body.addEventListener('touchstart', onGesture, { once: true });
            });
        }
    }

    if (vibration && !vibration.state) {
        try {
            await vibration.start();
        } catch (e) {
            console.warn('Vibration start failed:', e);
        }
    }
};
// --- 2. FUNCIONES DE SONIDO ---

const playMessageSound = async () => {
    try {
        await initAudioEngine();
    } catch (err) {
        console.warn('playMessageSound audio init failed:', err);
        return;
    }

    if (!Tone || !Tone.context || Tone.context.state !== 'running') {
        // Audio still suspended — schedule to play after next user gesture to avoid exceptions
        const deferredPlay = () => { try { playMessageSound(); } catch(e){ console.warn('deferred play failed', e); } };
        document.body.addEventListener('click', function once() { deferredPlay(); document.body.removeEventListener('click', once); }, { once: true });
        document.body.addEventListener('touchstart', function once() { deferredPlay(); document.body.removeEventListener('touchstart', once); }, { once: true });
        return;
    }

    const now = Tone.now();

    // Reducimos el efecto de vibración para el mensaje para que sea más claro
    vibration.wet.setValueAtTime(0.2, now);

    // Reset del pan a la izquierda
    panner.pan.setValueAtTime(-0.8, now);

    // Nota 1: Inicio
    synth.triggerAttackRelease("E5", "32n", now);
    panner.pan.rampTo(0, 0.1, now);

    // Nota 3: Brillo final centrado
    synth.triggerAttackRelease("E6", "16n", now + 0.2);
    panner.pan.rampTo(0.2, 0.2, now + 0.2);

    // Restauramos la intensidad de la vibración para la próxima llamada
    vibration.wet.setValueAtTime(0.8, now + 0.5);
};

let callSoundInterval = null;

const playCallSound = async () => {
    try {
        await initAudioEngine();
    } catch (err) {
        console.warn('playCallSound audio init failed:', err);
        return;
    }

    const pattern = () => {
        const now = Tone.now();
        const arpeggio = ["G5", "B5", "D6", "G6"];
        
        arpeggio.forEach((note, i) => {
            const time = now + i * 0.15;
            // El "trino": dos disparos ultra rápidos para efecto metálico
            synth.triggerAttackRelease(note, "32n", time);
            synth.triggerAttackRelease(note, "32n", time + 0.05);
        });
    };

    if (!callSoundInterval) {
        pattern();
        callSoundInterval = setInterval(pattern, 1800);
    }
};

const stopCallSound = () => {
    if (callSoundInterval) {
        clearInterval(callSoundInterval);
        callSoundInterval = null;
    }
};
const App = () => {
    const [connectedWallet, setConnectedWallet] = useState(null);
    const [walletInstance, setWalletInstance] = useState(null);
    const [remoteWallet, setRemoteWallet] = useState('');
    const [chats, setChats] = useState({});
    const [inputMessage, setInputMessage] = useState('');
    const [isRecording, setIsRecording] = useState(false);
    const [audioBlob, setAudioBlob] = useState(null);
    const [audioUrl, setAudioUrl] = useState(null);
    const [showAudioControls, setShowAudioControls] = useState(false);
    const [showWalletModal, setShowWalletModal] = useState(false);
    const [walletInitialTab, setWalletInitialTab] = useState('balance');
    const [showRecoveryModal, setShowRecoveryModal] = useState(false); 
    const [balance, setBalance] = useState(0);
    const [contacts, setContacts] = useState([]);
    const [inCall, setInCall] = useState(false);
    const [callEstablished, setCallEstablished] = useState(false);
    const [micEnabled, setMicEnabled] = useState(true);
    const [videoEnabled, setVideoEnabled] = useState(true);
    const [activeChat, setActiveChat] = useState(null);
    const [activeChatName, setActiveChatName] = useState(null);
    const [showSirisModal, setShowSirisModal] = useState(false);
    const [showAlanModal, setShowAlanModal] = useState(false);
    const [showSmartbookModal, setShowSmartbookModal] = useState(false);
    const [showKiaraModal, setShowKiaraModal] = useState(false);

    const handleOpenSiris = () => setShowSirisModal(true);
    const handleOpenAlan = () => setShowAlanModal(true);
    const handleOpenSmartbook = () => setShowSmartbookModal(true);
    const handleOpenKiara = () => setShowKiaraModal(true);

    const isAnyModalOpen = showWalletModal || showRecoveryModal || showSirisModal || showAlanModal || showSmartbookModal || showKiaraModal;

    useEffect(() => {
        const attemptResumeAudio = async () => {
            try {
                await initAudioEngine();
                if (Tone.context && Tone.context.state === 'suspended') {
                    await Tone.context.resume();
                }
                console.log('Resumed Tone.js audio context after user interaction');
            } catch (err) {
                console.warn('Audio resume/init failed:', err);
            }
        };

        const onUserGesture = () => {
            attemptResumeAudio();
            document.body.removeEventListener('click', onUserGesture);
            document.body.removeEventListener('touchstart', onUserGesture);
        };

        document.body.addEventListener('click', onUserGesture, { once: true });
        document.body.addEventListener('touchstart', onUserGesture, { once: true });

        return () => {
            document.body.removeEventListener('click', onUserGesture);
            document.body.removeEventListener('touchstart', onUserGesture);
        };
    }, []);

    const inputRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const pcRef = useRef(null);
    const localStreamRef = useRef(null);
const [isOnline, setIsOnline] = useState(false);
    // --- MEJORA 2: SISTEMA DE AUTODESTRUCCIÓN PROFESIONAL ---
    const scheduleDestruction = (partnerWallet, msgId, delay = 120000) => {
        setTimeout(() => {
            setChats(prev => {
                const currentChat = prev[partnerWallet] || [];
                const updatedChat = currentChat.filter(m => m.id !== msgId);
                return { ...prev, [partnerWallet]: updatedChat };
            });
        }, delay);
    };
// --- MEJORA 4: DETECCIÓN DE ESTADO ONLINE / OFFLINE ---
    useEffect(() => {
        const socket = getSocket();
        
        // Si no hay un chat activo, se reinicia el estado
        if (!activeChat) {
            setIsOnline(false);
            return;
        }

        // 1. Preguntar al servidor el estado actual del usuario activo
        socket.emit('check-status', activeChat);

        // 2. Escuchar la respuesta o los cambios en tiempo real
        const handleStatusChange = (data) => {
            // Asegurarnos de que el cambio de estado corresponde al chat que tenemos abierto
            if (data.wallet === activeChat) {
                setIsOnline(data.online);
            }
        };

        socket.on('user-status', handleStatusChange);

        return () => {
            socket.off('user-status', handleStatusChange);
        };
    }, [activeChat]);
    
    useEffect(() => {
        const requestPersist = async () => {
            if (navigator.storage && navigator.storage.persist) {
                const isPersisted = await navigator.storage.persist();
                console.log(`Almacenamiento persistente: ${isPersisted}`);
            }
        };
        requestPersist();

        const storedContacts = JSON.parse(localStorage.getItem('contacts')) || [];
        setContacts(storedContacts);
    }, []);

    useEffect(() => {
        initSocket();
        const socket = getSocket();

        const loadWallet = async () => {
            let wallet;
            const storedKey = localStorage.getItem('walletSecretKey');
            if (storedKey) {
                const secretKey = new Uint8Array(JSON.parse(storedKey));
                wallet = Keypair.fromSecretKey(secretKey);
            } else {
                wallet = Keypair.generate();
                const privateKeyJSON = JSON.stringify(Array.from(wallet.secretKey));
                localStorage.setItem('walletSecretKey', privateKeyJSON);
            }
            setConnectedWallet(wallet.publicKey.toBase58());
            setWalletInstance(wallet);
            const currentBalance = await getSolBalance(wallet.publicKey.toBase58());
            setBalance(currentBalance);
            socket.emit('register', wallet.publicKey.toBase58());
        };
        loadWallet();

        socket.on('new-message', data => {
            const msgId = `msg-${Date.now()}-${Math.random()}`;
            
            const contact = contacts.find(c => c.address === data.from);
            const senderLabel = contact ? contact.name : data.from;

            setChats(prevChats => ({
                ...prevChats,
                [data.from]: [...(prevChats[data.from] || []), { 
                    id: msgId, 
                    text: data.message, 
                    type: 'received',
                    sender: senderLabel,
                    read: false // Flag para la lógica de borrado del receptor
                }]
            }));
            playMessageSound();
            
        });

        socket.on('new-voice', data => {
            const msgId = `msg-v-${Date.now()}-${Math.random()}`;
            const audioBlob = base64toBlob(data.audio, 'audio/webm');
            const audioUrl = URL.createObjectURL(audioBlob);
            const contact = contacts.find(c => c.address === data.from);
            const senderLabel = contact ? contact.name : data.from;

            setChats(prevChats => ({
                ...prevChats,
                [data.from]: [...(prevChats[data.from] || []), { 
                    id: msgId, 
                    text: "🔊 Voice Message", 
                    type: 'received', 
                    audio: audioUrl,
                    sender: senderLabel,
                    read: false
                }]
            }));
            playMessageSound();
        });

        socket.on('incoming-call', async (data) => {
            playCallSound();
            const contact = contacts.find(c => c.address === data.from);
            const callerIdentity = contact ? contact.name : data.from;
            const confirmCall = window.confirm(`Incoming call from ${callerIdentity}. Accept?`);
            stopCallSound();
            if (confirmCall) {
                setInCall(true);
                setActiveChat(data.from);
                setRemoteWallet(data.from);
                await startCall(data.signal);
            }
        });

        // ... Resto de la lógica de sockets (call-accepted, signal) se mantiene igual
        socket.on('call-accepted', async (data) => {
            stopCallSound();
            if (pcRef.current) {
                await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
                setCallEstablished(true);
            }
        });

        socket.on('signal', async (data) => {
            if (pcRef.current) {
                await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
        });

        return () => {
            socket.off('new-message');
            socket.off('new-voice');
            socket.off('incoming-call');
            socket.off('call-accepted');
            socket.off('signal');
            stopCallSound();
        };
    }, [connectedWallet, contacts]); // Agregado contacts a la dependencia para el remitente

    // --- MEJORA 2: Lógica de detección de lectura ---
    // Este useEffect monitorea los mensajes recibidos no leídos en el chat activo
   useEffect(() => {
    if (activeChat && chats[activeChat]) {
        const chatMessages = chats[activeChat];
        const hasUnread = chatMessages.some(msg => msg.type === 'received' && !msg.read);

        if (hasUnread) {
            setChats(prevChats => {
                const updatedMessages = prevChats[activeChat].map(msg => {
                    if (msg.type === 'received' && !msg.read) {
                        // Iniciamos la autodestrucción de 120s para el receptor
                        scheduleDestruction(activeChat, msg.id, 120000);
                        return { ...msg, read: true };
                    }
                    return msg;
                });

                return {
                    ...prevChats,
                    [activeChat]: updatedMessages
                };
            });
        }
    }
}, [activeChat, chats[activeChat]]); 

    const startCall = async (remoteSignal) => {
        const socket = getSocket();
        pcRef.current = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        pcRef.current.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('signal', { to: remoteWallet, candidate: event.candidate });
            }
        };

        pcRef.current.ontrack = (event) => {
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = event.streams[0];
            }
        };

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localStreamRef.current = stream;
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }
            stream.getTracks().forEach(track => pcRef.current.addTrack(track, stream));

            if (remoteSignal) {
                await pcRef.current.setRemoteDescription(new RTCSessionDescription(remoteSignal));
                const answer = await pcRef.current.createAnswer();
                await pcRef.current.setLocalDescription(answer);
                socket.emit('call-accepted', { to: remoteWallet, answer });
                setCallEstablished(true);
            } else {
                const offer = await pcRef.current.createOffer();
                await pcRef.current.setLocalDescription(offer);
                socket.emit('incoming-call', { to: remoteWallet, from: connectedWallet, signal: offer });
            }
        } catch (error) {
            console.error('Error starting the call:', error);
            alert('Could not start the call. Make sure you have microphone and camera permissions.');
            handleEndCall();
        }
    };

    const handleEndCall = () => {
        stopCallSound();
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
        }
        if (pcRef.current) {
            pcRef.current.close();
            pcRef.current = null;
        }
        setInCall(false);
        setCallEstablished(false);
        setMicEnabled(true);
        setVideoEnabled(true);
    };

    const handleToggleMic = () => {
        if (localStreamRef.current) {
            const audioTrack = localStreamRef.current.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setMicEnabled(audioTrack.enabled);
            }
        }
    };

    const handleToggleVideo = () => {
        if (localStreamRef.current) {
            const videoTrack = localStreamRef.current.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                setVideoEnabled(videoTrack.enabled);
            }
        }
    };

    const handleRecordVoice = async () => {
        if (!isRecording) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorderRef.current = new MediaRecorder(stream);
                audioChunksRef.current = [];
                mediaRecorderRef.current.ondataavailable = (event) => {
                    audioChunksRef.current.push(event.data);
                };
                mediaRecorderRef.current.onstop = () => {
                    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                    const url = URL.createObjectURL(audioBlob);
                    setAudioBlob(audioBlob);
                    setAudioUrl(url);
                    setShowAudioControls(true);
                    setIsRecording(false);
                };
                mediaRecorderRef.current.start();
                setIsRecording(true);
                setInputMessage('');
            } catch (error) {
                console.error("Error recording audio:", error);
                alert("Could not start audio recording. Make sure you have microphone permissions.");
                setIsRecording(false);
            }
        } else {
            mediaRecorderRef.current.stop();
        }
    };

    const handleSendVoiceMessage = () => {
        const socket = getSocket();
        if (audioBlob && activeChat && socket) {
            const reader = new FileReader();
            reader.readAsDataURL(audioBlob);
            reader.onloadend = () => {
                const base64Audio = reader.result.split(',')[1];
                const msgId = `msg-v-${Date.now()}-${Math.random()}`;
                socket.emit('send-voice', {
                    id: msgId,
                    to: activeChat,
                    from: connectedWallet,
                    audio: base64Audio
                });
                const audioUrlForChat = URL.createObjectURL(audioBlob);
                setChats(prevChats => ({
                    ...prevChats,
                    [activeChat]: [...(prevChats[activeChat] || []), { id: msgId, text: "🔊 Voice Message", type: 'sent', audio: audioUrlForChat }]
                }));
                // MEJORA 2: Emisor borra a los 120s del envío
                scheduleDestruction(activeChat, msgId, 120000); 
                
                setAudioBlob(null);
                setAudioUrl(null);
                setShowAudioControls(false);
            };
        }
    };

    const handleCancelAudio = () => {
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioBlob(null);
        setAudioUrl(null);
        setShowAudioControls(false);
        setIsRecording(false);
    };

    const base64toBlob = (base64, type) => {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type });
    };

    const handleSendMessage = () => {
        const socket = getSocket();
        if (inputMessage.trim() && activeChat && socket) {
            const msgId = `msg-${Date.now()}-${Math.random()}`;
            socket.emit('send-message', {
                id: msgId,
                to: activeChat,
                from: connectedWallet,
                message: inputMessage.trim()
            });
            setChats(prevChats => ({
                ...prevChats,
                [activeChat]: [...(prevChats[activeChat] || []), { id: msgId, text: inputMessage.trim(), type: 'sent' }]
            }));
            // MEJORA 2: Emisor borra a los 120s del envío
            scheduleDestruction(activeChat, msgId, 120000);
            setInputMessage('');
        }
    };

    const handleOpenWalletModal = () => {
        setWalletInitialTab('balance');
        setShowWalletModal(true);
    };

    const handleOpenContactsInWallet = () => {
        setWalletInitialTab('contacts');
        setShowWalletModal(true);
    };

    const handleCreateWallet = async () => {
        const newWallet = Keypair.generate();
        const privateKeyJSON = JSON.stringify(Array.from(newWallet.secretKey));
        localStorage.setItem('walletSecretKey', privateKeyJSON);
        setConnectedWallet(newWallet.publicKey.toBase58());
        setWalletInstance(newWallet);
        const currentBalance = await getSolBalance(newWallet.publicKey.toBase58());
        setBalance(currentBalance);
        getSocket().emit('register', newWallet.publicKey.toBase58());
        setShowWalletModal(false);
        alert('New wallet created and saved.');
    };

    const handleImportWallet = async (secretKey) => {
        try {
            const secretKeyArray = new Uint8Array(JSON.parse(secretKey));
            const importedWallet = Keypair.fromSecretKey(secretKeyArray);
            localStorage.setItem('walletSecretKey', secretKey);
            setConnectedWallet(importedWallet.publicKey.toBase58());
            setWalletInstance(importedWallet);
            const currentBalance = await getSolBalance(importedWallet.publicKey.toBase58());
            setBalance(currentBalance);
            getSocket().emit('register', importedWallet.publicKey.toBase58());
            setShowWalletModal(false);
            alert('Wallet imported successfully.');
        } catch (error) {
            console.error('Error importing wallet:', error);
            alert('Error importing wallet. Make sure the private key is valid.');
        }
    };

    const handleRedirectToMessaging = (contactAddress, contactName) => {
    // 1. Si no recibimos el nombre, intentamos buscarlo en nuestra lista de contactos
    let finalName = contactName;
    
    if (!finalName) {
        const foundContact = contacts.find(c => c.address === contactAddress);
        finalName = foundContact ? foundContact.name : `${contactAddress.substring(0, 4)}...${contactAddress.slice(-4)}`;
    }

    // 2. Seteamos los estados con el nombre real (o el alias truncado)
    setActiveChat(contactAddress);
    setActiveChatName(finalName);
    setRemoteWallet(contactAddress);
    setShowWalletModal(false);
};

    const handleBackToChatList = () => {
        setActiveChat(null);
        setActiveChatName(null);
        setRemoteWallet(null);
        handleCancelAudio();
    };

    const handleVerifyRecovery = (code, token) => {
        setShowRecoveryModal(false);
        setShowWalletModal(true); 
    };

    const handleDeleteChat = (walletAddress, e) => {

    
    if (e) e.stopPropagation(); 

    setChats(prev => {
        const newChats = { ...prev };
        delete newChats[walletAddress];
        return newChats;
    });
    
};
    return (
        <div className="app-container">
            <Header 
                onOpenWallet={handleOpenWalletModal} 
                onGoToContacts={handleOpenContactsInWallet} 
                onOpenRecovery={() => setShowRecoveryModal(true)}
                connectedAddress={connectedWallet}
            />
            <div className="main-content">
                {activeChat ? (
                    <div className="chat-content-wrapper">
                        <div className="chat-header-container">
    <button className="back-button" onClick={handleBackToChatList}>
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
        </svg>
    </button>
    
   <div className="chat-header-info">
    <h2>{activeChatName}</h2> 
    <div className={`status-indicator ${isOnline ? 'online' : 'offline'}`}>
        <span className={`status-dot ${isOnline ? 'bg-green' : 'bg-gray'}`}></span>
        <span>{isOnline ? 'On Line' : 'Off Line'}</span>
    </div>
</div>
</div>
                        <VideoCall
                            localVideoRef={localVideoRef}
                            remoteVideoRef={remoteVideoRef}
                            inCall={inCall}
                        />
                        
                        <MessageList 
                            messages={chats[activeChat] || []} 
                            contacts={contacts} 
                            currentUser={connectedWallet}
                        />

            
                        <div className="input-area">
                            <button
                                className={`call-button ${inCall ? 'hang-up' : ''}`}
                                onClick={() => {
                                    if (inCall) {
                                        handleEndCall();
                                    } else {
                                        if (remoteWallet) {
                                            setInCall(true);
                                            startCall();
                                        } else {
                                            alert('Please select or enter a wallet address.');
                                        }
                                    }
                                }}
                            >
                                {inCall ? '🚫' : '📞'}
                            </button>
                            {showAudioControls ? (
                                <div className="audio-preview-controls">
                                    <audio src={audioUrl} controls />
                                    <button onClick={handleSendVoiceMessage}>✅</button>
                                    <button onClick={handleCancelAudio}>❌</button>
                                </div>
                            ) : (
                                <>
                                    <textarea
                                        ref={inputRef}
                                        placeholder="Type a message..."
                                        value={inputMessage}
                                        onChange={(e) => {
                                            setInputMessage(e.target.value);
                                            if (isRecording) mediaRecorderRef.current.stop();
                                            handleCancelAudio();
                                        }}
                                    />
                                    {inputMessage ? (
                                        <button onClick={handleSendMessage}>➢</button>
                                    ) : (
                                        <button onClick={handleRecordVoice}>
                                            {isRecording ? "🔴" : "🎙️"}
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
     
                      
                    </div>
                    // ---  1.import repair callfooter up div ---
                ) : (
                   <ChatList
                        chats={chats}
                        onSelectChat={handleRedirectToMessaging}
                        onDeleteChat={handleDeleteChat} 
                        contacts={contacts}
                    />
                )}
                    {!activeChat && !isAnyModalOpen && !inCall && (
                <Footer
                    onOpenSiris={handleOpenSiris}
                    onOpenAlan={handleOpenAlan}
                    onOpenSmartbook={handleOpenSmartbook}
                    onOpenKiara={handleOpenKiara}
                />
            )}
                
            </div>
           
            {showWalletModal && (
                <WalletModal
                    onClose={() => setShowWalletModal(false)}
                    walletAddress={connectedWallet}
                    walletInstance={walletInstance}
                    onCreateWallet={handleCreateWallet}
                    onImportWallet={handleImportWallet}
                    onRedirectToMessaging={handleRedirectToMessaging}
                    initialTab={walletInitialTab}
                />
            )}

            {showRecoveryModal && (
                <RecoveryModal 
                    onClose={() => setShowRecoveryModal(false)} 
                    onVerify={handleVerifyRecovery}
                />
            )}
 
            <SirisModal isOpen={showSirisModal} onClose={() => setShowSirisModal(false)} />
            <AlanModal isOpen={showAlanModal} onClose={() => setShowAlanModal(false)} />
            <SmartbookModal isOpen={showSmartbookModal} onClose={() => setShowSmartbookModal(false)} />
            <KiaraModal isOpen={showKiaraModal} onClose={() => setShowKiaraModal(false)} />
        </div>
    );
};

export default App;