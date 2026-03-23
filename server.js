const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve static files
app.use(express.static('public'));

// Store game rooms
const rooms = new Map();

// Generate random room code
function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on('connection', (socket) => {
    console.log('🎮 Player connected:', socket.id);
    
    // Create a new game room
    socket.on('create-room', (data) => {
        const roomCode = generateRoomCode();
        const room = {
            code: roomCode,
            host: socket.id,
            players: [{
                id: socket.id,
                name: data.playerName,
                carColor: 'blue'
            }],
            gameState: null,
            status: 'waiting'
        };
        
        rooms.set(roomCode, room);
        socket.join(roomCode);
        
        socket.emit('lobby-created', {
            code: roomCode,
            players: room.players
        });
        
        console.log(`🏠 Room created: ${roomCode} by ${data.playerName}`);
    });
    
    // Join an existing room
    socket.on('join-room', (data) => {
        const room = rooms.get(data.roomCode);
        
        if (!room) {
            socket.emit('error', { message: 'Room not found!' });
            return;
        }
        
        if (room.players.length >= 2) {
            socket.emit('error', { message: 'Room is full!' });
            return;
        }
        
        if (room.status === 'playing') {
            socket.emit('error', { message: 'Game already started!' });
            return;
        }
        
        // Add player as orange car
        room.players.push({
            id: socket.id,
            name: data.playerName,
            carColor: 'orange'
        });
        
        socket.join(data.roomCode);
        
        // Tell joining player they succeeded
        socket.emit('room-joined', {
            roomCode: data.roomCode,
            players: room.players,
            isHost: false
        });
        
        // Tell host that someone joined
        socket.to(data.roomCode).emit('player-joined', {
            players: room.players
        });
        
        console.log(`👤 ${data.playerName} joined room ${data.roomCode}`);
    });
    
    // Start the game
    socket.on('start-game', (data) => {
        const room = rooms.get(data.roomCode);
        if (!room) return;
        
        // Check if the person trying to start is the host
        if (room.host !== socket.id) {
            socket.emit('error', { message: 'Only the host can start the game!' });
            return;
        }
        
        room.status = 'playing';
        
        // Tell everyone in the room that game is starting
        io.to(data.roomCode).emit('game-starting', {
            players: room.players
        });
        
        console.log(`🎮 Game started in room ${data.roomCode}`);
    });
    
    // Game update - send to other player
    socket.on('game-update', (data) => {
        const room = rooms.get(data.roomCode);
        if (!room || room.status !== 'playing') return;
        
        socket.to(data.roomCode).emit('game-update', {
            playerId: socket.id,
            car: data.car,
            ball: data.ball,
            score: data.score
        });
    });
    
    // Goal scored
    socket.on('goal', (data) => {
        const room = rooms.get(data.roomCode);
        if (!room) return;
        
        io.to(data.roomCode).emit('goal', {
            team: data.team,
            score: data.score
        });
    });
    
    // Player disconnect
    socket.on('disconnect', () => {
        console.log('❌ Player disconnected:', socket.id);
        
        // Find and remove player from any room
        for (const [code, room] of rooms.entries()) {
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                room.players.splice(playerIndex, 1);
                socket.leave(code);
                
                if (room.players.length === 0) {
                    rooms.delete(code);
                    console.log(`🗑️ Room ${code} deleted (empty)`);
                } else {
                    io.to(code).emit('player-left', { players: room.players });
                    console.log(`👋 Player left room ${code}`);
                }
                break;
            }
        }
    });
});

// Use environment port or 3000 for local
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`
    ╔═══════════════════════════════════════╗
    ║     🚗 ROCKET-BALL MULTIPLAYER 🚗     ║
    ╚═══════════════════════════════════════╝
    
    ✅ Server running on port ${PORT}
    🌐 Local: http://localhost:${PORT}
    🌐 Live: https://rocket-ball.onrender.com
    `);
});