import { useState } from "react";
import { GAMES, type PlayMode } from "./domain/game";

type Screen = "home" | "spades";

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [mode, setMode] = useState<PlayMode>("practice");

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setScreen("home")} aria-label="Royal Club home">
          <span className="brand-mark">♠</span>
          <span><strong>ROYAL CLUB</strong><small>MORE TO PLAY</small></span>
        </button>
        <nav aria-label="Main navigation">
          <button className={screen === "home" ? "nav-active" : ""} onClick={() => setScreen("home")}>Home</button>
          <button onClick={() => setScreen("home")}>Games</button>
          <button onClick={() => setScreen("home")}>Friends</button>
        </nav>
        <div className="account-actions"><span className="guest-label">Guest preview</span><button className="sign-in">Sign in</button></div>
      </header>

      <main>
        {screen === "home" ? (
          <>
            <section className="hero">
              <div className="eyebrow">A BETTER WAY TO PLAY</div>
              <h1>Good games.<br/><em>Great company.</em></h1>
              <p>Welcome to Royal Club. Sharpen your strategy in practice or bring your friends to the table.</p>
              <button className="gold-button" onClick={() => setScreen("spades")}>Explore games <span>↗</span></button>
              <div className="hero-ornament" aria-hidden="true">♠</div>
            </section>

            <section className="section-heading"><div><div className="eyebrow">THE CLUB</div><h2>Choose your game</h2></div><span className="section-note">More games are on the way</span></section>
            <div className="game-grid">
              {GAMES.map(game => (
                <article className={game.status === "available" ? "game-card featured" : "game-card muted-card"} key={game.id}>
                  <div className="game-art"><span>{game.id === "spades" ? "♠" : "♦"}</span><i>{game.id === "spades" ? "13 ROUNDS" : "COMING SOON"}</i></div>
                  <div className="game-info"><div className="game-kicker">{game.id === "spades" ? "TRICK-TAKING" : "INDIAN CARD GAME"}</div><h3>{game.name}</h3><p>{game.description}</p>
                    {game.status === "available" ? <button className="text-button" onClick={() => setScreen("spades")}>Enter game <span>→</span></button> : <span className="coming-label">Coming soon</span>}
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : (
          <section className="mode-page">
            <button className="back-link" onClick={() => setScreen("home")}>← Back to games</button>
            <div className="eyebrow">ROYAL CLUB · SPADES</div>
            <h1>Choose how you<br/><em>want to play.</em></h1>
            <p className="mode-intro">Same Progressive Spades rules. Choose a practice table or join real players online.</p>
            <div className="mode-grid">
              <button className={mode === "practice" ? "mode-card selected" : "mode-card"} onClick={() => setMode("practice")}>
                <span className="mode-symbol">♠</span><span className="mode-tag">PLAY AT YOUR PACE</span><strong>Practice mode</strong><span className="mode-copy">You play against three computer opponents. Ideal for learning and improving.</span><span className="mode-cta">Selected mode <b>→</b></span>
              </button>
              <button className={mode === "online" ? "mode-card selected" : "mode-card"} onClick={() => setMode("online")}>
                <span className="mode-symbol">♣</span><span className="mode-tag">PLAY WITH PEOPLE</span><strong>Online multiplayer</strong><span className="mode-copy">Four registered players at one live table, with synchronized turns and scores.</span><span className="mode-cta">{mode === "online" ? "Selected mode" : "Choose online"} <b>→</b></span>
              </button>
            </div>
            <div className="mode-footnote">{mode === "practice" ? "Practice table setup will be connected to the shared Spades engine." : "Online rooms will require sign-in and will be enabled when multiplayer services are connected."}</div>
            <button className="gold-button continue-button" onClick={() => window.alert(mode === "practice" ? "Practice mode is selected. Game engine integration is the next milestone." : "Online mode is selected. Multiplayer service integration is the next milestone.")}>Continue with {mode === "practice" ? "practice" : "online"} <span>→</span></button>
          </section>
        )}
      </main>
      <footer><span>♠ ROYAL CLUB</span><span>MORE TO PLAY</span><span>Free to play · No cash prizes</span></footer>
    </div>
  );
}