/* "Learn" on the home page (website and app): the lessons and guides that live inside each game, in one row.
   Learn Chess and Learn Sudoku are lesson pages; EKAH opens straight into its How to play guide. */
import { isListed, type GameId } from "../domain/game";
import { pageHref } from "../lib/native";
import "./learn-row.css";

const ITEMS: { id: GameId; title: string; note: string; href: string; mark: string }[] = [
  { id: "ekah", title: "How to play EKAH", note: "Cards, Jodi powers, scoring", href: "/ekah/?guide=1", mark: "E" },
  { id: "chess", title: "Learn Chess", note: "52 classes · first moves to master", href: "/chess/learn.html", mark: "♞" },
  { id: "sudoku", title: "Learn Sudoku", note: "25 classes · up to X-Wings", href: "/sudoku/learn.html", mark: "9" },
];

export default function LearnRow({ id = "rc-learn", className = "" }: { id?: string; className?: string }) {
  const items = ITEMS.filter(i => isListed(i.id));
  if (!items.length) return null;
  return <section id={id} className={`rc-learn ${className}`} aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`}>Learn</h2>
    <div className="rc-learn-row">
      {items.map(i => <a key={i.id} className={`rc-learn-card rc-learn-${i.id}`} href={pageHref(i.href)}>
        <span className="rc-learn-mark" aria-hidden="true">{i.mark}</span>
        <span className="rc-learn-text"><strong>{i.title}</strong><small>{i.note}</small></span>
        <span className="rc-learn-go" aria-hidden="true">→</span>
      </a>)}
    </div>
  </section>;
}
