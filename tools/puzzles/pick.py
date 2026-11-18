"""Picks real-game practice puzzles for Learn Chess from the Lichess puzzle database (CC0 licence)
and double-checks every solution move with Stockfish. Runs in GitHub Actions (see puzzle-pick.yml).

Output: puzzles.json  {classId: [{id, fen, moves:[uci...], rating, tier, url, themes}]}
In Lichess puzzles the FIRST move is the opponent's move that sets the puzzle up; the player then
plays every other move."""
import csv, hashlib, io, json, subprocess, sys
import chess, chess.engine

CLASSES = {          # class id -> Lichess theme that must be present
    "values": "advantage", "hanging": "hangingPiece", "fork": "fork", "pin": "pin",
    "skewer": "skewer", "discovered": "discoveredAttack", "backrank": "backRankMate", "mate2": "mateIn2",
}
EXTRA = {"values": {"short"}}   # short material-winning puzzles for the piece-values class
TIERS = [("warm", 900, 1250), ("standard", 1300, 1650), ("hard", 1700, 2150)]
PER_TIER, CANDIDATES = 5, 14

def key(pid): return hashlib.sha1(pid.encode()).hexdigest()

pools = {c: {t[0]: [] for t in TIERS} for c in CLASSES}
seen = set()
src = io.TextIOWrapper(subprocess.Popen(["zstd", "-dc", sys.argv[1]], stdout=subprocess.PIPE).stdout, encoding="utf-8")
for row in csv.DictReader(src):
    try:
        r, rd, pop, plays = int(row["Rating"]), int(row["RatingDeviation"]), int(row["Popularity"]), int(row["NbPlays"])
    except ValueError:
        continue
    if rd > 76 or pop < 88 or plays < 1500: continue
    moves = row["Moves"].split()
    if len(moves) > 7: continue                     # at most 3 player moves
    th = set(row["Themes"].split())
    tier = next((t for t, lo, hi in TIERS if lo <= r <= hi), None)
    if not tier: continue
    for cid, theme in CLASSES.items():
        if theme not in th or not EXTRA.get(cid, set()) <= th: continue
        if cid == "values" and th & {"fork", "pin", "skewer", "mate", "discoveredAttack", "hangingPiece", "sacrifice"}: continue
        pool = pools[cid][tier]
        item = (key(row["PuzzleId"]), row)
        if len(pool) < 4000: pool.append(item)
        break

eng = chess.engine.SimpleEngine.popen_uci("/usr/games/stockfish")
eng.configure({"Threads": 2, "Hash": 128})

def verified(row):
    b = chess.Board(row["FEN"]); moves = row["Moves"].split()
    b.push_uci(moves[0])
    for i in range(1, len(moves), 2):
        sol = chess.Move.from_uci(moves[i])
        info = eng.analyse(b, chess.engine.Limit(depth=20), multipv=2)
        best = info[0]["pv"][0]
        last = i == len(moves) - 1
        b2 = b.copy(); b2.push(sol)
        if last and b2.is_checkmate(): pass           # any mate is accepted at the end anyway
        else:
            if best != sol: return False
            if len(info) > 1:
                s1 = info[0]["score"].pov(b.turn); s2 = info[1]["score"].pov(b.turn)
                if not s1.is_mate() or s1.mate() < 0:
                    if s2.score(mate_score=100000) is not None and s1.score(mate_score=100000) - s2.score(mate_score=100000) < 150: return False
                elif s2.is_mate() and s2.mate() > 0 and s2.mate() <= s1.mate(): return False
        b.push(sol)
        if i + 1 < len(moves): b.push_uci(moves[i + 1])
    return True

out = {}
for cid in CLASSES:
    out[cid] = []
    for tier, lo, hi in TIERS:
        cands = [row for _, row in sorted(pools[cid][tier], key=lambda x: x[0])[:CANDIDATES * 4]]
        got = 0
        for row in cands:
            if row["PuzzleId"] in seen: continue
            if not verified(row): continue
            seen.add(row["PuzzleId"])
            out[cid].append({"id": row["PuzzleId"], "fen": row["FEN"], "moves": row["Moves"].split(), "rating": int(row["Rating"]),
                             "tier": tier, "url": row["GameUrl"], "themes": row["Themes"].split()})
            got += 1
            if got == PER_TIER: break
        print(cid, tier, "picked", got, "of", len(pools[cid][tier]), "candidates", flush=True)
eng.quit()
json.dump(out, open("puzzles.json", "w"), indent=0)
print("total", sum(len(v) for v in out.values()))
