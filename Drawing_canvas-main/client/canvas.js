(() => {
  const canvas = document.getElementById('canvas');
  const cursorsLayer = document.getElementById('cursorsLayer');
  const statusEl = document.getElementById('status');
  const perfEl = document.getElementById('perf');
  const onlineList = document.getElementById('onlineList');

  const ws = window.CollabWS;

  // Resize canvas to device pixel ratio
  const ctx = canvas.getContext('2d');
  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    redrawAll();
  }
  window.addEventListener('resize', resizeCanvas);
  // First layout pass: ensure parent has size
  window.addEventListener('load', () => {
    // Give main layout a tick before measuring
    setTimeout(resizeCanvas, 0);
  });

  // Local state
  const state = {
    mode: 'draw', // 'draw' | 'erase'
    color: '#1f6feb',
    width: 4,
    drawing: false,
    currentOpId: null,
    // --- MODIFIED ---
    // Store the promise that resolves with the opId to fix race condition
    currentOpIdPromise: null, 
    // --- END MODIFIED ---
    currentPointsBatch: [],
    batchTimer: null,
    operations: [], // committed ops from server
    opIdToOp: new Map(),
    userMap: new Map(),
    userColors: new Map(),
    remoteCursors: new Map()
  };

  function setStatus(text) {
    statusEl.textContent = text;
  }

  // Toolbar bindings
  const toolBrush = document.getElementById('toolBrush');
  const toolEraser = document.getElementById('toolEraser');
  const colorPicker = document.getElementById('colorPicker');
  const widthRange = document.getElementById('widthRange');
  const widthDisplay = document.getElementById('widthDisplay');
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');

  function setTool(mode) {
    state.mode = mode;
    toolBrush.classList.toggle('active', mode === 'draw');
    toolEraser.classList.toggle('active', mode === 'erase');
  }
  toolBrush.addEventListener('click', () => setTool('draw'));
  toolEraser.addEventListener('click', () => setTool('erase'));
  colorPicker.addEventListener('input', (e) => {
    state.color = e.target.value;
  });
  widthRange.addEventListener('input', (e) => {
    const w = Number(e.target.value);
    state.width = w;
    widthDisplay.textContent = String(w);
  });
  undoBtn.addEventListener('click', () => ws.emit('op:undo'));
  redoBtn.addEventListener('click', () => ws.emit('op:redo'));
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      ws.emit('op:undo');
    } else if (e.ctrlKey && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      ws.emit('op:redo');
    }
  });

  // Cursor utilities
  function updateRemoteCursor(userId, x, y, color, name) {
    let el = state.remoteCursors.get(userId);
    if (!el) {
      el = document.createElement('div');
      el.className = 'cursor';
      el.innerHTML = '<div class="pin"></div><div class="label"></div>';
      cursorsLayer.appendChild(el);
      state.remoteCursors.set(userId, el);
    }
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    const pin = el.querySelector('.pin');
    pin.style.background = color;
    const label = el.querySelector('.label');
    label.textContent = name || userId.slice(-4);
  }
  function removeRemoteCursor(userId) {
    const el = state.remoteCursors.get(userId);
    if (el) {
      el.remove();
      state.remoteCursors.delete(userId);
    }
  }

  // Online list render
  function renderOnline(users) {
    onlineList.innerHTML = '';
    for (const u of users) {
      state.userMap.set(u.id, u);
      state.userColors.set(u.id, u.color);
      const li = document.createElement('li');
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = u.color;
      const name = document.createElement('span');
      name.textContent = u.name;
      li.appendChild(dot);
      li.appendChild(name);
      onlineList.appendChild(li);
    }
  }

  // Rendering
  function drawStroke(op) {
    if (!op || !op.points || op.points.length === 0) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = op.width;
    if (op.mode === 'erase') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = op.color;
    }
    ctx.beginPath();
    const pts = op.points;
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      const prev = pts[i - 1];
      // Simple smoothing via quadratic curve
      const midX = (prev.x + p.x) / 2;
      const midY = (prev.y + p.y) / 2;
      ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
    }
    ctx.stroke();
    ctx.restore();
  }

  function redrawAll() {
    // Clear in device pixels independent of current transform
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    for (const op of state.operations) {
      drawStroke(op);
    }
  }

  // Pointer helpers
  function getRelativePos(evt) {
    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in evt) ? evt.touches[0].clientX : evt.clientX;
    const y = ('touches' in evt) ? evt.touches[0].clientY : evt.clientY;
    return { x: x - rect.left, y: y - rect.top };
  }

  function streamBatchPoints() {
    if (!state.drawing || !state.currentOpId) return;
    if (state.currentPointsBatch.length === 0) return;
    ws.emit('op:stroke:points', {
      opId: state.currentOpId,
      points: state.currentPointsBatch
    });
    state.currentPointsBatch = [];
  }

  // --- MODIFIED ---
  function beginStroke(x, y) {
    state.drawing = true;
    state.currentPointsBatch = [];
    const meta = {
      color: state.color,
      width: state.width,
      mode: state.mode
    };

    // We do client-side prediction: draw locally as we go
    state.predictedOp = {
      // opId will be synced by server; for prediction we use temp
      opId: '__local__',
      userId: ws.userId,
      mode: meta.mode,
      color: meta.color,
      width: meta.width,
      points: [{ x, y }]
    };
    drawStroke(state.predictedOp);
    
    // Request opId via ack to avoid race with endStroke
    // Store the promise so endStroke can await it
    state.currentOpIdPromise = ws.emitAck('op:stroke:start', meta).then((res) => {
      if (res?.ok && res.opId) {
        state.currentOpId = res.opId;
      } else {
        console.error("Failed to get opId from server.");
      }
    });
  }
  // --- END MODIFIED ---

  function continueStroke(x, y) {
    if (!state.drawing) return;
    state.predictedOp.points.push({ x, y });
    drawStroke(state.predictedOp);
    state.currentPointsBatch.push({ x, y });
    if (!state.batchTimer) {
      state.batchTimer = setTimeout(() => {
        state.batchTimer = null;
        streamBatchPoints();
      }, 16);
    }
  }

  // --- MODIFIED ---
  // Made async to await the opId promise, removed faulty timeout logic
  async function endStroke() {
    if (!state.drawing) return;
    state.drawing = false;
    streamBatchPoints(); // Stream any final points

    // Wait if opId promise hasn't resolved yet
    // This fixes the race condition
    if (state.currentOpIdPromise) {
      await state.currentOpIdPromise;
    }

    // Now state.currentOpId should be set (or was null if server failed)
    if (state.currentOpId) {
      ws.emit('op:stroke:end', { opId: state.currentOpId });
      state.currentOpId = null;
      state.predictedOp = null;
      state.currentOpIdPromise = null; // Clear the promise
    } else {
      // give up; no-op
      console.warn("No opId, stroke was not committed.");
      state.predictedOp = null;
      state.currentOpIdPromise = null; // Clear the promise
    }
  }
  // --- END MODIFIED ---

  // Mouse/touch bindings
  let isPointerDown = false;
  canvas.addEventListener('mousedown', (e) => {
    if (!ws.connected) return;
    const { x, y } = getRelativePos(e);
    isPointerDown = true;
    beginStroke(x, y);
  });
  canvas.addEventListener('mousemove', (e) => {
    const { x, y } = getRelativePos(e);
    if (isPointerDown) {
      continueStroke(x, y);
    }
    ws.emit('cursor:update', { x, y });
  });
  window.addEventListener('mouseup', () => {
    if (isPointerDown) {
      isPointerDown = false;
      endStroke(); // This will now run async
    }
  });
  // Touch
  canvas.addEventListener('touchstart', (e) => {
    if (!ws.connected) return;
    const { x, y } = getRelativePos(e);
    isPointerDown = true;
    beginStroke(x, y);
  }, { passive: true });
  canvas.addEventListener('touchmove', (e) => {
    const { x, y } = getRelativePos(e);
    if (isPointerDown) {
      continueStroke(x, y);
    }
    ws.emit('cursor:update', { x, y });
  }, { passive: true });
  window.addEventListener('touchend', () => {
    if (isPointerDown) {
      isPointerDown = false;
      endStroke(); // This will now run async
    }
  }, { passive: true });

  // WS events
  ws.on('op:stroke:start', (msg) => {
    // Assign op id on first start for local prediction
    if (msg.userId === ws.userId && !state.currentOpId) {
      state.currentOpId = msg.opId;
    }
    // initialize remote temp op for live rendering
    state.opIdToOp.set(msg.opId, {
      opId: msg.opId,
      userId: msg.userId,
      mode: msg.meta.mode,
      color: msg.meta.color,
      width: msg.meta.width,
      points: []
    });
  });

  ws.on('op:stroke:points', (msg) => {
    const op = state.opIdToOp.get(msg.opId);
    if (!op) return;
    op.points.push(...msg.points);
    drawStroke(op);
  });

  ws.on('op:stroke:commit', (msg) => {
    const op = state.opIdToOp.get(msg.opId);
    if (!op) return;
    state.operations.push(op);
    state.opIdToOp.delete(msg.opId);
  });

  ws.on('op:undo', (msg) => {
    const idx = state.operations.findIndex(o => o.opId === msg.opId);
    if (idx >= 0) {
      state.operations.splice(idx, 1);
      redrawAll();
    }
  });
  ws.on('op:redo', (msg) => {
    if (msg?.op) {
      state.operations.push(msg.op);
      drawStroke(msg.op);
    } else {
      // Fallback: request resync if server didn't send payload
      document.dispatchEvent(new CustomEvent('ws:resync'));
    }
  });

  // Full snapshot convergence
  ws.on('room:snapshot', (snapshot) => {
    if (snapshot && Array.isArray(snapshot.operations)) {
      state.operations = snapshot.operations;
      state.opIdToOp.clear();
      redrawAll();
    }
  });

  ws.on('cursor:update', ({ userId, x, y }) => {
    const user = state.userMap.get(userId);
    const color = user?.color || '#999';
    const name = user?.name || userId.slice(-4);
    updateRemoteCursor(userId, x, y, color, name);
  });
  ws.on('user:leave', ({ userId }) => {
    removeRemoteCursor(userId);
  });
  ws.on('room:users', (users) => {
    renderOnline(users);
  });

  // Expose APIs used by main.js
  window.CollabCanvas = {
    loadSnapshot(snapshot) {
      state.operations = snapshot.operations || [];
      state.opIdToOp.clear();
      redrawAll();
    },
    setStatus,
    perf(text) {
      perfEl.textContent = text;
    }
  };
})();
