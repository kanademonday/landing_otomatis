const C=require('../../src/core.js'); const fs=require('fs');
let seed=11; const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
const proj=C.makeProj(-0.49,117.15);
const N=25,sp=110,grid=[],nodes={},ways=[];let nid=1000;
for(let i=0;i<N;i++){grid[i]=[];for(let j=0;j<N;j++){const id=nid++;grid[i][j]=id;nodes[id]=[i*sp-1300+(rnd()-.5)*60,j*sp-1300+(rnd()-.5)*60];}}
for(let i=0;i<N;i++)for(let j=0;j<N-1;j++) if(rnd()<0.7) ways.push({id:ways.length+1,nodes:[grid[i][j],grid[i][j+1]],tags:{highway:'residential',name:i==10?'Jalan Pahlawan':undefined}});
for(let j=0;j<N;j++)for(let i=0;i<N-1;i++) if(rnd()<0.7) ways.push({id:ways.length+5000,nodes:[grid[i][j],grid[i+1][j]],tags:{highway:'residential'}});
const els=[];for(const w of ways) els.push({type:'way',id:w.id,nodes:w.nodes,tags:w.tags});
for(const id in nodes){const ll=proj.inv(...nodes[id]);els.push({type:'node',id:+id,lat:ll[0],lon:ll[1]});}
fs.writeFileSync('tests/e2e/overpass.json',JSON.stringify({elements:els}));
const ring=[[-1400,-1400],[1400,-1400],[1400,1400],[-1400,1400],[-1400,-1400]].map(p=>{const l=proj.inv(p[0],p[1]);return [l[1],l[0]];});
fs.writeFileSync('tests/e2e/nominatim.json',JSON.stringify([{osm_type:'relation',osm_id:1,name:'Contoh',display_name:'Contoh, Kec Uji, Kota Uji',lat:'-0.49',lon:'117.15',category:'boundary',type:'administrative',geojson:{type:'Polygon',coordinates:[ring]}}]));
// sketsa
const T={s:0.3,th:-35*C.DEG,tx:0,ty:0};const P=nodes[grid[10][14]];const W=1000,H=800;
const cM=[W/2,-H/2];const c=Math.cos(T.th)*T.s,s=Math.sin(T.th)*T.s;T.tx=P[0]-(c*cM[0]-s*cM[1]);T.ty=P[1]-(s*cM[0]+c*cM[1]);
const roads=[];
for(const w of ways){const a=nodes[w.nodes[0]],b=nodes[w.nodes[1]];const pts=[];for(let k=0;k<=20;k++){const x=a[0]+(b[0]-a[0])*k/20,y=a[1]+(b[1]-a[1])*k/20;const m=C.invT(T,x,y);if(m[0]>20&&m[0]<W-20&&-m[1]>20&&-m[1]<H-20)pts.push([m[0],-m[1]]);}
 if(pts.length>=2)roads.push({name:(w.tags.name||''),pts:[pts[0],pts[pts.length-1]]});}
const pw=[[P[0]+10,P[1]+10],[P[0]+35,P[1]+10],[P[0]+35,P[1]+30],[P[0]+10,P[1]+30]];
const parcel=pw.map(p=>{const m=C.invT(T,p[0],p[1]);return [m[0],-m[1]];});
const truth=proj.inv(...C.centroid(pw));
fs.writeFileSync('tests/e2e/sketch.json',JSON.stringify({W,H,roads,parcel,luas:500,truth}));
console.log('roads',roads.length,'truth',truth);
