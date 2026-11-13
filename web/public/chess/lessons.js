/**
 * Royal Club Learn Chess - class content. Level 1 is fully written; Levels 2-4 are listed (titles from the curriculum)
 * and marked as in preparation.
 *
 * A class is a list of steps. Board positions use FEN (only the placement part matters for "free" boards).
 *   card   - an idea shown on the board:        { kind:'card', text, fen, marks? }
 *   tap    - tap the right square:               { kind:'tap', text, fen, answer:'e4', hint }
 *   quiz   - pick the right answer:              { kind:'quiz', text, fen?, marks?, options:[...], answer:index, explain }
 *   goal   - free movement, no kings needed: move White's pieces until every star is reached and every black piece is
 *            captured (black pieces never move).  { kind:'goal', text, fen, stars:['h8'], par: fewest moves, hint }
 *   move   - a real chess position (rules engine): find the move. accept: list of SAN moves, or 'mate' (any checkmate),
 *            or 'any' (any legal move). pre: moves played first, automatically.  { kind:'move', text, fen, pre?, accept, hint, done }
 *   play   - play a real position against the computer until checkmate: { kind:'play', text, fen, par: moves for 3 stars, hint }
 * marks: { sq:[squares to highlight], star:[...], arrows:[['e2','e4'], ...], dots:[...], red:[...] }
 */
(function (root) {
  'use strict';
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  const L1 = [
    {
      id: 'board', n: 1, title: 'The board and the army', sub: 'Squares, names and setting up', free: true,
      steps: [
        { kind: 'card', fen: '8/8/8/8/8/8/8/8', marks: { sq: ['h1'] },
          text: 'A chessboard has 64 squares in 8 rows and 8 columns. Always set it so the square in your bottom-right corner is light.' },
        { kind: 'card', fen: '8/8/8/8/8/8/8/8', marks: { sq: ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8', 'a4', 'b4', 'c4', 'd4', 'f4', 'g4', 'h4'], star: ['e4'] },
          text: 'Columns are called files, named a to h. Rows are called ranks, numbered 1 to 8. A square is named by its file, then its rank: the star is on e4.' },
        { kind: 'tap', fen: '8/8/8/8/8/8/8/8', answer: 'd5', hint: 'Go along to the d file, then up to rank 5.',
          text: 'Your turn. Tap the square d5.' },
        { kind: 'tap', fen: '8/8/8/8/8/8/8/8', answer: 'g2', hint: 'The g file is second from the right; rank 2 is the second row from the bottom.',
          text: 'Now tap g2.' },
        { kind: 'card', fen: START,
          text: 'Each player starts with 16 pieces: 8 pawns, 2 rooks, 2 knights, 2 bishops, 1 queen and 1 king. White always moves first.' },
        { kind: 'card', fen: START, marks: { sq: ['d1', 'd8'] },
          text: 'The queen starts on her own colour: the white queen on the light square d1, the black queen on the dark square d8. The kings stand beside them.' },
        { kind: 'tap', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR', answer: 'd1', hint: 'Queen on her own colour: the light square next to the king.',
          text: 'The white queen is missing. Tap the square where she starts.' },
        { kind: 'quiz', fen: START, text: 'Which player moves first?', options: ['White', 'Black', 'Whoever is younger'], answer: 0,
          explain: 'White always makes the first move.' },
      ],
    },
    {
      id: 'rook-bishop', n: 2, title: 'Rook and bishop', sub: 'Straight lines and diagonals', free: true,
      steps: [
        { kind: 'card', fen: '8/8/8/8/3R4/8/8/8', marks: { arrows: [['d4', 'd8'], ['d4', 'd1'], ['d4', 'a4'], ['d4', 'h4']] },
          text: 'The rook moves in straight lines: up, down, left or right, as far as it likes.' },
        { kind: 'card', fen: '8/8/3P4/8/3R1p2/8/8/8', marks: { arrows: [['d4', 'd5'], ['d4', 'f4']], red: ['f4'] },
          text: 'It cannot jump. It stops before its own pieces, and it captures an enemy piece by moving onto its square.' },
        { kind: 'goal', fen: '8/8/8/8/8/8/8/R7', stars: ['h8'], par: 2, hint: 'Go up the a file first, then across.',
          text: 'Move the rook to the star.' },
        { kind: 'goal', fen: '8/8/p4p2/8/8/8/5p2/R7', par: 3, hint: 'Start by going straight up to a6.',
          text: 'Capture all the black pawns, in as few moves as you can.' },
        { kind: 'card', fen: '8/8/8/8/8/8/8/2B5', marks: { arrows: [['c1', 'h6'], ['c1', 'a3']] },
          text: 'The bishop moves diagonally, as far as it likes. It always stays on the colour it started on.' },
        { kind: 'goal', fen: '8/8/8/8/8/8/8/2B5', stars: ['f8'], par: 2, hint: 'Head for h6 first.',
          text: 'Move the bishop to the star.' },
        { kind: 'goal', fen: '4p3/8/8/1p5p/8/8/8/5B2', par: 3, hint: 'The first pawn to take is on b5.',
          text: 'Capture all the black pawns.' },
        { kind: 'quiz', fen: '8/8/8/8/8/8/8/5B2', text: 'This bishop starts on a light square. Can it ever reach a dark square?',
          options: ['Yes', 'No'], answer: 1, explain: 'A bishop always moves diagonally, so it stays on its own colour for the whole game.' },
      ],
    },
    {
      id: 'queen-knight-king', n: 3, title: 'Queen, knight and king', sub: 'The strongest, the jumper and the most important', free: true,
      steps: [
        { kind: 'card', fen: '8/8/8/8/3Q4/8/8/8', marks: { arrows: [['d4', 'd8'], ['d4', 'd1'], ['d4', 'a4'], ['d4', 'h4'], ['d4', 'a7'], ['d4', 'h8'], ['d4', 'a1'], ['d4', 'g1']] },
          text: 'The queen is the strongest piece. She moves like a rook and a bishop together: any straight line or diagonal.' },
        { kind: 'goal', fen: '7p/8/8/8/p6p/8/8/3Q4', par: 3, hint: 'From d1, the a4 pawn is on a diagonal.',
          text: 'Capture all the black pawns with the queen.' },
        { kind: 'card', fen: '8/8/8/8/3N4/8/8/8', marks: { dots: ['b3', 'b5', 'c2', 'c6', 'e2', 'e6', 'f3', 'f5'] },
          text: 'The knight moves in an L: two squares one way, then one square to the side. It always lands on the other colour.' },
        { kind: 'card', fen: '8/8/8/8/8/8/PPPP4/1N6', marks: { arrows: [['b1', 'c3']] },
          text: 'The knight is the only piece that can jump over other pieces.' },
        { kind: 'goal', fen: '8/8/8/8/8/8/PPPP4/1N6', stars: ['d5'], par: 2, hint: 'Jump to c3 first.',
          text: 'Jump the knight to the star.' },
        { kind: 'goal', fen: '8/8/4p3/6p1/3N4/5p2/8/8', par: 3, hint: 'The e6 pawn is one L-jump away.',
          text: 'Capture all three pawns with the knight.' },
        { kind: 'card', fen: '8/8/8/8/4K3/8/8/8', marks: { dots: ['d3', 'd4', 'd5', 'e3', 'e5', 'f3', 'f4', 'f5'] },
          text: 'The king moves one square in any direction. He is the most important piece: if he is trapped, the game is lost.' },
        { kind: 'quiz', text: 'Which piece can jump over other pieces?', options: ['Queen', 'Knight', 'Rook', 'King'], answer: 1,
          explain: 'Only the knight jumps. Every other piece is stopped by anything in its way.' },
      ],
    },
    {
      id: 'pawns', n: 4, title: 'Pawns', sub: 'Forward steps, captures and promotion',
      steps: [
        { kind: 'card', fen: '8/8/8/8/8/8/4P3/8', marks: { arrows: [['e2', 'e3'], ['e2', 'e4']] },
          text: 'Pawns move straight forward, one square at a time. On its very first move, a pawn may move two squares.' },
        { kind: 'card', fen: '8/8/8/3pp3/4P3/8/8/8', marks: { arrows: [['e4', 'd5']], red: ['d5'] },
          text: 'Pawns capture differently: one square diagonally forward. A piece straight in front blocks the pawn.' },
        { kind: 'goal', fen: '8/8/8/8/3p4/8/2P5/8', par: 2, hint: 'Step forward to c3 first, then capture diagonally.',
          text: 'Capture the black pawn.' },
        { kind: 'card', fen: '8/4P3/8/8/8/8/8/8', marks: { arrows: [['e7', 'e8']] },
          text: 'A pawn that reaches the last rank is promoted: it becomes a queen, rook, bishop or knight. Almost always, players choose a queen.' },
        { kind: 'goal', fen: '8/8/8/P7/8/8/8/8', stars: ['a8'], par: 3, hint: 'Just keep walking forward.',
          text: 'March the pawn to the star and promote it.' },
        { kind: 'goal', fen: '8/8/4p3/3p4/8/8/4P3/8', par: 3, hint: 'Two squares first, to e4.',
          text: 'Capture both pawns with your one pawn.' },
        { kind: 'quiz', text: 'A white pawn reaches the 8th rank. What can it become?',
          options: ['Only a queen', 'A queen, rook, bishop or knight', 'Any piece, even a king'], answer: 1,
          explain: 'A pawn can become any piece except a king. A queen is usually best.' },
      ],
    },
    {
      id: 'check', n: 5, title: 'Check and escape', sub: 'Move, block or capture',
      steps: [
        { kind: 'card', fen: 'R3k3/8/8/8/8/8/8/4K3 b - - 0 1', marks: { arrows: [['a8', 'e8']], red: ['e8'] },
          text: 'When a king is attacked, it is in check. Here the white rook checks the black king.' },
        { kind: 'card', fen: 'R3k3/8/8/8/8/8/8/4K3 b - - 0 1', marks: { red: ['e8'] },
          text: 'A king in check must escape at once. There are three ways: move the king, block the attack, or capture the attacker.' },
        { kind: 'move', fen: '4r1k1/8/8/8/8/8/8/4K3 w - - 0 1', accept: 'any', hint: 'Step the king off the e file.',
          text: 'Your king is in check from the rook. Move the king to safety.', done: 'Safe. Moving away is the first way out.' },
        { kind: 'move', fen: 'k7/8/8/8/8/8/3R1PPP/1r4K1 w - - 0 1', accept: ['Rd1'], hint: 'Put your rook between the black rook and your king.',
          text: 'Check from the rook on b1, and your king has no square to go to. Block the check.', done: 'Blocked. That is the second way out.' },
        { kind: 'move', fen: 'k7/8/8/8/8/2N5/5PPP/3q2K1 w - - 0 1', accept: ['Nxd1'], hint: 'Your knight on c3 can reach d1.',
          text: 'The black queen gives check. Capture her!', done: 'Captured. That is the third way out.' },
        { kind: 'quiz', text: 'May you ever make a move that leaves your own king in check?', options: ['Yes, if it wins a piece', 'No, never'], answer: 1,
          explain: 'A move that leaves your king in check is not allowed.' },
      ],
    },
    {
      id: 'mate', n: 6, title: 'Checkmate and stalemate', sub: 'How games are won and drawn',
      steps: [
        { kind: 'card', fen: '3R2k1/5ppp/8/8/8/8/8/6K1 b - - 0 1', marks: { arrows: [['d8', 'g8']], red: ['g8'] },
          text: 'Checkmate: the king is in check and has no way out. The game ends and the side giving mate wins.' },
        { kind: 'card', fen: '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', marks: { sq: ['h8'] },
          text: 'Stalemate: the player to move is not in check but has no legal move. The game is a draw, even if one side is far ahead.' },
        { kind: 'move', fen: '6k1/5ppp/8/8/8/8/8/3R2K1 w - - 0 1', accept: 'mate', hint: 'The black king is trapped behind its own pawns. Attack the back rank.',
          text: 'Mate in 1: find the checkmate.', done: 'Checkmate! This is called a back-rank mate.' },
        { kind: 'move', fen: 'k7/8/1K6/8/8/8/8/7R w - - 0 1', accept: 'mate', hint: 'Your king already guards a7 and b7. Give check along the 8th rank.',
          text: 'Mate in 1 with the rook.', done: 'Checkmate!' },
        { kind: 'move', fen: '7k/8/6K1/8/8/8/8/5Q2 w - - 0 1', accept: 'mate', hint: 'Check along the 8th rank.',
          text: 'Mate in 1 with the queen.', done: 'Checkmate!' },
        { kind: 'quiz', fen: '7k/8/6K1/8/8/8/8/5Q2 w - - 0 1', text: 'Which of these queen moves is stalemate?',
          options: ['Qf7', 'Qf8', 'Qh3'], answer: 0,
          explain: 'After Qf7 the black king is not in check but cannot move anywhere: stalemate. Qf8 is checkmate, and after Qh3 the king escapes to g8.' },
      ],
    },
    {
      id: 'special', n: 7, title: 'Special moves', sub: 'Castling and en passant',
      steps: [
        { kind: 'card', fen: 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', marks: { arrows: [['e1', 'g1'], ['h1', 'f1']] },
          text: 'Castling: the king moves two squares toward a rook, and that rook jumps to the square the king crossed. It tucks the king away safely.' },
        { kind: 'card', fen: 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', marks: { sq: ['e1', 'a1', 'h1'] },
          text: 'You may castle only if the king and that rook have not moved, the squares between them are empty, and the king is not in check and does not cross or land on an attacked square.' },
        { kind: 'move', fen: '4k3/8/8/8/8/8/5PPP/4K2R w K - 0 1', accept: ['O-O'], hint: 'Move the king two squares toward the h1 rook.',
          text: 'Castle on the king side.', done: 'Castled. The king is tucked behind the pawns.' },
        { kind: 'move', fen: '4k3/8/b7/8/8/8/8/R3K2R w KQ - 0 1', accept: ['O-O-O'], hint: 'The bishop on a6 attacks f1, so the king cannot cross it.',
          text: 'Only one way of castling is allowed here. Castle on the legal side.', done: 'Right: the king may not cross f1 while the bishop attacks it.' },
        { kind: 'card', fen: '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', marks: { arrows: [['d7', 'd5'], ['e5', 'd6']] },
          text: 'En passant: when a pawn moves two squares and lands right beside your pawn, you may capture it as if it had moved only one. Only on the very next move!' },
        { kind: 'move', fen: '4k3/3p4/8/4P3/8/8/8/4K3 b - - 0 1', pre: ['d5'], accept: ['exd6'], hint: 'Your e5 pawn captures diagonally onto d6.',
          text: 'Black has just played d7 to d5. Capture it en passant.', done: 'En passant! The black pawn is gone.' },
        { kind: 'quiz', text: 'When may you capture en passant?', options: ['Any time later in the game', 'Only on the very next move', 'Only with a knight'], answer: 1,
          explain: 'The chance disappears if you do not take it straight away.' },
      ],
    },
    {
      id: 'kq-mate', n: 8, title: 'Mate with king and queen', sub: 'Your first winning technique',
      steps: [
        { kind: 'card', fen: '8/8/3k4/8/8/8/8/Q3K3 w - - 0 1', marks: { sq: ['a5', 'b5', 'c5', 'd5', 'e5', 'f5', 'g5', 'h5'] },
          text: 'With a king and queen against a lone king, you can always win. First use the queen to box the king in, a little smaller each time.' },
        { kind: 'card', fen: '8/8/3k4/8/8/8/8/Q3K3 w - - 0 1', marks: { arrows: [['e1', 'e4']] },
          text: 'Then bring your own king up to help. The queen alone cannot give mate; she needs her king nearby.' },
        { kind: 'card', fen: '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', marks: { sq: ['h8'] },
          text: 'Careful! Always leave the enemy king at least one move until you are ready to mate, or it is stalemate and only a draw.' },
        { kind: 'move', fen: 'k7/8/1K6/8/8/8/8/3Q4 w - - 0 1', accept: 'mate', hint: 'Your king guards a7 and b7. Give check on the 8th rank.',
          text: 'Mate in 1.', done: 'Checkmate!' },
        { kind: 'move', fen: '3k4/8/3K4/8/8/8/8/7Q w - - 0 1', accept: 'mate', hint: 'The kings face each other; check along the 8th rank.',
          text: 'Mate in 1 again.', done: 'Checkmate!' },
        { kind: 'play', fen: '8/8/8/4k3/8/8/8/Q3K3 w - - 0 1', par: 20, hint: 'Shrink the box with the queen a knight\'s jump away from the king, then walk your king up.',
          text: 'Now do it for real: checkmate the computer\'s king. Mate in 20 moves or fewer for three stars.' },
      ],
    },
  ];

  const soon = (n, title, sub) => ({ id: 'c' + n, n, title, sub, soon: true, steps: [] });
  const LEVELS = [
    { n: 1, title: 'Foundations', goal: 'Play a full game and checkmate with a queen', classes: L1 },
    { n: 2, title: 'Tactics', goal: 'Win material with forks, pins and skewers', classes: [
      soon(9, 'Piece values', 'What each piece is worth'), soon(10, 'Hanging pieces', 'Spot what is free'),
      soon(11, 'The fork', 'One piece, two targets'), soon(12, 'The pin', 'Pin and win'),
      soon(13, 'The skewer', 'Through the big piece'), soon(14, 'Discovered attacks', 'Unmask a hidden attacker'),
      soon(15, 'Back-rank mate', 'The trapped king'), soon(16, 'Mate in 2', 'Checks, captures, threats') ] },
    { n: 3, title: 'Strategy and openings', goal: 'Start games well and make a plan', classes: [
      soon(17, 'Opening principles', 'Centre, develop, castle'), soon(18, 'Opening traps', 'Stop the four-move mate'),
      soon(19, 'Italian Game', 'A classic start with 1.e4'), soon(20, "Queen's Gambit and London", 'Two systems with 1.d4'),
      soon(21, 'Playing Black', 'Answers to 1.e4 and 1.d4'), soon(22, 'Pawn structure', 'Strong and weak pawns'),
      soon(23, 'Good and bad pieces', 'Outposts and open files'), soon(24, 'Making a plan', 'Find the weakness') ] },
    { n: 4, title: 'Endgames and competitive play', goal: 'Finish won games and play on the clock', classes: [
      soon(25, 'Mate with king and rook', 'The rook ladder'), soon(26, 'King and pawn endings', 'Opposition and the square'),
      soon(27, 'Rook endings', 'Active rooks win'), soon(28, 'Converting an advantage', 'Trade when ahead'),
      soon(29, 'Defending worse positions', 'Stalemate tricks and perpetuals'), soon(30, 'Thinking on the clock', 'Blitz habits'),
      soon(31, 'Reviewing your games', 'Find the turning point'), soon(32, 'Tournament ready', 'Final test and badge') ] },
  ];

  root.RoyalChessLessons = { LEVELS };
})(typeof self !== 'undefined' ? self : this);
