# Royal Club room server

Live rooms for Royal Club Spades: **four real players per room, no computer players**.
Zero dependencies (Node 18+). Rooms live in memory, so a restart ends any game in progress.

    cd server
    npm start            # PORT env, default 3000
    npm test             # engine rules + a full simulated 4-player game over real sockets

## How it works
- A host creates a room (the server makes a 4-letter code; the client makes a 4-digit passcode). Friends join with code + passcode.
- The host can start once all four seats are filled. The server runs the game; clients only send intents
  (`bid`, `blind`, `see`, `play`, `continue`) and each player only ever receives their own cards.
- Timers: 30s to bid, 20s to play a card, 15s scoreboard (Continue skips), then 5s to the next round.
- Timeout rules (engine.js `timeoutCard`): bid 0 (Round 13: see cards, then bid 0); lead -> lowest legal card; follow suit ->
  lowest card of the led suit; cannot follow -> the single highest non-spade card; only spades -> lowest spade.
- A player who leaves, goes offline, or misses two turns in a row is auto-played by those rules after 3 seconds.
  They can rejoin with the same device. If every player is gone the game pauses; empty rooms are removed after 30 minutes.
- Scoring follows the owner's final rules, including the Round 13 Blind (+100 / -100, no bags) and a shared win on equal scores.

## Connect the website
Set the Netlify build variable `VITE_ROOM_SERVER_URL` to the server's WebSocket address (for example
`wss://royal-club-rooms.onrender.com`) and redeploy. For testing a preview, `?server=wss://...` can be added to the URL.
