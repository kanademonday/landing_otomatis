const C=require('../src/core.js');
let seed=7; const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
// jaringan jalan sintetis tak beraturan 3x3 km
const nodeXY=new Map(); const ways=[]; let nid=1;
const N=31, sp=100, grid=[];
for(let i=0;i<N;i++){grid[i]=[];for(let j=0;j<N;j++){const id=nid++;grid[i][j]=id;nodeXY.set(id,[i*sp-1500+(rnd()-.5)*50,j*sp-1500+(rnd()-.5)*50]);}}
for(let i=0;i<N;i++)for(let j=0;j<N-1;j++){ if(rnd()<0.75) ways.push({id:ways.length,name:'',nodes:[grid[i][j],grid[i][j+1]]}); }
for(let j=0;j<N;j++)for(let i=0;i<N-1;i++){ if(rnd()<0.75) ways.push({id:ways.length,name:j==15?'Jalan Merdeka':'',nodes:[grid[i][j],grid[i+1][j]]}); }
// truth
const T={s:0.35,th:25*C.DEG,tx:0,ty:0};
const P=nodeXY.get(grid[12][17]); // pusat sketsa di simpang
const R=130;
// sketsa: segmen OSM dalam radius R dari P
const roadsImg=[];
for(const w of ways){ const a=nodeXY.get(w.nodes[0]), b=nodeXY.get(w.nodes[1]);
  const pts=[];for(let k=0;k<=10;k++){const x=a[0]+(b[0]-a[0])*k/10,y=a[1]+(b[1]-a[1])*k/10; if(Math.hypot(x-P[0],y-P[1])<R) pts.push([x,y]);}
  if(pts.length>=2) roadsImg.push({name:w.name,pts:[pts[0],pts[pts.length-1]]});}
// world->math: set T so that sketch center maps to P: choose sketch image size
const W=900,H=800; const cMath=[W/2,-H/2];
const c=Math.cos(T.th)*T.s,s=Math.sin(T.th)*T.s; T.tx=P[0]-(c*cMath[0]-s*cMath[1]); T.ty=P[1]-(s*cMath[0]+c*cMath[1]);
for(const r of roadsImg) r.pts=r.pts.map(p=>{const m=C.invT(T,p[0],p[1]);return [m[0]+(rnd()-.5)*8,-m[1]+(rnd()-.5)*8];});
// parcel 20x30 m dekat pusat
const parcelW=[[P[0]+8,P[1]+8],[P[0]+28,P[1]+8],[P[0]+28,P[1]+38],[P[0]+8,P[1]+38]];
const parcelImg=parcelW.map(p=>{const m=C.invT(T,p[0],p[1]);return [m[0],-m[1]];});
const luas=600, Apx=C.polyArea(parcelImg), s0=Math.sqrt(luas/Apx);
console.log('roads',roadsImg.length,'s0',s0.toFixed(3),'true',T.s);
(async()=>{
 for(const north of [false,true]){
 const t0=Date.now();
 const ctx=C.prepareCtx({ways,nodeXY,roadsImg,parcelImg,imgW:W,imgH:H,s0,tau:12,inArea:null,log:(l,m)=>console.log(' ',l,m)});
 const out=await C.matchAll(ctx,{scales:[0.9,1,1.1].map(k=>k*s0),th0:north?20*C.DEG:null,thTol:30*C.DEG,bounds:{smin:s0*.8,smax:s0*1.2,th0:north?20*C.DEG:null,thTol:30*C.DEG}},null,(l,m)=>console.log(' ',l,m));
 const pc=ctx.parcelC, truth=C.fwdT(T,pc[0],pc[1]);
 out.forEach((o,i)=>{const p=C.fwdT(o.T,pc[0],pc[1]);console.log(i,'score',o.r.score.toFixed(3),'err m',Math.hypot(p[0]-truth[0],p[1]-truth[1]).toFixed(1),'th',(o.T.th/C.DEG).toFixed(1),'s',o.T.s.toFixed(3),'within',o.r.within.toFixed(2));});
 console.log('time',Date.now()-t0,'ms');}
})();
