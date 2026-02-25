const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const supabase = require('./supabaseClient');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from the frontend folder
const path = require('path');
app.use(express.static(path.join(__dirname, '../frontend')));

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// API: Register User
app.post('/register', async (req, res) => {
    // Log request body for debugging
    console.log('Register request body:', req.body);

    const { rollno, name, email } = req.body;

    // Validation
    if (!rollno || !/^[a-zA-Z0-9]+$/.test(rollno)) {
        return res.status(400).json({ success: false, message: 'Invalid Roll Number (Alphanumeric only)' });
    }

    try {
        const insertData = { rollno, name: name || 'User', online: false };
        if (email) insertData.email = email;

        const { data, error } = await supabase
            .from('users')
            .insert([insertData])
            .select();

        if (error) {
            console.error('Supabase error:', error);
            if (error.code === '23505') { // Unique violation
                return res.status(400).json({ success: false, message: 'Roll Number already exists' });
            }
            throw error;
        }
        res.status(201).json({ success: true, user: data[0] });
    } catch (error) {
        console.error('Register internal error:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error: ' + error.message });
    }
});

// API: Login User
app.post('/login', async (req, res) => {
    const { rollno } = req.body;

    if (!rollno || !/^[a-zA-Z0-9]+$/.test(rollno)) {
        return res.status(400).json({ success: false, message: 'Invalid Roll Number' });
    }

    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('rollno', rollno)
            .single();

        if (error || !data) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.status(200).json({ success: true, user: data });
    } catch (error) {
        console.error('Login error:', error);
        res.status(400).json({ success: false, message: error.message });
    }
});

// API: Get User by Roll Number
app.get('/user/:rollno', async (req, res) => {
    const { rollno } = req.params;
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('rollno', rollno)
            .single();

        if (error || !data) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        res.status(200).json({ success: true, user: data });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(400).json({ success: false, message: error.message });
    }
});

// Socket.io Signaling
io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);

    async function broadcastOnlineUsers() {
        try {
            const { data, error } = await supabase
                .from('users')
                .select('rollno, name, email, online')
                .eq('online', true);

            if (!error && data) {
                io.emit('online-users-update', data);
            }
        } catch (error) {
            console.error('Error broadcasting online users:', error);
        }
    }

    socket.on('register-user', async (rollno) => {
        try {
            await supabase
                .from('users')
                .update({ socket_id: socket.id, online: true })
                .eq('rollno', rollno);

            socket.rollno = rollno;
            console.log(`User ${rollno} registered with socket ${socket.id}`);
            broadcastOnlineUsers(); // Broadcast update
        } catch (error) {
            console.error('Error updating status:', error);
        }
    });

    socket.on('call-user', async ({ toRollNo, fromRollNo }) => {
        console.log(`Call request from ${fromRollNo} to ${toRollNo}`);
        const socketId = await findSocketByRollNo(toRollNo);
        if (socketId) {
            io.to(socketId).emit('incoming-call', { fromRollNo });
        } else {
            socket.emit('call-failed', { message: 'User is offline' });
        }
    });

    socket.on('accept-call', async ({ toRollNo }) => {
        console.log(`Call accepted by ${socket.rollno} for ${toRollNo}`);
        const socketId = await findSocketByRollNo(toRollNo);
        if (socketId) {
            io.to(socketId).emit('call-accepted', { fromRollNo: socket.rollno });
        }
    });

    socket.on('reject-call', async ({ toRollNo }) => {
        console.log(`Call rejected by ${socket.rollno} for ${toRollNo}`);
        const socketId = await findSocketByRollNo(toRollNo);
        if (socketId) {
            io.to(socketId).emit('call-rejected', { fromRollNo: socket.rollno });
        }
    });

    socket.on('offer', async ({ toRollNo, offer }) => {
        const socketId = await findSocketByRollNo(toRollNo);
        if (socketId) {
            io.to(socketId).emit('offer', { offer, fromRollNo: socket.rollno });
        }
    });

    socket.on('answer', async ({ toRollNo, answer }) => {
        const socketId = await findSocketByRollNo(toRollNo);
        if (socketId) {
            io.to(socketId).emit('answer', { answer, fromRollNo: socket.rollno });
        }
    });

    socket.on('ice-candidate', async ({ toRollNo, candidate }) => {
        const socketId = await findSocketByRollNo(toRollNo);
        if (socketId) {
            io.to(socketId).emit('ice-candidate', { candidate });
        }
    });

    socket.on('end-call', async ({ toRollNo }) => {
        const socketId = await findSocketByRollNo(toRollNo);
        if (socketId) {
            io.to(socketId).emit('end-call');
        }
    });

    socket.on('send-message', async ({ toRollNo, message }) => {
        console.log(`Message from ${socket.rollno} to ${toRollNo}: ${message}`);
        const socketId = await findSocketByRollNo(toRollNo);
        if (socketId) {
            io.to(socketId).emit('incoming-message', { fromRollNo: socket.rollno, message });
        }
    });

    socket.on('disconnect', async () => {
        if (socket.rollno) {
            console.log('User disconnected:', socket.rollno);
            try {
                await supabase
                    .from('users')
                    .update({ online: false, socket_id: null })
                    .eq('rollno', socket.rollno);
                broadcastOnlineUsers(); // Broadcast update
            } catch (error) {
                console.error('Error on disconnect:', error);
            }
        }
    });

    async function findSocketByRollNo(rollno) {
        try {
            const { data, error } = await supabase
                .from('users')
                .select('socket_id, online')
                .eq('rollno', rollno)
                .single();
            if (data && data.online) {
                return data.socket_id;
            }
            return null;
        } catch (error) {
            return null;
        }
    }
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
