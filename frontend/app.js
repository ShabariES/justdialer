const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : window.location.origin;
let socket;
let currentUser = JSON.parse(localStorage.getItem('currentUser')) || null;
let currentTargetRollNo = null;
let onlineUsers = [];
let deferredPrompt;

// DOM Elements
const loginSection = document.getElementById('login-section');
const registerSection = document.getElementById('register-section');
const callScreen = document.getElementById('call-screen');
const incomingPopup = document.getElementById('incoming-call-popup');
const installBanner = document.getElementById('install-banner');
const installBtn = document.getElementById('install-btn');

// --- PWA Install Logic ---
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (installBanner) installBanner.classList.remove('hidden');
});

if (installBtn) {
    installBtn.addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            await deferredPrompt.userChoice;
            deferredPrompt = null;
            installBanner.classList.add('hidden');
        }
    });
}

// --- Navigation Logic ---
function switchSection(sectionId) {
    if (sectionId === 'login' && window.location.pathname.includes('index.html')) {
        loginSection?.classList.remove('hidden');
        registerSection?.classList.add('hidden');
    } else if (sectionId === 'register' && window.location.pathname.includes('index.html')) {
        loginSection?.classList.add('hidden');
        registerSection?.classList.remove('hidden');
    } else if (sectionId === 'dashboard') {
        window.location.href = 'dialer.html';
    } else if (sectionId === 'online-users') {
        window.location.href = 'online.html';
    }
}

document.getElementById('show-register')?.addEventListener('click', (e) => { e.preventDefault(); switchSection('register'); });
document.getElementById('show-login')?.addEventListener('click', (e) => { e.preventDefault(); switchSection('login'); });

// --- API Functions ---
function generateWiseID() {
    const years = ['24', '25'];
    const codes = ['CS', 'AI', 'EC', 'ME', 'IT', 'BT', 'CH'];
    const randomYear = years[Math.floor(Math.random() * years.length)];
    const randomCode = codes[Math.floor(Math.random() * codes.length)];
    const randomID = Math.floor(100 + Math.random() * 899);
    const generated = `${randomYear}${randomCode}${randomID}`;
    const regInput = document.getElementById('reg-rollno');
    if (regInput) {
        regInput.value = generated;
        regInput.style.borderColor = 'var(--primary)';
        setTimeout(() => regInput.style.borderColor = '', 1000);
    }
}
window.generateWiseID = generateWiseID;

async function register() {
    const rollno = document.getElementById('reg-rollno').value.trim();
    const name = document.getElementById('reg-name').value.trim();
    if (!rollno || !/^[a-zA-Z0-9]+$/.test(rollno)) return alert('Enter valid Roll No');
    if (!name) return alert('Enter name');

    try {
        const response = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rollno, name })
        });
        const data = await response.json();
        if (data.success) {
            alert('Registered! Login now.');
            switchSection('login');
        } else alert(data.message);
    } catch (err) { alert('Registration failed'); }
}

async function login() {
    const rollno = document.getElementById('login-rollno').value.trim();
    if (!rollno) return alert('Enter Roll No');
    try {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rollno })
        });
        const data = await response.json();
        if (data.success) {
            localStorage.setItem('currentUser', JSON.stringify(data.user));
            window.location.href = 'online.html';
        } else alert(data.message);
    } catch (err) { alert('Login failed'); }
}

function logout() {
    localStorage.removeItem('currentUser');
    window.location.href = 'index.html';
}
window.logout = logout;
document.getElementById('logout-btn')?.addEventListener('click', logout);

// --- Dashboard Logic ---
function initDashboard() {
    if (!currentUser) return;
    if (document.getElementById('display-name')) document.getElementById('display-name').innerText = currentUser.name;
    if (document.getElementById('display-rollno')) document.getElementById('display-rollno').innerText = `ID: ${currentUser.rollno}`;
    const avatarEl = document.getElementById('user-avatar');
    if (avatarEl) avatarEl.innerText = currentUser.name[0].toUpperCase();

    socket = io(API_URL);
    socket.on('connect', () => socket.emit('register-user', currentUser.rollno));

    // Pending Actions
    const pendingCall = localStorage.getItem('callTarget');
    if (pendingCall) {
        localStorage.removeItem('callTarget');
        const { rollno, name } = JSON.parse(pendingCall);
        setTimeout(() => {
            const el = document.getElementById('target-rollno');
            if (el) { el.value = rollno; startCall(name); }
        }, 1000);
    }
    const pendingAccept = localStorage.getItem('acceptCallFrom');
    if (pendingAccept) {
        localStorage.removeItem('acceptCallFrom');
        currentTargetRollNo = pendingAccept;
        setTimeout(acceptCall, 500);
    }

    socket.on('incoming-call', ({ fromRollNo }) => handleIncomingCall(fromRollNo));
    socket.on('call-accepted', () => {
        document.getElementById('dialtone')?.pause();
        startWebRTCConnection(currentTargetRollNo, true);
        startCallTimer();
    });
    socket.on('call-rejected', () => { document.getElementById('dialtone')?.pause(); alert('Rejected'); closeCallScreen(); });
    socket.on('call-failed', ({ message }) => { alert(message); closeCallScreen(); });
    socket.on('offer', ({ offer, fromRollNo }) => window.handleOffer?.(offer, fromRollNo));
    socket.on('answer', ({ answer }) => window.handleAnswer?.(answer));
    socket.on('ice-candidate', ({ candidate }) => window.handleIceCandidate?.(candidate));
    socket.on('online-users-update', (users) => updateOnlineUsersList(users));
    socket.on('end-call', closeCallScreen);
}

function updateOnlineUsersList(users) {
    onlineUsers = users;
    const listEl = document.getElementById('users-list');
    const countEl = document.getElementById('online-count');
    const others = users.filter(u => u.rollno !== currentUser?.rollno);
    if (countEl) countEl.innerText = others.length;
    if (!listEl) return;
    if (others.length === 0) { listEl.innerHTML = '<p class="empty-msg">No peers online</p>'; return; }
    listEl.innerHTML = '';
    others.forEach(user => {
        const item = document.createElement('div');
        item.className = 'peer-item fade-up';
        item.innerHTML = `
            <div class="peer-info" onclick="callByRollNo('${user.rollno}')" style="cursor: pointer; flex: 1;">
                <div class="peer-avatar">${user.name[0].toUpperCase()}</div>
                <div><div class="peer-name">${user.name}</div><div class="peer-status">ID: ${user.rollno}</div></div>
            </div>
            <button class="btn-call-circle" onclick="callByRollNo('${user.rollno}')"><i class="fa-solid fa-phone"></i></button>
        `;
        listEl.appendChild(item);
    });
}

function callByRollNo(rollNo) {
    const user = onlineUsers.find(u => u.rollno === rollNo);
    const name = user ? user.name : rollNo;
    const el = document.getElementById('target-rollno');
    if (el) { el.value = rollNo; startCall(name); }
    else { localStorage.setItem('callTarget', JSON.stringify({ rollno: rollNo, name })); window.location.href = 'dialer.html'; }
}
window.callByRollNo = callByRollNo;

async function startCall(displayName) {
    const el = document.getElementById('target-rollno');
    const target = el ? el.value.trim().toUpperCase() : null;
    if (!target) return alert('Enter target ID');
    if (target === currentUser.rollno) return alert('Self call?');
    const btn = document.getElementById('call-btn');
    if (btn) { btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Connecting...'; btn.disabled = true; }
    currentTargetRollNo = target;
    if (!displayName || typeof displayName !== 'string') {
        const user = onlineUsers.find(u => u.rollno === target);
        displayName = user ? user.name : target;
    }
    showCallScreen(displayName, 'Calling...');
    document.getElementById('dialtone')?.play();
    socket.emit('call-user', { toRollNo: target, fromRollNo: currentUser.rollno });
    setTimeout(() => { if (btn) { btn.innerHTML = '<i class="fa-solid fa-phone"></i> <span>Start Call</span>'; btn.disabled = false; } }, 2000);
}

function handleIncomingCall(fromRollNo) {
    currentTargetRollNo = fromRollNo;
    const user = onlineUsers.find(u => u.rollno === fromRollNo);
    const name = user ? user.name : fromRollNo;
    if (document.getElementById('incoming-name')) document.getElementById('incoming-name').innerText = name;
    if (document.getElementById('incoming-avatar')) document.getElementById('incoming-avatar').innerText = name[0].toUpperCase();
    incomingPopup?.classList.remove('hidden');
    document.getElementById('ringtone')?.play();
}

async function acceptCall() {
    incomingPopup?.classList.add('hidden');
    document.getElementById('ringtone')?.pause();
    if (!document.getElementById('call-screen')) {
        localStorage.setItem('acceptCallFrom', currentTargetRollNo);
        window.location.href = 'dialer.html';
        return;
    }
    showCallScreen(currentTargetRollNo, 'Connecting...');
    socket.emit('accept-call', { toRollNo: currentTargetRollNo });
    await startWebRTCConnection(currentTargetRollNo, false);
    startCallTimer();
}

function rejectCall() {
    incomingPopup?.classList.add('hidden');
    document.getElementById('ringtone')?.pause();
    socket.emit('reject-call', { toRollNo: currentTargetRollNo });
    currentTargetRollNo = null;
}

function showCallScreen(name, status) {
    if (document.getElementById('call-name')) document.getElementById('call-name').innerText = name || "Unknown";
    const av = document.getElementById('call-avatar-text');
    if (av) av.innerText = (name || "?")[0].toUpperCase();
    if (document.getElementById('call-status')) document.getElementById('call-status').innerText = status || "";
    callScreen?.classList.remove('hidden');
}

function closeCallScreen() {
    callScreen?.classList.add('hidden');
    document.getElementById('dialtone')?.pause();
    document.getElementById('ringtone')?.pause();
    stopWebRTC?.();
    currentTargetRollNo = null;
    stopCallTimer();
}

// --- Call Controls ---
let isMuted = false;
document.getElementById('mute-btn')?.addEventListener('click', (e) => {
    isMuted = !isMuted;
    const btn = e.currentTarget;
    btn.style.backgroundColor = isMuted ? 'white' : '';
    btn.style.color = isMuted ? 'black' : '';
    if (window.localStream) window.localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
});

let callTimerInterval;
function startCallTimer() {
    stopCallTimer();
    let s = 0;
    callTimerInterval = setInterval(() => {
        s++;
        const m = Math.floor(s / 60).toString().padStart(2, '0');
        const sc = (s % 60).toString().padStart(2, '0');
        if (document.getElementById('call-status')) document.getElementById('call-status').innerText = `${m}:${sc}`;
    }, 1000);
}
function stopCallTimer() { clearInterval(callTimerInterval); }

// Event Listeners
if (document.getElementById('login-btn')) document.getElementById('login-btn').onclick = login;
if (document.getElementById('register-btn')) document.getElementById('register-btn').onclick = register;
if (document.getElementById('call-btn')) document.getElementById('call-btn').onclick = startCall;
if (document.getElementById('accept-call-btn')) document.getElementById('accept-call-btn').onclick = acceptCall;
if (document.getElementById('reject-call-btn')) document.getElementById('reject-call-btn').onclick = rejectCall;
document.getElementById('end-call-btn')?.addEventListener('click', () => {
    if (currentTargetRollNo) socket.emit('end-call', { toRollNo: currentTargetRollNo });
    closeCallScreen();
});
