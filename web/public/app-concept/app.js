(() => {
  const pages = ["home","games","friends","rewards","profile","setup","demo"];
  let currentGame = "ludo";
  let selectedMode = "computer";
  let coins = 1250;
  let claimed = false;
  const titles = {ekah:"EKAH",ludo:"Ludo",snakes:"Snakes & Ladders",chess:"Chess",sudoku:"Sudoku",words:"Word Puzzle"};
  const art = {ekah:"/art/ekah.svg",ludo:"/art/ludo.svg",snakes:"/art/snakes.svg",chess:"/art/chess.svg",sudoku:"/art/sudoku.svg",words:"/art/words.svg"};
  const view = document.getElementById("view");
  const toastEl = document.getElementById("toast");
  let toastTimer;
  function toast(message){
    toastEl.textContent=message;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>toastEl.classList.remove("show"),2200);
  }
  function showPage(name){
    if(!pages.includes(name)) return;
    document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id==="page-"+name));
    document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.page===name));
    document.querySelector(".bottom-nav").style.display=["setup","demo"].includes(name)?"none":"flex";
    window.scrollTo({top:0,behavior:"smooth"});
  }
  function openGame(id){
    currentGame=id;
    document.getElementById("setup-title").textContent=titles[id];
    document.getElementById("setup-art").src=art[id];
    document.getElementById("setup-sub").textContent=id==="ekah"?"A fresh card game built for your circle.":"Choose how you want to play.";
    document.querySelectorAll(".choice").forEach((c,i)=>c.classList.toggle("selected",i===0));
    selectedMode="computer";
    const players=document.getElementById("players");
    players.innerHTML=id==="chess"||id==="sudoku"||id==="words"?"<option>1 player</option><option>2 players</option>":"<option>2 players</option><option>3 players</option><option>4 players</option>";
    showPage("setup");
  }
  function syncCoins(){
    document.getElementById("coin-count").textContent=coins.toLocaleString("en-IN");
    document.getElementById("wallet-count").textContent=coins.toLocaleString("en-IN");
    document.getElementById("gift-state").innerHTML=claimed?"Collected ✓":"Collect <b>›</b>";
    document.getElementById("gift-state-2").textContent=claimed?"Collected ✓":"Collect ›";
  }
  function claim(){
    if(claimed){toast("Your daily gift has already been collected.");return;}
    claimed=true;coins+=25;syncCoins();toast("25 Ambaro coins added to your wallet!");
  }
  document.addEventListener("click",e=>{
    const page=e.target.closest("[data-page]");
    if(page){showPage(page.dataset.page);return;}
    const game=e.target.closest("[data-game]");
    if(game){openGame(game.dataset.game);return;}
    const mode=e.target.closest("[data-mode]");
    if(mode){selectedMode=mode.dataset.mode;document.querySelectorAll(".choice").forEach(c=>c.classList.toggle("selected",c===mode));return;}
    const filter=e.target.closest("[data-filter]");
    if(filter){
      document.querySelectorAll(".filter").forEach(f=>f.classList.toggle("active",f===filter));
      document.querySelectorAll(".list-game").forEach(item=>item.hidden=filter.dataset.filter!=="all"&&item.dataset.kind!==filter.dataset.filter);
      return;
    }
    const action=e.target.closest("[data-action]")?.dataset.action;
    if(!action)return;
    if(action==="claim"){claim();return;}
    if(action==="play"||action==="quick"){openGame("ludo");return;}
    if(action==="back"){showPage("games");return;}
    if(action==="create-room"){openGame("ludo");document.querySelectorAll(".choice").forEach(c=>c.classList.toggle("selected",c.dataset.mode==="friends"));selectedMode="friends";toast("Choose a game, then start a room preview.");return;}
    if(action==="join-room"){
      const code=document.getElementById("room-code").value.trim().toUpperCase();
      const msg=document.getElementById("join-message");
      if(!/^[A-Z0-9]{4}$/.test(code)){msg.textContent="Enter a valid 4-character room code.";return;}
      msg.textContent="Room code accepted for this preview. Live rooms are not connected.";
      toast("Demo only — no live room was joined.");return;
    }
    if(action==="start-game"){
      document.getElementById("demo-title").textContent=titles[currentGame];
      const board=document.getElementById("demo-board");
      board.innerHTML=currentGame==="chess"?"♟　♞　♜<span>AMBARO</span>♜　♞　♟":"<span>✦</span><span>AMBARO</span><span>✦";
      showPage("demo");
      if(selectedMode==="friends")toast("Room setup preview — no server connection.");
      else toast("Demo screen opened. This is not a live game.");
    }
  });
  syncCoins();
})();