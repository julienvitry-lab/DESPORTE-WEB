'use strict';
/* CGWEB156 · GAP TRAIL V2 partagé, calcul à partir du tracé, sans extrapolation sur D+ total. */
const finite=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function ratio(pct){
 const g=clamp(pct,-35,35);
 if(g<0){const d=-g;return d<=4?1-.0075*d:d<=8?.97+.0075*(d-4):d<=20?1+.01*(d-8):d<=30?1.12+.013*(d-20):1.25;}
 const x=clamp(g/100,0,.25);
 const cost=155.4*x**5-30.4*x**4-43.3*x**3+46.3*x**2+19.5*x+3.6;
 return clamp(cost/3.6,.5,3);
}
function calculate(data){
 const ds=data?.distance_m,alts=data?.alt_m;
 const times=data?.time_ms||data?.timestamp_ms||data?.timestamps_ms||[];
 const speeds=data?.speed_mps||data?.enhanced_speed_mps||data?.speed||[];
 if(!Array.isArray(ds)||!Array.isArray(alts)||ds.length<2||alts.length<2)return null;
 const n=Math.min(ds.length,alts.length);
 const valid=[];
 for(let i=0;i<n;i++){const d=finite(ds[i]),a=finite(alts[i]);if(d!==null&&a!==null&&d>=0) valid.push({i,d,a});}
 if(valid.length<2)return null;
 const full=valid.at(-1).d-valid[0].d;if(full<=0)return null;
 let weighted=0,covered=0,intervals=0;
 for(let k=1;k<valid.length;k++){
  const prev=valid[k-1],cur=valid[k],dx=cur.d-prev.d;
  if(!(dx>1&&dx<=1000)||cur.i!==prev.i+1)continue;
  // Pente lissée sur une fenêtre centrée d'environ 120 mètres.
  let l=k,r=k;while(l>0&&cur.d-valid[l].d<60)l--;
  while(r<valid.length-1&&valid[r].d-cur.d<60)r++;
  const h=valid[r].d-valid[l].d;
  if(h<25)continue;
  const slope=clamp(100*(valid[r].a-valid[l].a)/h,-35,35);
  let speed=null;
  const t1=finite(times[prev.i]),t2=finite(times[cur.i]);
  if(t1!==null&&t2!==null&&t2>t1){const seconds=(t2-t1)/1000;
    if(seconds>0&&seconds<=300){const s=dx/seconds;if(s>=.35&&s<=12)speed=s;}}
  if(speed===null){const a=finite(speeds[cur.i]),b=finite(speeds[prev.i]);
   const candidates=[a,b].filter(s=>s!==null&&s>=.35&&s<=12);
   if(candidates.length)speed=candidates.reduce((x,y)=>x+y,0)/candidates.length;}
  if(speed===null)continue;
  const gap=1000/speed/ratio(slope);
  if(gap<30||gap>3600||!Number.isFinite(gap))continue;
  weighted+=gap*dx;covered+=dx;intervals++;
 }
 if(!intervals||covered/full<.7)return null;
 return {gap_sec_per_km:weighted/covered,covered_m:covered,coverage:covered/full,intervals,model:'GAP_TRAIL_V2'};
}
module.exports={calculate,ratio};
