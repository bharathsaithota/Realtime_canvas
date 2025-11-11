# Collaborative Canvas

A multi-user, real-time collaborative drawing app using vanilla JavaScript + HTML5 Canvas on the client and Node.js + Socket.io on the backend.

## Features

- Brush and eraser tools
- Color picker and stroke width
- Real-time drawing sync (streamed while drawing)
- Live cursor indicators for other users
- Global undo/redo (affects entire room history)
- Room support (`lobby` by default)
- Basic latency indicator

## Quick Start

Requirements: Node 18+

```bash
npm install
npm start
```

Open your browser at `http://localhost:3000`. Join a room (default `lobby`) and start drawing. Open a second tab/window to test multi-user sync.

## How to Test with Multiple Users

- Open two browser windows/tabs to `http://localhost:3000`
- Enter different names; keep the same room id (e.g., `lobby`)
- Draw in one window and see it stream in the other in real-time
- Try Undo/Redo (buttons or Ctrl+Z / Ctrl+Y). These are global for the room.

## Known Limitations

- Redo resyncs the whole snapshot for simplicity (could be optimized to stream the re-applied op)
- Canvas does not persist on server restart (in-memory room state)
- No authentication; names are client-provided
- Mobile is basic touch support (no multitouch / palm rejection)

## Scripts

- `npm start` – start server
- `npm run dev` – start with nodemon

## Project Structure

```
collaborative-canvas/
├── client/
│   ├── index.html
│   ├── style.css
│   ├── canvas.js          # Canvas drawing & rendering logic
│   ├── websocket.js       # Socket.io client wrapper
│   └── main.js            # App initialization
├── server/
│   ├── server.js          # Express + Socket.io server
│   ├── rooms.js           # Room management (users, colors, joins/leaves)
│   └── state.js           # Drawing state (ops, undo/redo, streaming)
├── package.json
├── README.md
└── ARCHITECTURE.md
```

## Time Spent

~5-6 hours initial implementation including documentation.

#Result or Output
<img width="1904" height="905" alt="image" src="https://github.com/user-attachments/assets/b77d9b07-efb0-42f8-8421-934da7ee20e2" />
<img width="1907" height="913" alt="image" src="https://github.com/user-attachments/assets/0704cc45-cffb-4b53-b181-c54dc98bb70a" />



## License

MIT

