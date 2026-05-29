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

  /* ====== Counter animation ====== */
  (function(){
    document.querySelectorAll('.stat .v').forEach((el,idx)=>{
      const target = parseFloat(el.dataset.count);
      const isFloat = !Number.isInteger(target);
      const dur = 1100;
      const start = performance.now() + 1500 + idx*100;
      function tick(now){
        if(now < start){ requestAnimationFrame(tick); return; }
        const t = Math.min(1,(now-start)/dur);
        const eased = 1 - Math.pow(1-t, 3);
        const val = isFloat ? (target*eased).toFixed(1) : Math.floor(target*eased);
        const unit = el.querySelector('.unit');
        el.firstChild.textContent = val;
        if(t<1) requestAnimationFrame(tick);
        else el.firstChild.textContent = isFloat ? target.toFixed(1) : target;
      }
      requestAnimationFrame(tick);
    });
  })();

  /* ====== DNA helix generation ====== */
  (function(){
    const svg = document.querySelector('.helix svg g');
    if(!svg) return;
    const W = 200, H = 300, steps = 22;
    let html = '';
    for(let i=0;i<steps;i++){
      const t = i/(steps-1);
      const y = 10 + t*(H-20);
      const phase = t*Math.PI*4;
      const x1 = 100 + Math.sin(phase)*44;
      const x2 = 100 + Math.sin(phase+Math.PI)*44;
      // rung
      html += `<line class="rung" x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" opacity="${0.25 + 0.5*Math.abs(Math.cos(phase))}"/>`;
      html += `<circle class="node" cx="${x1}" cy="${y}" r="2.6"/>`;
      html += `<circle class="node alt" cx="${x2}" cy="${y}" r="2.6"/>`;
    }
    svg.innerHTML = html;
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
    const empty = document.createElement('div');
    empty.className = 'stack-empty';
    empty.textContent = '// select a category to view items';
    el.appendChild(empty);
    stack.forEach((s,i)=>{
      const d = document.createElement('span');
      d.className = 'chip hidden';
      d.dataset.cats = s.c.join(' ');
      d.textContent = s.n;
      d.style.animationDelay = (i*0.012) + 's';
      el.appendChild(d);
    });
    // Filter handling — start empty; "All" shows everything, category shows only matches
    document.querySelectorAll('.filter').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        document.querySelectorAll('.filter').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        const cat = btn.dataset.cat;
        empty.style.display = 'none';
        document.querySelectorAll('#stack .chip').forEach(chip=>{
          const cats = chip.dataset.cats.split(' ');
          const show = cat==='all' || cats.includes(cat);
          chip.classList.toggle('hidden', !show);
        });
      });
    });
  })();
