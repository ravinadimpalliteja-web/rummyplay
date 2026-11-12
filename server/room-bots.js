'use strict';
/**
 * Computer players for the dice-game rooms (Snakes & Ladders, Ludo), the same way EKAH rooms have them: in the waiting
 * room the host can add computer players to empty seats and remove them again. A computer seat is { bot: true, name }
 * and plays its turns after a short pause, using the same automatic play the server already uses for players who are
 * away. If a friend joins a full waiting room, they take the last computer player's seat.
 */
const BOT_NAMES = ['Arjun', 'Meera', 'Kabir', 'Ananya', 'Vikram', 'Priya', 'Rohan', 'Isha', 'Dev'];
const BOT_DELAY_MS = 1100;

function addBot(room, seat) {
  if (room.hostSeat() !== seat) throw new Error('Only the host can add computer players');
  if (room.game) throw new Error('The game has already started');
  const i = room.seats.findIndex((s) => !s);
  if (i < 0) throw new Error('The room is full');
  const used = new Set(room.seats.filter(Boolean).map((s) => s.name));
  room.seats[i] = { bot: true, name: BOT_NAMES.find((n) => !used.has(n)) || 'Computer ' + (i + 1), connected: true, missed: 0 };
  return room.broadcast();
}
function removeBot(room, seat) {
  if (room.hostSeat() !== seat) throw new Error('Only the host can remove computer players');
  if (room.game) throw new Error('The game has already started');
  for (let i = room.seats.length - 1; i >= 0; i--) if (room.seats[i] && room.seats[i].bot) { room.seats[i] = null; break; }
  return room.broadcast();
}
/** Waiting-room seat for a friend joining a full room: the last computer player's seat, or -1. */
function botSeatForJoin(room) {
  if (room.game) return -1;
  for (let i = room.seats.length - 1; i >= 0; i--) if (room.seats[i] && room.seats[i].bot) return i;
  return -1;
}

module.exports = { BOT_NAMES, BOT_DELAY_MS, addBot, removeBot, botSeatForJoin };
