export type LudoColor = "red"|"green"|"yellow"|"blue";
export type LudoToken = {id:number;step:number};
export type LudoPlayer = {color:LudoColor;name:string;tokens:LudoToken[]};
