import React from 'react';
import './VideoCall.css';

const VideoCall = ({ localVideoRef, remoteVideoRef, inCall }) => {
    return (
        <div className={`video-container ${inCall ? 'active' : ''}`}>
            {inCall && (
                <>
                    <video ref={remoteVideoRef} className="remote-video" autoPlay playsInline />
                    <video ref={localVideoRef} className="local-video" autoPlay playsInline muted />
                </>
            )}
        </div>
    );
};

export default VideoCall;