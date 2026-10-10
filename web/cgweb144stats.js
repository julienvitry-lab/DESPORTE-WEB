/* CGWEB144 · Analyse > Statistiques. Read-only period totals; no FIT/Strava mutation. */
(() => {
  "use strict";
  const ROOT="cgweb144StatsPanel";
  const NAV="cgweb144StatsSubtab";
  const URL="https://europe-west1-sport-505813.cloudfunctions.net/stravaBridge";
  let active=false,original=[],scheduled=0;
  const node=id=>document.getElementById(id);
  const html=`
    <div class="cg144-header"><div><p class="eyebrow">CGWEB144 · CONTRÔLE DES TOTAUX</p><h2>Statistiques · CGWEB / Strava</h2>
      <p class="muted">Comparaison indépendante sur une période calendaire, fuseau Europe/Paris. Aucune donnée modifiée.</p></div></div>
    <div class="cg144-controls">
      <label>Période<select id="cg144Period"><option value="week">Semaine</option><option value="month">Mois</option><option value="year" selected>Année</option></select></label>
      <label>Année<select id="cg144Year"></select></label>
      <label id="cg144MonthWrap" hidden>Mois<select id="cg144Month"></select></label>
      <label id="cg144WeekWrap" hidden>Semaine ISO<select id="cg144Week"></select></label>
      <label>Sport<select id="cg144Sport"><option value="all">Tous les sports</option><option value="run">Course / Trail</option><option value="bike">Vélo</option></select></label>
      <button type="button" id="cg144Compare" class="primary">Comparer les totaux</button>
    </div>
    <p class="muted" id="cg144Status">Sélectionne une période puis lance la comparaison.</p>
    <div id="cg144Results" hidden>
      <table class="cg144-table"><thead><tr><th>Indicateur</th><th>CGWEB</th><th>Strava</th><th>Écart Strava − CGWEB</th></tr></thead><tbody id="cg144Body"></tbody></table>
      <p id="cg144Coverage" class="muted"></p>
      <p class="muted">Les écarts peuvent notamment provenir d’activités non liées, de suppressions, de périodes différentes ou des calculs Strava. Une valeur indisponible n’est jamais assimilée à zéro.</p>
    </div>`;
  const css=`
    #${ROOT}{margin:10px 0 26px;padding:22px;border:1px solid #41582c;border-radius:17px;background:#101611;color:inherit}
    #${ROOT}[hidden]{display:none!important}
    #${ROOT} .cg144-header h2{margin:6px 0 10px}
    #${ROOT} .cg144-controls{display:flex;flex-wrap:wrap;align-items:end;gap:12px;margin:22px 0}
    #${ROOT} .cg144-controls label[hidden]{display:none!important}
    #${ROOT} .cg144-controls label{display:flex;flex-direction:column;gap:7px;font-size:.88rem;color:#d7e5c7}
    #${ROOT} select,#${ROOT} button{font:inherit;min-height:42px;padding:9px 12px;border-radius:10px;border:1px solid #45543c;background:#1b251b;color:#f5faef}
    #${ROOT} button.primary{background:#b8f323;color:#18200d;font-weight:bold;cursor:pointer}
    #${ROOT} button:disabled{opacity:.55;cursor:wait}
    #${ROOT} .cg144-table{width:100%;border-collapse:collapse;margin:20px 0}
    #${ROOT} .cg144-table th,#${ROOT} .cg144-table td{text-align:right;border-bottom:1px solid #35402c;padding:12px 9px;font-variant-numeric:tabular-nums}
    #${ROOT} .cg144-table th:first-child,#${ROOT} .cg144-table td:first-child{text-align:left}
    #${ROOT} .cg144-table .cg144-unavailable{color:#aeb9a6}
    #${ROOT} .cg144-table .cg144-diff{font-weight:600}
    @media(max-width:740px){#${ROOT}{overflow-x:auto;padding:12px}#${ROOT} .cg144-table{min-width:610px}}
    #${NAV}{margin-left:9px;padding:7px 15px;border:1px solid #6a8b35;border-radius:20px;background:#1b2516;color:#ebf7d9;cursor:pointer}
    #${NAV}.active{background:#bbf525;color:#18230b}
  `;
  function setSelectors(){
    const year=node("cg144Year");const thisYear=new Date().getFullYear();
    for(let y=Math.max(thisYear,2026);y>=2000;y--){const opt=document.createElement("option");opt.value=String(y);opt.textContent=String(y);year.append(opt)}
    year.value=String(thisYear);
    const month=node("cg144Month"),week=node("cg144Week");
    const names=["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
    names.forEach((s,i)=>month.add(new Option(s,String(i+1))));month.value=String(new Date().getMonth()+1);
    for(let w=1;w<=53;w++)week.add(new Option(`Semaine ${String(w).padStart(2,"0")}`,String(w)));
    const now=new Date(),jan4=new Date(Date.UTC(now.getFullYear(),0,4));
    const isoStart=jan4.getTime()-((jan4.getUTCDay()+6)%7)*86400000;
    const guess=Math.floor((Date.UTC(now.getFullYear(),now.getMonth(),now.getDate())-isoStart)/(7*86400000))+1;
    week.value=String(Math.max(1,Math.min(53,guess)));
    node("cg144Period").addEventListener("change",()=>{
      const p=node("cg144Period").value;
      node("cg144MonthWrap").hidden=p!=="month";
      node("cg144WeekWrap").hidden=p!=="week";
    });
    node("cg144Compare").addEventListener("click",()=>void compare());
  }
  const metricRows=[
    ["Activités","activities","int"],
    ["Distance","distance_m","km"],
    ["Temps en mouvement","moving_time_s","duration"],
    ["Temps écoulé","elapsed_time_s","duration"],
    ["Dénivelé positif","ascent_m","m"],
    ["Calories","calories","kcal"]
  ];
  const fmtNum=(n,dec=0)=>Number(n).toLocaleString("fr-FR",{minimumFractionDigits:dec,maximumFractionDigits:dec});
  const duration=n=>{
    const seconds=Math.round(Math.abs(n)); const h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60),s=seconds%60;
    return `${h} h ${String(m).padStart(2,"0")} min ${String(s).padStart(2,"0")} s`;
  };
  function fmt(n,kind){
    if(n===null||!Number.isFinite(n))return "—";
    if(kind==="duration")return duration(n);
    if(kind==="km")return fmtNum(n/1000,2)+" km";
    if(kind==="m")return fmtNum(n,1)+" m";
    if(kind==="kcal")return fmtNum(n,0)+" kcal";
    return fmtNum(n,0);
  }
  function draw(data){
    const tbody=node("cg144Body");tbody.replaceChildren();
    for(const [label,key,kind] of metricRows){
      const cv=key==="activities"?data.cgweb.activities:data.cgweb.metrics[key]?.value;
      const sv=key==="activities"?data.strava.activities:data.strava.metrics[key]?.value;
      const delta=Number.isFinite(cv)&&Number.isFinite(sv)?sv-cv:null;
      const cells=[label,fmt(cv,kind),fmt(sv,kind),delta===null?"—":`${delta>0?"+":delta<0?"−":""}${fmt(Math.abs(delta),kind)}`];
      const tr=document.createElement("tr");
      for(const [i,word] of cells.entries()){
        const cell=document.createElement("td");cell.textContent=word;
        if(word==="—")cell.className="cg144-unavailable";
        if(i===3)cell.classList.add("cg144-diff");tr.append(cell);
      }
      tbody.append(tr);
    }
    const gaps=[];
    for(const [label,key] of metricRows.slice(1)){
      const a=data.cgweb.metrics[key],b=data.strava.metrics[key];
      if(!a||!b)continue;
      if(a.available!==a.total||b.available!==b.total)gaps.push(`${label} : CGWEB ${a.available}/${a.total}, Strava ${b.available}/${b.total}`);
    }
    node("cg144Coverage").textContent=`${data.bounds.label} · ${data.bounds.time_zone} · ${data.linked_activities} activité(s) liées sur la période.`+
      (gaps.length?` Données incomplètes : ${gaps.join(" · ")}.`:" Toutes les statistiques affichées sont complètes.")+
      ` ${data.strava_calorie_detail_policy||""}`;
    node("cg144Results").hidden=false;
  }
  async function compare(){
    const b=node("cg144Compare"),status=node("cg144Status");b.disabled=true;
    node("cg144Results").hidden=true;status.textContent="Lecture Firestore et Strava en cours…";
    try{
      const user=window.SPORT_WEB_BRIDGE?.getUser?.();
      if(!user)throw new Error("Connexion SPORT Web nécessaire.");
      const token=await user.getIdToken();
      const body={period:node("cg144Period").value,year:Number(node("cg144Year").value),
        month:Number(node("cg144Month").value),week:Number(node("cg144Week").value),sport:node("cg144Sport").value};
      const response=await fetch(`${URL}?action=period_totals`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify(body)});
      const raw=await response.text();let result;try{result=JSON.parse(raw)}catch{result={error:raw.slice(0,350)}}
      if(!response.ok||!result?.ok)throw new Error(result?.error||`StravaBridge HTTP ${response.status}`);
      draw(result);status.textContent=`Comparaison terminée : ${result.cgweb.activities} activité(s) CGWEB et ${result.strava.activities} sur Strava.`;
    }catch(e){status.textContent=`Comparaison impossible : ${e?.message||e}`;}
    finally{b.disabled=false;}
  }
  function ensure(){
    if(node(ROOT))return;
    const catalog=node("catalogView");if(!catalog)return;
    const style=document.createElement("style");style.textContent=css;document.head.append(style);
    const panel=document.createElement("section");panel.id=ROOT;panel.className="panel";panel.hidden=true;
    panel.innerHTML=html;catalog.prepend(panel);setSelectors();
  }
  const onAnalysis=()=>{
    const button=document.querySelector('#uxPrimaryNav [data-ux-page="analysis"]');
    return !!button&&(button.classList.contains("active")||button.getAttribute("aria-current")==="page"||button.getAttribute("aria-selected")==="true");
  };
  function leave(){
    if(!active)return;active=false;
    for(const {el,display,priority} of original){
      if(display)el.style.setProperty("display",display,priority);else el.style.removeProperty("display");
    }
    original=[];const panel=node(ROOT);if(panel)panel.hidden=true;
    node(NAV)?.classList.remove("active");
  }
  function enter(){
    if(active||!onAnalysis())return;
    const parent=node("catalogView"),panel=node(ROOT);if(!parent||!panel)return;
    original=[];
    for(const el of parent.children){
      if(el===panel)continue;
      original.push({el,display:el.style.getPropertyValue("display"),priority:el.style.getPropertyPriority("display")});
      el.style.setProperty("display","none","important");
    }
    active=true;panel.hidden=false;node(NAV)?.classList.add("active");
  }
  function update(){
    ensure();const nav=node("uxSecondaryNav");if(!nav)return;
    if(!onAnalysis()){
      leave();const b=node(NAV);if(b)b.remove();return;
    }
    if(!node(NAV)){
      const button=document.createElement("button");button.type="button";button.id=NAV;button.textContent="Statistiques";
      button.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();enter()});
      nav.append(button);
    }
    if(nav.classList.contains("hidden"))nav.classList.remove("hidden");
  }
  document.addEventListener("click",event=>{
    if(!active)return;
    const target=event.target instanceof Element?event.target:null;
    if(target?.closest('#uxPrimaryNav [data-ux-page], #uxSecondaryNav button:not(#cgweb144StatsSubtab)'))leave();
  },true);
  const schedule=()=>{if(scheduled)return;scheduled=setTimeout(()=>{scheduled=0;update()},90)};
  function init(){
    update();const p=node("uxPrimaryNav"),s=node("uxSecondaryNav");
    const obs=new MutationObserver(schedule);
    if(p)obs.observe(p,{subtree:true,attributes:true,attributeFilter:["class","aria-current","aria-selected"]});
    if(s)obs.observe(s,{childList:true,attributes:true,attributeFilter:["class"]});
    document.addEventListener("click",schedule);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
  else init();
})();
