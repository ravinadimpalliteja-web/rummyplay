export type GameId = "spades" | "ekah" | "snakes" | "chess" | "rummy" | "ludo";
export type PlayMode = "practice" | "online";

export interface GameDefinition {
  id: GameId;
  name: string;
  description: string;
  status: "available" | "coming-soon";
  category: "card" | "board";
  /** Hidden games keep all their code but are left off the home screen and menu. Remove the flag to publish. */
  hidden?: boolean;
}

export const GAMES: GameDefinition[] = [
  { id: "spades", name: "Spades", description: "A 13-round trick-taking challenge.", status: "available", category: "card", hidden: true },
  { id: "ekah", name: "EKAH", description: "Match the suit or number and call EKAH! Play the computer or friends.", status: "available", category: "card" },
  { id: "snakes", name: "Snakes & Ladders", description: "Race to 100 with 1 to 3 friends. Roll a six to start.", status: "available", category: "board" },
  { id: "chess", name: "Chess", description: "Play a friend on one phone or the computer.", status: "available", category: "board" },
  { id: "ludo", name: "Ludo", description: "Race all four tokens home. Play the computer, friends on one phone, or a room.", status: "available", category: "board" },
  { id: "rummy", name: "Indian Rummy", description: "Build sequences, sets and outplay the table.", status: "coming-soon", category: "card", hidden: true }
];

/** Games shown on the home screen and in the menu. */
export const LISTED_GAMES = GAMES.filter((g) => !g.hidden);
export const isListed = (id: GameId): boolean => LISTED_GAMES.some((g) => g.id === id);
