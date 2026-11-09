"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const canvas = $("world"), ctx = canvas.getContext("2d"), shell = $("game-shell");
  const palette = {blue:"#3366cc",red:"#d82631",green:"#24a642",purple:"#8537af",orange:"#ed8c16",pink:"#f56cae"};
  const labels = {sofa:"Patchwork sofa",chair:"Wooden chair",rug:"Oval rug",plant:"House plant",stereo:"Stereo",bed:"Puffle bed",bowl:"Double dish",toy:"Scratching post"};
  const petInfo = {pip:{name:"Pip",color:"purple",description:"Gary's Puffle Translator gives this little puffle a lot to say."},bubbles:{name:"Bubbles",color:"blue",description:"Easygoing, bouncy, and always ready to play."},pebble:{name:"Pebble",color:"red",description:"An adventurous puffle with a soft spot for snacks."}};
  let state, assets, images = {}, editing = false, draft = null, selected = null, dragging = null, dragStart = null;
  let currentPet = "pip", activeId = null, stream = null, lastFrame = 0, clock = 0, mode = "walk", emoteUntil = 0, emote = "";
  let partyUntil = 0, snowballs = [], toastTimer, penguinBubbleUntil = 0, keys = new Set(), resetScope = null, busySave = false, sending = false;
  const player = {x:368,y:362,tx:368,ty:362,dir:0,action:"idle",actionUntil:0};
  const puffles = {pip:{x:438,y:326,homeX:438,homeY:326,action:"idle",until:0},bubbles:{x:287,y:342,homeX:287,homeY:342,action:"idle",until:0},pebble:{x:486,y:379,homeX:486,homeY:379,action:"idle",until:0}};
  let prefs;
  try { prefs = JSON.parse(localStorage.getItem("puffle-prefs")) || {}; } catch { prefs = {}; }
  prefs = {muted:false,volume:35,music:"1",reduced:matchMedia("(prefers-reduced-motion: reduce)").matches,...prefs};
  let audioContext, gain, unlocked = false, lastCue = 0;
  const music = $("music-player");
  function savePrefs() { localStorage.setItem("puffle-prefs", JSON.stringify(prefs)); }
  function applyPrefs() {
    $("mute").checked = prefs.muted; $("volume").value = prefs.volume; $("music").value = prefs.music; $("reduce-motion").checked = prefs.reduced;
    $("sound-toggle").textContent = prefs.muted ? "Sound off" : "Sound on"; $("sound-toggle").setAttribute("aria-pressed", String(prefs.muted));
    document.body.classList.toggle("reduced",prefs.reduced);
    music.volume = prefs.volume / 100 * .45; music.muted = prefs.muted;
    if (gain) gain.gain.value = prefs.muted ? 0 : prefs.volume / 100 * .13;
    const src = prefs.music === "none" ? "" : `/assets/music-${prefs.music}.mp3`;
    if (src && music.getAttribute("src") !== src) { music.src = src; music.load(); }
    if (unlocked && !prefs.muted && src) music.play().catch(() => {}); else music.pause();
    savePrefs();
  }
  function unlockAudio() {
    if (!unlocked) {
      unlocked = true; audioContext = new AudioContext(); gain = audioContext.createGain(); gain.connect(audioContext.destination);
    }
    if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
    applyPrefs();
  }
  document.addEventListener("pointerdown",unlockAudio,{once:true}); document.addEventListener("keydown",unlockAudio,{once:true});
  function cue(kind="click") {
    if (!audioContext || prefs.muted || performance.now()-lastCue<60) return;
    lastCue=performance.now();
    const notes = {click:[660],feed:[440,660],play:[440,554,660],rest:[523,392],snow:[270],message:[784,988],win:[523,659,784,1046,784,1046]}[kind] || [660];
    notes.forEach((hz,i) => { const osc=audioContext.createOscillator(),env=audioContext.createGain(); const t=audioContext.currentTime+i*.11;
      osc.type=kind==="rest"?"sine":"triangle"; osc.frequency.value=hz; env.gain.setValueAtTime(0,t);env.gain.linearRampToValueAtTime(.8,t+.008);env.gain.exponentialRampToValueAtTime(.001,t+.16);
      osc.connect(env);env.connect(gain);osc.start(t);osc.stop(t+.18);
    });
  }
  async function api(path, method="GET", data) {
    const response = await fetch(path,{method,headers:data?{"Content-Type":"application/json"}:{},body:data?JSON.stringify(data):undefined});
    const body = await response.json();
    if (!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Please check that entry and try again.");
    return body;
  }
  function toast(text, duration=4500) { clearTimeout(toastTimer);$("toast").textContent=text;$("toast").hidden=false;toastTimer=setTimeout(()=>$("toast").hidden=true,duration); }
  function safeAction(fn) { return async event => { try { await fn(event); } catch(error) { toast(error.message,6500); } }; }
  function newRequestId() {
    if(crypto.randomUUID)return crypto.randomUUID();
    const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
    const hex=Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }
  function showDialog(name) {
    $("popup").hidden=true;
    if (name==="invitation") updateInvitation();
    if (name==="player") $("player-portrait").src=`/assets/player-card-${(draft||state.room).color}.png`;
    const dialog=$(name+"-dialog");if(!dialog.open)dialog.showModal();cue();
  }
  document.querySelectorAll("[data-open]").forEach(button=>button.addEventListener("click",()=>showDialog(button.dataset.open)));
  document.querySelectorAll("[data-close]").forEach(button=>button.addEventListener("click",()=>button.closest("dialog").close()));
  function showHistory(open = $("history").hidden) {
    $("history").hidden=!open;$("history-toggle").setAttribute("aria-expanded",String(open));$("history-toggle").textContent=open?"▴":"▾";
    if(open){renderHistory();$("history-lines").scrollTop=$("history-lines").scrollHeight;}
  }
  $("history-toggle").onclick=()=>showHistory();$("history-close").onclick=()=>showHistory(false);$("pip-bubble").onclick=()=>showHistory(true);
  function renderHistory() {
    const box=$("history-lines"),atEnd=box.scrollTop+box.clientHeight>=box.scrollHeight-30;
    box.replaceChildren();
    if (!state.turns.length) { const p=document.createElement("p");p.textContent="Your conversation with Pip will appear here.";box.append(p); }
    for (const turn of state.turns) {
      const article=document.createElement("article");
      if(turn.encoding){const tag=document.createElement("small"),labels={b64:"Base64",hex:"HEX",dec:"DEC",bin:"BIN"};tag.className="translator-tag";tag.textContent=`Gary's Translator · ${labels[turn.encoding]||turn.encoding.toUpperCase()}`;article.append(tag);}
      for (const [speaker,text] of [["Waddles",turn.text],["Pip",turn.reply]]) {
        if(!text)continue;const strong=document.createElement("strong"),p=document.createElement("p");strong.textContent=speaker;p.textContent=text;article.append(strong,p);
      }
      if(turn.status!=="complete") {const small=document.createElement("small");small.textContent=({queued:"Waiting for Pip…",thinking:"Pip is thinking…",cancelled:"Reply cancelled.",error:"The translator lost its words. Try your message again.",interrupted:"The translator restarted during this reply. You can try again."})[turn.status]||turn.status;article.append(small);}
      box.append(article);
    }
    if(atEnd)box.scrollTop=box.scrollHeight;
    $("memory-note").hidden=!state.turns.some(t=>t.trimmed);
  }
  function bubble(who,text) {
    const el=$(who==="pip"?"pip-bubble":"penguin-bubble");
    el.textContent=text.length>230 ? text.slice(0,225)+"… (chat history)" : text;el.hidden=!text;
    if(who!=="pip")penguinBubbleUntil=clock+8;
  }
  function updateInvitation() {
    const solved=state?.solved,disclosed=state?.disclosed;
    $("mail-dot").hidden=!disclosed;$("mail-dot").textContent=solved?"1":"!";$("claim-form").hidden=!!solved;$("earned-invitation").hidden=!solved;
    $("invite-heading").textContent=solved?"Let's get this party started!":disclosed?"A private transmission!":"You're on Pip's list.";
    $("invite-copy").textContent=solved?"Your invitation is safe here whenever you want to read it again.":disclosed?"Pip sent invitation bytes. Decode the reply, then enter the plaintext invitation code.":"There is a place for you at the igloo party. Bring your invitation code!";
    $("earned-code").textContent=solved?state.invitation:"";
  }
  function celebrate() { partyUntil=clock+9;player.action="dance";player.actionUntil=clock+9;for(const p of Object.values(puffles)){p.action="play";p.until=clock+9;}cue("win");toast("Party time! Your invitation is in your postcards.",6500);updateInvitation(); }
  async function refreshState() {
    const solved=!!state?.solved,disclosed=!!state?.disclosed;state=await api("/api/state");renderHistory();updateInvitation();
    if(state.disclosed&&!disclosed&&!state.solved){cue("message");toast("Gary's translator caught a private byte transmission. Decode Pip's reply and check your postcards.",7000);}
    if(state.solved&&!solved)celebrate();return state;
  }
  function watchReply(rid) {
    if(stream)stream.close();activeId=rid;$("reply-status").hidden=false;$("send").disabled=true;
    stream=new EventSource(`/api/chat/${rid}/events`);
    stream.onmessage=async event=>{
      const update=JSON.parse(event.data),turn=state.turns.find(t=>t.request_id===rid);
      if(turn)Object.assign(turn,update);
      $("reply-label").textContent=update.status==="queued" ? `Pip will be with you soon${update.position>1?` (${update.position} in line)`:""}…` : "Pip is thinking…";
      if(update.reply)bubble("pip",update.reply);
      renderHistory();
      if(!["queued","thinking"].includes(update.status)){
        stream.close();stream=null;activeId=null;$("reply-status").hidden=true;$("send").disabled=false;
        if(update.status==="complete")cue("message");
        else if(update.status==="error")toast("Pip's translator lost its words. Your message is in chat history; please try again.",6500);
        try{await refreshState();}catch(error){toast(error.message);}
      }
    };
    stream.addEventListener("reset",()=>{stream.close();activeId=null;$("reply-status").hidden=true;$("send").disabled=false;refreshState().catch(e=>toast(e.message));});
    stream.onerror=()=>{ if(activeId)$("reply-label").textContent="Reconnecting to Pip…"; };
  }
  $("chat-form").addEventListener("submit",safeAction(async event=>{
    event.preventDefault();if(activeId||sending)return;const text=$("message").value.trim();if(!text)return;sending=true;
    $("send").disabled=true;const rid=newRequestId();
    try {const accepted=await api("/api/chat","POST",{text,request_id:rid});state.turns.push({request_id:rid,text,reply:"",status:"queued",trimmed:0,encoding:accepted.encoding});
      if($("message").value.trim()===text){$("message").value="";localStorage.removeItem("puffle-chat-draft");}
      bubble("penguin",text);$("pip-bubble").hidden=true;renderHistory();watchReply(rid);
    } catch(error) {$("send").disabled=false;throw error;} finally {sending=false;}
  }));
  $("message").value=localStorage.getItem("puffle-chat-draft")||"";
  $("message").oninput=()=>localStorage.setItem("puffle-chat-draft",$("message").value);
  $("cancel-reply").onclick=safeAction(async()=>{if(activeId)await api(`/api/chat/${activeId}/cancel`,"POST",{});});
  $("quick-chat").onclick=()=>{ $("message").value="Hi Pip!";$("message").dispatchEvent(new Event("input"));$("message").focus(); };
  function popup(items) {
    const box=$("popup");box.replaceChildren();
    for(const [text,fn] of items) {const button=document.createElement("button");button.type="button";button.textContent=text;button.onclick=()=>{box.hidden=true;fn();};box.append(button);}
    box.hidden=false;box.querySelector("button").focus();
  }
  $("emotes").onclick=()=>popup([["Happy ☺",()=>setEmote("☺")],["Heart ♥",()=>setEmote("♥")],["Music ♫",()=>setEmote("♫")],["Surprised !",()=>setEmote("!")]]);
  function setEmote(text){emote=text;emoteUntil=clock+5;cue();}
  $("actions").onclick=()=>popup([["Wave",()=>act("wave")],["Sit down",()=>act("sit")],["Dance",()=>act("dance")],["Stand up",()=>act("idle")]]);
  function act(action) {player.action=action;player.actionUntil=action==="sit"?Infinity:clock+8;player.tx=player.x;player.ty=player.y;cue();}
  $("snowball").onclick=()=>{mode=mode==="snowball"?"walk":"snowball";$("snowball").setAttribute("aria-pressed",String(mode==="snowball"));if(mode==="snowball")toast("Click to throw, or press Space to throw ahead of you.");canvas.focus();};
  $("pets").onclick=()=>popup(Object.keys(petInfo).map(id=>[petInfo[id].name,()=>openPet(id)]));
  $("home").onclick=()=>{player.tx=368;player.ty=362;showHistory(false);$("popup").hidden=true;cue();};
  function openPet(id) {
    currentPet=id;const info=petInfo[id];$("pet-name").textContent=info.name;$("pet-portrait").src=`/assets/card-${info.color}.png`;$("pet-portrait").alt=`${info.color} puffle`;
    $("pet-description").textContent=info.description;$("talk-pip").hidden=id!=="pip";updateMeters();showDialog("care");
  }
  function updateMeters(){for(const field of ["food","energy","play"])$("stat-"+field).value=state.pets[currentPet][field];}
  document.querySelectorAll("[data-pet]").forEach(button=>button.onclick=()=>openPet(button.dataset.pet));
  document.querySelectorAll("[data-care]").forEach(button=>button.onclick=safeAction(async()=>{
    const action=button.dataset.care;button.disabled=true;
    try{const result=await api(`/api/puffle/${currentPet}/care`,"POST",{action});state.pets=result.pets;updateMeters();
      const p=puffles[currentPet];p.action=action;p.until=clock+5;
      const object=state.room.furniture.find(f=>f.kind===({feed:"bowl",play:"toy",rest:"bed"})[action]);
      p.target=object?{x:object.x,y:object.y+8}:{x:p.homeX,y:p.homeY};
      $("care-dialog").close();cue(action);toast(`${petInfo[currentPet].name} ${action==="feed"?"is having a snack.":action==="play"?"is ready to play!":"is settling down for a nap."}`,3000);
    }finally{button.disabled=false;}
  }));
  $("talk-pip").onclick=()=>{$("care-dialog").close();$("message").focus();};$("meet-pip").onclick=()=>{$("news-dialog").close();openPet("pip");};
  for(const [name,color] of Object.entries(palette)) {const button=document.createElement("button");button.title=name;button.setAttribute("aria-label",`Colour: ${name}`);button.style.background=color;
    button.onclick=safeAction(async()=>{if(editing){draft.color=name;saveDraft();}else{const result=await api("/api/room","PUT",{...state.room,color:name});state.room=result.room;}cue();$("player-portrait").src=`/assets/player-card-${name}.png`;});$("colours").append(button);
  }
  function saveDraft(){localStorage.setItem("puffle-room-draft",JSON.stringify(draft));}
  function beginEdit(){
    if(editing)return;let saved;try{saved=JSON.parse(localStorage.getItem("puffle-room-draft"));}catch{}
    draft=saved&&Array.isArray(saved.furniture)?saved:structuredClone(state.room);editing=true;selected=null;$("editor").hidden=false;$("decorate").hidden=true;
    showHistory(false);renderInventory();if(saved)toast("Your unfinished decorating has been restored.");
  }
  function finishEdit(){editing=false;draft=null;selected=null;dragging=null;$("editor").hidden=true;$("decorate").hidden=false;localStorage.removeItem("puffle-room-draft");}
  $("decorate").onclick=beginEdit;
  function renderInventory(){
    const box=$("inventory");box.replaceChildren();
    for(const [kind,label] of Object.entries(labels)){const button=document.createElement("button");button.title=label;button.setAttribute("aria-label",label);button.classList.toggle("selected",selected===kind);
      const img=document.createElement("img");img.src=`/assets/furniture-${kind}-0.png`;img.alt="";button.append(img);button.onclick=()=>{selected=kind;renderInventory();canvas.focus();};box.append(button);}
    $("selected-furniture").textContent=selected?`${labels[selected]} — click or Enter to place, arrows to move.`:"Choose some furniture.";
    const placed=draft.furniture.some(f=>f.kind===selected);
    $("remove-item").disabled=!placed;
    $("rotate-item").disabled=!placed||assets.furniture[selected]?.original_frames===1;
    $("rotate-item").title=placed&&assets.furniture[selected].original_frames===1?"This item has one orientation.":"Rotate selected furniture";
  }
  $("rotate-item").onclick=()=>{const f=draft.furniture.find(f=>f.kind===selected);if(f){f.rotation=(f.rotation+1)%4;saveDraft();cue();}};
  $("remove-item").onclick=()=>{draft.furniture=draft.furniture.filter(f=>f.kind!==selected);saveDraft();renderInventory();cue();};
  $("save-room").onclick=safeAction(async()=>{if(busySave)return;busySave=true;$("save-room").disabled=true;try{const result=await api("/api/room","PUT",draft);state.room=result.room;finishEdit();toast("Igloo saved!");cue();}finally{busySave=false;$("save-room").disabled=false;}});
  $("cancel-room").onclick=()=>{finishEdit();toast("Decorations put back as they were.");};
  function point(event){const r=canvas.getBoundingClientRect();return{x:(event.clientX-r.left)*760/r.width,y:(event.clientY-r.top)*480/r.height};}
  function floorPoint(x,y){x=Math.max(185,Math.min(570,x));y=Math.max(260,Math.min(400,y));const nx=(x-380)/195,ny=(y-329)/83,v=nx*nx+ny*ny;if(v>1){const s=1/Math.sqrt(v);x=380+nx*s*195;y=329+ny*s*83;}return{x,y};}
  function furnitureAt(p){return [...(draft||state.room).furniture].sort((a,b)=>b.y-a.y).find(f=>{const m=assets.furniture[f.kind];return Math.abs(p.x-f.x)<m.width/2&&p.y<=f.y+5&&p.y>=f.y-m.height;});}
  canvas.addEventListener("pointerdown",event=>{
    if(!state)return;const p=point(event);$("popup").hidden=true;canvas.focus();
    if(editing){const found=furnitureAt(p);if(found){selected=found.kind;dragging=found.kind;dragStart=p;canvas.setPointerCapture(event.pointerId);renderInventory();}
      else if(selected){let f=draft.furniture.find(f=>f.kind===selected);if(!f){f={kind:selected,...floorPoint(p.x,p.y),rotation:0};draft.furniture.push(f);}else Object.assign(f,floorPoint(p.x,p.y));saveDraft();renderInventory();}return;}
    if(mode==="snowball"){snowballs.push({sx:player.x,sy:player.y-22,x:p.x,y:p.y,start:clock});cue("snow");mode="walk";$("snowball").setAttribute("aria-pressed","false");return;}
    for(const [id,pet] of Object.entries(puffles))if(Math.hypot(p.x-pet.x,p.y-(pet.y-12))<24){openPet(id);return;}
    if(Math.hypot(p.x-player.x,p.y-(player.y-20))<22){showDialog("player");return;}
    const f=furnitureAt(p);if(f?.kind==="stereo"){showDialog("settings");return;}
    const dest=floorPoint(p.x,p.y);player.tx=dest.x;player.ty=dest.y;player.action="idle";player.actionUntil=0;
  });
  canvas.addEventListener("pointermove",event=>{if(editing&&dragging){const p=point(event),f=draft.furniture.find(f=>f.kind===dragging);Object.assign(f,floorPoint(p.x,p.y));saveDraft();}});
  canvas.addEventListener("pointerup",()=>{dragging=null;dragStart=null;});canvas.addEventListener("pointercancel",()=>{dragging=null;});
  document.addEventListener("keydown",event=>{
    if(event.key==="Escape"){$("popup").hidden=true;keys.clear();return;}
    if(event.target.matches("input,textarea,select")||document.querySelector("dialog[open]"))return;
    if(event.target===canvas&&event.key===" "&&mode==="snowball"){
      event.preventDefault();const angle=player.dir*Math.PI/4;
      snowballs.push({sx:player.x,sy:player.y-22,x:player.x+Math.sin(angle)*85,y:player.y+Math.cos(angle)*65,start:clock});
      cue("snow");mode="walk";$("snowball").setAttribute("aria-pressed","false");return;
    }
    if(event.key==="Enter"&&!event.target.matches("button,a")){
      event.preventDefault();
      if(editing&&selected){if(!draft.furniture.some(f=>f.kind===selected)){draft.furniture.push({kind:selected,x:380,y:345,rotation:0});saveDraft();renderInventory();}}
      else $("message").focus();
    }
    if(event.target===canvas&&event.key.startsWith("Arrow")){event.preventDefault();keys.add(event.key);
      if(editing&&selected){const f=draft.furniture.find(f=>f.kind===selected);if(f){Object.assign(f,floorPoint(f.x+(event.key==="ArrowRight"?5:event.key==="ArrowLeft"?-5:0),f.y+(event.key==="ArrowDown"?5:event.key==="ArrowUp"?-5:0)));saveDraft();}}
    }
  });
  document.addEventListener("keyup",event=>keys.delete(event.key));window.addEventListener("blur",()=>keys.clear());
  $("claim-form").onsubmit=safeAction(async event=>{event.preventDefault();const result=await api("/api/claim","POST",{code:$("claim-code").value});
    $("claim-result").textContent=result.correct?"You're invited!":"Pip doesn't recognise that invitation code.";if(result.correct){await refreshState();updateInvitation();}});
  $("copy-code").onclick=safeAction(async()=>{
    if(navigator.clipboard){await navigator.clipboard.writeText(state.invitation);$("claim-result").textContent="Invitation code copied.";}
    else {const selection=getSelection(),range=document.createRange();range.selectNodeContents($("earned-code"));selection.removeAllRanges();selection.addRange(range);$("claim-result").textContent="Invitation selected. Press Ctrl+C to copy.";}
  });
  $("party-again").onclick=()=>{$("invitation-dialog").close();celebrate();};
  $("mute").onchange=()=>{prefs.muted=$("mute").checked;applyPrefs();};$("volume").oninput=()=>{prefs.volume=Number($("volume").value);applyPrefs();};$("music").onchange=()=>{prefs.music=$("music").value;applyPrefs();};$("reduce-motion").onchange=()=>{prefs.reduced=$("reduce-motion").checked;applyPrefs();};
  $("sound-toggle").onclick=()=>{prefs.muted=!prefs.muted;applyPrefs();if(!prefs.muted)cue();};
  $("wide-screen").onclick=()=>{shell.classList.toggle("wide");$("wide-screen").textContent=shell.classList.contains("wide")?"Small Screen":"Big Screen";};
  function askReset(scope){resetScope=scope;$("settings-dialog").close();$("confirm-title").textContent=scope==="room"?"Reset your igloo?":"Start a new conversation?";$("confirm-copy").textContent=scope==="room"?"Your furniture, colours, puffle care and conversation will return to the beginning. Your earned invitation will stay in your postcards.":"This clears your conversation with Pip. Your decorations and earned invitation will stay. You can save a transcript from chat history first.";$("confirm-dialog").showModal();}
  $("reset-chat").onclick=()=>askReset("conversation");$("reset-room").onclick=()=>askReset("room");$("confirm-no").onclick=()=>$("confirm-dialog").close();
  $("confirm-yes").onclick=safeAction(async()=>{const fresh=await api("/api/reset","POST",{scope:resetScope,confirmed:true});state={...state,...fresh};if(resetScope==="room"){
    finishEdit();Object.assign(player,{x:368,y:362,tx:368,ty:362,dir:0,action:"idle",actionUntil:0});keys.clear();emoteUntil=0;partyUntil=0;snowballs=[];mode="walk";$("snowball").setAttribute("aria-pressed","false");
    for(const p of Object.values(puffles)){p.x=p.homeX;p.y=p.homeY;p.action="idle";p.until=0;p.target=null;}
  }$("confirm-dialog").close();$("pip-bubble").hidden=true;$("penguin-bubble").hidden=true;renderHistory();updateInvitation();toast("Ready for a fresh start.");});
  function sprite(key,x,y,w,h){const im=images[key];if(im)ctx.drawImage(im,x,y,w,h);}
  function actorAtlas(name,row,frame,x,y){const im=images[name];if(!im)return;ctx.drawImage(im,frame*128,row*160,128,160,x-32,y-60,64,80);}
  function dirFor(dx,dy){return ((Math.round(Math.atan2(dx,dy)/(Math.PI/4))+8)%8);}
  function update(dt){
    clock+=dt;
    if(!editing&&document.activeElement===canvas&&keys.size){const dx=(keys.has("ArrowRight")?1:0)-(keys.has("ArrowLeft")?1:0),dy=(keys.has("ArrowDown")?1:0)-(keys.has("ArrowUp")?1:0);const target=floorPoint(player.x+dx*100*dt,player.y+dy*100*dt);player.tx=target.x;player.ty=target.y;player.actionUntil=0;}
    const dx=player.tx-player.x,dy=player.ty-player.y,dist=Math.hypot(dx,dy);
    if(dist>.5){const step=Math.min(dist,100*dt);player.x+=dx/dist*step;player.y+=dy/dist*step;player.dir=dirFor(dx,dy);player.action="walk";}
    else if(player.action==="walk"||clock>player.actionUntil)player.action="idle";
    for(const [id,p] of Object.entries(puffles)){
      if(clock>p.until&&p.action!=="idle"){p.action="idle";p.target=null;}
      const phase={pip:0,bubbles:2,pebble:4}[id];
      const button=$("target-"+id),held=button.matches(":hover,:focus");
      const target=p.target&&p.action!=="idle"?p.target:held?{x:p.x,y:p.y}:{x:p.homeX+(prefs.reduced?0:Math.sin(clock*.2+phase)*12),y:p.homeY+(prefs.reduced?0:Math.cos(clock*.18+phase)*5)};
      const pdx=target.x-p.x,pdy=target.y-p.y,d=Math.hypot(pdx,pdy),step=Math.min(d,55*dt);if(d>.1){p.x+=pdx/d*step;p.y+=pdy/d*step;}
      button.style.left=`${p.x/7.6}%`;button.style.top=`${p.y/4.8}%`;button.hidden=editing;
    }
    for(const [id,p] of [["pip-bubble",puffles.pip],["penguin-bubble",player]]){const e=$(id);e.style.left=`${Math.max(130,Math.min(630,p.x))/7.6}%`;e.style.top=`${(p.y-(id==="pip-bubble"?40:60))/4.8}%`;}
    if(clock>penguinBubbleUntil)$("penguin-bubble").hidden=true;
    snowballs=snowballs.filter(b=>clock-b.start<1.2);
  }
  function draw(){
    ctx.setTransform(2,0,0,2,0,0);ctx.clearRect(0,0,760,480);sprite("landscape",0,0,760,480);sprite("igloo",0,0,760,480);
    const room=draft||state.room;
    for(const f of room.furniture.filter(f=>f.kind==="rug"))drawFurniture(f);
    const things=room.furniture.filter(f=>f.kind!=="rug").map(f=>({y:f.y,draw:()=>drawFurniture(f)}));
    things.push({y:player.y,draw:drawPlayer});
    for(const [id,p] of Object.entries(puffles))things.push({y:p.y,draw:()=>drawPet(id,p)});
    things.sort((a,b)=>a.y-b.y).forEach(o=>o.draw());
    if(state.solved){ctx.save();ctx.lineWidth=2;ctx.strokeStyle="#2b687b";ctx.beginPath();ctx.moveTo(205,123);ctx.quadraticCurveTo(390,165,557,123);ctx.stroke();const cs=["#ffcf31","#fd7095","#73eab3","#9aa2ff"];for(let i=0;i<13;i++){const x=215+i*27,y=126+Math.sin(i/12*Math.PI)*19;ctx.fillStyle=cs[i%4];ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill();}ctx.restore();}
    if(clock<partyUntil&&!prefs.reduced){for(let i=0;i<52;i++){const t=clock*30+i*19,x=190+(i*47%380),y=100+(t%290);ctx.fillStyle=["#ffc900","#fa68ab","#17bef1","#8ddc44"][i%4];ctx.save();ctx.translate(x,y);ctx.rotate(t*.03);ctx.fillRect(-2,-3,4,7);ctx.restore();}}
    for(const b of snowballs){const t=Math.min(1,(clock-b.start)/.65),x=b.sx+(b.x-b.sx)*t,y=b.sy+(b.y-b.sy)*t-Math.sin(t*Math.PI)*65;ctx.fillStyle="#fff";ctx.strokeStyle="#7797b5";ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(x,y,t===1?10:4,t===1?3:4,0,0,Math.PI*2);ctx.fill();ctx.stroke();}
    if(clock<emoteUntil){ctx.fillStyle="white";ctx.strokeStyle="#333";ctx.lineWidth=1.5;ctx.beginPath();ctx.roundRect(player.x-19,player.y-79,38,31,8);ctx.fill();ctx.stroke();ctx.font="bold 25px Arial";ctx.textAlign="center";ctx.fillStyle=emote==="♥"?"#e83451":"#eba600";ctx.fillText(emote,player.x,player.y-55);}
  }
  function drawFurniture(f){const meta=assets.furniture[f.kind],im=images[`furniture-${f.kind}-${f.rotation}`];if(!im)return;const h=meta.width*im.height/im.width;ctx.drawImage(im,f.x-meta.width/2,f.y-h,meta.width,h);
    if(editing&&selected===f.kind){ctx.strokeStyle="#ffcb00";ctx.lineWidth=2;ctx.setLineDash([4,3]);ctx.strokeRect(f.x-meta.width/2-3,f.y-h-3,meta.width+6,h+6);ctx.setLineDash([]);}}
  function drawPlayer(){ctx.fillStyle="#33435528";ctx.beginPath();ctx.ellipse(player.x,player.y-1,15,6,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle="#22a8ff";ctx.lineWidth=2;ctx.stroke();
    const row=player.action==="walk"?8+player.dir:player.action==="sit"?16+player.dir:player.action==="wave"?24:player.action==="dance"?25:player.dir;
    actorAtlas("penguin-"+(draft||state.room).color,row,prefs.reduced?0:Math.floor(clock*12)%12,player.x,player.y);
    ctx.textAlign="center";ctx.font="11px Arial";ctx.fillStyle="#152737";ctx.fillText("Waddles",player.x,player.y+16);
  }
  function drawPet(id,p){
    let row=p.action==="rest"?25:p.action==="feed"?27:p.action==="play"?30:0;
    let hop=p.action==="play"&&!prefs.reduced?Math.abs(Math.sin(clock*5))*9:0;
    actorAtlas("puffle-"+petInfo[id].color,row,prefs.reduced?0:Math.floor(clock*12)%12,p.x,p.y-hop);
    if(p.action==="rest"){ctx.font="14px Arial";ctx.fillStyle="#476883";ctx.fillText("z z",p.x+14,p.y-25);}
    if(p.action==="feed"){ctx.fillStyle="#a97435";ctx.beginPath();ctx.arc(p.x+12,p.y-7,4,0,7);ctx.fill();}
    ctx.textAlign="center";ctx.font="10px Arial";ctx.fillStyle="#172b3b";ctx.fillText(petInfo[id].name,p.x,p.y+12);
    if(id==="pip"){ctx.fillStyle="#f7c42c";ctx.strokeStyle="#835817";ctx.lineWidth=.7;ctx.beginPath();ctx.arc(p.x+11,p.y-5,3.5,0,7);ctx.fill();ctx.stroke();}
  }
  function animate(time){const dt=Math.min(.05,(time-lastFrame)/1000||.016);lastFrame=time;if(state&&assets){update(dt);draw();}requestAnimationFrame(animate);}
  async function load(){
    $("loading").hidden=false;$("retry-load").hidden=true;
    try{
      assets=await (await fetch("/assets/manifest.json")).json();
      await Promise.all(Object.entries(assets.images).map(([key,file])=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>{images[key]=image;resolve();};image.onerror=()=>reject(new Error("A piece of your igloo could not load. Please try again."));image.src="/assets/"+file;})));
      state=await api("/api/state");renderHistory();updateInvitation();$("loading").hidden=true;
      const pending=state.turns.find(t=>["queued","thinking"].includes(t.status));if(pending)watchReply(pending.request_id);
      const last=state.turns.filter(t=>t.reply).at(-1);if(last)bubble("pip",last.reply);
      if(!state.ready)toast("Pip's translator is warming up. Make yourself at home!",6500);
      applyPrefs();
    }catch(error){$("loading").querySelector("p").textContent=error.message;$("retry-load").hidden=false;}
  }
  $("retry-load").onclick=load;
  // Expose no puzzle state or completion hooks: the server owns conversations and rewards.
  requestAnimationFrame(animate);load();
})();
