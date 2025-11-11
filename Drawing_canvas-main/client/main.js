(() => {
  const ws = window.CollabWS;
  const canvasApi = window.CollabCanvas;

  const nameInput = document.getElementById('nameInput');
  const roomInput = document.getElementById('roomInput');
  const joinBtn = document.getElementById('joinBtn');

  function setConnectedUI(connected) {
    canvasApi.setStatus(connected ? 'Connected' : 'Disconnected');
    joinBtn.disabled = !connected;
  }

  document.addEventListener('ws:connect', () => setConnectedUI(true));
  document.addEventListener('ws:disconnect', () => setConnectedUI(false));

  async function join() {
    const name = nameInput.value.trim() || undefined;
    const roomId = roomInput.value.trim() || 'lobby';
    const t0 = performance.now();
    const res = await ws.join(roomId, name);
    const t1 = performance.now();
    canvasApi.perf(`Join latency: ${Math.round(t1 - t0)}ms`);
    if (res?.ok) {
      canvasApi.loadSnapshot(res.room);
      canvasApi.setStatus(`Joined room "${roomId}"`);
    } else {
      canvasApi.setStatus(`Join failed: ${res?.error || 'unknown error'}`);
    }
  }

  joinBtn.addEventListener('click', join);

  document.addEventListener('ws:resync', join);
})();

