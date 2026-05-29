  /* ====== Security gate ====== */
  (function(){
    // SHA-256 of the access code is stored here — the literal code is NOT in
    // the source. Note: on a static site this only deters casual snooping; a
    // short numeric code can still be brute-forced offline by a determined visitor.
    const HASH = '8889f9aaec125c63f9258625ec3671410f6b2aaf4cacacace05dedf14c66e21c';
    const KEY  = 'site-unlocked';
    const gate  = document.getElementById('gate');
    const form  = document.getElementById('gate-form');
    const input = document.getElementById('gate-input');
    const card  = document.querySelector('.gate-card');
    const errEl = document.getElementById('gate-error');
    if(!gate || !form) return;

    function unlock(){
      document.body.classList.add('unlocked');
      try{ sessionStorage.setItem(KEY,'1'); }catch(e){}
    }

    // Stay unlocked for the rest of this browser session.
    try{ if(sessionStorage.getItem(KEY)==='1'){ unlock(); return; } }catch(e){}

    async function sha256hex(str){
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
      return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
    }

    function fail(msg){
      errEl.textContent = msg || '// Incorrect code. Try again.';
      card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
      input.value=''; input.focus();
    }

    form.addEventListener('submit', async function(e){
      e.preventDefault();
      const code = input.value.trim();
      if(!code){ fail('// Enter the code.'); return; }
      try{
        const h = await sha256hex(code);
        if(h === HASH){ errEl.textContent=''; input.value=''; unlock(); }
        else fail();
      }catch(err){
        fail('// Unable to verify in this browser.');
      }
    });

    setTimeout(()=>{ try{ input.focus(); }catch(e){} }, 50);
  })();

  /* ====== Char-by-char name reveal ====== */
  (function(){
    const el = document.getElementById('name');
    const html = el.innerHTML;
    // Wrap each visible character in a span while preserving the .italic span.
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    function wrap(node){
      const out = document.createDocumentFragment();
      node.childNodes.forEach(n=>{
        if(n.nodeType===3){
          [...n.textContent].forEach((ch,i)=>{
            const s = document.createElement('span');
            s.className='char';
            s.textContent = ch;
            out.appendChild(s);
          });
        } else if(n.nodeType===1){
          const clone = n.cloneNode(false);
          clone.appendChild(wrap(n));
          out.appendChild(clone);
        }
      });
      return out;
    }
    el.innerHTML='';
    el.appendChild(wrap(tmp));
    document.querySelectorAll('#name .char').forEach((c,i)=>{
      c.style.animationDelay = (0.35 + i*0.035) + 's';
    });
  })();

  /* ====== Counter animation (runs each time the Work view is opened) ====== */
  function runCounters(){
    document.querySelectorAll('.stat .v').forEach(el=>{
      const target = parseFloat(el.dataset.count);
      const isFloat = !Number.isInteger(target);
      const dur = 1100;
      const start = performance.now();
      el.firstChild.textContent = isFloat ? '0.0' : '0';
      function tick(now){
        const t = Math.min(1,(now-start)/dur);
        const eased = 1 - Math.pow(1-t, 3);
        const val = isFloat ? (target*eased).toFixed(1) : Math.floor(target*eased);
        el.firstChild.textContent = val;
        if(t<1) requestAnimationFrame(tick);
        else el.firstChild.textContent = isFloat ? target.toFixed(1) : target;
      }
      requestAnimationFrame(tick);
    });
  }

  /* ====== Ambient Pac-Man field ======
     A subtle, fixed background. Dots are laid out as straight corridors with
     sharp corners (no maze border). Pac-Man pathfinds (BFS) to the nearest
     remaining dot; the ghost pathfinds to Pac-Man. Eaten dots fade back in
     after a while. If the ghost catches Pac-Man, Pac-Man vanishes for 5s and
     respawns at its start; the ghost holds still while Pac-Man is gone. */
  (function(){
    const canvas = document.getElementById('pac-canvas');
    if(!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

    const CELL = 34;          // px per grid cell
    const PAC_SPEED  = 3.2;   // cells / second
    const GHOST_SPEED = 1.9;  // much slower so Pac-Man can actually escape
    const DIRS = [[1,0],[-1,0],[0,1],[0,-1]];
    const key = (x,y)=> x+','+y;
    const PAC_ALPHA = 0.4, GHOST_ALPHA = 0.3, DOT_ALPHA = 0.18;
    const FADE_SPEED = 2.5;   // opacity units / second for spawn/death fades
    const RELEASE_MS = 60000; // release another ghost each uncaught minute
    const MAX_GHOSTS = 4;

    let W, H, cols, rows, offX, offY, dpr;
    let open, graph, dots, pac, ghosts, nestCells, nextRelease, startCell;
    let last = 0;

    function inGrid(x,y){ return x>=0 && y>=0 && x<cols && y<rows; }

    // Adjacency over open cells (4-directional, no screen wrapping).
    function buildGraph(cellset){
      const g = new Map();
      cellset.forEach(k=>{
        const [x,y] = k.split(',').map(Number);
        const nb = [];
        DIRS.forEach(d=>{ const nk = key(x+d[0], y+d[1]); if(cellset.has(nk)) nb.push(nk); });
        g.set(k, nb);
      });
      return g;
    }

    // Cells reachable from `start` — keeps the field one connected graph so
    // every dot has a route and the ghost can never be stranded.
    function componentOf(g, start){
      const seen = new Set([start]); const q = [start];
      while(q.length){ const c = q.shift(); for(const n of (g.get(c)||[])){ if(!seen.has(n)){ seen.add(n); q.push(n); } } }
      return seen;
    }

    // Grid row just above the page title (falls back to a sane spot if it can't
    // be measured yet, e.g. while the security gate still covers the page).
    function titleRow(){
      try{
        const el = document.getElementById('name');
        const r = el && el.getBoundingClientRect();
        if(r && r.height){ return Math.max(2, Math.round((r.top - offY)/CELL) - 1); }
      }catch(e){}
      return Math.max(2, Math.round(H*0.16/CELL));
    }

    function buildMaze(){
      open = new Set();
      const noDot = new Set();
      const add = (x,y,dot)=>{ if(!inGrid(x,y)) return; open.add(key(x,y)); if(dot===false) noDot.add(key(x,y)); };

      // Maze region below the title row.
      const rowT = Math.min(titleRow(), Math.floor(rows*0.4));
      const sp = 2;                                       // corridor + wall spacing
      const mTop = rowT + 2, mBot = rows - 2, mLeft = 1, mRight = cols - 2;
      const ncols = Math.max(2, Math.floor((mRight - mLeft)/sp) + 1);
      const nrows = Math.max(2, Math.floor((mBot  - mTop )/sp) + 1);
      const nodeX = i => mLeft + i*sp, nodeY = j => mTop + j*sp;
      const NB = [[1,0],[-1,0],[0,1],[0,-1]];

      // 1) Carve a random maze (recursive backtracker) over the node grid.
      const visited = new Set(['0|0']);
      add(nodeX(0), nodeY(0));
      const stack = [[0,0]];
      while(stack.length){
        const [i,j] = stack[stack.length-1];
        const cand = [];
        NB.forEach(([di,dj])=>{ const ni=i+di, nj=j+dj; if(ni>=0&&nj>=0&&ni<ncols&&nj<nrows&&!visited.has(ni+'|'+nj)) cand.push([ni,nj,di,dj]); });
        if(!cand.length){ stack.pop(); continue; }
        const [ni,nj,di,dj] = cand[(Math.random()*cand.length)|0];
        visited.add(ni+'|'+nj);
        add(nodeX(i)+di, nodeY(j)+dj);                   // open the wall between
        add(nodeX(ni), nodeY(nj));
        stack.push([ni,nj]);
      }

      // 2) Braid: every node with a single passage gets another, so no corridor
      //    ever dead-ends — each end meets a corner, T or crossing.
      for(let i=0;i<ncols;i++) for(let j=0;j<nrows;j++){
        const nx=nodeX(i), ny=nodeY(j);
        const opened = NB.filter(([di,dj])=> open.has(key(nx+di,ny+dj)));
        if(opened.length<=1){
          const closed = NB.filter(([di,dj])=>{ const ni=i+di,nj=j+dj; return ni>=0&&nj>=0&&ni<ncols&&nj<nrows && !open.has(key(nx+di,ny+dj)); });
          if(closed.length){ const [di,dj]=closed[(Math.random()*closed.length)|0]; add(nx+di,ny+dj); }
        }
      }

      // 3) Pac-Man's opening run: a horizontal line just above the title, joined
      //    to the maze by a right-hand spine (its main drop) and a left corner,
      //    so both ends connect and the line itself never dead-ends.
      const startX = mLeft, endX = nodeX(ncols-1);
      const blank = 3, dotEnd = Math.max(startX, endX - blank);
      for(let x=startX; x<=endX; x++) add(x, rowT, x<=dotEnd);
      startCell = key(startX, rowT);
      for(let y=rowT; y<=mTop; y++) add(endX, y);         // spine into top-right node
      add(startX, rowT+1);                                // corner into top-left node

      // Collapse to the connected field that contains Pac-Man's start.
      graph = buildGraph(open);
      open  = componentOf(graph, startCell);
      graph = buildGraph(open);

      // Dots on every open cell except the deliberate blanks.
      dots = new Map();
      open.forEach(k=>{ if(!noDot.has(k)) dots.set(k, {eaten:false, respawnAt:0, fade:1}); });

      // Ghost nests at the bottom of the page (up to MAX_GHOSTS, spread out).
      const byBottom = [...open].sort((a,b)=>{
        const ya=+a.split(',')[1], yb=+b.split(',')[1];
        return yb-ya || (+a.split(',')[0]) - (+b.split(',')[0]);
      });
      nestCells = [];
      for(const k of byBottom){
        if(nestCells.length>=MAX_GHOSTS) break;
        const x = +k.split(',')[0];
        if(nestCells.every(n=> Math.abs((+n.split(',')[0]) - x) >= 3)) nestCells.push(k);
      }
      if(!nestCells.length) nestCells = [byBottom[0]];

      pac = mover(startCell); pac.dir = [1,0];
      pac.fade = 1; pac.fadeTarget = 1; pac.dead = false; pac.deadUntil = 0;

      // Start with a single ghost; more are released over time.
      ghosts = [ makeGhost(nestCells[0]) ];
      nextRelease = performance.now() + RELEASE_MS;
    }

    function mover(cell){ return {cell, from:cell, to:cell, t:1, dir:[1,0]}; }
    function makeGhost(cell){ const m = mover(cell); m.fade = 0; m.fadeTarget = 1; m.nest = cell; m.respawn = false; return m; }
    function approach(v, target, dt){ const s = FADE_SPEED*dt; return v<target ? Math.min(target, v+s) : v>target ? Math.max(target, v-s) : v; }

    // BFS — returns the first neighbour of `start` on the shortest path to any
    // cell matching isGoal(), or null if none reachable.
    function bfsStep(start, isGoal){
      const prev = new Map(); prev.set(start, null);
      const q = [start]; let goal = null;
      while(q.length){
        const c = q.shift();
        if(c!==start && isGoal(c)){ goal = c; break; }
        const nbs = graph.get(c) || [];
        for(const n of nbs){ if(!prev.has(n)){ prev.set(n, c); q.push(n); } }
      }
      if(goal===null) return null;
      let cur = goal, p = prev.get(cur);
      while(p!==null && p!==start){ cur = p; p = prev.get(cur); }
      return p===null ? null : cur;
    }

    function eatDot(cell){
      const d = dots.get(cell);
      if(d && !d.eaten){ d.eaten = true; d.fade = 0; d.respawnAt = performance.now() + 6000 + Math.random()*9000; }
    }

    // Multi-source BFS distance field over the graph (0 at every source).
    function field(sources){
      const dist = new Map(); const q = [];
      sources.forEach(s=>{ if(!dist.has(s)){ dist.set(s,0); q.push(s); } });
      for(let h=0; h<q.length; h++){
        const c = q[h], dc = dist.get(c);
        for(const n of (graph.get(c)||[])){ if(!dist.has(n)){ dist.set(n, dc+1); q.push(n); } }
      }
      return dist;
    }

    // Pac-Man's "smart" move: head for dots when safe, but flee toward open
    // junctions (away from ghosts) when one closes in. Scores each neighbour by
    // distance-to-nearest-dot vs distance-to-nearest-ghost.
    function pacNext(){
      const nb = graph.get(pac.cell) || [];
      if(!nb.length) return null;
      const ghostCells = ghosts.filter(g=> g.fade>0.5 && !g.respawn).map(g=> g.cell);
      const gd = ghostCells.length ? field(ghostCells) : null;            // dist to nearest ghost
      const dotCells = []; dots.forEach((d,k)=>{ if(!d.eaten) dotCells.push(k); });
      const dd = field(dotCells);                                         // dist to nearest dot
      let best = nb[0], bestScore = -Infinity;
      for(const n of nb){
        const g = gd && gd.has(n) ? gd.get(n) : Infinity;
        const d = dd.has(n) ? dd.get(n) : 50;
        let score = -d;                                 // baseline: get closer to a dot
        if(g <= 1)        score = -1e6;                 // never step onto a ghost
        else if(g <= 5){                                // threatened: prioritise survival
          score += g * 3.5;                             // climb the safety gradient
          score += (graph.get(n).length) * 1.5;         // prefer junctions to dead-ends
          score -= (6 - g) * 4;                         // the closer the ghost, the more urgent
        }
        if(n === pac.from) score -= 0.6;                // small anti-jitter (avoid pointless reversing)
        if(score > bestScore){ bestScore = score; best = n; }
      }
      return best;
    }

    function chooseNext(m){
      let step = null;
      if(m===pac){
        step = pacNext();
      } else {
        step = bfsStep(m.cell, c=> c===pac.cell);
      }
      if(!step){ m.to = m.cell; m.t = 1; return; }
      const f = m.cell.split(',').map(Number), t = step.split(',').map(Number);
      m.from = m.cell; m.to = step; m.t = 0; m.dir = [t[0]-f[0], t[1]-f[1]];
    }

    function arrive(m){
      m.cell = m.to;
      if(m===pac) eatDot(m.cell);
    }

    function step(m, speed, dt){
      if(m.t < 1 && m.to !== m.cell){
        m.t += speed*dt;
        if(m.t >= 1){ m.t = 1; arrive(m); }
      } else { chooseNext(m); }
    }

    function pos(m){
      const f = m.from.split(',').map(Number), t = m.to.split(',').map(Number);
      const x = (f[0] + (t[0]-f[0])*m.t)*CELL + CELL/2 + offX;
      const y = (f[1] + (t[1]-f[1])*m.t)*CELL + CELL/2 + offY;
      return {x, y};
    }

    function catchPac(now){
      pac.dead = true; pac.deadUntil = now + 5000; pac.fadeTarget = 0;
      // Every ghost fades out and respawns back at its nest.
      ghosts.forEach(g=>{ g.fadeTarget = 0; g.respawn = true; });
    }

    function update(now, dt){
      // Dot respawn + fade-in.
      dots.forEach(d=>{
        if(d.eaten && now >= d.respawnAt){ d.eaten = false; d.fade = 0; }
        if(!d.eaten && d.fade < 1){ d.fade = Math.min(1, d.fade + dt*1.1); }
      });

      // Pac-Man + ghost opacity fades.
      pac.fade = approach(pac.fade, pac.fadeTarget, dt);
      ghosts.forEach(g=>{
        g.fade = approach(g.fade, g.fadeTarget, dt);
        if(g.respawn && g.fade <= 0.02){      // once faded out, reappear at the nest
          g.cell = g.nest; g.from = g.nest; g.to = g.nest; g.t = 1;
          g.respawn = false; g.fadeTarget = 1;
        }
      });

      if(pac.dead){
        // Ghosts hold at their nests until Pac-Man comes back.
        if(now >= pac.deadUntil){
          pac.dead = false; pac.cell = startCell; pac.from = startCell; pac.to = startCell; pac.t = 1;
          pac.fadeTarget = 1; nextRelease = now + RELEASE_MS;   // reset the uncaught timer
        }
        return;
      }

      step(pac, PAC_SPEED, dt);

      // Release another ghost for each uncaught minute, up to MAX_GHOSTS.
      if(ghosts.length < MAX_GHOSTS && now >= nextRelease){
        ghosts.push(makeGhost(nestCells[ghosts.length % nestCells.length]));
        nextRelease = now + RELEASE_MS;
      }

      const pp = pos(pac);
      ghosts.forEach(g=> step(g, GHOST_SPEED, dt));
      for(const g of ghosts){
        if(g.fade < 0.6) continue;            // ignore ghosts mid fade-in/out
        const gp = pos(g);
        if(Math.hypot(pp.x-gp.x, pp.y-gp.y) < CELL*0.55){ catchPac(now); break; }
      }
    }

    function drawGhost(g, p, now){
      const r = CELL*0.40;
      ctx.save();
      ctx.globalAlpha = GHOST_ALPHA * g.fade;
      ctx.fillStyle = '#e8f0eb';                   // white
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, Math.PI, 0);            // dome
      const baseY = p.y + r, feet = 4, wob = (Math.sin(now/180)*1.5);
      ctx.lineTo(p.x + r, baseY + wob);
      for(let i=0;i<feet;i++){
        const x0 = p.x + r - (i*2+1)*(r/feet);
        const x1 = p.x + r - (i*2+2)*(r/feet);
        ctx.quadraticCurveTo((x0+x1)/2, baseY - 5 + wob, x1, baseY + wob);
      }
      ctx.closePath(); ctx.fill();
      // dark eyes looking toward movement (readable on the white body)
      const ex = r*0.36, ey = -r*0.10, er = r*0.30;
      ctx.fillStyle = '#06241d';
      const dx = g.dir[0]*er*0.45, dy = g.dir[1]*er*0.45;
      ctx.beginPath(); ctx.arc(p.x-ex+dx, p.y+ey+dy, er*0.6, 0, 7); ctx.arc(p.x+ex+dx, p.y+ey+dy, er*0.6, 0, 7); ctx.fill();
      ctx.restore();
    }

    function drawPac(p, now){
      const r = CELL*0.42;
      const ang = Math.atan2(pac.dir[1], pac.dir[0]);
      const chomp = Math.abs(Math.sin(now/110)) * 0.32 * Math.PI;
      ctx.save();
      ctx.globalAlpha = PAC_ALPHA * pac.fade;
      ctx.fillStyle = '#91D6AC';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.arc(p.x, p.y, r, ang + chomp, ang + 2*Math.PI - chomp);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    function render(now){
      ctx.clearRect(0,0,W,H);
      // dots
      ctx.fillStyle = '#91D6AC';
      dots.forEach((d,k)=>{
        if(d.eaten) return;
        const [gx,gy] = k.split(',').map(Number);
        ctx.globalAlpha = DOT_ALPHA * d.fade;
        ctx.beginPath();
        ctx.arc(gx*CELL + CELL/2 + offX, gy*CELL + CELL/2 + offY, 2.2, 0, 7);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      ghosts.forEach(g=>{ if(g.fade > 0.01) drawGhost(g, pos(g), now); });
      if(pac.fade > 0.01) drawPac(pos(pac), now);
    }

    function frame(now){
      const dt = Math.min(0.05, (now - last)/1000 || 0);
      last = now;
      update(now, dt);
      render(now);
      requestAnimationFrame(frame);
    }

    function resize(){
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = window.innerWidth; H = window.innerHeight;
      cols = Math.max(8, Math.floor(W/CELL));
      rows = Math.max(8, Math.floor(H/CELL));
      offX = (W - cols*CELL)/2;
      offY = (H - rows*CELL)/2;
      canvas.width = W*dpr; canvas.height = H*dpr;
      canvas.style.width = W+'px'; canvas.style.height = H+'px';
      ctx.setTransform(dpr,0,0,dpr,0,0);
      buildMaze();
    }

    let rt;
    window.addEventListener('resize', ()=>{ clearTimeout(rt); rt = setTimeout(resize, 200); });
    resize();

    // The page (and title) stay hidden until the gate is unlocked; rebuild once
    // it's visible so the opening line lands just above the real title.
    if(!document.body.classList.contains('unlocked')){
      const mo = new MutationObserver(()=>{
        if(document.body.classList.contains('unlocked')){
          mo.disconnect(); resize();
          if(reduce){ ghosts.forEach(g=>g.fade=1); render(performance.now()); }
        }
      });
      mo.observe(document.body, {attributes:true, attributeFilter:['class']});
    }

    if(reduce){ ghosts.forEach(g=>g.fade=1); render(performance.now()); return; }   // static frame
    requestAnimationFrame(frame);
  })();

  /* ====== View toggle (Person / Work / Portfolio) ====== */
  (function(){
    const body = document.body;
    const views = ['person','work','portfolio'];
    document.querySelectorAll('.view-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const view = btn.dataset.view;
        document.querySelectorAll('.view-btn').forEach(b=>{
          const on = b===btn;
          b.classList.toggle('active', on);
          b.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        document.querySelectorAll('.tagline').forEach(t=>t.classList.toggle('active', t.dataset.view===view));
        views.forEach(v=>body.classList.toggle('view-'+v, v===view));
        if(view==='work') runCounters();
      });
    });
  })();

  /* ====== Stack chips + filtering ====== */
  (function(){
    const stack = [
      {n:'21 CFR Part 11',          c:['compliance']},
      {n:'Active Directory',        c:['infra']},
      {n:'Action1',                 c:['infra']},
      {n:'Azure',                   c:['cloud']},
      {n:'Azure AI Foundry',        c:['ai']},
      {n:'Azure Arc',               c:['infra']},
      {n:'Azure Functions',         c:['dev']},
      {n:'Backup & DR',             c:['infra']},
      {n:'Bare Metal',              c:['hardware']},
      {n:'Barracuda',               c:['security']},
      {n:'C#',                      c:['dev']},
      {n:'ChatGPT',                 c:['ai']},
      {n:'Cisco Firewall',          c:['security']},
      {n:'Cisco Meraki',            c:['infra']},
      {n:'Claude',                  c:['ai']},
      {n:'Copilot for M365',        c:['ai']},
      {n:'Copilot Studio',          c:['ai']},
      {n:'DeepSeek',                c:['ai']},
      {n:'Dell OpenManage',         c:['hardware']},
      {n:'Dell PowerEdge',          c:['hardware']},
      {n:'Endpoint Security',       c:['security']},
      {n:'Entra Admin Center',      c:['cloud']},
      {n:'Entra ID',                c:['security']},
      {n:'ERP',                     c:['infra']},
      {n:'Exchange',                c:['cloud']},
      {n:'Exchange Admin Center',   c:['cloud']},
      {n:'Gemini',                  c:['ai']},
      {n:'Gemma',                   c:['ai']},
      {n:'GMP',                     c:['compliance']},
      {n:'GxP',                     c:['compliance']},
      {n:'Hardware',                c:['hardware']},
      {n:'Help Desk',               c:['infra']},
      {n:'Hyper-V',                 c:['infra']},
      {n:'Intune',                  c:['security']},
      {n:'Intune Admin Center',     c:['security']},
      {n:'JavaScript',              c:['dev']},
      {n:'LLMs',                    c:['ai']},
      {n:'LM Studio',               c:['ai']},
      {n:'M365 Admin Center',       c:['cloud']},
      {n:'M365 Security',           c:['security']},
      {n:'Microsoft 365',           c:['cloud']},
      {n:'Microsoft Defender',      c:['security']},
      {n:'Microsoft Graph',         c:['dev']},
      {n:'Microsoft Purview',       c:['compliance']},
      {n:'Microsoft Sentinel',      c:['security']},
      {n:'Mistral',                 c:['ai']},
      {n:'Ollama',                  c:['ai']},
      {n:'OneDrive',                c:['cloud']},
      {n:'Outlook',                 c:['cloud']},
      {n:'Patch Management',        c:['security']},
      {n:'Penetration Testing',     c:['security']},
      {n:'Phi',                     c:['ai']},
      {n:'Phishing Simulation',     c:['security']},
      {n:'Power Apps',              c:['dev']},
      {n:'Power Automate',          c:['dev']},
      {n:'Power BI',                c:['cloud']},
      {n:'Power Platform Admin',    c:['cloud']},
      {n:'PowerShell',              c:['dev']},
      {n:'Proxmox',                 c:['infra']},
      {n:'Python',                  c:['dev']},
      {n:'Qwen',                    c:['ai']},
      {n:'SAN',                     c:['hardware']},
      {n:'SentinelOne',             c:['security']},
      {n:'Server Hardware',         c:['hardware']},
      {n:'SharePoint',              c:['cloud']},
      {n:'SharePoint Admin Center', c:['cloud']},
      {n:'Soldering',               c:['hardware']},
      {n:'SQL',                     c:['dev']},
      {n:'SSH',                     c:['dev']},
      {n:'Teams',                   c:['cloud']},
      {n:'Teams Admin Center',      c:['cloud']},
      {n:'Veeam Backup',            c:['infra']},
      {n:'VMware vCenter',          c:['infra']},
      {n:'VMware vSAN',             c:['infra']},
      {n:'VMware vSphere',          c:['infra']},
      {n:'VPN',                     c:['security']},
      {n:'Vulnerability Mgmt',      c:['security']},
      {n:'Windows 11',              c:['infra']},
      {n:'Windows Admin',           c:['infra']},
      {n:'Windows Server',          c:['infra']},
    ];
    stack.sort((a,b)=>a.n.localeCompare(b.n));
    const el = document.getElementById('stack');
    stack.forEach(s=>{
      const d = document.createElement('span');
      d.className = 'chip';
      d.dataset.cats = s.c.join(' ');
      d.textContent = s.n;
      el.appendChild(d);
    });
    // Filter handling — every chip is always visible; "All" clears highlights,
    // a category outlines its matches instead of hiding the rest.
    document.querySelectorAll('.filter').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        document.querySelectorAll('.filter').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        const cat = btn.dataset.cat;
        document.querySelectorAll('#stack .chip').forEach(chip=>{
          const cats = chip.dataset.cats.split(' ');
          chip.classList.toggle('highlighted', cat!=='all' && cats.includes(cat));
        });
      });
    });
  })();
