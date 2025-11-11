function createDrawingState() {
  // operations: array of committed stroke ops in order
  // each op: { opId, userId, mode: 'draw'|'erase', color, width, points: [{x,y}] }
  const operations = [];
  // inProgress: opId -> { meta, points }
  const inProgress = new Map();
  // undo/redo pointer represented by a stack of removed ops
  const redoStack = [];

  function getSnapshot() {
    return {
      operations: operations.map(o => ({
        opId: o.opId,
        userId: o.userId,
        mode: o.mode,
        color: o.color,
        width: o.width,
        points: o.points
      }))
    };
  }

  function startStroke(meta) {
    inProgress.set(meta.opId, { meta, points: [] });
  }

  function appendStrokePoints(opId, points, userId) {
    const p = inProgress.get(opId);
    if (!p) return;
    if (p.meta.userId !== userId) return;
    if (!Array.isArray(points) || points.length === 0) return;
    for (const pt of points) {
      if (typeof pt?.x === 'number' && typeof pt?.y === 'number') {
        p.points.push({ x: pt.x, y: pt.y });
      }
    }
  }

  function endStroke(opId, userId) {
    const p = inProgress.get(opId);
    if (!p) return null;
    if (p.meta.userId !== userId) return null;
    inProgress.delete(opId);
    if (p.points.length < 1) return null;
    const op = {
      opId: p.meta.opId,
      userId: p.meta.userId,
      mode: p.meta.mode,
      color: p.meta.color,
      width: p.meta.width,
      points: p.points
    };
    operations.push(op);
    // clear redo stack on new commit
    redoStack.length = 0;
    return op;
  }

  function undo() {
    if (operations.length === 0) return null;
    const op = operations.pop();
    redoStack.push(op);
    return op;
  }

  function redo() {
    if (redoStack.length === 0) return null;
    const op = redoStack.pop();
    operations.push(op);
    return op;
  }

  return {
    getSnapshot,
    startStroke,
    appendStrokePoints,
    endStroke,
    undo,
    redo
  };
}

module.exports = { createDrawingState };

