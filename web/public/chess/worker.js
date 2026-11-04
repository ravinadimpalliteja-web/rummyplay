/* Runs the computer opponent off the main thread so the board never freezes while it thinks. */
importScripts('engine.js', 'ai.js');
self.onmessage = (e) => {
  const { id, fen, level } = e.data || {};
  try { self.postMessage({ id, move: self.RoyalChessAI.bestMove(fen, level) }); }
  catch (err) { self.postMessage({ id, error: String(err && err.message || err) }); }
};
