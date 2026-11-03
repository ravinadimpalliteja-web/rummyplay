# Rummy Play — Royal Club Release Acceptance Standard

This is the product-level acceptance standard for the complete game. It is intended to prevent the project from becoming a series of disconnected UI demos. A feature is not complete merely because a button or screen exists.

## Product promise and boundaries
- Independent, free-to-play 13-card Indian Rummy experience.
- No cash games, deposits, withdrawals, entry fees, cash prizes, wagering, or payment rails.
- Royal Club emerald, champagne-gold, ivory and felt identity remains intact. Branding, artwork, sounds and source implementation must be original.
- Supported Pool formats: 101, 201 and 251.
- Supported room capacities: 2, 4 and 6 seats.
- Registered users only for online rooms. Never insert bots or AI players into empty seats.
- A disconnected human remains a disconnected seat; the server must not silently replace that person.

## Player journey
1. Landing page explains the product and offers account creation/login.
2. Authentication supports validation, secure password handling, email verification and recovery.
3. Clubhouse offers Create Private Room, Join by Code, Rules, Profile, Settings and Match History.
4. Host chooses 2/4/6 seats and Pool 101/201/251.
5. Waiting room shows the room code, copy/share action, occupied seats, ready status and host controls.
6. Match begins only when at least two registered humans are ready and the host starts it.
7. The table clearly identifies the active player, turn, remaining time, draw sources, open joker, discard pile and each opponent's card count.
8. At the end of a hand, show declaration validation, points, penalties and updated Pool standings.
9. At match end, show winner, final standings, hand history and options to rematch or return to the clubhouse.

## Table interaction acceptance
- Cards are readable at common desktop, tablet and mobile sizes.
- Hover lifts a card subtly; selected cards remain visibly raised and outlined.
- Click/tap toggles selection. Selection state must not be lost on incidental pointer movement.
- Dragging reorders a card. Dragging a grouped card moves the whole group.
- Selecting 2–4 cards and choosing Group creates a visual group regardless of whether it is a valid combination.
- Grouping is not a declaration and must never alter card identities or game validity.
- Existing groups remain intact unless their cards are deliberately regrouped.
- Sorting clears visual groups and uses Clubs, Hearts, Spades, Diamonds; within each suit A, 2…10, J, Q, K; printed jokers last.
- Draw from closed stock or take the top open discard, subject to turn rules.
- After drawing, the hand contains 14 cards. A normal turn ends by discarding exactly one card, leaving 13.
- A player can attempt a declaration using the 13-card hand after selecting the final discard.
- Drop zones, disabled actions, errors and confirmations must be clear. No silent no-op controls.
- Mouse, keyboard focus and touch interactions must be supported.
- Animations must not delay or prevent an action. Respect reduced-motion preferences.

## Rules-engine acceptance
- A physical deck contains 52 suited cards plus two printed jokers per pack.
- Deck count follows configured room capacity: 2 seats = 1 deck; 4 seats = 2 decks; 6 seats = 3 decks.
- Deal 13 cards to every occupied seat. The Open Joker indicator is a separate non-printed-joker card, displayed separately and removed from play.
- Every other card of the indicator rank across all packs is wild; printed jokers are always wild.
- A new indicator is selected for every hand.
- Pure sequence: 3 or more consecutive natural cards of one suit, no substitution. Ace can be low (A-2-3) or high (Q-K-A, J-Q-K-A, 10-J-Q-K-A) when the ranks are consecutive.
- An Open-Joker-rank card may count naturally in a pure sequence only when its actual rank and suit occupy that exact natural position.
- Impure sequence: 3 or more consecutive cards of one suit with eligible jokers substituting for missing cards.
- Set: 3 or 4 cards of the same rank in different suits; eligible jokers can fill missing cards.
- A valid 13-card declaration must be covered completely by valid combinations, with at least two separate sequences and at least one pure sequence.
- The engine must reject duplicate physical card IDs, incomplete coverage, invalid suit/rank runs, invalid sets and wrong card counts.
- A declaration is evaluated on the exact 13 cards remaining after the final discard.
- Penalty calculation must be centralized in the engine and covered by tests; wild and printed jokers score zero, Ace and face cards 10, number cards face value.
- No client-side score or move is authoritative in online play.

## Match and Pool acceptance
- Server controls the stock, discard pile, active turn, card ownership, timers, declaration resolution and scoring.
- Every action is validated against the current server-side game state.
- Pool 101, 201 and 251 use their configured elimination thresholds consistently.
- Invalid declarations, first-drop/middle-drop rules, maximum penalty caps, tie handling, last-player-standing and final winner logic must be specified and tested before release.
- Score history is recorded hand by hand and is reproducible from the server event log.
- A rematch creates a new match state; it does not reuse stale cards or scores.

## Multiplayer, rooms and reliability
- Nakama (or an explicitly approved equivalent) is the authoritative multiplayer service.
- Room creation produces a unique, non-guessable invitation code.
- Join requests validate account, room status, capacity and match phase.
- Room membership and readiness are synchronized across clients.
- Server rejects out-of-turn draws/discards, duplicate actions, illegal cards, forged scores and stale requests.
- Reconnection restores the same player's seat and current hand without exposing hidden opponent cards.
- Host disconnect, player disconnect, timeout and abandoned-room behavior are explicit.
- No fake opponent names or local-only simulations may be presented as live players.
- Persistent account and match data must be protected by server-side authorization.

## Product polish
- Original crest/wordmark and consistent iconography.
- Card faces and backs are crisp and consistent; suit colors are accessible.
- Optional sound, mute, animation and reduced-motion settings.
- Clear rules/help overlay accessible during a hand.
- Helpful beginner guidance is optional and never blocks experienced players.
- Turn indicator, timer, connection state, selected-card count and remaining deck count are readable.
- Empty, loading, error, reconnecting and finished states are designed—not left blank.
- No intrusive popups or unnecessary confirmation for routine moves.

## Release gates
A release candidate is not accepted until:
1. Rules-engine automated tests pass.
2. Full local hand flow passes: deal → draw → organize → discard → declare → score.
3. Pool match simulations pass for 2, 4 and 6 seats.
4. Browser tests cover selection, grouping, sorting, drag, draw, discard and declaration.
5. Responsive tests cover phone portrait, phone landscape, tablet and desktop.
6. Multiplayer tests use real separate clients connected to the deployed authoritative server.
7. Reconnection, race conditions, invalid requests and room capacity are tested.
8. Production deploy is verified independently from the preview branch.

## Current status
The current branch contains a local browser prototype and a rules engine. It is not yet a production multiplayer game. Authentication, persistent accounts, live private rooms, server-authoritative matches, full Pool scoring/elimination and end-to-end browser/device QA must not be represented as complete until implemented and verified.
