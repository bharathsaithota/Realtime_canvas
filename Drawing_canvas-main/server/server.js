const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { createRoomsManager } = require('./rooms');

const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, '..', 'client')));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*'
  }
});

const rooms = createRoomsManager();

io.on('connection', (socket) => {
  let currentRoomId = null;
  let userId = socket.id;

  socket.on('room:join', (payload, ack) => {
    try {
      const { roomId, name } = payload || {};
      currentRoomId = roomId || 'lobby';
      const joinInfo = rooms.joinRoom(currentRoomId, userId, name);
      socket.join(currentRoomId);
      // Inform others
      socket.to(currentRoomId).emit('user:join', { userId, user: joinInfo.user });
      // Acknowledge with room snapshot
      ack && ack({ ok: true, room: joinInfo.roomSnapshot, userId });
      // Send online list to room
      io.to(currentRoomId).emit('room:users', rooms.getUsers(currentRoomId));
    } catch (e) {
      ack && ack({ ok: false, error: e.message });
    }
  });

  socket.on('cursor:update', (data) => {
    if (!currentRoomId) return;
    socket.to(currentRoomId).emit('cursor:update', { userId, ...data });
  });

  // Start a stroke operation (ack returns opId to initiator to avoid races)
  socket.on('op:stroke:start', (data, ack) => {
    if (!currentRoomId) return;
    const opStart = rooms.startStroke(currentRoomId, userId, data);
    // Ack initiator with opId
    ack && ack({ ok: true, opId: opStart.opId, meta: opStart.meta });
    // Broadcast that a stroke started (tool/color/width/mode) to room
    io.to(currentRoomId).emit('op:stroke:start', { userId, opId: opStart.opId, meta: opStart.meta });
  });

  // Stream points for an in-progress stroke
  socket.on('op:stroke:points', (data) => {
    if (!currentRoomId) return;
    const { opId, points } = data || {};
    rooms.appendStrokePoints(currentRoomId, userId, opId, points);
    socket.to(currentRoomId).emit('op:stroke:points', { userId, opId, points });
  });

  // End a stroke operation (commit)
  socket.on('op:stroke:end', (data) => {
    if (!currentRoomId) return;
    const { opId } = data || {};
    const committed = rooms.endStroke(currentRoomId, userId, opId);
    if (committed) {
      io.to(currentRoomId).emit('op:stroke:commit', { opId: committed.opId });
      
      // --- FIX ---
      // Removed snapshot broadcast. This was wiping client's predicted strokes.
      // io.to(currentRoomId).emit('room:snapshot', rooms.getSnapshot(currentRoomId));
      // --- END FIX ---
    }
  });

  // Global undo: remove last committed op (any user)
  socket.on('op:undo', () => {
    if (!currentRoomId) return;
    const undone = rooms.undo(currentRoomId);
    if (undone) {
      io.to(currentRoomId).emit('op:undo', { opId: undone.opId });
      
      // --- FIX ---
      // Removed snapshot broadcast. This was wiping client's predicted strokes.
      // io.to(currentRoomId).emit('room:snapshot', rooms.getSnapshot(currentRoomId));
      // --- END FIX ---
    }
  });

  // Global redo: re-apply next op
  socket.on('op:redo', () => {
    if (!currentRoomId) return;
    const redone = rooms.redo(currentRoomId);
    if (redone) {
      // Send full op so clients can apply without resync
      io.to(currentRoomId).emit('op:redo', { op: redone });

      // --- FIX ---
      // Removed snapshot broadcast. This was wiping client's predicted strokes.
      // io.to(currentRoomId).emit('room:snapshot', rooms.getSnapshot(currentRoomId));
      // --- END FIX ---
    }
  });

  socket.on('disconnect', () => {
    if (!currentRoomId) return;
    const left = rooms.leaveRoom(currentRoomId, userId);
    if (left) {
      socket.to(currentRoomId).emit('user:leave', { userId });
      io.to(currentRoomId).emit('room:users', rooms.getUsers(currentRoomId));
    }
  });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server running on http://localhost:${PORT}`);
});