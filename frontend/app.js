const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:2000'
    : 'https://justcall.onrender.com';
let socket;
let currentUser = null;
let currentTargetRollNo = null;
let deferredPrompt;

// DOM Elements
const loginSection = document.getElementById('login-section');
const registerSection = document.getElementById('register-section');
const authContainer = document.getElementById('auth-container');
const dashboardContainer = document.getElementById('dashboard-container');
const callScreen = document.getElementById('call-screen');
const incomingPopup = document.getElementById('incoming-call-popup');
const installBanner = document.getElementById('install-banner');
const installBtn = document.getElementById('install-btn');

// --- PWA Install Logic ---
window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Stash the event so it can be triggered later.
    deferredPrompt = e;
    // Update UI notify the user they can install the PWA
    installBanner.classList.remove('hidden');
});

installBtn.addEventListener('click', async () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to the install prompt: ${outcome}`);
        deferredPrompt = null;
        installBanner.classList.add('hidden');
    }
});

// Auth UI Switch
document.getElementById('show-register').onclick = (e) => {
    e.preventDefault();
    loginSection.classList.add('hidden');
    registerSection.classList.remove('hidden');
};

document.getElementById('show-login').onclick = (e) => {
    e.preventDefault();
    registerSection.classList.add('hidden');
    loginSection.classList.remove('hidden');
};

// --- API Functions ---
async function register() {
    const rollno = document.getElementById('reg-rollno').value.trim();
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();

    if (!rollno || !/^[a-zA-Z0-9]+$/.test(rollno)) {
        return alert('Please enter a valid alphanumeric Roll Number');
    }
    if (!name) return alert('Please enter your name');

    try {
        const response = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rollno, name, email })
        });
        const data = await response.json();
        if (data.success) {
            alert('Registration successful! Please login.');
            document.getElementById('show-login').click();
        } else {
            alert(data.message);
        }
    } catch (err) {
        console.error(err);
        alert('Registration failed');
    }
}

async function login() {
    const rollno = document.getElementById('login-rollno').value.trim();
    if (!rollno || !/^[a-zA-Z0-9]+$/.test(rollno)) {
        return alert('Please enter a valid alphanumeric Roll Number');
    }

    try {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rollno })
        });
        const data = await response.json();
        if (data.success) {
            currentUser = data.user;
            initDashboard();
        } else {
            alert(data.message);
        }
    } catch (err) {
        console.error(err);
        alert('Login failed');
    }
}

// --- Dashboard Logic ---
function initDashboard() {
    authContainer.classList.add('hidden');
    dashboardContainer.classList.remove('hidden');

    document.getElementById('display-name').innerText = currentUser.name;
    document.getElementById('display-rollno').innerText = `Roll No: ${currentUser.rollno}`;
    document.getElementById('user-avatar').innerText = currentUser.name[0].toUpperCase();

    // Initialize Socket
    socket = io(API_URL);
    socket.emit('register-user', currentUser.rollno);

    // Socket Event Listeners
    socket.on('incoming-call', ({ fromRollNo }) => {
        handleIncomingCall(fromRollNo);
    });

    socket.on('call-accepted', () => {
        document.getElementById('dialtone').pause();
        document.getElementById('call-status').innerText = 'Connected';
        startWebRTCConnection(currentTargetRollNo, true); // We are original caller
    });

    socket.on('call-rejected', () => {
        document.getElementById('dialtone').pause();
        alert('Call Rejected');
        closeCallScreen();
    });

    socket.on('call-failed', ({ message }) => {
        document.getElementById('dialtone').pause();
        alert(message);
        closeCallScreen();
    });

    socket.on('offer', async ({ offer, fromRollNo }) => {
        handleOffer(offer, fromRollNo);
    });

    socket.on('answer', async ({ answer }) => {
        handleAnswer(answer);
    });

    socket.on('ice-candidate', ({ candidate }) => {
        handleIceCandidate(candidate);
    });

    socket.on('end-call', () => {
        closeCallScreen();
    });
}

// --- Call UI Logic ---
function startCall() {
    const targetRollNo = document.getElementById('target-rollno').value;
    if (!targetRollNo) return alert('Enter target roll number');
    if (targetRollNo === currentUser.rollno) return alert('Cannot call yourself');

    currentTargetRollNo = targetRollNo;
    showCallScreen(targetRollNo, 'Calling...');

    document.getElementById('dialtone').play();
    socket.emit('call-user', { toRollNo: targetRollNo, fromRollNo: currentUser.rollno });
}

function handleIncomingCall(fromRollNo) {
    currentTargetRollNo = fromRollNo;
    document.getElementById('incoming-name').innerText = fromRollNo;
    document.getElementById('incoming-avatar').innerText = fromRollNo[0].toUpperCase();
    incomingPopup.classList.remove('hidden');
    document.getElementById('ringtone').play();
}

function acceptCall() {
    incomingPopup.classList.add('hidden');
    document.getElementById('ringtone').pause();
    showCallScreen(currentTargetRollNo, 'Connecting...');
    socket.emit('accept-call', { toRollNo: currentTargetRollNo });
    startWebRTCConnection(currentTargetRollNo, false); // We are answering
}

function rejectCall() {
    incomingPopup.classList.add('hidden');
    document.getElementById('ringtone').pause();
    socket.emit('reject-call', { toRollNo: currentTargetRollNo });
    currentTargetRollNo = null;
}

function showCallScreen(name, status) {
    document.getElementById('call-name').innerText = name;
    document.getElementById('call-avatar-text').innerText = name[0].toUpperCase();
    document.getElementById('call-status').innerText = status;
    callScreen.classList.remove('hidden');
}

function closeCallScreen() {
    callScreen.classList.add('hidden');
    document.getElementById('dialtone').pause();
    document.getElementById('ringtone').pause();
    stopWebRTC();
    currentTargetRollNo = null;
}

// Event Listeners for Buttons
document.getElementById('login-btn').onclick = login;
document.getElementById('register-btn').onclick = register;
document.getElementById('call-btn').onclick = startCall;
document.getElementById('accept-call-btn').onclick = acceptCall;
document.getElementById('reject-call-btn').onclick = rejectCall;
document.getElementById('end-call-btn').onclick = () => {
    if (currentTargetRollNo) {
        socket.emit('end-call', { toRollNo: currentTargetRollNo });
    }
    closeCallScreen();
};

document.getElementById('logout-btn').onclick = () => {
    location.reload();
};
