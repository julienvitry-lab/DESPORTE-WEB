/* CGWEB155 · Analyse > Statistiques : 2026 => 12 mois, mois => semaines ISO chevauchantes.
 * Une seule requête / sélection, aucun FIT/Firestore/Strava modifié. */
(() => {
  "use strict";
  const ROOT="cgweb144StatsPanel",NAV="cgweb144StatsSubtab";
  const URL="https://europe-west1-sport-505813.cloudfunctions.net/stravaBridge";
  const MONTHS=["Tous les mois","Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
  let active=false,original=[],scheduled=0,requestId=0,debounce=0,initialised=false;
  const node=id=>document.getElementById(id);
  const html=`
  <div class="cg155-head"><div><p class="eyebrow">ANALYSE · STATISTIQUES</p><h2>Statistiques par mois et par semaine</h2>
     <p class="muted">Une année affiche ses 12 mois ; un mois affiche les semaines qui le traversent. Périodes Europe/Paris, du lundi au dimanche.</p></div></div>
  <div class="cg155-controls">
    <label>Année<select id="cg144Year" aria-label="Année"></select></label>
    <label>Mois<select id="cg144Month" aria-label="Mois"></select></label>
    <label>Sport<select id="cg144Sport" aria-label="Sport"><option value="all">Tous les sports</option><option value="run">Course / Trail</option><option value="bike">Vélo</option></select></label>
    <button type="button" id="cg144Compare" class="secondary">Actualiser</button>
  </div>
  <p id="cg144Status" class="muted cg155-status" role="status" aria-live="polite">Données à charger.</p>
  <div class="cg155-explain"><span><b>CGWEB</b> : enregistrement local</span><span><b>STRAVA</b> : données relues séparément</span>
    <span><b>—</b> : donnée indisponible ou incomplète</span></div>
  <div class="cg155-overflow"><table class="cg155-table">
    <thead><tr><th id="cg155PeriodHeader">Mois</th><th>Activités</th><th>Distance totale</th><th>Temps total <small>actif / écoulé</small></th>
      <th>Dénivelé positif</th><th id="cg155SpeedHeader">Vitesse moyenne</th><th>GAP course</th><th>Calories</th></tr></thead>
    <tbody id="cg144Body"></tbody><tfoot id="cg155Foot"></tfoot>
  </table></div>
  <p class="muted cg155-footer" id="cg144Coverage">Le temps total correspond au temps en mouvement ; la moyenne est calculée sur les distances et durées cumulées, jamais comme une moyenne simple des activités.</p>
  <p class="muted cg155-footer" id="cg155Notes"></p>`;
  const css=`
    #${ROOT}{margin:8px auto 28px;padding:18px 22px;max-width:1500px;border:1px solid #41582c;border-radius:15px;background:#101611;color:inherit}
    #${ROOT}[hidden]{display:none!important}
    #${ROOT} h2{margin:5px 0 10px;font-size:1.27rem}
    #${ROOT} .cg155-controls{display:flex;gap:12px;flex-wrap:wrap;align-items:end;margin:17px 0 13px}
    #${ROOT} .cg155-controls label{display:flex;flex-direction:column;gap:6px;color:#d7e5c7;font-size:.88rem}
    #${ROOT} select,#${ROOT} .cg155-controls button{min-height:38px;padding:7px 11px;border-radius:9px;font:inherit}
    #${ROOT} select{color:#f3faee;background:#1c251c;border:1px solid #485a3c}
    #${ROOT} .cg155-controls button{cursor:pointer;border:1px solid #758c5d;color:#f3faee;background:#1d291d}
    #${ROOT} .cg155-controls button:disabled{opacity:.55}
    #${ROOT} .cg155-explain{display:flex;gap:16px;flex-wrap:wrap;color:#aebeac;font-size:.75rem;margin:10px 0 7px}
    #${ROOT} .cg155-explain b{color:#ddf4cc}
    #${ROOT} .cg155-overflow{overflow:auto;max-width:100%}
    #${ROOT} .cg155-table{width:100%;border-collapse:collapse;min-width:940px;font-variant-numeric:tabular-nums}
    #${ROOT} .cg155-table th{color:#d2e2c8;font-size:.77rem;font-weight:600;border-bottom:1px solid #5a6b4b;padding:11px 8px;text-align:right;white-space:nowrap}
    #${ROOT} .cg155-table th small{display:block;font-weight:400;font-size:.66rem;opacity:.65}
    #${ROOT} .cg155-table th:first-child{text-align:left;position:sticky;left:0;background:#101611;z-index:1}
    #${ROOT} .cg155-table td{border-bottom:1px solid #364331;padding:9px 8px;text-align:right;vertical-align:middle}
    #${ROOT} .cg155-table td:first-child{text-align:left;font-weight:700;white-space:nowrap;position:sticky;left:0;background:#101611;z-index:1}
    #${ROOT} .cg155-table tr:hover td{background:#182318}
    #${ROOT} .cg155-table tfoot td{border-top:2px solid #779b50;background:#1b2719;font-weight:700}
    #${ROOT} .cg155-pair{display:flex;flex-direction:column;align-items:flex-end;gap:4px;white-space:nowrap}
    #${ROOT} .cg155-source{font-size:.67rem;letter-spacing:.02em;opacity:.65;margin-right:7px}
    #${ROOT} .cg155-pair .cg155-elapsed{display:block;font-size:.67rem;font-weight:400;opacity:.7;margin-top:2px}
    #${ROOT} .cg155-pair .strava{color:#c9d8c3;font-size:.82rem}
    #${ROOT} .cg155-pair .cgweb{color:#f0f8eb;font-size:.88rem}
    #${ROOT} .cg155-unavailable{opacity:.65}
    #${ROOT} .cg155-footer{font-size:.78rem;line-height:1.65;margin:10px 0 0}
    #${ROOT} .cg155-status{margin:8px 0;font-size:.83rem}
    @media(max-width:800px){#${ROOT}{padding:12px;margin:6px 0}#${ROOT} .cg155-table{min-width:950px}}
  `;
  const format=(n,d=0)=>Number(n).toLocaleString('fr-FR',{minimumFractionDigits:d,maximumFractionDigits:d});
  function duration(sec){if(!Number.isFinite(sec))return '—';const n=Math.round(sec),h=Math.floor(n/3600),m=Math.floor((n%3600)/60);return h?`${h} h ${String(m).padStart(2,'0')}`:`${m} min ${String(n%60).padStart(2,'0')} s`;}
  function val(group,key,kind,sport){
    if(!group)return '—';
    if(key==='activities')return format(group.activities);
    if(kind==='speed')return sport==='run'?formatPace(group.metrics?.average_pace_sec_per_km?.value):
      Number.isFinite(group.metrics?.average_speed_kmh?.value)?format(group.metrics.average_speed_kmh.value,2)+' km/h':'—';
    const n=group.metrics?.[key]?.value;
    if(!Number.isFinite(n))return '—';
    if(kind==='km')return format(n/1000,2)+' km';
    if(kind==='duration')return duration(n);
    if(kind==='m')return format(n,0)+' m';
    if(kind==='cal')return format(n)+' kcal';
    if(kind==='gap')return sport==='bike'?'—':formatPace(n);
    return format(n);
  }
  function formatPace(n){if(!Number.isFinite(n)||n<=0)return '—';const s=Math.round(n);return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}/km`;}
  const columns=[['activities','int'],['distance_m','km'],['moving_time_s','duration'],['ascent_m','m'],['speed','speed'],['gap_sec_per_km','gap'],['calories','cal']];
  function cellPair(cgweb,strava,key,kind,sport){
    const td=document.createElement('td'),div=document.createElement('div');div.className='cg155-pair';
    for(const [label,obj,cls] of [['CG',cgweb,'cgweb'],['ST',strava,'strava']]){
      const line=document.createElement('div');line.className=cls;
      const b=document.createElement('span');b.className='cg155-source';b.textContent=label;
      const s=document.createElement('span');const v=val(obj,key,kind,sport);s.textContent=v;if(v==='—')s.className='cg155-unavailable';
      line.append(b,s);
      if(kind==='duration'){const extra=document.createElement('small');extra.className='cg155-elapsed';extra.textContent=`écoulé : ${val(obj,'elapsed_time_s','duration',sport)}`;line.append(extra);}
      div.append(line);
    }
    td.append(div);return td;
  }
  function draw(rows,totals,sport,mode){
    const tbody=node('cg144Body'),tfoot=node('cg155Foot');tbody.replaceChildren();tfoot.replaceChildren();
    node('cg155PeriodHeader').textContent=mode==='weeks'?'Semaines du mois':'Mois';
    node('cg155SpeedHeader').textContent=sport==='run'?'Allure moyenne':'Vitesse moyenne';
    for(const data of rows){const tr=document.createElement('tr'),label=document.createElement('td');label.textContent=data.label;tr.append(label);
      for(const [key,kind] of columns)tr.append(cellPair(data.cgweb,data.strava,key,kind,sport));tbody.append(tr);}
    if(totals){const tr=document.createElement('tr'),label=document.createElement('td');label.textContent=mode==='weeks'?'TOTAL MOIS':'TOTAL ANNÉE';tr.append(label);
      for(const [key,kind] of columns)tr.append(cellPair(totals.cgweb,totals.strava,key,kind,sport));tfoot.append(tr);}
  }
  function skeleton(){const year=Number(node('cg144Year')?.value||2026),month=Number(node('cg144Month')?.value||0);
    const rows=month?[]:MONTHS.slice(1).map(label=>({label,cgweb:null,strava:null}));
    draw(rows,null,node('cg144Sport')?.value||'all',month?'weeks':'months');}
  async function refresh(){
    if(!active)return;const my=++requestId,b=node('cg144Compare'),status=node('cg144Status');b.disabled=true;
    status.textContent='Chargement des statistiques CGWEB et Strava…';
    try{
      const user=window.SPORT_WEB_BRIDGE?.getUser?.();if(!user)throw new Error('Connecte-toi à SPORT Web pour lire les statistiques.');
      const token=await user.getIdToken();const selectedMonth=node('cg144Month').value;
      const body={year:Number(node('cg144Year').value),month:selectedMonth?Number(selectedMonth):null,sport:node('cg144Sport').value};
      const res=await fetch(`${URL}?action=period_breakdown`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
      const raw=await res.text();let data;try{data=JSON.parse(raw);}catch{data={error:raw.slice(0,300)};}
      if(my!==requestId||!active)return;
      if(!res.ok||!data?.ok)throw new Error(data?.error||`HTTP ${res.status}`);
      draw(data.rows,data.totals,body.sport,data.mode);
      const n=data.rows.length,kind=data.mode==='weeks'?'semaine(s) du mois':'mois';
      status.textContent=`${body.year}${selectedMonth?' · '+MONTHS[Number(selectedMonth)]:''} · ${n} ${kind} · ${data.totals.cgweb.activities} activités CGWEB / ${data.totals.strava.activities} Strava.`;
      node('cg144Coverage').textContent='Temps total : valeur principale = temps en mouvement ; valeur secondaire = temps écoulé. Allure/vitesse = rapport des totaux, jamais moyenne simple. Les semaines ne comptent que les jours du mois sélectionné.';
      node('cg155Notes').textContent=(body.sport==='bike'?'GAP non applicable au vélo. ':data.gap_note+' ')+data.calorie_note;
    }catch(e){if(my===requestId){status.textContent=`Statistiques indisponibles : ${e?.message||e}`;node('cg155Notes').textContent='Aucun chiffre partiel n’a été présenté comme complet.';}}
    finally{if(my===requestId)b.disabled=false;}
  }
  function scheduleRefresh(){clearTimeout(debounce);debounce=setTimeout(()=>{if(active)void refresh();},120);}
  function setup(){const year=node('cg144Year');for(let y=Math.max(new Date().getFullYear(),2026);y>=2000;y--)year.add(new Option(String(y),String(y)));
    year.value='2026';const month=node('cg144Month');MONTHS.forEach((name,i)=>month.add(new Option(name,i===0?'':String(i))));month.value='';
    for(const id of ['cg144Year','cg144Month','cg144Sport'])node(id).addEventListener('change',()=>{skeleton();scheduleRefresh();});
    node('cg144Compare').addEventListener('click',()=>void refresh());skeleton();}
  function ensure(){if(node(ROOT))return;const catalog=node('catalogView');if(!catalog)return;
    const style=document.createElement('style');style.textContent=css;document.head.append(style);
    const panel=document.createElement('section');panel.id=ROOT;panel.className='panel';panel.hidden=true;panel.innerHTML=html;catalog.prepend(panel);
    setup();}
  const onAnalysis=()=>document.body?.dataset.uxPage==='analysis'||!!document.querySelector('#uxPrimaryNav [data-ux-page="analysis"].active');
  function leave(){if(!active)return;active=false;requestId++;clearTimeout(debounce);
    for(const {el,display,priority} of original){if(display)el.style.setProperty('display',display,priority);else el.style.removeProperty('display');}
    original=[];node(ROOT).hidden=true;node(NAV)?.classList.remove('active');}
  function enter(){if(active||!onAnalysis())return;const catalog=node('catalogView'),panel=node(ROOT);if(!catalog||!panel)return;
    original=[];for(const el of catalog.children){if(el===panel)continue;
      original.push({el,display:el.style.getPropertyValue('display'),priority:el.style.getPropertyPriority('display')});
      el.style.setProperty('display','none','important');}
    active=true;panel.hidden=false;node(NAV)?.classList.add('active');
    document.querySelectorAll('#uxSecondaryNav .ux-subnav-button:not(#cgweb144StatsSubtab)').forEach(b=>b.classList.remove('active'));
    void refresh();}
  function update(){ensure();const nav=node('uxSecondaryNav');if(!nav)return;
    if(!onAnalysis()){leave();node(NAV)?.remove();return;}
    const container=nav.querySelector('.ux-secondary-nav-inner')||nav;
    let button=node(NAV);
    if(!button){button=document.createElement('button');button.type='button';button.id=NAV;button.className='ux-subnav-button';button.textContent='Statistiques';
      button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();enter();});}
    if(container.firstElementChild!==button)container.prepend(button);
    button.classList.toggle('active',active);
    if(nav.classList.contains('hidden'))nav.classList.remove('hidden');
  }
  const schedule=()=>{if(scheduled)return;scheduled=setTimeout(()=>{scheduled=0;update();},90);};
  function init(){if(initialised)return;initialised=true;update();const obs=new MutationObserver(schedule);
    for(const id of ['uxPrimaryNav','uxSecondaryNav']){const el=node(id);if(el)obs.observe(el,{childList:true,subtree:true,attributes:true,attributeFilter:['class','aria-current','aria-selected']});}
    document.addEventListener('click',event=>{const target=event.target instanceof Element?event.target:null;
      if(active&&target?.closest('#uxPrimaryNav [data-ux-page], #uxSecondaryNav button:not(#cgweb144StatsSubtab)'))leave();
      schedule();},true);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
