# Royal Club Web App

This is the new React + TypeScript application workspace. It is intentionally isolated under `/web` while the existing preview portal remains available.

## Run locally

```bash
cd web
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Product decisions

- First web release includes Practice Mode and Online Multiplayer.
- Both modes use the same Spades domain rules and game state model.
- Practice opponents are local computer players.
- Online matches use authoritative server-side game state and four registered human players.
- Rummy is a later game module and is not part of the first release.
- No real-money gaming, deposits, wagers, or cash prizes.

## Current milestone

Initial React application shell and mode-selection flow. The actual game table, game engine integration, AI opponents, authentication and multiplayer transport are subsequent milestones.