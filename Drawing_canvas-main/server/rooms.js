const { v4: uuidv4 } = require('uuid');
const { createDrawingState } = require('./state');

function createRoomsManager() {
  const roomIdToRoom = new Map();

  function getOrCreateRoom(roomId) {
    if (!roomIdToRoom.has(roomId)) {
      roomIdToRoom.set(roomId, {
        id: roomId,
        users: new Map(), // userId -> { id, name, color }
        drawing: createDrawingState()
      });
    }
    return roomIdToRoom.get(roomId);
  }

  function randomColor() {
    const hues = [0, 30, 60, 120, 180, 210, 240, 270, 300];
    const hue = hues[Math.floor(Math.random() * hues.length)];
    return `hsl(${hue} 80% 55%)`;
  }

  function joinRoom(roomId, userId, name) {
    const room = getOrCreateRoom(roomId);
    const user = {
      id: userId,
      name: name || `User-${userId.slice(-4)}`,
      color: randomColor()
    };
    room.users.set(userId, user);
    const roomSnapshot = room.drawing.getSnapshot();
    return { user, roomSnapshot };
  }

  function leaveRoom(roomId, userId) {
    const room = getOrCreateRoom(roomId);
    const existed = room.users.delete(userId);
    return existed;
  }

  function getUsers(roomId) {
    const room = getOrCreateRoom(roomId);
    return Array.from(room.users.values());
  }

  function getSnapshot(roomId) {
    const room = getOrCreateRoom(roomId);
    return room.drawing.getSnapshot();
  }

  function startStroke(roomId, userId, meta) {
    const room = getOrCreateRoom(roomId);
    const opId = uuidv4();
    const normalizedMeta = {
      opId,
      userId,
      color: meta?.color || '#000000',
      width: Math.max(1, Math.min(64, Number(meta?.width || 2))),
      mode: meta?.mode === 'erase' ? 'erase' : 'draw'
    };
    room.drawing.startStroke(normalizedMeta);
    return { opId, meta: normalizedMeta };
  }

  function appendStrokePoints(roomId, userId, opId, points) {
    const room = getOrCreateRoom(roomId);
    room.drawing.appendStrokePoints(opId, points, userId);
  }

  function endStroke(roomId, userId, opId) {
    const room = getOrCreateRoom(roomId);
    return room.drawing.endStroke(opId, userId);
  }

  function undo(roomId) {
    const room = getOrCreateRoom(roomId);
    return room.drawing.undo();
  }

  function redo(roomId) {
    const room = getOrCreateRoom(roomId);
    return room.drawing.redo();
  }

  return {
    joinRoom,
    leaveRoom,
    getUsers,
    startStroke,
    appendStrokePoints,
    endStroke,
    undo,
    redo
  };
}

module.exports = { createRoomsManager };

