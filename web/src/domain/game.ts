export type GameId = "spades" | "snakes" | "rummy";
export type PlayMode = "practice" | "online";

export interface GameDefinition {
  id: GameId;
  name: string;
  description: string;
  status: "available" | "coming-soon";
}

export const GAMES: GameDefinition[] = [
  { id: "spades", name: "Spades", description: "A 13-round trick-taking challenge.", status: "available" },
  { id: "snakes", name: "Snakes & Ladders", description: "Race to 100 with 1 to 3 friends. Roll a six to start.", status: "available" },
  { id: "rummy", name: "Indian Rummy", description: "Build sequences, sets and outplay the table.", status: "coming-soon" }
];