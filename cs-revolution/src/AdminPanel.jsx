import React, { useState, useEffect, useRef } from "react";
import { C, CR, WARN, LINE, DISP } from "./tokens.js";

// Loaded on demand (React.lazy in App.jsx) the first time the panel is opened, so the
// password form and the admin UI never ship in the public bundle.
// ═══════════════════════════════════════════════════════════════
// ADMIN STATS DASHBOARD — Secret panel for all CS sites
// Access: press Ctrl+Shift+A
// ═══════════════════════════════════════════════════════════════
export default function AdminPanel(props) {
  var [auth, setAuth] = useState(false);
  var [pwd, setPwd] = useState("");
  var [pwdErr, setPwdErr] = useState(false);
  var [tab, setTab] = useState("dashboard");
  var [stats, setStats] = useState({});
  var [loading, setLoading] = useState(true);
  var [selSite, setSelSite] = useState(null);
  var [campaigns, setCampaigns] = useState([]);
  var [campName, setCampName] = useState("");
  var [campSubj, setCampSubj] = useState("");
  var [campBody, setCampBody] = useState("");
  var [tasks, setTasks] = useState([]);
  var [taskText, setTaskText] = useState("");
  var [taskPri, setTaskPri] = useState("MEDIUM");
  var [clients, setClients] = useState([]);
  var [cliName, setCliName] = useState("");
  var [cliProj, setCliProj] = useState("");
  var [cliBudget, setCliBudget] = useState("");
  var [cfgSmtp, setCfgSmtp] = useState({host:"smtp.gmail.com",port:"587",user:"info@carbonstealth.eu",pass:"",to:"info@carbonstealth.eu"});
  var [cfgSaved, setCfgSaved] = useState(false);
  var [contacts, setContacts] = useState([]);
  var [actLog, setActLog] = useState([]);
  var [analyzerScans, setAnalyzerScans] = useState([]);
  var [analyzerLeads, setAnalyzerLeads] = useState([]);
  var [indexNowLog, setIndexNowLog] = useState([]);
  var [indexNowBusy, setIndexNowBusy] = useState(false);
  var [pingHistory, setPingHistory] = useState({});
  var [serverStats, setServerStats] = useState({connections:0,bandwidth:"0",requests_min:0,uptime:"0d",uptime_pct:"99.9%",load:"0",memory_used:0,memory_total:0,disk_used:0,disk_total:0,nginx_today:0,referrers:[],unique_visitors:0,top_ips:[],hourly:[],user_agents:{desktop:0,mobile:0,bot:0}});
  var [countries, setCountries] = useState({});
  var [tick, setTick] = useState(0);
  var [kpiHist, setKpiHist] = useState([]);
  var C="#00e5ff",CR="0,229,255",HEAD=DISP;
  // Admin auth: the typed password IS the server token (CS_ADMIN_TOKEN in the
  // PHP-FPM env). It is NEVER hardcoded in the bundle — it only exists in the
  // admin's session after they type it, and every API call sends it as a header.
  function csTok(){ try{return sessionStorage.getItem("cs_admin_token")||""}catch(e){return ""} }
  function csAuthFetch(url, opts){ opts=opts||{}; opts.headers=Object.assign({}, opts.headers||{}, {"X-CS-Token":csTok()}); return fetch(url, opts).then(function(res){ if(res.status===401){ try{sessionStorage.removeItem("cs_admin_token")}catch(e){} setAuth(false); } return res; }); }
  var geoFetchedRef = useRef(false);
  // Only allow http(s) hrefs from visitor-submitted analyzer URLs (block javascript:/data:)
  function safeHref(u){ return (typeof u==="string" && /^https?:\/\//i.test(u)) ? u : "#"; }
  var F=1.35;

  var sites = [
    {name:"carbonstealth.eu",url:"https://carbonstealth.eu",label:"Carbon Stealth",type:"CORPORATE",tech:"React+Three.js+Vite",port:443,proto:"HTTPS/2",cdn:"Cloudflare"},
    {name:"ouvaptsarov.com",url:"https://ouvaptsarov.com",label:"OU Vaptsarov",type:"SCHOOL",tech:"React+Vite+PHP",port:443,proto:"HTTPS/2",cdn:"None"},
    {name:"nexus.carbonstealth.eu",url:"https://nexus.carbonstealth.eu",label:"Nexus Dominion",type:"MMO GAME",tech:"React+Node+PG+Redis",port:443,proto:"HTTPS/2",cdn:"None"},
    {name:"tretimart.carbonstealth.eu",url:"https://tretimart.carbonstealth.eu",label:"Treti Mart",type:"MARKETPLACE",tech:"React+Node+Stripe",port:443,proto:"HTTPS/2",cdn:"None"},
    {name:"erp.carbonstealth.eu",url:"https://erp.carbonstealth.eu",label:"ERP Ascensori",type:"ERP SYSTEM",tech:"React+Prisma+PG",port:443,proto:"HTTPS/2",cdn:"None"},
    {name:"vizitka-bg.com",url:"https://vizitka-bg.com",label:"Vizitka",type:"QR PROFILE",tech:"Express+EJS+SQLite",port:443,proto:"HTTPS/2",cdn:"None"},
    {name:"mastilko-bg.com",url:"https://mastilko-bg.com",label:"Mastilko",type:"PRINT TOOLS",tech:"Next.js+React+TS",port:443,proto:"HTTPS/2",cdn:"None"},
  ];

  async function checkPwd() {
    if (!pwd || pwd.length < 4) { setPwdErr(true); setPwd(""); return; }
    // Store the typed password as the session token, then verify it against the
    // server (a 401 means wrong password). No secret ships in the bundle.
    try{ sessionStorage.setItem("cs_admin_token", pwd); }catch(e){}
    try {
      var r = await fetch("/api/monitor.php", { headers: { "X-CS-Token": pwd } });
      if (r.status === 401) { try{sessionStorage.removeItem("cs_admin_token")}catch(e){} setPwdErr(true); setPwd(""); return; }
      setAuth(true); setPwdErr(false); setPwd("");
    } catch(e) {
      // Network/endpoint unreachable — do NOT authenticate (fail closed)
      try{sessionStorage.removeItem("cs_admin_token")}catch(_){}
      setPwdErr(true); setPwd("");
    }
  }

  function doPing() {
    var r={},done=0;
    csAuthFetch("/api/monitor.php").then(function(res){return res.json()}).then(function(d){if(d.ok){setServerStats(d);
      if(d.top_ips&&d.top_ips.length&&!geoFetchedRef.current){
        geoFetchedRef.current=true;
        d.top_ips.slice(0,5).forEach(function(entry){
          // HTTPS endpoint — ip-api.com free tier is HTTP-only and gets blocked as mixed content
          fetch("https://ipapi.co/"+entry.ip+"/json/").then(function(r){return r.json()}).then(function(geo){
            setCountries(function(prev){var n=Object.assign({},prev);n[entry.ip]={country:geo.country_name||"Unknown",code:geo.country_code||"",city:geo.city||""};return n})
          }).catch(function(){})
        })
      }
    }}).catch(function(e){console.log("monitor err:",e)});
    sites.forEach(function(site){
      var t0=Date.now();
      fetch(site.url,{method:"HEAD",mode:"no-cors"}).then(function(){
        var lat=Date.now()-t0;
        r[site.name]={status:"ONLINE",latency:lat,time:new Date().toLocaleTimeString(),headers:site.proto,port:site.port};
        done++;
        setPingHistory(function(prev){var h=Object.assign({},prev);if(!h[site.name])h[site.name]=[];h[site.name]=h[site.name].concat([lat]).slice(-30);return h});
        if(done>=sites.length){setStats(Object.assign({},r));setLoading(false)}
      }).catch(function(){
        r[site.name]={status:"TIMEOUT",latency:-1,time:new Date().toLocaleTimeString(),headers:"N/A",port:site.port};
        done++;
        if(done>=sites.length){setStats(Object.assign({},r));setLoading(false)}
      });
    });
  }

  useEffect(function(){
    var tok=""; try{tok=sessionStorage.getItem("cs_admin_token")||""}catch(e){}
    if(!tok)return;
    // Validate the stored token server-side before unlocking (no blind auto-login)
    fetch("/api/monitor.php",{headers:{"X-CS-Token":tok}}).then(function(r){
      if(r.status===401){try{sessionStorage.removeItem("cs_admin_token")}catch(e){}return;}
      setAuth(true);
    }).catch(function(){});
  },[]);

  useEffect(function(){
    if(!auth)return;
    doPing();
    var iv=setInterval(function(){doPing();setTick(function(t){return t+1})},15000);
    // Instant paint from local cache, then load the durable server copy
    try{setCampaigns(JSON.parse(localStorage.getItem("cs_camp")||"[]"))}catch(e){}
    try{setTasks(JSON.parse(localStorage.getItem("cs_tasks")||"[]"))}catch(e){}
    try{setClients(JSON.parse(localStorage.getItem("cs_clients")||"[]"))}catch(e){}
    [["campaigns","cs_camp",setCampaigns],["tasks","cs_tasks",setTasks],["clients","cs_clients",setClients]].forEach(function(m){
      csAuthFetch("/api/admin-data.php?action=get&key="+m[0]).then(function(r){return r.json()}).then(function(d){
        if(d&&d.ok&&Array.isArray(d.data)){m[2](d.data);try{localStorage.setItem(m[1],JSON.stringify(d.data))}catch(e){}}
      }).catch(function(){});
    });
    try{var sc=JSON.parse(localStorage.getItem("cs_smtp")||"{}");if(sc.host)setCfgSmtp(sc)}catch(e){}
    csAuthFetch("/api/contact.php?action=log").then(function(r){return r.json()}).then(function(d){if(d.entries)setContacts(d.entries)}).catch(function(){});
    csAuthFetch("/api/analyze.php?action=stats").then(function(r){return r.json()}).then(function(d){if(d.ok){setAnalyzerScans(d.recent_scans||[]);setAnalyzerLeads(d.recent_leads||[])}}).catch(function(){});
    csAuthFetch("/api/indexnow.php?action=status").then(function(r){return r.json()}).then(function(d){if(d.ok)setIndexNowLog(d.submissions||[])}).catch(function(){});
    setActLog([{t:new Date().toLocaleTimeString(),a:"Admin session started — all systems nominal",c:"SYSTEM"}]);
    // Real-time lead stream via a short-lived ticket (admin token never in URL)
    var sseState={alive:true,cur:null,timer:null};
    function openLeadStream(){
      if(!sseState.alive)return;
      csAuthFetch("/api/sse-ticket.php").then(function(r){return r.json()}).then(function(d){
        if(!sseState.alive||!d||!d.ok||!d.ticket)return;
        var s=new EventSource("/api/sse-leads.php?ticket="+encodeURIComponent(d.ticket));
        sseState.cur=s;
        s.addEventListener("new_lead",function(e){
          try{
            var lead=JSON.parse(e.data);
            setAnalyzerLeads(function(prev){return [lead].concat(prev).slice(0,50)});
            setActLog(function(prev){return [{t:new Date().toLocaleTimeString(),a:"NEW LEAD: "+(lead.name||lead.email||"unknown")+" — "+(lead.tested_url||""),c:"LEAD"}].concat(prev).slice(0,100)});
          }catch(err){}
        });
        s.addEventListener("connected",function(){
          setActLog(function(prev){return [{t:new Date().toLocaleTimeString(),a:"SSE connected — real-time lead stream active",c:"SYSTEM"}].concat(prev).slice(0,100)});
        });
        s.onerror=function(){
          try{s.close()}catch(e){}
          if(!sseState.alive)return;
          setActLog(function(prev){return [{t:new Date().toLocaleTimeString(),a:"SSE reconnecting…",c:"WARN"}].concat(prev).slice(0,100)});
          sseState.timer=setTimeout(openLeadStream,5000); // reopen with a fresh ticket
        };
      }).catch(function(){ if(sseState.alive) sseState.timer=setTimeout(openLeadStream,5000); });
    }
    openLeadStream();
    return function(){clearInterval(iv);sseState.alive=false;if(sseState.cur){try{sseState.cur.close()}catch(e){}}if(sseState.timer)clearTimeout(sseState.timer);};
  },[auth]);

  // Persist to localStorage (instant/offline cache) AND to the server (real, durable, shared)
  var SRV_KEY={cs_camp:"campaigns",cs_tasks:"tasks",cs_clients:"clients"};
  function save(key,data){
    try{localStorage.setItem(key,JSON.stringify(data))}catch(e){}
    var sk=SRV_KEY[key];
    if(sk)csAuthFetch("/api/admin-data.php?action=set&key="+sk,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)}).catch(function(){});
  }
  function saveCamp(){if(!campName.trim())return;var u=campaigns.concat([{id:Date.now(),name:campName,subject:campSubj,body:campBody,status:"DRAFT",date:new Date().toISOString().slice(0,10)}]);setCampaigns(u);save("cs_camp",u);setCampName("");setCampSubj("");setCampBody("")}
  function delCamp(id){var u=campaigns.filter(function(c){return c.id!==id});setCampaigns(u);save("cs_camp",u)}
  function addTask(){if(!taskText.trim())return;var u=tasks.concat([{id:Date.now(),text:taskText,pri:taskPri,done:false,date:new Date().toISOString().slice(0,10)}]);setTasks(u);save("cs_tasks",u);setTaskText("")}
  function togTask(id){var u=tasks.map(function(t){return t.id===id?Object.assign({},t,{done:!t.done}):t});setTasks(u);save("cs_tasks",u)}
  function delTask(id){var u=tasks.filter(function(t){return t.id!==id});setTasks(u);save("cs_tasks",u)}
  function addClient(){if(!cliName.trim())return;var u=clients.concat([{id:Date.now(),name:cliName,project:cliProj,budget:cliBudget,status:"ACTIVE",date:new Date().toISOString().slice(0,10)}]);setClients(u);save("cs_clients",u);setCliName("");setCliProj("");setCliBudget("")}
  function delClient(id){var u=clients.filter(function(c){return c.id!==id});setClients(u);save("cs_clients",u)}
  // Export any array of objects as a CSV download (admin convenience)
  function exportCSV(rows, name){
    if(!rows||!rows.length){alert("Nothing to export");return}
    var cols=Object.keys(rows[0]);
    var esc=function(v){v=v==null?"":String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};
    var csv=cols.join(",")+"\n"+rows.map(function(r){return cols.map(function(c){return esc(r[c])}).join(",")}).join("\n");
    var a=document.createElement("a");
    a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
    a.download=name+"_"+new Date().toISOString().slice(0,10)+".csv";
    a.click();URL.revokeObjectURL(a.href);
  }
  function saveSMTP(){save("cs_smtp",cfgSmtp);setCfgSaved(true);setTimeout(function(){setCfgSaved(false)},3000);csAuthFetch("/api/admin-settings.php",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"save_smtp",data:cfgSmtp})}).catch(function(){})}

  var onN=Object.values(stats).filter(function(s){return s.status==="ONLINE"}).length;
  var totalRev=0;clients.forEach(function(c){totalRev+=parseFloat(c.budget)||0});
  var avgLat=0;var latVals=Object.values(stats).filter(function(s){return s.latency>0}).map(function(s){return s.latency});if(latVals.length)avgLat=Math.round(latVals.reduce(function(a,b){return a+b},0)/latVals.length);

  // Roll a small KPI history for the dashboard mini-charts (snapshot per monitor refresh)
  useEffect(function(){
    if(!auth||!serverStats.ok)return;
    setKpiHist(function(prev){return prev.concat([{online:onN,lat:avgLat,req:serverStats.nginx_today||0,uniq:serverStats.unique_visitors||0,contacts:contacts.length}]).slice(-40)});
  },[serverStats]);

  // ═══ SPARKLINE COMPONENT ═══
  function Spark(p){
    var ref=useRef(null);
    useEffect(function(){
      var cv=ref.current;if(!cv)return;var ctx=cv.getContext("2d");
      var w=cv.width,h=cv.height;ctx.clearRect(0,0,w,h);
      var data=p.data||[];if(data.length<2)return;
      var max=Math.max.apply(null,data)*1.2||1;var min=Math.min.apply(null,data)*0.8||0;
      var range=max-min||1;
      // Gradient fill
      var grad=ctx.createLinearGradient(0,0,0,h);
      grad.addColorStop(0,(p.color||"rgba(0,229,255,.3)"));grad.addColorStop(1,"rgba(0,229,255,0)");
      ctx.beginPath();ctx.moveTo(0,h);
      data.forEach(function(v,i){var x=(i/(data.length-1))*w;var y=h-((v-min)/range)*h;if(i===0)ctx.lineTo(x,y);else ctx.lineTo(x,y)});
      ctx.lineTo(w,h);ctx.closePath();ctx.fillStyle=grad;ctx.fill();
      // Line
      ctx.beginPath();
      data.forEach(function(v,i){var x=(i/(data.length-1))*w;var y=h-((v-min)/range)*h;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)});
      ctx.strokeStyle=p.lineColor||"#00e5ff";ctx.lineWidth=1.5;ctx.stroke();
      // Last dot
      if(data.length>0){var lastX=w;var lastY=h-((data[data.length-1]-min)/range)*h;ctx.beginPath();ctx.arc(lastX,lastY,3,0,Math.PI*2);ctx.fillStyle="#00e5ff";ctx.fill()}
    },[p.data,tick]);
    return React.createElement("canvas",{ref:ref,width:p.w||120,height:p.h||32,style:{display:"block",width:p.fill?"100%":undefined}});
  }

  // ═══ LINE CHART — full chart: grid, y-axis (ms), avg reference line, area fill ═══
  function LineChart(p){
    var ref=useRef(null);
    useEffect(function(){
      var cv=ref.current;if(!cv)return;var ctx=cv.getContext("2d");
      var w=cv.width,h=cv.height;ctx.clearRect(0,0,w,h);
      var padL=36,padR=10,padT=10,padB=8;
      var plotW=w-padL-padR,plotH=h-padT-padB;
      var data=(p.data||[]).filter(function(v){return typeof v==="number"&&isFinite(v)});
      var lo=data.length?Math.min.apply(null,data):0,hi=data.length?Math.max.apply(null,data):1;
      if(hi<=lo)hi=lo+1;
      var mg=(hi-lo)*0.18||1,yMax=hi+mg,yMin=Math.max(0,lo-mg),yR=yMax-yMin||1;
      // horizontal gridlines + y labels
      ctx.font="8px 'Space Mono',monospace";ctx.textAlign="right";ctx.textBaseline="middle";ctx.lineWidth=1;
      for(var g=0;g<=3;g++){
        var gy=padT+plotH*(g/3);
        ctx.beginPath();ctx.moveTo(padL,gy);ctx.lineTo(w-padR,gy);ctx.strokeStyle="rgba(201,209,214,.06)";ctx.stroke();
        ctx.fillStyle="#7C868D";ctx.fillText(String(Math.round(yMax-yR*(g/3))),padL-6,gy);
      }
      if(data.length<2){ctx.textAlign="center";ctx.fillStyle="#7C868D";ctx.font="9px 'Space Mono',monospace";ctx.fillText("awaiting data…",padL+plotW/2,padT+plotH/2);return;}
      function X(i){return padL+(i/(data.length-1))*plotW;}
      function Y(v){return padT+plotH-((v-yMin)/yR)*plotH;}
      // avg reference (dashed)
      var avg=data.reduce(function(a,b){return a+b},0)/data.length;
      ctx.setLineDash([4,4]);ctx.strokeStyle="rgba(0,229,255,.35)";ctx.beginPath();ctx.moveTo(padL,Y(avg));ctx.lineTo(w-padR,Y(avg));ctx.stroke();ctx.setLineDash([]);
      // area
      var grad=ctx.createLinearGradient(0,padT,0,padT+plotH);
      grad.addColorStop(0,"rgba(0,229,255,.22)");grad.addColorStop(1,"rgba(0,229,255,0)");
      ctx.beginPath();ctx.moveTo(X(0),padT+plotH);data.forEach(function(v,i){ctx.lineTo(X(i),Y(v))});ctx.lineTo(X(data.length-1),padT+plotH);ctx.closePath();ctx.fillStyle=grad;ctx.fill();
      // line
      ctx.beginPath();data.forEach(function(v,i){var x=X(i),y=Y(v);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});
      ctx.strokeStyle=p.lineColor||"#00e5ff";ctx.lineWidth=1.6;ctx.stroke();
      // last point
      var lx=X(data.length-1),ly=Y(data[data.length-1]);
      ctx.beginPath();ctx.arc(lx,ly,3,0,Math.PI*2);ctx.fillStyle="#00e5ff";ctx.fill();
      ctx.beginPath();ctx.arc(lx,ly,6,0,Math.PI*2);ctx.strokeStyle="rgba(0,229,255,.4)";ctx.stroke();
    },[p.data,tick,p.w,p.h,p.lineColor]);
    return React.createElement("canvas",{ref:ref,width:p.w||900,height:p.h||130,style:{display:"block",width:"100%"}});
  }

  // ═══ BAR CHART ═══
  function BarChart(p){
    var ref=useRef(null);
    var [hover,setHover]=useState(-1);
    var barPositions=useRef([]);
    function draw(){
      var cv=ref.current;if(!cv)return;var ctx=cv.getContext("2d");
      var w=cv.width,h=cv.height;ctx.clearRect(0,0,w,h);
      var data=p.data||[];
      // faint horizontal gridlines (baseline for the plot area)
      ctx.strokeStyle="rgba(201,209,214,.06)";ctx.lineWidth=1;
      for(var g=0;g<=3;g++){var gy=(h-14)*(g/3);ctx.beginPath();ctx.moveTo(2,gy);ctx.lineTo(w-2,gy);ctx.stroke();}
      if(!data.length){ctx.fillStyle="#7C868D";ctx.font="9px 'Space Mono',monospace";ctx.textAlign="center";ctx.fillText("awaiting data…",w/2,(h-14)/2);return;}
      var max=Math.max.apply(null,data.map(function(d){return d.v}))||1;
      var bw=Math.floor((w-8)/(data.length))-2;
      var positions=[];
      data.forEach(function(d,i){
        var bh=(d.v/max)*(h-24);var x=4+i*(bw+2);var y=h-bh-14;
        positions.push({x:x,w:bw,y:y,h:bh});
        var isHover=hover===i;
        var bg=ctx.createLinearGradient(0,y,0,h-14);
        bg.addColorStop(0,isHover?"rgba(0,229,255,.95)":"rgba(0,229,255,.55)");
        bg.addColorStop(1,isHover?"rgba(0,229,255,.35)":"rgba(0,229,255,.12)");
        if(isHover){ctx.fillStyle="rgba(0,229,255,.10)";ctx.fillRect(x,0,bw,h-14)}
        ctx.fillStyle=bg;
        ctx.fillRect(x,y,bw,bh);
        ctx.fillStyle=isHover?"#00e5ff":"rgba(0,229,255,.7)";ctx.fillRect(x,y,bw,1);
        ctx.fillStyle=isHover?"#C9D1D6":"#7C868D";ctx.font=(isHover?"bold ":"")+"7px monospace";ctx.textAlign="center";ctx.fillText(d.l||"",x+bw/2,h-2);
      });
      barPositions.current=positions;
      if(hover>=0&&hover<data.length){
        var d=data[hover];var bp=positions[hover];
        var _u=(p.unit!==undefined)?p.unit:"req",_xs=(p.xsuffix!==undefined)?p.xsuffix:"h";
        var ttText=d.l+_xs+": "+(p.prefix||"")+d.v+(_u?(" "+_u):"")+(d.visitors!==undefined?" | "+d.visitors+" visitors":"");
        ctx.font="bold 10px monospace";var tw=ctx.measureText(ttText).width+12;
        var tx=Math.min(Math.max(bp.x+bp.w/2-tw/2,2),w-tw-2);
        var ty=Math.max(bp.y-24,2);
        ctx.fillStyle="rgba(0,0,0,.9)";ctx.fillRect(tx,ty,tw,18);
        ctx.strokeStyle="rgba(0,229,255,.4)";ctx.lineWidth=1;ctx.strokeRect(tx,ty,tw,18);
        ctx.fillStyle="#00e5ff";ctx.textAlign="left";ctx.fillText(ttText,tx+6,ty+13);
      }
    }
    useEffect(draw,[p.data,hover]);
    function onMove(e){var cv=ref.current;if(!cv)return;var rect=cv.getBoundingClientRect();var mx=(e.clientX-rect.left)*(cv.width/rect.width);var found=-1;barPositions.current.forEach(function(bp,i){if(mx>=bp.x&&mx<=bp.x+bp.w)found=i});setHover(found)}
    function onLeave(){setHover(-1)}
    return React.createElement("canvas",{ref:ref,width:p.w||200,height:p.h||80,onMouseMove:onMove,onMouseLeave:onLeave,style:{display:"block",cursor:"none",width:p.fill?"100%":undefined}});
  }

  // ═══ DONUT / RING CHART ═══
  function Donut(p){
    var ref=useRef(null);
    useEffect(function(){
      var cv=ref.current;if(!cv)return;var ctx=cv.getContext("2d");
      var w=cv.width,h=cv.height;ctx.clearRect(0,0,w,h);
      var data=(p.data||[]).filter(function(d){return (d.v||0)>0});
      var total=data.reduce(function(a,b){return a+(b.v||0)},0);
      var cx=w/2,cy=h/2,thick=Math.max(9,Math.min(w,h)*0.17),r=Math.min(w,h)/2-4-thick/2;
      // track ring
      ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.strokeStyle="rgba(201,209,214,.06)";ctx.lineWidth=thick;ctx.stroke();
      if(total){
        var a0=-Math.PI/2;
        data.forEach(function(d){
          var a1=a0+(d.v/total)*Math.PI*2;
          ctx.beginPath();ctx.arc(cx,cy,r,a0,a1);ctx.strokeStyle=d.c;ctx.lineWidth=thick;ctx.stroke();
          a0=a1;
        });
      }
      ctx.textAlign="center";ctx.textBaseline="middle";
      ctx.fillStyle="#E6EBEE";ctx.font="600 "+Math.round(r*0.62)+"px 'Space Grotesk',sans-serif";
      ctx.fillText(total>=1000?(Math.round(total/100)/10)+"k":String(total),cx,cy-2);
      ctx.fillStyle="#7C868D";ctx.font="8px 'Space Mono',monospace";ctx.fillText(p.label||"TOTAL",cx,cy+r*0.55);
    },[p.data,tick,p.w,p.h,p.label]);
    return React.createElement("canvas",{ref:ref,width:p.w||120,height:p.h||120,style:{display:"block",flexShrink:0}});
  }

  // ═══ STYLES ═══
  var card=function(glow){return{background:"linear-gradient(180deg,#14181C,#0E1114)",border:"1px solid rgba(201,209,214,.08)",padding:Math.round(18*F),position:"relative",overflow:"hidden"}};
  // Restrained top hairline — cyan only (no rainbow), the "active measurement" accent
  var cardGlow=function(color){return{position:"absolute",top:0,left:0,right:0,height:1,background:"linear-gradient(90deg,transparent,rgba("+CR+",.30),transparent)"}};
  var lb={fontSize:Math.round(8*F),color:"#7C868D",letterSpacing:".24em",marginBottom:8,textTransform:"uppercase",fontFamily:"'Space Mono',monospace"};
  var vl=function(color){return{fontSize:Math.round(32*F),fontFamily:HEAD,fontWeight:600,letterSpacing:"-.02em",color:color||"#E6EBEE",lineHeight:1}};
  var ip={width:"100%",background:"#0A0C0E",border:"1px solid rgba(201,209,214,.12)",color:"#E6EBEE",padding:Math.round(11*F)+"px",fontSize:Math.round(11*F),fontFamily:"'Space Mono',monospace",outline:"none",marginBottom:Math.round(6*F)};
  var btn=function(color){return{display:"inline-block",padding:Math.round(8*F)+"px "+Math.round(18*F)+"px",border:"1px solid "+(color||C)+"55",color:color||C,fontSize:Math.round(9*F),letterSpacing:".18em",cursor:"none",marginRight:6,fontFamily:"'Space Mono',monospace",textTransform:"uppercase"}};
  var ts=function(t){return{padding:Math.round(9*F)+"px "+Math.round(15*F)+"px",fontSize:Math.round(9*F),letterSpacing:".16em",cursor:"none",fontFamily:"'Space Mono',monospace",border:"1px solid "+(tab===t?"rgba("+CR+",.4)":"rgba(201,209,214,.07)"),background:tab===t?"rgba("+CR+",.08)":"transparent",color:tab===t?C:"#7C868D",transition:"all .18s cubic-bezier(.22,1,.36,1)"}};

  // ═══ LOGIN GATE ═══
  if (!auth) {
    return (
      React.createElement("div",{style:{position:"fixed",inset:0,background:"#0A0C0E",zIndex:100000,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Space Mono',monospace",backgroundImage:"linear-gradient(rgba(201,209,214,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(201,209,214,.05) 1px,transparent 1px)",backgroundSize:"64px 64px"}},
        React.createElement("div",{style:{width:"min(420px,92vw)",padding:"clamp(30px,6vw,48px)",border:"1px solid rgba(201,209,214,.1)",background:"linear-gradient(180deg,#14181C,#0E1114)",position:"relative",overflow:"hidden"}},
          React.createElement("div",{style:{position:"absolute",top:0,left:0,right:0,height:1,background:"linear-gradient(90deg,transparent,rgba("+CR+",.5),transparent)"}}),
          React.createElement("div",{style:{display:"flex",alignItems:"center",gap:10,marginBottom:26}},
            React.createElement("img",{src:"/logo.png",alt:"CS",style:{height:32,display:"block",border:"1px solid rgba(201,209,214,.14)",borderRadius:2}}),
            React.createElement("span",{style:{fontSize:Math.round(8*F),letterSpacing:".3em",color:C}},"// RESTRICTED")
          ),
          React.createElement("div",{style:{fontFamily:HEAD,fontWeight:600,fontSize:Math.round(24*F),letterSpacing:"-.02em",color:"#E6EBEE",marginBottom:6}},"Command Center"),
          React.createElement("div",{style:{fontSize:Math.round(8*F),color:"#7C868D",letterSpacing:".26em",marginBottom:30}},"AUTHENTICATION REQUIRED · ±0.00 TOL"),
          pwdErr && React.createElement("div",{style:{fontSize:Math.round(9*F),color:"#FF6A3D",letterSpacing:".2em",marginBottom:14,padding:"11px 14px",border:"1px solid rgba(255,106,61,.3)",background:"rgba(255,106,61,.05)"}},"ACCESS DENIED"),
          React.createElement("input",{type:"password",autoComplete:"current-password",value:pwd,onChange:function(e){setPwd(e.target.value)},onKeyDown:function(e){if(e.key==="Enter")checkPwd()},placeholder:"Enter password…",style:Object.assign({},ip,{marginBottom:16,fontSize:Math.round(13*F),padding:"14px 16px"})}),
          React.createElement("div",{style:{display:"flex",gap:10}},
            React.createElement("div",{onClick:checkPwd,style:{flex:1,padding:"14px",border:"1px solid rgba("+CR+",.4)",background:"rgba("+CR+",.08)",color:C,fontSize:Math.round(10*F),letterSpacing:".28em",cursor:"none",textAlign:"center"}},"UNLOCK →"),
            React.createElement("div",{onClick:props.onClose,style:{padding:"14px 24px",border:"1px solid rgba(201,209,214,.1)",color:"#7C868D",fontSize:Math.round(10*F),letterSpacing:".2em",cursor:"none",textAlign:"center"}},"ESC")
          )
        )
      )
    );
  }

  // ═══ SITE DETAIL VIEW ═══
  function renderSiteDetail(site){
    var s=stats[site.name]||{};var on=s.status==="ONLINE";var history=pingHistory[site.name]||[];
    var sslDays=serverStats.ssl_days||0;
    var domDays=0;
    var avgPing=history.length?Math.round(history.reduce(function(a,b){return a+b},0)/history.length):0;
    var minPing=history.length?Math.min.apply(null,history):0;
    var maxPing=history.length?Math.max.apply(null,history):0;
    // Real server metrics from /api/monitor.php (server-wide totals)
    var conns=serverStats.connections||0;
    var bw=serverStats.bandwidth||"0";
    var reqs=serverStats.requests_min||0;
    var uptime=on?(serverStats.uptime||"loading..."):"DOWN";

    return React.createElement("div",null,
      React.createElement("div",{onClick:function(){setSelSite(null)},style:{fontSize:Math.round(10*F),color:C,cursor:"none",marginBottom:Math.round(16*F)}},"\u2190 BACK TO ALL SITES"),
      // Header
      React.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:Math.round(20*F)}},
        React.createElement("div",null,
          React.createElement("div",{style:{fontFamily:HEAD,fontWeight:900,fontSize:Math.round(28*F),color:"#C9D1D6",marginBottom:4}},site.label),
          React.createElement("div",{style:{fontSize:Math.round(10*F),color:"#7C868D"}},site.name," \u00b7 ",site.tech)
        ),
        React.createElement("div",{style:{padding:"8px 20px",border:"1px solid "+(on?"rgba(0,255,136,.3)":"rgba(255,106,61,.3)"),color:on?"#00ff88":"#FF6A3D",fontSize:Math.round(11*F),fontFamily:HEAD,fontWeight:700}},on?"ONLINE":"OFFLINE")
      ),
      // Connection metrics row
      React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr",gap:Math.round(8*F),marginBottom:Math.round(20*F)}},
        React.createElement("div",{style:card()},React.createElement("div",{style:cardGlow()}),React.createElement("div",{style:lb},"LATENCY"),React.createElement("div",{style:vl(s.latency>300?"#FF6A3D":s.latency>150?"#ffaa00":"#00ff88")},(s.latency||0)+"ms")),
        React.createElement("div",{style:card()},React.createElement("div",{style:cardGlow()}),React.createElement("div",{style:lb},"CONNECTIONS"),React.createElement("div",{style:vl()},conns)),
        React.createElement("div",{style:card()},React.createElement("div",{style:cardGlow()}),React.createElement("div",{style:lb},"BANDWIDTH"),React.createElement("div",{style:vl()},bw+"MB/s")),
        React.createElement("div",{style:card()},React.createElement("div",{style:cardGlow()}),React.createElement("div",{style:lb},"REQUESTS/MIN"),React.createElement("div",{style:vl()},reqs)),
        React.createElement("div",{style:card()},React.createElement("div",{style:cardGlow()}),React.createElement("div",{style:lb},"UPTIME"),React.createElement("div",{style:vl(on?"#00ff88":"#FF6A3D")},serverStats.uptime_pct||"..."))
      ),
      // Latency chart
      React.createElement("div",{style:Object.assign({},card(),{marginBottom:Math.round(16*F)})},
        React.createElement("div",{style:cardGlow()}),
        React.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}},
          React.createElement("div",{style:lb},"LATENCY HISTORY (LAST 30 PINGS)"),
          React.createElement("div",{style:{fontSize:Math.round(9*F),color:"#7C868D"}},"avg:",avgPing,"ms \u00b7 min:",minPing,"ms \u00b7 max:",maxPing,"ms")
        ),
        React.createElement(LineChart,{data:history,w:900,h:140,lineColor:avgPing>300?"#FF6A3D":avgPing>150?"#ffaa00":"#00e5ff"})
      ),
      // Connection details grid
      React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:Math.round(10*F)}},
        React.createElement("div",{style:card()},
          React.createElement("div",{style:cardGlow()}),
          React.createElement("div",{style:Object.assign({},lb,{marginBottom:12})},"CONNECTION DETAILS"),
          [["Protocol","HTTPS/2"],["Port","443"],["SSL Issuer",serverStats.ssl_issuer||"checking..."],["SSL Expires",(serverStats.ssl_expires||"...")+" ("+(serverStats.ssl_days||"?")+"d)"],["Server","Nginx "+(serverStats.nginx_version||"...")+" / "+(serverStats.os||"...")],["IP",serverStats.server_ip||"..."],["TLS",(serverStats.tls_version||"...")+" / "+(serverStats.tls_cipher||"...")],["Load",serverStats.load||"0"],["Memory",(serverStats.memory_used||0)+"/"+(serverStats.memory_total||0)+"MB ("+(serverStats.memory_pct||0)+"%)"],["Disk",(serverStats.disk_used||0)+"/"+(serverStats.disk_total||0)+"GB ("+(serverStats.disk_pct||0)+"%)"]].map(function(row){
            return React.createElement("div",{key:row[0],style:{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid rgba(201,209,214,.03)",fontSize:Math.round(11*F)}},
              React.createElement("span",{style:{color:"#7C868D"}},row[0]),
              React.createElement("span",{style:{color:row[0]==="SSL Expires"&&sslDays<30?"#FF6A3D":"#C9D1D6",fontFamily:HEAD,fontWeight:600}},row[1])
            )
          })
        ),
        React.createElement("div",{style:card()},
          React.createElement("div",{style:cardGlow("255,170,0")}),
          React.createElement("div",{style:Object.assign({},lb,{marginBottom:12})},"TRAFFIC BY HOUR (TODAY)"),
          React.createElement(BarChart,{w:400,h:120,data:(serverStats.hourly||[]).map(function(h){return {l:h.hour,v:h.count,visitors:h.visitors||0}})}),
          React.createElement("div",{style:{marginTop:12}},
            React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:8}},
              React.createElement("div",{style:lb},"TOP REFERRERS"),
              React.createElement("div",{style:{fontSize:Math.round(9*F),color:C}},serverStats.unique_visitors+" unique visitors")
            ),
            (serverStats.referrers&&serverStats.referrers.length?serverStats.referrers:[{host:"Loading...",pct:0,count:0}]).map(function(r){
              var text=typeof r==="string"?r:r.host+" \u2014 "+r.pct+"% ("+r.count+")";
              return React.createElement("div",{key:text,style:{display:"flex",justifyContent:"space-between",fontSize:Math.round(10*F),color:"#C9D1D6",padding:"4px 0",borderBottom:"1px solid rgba(201,209,214,.02)"}},
                React.createElement("span",null,typeof r==="string"?r:r.host),
                React.createElement("span",{style:{color:C,fontFamily:HEAD,fontWeight:700}},typeof r==="string"?"":r.pct+"% ("+r.count+")")
              )
            })
          )
        )
      ),
      React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:Math.round(10*F),marginTop:Math.round(16*F)}},
        React.createElement("div",{style:card()},
          React.createElement("div",{style:cardGlow("170,136,255")}),
          React.createElement("div",{style:Object.assign({},lb,{marginBottom:10})},"TOP VISITORS BY COUNTRY"),
          (serverStats.top_ips||[]).slice(0,5).map(function(entry){
            var geo=countries[entry.ip]||{};
            return React.createElement("div",{key:entry.ip,style:{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:"1px solid rgba(201,209,214,.02)",fontSize:Math.round(10*F)}},
              React.createElement("span",{style:{color:"#C9D1D6"}},geo.country?(geo.country+(geo.city?" ("+geo.city+")":"")):(entry.ip.substring(0,12)+"...")),
              React.createElement("span",{style:{color:C,fontFamily:HEAD,fontWeight:700}},entry.count+" req")
            )
          })
        ),
        React.createElement("div",{style:card()},
          React.createElement("div",{style:cardGlow("255,204,0")}),
          React.createElement("div",{style:Object.assign({},lb,{marginBottom:12})},"DEVICE BREAKDOWN"),
          (function(){
            var ua=serverStats.user_agents||{};
            var dd=[{k:"Desktop",v:ua.desktop||0,c:"#00e5ff"},{k:"Mobile",v:ua.mobile||0,c:"#00ff88"},{k:"Bot / Crawler",v:ua.bot||0,c:"#ffaa00"}];
            var total=dd.reduce(function(a,b){return a+b.v},0)||1;
            return React.createElement("div",{style:{display:"flex",alignItems:"center",gap:Math.round(22*F)}},
              React.createElement(Donut,{data:dd.map(function(d){return {v:d.v,c:d.c}}),w:118,h:118,label:"HITS"}),
              React.createElement("div",{style:{flex:1,minWidth:0}},dd.map(function(d){
                var pct=Math.round(d.v/total*100);
                return React.createElement("div",{key:d.k,style:{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:"1px solid rgba(201,209,214,.03)"}},
                  React.createElement("span",{style:{width:9,height:9,background:d.c,flexShrink:0}}),
                  React.createElement("span",{style:{flex:1,color:"#C9D1D6",fontSize:Math.round(11*F)}},d.k),
                  React.createElement("span",{style:{color:d.c,fontFamily:HEAD,fontWeight:600,fontSize:Math.round(11*F)}},d.v.toLocaleString()," · ",pct,"%")
                )
              }))
            );
          })()
        )
      ),
      React.createElement("div",{style:{marginTop:Math.round(16*F)}},
        React.createElement("a",{href:site.url,target:"_blank",rel:"noopener",style:Object.assign({},btn(),{textDecoration:"none",padding:"12px 28px"})},"\u2197 OPEN ",site.label.toUpperCase())
      )
    );
  }

  // ═══ MAIN DASHBOARD ═══
  return (
    React.createElement("div",{className:"cs-admin",style:{position:"fixed",inset:0,background:"#0A0C0E",zIndex:100000,overflowY:"auto",overflowX:"hidden",fontFamily:"'Space Mono',monospace",color:"#C9D1D6",fontSize:Math.round(12*F),backgroundImage:"linear-gradient(rgba(201,209,214,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(201,209,214,.035) 1px,transparent 1px)",backgroundSize:"72px 72px"}},
      React.createElement("style",null,"@media(max-width:760px){.cs-admin [style*='grid-template-columns']{grid-template-columns:1fr !important;gap:8px !important}.cs-admin [style*='display: flex']{flex-wrap:wrap !important;gap:6px !important}.cs-admin [style*='max-width: 1300']{padding:12px !important}.cs-admin{font-size:11px !important}.cs-admin *{max-width:100%;word-break:break-word;overflow-wrap:anywhere}}"),
      React.createElement("div",{style:{maxWidth:1300,margin:"0 auto",padding:Math.round(20*F)+"px"}},

        // HEADER
        React.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",paddingBottom:Math.round(16*F),marginBottom:Math.round(20*F),borderBottom:"1px solid rgba("+CR+",.08)"}},
          React.createElement("div",{style:{display:"flex",alignItems:"center",gap:14}},
            React.createElement("div",{style:{width:10,height:10,borderRadius:"50%",background:onN===sites.length?"#00ff88":"#FF6A3D",boxShadow:"0 0 12px "+(onN===sites.length?"rgba(0,255,136,.5)":"rgba(255,106,61,.5)"),animation:"pulse 2s infinite"}}),
            React.createElement("img",{src:"/logo.png",alt:"CS",style:{height:Math.round(30*F),border:"1px solid rgba(201,209,214,.14)",borderRadius:2}}),
            React.createElement("div",null,
              React.createElement("div",{style:{fontFamily:HEAD,fontWeight:600,fontSize:Math.round(17*F),letterSpacing:"-.01em",color:"#E6EBEE"}},"Command Center"),
              React.createElement("div",{style:{fontSize:Math.round(8*F),color:"#7C868D",letterSpacing:".22em"}},onN,"/",sites.length," SYSTEMS ONLINE \u00b7 v5.0")
            )
          ),
          React.createElement("div",{style:{display:"flex",gap:8,alignItems:"center"}},
            React.createElement("span",{style:{fontSize:Math.round(9*F),color:"#7C868D"}},new Date().toLocaleString()),
            React.createElement("div",{onClick:function(){doPing()},style:btn()},"REFRESH"),
            React.createElement("div",{onClick:function(){try{sessionStorage.removeItem("cs_admin_token")}catch(e){}setAuth(false)},style:btn("#FF6A3D")},"LOGOUT"),
            React.createElement("div",{onClick:props.onClose,style:btn()},"ESC")
          )
        ),

        // TABS
        React.createElement("div",{style:{display:"flex",gap:3,marginBottom:Math.round(20*F),flexWrap:"wrap"}},
          [["dashboard","\u25C8 DASHBOARD"],["sites","\u25CE SITES"],["contacts","\u2709 CONTACTS"],["analyzer","\u26A1 ANALYZER"],["indexnow","\u26A1 INDEXNOW"],["campaigns","\u25B6 CAMPAIGNS"],["crm","\u2605 CRM"],["revenue","\u20ac REVENUE"],["tasks","\u2713 TASKS"],["logs","\u25B7 LOGS"],["system","\u2699 SYSTEM"],["settings","\u2691 SETTINGS"]].map(function(t){return React.createElement("div",{key:t[0],onClick:function(){setTab(t[0]);setSelSite(null)},style:ts(t[0])},t[1])})
        ),

        // ═══ DASHBOARD ═══
        tab==="dashboard"&&React.createElement("div",null,
          // KPI row
          React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr",gap:Math.round(8*F),marginBottom:Math.round(20*F)}},
            React.createElement("div",{style:card()},React.createElement("div",{style:cardGlow()}),React.createElement("div",{style:lb},"SITES ONLINE"),React.createElement("div",{style:vl(onN===sites.length?"#00ff88":"#FF6A3D")},onN,"/",sites.length),React.createElement("div",{style:{marginTop:10}},React.createElement(Spark,{data:kpiHist.map(function(k){return k.online}),w:240,h:22,fill:true,lineColor:"#00e5ff"}))),
            React.createElement("div",{style:card()},React.createElement("div",{style:cardGlow()}),React.createElement("div",{style:lb},"AVG LATENCY"),React.createElement("div",{style:vl(avgLat>300?"#FF6A3D":avgLat>150?"#ffaa00":"#00ff88")},avgLat,"ms"),React.createElement("div",{style:{marginTop:10}},React.createElement(Spark,{data:kpiHist.map(function(k){return k.lat}),w:240,h:22,fill:true,lineColor:avgLat>300?"#FF6A3D":avgLat>150?"#ffaa00":"#00e5ff"}))),
            React.createElement("div",{style:card()},React.createElement("div",{style:cardGlow()}),React.createElement("div",{style:lb},"REQUESTS TODAY"),React.createElement("div",{style:vl()},serverStats.nginx_today||0),React.createElement("div",{style:{marginTop:10}},React.createElement(Spark,{data:(serverStats.hourly||[]).map(function(x){return x.count||0}),w:240,h:22,fill:true,lineColor:"#00e5ff"}))),
            React.createElement("div",{style:card()},React.createElement("div",{style:cardGlow()}),React.createElement("div",{style:lb},"UNIQUE VISITORS"),React.createElement("div",{style:vl()},serverStats.unique_visitors||0),React.createElement("div",{style:{marginTop:10}},React.createElement(Spark,{data:kpiHist.map(function(k){return k.uniq}),w:240,h:22,fill:true,lineColor:"#00e5ff"}))),
            React.createElement("div",{style:card()},React.createElement("div",{style:cardGlow()}),React.createElement("div",{style:lb},"CONTACTS"),React.createElement("div",{style:vl()},contacts.length),React.createElement("div",{style:{marginTop:10}},React.createElement(Spark,{data:kpiHist.map(function(k){return k.contacts}),w:240,h:22,fill:true,lineColor:"#00e5ff"})))
          ),
          // Quick actions
          React.createElement("div",{style:{display:"flex",gap:6,flexWrap:"wrap",marginBottom:Math.round(20*F)}},
            React.createElement("div",{onClick:function(){
              if(indexNowBusy)return;setIndexNowBusy(true);
              csAuthFetch("/api/indexnow.php?action=bulk",{method:"POST"}).then(function(r){return r.json()}).then(function(d){
                setIndexNowBusy(false);
                if(d.ok)alert("IndexNow: submitted "+d.submitted+" URLs");else alert("IndexNow error: "+(d.error||"?"));
              }).catch(function(){setIndexNowBusy(false);alert("IndexNow request failed")});
            },style:btn()},indexNowBusy?"\u23f3 SUBMITTING...":"\u26a1 INDEXNOW: SUBMIT ALL"),
            React.createElement("a",{href:"https://search.google.com/search-console",target:"_blank",rel:"noopener",style:Object.assign({},btn(),{textDecoration:"none"})},"\u2197 SEARCH CONSOLE"),
            React.createElement("a",{href:"https://www.bing.com/webmasters",target:"_blank",rel:"noopener",style:Object.assign({},btn(),{textDecoration:"none"})},"\u2197 BING WEBMASTER"),
            React.createElement("a",{href:"/sitemap.xml",target:"_blank",rel:"noopener",style:Object.assign({},btn(),{textDecoration:"none"})},"\u2197 SITEMAP"),
            React.createElement("div",{onClick:function(){setTab("contacts")},style:btn()},"\u2709 LATEST LEADS")
          ),
          // Sites grid with sparklines
          React.createElement("div",{style:{marginBottom:Math.round(8*F)}},React.createElement("div",{style:Object.assign({},lb,{marginBottom:Math.round(10*F)})},"REAL-TIME MONITORING \u00b7 REFRESH EVERY 15s")),
          sites.map(function(site){
            var s=stats[site.name]||{};var on=s.status==="ONLINE";var lat=s.latency||0;
            var history=pingHistory[site.name]||[];
            return React.createElement("div",{key:site.name,onClick:function(){setTab("sites");setSelSite(site)},style:{display:"grid",gridTemplateColumns:"12px 1fr 100px 120px 80px 60px",gap:10,alignItems:"center",padding:Math.round(10*F)+"px 8px",borderBottom:"1px solid rgba(201,209,214,.03)",cursor:"none",transition:"background .2s"}},
              React.createElement("div",{style:{width:8,height:8,borderRadius:"50%",background:on?"#00ff88":loading?"#ffaa00":"#FF6A3D",boxShadow:"0 0 6px "+(on?"rgba(0,255,136,.4)":"rgba(255,106,61,.4)")}}),
              React.createElement("div",null,
                React.createElement("span",{style:{fontFamily:HEAD,fontWeight:700,fontSize:Math.round(12*F)}},site.label),
                React.createElement("span",{style:{fontSize:Math.round(8*F),color:"#7C868D",marginLeft:8}},site.type)
              ),
              React.createElement("span",{style:{fontSize:Math.round(9*F),color:"#7C868D"}},site.name.split(".")[0]),
              React.createElement(Spark,{data:history,w:120,h:28}),
              React.createElement("span",{style:{fontSize:Math.round(10*F),color:lat>500?"#FF6A3D":lat>200?"#ffaa00":"#00ff88",fontFamily:HEAD,fontWeight:700,textAlign:"right"}},lat>0?lat+"ms":loading?"...":"DOWN"),
              React.createElement("span",{style:{fontSize:Math.round(8*F),color:C,textAlign:"right"}},"\u2192")
            )
          })
        ),

        // ═══ SITES ═══
        tab==="sites"&&(selSite?renderSiteDetail(selSite):React.createElement("div",null,
          React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:Math.round(10*F)}},
            sites.map(function(site){
              var s=stats[site.name]||{};var on=s.status==="ONLINE";var history=pingHistory[site.name]||[];
              var sslD=serverStats.ssl_days||0;
              return React.createElement("div",{key:site.name,onClick:function(){setSelSite(site)},style:Object.assign({},card(on?CR:"255,106,61"),{cursor:"none"})},
                React.createElement("div",{style:cardGlow(on?CR:"255,106,61")}),
                React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:12}},
                  React.createElement("span",{style:{fontFamily:HEAD,fontWeight:800,fontSize:Math.round(13*F)}},site.label),
                  React.createElement("span",{style:{fontSize:Math.round(8*F),color:on?"#00ff88":"#FF6A3D",padding:"2px 8px",border:"1px solid"}},s.status||"...")
                ),
                React.createElement("div",{style:{fontSize:Math.round(9*F),color:"#7C868D",marginBottom:8}},site.type," \u00b7 ",site.tech),
                React.createElement(Spark,{data:history,w:250,h:36}),
                React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginTop:10,fontSize:Math.round(9*F)}},
                  React.createElement("span",{style:{color:"#7C868D"}},"Ping: ",React.createElement("span",{style:{color:on?"#00ff88":"#FF6A3D"}},(s.latency||0)+"ms")),
                  React.createElement("span",{style:{color:(serverStats.ssl_days||0)<30?"#FF6A3D":(serverStats.ssl_days||0)<60?"#ffaa00":"#7C868D"}},"SSL: ",(serverStats.ssl_days||"?"),"d")
                )
              )
            })
          )
        )),

        // ═══ CONTACTS ═══
        tab==="contacts"&&React.createElement("div",null,
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:Math.round(14*F)}},
            React.createElement("div",{style:lb},"FORM SUBMISSIONS (",contacts.length,")"),
            React.createElement("div",{style:{display:"flex",gap:6}},
              React.createElement("div",{onClick:function(){exportCSV(contacts,"cs_leads")},style:btn()},"\u2913 EXPORT CSV"),
              React.createElement("div",{onClick:function(){csAuthFetch("/api/contact.php?action=log").then(function(r){return r.json()}).then(function(d){if(d.entries)setContacts(d.entries)}).catch(function(){})},style:btn()},"\u21bb REFRESH")
            )
          ),
          contacts.length>0&&React.createElement("div",{style:Object.assign({},card(),{marginBottom:Math.round(14*F)})},
            React.createElement("div",{style:cardGlow()}),
            React.createElement("div",{style:Object.assign({},lb,{marginBottom:12})},"LEADS BY DAY"),
            (function(){
              var by={};
              contacts.forEach(function(c){var d=(c.date||"").slice(0,10);if(d)by[d]=(by[d]||0)+1});
              var days=Object.keys(by).sort().slice(-14);
              return React.createElement(BarChart,{w:900,h:130,fill:true,unit:"leads",xsuffix:"",data:days.map(function(d){return {l:d.slice(5),v:by[d]}})});
            })()
          ),
          contacts.length===0&&React.createElement("div",{style:{padding:Math.round(32*F),textAlign:"center",border:"1px solid rgba(201,209,214,.04)",color:"#7C868D"}},"No submissions yet"),
          contacts.map(function(c,i){return React.createElement("div",{key:i,style:{padding:Math.round(14*F),borderBottom:"1px solid rgba(201,209,214,.04)"}},
            React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
              React.createElement("span",{style:{fontFamily:HEAD,fontWeight:700,fontSize:Math.round(13*F)}},c.name||"\u2014"),
              React.createElement("span",{style:{fontSize:Math.round(9*F),color:"#7C868D"}},c.date||"")
            ),
            React.createElement("div",{style:{fontSize:Math.round(10*F),color:C}},c.email||""," ",c.phone?" \u00b7 "+c.phone:""),
            React.createElement("div",{style:{fontSize:Math.round(10*F),color:"#7C868D",marginTop:4}},c.message||"")
          )})
        ),

        // ═══ ANALYZER TAB ═══
        tab==="analyzer"&&React.createElement("div",null,
          React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:Math.round(8*F),marginBottom:Math.round(20*F)}},
            React.createElement("div",{style:card()},React.createElement("div",{style:cardGlow()}),React.createElement("div",{style:lb},"TOTAL SCANS"),React.createElement("div",{style:vl()},analyzerScans.length)),
            React.createElement("div",{style:card()},React.createElement("div",{style:cardGlow("0,255,136")}),React.createElement("div",{style:lb},"TOTAL LEADS"),React.createElement("div",{style:vl("#00ff88")},analyzerLeads.length)),
            React.createElement("div",{style:card()},React.createElement("div",{style:cardGlow("255,204,0")}),React.createElement("div",{style:lb},"CONVERSION RATE"),React.createElement("div",{style:vl()},analyzerScans.length>0?Math.min(100,Math.round(analyzerLeads.length/analyzerScans.length*100))+"%":"—"))
          ),
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:Math.round(14*F)}},
            React.createElement("div",{style:lb},"RECENT LEADS ("+analyzerLeads.length+")"),
            React.createElement("div",{onClick:function(){csAuthFetch("/api/analyze.php?action=stats").then(function(r){return r.json()}).then(function(d){if(d.ok){setAnalyzerScans(d.recent_scans||[]);setAnalyzerLeads(d.recent_leads||[])}})},style:btn()},"\u21bb REFRESH")
          ),
          analyzerLeads.length===0&&React.createElement("div",{style:{padding:Math.round(32*F),textAlign:"center",border:"1px solid rgba(201,209,214,.04)",color:"#7C868D"}},"No leads from /test/ yet"),
          analyzerLeads.map(function(l,i){return React.createElement("div",{key:i,style:{padding:Math.round(14*F),borderBottom:"1px solid rgba(201,209,214,.04)",display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}},
            React.createElement("div",null,
              React.createElement("div",{style:{fontFamily:HEAD,fontWeight:700,fontSize:Math.round(13*F),marginBottom:4}},l.name||"\u2014"),
              React.createElement("div",{style:{fontSize:Math.round(10*F),color:C}},l.email||""," ",l.phone?" \u00b7 "+l.phone:""),
              l.message&&React.createElement("div",{style:{fontSize:Math.round(10*F),color:"#7C868D",marginTop:4}},l.message)
            ),
            React.createElement("div",{style:{textAlign:"right"}},
              React.createElement("div",{style:{fontSize:Math.round(9*F),color:"#7C868D"}},l.ts?new Date(l.ts).toLocaleString():""),
              l.tested_url&&React.createElement("a",{href:safeHref(l.tested_url),target:"_blank",rel:"noopener",style:{fontSize:Math.round(10*F),color:"#00e5ff",textDecoration:"none",display:"block",marginTop:4,wordBreak:"break-all"}},"\u25b6 "+l.tested_url)
            )
          )}),
          React.createElement("div",{style:{marginTop:Math.round(20*F),borderTop:"1px solid rgba(201,209,214,.04)",paddingTop:Math.round(14*F)}}),
          React.createElement("div",{style:lb},"RECENT SCANS ("+analyzerScans.length+")"),
          analyzerScans.length===0&&React.createElement("div",{style:{padding:Math.round(20*F),textAlign:"center",color:"#7C868D",fontSize:Math.round(10*F)}},"No scans with consent yet"),
          analyzerScans.slice(0,15).map(function(s,i){
            var perf=s.perf_mobile;
            var pColor=perf>=80?"#00ff88":perf>=50?"#ffaa00":"#FF6A3D";
            return React.createElement("div",{key:i,style:{display:"grid",gridTemplateColumns:"1fr 80px 80px 140px",gap:10,padding:Math.round(10*F)+"px 0",borderBottom:"1px solid rgba(201,209,214,.02)",alignItems:"center"}},
              React.createElement("a",{href:safeHref(s.url),target:"_blank",rel:"noopener",style:{color:"#C9D1D6",textDecoration:"none",fontSize:Math.round(11*F),wordBreak:"break-all"}},s.host||s.url),
              React.createElement("span",{style:{fontSize:Math.round(10*F),color:pColor,fontFamily:HEAD,fontWeight:800,textAlign:"center"}},"P: "+(perf||"?")),
              React.createElement("span",{style:{fontSize:Math.round(10*F),color:"#7C868D",fontFamily:HEAD,fontWeight:700,textAlign:"center"}},"S: "+(s.seo_mobile||"?")),
              React.createElement("span",{style:{fontSize:Math.round(9*F),color:"#7C868D",textAlign:"right"}},s.ts?new Date(s.ts).toLocaleString():"")
            )
          })
        ),

        // ═══ INDEXNOW TAB ═══
        tab==="indexnow"&&React.createElement("div",null,
          React.createElement("div",{style:Object.assign({},card(),{marginBottom:Math.round(16*F)})},
            React.createElement("div",{style:cardGlow()}),
            React.createElement("div",{style:Object.assign({},lb,{marginBottom:8})},"INDEXNOW \u2014 INSTANT BING/YANDEX INDEXING"),
            React.createElement("div",{style:{fontSize:Math.round(11*F),color:"#888",marginBottom:12,lineHeight:1.6}},"Submit URLs to Bing, Yandex, Seznam, Naver for near-instant indexing. Use after publishing new content or major updates."),
            React.createElement("div",{style:{display:"flex",gap:8,flexWrap:"wrap"}},
              React.createElement("div",{onClick:function(){
                if(indexNowBusy)return;
                setIndexNowBusy(true);
                csAuthFetch("/api/indexnow.php?action=bulk",{method:"POST"}).then(function(r){return r.json()}).then(function(d){
                  setIndexNowBusy(false);
                  if(d.ok){alert("Submitted "+d.submitted+" URLs to "+Object.keys(d.endpoints||{}).length+" engines");csAuthFetch("/api/indexnow.php?action=status").then(function(r){return r.json()}).then(function(dd){if(dd.ok)setIndexNowLog(dd.submissions||[])})}
                  else alert("Error: "+(d.error||"unknown"))
                }).catch(function(e){setIndexNowBusy(false);alert("Network error")});
              },style:Object.assign({},btn(),{background:indexNowBusy?"rgba(255,170,0,.1)":"rgba(0,229,255,.06)"})},indexNowBusy?"\u25CF SUBMITTING...":"\u25B6 SUBMIT ALL SITEMAPS"),
              React.createElement("a",{href:"/sitemap.xml",target:"_blank",style:Object.assign({},btn(),{textDecoration:"none"})},"\u2197 VIEW SITEMAP")
            )
          ),
          React.createElement("div",{style:lb},"SUBMISSION HISTORY ("+indexNowLog.length+")"),
          indexNowLog.length===0&&React.createElement("div",{style:{padding:Math.round(32*F),textAlign:"center",border:"1px solid rgba(201,209,214,.04)",color:"#7C868D"}},"No submissions yet"),
          indexNowLog.map(function(s,i){
            var eps=s.results||{};
            return React.createElement("div",{key:i,style:{padding:Math.round(14*F),borderBottom:"1px solid rgba(201,209,214,.04)"}},
              React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:8}},
                React.createElement("span",{style:{fontFamily:HEAD,fontWeight:700,fontSize:Math.round(12*F)}},(s.url_count||0)+" URLs submitted"),
                React.createElement("span",{style:{fontSize:Math.round(9*F),color:"#7C868D"}},s.ts?new Date(s.ts).toLocaleString():"")
              ),
              React.createElement("div",{style:{display:"flex",gap:12,fontSize:Math.round(10*F),flexWrap:"wrap"}},
                Object.keys(eps).map(function(host){
                  var r=eps[host];
                  return React.createElement("span",{key:host,style:{padding:"3px 10px",border:"1px solid "+(r.success?"rgba(0,255,136,.3)":"rgba(255,106,61,.3)"),color:r.success?"#00ff88":"#FF6A3D",borderRadius:4}},host+" \u00b7 "+r.http_code)
                })
              )
            )
          })
        ),

        // ═══ CAMPAIGNS ═══
        tab==="campaigns"&&React.createElement("div",null,
          React.createElement("div",{style:Object.assign({},card(),{marginBottom:Math.round(16*F)})},
            React.createElement("div",{style:cardGlow()}),
            React.createElement("div",{style:Object.assign({},lb,{marginBottom:10})},"NEW CAMPAIGN"),
            React.createElement("input",{value:campName,onChange:function(e){setCampName(e.target.value)},placeholder:"Campaign name...",style:ip}),
            React.createElement("input",{value:campSubj,onChange:function(e){setCampSubj(e.target.value)},placeholder:"Subject...",style:ip}),
            React.createElement("textarea",{value:campBody,onChange:function(e){setCampBody(e.target.value)},placeholder:"Body...",rows:3,style:Object.assign({},ip,{resize:"vertical"})}),
            React.createElement("div",{onClick:saveCamp,style:btn()},"CREATE")
          ),
          campaigns.map(function(c){return React.createElement("div",{key:c.id,style:{padding:Math.round(12*F),borderBottom:"1px solid rgba(201,209,214,.04)"}},
            React.createElement("div",{style:{display:"flex",justifyContent:"space-between"}},React.createElement("span",{style:{fontFamily:HEAD,fontWeight:700}},c.name),React.createElement("span",{style:{fontSize:Math.round(9*F),color:c.status==="SENT"?"#00ff88":"#ffaa00"}},"[",c.status,"]")),
            React.createElement("div",{style:{fontSize:Math.round(10*F),color:"#7C868D",margin:"6px 0"}},c.subject||""),
            React.createElement("div",{onClick:function(){delCamp(c.id)},style:btn("#FF6A3D")},"DELETE")
          )})
        ),

        // ═══ CRM ═══
        tab==="crm"&&React.createElement("div",null,
          React.createElement("div",{style:{display:"flex",justifyContent:"flex-end",marginBottom:Math.round(10*F)}},
            React.createElement("div",{onClick:function(){exportCSV(clients,"cs_clients")},style:btn()},"\u2913 EXPORT CSV")
          ),
          React.createElement("div",{style:Object.assign({},card(),{marginBottom:Math.round(16*F)})},
            React.createElement("div",{style:cardGlow()}),
            React.createElement("div",{style:Object.assign({},lb,{marginBottom:10})},"ADD CLIENT"),
            React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr 120px",gap:6}},
              React.createElement("input",{value:cliName,onChange:function(e){setCliName(e.target.value)},placeholder:"Name...",style:ip}),
              React.createElement("input",{value:cliProj,onChange:function(e){setCliProj(e.target.value)},placeholder:"Project...",style:ip}),
              React.createElement("input",{value:cliBudget,onChange:function(e){setCliBudget(e.target.value)},placeholder:"\u20ac Budget",style:ip})
            ),
            React.createElement("div",{onClick:addClient,style:btn()},"ADD")
          ),
          clients.map(function(c){return React.createElement("div",{key:c.id,style:{display:"grid",gridTemplateColumns:"1fr 1fr 90px 60px 40px",gap:8,padding:Math.round(8*F)+"px 0",borderBottom:"1px solid rgba(201,209,214,.03)",alignItems:"center"}},
            React.createElement("span",{style:{fontFamily:HEAD,fontWeight:700}},c.name),
            React.createElement("span",{style:{color:"#C9D1D6"}},c.project),
            React.createElement("span",{style:{color:C,fontFamily:HEAD,fontWeight:900}},"\u20ac",c.budget),
            React.createElement("span",{style:{fontSize:Math.round(8*F),color:"#00ff88"}},c.status),
            React.createElement("span",{onClick:function(){delClient(c.id)},style:{color:"#FF6A3D",cursor:"none",fontSize:Math.round(9*F)}},"\u2715")
          )})
        ),

        // ═══ REVENUE ═══
        tab==="revenue"&&React.createElement("div",null,
          React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:Math.round(10*F),marginBottom:Math.round(20*F)}},
            React.createElement("div",{style:card()},React.createElement("div",{style:cardGlow()}),React.createElement("div",{style:lb},"TOTAL REVENUE"),React.createElement("div",{style:vl()},"\u20ac",totalRev.toLocaleString())),
            React.createElement("div",{style:card()},React.createElement("div",{style:cardGlow("0,255,136")}),React.createElement("div",{style:lb},"CLIENTS"),React.createElement("div",{style:vl()},clients.length)),
            React.createElement("div",{style:card()},React.createElement("div",{style:cardGlow("170,136,255")}),React.createElement("div",{style:lb},"AVG PROJECT"),React.createElement("div",{style:vl()},"\u20ac",clients.length?Math.floor(totalRev/clients.length).toLocaleString():"0"))
          ),
          React.createElement("div",{style:Object.assign({},card(),{marginBottom:Math.round(16*F)})},
            React.createElement("div",{style:cardGlow()}),
            React.createElement("div",{style:Object.assign({},lb,{marginBottom:12})},"REVENUE BY CLIENT (\u20ac)"),
            React.createElement(BarChart,{w:900,h:150,fill:true,unit:"",xsuffix:"",prefix:"\u20ac",data:clients.map(function(c){return {l:(c.name||"?").slice(0,7),v:parseFloat(c.budget)||0}})})
          ),
          clients.map(function(c){return React.createElement("div",{key:c.id,style:{display:"grid",gridTemplateColumns:"1fr 1fr 100px",gap:8,padding:"8px 0",borderBottom:"1px solid rgba(201,209,214,.03)"}},
            React.createElement("span",{style:{fontFamily:HEAD,fontWeight:700}},c.name),React.createElement("span",{style:{color:"#C9D1D6"}},c.project),React.createElement("span",{style:{color:C,fontFamily:HEAD,fontWeight:900}},"\u20ac",c.budget))})
        ),

        // ═══ TASKS ═══
        tab==="tasks"&&React.createElement("div",null,
          React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 100px 70px",gap:6,marginBottom:Math.round(14*F)}},
            React.createElement("input",{value:taskText,onChange:function(e){setTaskText(e.target.value)},placeholder:"New task...",style:ip,onKeyDown:function(e){if(e.key==="Enter")addTask()}}),
            React.createElement("select",{value:taskPri,onChange:function(e){setTaskPri(e.target.value)},style:ip},React.createElement("option",{value:"HIGH"},"HIGH"),React.createElement("option",{value:"MEDIUM"},"MED"),React.createElement("option",{value:"LOW"},"LOW")),
            React.createElement("div",{onClick:addTask,style:Object.assign({},btn(),{textAlign:"center",padding:"10px 0"})},"ADD")
          ),
          tasks.map(function(t){var pc={HIGH:"#FF6A3D",MEDIUM:"#ffaa00",LOW:"#00ff88"}[t.pri];return React.createElement("div",{key:t.id,style:{display:"grid",gridTemplateColumns:"24px 1fr 50px 30px",gap:8,padding:"8px 0",borderBottom:"1px solid rgba(201,209,214,.03)",alignItems:"center",opacity:t.done?.35:1}},
            React.createElement("div",{onClick:function(){togTask(t.id)},style:{width:16,height:16,border:"1px solid "+(t.done?"#00ff88":"#7C868D"),display:"flex",alignItems:"center",justifyContent:"center",cursor:"none",color:"#00ff88",fontSize:11}},t.done?"\u2713":""),
            React.createElement("span",{style:{textDecoration:t.done?"line-through":"none"}},t.text),
            React.createElement("span",{style:{fontSize:Math.round(8*F),color:pc}},t.pri),
            React.createElement("span",{onClick:function(){delTask(t.id)},style:{color:"#FF6A3D",cursor:"none"}},"\u2715")
          )})
        ),

        // ═══ LOGS ═══
        tab==="logs"&&React.createElement("div",null,
          actLog.map(function(l,i){return React.createElement("div",{key:i,style:{display:"grid",gridTemplateColumns:"70px 80px 1fr",gap:8,padding:"7px 0",borderBottom:"1px solid rgba(201,209,214,.02)"}},
            React.createElement("span",{style:{fontSize:Math.round(9*F),color:"#7C868D"}},l.t),
            React.createElement("span",{style:{fontSize:Math.round(8*F),color:C,padding:"2px 6px",border:"1px solid rgba("+CR+",.15)",textAlign:"center"}},l.c),
            React.createElement("span",null,l.a)
          )})
        ),

        // ═══ SYSTEM ═══
        tab==="system"&&React.createElement("div",null,
          React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:Math.round(8*F),marginBottom:Math.round(20*F)}},
            [["VPS",serverStats.server_ip||"...","#00e5ff"],["PROVIDER","Hetzner NBG1","#00ff88"],["OS",serverStats.os||"...","#ffaa00"],["NGINX","Nginx "+(serverStats.nginx_version||"..."),"#aa88ff"],["PHP",serverStats.php_version||"...","#00e5ff"],["SSL",serverStats.ssl_issuer||"...","#00ff88"],["SSL EXPIRES",(serverStats.ssl_expires||"...")+" ("+(serverStats.ssl_days||"?")+"d)","#ffaa00"],["TLS",(serverStats.tls_version||"..."),"#FF6A3D"],["LOAD",serverStats.load||"0","#00e5ff"],["MEMORY",(serverStats.memory_pct||0)+"%","#00ff88"],["DISK",(serverStats.disk_pct||0)+"%","#ffaa00"],["PROCESSES",(serverStats.processes||0)+"","#aa88ff"]].map(function(it){
              return React.createElement("div",{key:it[0],style:card()},
                React.createElement("div",{style:cardGlow(it[2]?it[2].replace("#","").match(/.{2}/g).map(function(h){return parseInt(h,16)}).join(","):CR)}),
                React.createElement("div",{style:{fontSize:Math.round(8*F),color:"#7C868D",letterSpacing:".15em",marginBottom:4}},it[0]),
                React.createElement("div",{style:{fontSize:Math.round(13*F),fontFamily:HEAD,fontWeight:700,color:it[2]||"#C9D1D6"}},it[1])
              )
            })
          )
        ),

        // ═══ SETTINGS ═══
        tab==="settings"&&React.createElement("div",null,
          React.createElement("div",{style:Object.assign({},card(),{marginBottom:Math.round(20*F)})},
            React.createElement("div",{style:cardGlow()}),
            React.createElement("div",{style:Object.assign({},lb,{marginBottom:14})},"SMTP / EMAIL CONFIG"),
            React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}},
              React.createElement("div",null,React.createElement("div",{style:{fontSize:Math.round(8*F),color:"#7C868D",marginBottom:2}},"HOST"),React.createElement("input",{value:cfgSmtp.host,onChange:function(e){setCfgSmtp(Object.assign({},cfgSmtp,{host:e.target.value}))},style:ip})),
              React.createElement("div",null,React.createElement("div",{style:{fontSize:Math.round(8*F),color:"#7C868D",marginBottom:2}},"PORT"),React.createElement("input",{value:cfgSmtp.port,onChange:function(e){setCfgSmtp(Object.assign({},cfgSmtp,{port:e.target.value}))},style:ip})),
              React.createElement("div",null,React.createElement("div",{style:{fontSize:Math.round(8*F),color:"#7C868D",marginBottom:2}},"USERNAME"),React.createElement("input",{value:cfgSmtp.user,onChange:function(e){setCfgSmtp(Object.assign({},cfgSmtp,{user:e.target.value}))},style:ip})),
              React.createElement("div",null,React.createElement("div",{style:{fontSize:Math.round(8*F),color:"#7C868D",marginBottom:2}},"PASSWORD"),React.createElement("input",{type:"password",value:cfgSmtp.pass,onChange:function(e){setCfgSmtp(Object.assign({},cfgSmtp,{pass:e.target.value}))},placeholder:"App password...",style:ip})),
              React.createElement("div",null,React.createElement("div",{style:{fontSize:Math.round(8*F),color:"#7C868D",marginBottom:2}},"RECIPIENT"),React.createElement("input",{value:cfgSmtp.to,onChange:function(e){setCfgSmtp(Object.assign({},cfgSmtp,{to:e.target.value}))},style:ip}))
            ),
            React.createElement("div",{style:{display:"flex",gap:8,marginTop:12,alignItems:"center"}},
              React.createElement("div",{onClick:saveSMTP,style:btn()},"SAVE CONFIG"),
              cfgSaved&&React.createElement("span",{style:{color:"#00ff88",fontSize:Math.round(10*F)}},"SAVED!")
            )
          ),
          React.createElement("div",{style:card()},
            React.createElement("div",{style:cardGlow("255,106,61")}),
            React.createElement("div",{style:Object.assign({},lb,{marginBottom:10})},"ADMIN ACCESS"),
            React.createElement("div",{style:{fontSize:Math.round(10*F),color:"#7C868D",lineHeight:1.9}},
              "Access is controlled server-side. The admin password is the ",
              React.createElement("code",{style:{color:C}},"CS_ADMIN_TOKEN")," value in the PHP-FPM pool config:",
              React.createElement("br",null),
              React.createElement("code",{style:{color:"#00ff88",fontSize:Math.round(9*F),wordBreak:"break-all"}},"env[CS_ADMIN_TOKEN] = your-long-random-password"),
              React.createElement("br",null),
              "To change it: edit that line, run ",React.createElement("code",{style:{color:C}},"systemctl restart php8.5-fpm"),", then log in again. No rebuild needed and no secret ships in the browser."
            )
          )
        )

      ),
      // Pulse animation
      React.createElement("style",null,"@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}")
    )
  );
}
