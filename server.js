const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const lobbies = new Map();
app.use(express.static('public'));

function generateLobbyCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on('connection', (socket) => {
    console.log('🎮 Player connected!');
    
    socket.on('create-lobby', (data) => {
        const lobbyCode = generateLobbyCode();
        const lobby = {
            code: lobbyCode,
            hostId: socket.id,
            players: [{
                id: socket.id,
                name: data.playerName,
                isHost: true,
                carColor: 'blue'
            }],
            status: 'waiting'
        };
        lobbies.set(lobbyCode, lobby);
        socket.join(lobbyCode);
        socket.emit('lobby-created', { code: lobbyCode, players: lobby.players });
        console.log(`🏠 Lobby: ${lobbyCode}`);
    });
    
    socket.on('join-lobby', (data) => {
        const lobby = lobbies.get(data.lobbyCode);
        if (!lobby) {
            socket.emit('join-error', { message: 'Lobby not found!' });
            return;
        }
        if (lobby.players.length >= 2) {
            socket.emit('join-error', { message: 'Lobby full!' });
            return;
        }
        lobby.players.push({
            id: socket.id,
            name: data.playerName,
            isHost: false,
            carColor: 'orange'
        });
        socket.join(data.lobbyCode);
        socket.emit('join-success', { lobbyCode: data.lobbyCode, players: lobby.players });
        socket.to(data.lobbyCode).emit('player-joined', { players: lobby.players });
        console.log(`👤 ${data.playerName} joined`);
    });
    
    socket.on('start-game', (data) => {
        const lobby = lobbies.get(data.lobbyCode);
        if (lobby && lobby.hostId === socket.id) {
            lobby.status = 'playing';
            io.to(data.lobbyCode).emit('game-starting', { players: lobby.players });
            console.log(`🎮 Game starting!`);
        }
    });
    
    socket.on('disconnect', () => {
        console.log('❌ Player disconnected');
        for (const [code, lobby] of lobbies.entries()) {
            const playerIndex = lobby.players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                lobby.players.splice(playerIndex, 1);
                if (lobby.players.length === 0) {
                    lobbies.delete(code);
                } else {
                    io.to(code).emit('player-left', { players: lobby.players });
                }
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`
    ╔═══════════════════════════════════╗
    ║     🚗 ROCKET-BALL MULTIPLAYER 🚗 ║
    ╚═══════════════════════════════════╝
    ✅ Server running on port ${PORT}
    `);
});