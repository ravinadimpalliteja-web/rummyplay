# Royal Club room format (all games)

Every game uses the same way to start and the same room, modelled on EKAH. New games must follow it.

## Screens (website)
Use the shared components in `web/src/room/RoomScreens.tsx` (styles in `web/src/room/room.css`):

1. **`<PlayStart>`: one start screen**
   - **Your name.** It is shared by every game on the device (`rc-player-name`).
   - **Play vs computer.** Pick 1 to 3 computer players, then press **Play now**.
   - **Play with friends.** **Create a room** in one tap, or type the **Code** and **Passcode** and press **Join room**.
   - Extra boxes go in `extra` (for example Ludo's pass & play), style choices in `after`, and the rules in `rules` (shown under "How to play").
2. **`<WaitingRoom>`: the room**
   - The **room code card**: a big code, the passcode and **Copy invite**.
   - The **players list**, with each player labelled Host, Computer, (you) or Offline, and the open seats.
   - For the host only: **Add computer**, **Remove computer** and **Start game with N players**. Everyone else sees "Waiting for the host to start the game".
   - Game-specific choices before the start (for example the Snakes & Ladders token picker) go in `children`. On wide screens they sit beside the players.
   - **Leave room** at the bottom.

EKAH (`web/public/ekah/`) is plain HTML with the same layout.

## Room server
- Rooms have 2 to 4 seats. The host can start once two or more seats are filled (people or computers) and every person is online.
- In the waiting room, the host sends `addBot` / `removeBot`. Use `server/room-bots.js` (`addBot`, `removeBot`, `BOT_DELAY_MS`).
- A computer seat is `{ bot: true, name, connected: true }`. It plays its turns after `BOT_DELAY_MS`, using the game's normal automatic play.
- A friend who joins a full waiting room takes the last computer player's seat (`botSeatForJoin`, in `server/server.js`).
- The state sent to each player lists seats as `{ seat, name, bot, connected }` and includes `host` (is this player the host) and `hostSeat`.
- Add a test like `server/test/room-bots.test.js` for each new game.
