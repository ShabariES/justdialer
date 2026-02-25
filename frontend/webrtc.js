let pc;
let localStream;
let remoteCandidateQueue = [];
let pcPromise = null;
let resolvePc;

const config = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

function resetPcPromise() {
    pcPromise = new Promise(resolve => {
        resolvePc = resolve;
    });
}

// Initialize the promise
resetPcPromise();

async function startWebRTCConnection(targetRollNo, isCaller) {
    console.log(`Starting WebRTC as ${isCaller ? 'Caller' : 'Receiver'}`);

    try {
        // Ensure audio elements exist
        let localAudio = document.getElementById('localAudio');
        let remoteAudio = document.getElementById('remoteAudio');

        if (!localAudio) {
            localAudio = document.createElement('audio');
            localAudio.id = 'localAudio';
            localAudio.autoplay = true;
            localAudio.muted = true; // Local audio should be muted to avoid feedback
            localAudio.style.display = 'none';
            document.body.appendChild(localAudio);
        }

        if (!remoteAudio) {
            remoteAudio = document.createElement('audio');
            remoteAudio.id = 'remoteAudio';
            remoteAudio.autoplay = true;
            remoteAudio.style.display = 'none';
            document.body.appendChild(remoteAudio);
        }

        localStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 48000,
                channelCount: 1
            }
        });
        localAudio.srcObject = localStream;

        pc = new RTCPeerConnection(config);
        remoteCandidateQueue = []; // Reset queue for new connection

        // Resolve the promise so handleOffer/handleAnswer can continue
        resolvePc(pc);

        // Add local tracks to peer connection
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

        // ICE Candidate handling
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('ice-candidate', {
                    toRollNo: targetRollNo,
                    candidate: event.candidate
                });
            }
        };

        // Remote stream handling
        pc.ontrack = (event) => {
            console.log('Received remote track');
            if (remoteAudio) {
                remoteAudio.srcObject = event.streams[0];
            }
        };

        if (isCaller) {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('offer', { toRollNo: targetRollNo, offer });
        }

    } catch (err) {
        console.error('WebRTC Error:', err);
        if (err.name === 'NotAllowedError') {
            alert('Microphone access denied. Please allow microphone permissions in your browser settings.');
        } else {
            alert('Could not access microphone: ' + err.message);
        }
        closeCallScreen();
    }
}

async function handleOffer(offer, fromRollNo) {
    console.log('Handling offer from:', fromRollNo);
    // Wait for PC to be initialized if it's not yet
    const currentPc = await pcPromise;

    try {
        await currentPc.setRemoteDescription(new RTCSessionDescription(offer));
        console.log('Remote description set (Offer)');

        // Process queued candidates
        await processQueuedCandidates();

        const answer = await currentPc.createAnswer();
        await currentPc.setLocalDescription(answer);
        socket.emit('answer', { toRollNo: fromRollNo, answer });
    } catch (err) {
        console.error('Error handling offer:', err);
    }
}

async function handleAnswer(answer) {
    console.log('Handling answer');
    const currentPc = await pcPromise;
    try {
        await currentPc.setRemoteDescription(new RTCSessionDescription(answer));
        console.log('Remote description set (Answer)');

        // Process queued candidates
        await processQueuedCandidates();
    } catch (err) {
        console.error('Error handling answer:', err);
    }
}

async function handleIceCandidate(candidate) {
    if (!pc) {
        console.log('PC not initialized yet, queuing candidate');
        remoteCandidateQueue.push(candidate);
        return;
    }

    try {
        if (pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
            console.log('Remote description not set yet, queuing candidate');
            remoteCandidateQueue.push(candidate);
        }
    } catch (err) {
        console.error('Error adding ICE candidate:', err);
    }
}

async function processQueuedCandidates() {
    console.log(`Processing ${remoteCandidateQueue.length} queued candidates`);
    while (remoteCandidateQueue.length > 0) {
        const candidate = remoteCandidateQueue.shift();
        try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
            console.error('Error adding queued candidate:', e);
        }
    }
}

function stopWebRTC() {
    if (pc) {
        pc.close();
        pc = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    remoteCandidateQueue = [];
    resetPcPromise(); // Reset for next call
}

// Ensure functions are globally accessible
window.handleOffer = handleOffer;
window.handleAnswer = handleAnswer;
window.handleIceCandidate = handleIceCandidate;
window.startWebRTCConnection = startWebRTCConnection;
window.stopWebRTC = stopWebRTC;
