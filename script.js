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
    const PAC_SPEED  = 3.4;   // cells / second
    const GHOST_SPEED = 3.0;
    const DIRS = [[1,0],[-1,0],[0,1],[0,-1]];
    const key = (x,y)=> x+','+y;

    let W, H, cols, rows, offX, offY, dpr;
    let open, graph, dots, pac, ghost, startCell;
    let last = 0, accel = 0;

    function inGrid(x,y){ return x>=0 && y>=0 && x<cols && y<rows; }

    // Build connected corridors via branching random walks → lines + corners.
    function buildMaze(){
      open = new Set();
      const cx = Math.floor(cols/2), cy = Math.floor(rows/2);
      open.add(key(cx,cy));
      const cells = [[cx,cy]];
      const walks = Math.max(10, Math.floor((cols*rows)/90));
      for(let w=0; w<walks; w++){
        const [sx,sy] = cells[(Math.random()*cells.length)|0];
        let x=sx, y=sy;
        const d = DIRS[(Math.random()*4)|0];
        const len = 3 + (Math.random()*7|0);
        for(let i=0;i<len;i++){
          x+=d[0]; y+=d[1];
          if(!inGrid(x,y)) break;
          const k = key(x,y);
          if(!open.has(k)){ open.add(k); cells.push([x,y]); }
        }
      }
      // Adjacency graph over open cells.
      graph = new Map();
      open.forEach(k=>{
        const [x,y] = k.split(',').map(Number);
        const nb = [];
        DIRS.forEach(d=>{ const nk = key(x+d[0],y+d[1]); if(open.has(nk)) nb.push(nk); });
        graph.set(k, nb);
      });
      // Dots on every open cell.
      dots = new Map();
      open.forEach(k=> dots.set(k, {eaten:false, respawnAt:0, fade:1}));
      // Start cells: a connected cell for Pac-Man, the farthest one for the ghost.
      const arr = [...open].filter(k=> graph.get(k).length>0);
      startCell = arr[0] || [...open][0];
      const sp = startCell.split(',').map(Number);
      let far = startCell, best = -1;
      arr.forEach(k=>{
        const p = k.split(',').map(Number);
        const dd = Math.abs(p[0]-sp[0]) + Math.abs(p[1]-sp[1]);
        if(dd>best){ best = dd; far = k; }
      });
      pac   = mover(startCell);
      ghost = mover(far);
      pac.dead = false; pac.deadUntil = 0;
    }

    function mover(cell){ return {cell, from:cell, to:cell, t:1, dir:[1,0]}; }

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

    function chooseNext(m){
      let step = null;
      if(m===pac){
        step = bfsStep(pac.cell, c=>{ const d = dots.get(c); return d && !d.eaten; });
        if(!step){ const nb = graph.get(pac.cell); step = nb.length ? nb[(Math.random()*nb.length)|0] : null; }
      } else {
        step = bfsStep(ghost.cell, c=> c===pac.cell);
      }
      if(step){
        const f = m.cell.split(',').map(Number), t = step.split(',').map(Number);
        m.from = m.cell; m.to = step; m.t = 0; m.dir = [t[0]-f[0], t[1]-f[1]];
      } else { m.to = m.cell; m.t = 1; }
    }

    function arrive(m){
      m.cell = m.to;
      if(m===pac){
        const d = dots.get(pac.cell);
        if(d && !d.eaten){ d.eaten = true; d.fade = 0; d.respawnAt = performance.now() + 6000 + Math.random()*9000; }
      }
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

    function update(now, dt){
      // Dot respawn + fade-in.
      dots.forEach(d=>{
        if(d.eaten && now >= d.respawnAt){ d.eaten = false; d.fade = 0; }
        if(!d.eaten && d.fade < 1){ d.fade = Math.min(1, d.fade + dt*1.1); }
      });
      if(pac.dead){
        if(now >= pac.deadUntil){ pac.dead = false; pac.cell = startCell; pac.from = startCell; pac.to = startCell; pac.t = 1; }
      } else {
        step(pac, PAC_SPEED, dt);
        step(ghost, GHOST_SPEED, dt);   // ghost only moves while Pac-Man exists
        const pp = pos(pac), gp = pos(ghost);
        if(Math.hypot(pp.x-gp.x, pp.y-gp.y) < CELL*0.55){ pac.dead = true; pac.deadUntil = now + 5000; }
      }
    }

    function drawGhost(p, now){
      const r = CELL*0.42;
      ctx.save();
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = '#00A9E0';
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
      // eyes look toward movement
      ctx.fillStyle = '#fff';
      const ex = r*0.38, ey = -r*0.12, er = r*0.26;
      ctx.beginPath(); ctx.arc(p.x-ex, p.y+ey, er, 0, 7); ctx.arc(p.x+ex, p.y+ey, er, 0, 7); ctx.fill();
      ctx.fillStyle = '#02201a';
      const dx = ghost.dir[0]*er*0.5, dy = ghost.dir[1]*er*0.5;
      ctx.beginPath(); ctx.arc(p.x-ex+dx, p.y+ey+dy, er*0.5, 0, 7); ctx.arc(p.x+ex+dx, p.y+ey+dy, er*0.5, 0, 7); ctx.fill();
      ctx.restore();
    }

    function drawPac(p, now){
      const r = CELL*0.44;
      const ang = Math.atan2(pac.dir[1], pac.dir[0]);
      const chomp = Math.abs(Math.sin(now/110)) * 0.32 * Math.PI;
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#e9d66b';
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
        ctx.globalAlpha = 0.30 * d.fade;
        ctx.beginPath();
        ctx.arc(gx*CELL + CELL/2 + offX, gy*CELL + CELL/2 + offY, 2.2, 0, 7);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      drawGhost(pos(ghost), now);
      if(!pac.dead) drawPac(pos(pac), now);
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

    if(reduce){ render(performance.now()); return; }   // static frame, no motion
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
