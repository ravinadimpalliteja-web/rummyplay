# Rummy Play — Confirmed Game Specification

This document records the decisions approved for the Rummy Play Royal Club prototype. It is an independent free-to-play implementation of familiar 13-card Indian Rummy rules. RummyCircle is a rules reference only; no proprietary branding, artwork, source code, audio, or backend is copied.

## Product boundaries
- Free-to-play only. No deposits, withdrawals, cash prizes, payments, or wagering.
- Royal Club emerald, gold, ivory and felt-table visual identity remains the product's own design.
- This branch is a local browser prototype. Real accounts, email verification, private rooms, server-authoritative multiplayer, match persistence and Pool elimination are not yet implemented.
- Development and testing happen on `royal-club-brand-preview`. Do not merge PR #1 or change `main` without explicit approval.

## Room capacity and decks
| Room capacity | Decks | Physical cards |
|---|---:|---:|
| 2 players | 1 | 54 |
| 3–4 players | 2 | 108 |
| 5–6 players | 3 | 162 |

Each physical deck has 52 standard cards and 2 printed jokers. Deck count is based on configured room capacity, not the number of players currently ready. Intended room choices remain 2, 4 or 6 seats.

## Open Joker
1. At the start of each deal, randomly select one non-printed-joker card from the shuffled full deck as the Open Joker indicator.
2. Display it in a dedicated Open Joker box.
3. Remove that physical indicator card from play. It cannot be dealt, drawn, or discarded.
4. Every other card of the same rank across all suits and packs is a wild joker.
5. Printed jokers are always jokers.
6. Select a fresh indicator for every deal. The indicator is separate from the initial open discard.

## Card handling and grouping
- The player's 13-card hand (14 after drawing) remains one continuous hand.
- The player may select any 2–4 cards, regardless of their positions.
- Group is a visual organization action: it moves selected cards together at the beginning of the same hand, after previously created groups.
- Preserve the order in which the player selected the cards.
- Existing groups remain together. If cards are selected from an existing group to form a new group, remove those cards from the old group and retain any remaining group only if at least two cards remain.
- A group can be created even if its cards are not a valid sequence or set. Grouping and rules validation are separate.
- Do not show Group 1/Group 2 labels, separate grouped/ungrouped sections, or group boxes/borders. Use only a subtle natural spacing gap between combinations.
- Do not add an Ungroup button.
- Sort clears all visual grouping and restores the default arrangement.
- The hand supports manual drag/repositioning; grouped cards should move as a unit when dragged.

## Sort order
1. Clubs (♣)
2. Hearts (♥)
3. Spades (♠)
4. Diamonds (♦)

Within each suit: Ace, 2, 3, 4, 5, 6, 7, 8, 9, 10, Jack, Queen, King. Printed jokers appear after the four suits. The Open Joker indicator is not in the hand.

## Combination rules
- Pure sequence: at least three consecutive natural cards of the same suit, without joker substitution. A wild-rank card may count naturally if its actual suit and rank occupy its natural place in the sequence.
- Impure sequence: at least three consecutive cards of the same suit, with a printed joker or wild-rank card substituting for a missing card.
- Set: three or four cards of the same rank in different suits; eligible jokers may substitute for missing suits/ranks under the engine's set rules.
- Example with 7 as the Open Joker: 6♣–7♥–8♣ is an impure sequence; 6♣–7♣–8♣ is a pure sequence because 7♣ is used naturally.
- Declaration: exactly 13 cards must be covered by valid combinations, with at least two separate sequences including at least one pure sequence. Remaining cards must form valid sequences or sets.

## Pool formats
- Pool 101, Pool 201 and Pool 251 are intended formats.
- Match scoring, elimination thresholds and last-player-wins behavior still need to be connected to a complete match flow.

## Current implementation scope
The current preview page is a local single-player interaction prototype. The rules engine supports capacity-based deck creation/dealing, separate Open Joker selection, group classification, hand validation and penalty calculation. A successful local browser prototype is not proof of production multiplayer readiness. Server-authoritative turns, room management, authentication, email recovery, persistence, opponent turns, full Pool scoring/elimination, and automated browser/device testing remain future work.
