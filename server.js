const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.static('public'));

const rooms = new Map();

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on('connection', (socket) => {
    console.log('🎮 Player connected:', socket.id);
    
    socket.on('create-room', (data) => {
        const roomCode = generateRoomCode();
        const room = {
            code: roomCode,
            host: socket.id,
            players: [{ id: socket.id, name: data.playerName, carColor: 'blue' }],
            status: 'waiting'
        };
        rooms.set(roomCode, room);
        socket.join(roomCode);
        socket.emit('lobby-created', { code: roomCode, players: room.players });
        console.log(`🏠 Room created: ${roomCode}`);
    });
    
    socket.on('join-room', (data) => {
        const room = rooms.get(data.roomCode);
        if (!room) { socket.emit('error', { message: 'Room not found!' }); return; }
        if (room.players.length >= 2) { socket.emit('error', { message: 'Room full!' }); return; }
        if (room.status === 'playing') { socket.emit('error', { message: 'Game started!' }); return; }
        
        room.players.push({ id: socket.id, name: data.playerName, carColor: 'orange' });
        socket.join(data.roomCode);
        socket.emit('room-joined', { roomCode: data.roomCode, players: room.players });
        socket.to(data.roomCode).emit('player-joined', { players: room.players });
        console.log(`👤 ${data.playerName} joined`);
    });
    
    socket.on('start-game', (data) => {
        const room = rooms.get(data.roomCode);
        if (room && room.host === socket.id) {
            room.status = 'playing';
            io.to(data.roomCode).emit('game-starting', { players: room.players });
            console.log(`🎮 Game starting!`);
        }
    });
    
    socket.on('opponent-update', (data) => {
        socket.to(data.roomCode).emit('opponent-update', { car: data.car });
    });
    
    socket.on('ball-update', (data) => {
        socket.to(data.roomCode).emit('ball-update', { ball: data.ball, score: data.score });
    });
    
    // NEW: Demolition event
    socket.on('demolition', (data) => {
        socket.to(data.roomCode).emit('demolition', { target: data.target });
    });
    
    socket.on('goal', (data) => {
        io.to(data.roomCode).emit('goal', { team: data.team, score: data.score });
    });
    
    socket.on('reset-cars', (data) => {
        socket.to(data.roomCode).emit('reset-cars', {});
    });
    
    socket.on('disconnect', () => {
        console.log('❌ Player disconnected:', socket.id);
        for (const [code, room] of rooms.entries()) {
            const idx = room.players.findIndex(p => p.id === socket.id);
            if (idx !== -1) {
                room.players.splice(idx, 1);
                if (room.players.length === 0) rooms.delete(code);
                else io.to(code).emit('player-left', { players: room.players });
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});