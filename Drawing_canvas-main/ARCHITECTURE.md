# Architecture

This document explains the data flow, WebSocket protocol, undo/redo strategy, performance choices, and conflict resolution for the collaborative canvas.

## Data Flow

1. User selects tool/color/width and begins drawing on the canvas.
2. Client emits `op:stroke:start` to the server with drawing metadata.
3. Client streams points in small batches via `op:stroke:points` during pointer move.
4. Client emits `op:stroke:end` when the stroke finishes.
5. Server broadcasts these events to all clients in the room in real time for smooth live rendering.
6. When a stroke is committed (`op:stroke:end`), the server appends it to the room's operation list and clears the redo stack.
7. Undo/Redo manipulates the room's operation list; clients redraw the canvas from the operation list.

```
[Pointer Events] -> [Client (Canvas)] -> [Socket.io] -> [Server (Rooms + State)]
                                                        | 
                                                        v
                                              [Broadcast to Room]
                                                        |
                                                        v
                                               [Clients Redraw]
```

## WebSocket Protocol

- `room:join { roomId, name } -> ack { ok, userId, room }`
- `cursor:update { x, y }`
- `op:stroke:start { color, width, mode } -> broadcast { userId, opId, meta }`
- `op:stroke:points { opId, points:[{x,y}] } -> broadcast { userId, opId, points }`
- `op:stroke:end { opId } -> broadcast commit { opId }`
- `op:undo -> broadcast { opId }`
- `op:redo -> broadcast { opId }`
- `room:users -> [ { id, name, color } ]` (server pushes on join/leave)
- `user:join { userId, user }`, `user:leave { userId }`

Notes:
- `mode` is `draw` or `erase`. Eraser uses `destination-out` compositing.
- On `redo`, the prototype implementation triggers a resync by rejoining to get a fresh snapshot (simplifies client logic). This could be upgraded to broadcast the full op payload directly.

## Global Undo/Redo Strategy

- The server maintains a per-room operation list (array) of committed strokes in order.
- `undo` pops the last operation off the list and pushes it onto a redo stack; server broadcasts `op:undo` with the popped `opId`. Clients remove the op from their local list and redraw.
- `redo` pops the last item from the redo stack and pushes it back into the operation list. The prototype triggers a resync on clients to refresh state (to avoid sending the full op payload). This is an easy trade-off; a production version would rebroadcast the operation payload.
- Undo/Redo are global: they act on the last committed operation regardless of which user created it. This ensures consistent order and behavior in all clients.

## Performance Decisions

- Canvas is redrawn only on meaningful changes:
  - Live in-progress strokes are drawn incrementally as points arrive.
  - Full redraw happens on undo/remove or when a fresh snapshot is loaded.
- Points are batched on the client at ~16ms to reduce event spam while keeping latency low.
- Light stroke smoothing via quadratic curves for better visuals without heavy computation.
- Device Pixel Ratio-aware canvas resize for crisp rendering.

Future optimizations:
- Send full op payload on redo to avoid resyncs.
- Use path approximation/decimation (e.g., RDP) for long freehand strokes.
- Layered offscreen canvases to avoid full redraws.

## Conflict Resolution

- Server is authoritative for operation ordering (last-writer wins by arrival order).
- Overlapping drawings naturally composite by order of commit.
- Eraser uses `destination-out` which non-destructively erases pixels from what has been drawn so far.
- Client-side prediction draws locally while the server confirms and assigns an `opId`. This keeps drawing smooth even under latency.

## Rooms and Users

- Each room has:
  - Users map `{ id, name, color }`
  - Drawing state `{ operations[], redoStack[], inProgress }`
- Users are assigned distinctive HSL colors for indicators and defaults.

## Error Handling

- Server handlers are guarded; invalid operations are ignored.
- Client UI shows connection status and basic latency.

## Scaling Discussion (Outline)

- Horizontal scale via Socket.io adapters (e.g., Redis) for multi-node broadcast.
- Persist operations in a DB per room with time-ordered IDs.
- Use CDN for static assets; terminate WebSockets at an ELB/ingress with sticky sessions.
- For 1000+ concurrent users in a room, consider:
  - Rate limiting, adaptive batching, or sampling cursor updates.
  - Delta compression for point streams.
  - OffscreenCanvas and Web Workers for rendering off main thread.


