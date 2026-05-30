// ---- helpers ----
const $ = (id) => document.getElementById(id);
function cmd(c){ fetch("/cmd", {method:"POST", headers:{"Content-Type":"application/json"},
                               body:JSON.stringify({cmd:c})}); }
function toast(msg){ const t=$("toast"); t.textContent=msg; t.classList.add("show");
                     clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove("show"),2200); }
function fmtTime(sec){ const d=new Date(sec*1000);
  return d.toLocaleString([], {month:"short", day:"numeric", hour:"2-digit", minute:"2-digit"}); }
function fmtDur(s){ s=s||0; const m=Math.floor(s/60), r=s%60; return m+":"+String(r).padStart(2,"0"); }

// ---- state ----
let settings = {autoanswer:true, answerdelay:5};
let countdownTimer=null, callTimer=null, callStart=0;

// ---- keypad ----
const KEYS=[["1",""],["2","ABC"],["3","DEF"],["4","GHI"],["5","JKL"],["6","MNO"],
            ["7","PQRS"],["8","TUV"],["9","WXYZ"],["*",""],["0","+"],["#",""]];
function buildKeypad(){
  const kp=$("keypad"); kp.innerHTML="";
  for(const [d,sub] of KEYS){
    const b=document.createElement("button");
    b.innerHTML=`${d}<small>${sub}</small>`;
    b.onclick=()=>{ if(callcardState()==="active"){ cmd("dtmf:"+d); } else { $("dial-input").value+=d; } };
    kp.appendChild(b);
  }
}
function callcardState(){ return $("callcard").dataset.state; }
function placeCall(){ const n=$("dial-input").value.trim(); if(!n) return; cmd("dial:"+n); toast("Dialing "+n); }
function toggleKeypad(){ $("dialer").classList.toggle("hidden"); }

// ---- call UI state machine ----
let machineActive=false;
function setCall(state, name, number){
  const cc=$("callcard");
  cc.dataset.state=state;
  if(number!==undefined) $("call-number").textContent=number||"";
  const ai=$("actions-incoming"), aa=$("actions-active"), dialer=$("dialer");
  ai.style.display="none"; aa.style.display="none";
  $("machine-note").textContent="";
  clearInterval(callTimer); $("call-timer").textContent="";
  stopCountdown();
  if(state==="incoming"){
    $("call-state").textContent="Incoming call";
    $("call-name").textContent=name||"Unknown";
    ai.style.display="flex"; dialer.classList.add("hidden");
    if(settings.autoanswer) startCountdown(settings.answerdelay);
  } else if(state==="outgoing"){
    $("call-state").textContent="Calling…";
    $("call-name").textContent=name||number||"";
    aa.style.display="flex"; $("btn-join").style.display="none"; dialer.classList.add("hidden");
  } else if(state==="active"){
    $("call-state").textContent="In call";
    $("call-name").textContent=name||number||"Connected";
    aa.style.display="flex"; dialer.classList.add("hidden");
    $("btn-join").style.display = machineActive ? "inline-block" : "none";
    if(machineActive) $("machine-note").textContent="Answering machine is handling this — your mic is private. Tap “Join call” to talk.";
    callStart=Date.now();
    callTimer=setInterval(()=>{ $("call-timer").textContent=fmtDur(Math.floor((Date.now()-callStart)/1000)); },500);
  } else { // idle
    machineActive=false;
    $("call-state").textContent="No active call";
    $("call-name").textContent=""; $("call-number").textContent="";
    dialer.classList.remove("hidden");
  }
}
function joinCall(){ cmd("join"); machineActive=false; $("btn-join").style.display="none"; $("machine-note").textContent="You joined the call."; }
function startCountdown(secs){
  let n=secs; const el=$("countdown");
  el.textContent=`Auto-answering in ${n}s…`;
  countdownTimer=setInterval(()=>{ n--; el.textContent= n>0?`Auto-answering in ${n}s…`:"Answering…"; if(n<=0) stopCountdown(); },1000);
}
function stopCountdown(){ clearInterval(countdownTimer); countdownTimer=null; $("countdown").textContent=""; }

// ---- status ----
function setStatus(snap){
  $("dot-engine").classList.toggle("on", !!snap.engine);
  $("dot-phone").classList.toggle("on", !!snap.slc);
  $("btn-connect").style.display = snap.slc ? "none" : "inline-block";
}

// ---- SSE ----
function connectSSE(){
  const es=new EventSource("/events");
  es.onmessage=(e)=>{
    let ev; try{ ev=JSON.parse(e.data);}catch{return;}
    handleEvent(ev);
  };
  es.onerror=()=>{ /* browser auto-reconnects */ };
}
function handleEvent(ev){
  switch(ev.ev){
    case "snapshot":
      setStatus(ev);
      if(ev.call==="incoming") setCall("incoming", ev.name, ev.number);
      else if(ev.call==="active") setCall("active", ev.name, ev.number);
      else setCall("idle");
      break;
    case "engine_up": $("dot-engine").classList.add("on"); break;
    case "engine_down": setStatus({engine:false,slc:false}); setCall("idle"); break;
    case "slc": setStatus({engine:true, slc:ev.state==="connected"});
                if(ev.state!=="connected") setCall("idle");
                else toast("Phone connected"); break;
    case "call":
      if(ev.state==="incoming") setCall("incoming", ev.name, ev.number);
      else if(ev.state==="outgoing") setCall("outgoing", ev.name, ev.number);
      else if(ev.state==="active") { stopCountdown(); setCall("active", $("call-name").textContent, $("call-number").textContent); }
      else if(ev.state==="ended"){ setCall("idle"); loadRecordings(); loadHistory(); }
      break;
    case "audio":
      if(ev.state==="connected"){
        machineActive = !!ev.machine;
        if(callcardState()==="active"){
          $("btn-join").style.display = machineActive ? "inline-block":"none";
          $("machine-note").textContent = machineActive ? "Answering machine is handling this — your mic is private. Tap “Join call” to talk." : "";
        }
      } else { machineActive=false; }
      break;
    case "joined":
      machineActive=false; $("btn-join").style.display="none";
      $("machine-note").textContent="You joined the call.";
      break;
    case "callerid":
      if(callcardState()==="incoming"||callcardState()==="active"){
        if(ev.name) $("call-name").textContent=ev.name;
        $("call-number").textContent=ev.number||"";
      }
      break;
    case "autoanswer_fired": stopCountdown(); $("countdown").textContent="Answering…"; break;
    case "recording": toast("Recording saved"); loadRecordings(); break;
    case "device": addScanResult(ev); break;
    case "scan_done":
      $("btn-scan").disabled=false;
      $("device-status").textContent = $("device-list").children.length
        ? "Tap your phone above to select & connect."
        : "No devices found. Make sure Bluetooth is on and the phone's pairing screen is open, then scan again.";
      break;
    case "contacts_done": toast("Contacts synced ("+(ev.count||0)+")"); loadContacts(); break;
    case "contacts_error":
      toast("Contacts sync failed"+(ev.reason?(": "+ev.reason):"")); {const s=$("contacts-status"); if(s) s.textContent="Sync failed — is the phone connected?";} break;
    case "settings":
      if("autoanswer" in ev) settings.autoanswer=ev.autoanswer;
      if("answerdelay" in ev) settings.answerdelay=ev.answerdelay;
      reflectSettings(); break;
  }
}

// ---- tabs ----
document.querySelectorAll(".tab").forEach(t=>{
  t.onclick=()=>{
    document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
    t.classList.add("active");
    ["recordings","history","contacts","settings"].forEach(p=>$("pane-"+p).classList.add("hidden"));
    $("pane-"+t.dataset.tab).classList.remove("hidden");
    if(t.dataset.tab==="recordings") loadRecordings();
    if(t.dataset.tab==="history") loadHistory();
    if(t.dataset.tab==="contacts") loadContacts();
  };
});

// ---- recordings ----
async function loadRecordings(){
  const r=await fetch("/api/recordings"); const list=await r.json();
  const pane=$("pane-recordings");
  if(!list.length){ pane.innerHTML='<div class="empty">No recordings yet</div>'; return; }
  pane.innerHTML="";
  for(const rec of list){
    const div=document.createElement("div"); div.className="item";
    const title=rec.name || rec.number || "Unknown";
    div.innerHTML=`<div class="meta"><div class="t1">${title}</div>
      <div class="t2">${fmtTime(rec.mtime)} · ${(rec.size/1024).toFixed(0)} KB</div></div>
      <audio controls preload="none" src="/rec/${encodeURIComponent(rec.file)}"></audio>
      <a class="icon-btn" href="/rec/${encodeURIComponent(rec.file)}" download title="Download">&#x2193;</a>
      <button class="icon-btn" title="Delete">&#x2715;</button>`;
    div.querySelector("button").onclick=async()=>{
      await fetch("/api/recordings/delete",{method:"POST",headers:{"Content-Type":"application/json"},
                  body:JSON.stringify({file:rec.file})}); loadRecordings();
    };
    pane.appendChild(div);
  }
}

// ---- history ----
async function loadHistory(){
  const r=await fetch("/api/history"); const list=await r.json();
  const pane=$("pane-history");
  if(!list.length){ pane.innerHTML='<div class="empty">No call history</div>'; return; }
  pane.innerHTML="";
  for(const h of list){
    const div=document.createElement("div"); div.className="item";
    const title=h.name||h.number||"Unknown";
    const badge=h.answered?'<span class="badge in">answered</span>':'<span class="badge missed">missed</span>';
    const recLink=h.recording?` · <a class="icon-btn" style="padding:0" href="/rec/${encodeURIComponent(h.recording)}" target="_blank">play</a>`:"";
    div.innerHTML=`<div class="meta"><div class="t1">${title} ${badge}</div>
      <div class="t2">${fmtTime(h.start)} · ${fmtDur(h.duration)}${recLink}</div></div>
      <button class="icon-btn" title="Call back">&#x260E;</button>`;
    div.querySelector("button").onclick=()=>{ if(h.number) cmd("dial:"+h.number); toast("Calling "+title); };
    pane.appendChild(div);
  }
}

// ---- contacts ----
async function loadContacts(){
  const r=await fetch("/api/contacts"); const list=await r.json();
  const pane=$("pane-contacts"); pane.innerHTML="";
  const bar=document.createElement("div");
  bar.style.cssText="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; gap:10px";
  bar.innerHTML=`<span class="t2" id="contacts-status">${list.length} contacts · tap to call</span>`;
  const sync=document.createElement("button"); sync.className="btn small"; sync.textContent="Sync from phone";
  sync.onclick=()=>{ cmd("contacts:sync"); const s=$("contacts-status"); if(s) s.textContent="Syncing… (allow access on your phone if prompted)"; };
  bar.appendChild(sync); pane.appendChild(bar);
  if(!list.length){ const e=document.createElement("div"); e.className="empty"; e.textContent="No contacts yet — tap “Sync from phone”"; pane.appendChild(e); }
  for(const c of list){
    const div=document.createElement("div"); div.className="item";
    div.innerHTML=`<div class="meta"><div class="t1">${c.name||"?"}</div><div class="t2">${c.number||""}</div></div>
      <button class="icon-btn" title="Call">&#x260E;</button>`;
    div.querySelector("button").onclick=()=>{ if(c.number){cmd("dial:"+c.number); toast("Calling "+(c.name||c.number));} };
    pane.appendChild(div);
  }
}

// ---- settings ----
function reflectSettings(){ $("set-autoanswer").checked=!!settings.autoanswer; $("set-delay").value=settings.answerdelay; }
async function loadSettings(){ const r=await fetch("/api/settings"); settings=await r.json(); reflectSettings(); }
async function saveSettings(){
  settings.autoanswer=$("set-autoanswer").checked;
  settings.answerdelay=parseInt($("set-delay").value||"0",10);
  await fetch("/api/settings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(settings)});
  $("settings-hint").textContent="Saved.";
  setTimeout(()=>$("settings-hint").textContent="",1500);
}

// ---- greeting recorder (browser mic -> 16kHz mono 16-bit WAV) ----
let greetingRec=null;
async function toggleGreetingRec(){
  const btn=$("btn-rec-greeting");
  if(greetingRec){ greetingRec.stop(); return; }
  let stream;
  try{ stream=await navigator.mediaDevices.getUserMedia({audio:true}); }
  catch(e){ toast("Mic permission denied"); return; }
  const ac=new (window.AudioContext||window.webkitAudioContext)();
  const src=ac.createMediaStreamSource(stream);
  const proc=ac.createScriptProcessor(4096,1,1);
  const chunks=[]; const inRate=ac.sampleRate;
  proc.onaudioprocess=(e)=>{ chunks.push(new Float32Array(e.inputBuffer.getChannelData(0))); };
  src.connect(proc); proc.connect(ac.destination);
  btn.textContent="■ Stop"; btn.classList.add("reject");
  $("greeting-status").textContent="Recording… speak your greeting, then press Stop";
  greetingRec={ stop:()=>{
    proc.disconnect(); src.disconnect(); stream.getTracks().forEach(t=>t.stop()); ac.close();
    btn.textContent="● Record greeting"; btn.classList.remove("reject");
    let total=chunks.reduce((a,c)=>a+c.length,0), merged=new Float32Array(total), off=0;
    for(const c of chunks){ merged.set(c,off); off+=c.length; }
    fetch("/api/greeting",{method:"POST",headers:{"Content-Type":"audio/wav"},body:encodeWav16k(merged,inRate)})
      .then(()=>{ toast("Greeting saved"); checkGreeting(); });
    greetingRec=null;
  }};
}
function encodeWav16k(samples,inRate){
  const outRate=16000, ratio=inRate/outRate, outLen=Math.floor(samples.length/ratio);
  const out=new Int16Array(outLen);
  for(let i=0;i<outLen;i++){
    const idx=i*ratio, i0=Math.floor(idx), frac=idx-i0;
    const s=(samples[i0]||0)*(1-frac)+(samples[i0+1]||0)*frac;
    out[i]=Math.max(-32768,Math.min(32767,Math.round(s*32767)));
  }
  const buf=new ArrayBuffer(44+out.length*2), dv=new DataView(buf);
  const w=(o,s)=>{for(let i=0;i<s.length;i++)dv.setUint8(o+i,s.charCodeAt(i));};
  w(0,"RIFF"); dv.setUint32(4,36+out.length*2,true); w(8,"WAVE"); w(12,"fmt ");
  dv.setUint32(16,16,true); dv.setUint16(20,1,true); dv.setUint16(22,1,true);
  dv.setUint32(24,outRate,true); dv.setUint32(28,outRate*2,true); dv.setUint16(32,2,true); dv.setUint16(34,16,true);
  w(36,"data"); dv.setUint32(40,out.length*2,true);
  for(let i=0;i<out.length;i++) dv.setInt16(44+i*2,out[i],true);
  return buf;
}
async function checkGreeting(){
  try{ const j=await (await fetch("/api/greeting")).json();
    $("greeting-status").textContent = j.exists ? "✓ Greeting set" : "No greeting set (callers hear just a beep)";
    $("btn-play-greeting").style.display=j.exists?"inline-block":"none";
    $("btn-del-greeting").style.display=j.exists?"inline-block":"none";
  }catch(e){}
}
function playGreeting(){ new Audio("/greeting.wav?"+Date.now()).play(); }
async function deleteGreeting(){ await fetch("/api/greeting/delete",{method:"POST"}); toast("Greeting deleted"); checkGreeting(); }

const PRESETS=[
  "Hi, you've reached me. I can't take your call right now. Please leave a message after the beep.",
  "Hello! I'm not available at the moment. Leave your name and number after the beep and I'll call you back.",
  "You've reached the answering machine. Please record your message after the tone.",
  "Hey there! Nobody can take your call right now, but I'm recording — go ahead after the beep."
];
function renderPresets(){
  const box=$("greeting-presets"); box.innerHTML="";
  PRESETS.forEach(t=>{ const b=document.createElement("button"); b.textContent=t;
    b.onclick=()=>{ $("greeting-text").value=t; speakGreeting(); }; box.appendChild(b); });
}
async function speakGreeting(){
  const text=$("greeting-text").value.trim();
  if(!text){ toast("Pick or type a greeting first"); return; }
  toast("Generating greeting…");
  const r=await fetch("/api/greeting/tts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text})});
  if(r.ok){ toast("Greeting set"); checkGreeting(); } else { toast("TTS failed"); }
}

// ---- device scan / pick (no hardcoded phone address) ----
let selectedDevice=null;
async function loadDevice(){
  try{ const d=await (await fetch("/api/device")).json();
    selectedDevice = d && d.addr ? d : null;
    $("device-status").textContent = selectedDevice
      ? ("Selected: "+(selectedDevice.name||selectedDevice.addr)+"  ("+selectedDevice.addr+")")
      : "No phone selected yet — scan and pick your phone.";
  }catch(e){}
}
function scanDevices(){
  $("device-list").innerHTML="";
  $("device-status").textContent="Scanning… make sure the phone's Bluetooth is on and its pairing screen is open.";
  $("btn-scan").disabled=true;
  cmd("scan");
}
function addScanResult(ev){
  if(document.getElementById("dev-"+ev.addr)) return;
  const isPhone=(((ev.cod||0)>>8)&0x1f)===2;
  const b=document.createElement("button"); b.id="dev-"+ev.addr;
  b.innerHTML=(ev.name||"(unknown device)")+" — <span class='t2'>"+ev.addr+(isPhone?" · phone":"")+"</span>";
  b.onclick=()=>selectDevice(ev.addr, ev.name||"");
  $("device-list").appendChild(b);
}
async function selectDevice(addr,name){
  await fetch("/api/device/select",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({addr,name})});
  selectedDevice={addr,name}; loadDevice();
  toast("Saved "+(name||addr)+" — connecting…");
  cmd("connect:"+addr);
}

// ---- init ----
$("btn-connect").onclick=()=>{
  if(selectedDevice){ cmd("connect:"+selectedDevice.addr); toast("Connecting…"); }
  else { toast("Pick your phone in Settings first"); document.querySelector('.tab[data-tab="settings"]').click(); }
};
buildKeypad();
renderPresets();
loadSettings();
loadDevice();
loadRecordings();
checkGreeting();
connectSSE();
fetch("/api/state").then(r=>r.json()).then(s=>{ setStatus(s); });
