export type GameId = "spades" | "rummy";
export type PlayMode = "practice" | "online";

export interface GameDefinition {
  id: GameId;
  name: string;
  description: string;
  status: "available" | "coming-soon";
}

export const GAMES: GameDefinition[] = [
  { id: "spades", name: "Progressive Spades", description: "A 13-round trick-taking challenge.", status: "available" },
  { id: "rummy", name: "Indian Rummy", description: "Build sequences, sets and outplay the table.", status: "coming-soon" }
];