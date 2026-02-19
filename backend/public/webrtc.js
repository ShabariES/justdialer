let pc;
let localStream;
const config = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

async function startWebRTCConnection(targetRollNo, isCaller) {
    console.log(`Starting WebRTC as ${isCaller ? 'Caller' : 'Receiver'}`);

    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        document.getElementById('localAudio').srcObject = localStream;

        pc = new RTCPeerConnection(config);

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
            document.getElementById('remoteAudio').srcObject = event.streams[0];
        };

        if (isCaller) {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('offer', { toRollNo: targetRollNo, offer });
        }

    } catch (err) {
        console.error('WebRTC Error:', err);
        alert('Could not access microphone');
        closeCallScreen();
    }
}

async function handleOffer(offer, fromRollNo) {
    if (!pc) {
        // This is the case where we just accepted the call and are ready
        // But the offer might arrive before startWebRTCConnection finishes its setup
        // Actually, startWebRTCConnection(..., false) should be called first
    }

    try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', { toRollNo: fromRollNo, answer });
    } catch (err) {
        console.error('Error handling offer:', err);
    }
}

async function handleAnswer(answer) {
    try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (err) {
        console.error('Error handling answer:', err);
    }
}

async function handleIceCandidate(candidate) {
    try {
        if (pc) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
    } catch (err) {
        console.error('Error adding ICE candidate:', err);
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
}
