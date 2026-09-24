/* Fashion Inspo Libraries — layered avatar renderer.
 *
 * Draws a full-body avatar and every equipped piece as its own vector layer:
 * garment shape comes from the piece type (blazer, bomber, knit polo, wide
 * trousers, Chelsea boots…), with its own colour, pattern, fit, length and
 * construction details. Any piece from any catalogue can be combined with any
 * other, like a character creator. Output is a plain SVG string, so it works
 * in the page, in thumbnails, and for anyone using the public API.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else{root.FIL=root.FIL||{};root.FIL.avatar=api}
})(typeof self!=='undefined'?self:this,function(){
  'use strict';
  let uid=0;
  const SKINS=['#f2d6c1','#e4bb9c','#c9966f','#a8714c','#7e5136','#583726'];
  const HAIRS=['#1f1a17','#3f2c21','#6f4f35','#a8845a','#8d8b88'];
  const HAIR_STYLES=['crop','side','wave'];

  // ---------------------------------------------------------------- colour helpers
  const hexRGB=hex=>{const n=parseInt(String(hex).replace('#',''),16);return[n>>16&255,n>>8&255,n&255]};
  const rgbHex=c=>'#'+c.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
  const shade=(hex,amt)=>{const c=hexRGB(hex),t=amt<0?0:255,p=Math.abs(amt);return rgbHex(c.map(v=>v+(t-v)*p))};
  const lum=hex=>{const [r,g,b]=hexRGB(hex);return(.299*r+.587*g+.114*b)/255};
  const contrastLine=hex=>lum(hex)>.55?shade(hex,-.3):shade(hex,.28);

  // ---------------------------------------------------------------- path helpers
  // Smooth closed path through midpoints; repeat a point to make a sharp corner.
  const smooth=pts=>{
    const n=pts.length,mid=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2],f=v=>Math.round(v*10)/10;
    let m=mid(pts[n-1],pts[0]),d=`M${f(m[0])},${f(m[1])}`;
    for(let i=0;i<n;i++){const p=pts[i],q=pts[(i+1)%n],mm=mid(p,q);d+=`Q${f(p[0])},${f(p[1])} ${f(mm[0])},${f(mm[1])}`}
    return d+'Z';
  };
  const poly=pts=>'M'+pts.map(p=>`${Math.round(p[0]*10)/10},${Math.round(p[1]*10)/10}`).join('L')+'Z';
  const mirrorPt=([x,y])=>[400-x,y];
  // left-half outline (top centre → bottom centre) mirrored into a full outline
  const sym=left=>left.concat(left.slice().reverse().map(mirrorPt));
  const mirrorList=pts=>pts.map(mirrorPt);

  function render(outfit={},opts={}){
    const id=`fa${++uid}`;
    const slots=outfit.slots||{};
    const colours=outfit.colours||{};
    const av={skin:0,hair:0,hairStyle:'side',build:1,...(outfit.avatar||{})};
    const b=Math.max(.86,Math.min(1.18,Number(av.build)||1));
    const X=x=>200+(x-200)*b;
    const S=pts=>pts.map(([x,y])=>[X(x),y]);
    const tuck=outfit.tuck!==false,open=outfit.open!==false;
    const defs=[];let pat=0;
    const skin=typeof av.skin==='number'?SKINS[av.skin]||SKINS[0]:av.skin||SKINS[0];
    const hair=typeof av.hair==='number'?HAIRS[av.hair]||HAIRS[0]:av.hair||HAIRS[0];
    const colourOf=p=>{const o=colours[p.id];return(o&&opts.palette&&opts.palette[o]?opts.palette[o].hex:null)||(p.colour&&p.colour.hex)||'#9a9b9e'};
    defs.push(`<linearGradient id="${id}-shade" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".2"/><stop offset=".22" stop-color="#000" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".07"/><stop offset=".78" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".2"/></linearGradient>`);
    defs.push(`<linearGradient id="${id}-drop" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></linearGradient>`);
    const pattern=(kind,base)=>{
      if(!kind)return null;
      const pid=`${id}-p${++pat}`,line=contrastLine(base);
      const P=(w,h,body,extra='')=>defs.push(`<pattern id="${pid}" width="${w}" height="${h}" patternUnits="userSpaceOnUse"${extra}>${body}</pattern>`);
      if(kind==='stripe')P(10,11,`<rect y="0" width="10" height="4" fill="${lum(base)>.55?'#23324a':'#f2efe6'}" opacity=".85"/>`);
      else if(kind==='check')P(16,16,`<path d="M0 0H16M0 8H16" stroke="${line}" stroke-width="1.4" opacity=".55"/><path d="M0 0V16M8 0V16" stroke="${line}" stroke-width="1.4" opacity=".45"/>`);
      else if(kind==='herringbone')P(10,8,`<path d="M0 0L5 4L10 0M0 8L5 4L10 8" fill="none" stroke="${line}" stroke-width=".8" opacity=".35"/>`);
      else if(kind==='cable')P(22,26,`<path d="M6 0C12 6 12 7 6 13C0 19 0 20 6 26M16 0C22 6 22 7 16 13C10 19 10 20 16 26" fill="none" stroke="${line}" stroke-width="1.6" opacity=".45"/>`);
      else if(kind==='rib'||kind==='knit')P(4.5,10,`<path d="M1 0V10" stroke="${line}" stroke-width="1" opacity="${kind==='rib'?.35:.18}"/>`);
      else if(kind==='cord')P(3.4,10,`<path d="M1 0V10" stroke="${line}" stroke-width="1.2" opacity=".32"/>`);
      else if(kind==='denim')P(4,4,`<path d="M0 4L4 0" stroke="${shade(base,.35)}" stroke-width=".7" opacity=".4"/>`);
      else if(kind==='linen')P(40,9,`<path d="M0 3H14M20 3H34M6 7H26" stroke="${line}" stroke-width=".7" opacity=".22"/>`);
      else if(kind==='channel')P(40,34,`<path d="M0 33H40" stroke="${line}" stroke-width="1.6" opacity=".75"/><rect width="40" height="12" y="1" fill="#fff" opacity=".08"/>`);
      else if(kind==='diamond')P(24,24,`<path d="M0 0L24 24M24 0L0 24" stroke="${line}" stroke-width="1" opacity=".6"/>`);
      else if(kind==='braid')P(6,6,`<path d="M0 6L6 0M-1 1L1 -1M5 7L7 5" stroke="${shade(base,-.35)}" stroke-width="1.4" opacity=".7"/>`);
      else return null;
      return pid;
    };
    const layers=[];
    // A garment part: base fill, optional pattern and volume shading, outline.
    const part=(d,fill,{pat:pk=null,shadeOn=true,stroke=null,sw=1.3,cls=''}={})=>{
      const pid=pattern(pk,fill);
      return`<path d="${d}" fill="${fill}" stroke="${stroke||shade(fill,-.32)}" stroke-width="${sw}" stroke-linejoin="round"${cls?` class="${cls}"`:''}/>`+
        (pid?`<path d="${d}" fill="url(#${pid})"/>`:'')+(shadeOn?`<path d="${d}" fill="url(#${id}-shade)"/>`:'');
    };
    const line=(d,col,w=1.2,o=1,extra='')=>`<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" opacity="${o}"${extra}/>`;
    const dot=(x,y,r,col,stroke)=>`<circle cx="${X(x)}" cy="${y}" r="${r}" fill="${col}"${stroke?` stroke="${stroke}" stroke-width=".8"`:''}/>`;

    // ---------------------------------------------------------------- body
    const bodyParts=[];
    const torso=S(sym([[200,158],[186,158],[164,163],[140,172],[130,182],[128,196],[139,250],[144,306],[150,450],[146,505],[200,552]]));
    const armL=S([[140,172],[124,184],[114,214],[108,336],[99,466],[99,466],[121,468],[121,468],[129,338],[143,262],[146,236]]);
    const legL=S([[146,498],[148,560],[154,722],[163,902],[190,902],[192,722],[198,560],[200,552],[186,520]]);
    const footL=S([[160,898],[191,898],[194,926],[193,946],[160,952],[147,947],[150,928]]);
    const neck=[[X(186),118],[X(214),118],[X(216),166],[X(184),166]];
    bodyParts.push(smooth(torso),smooth(armL),smooth(mirrorList(armL)),smooth(legL),smooth(mirrorList(legL)),smooth(footL),smooth(mirrorList(footL)),poly(neck));
    const skinLine=shade(skin,-.28);
    let body=`<g class="av-body">`+bodyParts.map(d=>`<path d="${d}" fill="${skinLine}" stroke="${skinLine}" stroke-width="3" stroke-linejoin="round"/>`).join('')+bodyParts.map(d=>`<path d="${d}" fill="${skin}"/>`).join('');
    body+=`<ellipse cx="${X(110)}" cy="492" rx="12.5" ry="24" fill="${skin}" stroke="${skinLine}" stroke-width="1.2"/><ellipse cx="${X(290)}" cy="492" rx="12.5" ry="24" fill="${skin}" stroke="${skinLine}" stroke-width="1.2"/>`;
    body+=`<path d="${smooth(sym([[200,462],[147,462],[143,530],[146,598],[196,598],[200,572]]).map(([x,y])=>[X(x),y]))}" fill="#3a3c3f" stroke="#26282a" stroke-width="1.2"/><path d="M${X(147)},470H${X(253)}" stroke="#55585c" stroke-width="5"/>`;
    // head
    body+=`<ellipse cx="166" cy="98" rx="5.5" ry="9.5" fill="${skin}" stroke="${skinLine}" stroke-width="1"/><ellipse cx="234" cy="98" rx="5.5" ry="9.5" fill="${skin}" stroke="${skinLine}" stroke-width="1"/>`;
    body+=`<ellipse cx="200" cy="93" rx="33.5" ry="42" fill="${skin}" stroke="${skinLine}" stroke-width="1.2"/><path d="M${X(186)},128 Q200,142 ${X(214)},128" fill="none" stroke="${skinLine}" stroke-width="1" opacity=".5"/>`;
    const hairD={crop:'M166,88 Q165,52 200,48 Q236,50 235,88 Q232,70 222,64 Q200,58 178,64 Q168,70 166,88 Z',side:'M165,92 Q158,50 196,45 Q242,44 237,90 Q233,66 214,60 L186,63 Q170,70 165,92 Z',wave:'M163,94 Q154,46 200,40 Q246,44 238,94 Q236,62 221,57 Q206,66 190,57 Q170,62 163,94 Z'}[av.hairStyle]||'';
    body+=`<path d="${hairD}" fill="${hair}" stroke="${shade(hair,-.3)}" stroke-width="1"/><path d="M166,86 L169,106 M234,86 L231,106" stroke="${hair}" stroke-width="4" stroke-linecap="round"/>`;
    if(av.hairStyle==='side')body+=line('M186,63 Q190,52 204,48',shade(hair,.18),1.2,.8);
    const featureCol=shade(skin,-.55);
    body+=`<path d="M181,85 Q188,82 194,85 M206,85 Q212,82 219,85" stroke="${shade(hair,.05)}" stroke-width="2.2" fill="none" stroke-linecap="round"/><ellipse cx="187.5" cy="95" rx="3.2" ry="2.3" fill="#2a2320"/><ellipse cx="212.5" cy="95" rx="3.2" ry="2.3" fill="#2a2320"/>`;
    body+=line('M200,97 Q196.5,108 199.5,111.5 Q203,112 205,109.5',featureCol,1.3,.6)+line('M191,121 Q200,125.5 209,121',shade(skin,-.4),1.6,.8)+`</g>`;
    layers.push(`<ellipse cx="200" cy="962" rx="${88*b}" ry="11" fill="#000" opacity=".09"/>`,body);

    // ---------------------------------------------------------------- shoes
    const shoes=slots.shoes;
    const drawShoe=p=>{
      const col=colourOf(p),dark=shade(col,-.4),out=[];
      const foot=(pts,mirror)=>mirror?mirrorList(pts):pts;
      for(const m of[false,true]){
        const F=pts=>S(foot(pts,m));
        if(p.type==='sandal'){
          out.push(part(smooth(F([[146,946],[196,944],[197,954],[147,957]])),shade(col,-.15),{shadeOn:false}));
          out.push(part(poly(F([[153,912],[192,910],[193,918],[152,920]])),col,{shadeOn:false}),part(poly(F([[150,930],[195,928],[195,936],[149,938]])),col,{shadeOn:false}));
          continue;
        }
        const boot=p.type==='chelsea'||p.type==='boot';
        const sneaky=p.type==='sneaker'||p.type==='canvas';
        if(boot)out.push(part(smooth(F([[158,858],[192,858],[193,902],[157,902]])),col));
        const upper=sneaky?[[157,898],[193,898],[197,924],[197,944],[158,950],[145,944],[148,924]]:[[158,900],[192,900],[196,926],[195,946],[160,952],[146,947],[149,928]];
        out.push(part(smooth(F(upper)),col,{pat:p.type==='canvas'?'linen':null}));
        if(sneaky){
          out.push(part(smooth(F([[144,938],[198,936],[199,955],[145,959]])),'#f3f1ec',{shadeOn:false,stroke:'#c9c5bc'}));
          out.push(line(poly(F([[166,910],[186,908]])).replace('Z',''),dark,1.2,.7),line(poly(F([[164,918],[188,916]])).replace('Z',''),dark,1.2,.7));
          if(/retro|sport/i.test(p.name))out.push(line(poly(F([[150,934],[176,922],[194,930]])).replace('Z',''),shade(col,lum(col)>.6?-.45:.4),2.4,.9));
        }else{
          out.push(part(smooth(F([[145,944],[196,942],[197,955],[146,958]])),boot&&p.type==='boot'?shade(col,-.55):dark,{shadeOn:false}));
          if(p.type==='loafer')out.push(line(poly(F([[156,916],[192,914]])).replace('Z',''),dark,2,.8));
          if(p.type==='derby'||p.type==='boot')out.push(line(poly(F([[168,906],[184,904]])).replace('Z',''),dark,1.2,.8),line(poly(F([[167,914],[186,912]])).replace('Z',''),dark,1.2,.8));
          if(p.type==='boat')out.push(line(poly(F([[152,926],[172,908],[192,912]])).replace('Z',''),'#efe9dc',1.3,.9));
          if(p.type==='chelsea')out.push(part(poly(F([[186,862],[191,862],[192,900],[187,900]])),shade(col,-.3),{shadeOn:false}));
          if(p.type==='espadrille')out.push(part(smooth(F([[145,942],[197,940],[198,955],[146,958]])),'#c9ad84',{shadeOn:false,pat:'cord'}));
        }
      }
      return`<g class="av-piece av-shoes" data-slot="shoes">${out.join('')}</g>`;
    };

    // ---------------------------------------------------------------- bottoms
    const FITS={slim:[158,191,165,189],regular:[155,194,161,192],straight:[153,195,157,194],relaxed:[150,197,153,196],wide:[146,198,146,198],barrel:[144,198,160,193]};
    const drawBottom=p=>{
      const col=colourOf(p),dark=shade(col,-.34),out=[];
      const [kO,kI,hO,hI]=FITS[p.fit]||FITS.regular;
      const shortLen=p.length==='shorts'?648:p.length==='bermuda'?700:null;
      const hemY=shortLen||(p.length==='ankle'?888:918);
      const left=shortLen?[[200,448],[151,448],[146,470],[142,510],[144,hemY],[144,hemY],[198,hemY],[198,hemY],[199,565],[200,560]]
        :[[200,448],[151,448],[146,470],[142,510],[kO,722],[hO,hemY],[hO,hemY],[hI,hemY],[hI,hemY],[kI,722],[199,565],[200,560]];
      const d=smooth(S(sym(left)));
      out.push(part(d,col,{pat:p.pattern==='cord'?'cord':p.pattern==='herringbone'?'herringbone':p.material==='denim'?'denim':p.material==='linen'?'linen':p.pattern==='check'?'check':null}));
      out.push(part(poly(S([[151,448],[249,448],[250,468],[150,468]])),shade(col,-.08),{shadeOn:false}));
      if(!p.drawstring)for(const x of[162,184,216,238])out.push(`<rect x="${X(x)-2}" y="447" width="4" height="20" rx="1.5" fill="${shade(col,-.12)}" stroke="${dark}" stroke-width=".6"/>`);
      else out.push(line(`M${X(196)},468 q-4 18 -2 34 M${X(204)},468 q4 18 2 34`,shade(col,.45),1.6,.9));
      out.push(line(`M${X(200)},470 Q${X(204)},520 ${X(197)},548`,dark,1.1,.7));
      const legC=shortLen?171:(kO+kI)/2,legCR=400-legC;
      if(p.crease)out.push(line(`M${X(legC)},566 L${X(shortLen?legC:(hO+hI)/2)},${hemY-6}`,dark,1,.45),line(`M${X(legCR)},566 L${X(shortLen?legCR:400-(hO+hI)/2)},${hemY-6}`,dark,1,.45));
      if(p.pleats)out.push(line(`M${X(182)},470 L${X(180)},538 M${X(218)},470 L${X(220)},538`,dark,1.1,.6),line(`M${X(170)},470 L${X(170)},512 M${X(230)},470 L${X(230)},512`,dark,1,.45));
      if(p.material==='denim'){const st=shade(col,.5);out.push(line(`M${X(152)},474 Q${X(170)},482 ${X(180)},470 M${X(248)},474 Q${X(230)},482 ${X(220)},470`,st,1.1,.8,' stroke-dasharray="3 2"'),line(`M${X(200)},470 Q${X(206)},520 ${X(197)},548`,st,1,.8,' stroke-dasharray="3 2"'));out.push(dot(156,478,1.6,'#c9a45a'),dot(244,478,1.6,'#c9a45a'))}
      else if(!p.drawstring&&p.type!=='cargo')out.push(line(`M${X(154)},470 L${X(166)},520 M${X(246)},470 L${X(234)},520`,dark,1,.55));
      if(p.type==='cargo'||p.pockets)for(const m of[false,true]){const pts=[[141,600],[166,600],[166,668],[141,666]];out.push(part(poly(S(m?mirrorList(pts):pts)),shade(col,-.05),{shadeOn:false}))}
      if(p.cuff||p.type==='joggers')out.push(part(poly(S([[hO+2,hemY-22],[hI-1,hemY-22],[hI-1,hemY],[hO+2,hemY]])),shade(col,-.1),{pat:'rib',shadeOn:false}),part(poly(S(mirrorList([[hO+2,hemY-22],[hI-1,hemY-22],[hI-1,hemY],[hO+2,hemY]]))),shade(col,-.1),{pat:'rib',shadeOn:false}));
      if(!shortLen&&!p.cuff)out.push(line(`M${X(hO+3)},${hemY-3} Q${X((hO+hI)/2)},${hemY-9} ${X(hI-3)},${hemY-3} M${X(400-hO-3)},${hemY-3} Q${X(400-(hO+hI)/2)},${hemY-9} ${X(400-hI+3)},${hemY-3}`,dark,1,.35));
      return`<g class="av-piece" data-slot="bottom">${out.join('')}</g>`;
    };

    // ---------------------------------------------------------------- belt
    const drawBelt=p=>{
      const col=colourOf(p);
      return`<g class="av-piece" data-slot="belt">${part(poly(S([[150,452],[250,452],[250,465],[150,465]])),col,{pat:p.pattern==='braid'?'braid':null,shadeOn:false})}<rect x="${X(191)}" y="449.5" width="${18*b}" height="18" rx="2.5" fill="none" stroke="#c8c0ae" stroke-width="2.4"/><path d="M${X(200)},452V465" stroke="#c8c0ae" stroke-width="1.6"/></g>`;
    };

    // ---------------------------------------------------------------- tops
    const drawTop=p=>{
      const col=colourOf(p),dark=shade(col,-.32),out=[];
      const knitPat=p.pattern==='cable'?'cable':p.pattern==='stripe'?'stripe':p.pattern==='check'?'check':p.pattern==='rib'?'rib':p.pattern==='linen'?'linen':p.material==='denim'?'denim':p.knit||/knit/.test(p.type)?'knit':null;
      const untuckHem=p.type==='shirt'||p.type==='campshirt'?532:p.type==='tee'||p.type==='polo'?522:512;
      const canTuck=!['sweatshirt','sweater','halfzip','turtleneck','mockneck'].includes(p.type)||!tuck;
      const hem=tuck&&canTuck?476:untuckHem+(p.oversized?10:0);
      const neckPts={crew:[[200,172],[191,169],[184,159]],polo:[[200,170],[184,157]],shirt:[[200,172],[183,151]],camp:[[200,228],[187,158]],turtle:[[200,160],[183,157]],mock:[[200,160],[183,157]],halfzip:[[200,166],[183,157]]}[p.neck]||[[200,172],[184,159]];
      const hemSide=hem>480?(p.oversized?140:145):152;
      const left=[...neckPts,[160,163],[134,175],[140,250],[146,306],[152,440],[hemSide,hem],[hemSide,hem],[200,hem+(hem>480?2:0)]];
      const d=smooth(S(sym(left)));
      const sleeveLong=[[142,170],[124,182],[113,214],[106,336],[96,468],[96,468],[124,470],[124,470],[132,338],[146,258],[148,226]];
      const sleeveShort=p.oversized?[[142,170],[122,184],[110,222],[104,298],[104,298],[140,304],[140,304],[147,258],[148,226]]:[[142,170],[124,182],[114,214],[110,284],[110,284],[140,292],[140,292],[147,256],[148,226]];
      const sl=p.sleeve==='short'?sleeveShort:sleeveLong;
      out.push(part(d,col,{pat:knitPat}));
      for(const m of[false,true])out.push(part(smooth(S(m?mirrorList(sl):sl)),col,{pat:knitPat}));
      if(p.sleeve!=='short'&&(p.knit||p.type==='sweatshirt'))for(const m of[false,true]){const c=[[97,452],[125,454],[124,470],[96,468]];out.push(part(poly(S(m?mirrorList(c):c)),shade(col,-.06),{pat:'rib',shadeOn:false}))}
      if(hem>480&&(p.knit||p.type==='sweatshirt')&&!['knitpolo'].includes(p.type))out.push(part(poly(S([[hemSide+1,hem-16],[400-hemSide-1,hem-16],[400-hemSide,hem],[hemSide,hem]])),shade(col,-.06),{pat:'rib',shadeOn:false}));
      if(p.neck==='crew')out.push(line(`M${X(184)},159 Q200,180 ${X(216)},159`,shade(col,-.18),4.2,.9));
      if(p.neck==='polo'||p.neck==='shirt'){
        const collar=p.neck==='shirt'?[[183,149],[199,171],[199,182],[176,190],[166,166]]:[[184,155],[199,168],[199,180],[178,178],[170,166]];
        for(const m of[false,true])out.push(part(smooth(S(m?mirrorList(collar):collar)),shade(col,.04),{shadeOn:false}));
        const plackEnd=p.neck==='shirt'?hem-4:228;
        out.push(line(`M${X(200)},180 L${X(200)},${plackEnd}`,dark,1,.6));
        for(let y=196;y<plackEnd-6;y+=p.neck==='shirt'?46:26)out.push(dot(200,y,2,shade(col,.3),dark));
      }
      if(p.neck==='camp'){for(const m of[false,true]){const c=[[187,156],[166,168],[186,206],[200,228]];out.push(part(smooth(S(m?mirrorList(c):c)),shade(col,.05),{shadeOn:false}))}for(let y=250;y<hem-6;y+=46)out.push(dot(200,y,2,shade(col,.3),dark))}
      if(p.neck==='turtle')out.push(part(smooth(S([[181,131],[219,131],[222,168],[178,168]])),shade(col,-.04),{pat:'rib',shadeOn:false}),line(`M${X(180)},146 Q200,151 ${X(220)},146`,dark,1.2,.7));
      if(p.neck==='mock')out.push(part(smooth(S([[183,140],[217,140],[219,166],[181,166]])),shade(col,-.04),{pat:'rib',shadeOn:false}));
      if(p.neck==='halfzip')out.push(part(smooth(S([[181,136],[219,136],[221,162],[179,162]])),shade(col,-.04),{pat:'rib',shadeOn:false}),line(`M${X(200)},138 L${X(200)},246`,'#b9b3a6',2,.9),`<rect x="${X(197)}" y="140" width="6" height="11" rx="2" fill="#b9b3a6"/>`);
      return`<g class="av-piece" data-slot="top">${out.join('')}</g>`;
    };

    // ---------------------------------------------------------------- knit layer (cardigan / vest / zip knit)
    const drawLayer=p=>{
      const col=colourOf(p),dark=shade(col,-.32),out=[];
      const patK=p.pattern==='cable'?'cable':'knit';
      const hem=506,vY=p.zip?168:p.sleeveless?288:300;
      const panel=p.sleeveless?[[188,157],[168,162],[152,172],[150,238],[150,238],[147,306],[152,440],[147,hem],[147,hem],[201,hem],[201,hem],[201,vY]]
        :[[188,157],[164,162],[136,174],[141,250],[147,306],[152,440],[147,hem],[147,hem],[201,hem],[201,hem],[201,vY]];
      if(!p.sleeveless){const sl=[[144,168],[125,181],[112,214],[104,336],[94,466],[94,466],[125,469],[125,469],[133,338],[147,258],[150,226]];for(const m of[false,true]){out.push(part(smooth(S(m?mirrorList(sl):sl)),col,{pat:patK}));const c=[[95,448],[126,451],[125,469],[94,466]];out.push(part(poly(S(m?mirrorList(c):c)),shade(col,-.06),{pat:'rib',shadeOn:false}))}}
      for(const m of[false,true])out.push(part(smooth(S(m?mirrorList(panel):panel)),col,{pat:patK}));
      out.push(part(poly(S([[148,hem-16],[252,hem-16],[253,hem],[147,hem]])),shade(col,-.06),{pat:'rib',shadeOn:false}));
      if(p.zip){out.push(part(smooth(S([[182,138],[218,138],[220,164],[180,164]])),shade(col,-.04),{pat:'rib',shadeOn:false}),line(`M${X(200)},140 L${X(200)},${hem}`,'#b9b3a6',2,.9))}
      else{out.push(line(`M${X(200)},${vY} L${X(200)},${hem}`,dark,1,.6));for(let y=vY+18;y<hem-12;y+=42)out.push(dot(200,y,2.6,shade(col,.25),dark))}
      return`<g class="av-piece" data-slot="layer">${out.join('')}</g>`;
    };

    // ---------------------------------------------------------------- outerwear
    const HEM={cropped:478,hip:548,thigh:640,knee:748};
    const drawOuter=p=>{
      const col=colourOf(p),dark=shade(col,-.34),out=[];
      const hem=HEM[p.length]||548;
      const side=p.length==='knee'?128:p.length==='thigh'?134:p.length==='cropped'?148:140;
      const lapel=!!p.lapel;
      const closedType=p.zip&&!lapel;
      const gap=open?(lapel?(p.length==='knee'||p.length==='thigh'?20:14):16):0;
      const inner=200-gap+(gap?0:1);
      const vBottom=lapel?(p.db?286:p.length==='knee'?300:316):null;
      const neckIn=[189,155];
      const texture=p.quilt==='channel'?'channel':p.quilt==='diamond'?'diamond':p.pattern==='herringbone'?'herringbone':p.pattern==='check'?'check':p.material==='denim'?'denim':p.material==='linen'?'linen':p.pattern==='cord'?'cord':null;
      const panelL=p.sleeveless?[neckIn,[168,160],[150,170],[148,236],[148,236],[145,306],[146,440],[side+4,hem],[side+4,hem],[inner,hem],[inner,hem],...(lapel?[[inner,vBottom]]:[[inner,166]])]
        :[neckIn,[162,158],[130,170],[122,186],[134,252],[139,306],[143,440],[side,hem],[side,hem],[inner,hem],[inner,hem],...(lapel?[[inner,vBottom]]:[[inner,168]])];
      if(p.hood)out.push(part(smooth(S([[172,168],[175,146],[200,138],[225,146],[228,168]])),shade(col,-.2),{shadeOn:false}));
      if(lapel)out.push(part(smooth(S([[178,150],[222,150],[224,164],[176,164]])),shade(col,-.25),{shadeOn:false}));
      if(!p.sleeveless){const sl=[[142,166],[122,180],[110,214],[102,336],[92,462],[92,462],[127,466],[127,466],[134,338],[148,258],[150,226]];for(const m of[false,true]){out.push(part(smooth(S(m?mirrorList(sl):sl)),col,{pat:texture}));if(p.rib){const c=[[93,448],[127,452],[127,466],[92,462]];out.push(part(poly(S(m?mirrorList(c):c)),shade(col,-.1),{pat:'rib',shadeOn:false}))}}}
      for(const m of[false,true])out.push(part(smooth(S(m?mirrorList(panelL):panelL)),col,{pat:texture}));
      if(!gap&&!lapel)out.push(line(`M${X(200)},166 L${X(200)},${hem}`,p.zip?'#b9b3a6':dark,p.zip?1.8:1,.85));
      if(p.rib)out.push(part(poly(S([[side+2,hem-16],[inner,hem-16],[inner,hem],[side+2,hem]])),shade(col,-.1),{pat:'rib',shadeOn:false}),part(poly(S(mirrorList([[side+2,hem-16],[inner,hem-16],[inner,hem],[side+2,hem]]))),shade(col,-.1),{pat:'rib',shadeOn:false}));
      if(lapel){
        const L=p.lapel==='wide'?[[189,153],[171,160],[156,214],[169,223],[161,233],[inner+1,vBottom],[inner+1,vBottom-10],[190,168]]:[[189,154],[177,160],[167,202],[177,209],[171,218],[inner+1,vBottom],[inner+1,vBottom-10],[191,168]];
        const lapelFill=shade(col,lum(col)>.45?-.08:.1);
        for(const m of[false,true]){const pts=S(m?mirrorList(L):L);out.push(`<path d="${poly(pts)}" fill="${lapelFill}" stroke="${shade(col,-.5)}" stroke-width="1.3" stroke-linejoin="round"/>`,line(`M${pts[1][0]},${pts[1][1]} L${pts[5][0]},${pts[5][1]}`,shade(col,-.55),1,.35))}
        if(p.belted){out.push(part(poly(S([[side+10,450],[400-side-10,450],[400-side-10,466],[side+10,466]])),shade(col,-.05),{shadeOn:false}),`<rect x="${X(192)}" y="448" width="${16*b}" height="20" rx="2" fill="none" stroke="${shade(col,-.5)}" stroke-width="2"/>`)}
        if(p.db){for(const y of[330,384,438]){out.push(dot(gap?inner-8:186,y,3.2,shade(col,-.45)),dot(gap?400-inner+8:214,y,3.2,shade(col,-.45)))}}
        else{for(const y of[p.length==='knee'?360:392,p.length==='knee'?430:444])out.push(dot(gap?inner-6:200,y,3.2,shade(col,-.45)))}
        if(p.type==='blazer')out.push(line(`M${X(150)},470 L${X(182)},470 M${X(250)},470 L${X(218)},470`,dark,1.6,.7),line(`M${X(214)},262 L${X(236)},260`,dark,1.6,.6));
      }else if(p.collar==='shirt'){
        const c=[[190,152],[170,160],[162,180],[184,194],[199,170]];
        for(const m of[false,true])out.push(part(smooth(S(m?mirrorList(c):c)),shade(col,-.05),{shadeOn:false}));
      }else if(p.collar==='stand'){
        out.push(part(smooth(S([[181,134],[219,134],[221,164],[179,164]])),shade(col,-.06),{pat:p.quilt?'channel':null,shadeOn:false}));
      }
      if(p.pockets||p.type==='overshirt'||p.type==='workjacket'||p.type==='field'){
        for(const m of[false,true]){const pk=[[160,236],[186,236],[186,266],[160,266]];out.push(part(poly(S(m?mirrorList(pk):pk)),shade(col,-.04),{shadeOn:false}),line(poly(S(m?mirrorList([[159,236],[187,236],[187,246],[159,246]]):[[159,236],[187,236],[187,246],[159,246]])),dark,1,.5))}
        if(hem>520)for(const m of[false,true]){const pk=[[152,470],[182,470],[182,510],[152,510]];out.push(part(poly(S(m?mirrorList(pk):pk)),shade(col,-.04),{shadeOn:false}))}
      }
      if(p.buttons&&!p.zip){for(let y=190;y<hem-14;y+=52)out.push(dot(gap?inner-6:200,y,2.6,shade(col,.3),dark))}
      if(p.zip&&gap)out.push(line(`M${X(inner-1)},168 L${X(inner-1)},${hem}`,'#b9b3a6',1.6,.8),line(`M${X(400-inner+1)},168 L${X(400-inner+1)},${hem}`,'#b9b3a6',1.6,.8));
      return`<g class="av-piece" data-slot="outerwear">${out.join('')}</g>`;
    };

    // ---------------------------------------------------------------- accessories
    const drawWatch=p=>{const col=colourOf(p);return`<g class="av-piece" data-slot="watch"><path d="${poly(S([[96,452],[124,454],[125,467],[96,465]]))}" fill="${col}" stroke="${shade(col,-.4)}" stroke-width="1"/><circle cx="${X(110.5)}" cy="459.5" r="8.5" fill="${lum(col)>.5?'#1d1d1f':'#f1eee6'}" stroke="#c8c0ae" stroke-width="2"/></g>`};
    const drawBag=p=>{const col=colourOf(p),dark=shade(col,-.35);return`<g class="av-piece" data-slot="bag">${line(`M${X(262)},176 L${X(162)},506`,dark,6,1)}${part(smooth(S([[124,500],[188,500],[190,560],[122,560]])),col)}${part(poly(S([[124,500],[188,500],[189,530],[123,524]])),shade(col,-.08),{shadeOn:false})}<rect x="${X(152)}" y="522" width="8" height="8" rx="1.5" fill="#c8c0ae"/></g>`};
    const drawEyewear=p=>{const col=colourOf(p);return`<g class="av-piece" data-slot="eyewear"><rect x="175" y="87" width="22" height="15" rx="7" fill="#1d1d1f" fill-opacity=".72" stroke="${col}" stroke-width="2.6"/><rect x="203" y="87" width="22" height="15" rx="7" fill="#1d1d1f" fill-opacity=".72" stroke="${col}" stroke-width="2.6"/><path d="M197,92 Q200,89 203,92 M175,92 L167,90 M225,92 L233,90" fill="none" stroke="${col}" stroke-width="2.2"/></g>`};

    // ---------------------------------------------------------------- z-order
    const top=slots.top,bottom=slots.bottom,belt=slots.belt;
    const topTucked=top&&tuck&&!['sweatshirt','sweater','halfzip','turtleneck','mockneck'].includes(top.type);
    if(shoes)layers.push(drawShoe(shoes));
    const shortsOrBoots=bottom&&shoes&&(shoes.type==='chelsea'||shoes.type==='boot')&&!/shorts|bermuda/.test(bottom.length);
    if(topTucked||!top){if(top)layers.push(drawTop(top));if(bottom)layers.push(drawBottom(bottom));if(belt)layers.push(drawBelt(belt))}
    else{if(bottom)layers.push(drawBottom(bottom));layers.push(drawTop(top))}
    void shortsOrBoots;
    if(slots.layer)layers.push(drawLayer(slots.layer));
    if(slots.outerwear)layers.push(drawOuter(slots.outerwear));
    if(slots.watch)layers.push(drawWatch(slots.watch));
    if(slots.bag)layers.push(drawBag(slots.bag));
    if(slots.eyewear)layers.push(drawEyewear(slots.eyewear));
    const vb=opts.viewBox||'40 20 320 960';
    const label=opts.label?`<title>${String(opts.label).replace(/[<&]/g,'')}</title>`:'';
    return`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" role="img" class="${opts.className||'avatar-svg'}" preserveAspectRatio="xMidYMid meet">${label}<defs>${defs.join('')}</defs>${opts.mannequin?mannequin(b):layers.slice(0,2).join('')}${(opts.mannequin?layers.slice(2):layers.slice(2)).join('')}</svg>`;
  }

  // Light-grey dress form used behind thumbnails.
  function mannequin(){
    const c='#e6e1d8';
    const torso=sym([[200,158],[186,158],[164,163],[140,172],[130,182],[128,196],[139,250],[144,306],[150,450],[146,505],[200,552]]);
    const legL=[[146,498],[148,560],[154,722],[163,902],[190,902],[192,722],[198,560],[200,552],[186,520]];
    const armL=[[140,172],[124,184],[114,214],[108,336],[99,466],[99,466],[121,468],[121,468],[129,338],[143,262],[146,236]];
    return[smooth(torso),smooth(legL),smooth(mirrorList(legL)),smooth(armL),smooth(mirrorList(armL)),'M186,118H214L216,166H184Z'].map(d=>`<path d="${d}" fill="${c}"/>`).join('')+`<ellipse cx="200" cy="93" rx="30" ry="38" fill="${c}"/>`;
  }
  const THUMB_BOX_UNUSED=null;void THUMB_BOX_UNUSED;
  const THUMB_BOX={outerwear:p=>`62 104 276 ${Math.min(700,({cropped:478,hip:548,thigh:640,knee:748}[p.length]||548)-60)}`,layer:()=>'70 110 260 420',top:()=>'70 106 260 440',bottom:()=>'118 438 164 490',shoes:()=>'132 846 136 120',belt:()=>'140 430 120 48',watch:()=>'84 436 54 48',bag:()=>'104 160 190 420',eyewear:()=>'160 76 80 32'};
  function thumb(piece,opts={}){
    const box=(THUMB_BOX[piece.slot]||THUMB_BOX.top)(piece);
    return render({slots:{[piece.slot]:piece},colours:opts.colours,tuck:piece.slot==='top'?false:true,open:true},{viewBox:box,mannequin:['outerwear','layer','top','bottom','belt','watch','bag'].includes(piece.slot),className:'piece-svg',palette:opts.palette,label:piece.name});
  }
  return{render,thumb,SKINS,HAIRS,HAIR_STYLES,shade};
});
