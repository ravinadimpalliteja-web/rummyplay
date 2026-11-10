# Royal Club room server

Live rooms for Royal Club Spades (**four real players per room, no computer players**), Snakes & Ladders, Ludo and EKAH.
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

## Snakes & Ladders rooms
- Same server, same code + passcode flow. Clients send `game: "snakes"` with `create`, `join` and `hello`; a Spades code cannot be
  used for Snakes & Ladders or the reverse.
- 2 to 4 real players; the host can start once at least two have joined. No computer players.
- Rules (`snakes.js`): a six to enter; a six rolls again; three sixes in a row cancel that whole turn (back to where it began);
  exact roll to 100. The server rolls the die. 15 seconds to roll, then the server rolls for you; a player who left or is offline
  is rolled for after 1.5 seconds. The server waits for each move's animation before the next roll.

## Ludo rooms
- Same server, same code + passcode flow, with `game: "ludo"` on `create`, `join` and `hello`. Codes are not shared between games.
- 2 to 4 real players; the host can start once at least two have joined. No computer players in rooms.
  Two players sit on opposite corners (red and yellow); three play red, green, yellow; four play all colours.
- Rules (`ludo.js`): a six brings a token out; a six, a cut or a token reaching home rolls again; three sixes in a row end
  the turn; start squares and starred squares are safe; an exact roll is needed to finish. Play continues after the first
  finish until one player is left (rankings 1st to 4th).
- The server rolls the die. 15 seconds to roll and 15 to choose a token, then the server plays for you (it picks cuts,
  finishing moves and safe squares first). When every legal choice is the same token move, it is played automatically.
  A player who left or is offline is played for after 1.5 seconds. The server waits for each animation before the next step.
- Quick phrases: clients send `{t:"react", i}`; everyone in the room receives `{t:"react", game:"ludo", seat, i}`.

## EKAH rooms
- Same server, same code + passcode flow, with `game: "ekah"` on `create`, `join` and `hello`. Codes are not shared between games.
- 2 to 10 seats. Unlike Spades, Snakes & Ladders and Ludo, the host may fill open seats with computer players (`addBot` / `removeBot`).
  The host can start once two or more seats are filled and every human is online.
- Rules are in `ekah-engine.js`, which is the same file the website serves at `/ekah/engine.js` (a test fails if they differ).
  Clients send `act` with an engine action: `play` (card, suit for wilds, EKAH call), `draw`, `pass`, `catch`, `nextRound`.
- 30 seconds per turn, then the computer plays for you. A player who left, is offline or missed two turns is played for after 2 seconds.
  The next round starts when anyone presses Next round, or after 25 seconds. Computer players may catch a missed EKAH call.

## Connect the website
Set the Netlify build variable `VITE_ROOM_SERVER_URL` to the server's WebSocket address (for example
`wss://royal-club-rooms.onrender.com`) and redeploy. For testing a preview, `?server=wss://...` can be added to the URL.
