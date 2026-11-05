export type GameId = "spades" | "snakes" | "chess" | "rummy";
export type PlayMode = "practice" | "online";

export interface GameDefinition {
  id: GameId;
  name: string;
  description: string;
  status: "available" | "coming-soon";
  category: "card" | "board";
}

export const GAMES: GameDefinition[] = [
  { id: "spades", name: "Spades", description: "A 13-round trick-taking challenge.", status: "available", category: "card" },
  { id: "snakes", name: "Snakes & Ladders", description: "Race to 100 with 1 to 3 friends. Roll a six to start.", status: "available", category: "board" },
  { id: "chess", name: "Chess", description: "Play a friend on one phone or the computer.", status: "available", category: "board" },
  { id: "rummy", name: "Indian Rummy", description: "Build sequences, sets and outplay the table.", status: "coming-soon", category: "card" }
];