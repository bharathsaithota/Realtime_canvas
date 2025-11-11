(() => {
  const socket = io();

  const ws = {
    connected: false,
    userId: null,
    user: null,
    join(roomId, name) {
      return new Promise((resolve) => {
        socket.emit('room:join', { roomId, name }, (res) => {
          if (res?.ok) {
            ws.userId = res.userId;
          }
          resolve(res);
        });
      });
    },
    emitAck(event, data) {
      return new Promise((resolve) => {
        socket.emit(event, data, (res) => resolve(res));
      });
    },
    on(event, cb) {
      socket.on(event, cb);
    },
    off(event, cb) {
      socket.off(event, cb);
    },
    emit(event, data) {
      socket.emit(event, data);
    }
  };

  socket.on('connect', () => {
    ws.connected = true;
    document.dispatchEvent(new CustomEvent('ws:connect'));
  });
  socket.on('disconnect', () => {
    ws.connected = false;
    document.dispatchEvent(new CustomEvent('ws:disconnect'));
  });

  window.CollabWS = ws;
})();

