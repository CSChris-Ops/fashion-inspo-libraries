/* Fashion Inspo Libraries — wardrobe engine (browser + Node).
 *
 * Turns every catalogue item — verified products, seasonal-look items and the
 * pieces named in each formula — into an individual wearable piece with a slot,
 * garment type, colour, fit, length, season and price. The same module scores
 * any combination ("match chance"), completes a look, rolls weighted random
 * outfits, and estimates same-brand vs crossover odds by Monte Carlo sampling.
 *
 * Loaded as a plain <script> it exposes window.FIL.wardrobe; in Node it is
 * `require('./app/wardrobe.js')` (the catalogue pipeline uses it to publish
 * data/wardrobe.json).
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else{root.FIL=root.FIL||{};root.FIL.wardrobe=api}
})(typeof self!=='undefined'?self:this,function(){
  'use strict';

  // ---------------------------------------------------------------- slots
  const SLOTS=['outerwear','layer','top','bottom','shoes','belt','watch','bag','eyewear'];
  const SLOT_LABELS={outerwear:'Outerwear',layer:'Knit layer',top:'Top',bottom:'Bottoms',shoes:'Shoes',belt:'Belt',watch:'Watch',bag:'Bag',eyewear:'Eyewear'};
  const CORE=['top','bottom','shoes'];
  const ACCESSORY=['belt','watch','bag','eyewear'];

  // ---------------------------------------------------------------- colours
  // [name, hex, family]; longest names first so "dark brown" wins over "brown".
  const COLOURS=[
    ['optic white','#f5f4ef','white'],['off-white','#ece6d8','ecru'],['dark chocolate','#3a2820','brown'],['dark brown','#402e25','brown'],['deep brown','#402e25','brown'],['deep navy','#18263a','navy'],['pale blue','#b9cfe0','blue'],['light blue','#b3cadc','blue'],['medium blue','#5f7f9c','blue'],['sky blue','#a9c1cf','blue'],['dark denim','#2b3c58','denim'],['light grey','#c7c8c9','grey'],['mid-grey','#8f9194','grey'],['pale taupe','#b9ab9a','beige'],['deep burgundy','#52252b','burgundy'],['muted olive','#626852','olive'],
    ['white','#f4f3ee','white'],['ecru','#e9e0cc','ecru'],['ivory','#eee8da','ecru'],['cream','#ece2c9','ecru'],['oatmeal','#d8cab0','beige'],['beige','#d5c5a6','beige'],['stone','#cbc1ae','beige'],['sand','#c9b28c','beige'],['natural','#d9cdb5','beige'],['khaki','#b3a37c','olive'],['taupe','#a8998a','beige'],['camel','#b88959','camel'],['tan','#b3875a','camel'],['cognac','#8e5433','brown'],['tobacco','#7a4c31','brown'],['chocolate','#3e2b22','brown'],['brown','#5b3f2f','brown'],
    ['grey','#9a9b9e','grey'],['gray','#9a9b9e','grey'],['charcoal','#444548','charcoal'],['black','#1d1d1f','black'],['midnight','#172538','navy'],['navy','#1e2d42','navy'],
    ['sky','#a9c1cf','blue'],['blue','#6f8fae','blue'],['indigo','#2b3c58','denim'],['denim','#56708e','denim'],
    ['olive','#5a604b','olive'],['sage','#8e9c85','olive'],['forest','#2e4a3a','green'],['green','#3d5b47','green'],
    ['burgundy','#5b2a30','burgundy'],['oxblood','#55292b','burgundy'],['wine','#5b2a30','burgundy'],['rust','#9a5334','rust'],['terracotta','#a45c3e','rust'],['tortoise','#6b4a2b','brown'],['tortoiseshell','#6b4a2b','brown']
  ].sort((a,b)=>b[0].length-a[0].length);
  const COLOUR_BY_NAME=Object.fromEntries(COLOURS.map(([n,h,f])=>[n,{name:n,hex:h,family:f}]));
  const COLOUR_RE=new RegExp(`\\b(${COLOURS.map(c=>c[0].replace(/[-]/g,'\\-')).join('|')})\\b`,'i');
  // Families that behave as neutrals in a menswear palette vs. true accents.
  const ROLE={white:'light',ecru:'light',beige:'light',grey:'mid',charcoal:'dark',black:'dark',navy:'dark',brown:'dark',camel:'earth',olive:'earth',denim:'denim',blue:'accent',green:'accent',burgundy:'accent',rust:'accent'};
  const lightness=hex=>{
    const n=parseInt(hex.slice(1),16),c=[n>>16&255,n>>8&255,n&255].map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});
    const y=.2126*c[0]+.7152*c[1]+.0722*c[2];
    return Math.round((y>.008856?Math.cbrt(y)*116-16:y*903.3));
  };

  // ---------------------------------------------------------------- garment types
  // f = formality (1 relaxed … 5 formal). Render hints are read by app/avatar.js.
  const TYPES={
    overcoat:{slot:'outerwear',label:'Overcoat',f:4.5,length:'knee',lapel:'notch',colour:'camel',nouns:['overcoat','coat','balmacaan']},
    trench:{slot:'outerwear',label:'Trench coat',f:4,length:'knee',lapel:'wide',db:true,belted:true,colour:'stone',nouns:['trench','coat']},
    peacoat:{slot:'outerwear',label:'Peacoat',f:4,length:'thigh',lapel:'wide',db:true,colour:'navy',nouns:['peacoat','coat']},
    shortcoat:{slot:'outerwear',label:'Short coat',f:4,length:'thigh',lapel:'notch',colour:'camel',nouns:['coat']},
    parka:{slot:'outerwear',label:'Parka',f:2.5,length:'thigh',hood:true,zip:true,colour:'olive',nouns:['parka','shell','blocktech']},
    puffer:{slot:'outerwear',label:'Down jacket',f:2,length:'hip',quilt:'channel',zip:true,collar:'stand',colour:'navy',nouns:['down','jacket','puffer']},
    gilet:{slot:'outerwear',label:'Gilet',f:2,length:'hip',quilt:'channel',zip:true,sleeveless:true,collar:'stand',colour:'navy',nouns:['vest','gilet','pufftech']},
    blazer:{slot:'outerwear',label:'Blazer',f:4.5,length:'hip',lapel:'notch',colour:'navy',nouns:['blazer','jacket','suit','tailoring']},
    bomber:{slot:'outerwear',label:'Bomber',f:2.5,length:'cropped',rib:true,zip:true,colour:'navy',nouns:['bomber','jacket']},
    harrington:{slot:'outerwear',label:'Harrington',f:2.5,length:'cropped',rib:true,zip:true,collar:'shirt',colour:'sand',nouns:['harrington','jacket']},
    blouson:{slot:'outerwear',label:'Blouson',f:3,length:'cropped',rib:true,zip:true,collar:'shirt',colour:'tobacco',nouns:['blouson','jacket','layer']},
    overshirt:{slot:'outerwear',label:'Overshirt',f:2.5,length:'hip',collar:'shirt',pockets:true,buttons:true,colour:'sand',nouns:['overshirt','shirt']},
    field:{slot:'outerwear',label:'Field jacket',f:3,length:'hip',collar:'shirt',pockets:true,zip:true,colour:'olive',nouns:['jacket','quilt']},
    workjacket:{slot:'outerwear',label:'Work jacket',f:2,length:'hip',collar:'shirt',pockets:true,buttons:true,colour:'olive',nouns:['jacket','layer']},
    jacket:{slot:'outerwear',label:'Jacket',f:3,length:'hip',collar:'shirt',zip:true,colour:'stone',nouns:['jacket','layer']},
    fleece:{slot:'outerwear',label:'Fleece',f:1.5,length:'hip',collar:'stand',zip:true,colour:'ecru',nouns:['fleece']},
    cardigan:{slot:'layer',label:'Cardigan',f:3.5,neck:'v',buttons:true,knit:true,colour:'navy',nouns:['cardigan']},
    zipknit:{slot:'layer',label:'Zip knit',f:3,zip:true,collar:'stand',knit:true,colour:'charcoal',nouns:['knit','cardigan','zip']},
    knitvest:{slot:'layer',label:'Knit vest',f:3.5,neck:'v',sleeveless:true,knit:true,colour:'cream',nouns:['vest']},
    tee:{slot:'top',label:'T-shirt',f:1.5,sleeve:'short',neck:'crew',colour:'white',nouns:['tee','t-shirt']},
    polo:{slot:'top',label:'Polo',f:3,sleeve:'short',neck:'polo',colour:'navy',nouns:['polo']},
    knitpolo:{slot:'top',label:'Knit polo',f:3.5,sleeve:'short',neck:'polo',knit:true,colour:'cream',nouns:['polo','knit']},
    shirt:{slot:'top',label:'Shirt',f:3.5,sleeve:'long',neck:'shirt',buttons:true,colour:'pale blue',nouns:['shirt','oxford','poplin','broadcloth','flannel','collar']},
    campshirt:{slot:'top',label:'Camp-collar shirt',f:3,sleeve:'short',neck:'camp',buttons:true,colour:'white',nouns:['shirt','linen']},
    turtleneck:{slot:'top',label:'Roll neck',f:4,sleeve:'long',neck:'turtle',knit:true,colour:'cream',nouns:['roll neck','roll-neck','turtleneck','polo-neck','collar']},
    mockneck:{slot:'top',label:'Mock neck',f:4,sleeve:'long',neck:'mock',knit:true,colour:'charcoal',nouns:['mock neck','mock-neck']},
    halfzip:{slot:'top',label:'Half-zip',f:3,sleeve:'long',neck:'halfzip',knit:true,colour:'navy',nouns:['half-zip','knit']},
    sweater:{slot:'top',label:'Sweater',f:3.5,sleeve:'long',neck:'crew',knit:true,colour:'grey',nouns:['knit','sweater','jumper']},
    sweatshirt:{slot:'top',label:'Sweatshirt',f:1.5,sleeve:'long',neck:'crew',rib:true,colour:'grey',nouns:['sweatshirt','sweat']},
    trousers:{slot:'bottom',label:'Trousers',f:4,length:'full',colour:'charcoal',nouns:['trouser','trousers','pants','pleat','pleats','tailoring']},
    chinos:{slot:'bottom',label:'Chinos',f:3,length:'full',colour:'stone',nouns:['chino','chinos','trouser']},
    jeans:{slot:'bottom',label:'Jeans',f:2,length:'full',denim:true,colour:'indigo',nouns:['jeans','denim','selvedge']},
    cords:{slot:'bottom',label:'Corduroy',f:3,length:'full',colour:'brown',nouns:['corduroy','cord','trouser']},
    cargo:{slot:'bottom',label:'Cargo',f:1.5,length:'full',pockets:true,colour:'olive',nouns:['cargo','utility trouser','pants']},
    joggers:{slot:'bottom',label:'Joggers',f:1.5,length:'full',cuff:true,colour:'charcoal',nouns:['jogger','joggers','trouser']},
    shorts:{slot:'bottom',label:'Shorts',f:1.5,length:'shorts',colour:'stone',nouns:['short','shorts']},
    bermuda:{slot:'bottom',label:'Bermudas',f:2.5,length:'bermuda',colour:'navy',nouns:['bermuda','bermudas','short','shorts']},
    loafer:{slot:'shoes',label:'Loafers',f:4,colour:'dark brown',nouns:['loafer','loafers','moccasin','slip-on','shoe']},
    derby:{slot:'shoes',label:'Derby shoes',f:4.5,colour:'dark brown',nouns:['derby','shoe','shoes']},
    chelsea:{slot:'shoes',label:'Chelsea boots',f:3.5,boot:true,colour:'black',nouns:['chelsea','boot','boots']},
    boot:{slot:'shoes',label:'Boots',f:3,boot:true,laces:true,colour:'brown',nouns:['boot','boots']},
    boat:{slot:'shoes',label:'Boat shoes',f:3,colour:'dark brown',nouns:['boat shoe','shoe','shoes']},
    sneaker:{slot:'shoes',label:'Sneakers',f:2,colour:'white',nouns:['sneaker','trainer','shoe']},
    canvas:{slot:'shoes',label:'Canvas sneakers',f:1.5,colour:'white',nouns:['sneaker','shoe']},
    sandal:{slot:'shoes',label:'Sandals',f:1.5,colour:'dark brown',nouns:['sandal','strap']},
    espadrille:{slot:'shoes',label:'Espadrilles',f:2,colour:'tan',nouns:['espadrille','shoe']},
    belt:{slot:'belt',label:'Belt',f:null,colour:'dark brown',nouns:['belt']},
    watch:{slot:'watch',label:'Watch',f:null,colour:'black',nouns:['watch','dial']},
    bag:{slot:'bag',label:'Bag',f:3,colour:'dark brown',nouns:['bag','satchel']},
    sunglasses:{slot:'eyewear',label:'Sunglasses',f:null,colour:'tortoise',nouns:['sunglasses','glasses']}
  };
  // First match wins; classification uses the item NAME only.
  const RULES=[
    [/sunglasses|\bglasses\b/,'sunglasses'],[/\bwatch\b/,'watch'],[/\bbelt\b/,'belt'],[/\b(bag|satchel|tote)\b/,'bag'],
    [/chelsea/,'chelsea'],[/\bboots?\b/,'boot'],[/espadrille/,'espadrille'],[/sandal/,'sandal'],[/boat shoe|deck shoe/,'boat'],
    [/loafer|moccasin|slip-on/,'loafer'],[/derby|lace-up|country shoe/,'derby'],[/canvas sneaker/,'canvas'],[/sneaker|trainer/,'sneaker'],
    [/pufftech vest|puffer vest|gilet|down vest|padded vest/,'gilet'],[/trench/,'trench'],[/peacoat|pea coat/,'peacoat'],[/short coat|car coat/,'shortcoat'],
    [/overcoat|balmacaan|\bcoat\b/,'overcoat'],[/parka/,'parka'],[/\bdown\b.*jacket|ultra light down|puffer|padded jacket/,'puffer'],
    [/quilted|field jacket/,'field'],[/harrington/,'harrington'],[/bomber|ma-1/,'bomber'],[/blouson/,'blouson'],
    [/blazer|single-breasted|double-breasted|tailored jacket|suit jacket|milano rib jacket|regular-fit jacket/,'blazer'],
    [/overshirt|shirt jacket/,'overshirt'],[/work(wear)? jacket|denim (work )?jacket|utility jacket/,'workjacket'],[/fleece/,'fleece'],
    [/zip jacket|zip cardigan|knitted zip/,'zipknit'],[/cardigan/,'cardigan'],[/(knit|cable|sweater) vest/,'knitvest'],[/jacket/,'jacket'],
    [/turtleneck|roll[- ]?neck|polo-neck/,'turtleneck'],[/mock-?neck|mock neck/,'mockneck'],[/half-zip/,'halfzip'],[/sweatshirt|hoodie/,'sweatshirt'],
    [/polo sweater|skipper polo|knit(ted)? polo|fine-knit polo|merino.*polo|cable-knit.*polo|linen polo|silk-cotton polo/,'knitpolo'],[/polo/,'polo'],
    [/t-shirt|\btee\b|\btank\b/,'tee'],[/camp-collar|open-collar|resort shirt/,'campshirt'],[/shirt|oxford|poplin|broadcloth/,'shirt'],
    [/sweater|jumper|pullover|\bknit\b/,'sweater'],
    [/bermuda/,'bermuda'],[/shorts/,'shorts'],[/jeans|selvedge/,'jeans'],[/cargo|parachute/,'cargo'],[/\bjoggers?\b(?!-fit)/,'joggers'],
    [/corduroy|\bcords?\b/,'cords'],[/chino/,'chinos'],[/pants|trousers?/,'trousers']
  ];
  const PRODUCT_SLOT_FALLBACK={outerwear:'jacket',top:'tee',bottom:'trousers',shoes:'sneaker',accessory:'bag'};

  const classify=(name,slotHint)=>{
    const text=String(name||'').toLowerCase();
    let type=null;
    for(const [re,t] of RULES)if(re.test(text)){type=t;break}
    if(!type&&slotHint&&PRODUCT_SLOT_FALLBACK[slotHint])type=PRODUCT_SLOT_FALLBACK[slotHint];
    if(!type)return null;
    const def=TYPES[type];
    const out={type,slot:def.slot,typeLabel:def.label,formality:def.f};
    // construction hints used by the avatar renderer
    for(const k of['lapel','db','belted','hood','zip','rib','collar','pockets','buttons','sleeveless','knit','quilt','boot','laces','cuff','denim','length','sleeve','neck'])if(def[k]!==undefined)out[k]=def[k];
    // fit / length
    if(def.slot==='bottom'){
      out.fit=/barrel/.test(text)?'barrel':/wide|loose|parachute/.test(text)?'wide':/relaxed|flowing|paperbag/.test(text)?'relaxed':/slim|tapered|jogger-fit/.test(text)?'slim':/straight/.test(text)?'straight':type==='joggers'?'slim':'regular';
      out.length=/ankle/.test(text)?'ankle':def.length;
      out.pleats=/pleat/.test(text);
      out.crease=type==='trousers'&&/tailored|suit|darted|smart|wool|flannel|pleat|dress/.test(text);
      out.drawstring=/drawstring|jogger/.test(text);
      out.cuff=!!def.cuff||/jogger-fit/.test(text);
      if(type==='trousers'&&/smart|suit|tailored/.test(text))out.formality=4.5;
      if(type==='trousers'&&/linen|drawstring|jogger/.test(text))out.formality=3;
      if(type==='shorts'&&/tailored|chino|paperbag/.test(text))out.formality=2.5;
    }
    if(def.slot==='outerwear'){
      out.length=/cropped|short\b|blouson/.test(text)&&!['overcoat','trench','peacoat','shortcoat'].includes(type)?'cropped':def.length;
      if(/double-breasted/.test(text))out.db=true;
      if(type==='parka'&&/down/.test(text))out.quilt='channel';
      if(type==='field'&&/quilted/.test(text))out.quilt='diamond';
      if(type==='jacket'&&/utility/.test(text))out.pockets=true;
    }
    if(def.slot==='top'){
      out.sleeve=def.sleeve;out.neck=def.neck;
      if(/linen/.test(text)&&type==='shirt')out.formality=3;
      if(type==='shirt'&&/satin|evening/.test(text))out.formality=4.5;
      if(type==='shirt'&&/denim|flannel/.test(text))out.formality=2.5;
      if(type==='tee'&&/merino|fine-knit|mercerised|supima|premium/.test(text))out.formality=2;
      if(type==='tee'&&/oversized/.test(text))out.oversized=true;
      if(type==='knitpolo'&&/boxy/.test(text))out.oversized=true;
    }
    if(def.slot==='shoes'){
      if(type==='sneaker'&&/retro|sport/.test(text))out.formality=1.5;
      if(type==='sneaker'&&/leather|minimal|suede|court/.test(text))out.formality=2.5;
      if(type==='loafer'&&/moccasin|slip-on/.test(text))out.formality=3.5;
    }
    // material & pattern
    out.material=/suede/.test(text)?'suede':/leather|nappa/.test(text)?'leather':/linen/.test(text)?'linen':/denim|jeans|selvedge/.test(text)?'denim':/cashmere/.test(text)?'cashmere':/merino/.test(text)?'merino':/lambswool|wool|flannel|herringbone/.test(text)?'wool':/\bdown\b|pufftech|puffer/.test(text)?'down':/fleece/.test(text)?'fleece':/satin|silk/.test(text)?'satin':/canvas/.test(text)?'canvas':def.knit?'knit':'cotton';
    out.pattern=/stripe/.test(text)?'stripe':/check|plaid/.test(text)?'check':/herringbone/.test(text)?'herringbone':/cable/.test(text)?'cable':/corduroy|\bcords?\b/.test(text)?'cord':/rib|milano/.test(text)?'rib':/woven|braided/.test(text)&&type==='belt'?'braid':type==='shirt'&&/flannel/.test(text)?'check':out.material==='denim'?'denim':out.material==='linen'?'linen':def.knit||/knit/.test(text)?'knit':null;
    if(def.denim)out.material='denim';
    return out;
  };

  // Illustrative colour when the catalogue text names none: picked deterministically per piece
  // from plausible colourways for its type and material, so the wardrobe is not all one shade.
  const PALETTES={
    overcoat:['camel','navy','charcoal'],trench:['stone','beige'],peacoat:['navy'],shortcoat:['camel','grey'],parka:['olive','navy','stone'],puffer:['navy','black','olive'],gilet:['navy','olive'],
    blazer:['navy','taupe','charcoal'],bomber:['navy','olive','tobacco'],harrington:['sand','navy'],blouson:['tobacco','navy'],overshirt:['sand','olive','stone'],field:['olive'],workjacket:['olive','navy'],jacket:['stone','navy'],fleece:['ecru'],
    cardigan:['navy','grey','cream'],zipknit:['charcoal','navy'],knitvest:['cream','navy'],
    tee:['white','ecru','navy'],polo:['navy','white','stone'],knitpolo:['cream','navy','stone'],shirt:['pale blue','white'],campshirt:['white','ecru','pale blue'],turtleneck:['cream','charcoal','black'],mockneck:['charcoal','oatmeal','navy'],halfzip:['navy','grey'],sweater:['grey','navy','cream','oatmeal'],sweatshirt:['grey','navy'],
    trousers:['charcoal','navy','stone','taupe'],chinos:['stone','sand','olive'],jeans:['indigo','denim'],cords:['brown','olive'],cargo:['olive','charcoal'],joggers:['charcoal','grey'],shorts:['stone','navy','ecru'],bermuda:['navy','stone'],
    loafer:['dark brown','black','tobacco'],derby:['dark brown','black'],chelsea:['black','dark brown'],boot:['brown','dark brown'],boat:['dark brown','tobacco'],sneaker:['white'],canvas:['white','ecru'],sandal:['dark brown'],espadrille:['tan','navy'],
    belt:['dark brown','black'],watch:['black'],bag:['dark brown'],sunglasses:['tortoise']
  };
  const MATERIAL_PALETTES={
    linen:{top:['white','ecru','pale blue'],bottom:['ecru','stone','sand'],outerwear:['sand','stone'],layer:['ecru']},
    suede:{outerwear:['tobacco','brown'],shoes:['tobacco','brown']},
    denim:{top:['denim'],bottom:['indigo','denim'],outerwear:['indigo','denim']},
    cashmere:{top:['camel','oatmeal'],outerwear:['camel']},
    down:{outerwear:['navy','black','olive']}
  };
  const hashOf=s=>{let h=2166136261;for(const ch of String(s))h=Math.imul(h^ch.charCodeAt(0),16777619);return h>>>0};
  const defaultColour=(c,id)=>{
    const options=(MATERIAL_PALETTES[c.material]&&MATERIAL_PALETTES[c.material][c.slot])||(c.type==='trousers'&&/flannel/.test(id)?['grey','charcoal']:null)||PALETTES[c.type]||[TYPES[c.type].colour];
    return COLOUR_BY_NAME[options[hashOf(id)%options.length]]||COLOUR_BY_NAME[TYPES[c.type].colour];
  };
  const findColour=text=>{const m=String(text||'').toLowerCase().match(COLOUR_RE);return m?COLOUR_BY_NAME[m[1]]:null};
  // Colour named directly before the garment noun in a formula rule ("camel wool coat").
  const colourNear=(rule,type)=>{
    if(!rule)return null;
    const text=rule.toLowerCase(),nouns=(TYPES[type]||{}).nouns||[];
    for(const noun of nouns){
      const re=new RegExp(`\\b(${COLOURS.map(c=>c[0].replace(/[-]/g,'\\-')).join('|')})\\b(?:[\\s-]+[a-z-]+){0,3}?[\\s-]+${noun.replace(/[-]/g,'\\-')}`);
      const m=text.match(re);if(m)return COLOUR_BY_NAME[m[1]];
    }
    return null;
  };
  const guessSeasons=(c,text)=>{
    const t=String(text||'').toLowerCase();
    if(/linen|sandal|espadrille|airism|dry\b|uv protection/.test(t)||c.slot==='bottom'&&/short/.test(c.length||''))return['spring','summer'];
    if(/down|puffer|pufftech|parka|overcoat|peacoat|balmacaan|cashmere|flannel|corduroy|lambswool|heattech|fleece|turtleneck|roll neck|roll-neck/.test(t)||['overcoat','peacoat','puffer','gilet','turtleneck'].includes(c.type))return['fall','winter'];
    if(c.type==='chelsea'||c.type==='boot'||/wool|merino|quilted/.test(t))return['spring','fall','winter'];
    return['spring','summer','fall','winter'];
  };
  const slugify=s=>String(s).toLowerCase().replace(/&/g,'and').replace(/\d+%\s*/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const titleCase=s=>{const t=String(s).trim();return t?t[0].toUpperCase()+t.slice(1):t};
  const ESTIMATE_WEIGHT={outerwear:.36,layer:.2,top:.18,bottom:.22,shoes:.26,belt:.07,watch:.1,bag:.15,eyewear:.06};
  const PRICE_RANK={catalogue:3,reference:2,estimated:1};

  // ---------------------------------------------------------------- build the wardrobe
  function build(catalogues){
    const pieces=new Map(),aliases=new Map(),byFormula={},bySeasonal={},skipped=[];
    const add=(cat,raw)=>{
      const c=classify(raw.name,raw.slotHint);
      if(!c){skipped.push(`${cat.id}: ${raw.name}`);return null}
      const id=`${cat.id}--${slugify(raw.name)}`;
      const colour=findColour(raw.name)&&{...findColour(raw.name),source:'name'}
        ||findColour(raw.note)&&{...findColour(raw.note),source:'note'}
        ||colourNear(raw.context,c.type)&&{...colourNear(raw.context,c.type),source:'look'}
        ||findColour(raw.facts)&&{...findColour(raw.facts),source:'product'}
        ||{...defaultColour(c,id),source:'default'};
      const seasons=raw.seasons&&raw.seasons.length?raw.seasons:guessSeasons(c,raw.name);
      const existing=pieces.get(id);
      if(!existing){
        const piece={id,brand:cat.id,brandLabel:cat.label,name:titleCase(raw.name),...c,colour,seasons:[...new Set(seasons)],categories:[...new Set(raw.categories||[])],
          price:raw.price,url:raw.url||cat.home_url,image:raw.image||null,productId:raw.productId||null,availability:raw.availability||'listed',note:raw.note||'',sources:raw.source?[raw.source]:[]};
        pieces.set(id,piece);
      }else{
        const p=existing;
        p.seasons=[...new Set([...p.seasons,...seasons])];
        p.categories=[...new Set([...p.categories,...(raw.categories||[])])];
        if(raw.source)p.sources.push(raw.source);
        const rank=PRICE_RANK[raw.price.basis]||0,cur=PRICE_RANK[p.price.basis]||0;
        if(rank>cur)p.price=raw.price;
        else if(rank===cur&&raw.price.basis==='estimated'&&raw.price.currency===p.price.currency){p.price={...p.price,amount:Math.round((p.price.amount+raw.price.amount)/2*100)/100}}
        if(raw.url&&raw.url!==cat.home_url&&(!p.url||p.url===cat.home_url))p.url=raw.url;
        if(raw.image&&!p.image)p.image=raw.image;
        if(raw.productId&&!p.productId)p.productId=raw.productId;
        if(p.colour.source==='default'&&colour.source!=='default')p.colour=colour;
        if(!p.note&&raw.note)p.note=raw.note;
      }
      if(raw.productId)aliases.set(raw.productId,id);
      return id;
    };
    for(const cat of catalogues){
      for(const p of cat.products||[]){
        add(cat,{name:p.name,slotHint:p.slot,note:p.note,facts:p.facts&&p.facts.colour,price:{amount:p.price.amount,currency:p.price.currency,basis:'reference'},url:p.url,image:p.image,productId:p.id,availability:p.availability,source:{kind:'product',id:p.id,title:p.name}});
      }
      for(const look of cat.seasonal||[]){
        bySeasonal[look.id]=[];
        (look.items||[]).forEach(item=>{
          const id=add(cat,{name:item.name,note:item.note,context:look.advice,seasons:[look.season],price:{amount:item.price,currency:look.currency||cat.currency,basis:'catalogue'},url:item.url,source:{kind:'seasonal',id:look.id,title:look.title}});
          if(id)bySeasonal[look.id].push(id);
        });
      }
      for(const f of cat.formulas||[]){
        const classes=(f.pieces||[]).map(name=>classify(name));
        const weight=classes.reduce((s,c)=>s+(c?ESTIMATE_WEIGHT[c.slot]:0),0)||1;
        byFormula[f.id]=[];
        (f.pieces||[]).forEach((name,i)=>{
          const c=classes[i];if(!c){skipped.push(`${cat.id}: ${name}`);return}
          const amount=f.basket?Math.round(f.basket.amount*ESTIMATE_WEIGHT[c.slot]/weight*(f.basket.currency==='USD'?100:1))/(f.basket.currency==='USD'?100:1):0;
          const id=add(cat,{name,context:f.rule,seasons:f.seasons,categories:f.categories,price:{amount,currency:f.basket?f.basket.currency:cat.currency,basis:'estimated'},url:cat.home_url,source:{kind:'formula',id:f.id,title:f.title}});
          if(id)byFormula[f.id].push(id);
        });
      }
    }
    // Aliases for earlier piece ids and product ids
    for(const p of pieces.values())aliases.set(p.id,p.id);
    const list=[...pieces.values()];
    const bySlot=Object.fromEntries(SLOTS.map(s=>[s,list.filter(p=>p.slot===s)]));
    return{pieces:list,byId:pieces,aliases,bySlot,byFormula,bySeasonal,skipped,resolve:id=>pieces.get(aliases.get(id)||id)||null};
  }

  // ---------------------------------------------------------------- scoring
  const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,v));
  const colourOf=(piece,overrides)=>{const o=overrides&&overrides[piece.id];return o&&COLOUR_BY_NAME[o]?{...COLOUR_BY_NAME[o],source:'preview'}:piece.colour};
  const isLeatherShoe=p=>p&&p.slot==='shoes'&&!['sneaker','canvas','espadrille'].includes(p.type)||p&&p.slot==='shoes'&&/leather|suede/.test(p.material);
  const brownish=c=>['brown','camel'].includes(c.family);
  function score(outfit,ctx={}){
    const slots=outfit.slots||outfit;const overrides=outfit.colours||ctx.colours||{};
    const get=s=>slots[s]||null;
    const worn=SLOTS.map(get).filter(Boolean);
    const notes=[];const note=(tone,text)=>notes.push({tone,text});
    const clothes=worn.filter(p=>!['watch','eyewear'].includes(p.slot));
    const tuck=ctx.tuck!==undefined?ctx.tuck:outfit.tuck!==false;
    if(!worn.length)return{score:0,label:'Start dressing',tone:'empty',parts:{colour:0,formality:0,season:0,proportion:0},notes:[{tone:'info',text:'Pick a top, bottoms and shoes to get a match chance.'}],brands:[],mode:'none',complete:false};
    // colour
    let colour=72;
    const fam=clothes.map(p=>colourOf(p,overrides));
    const families=new Set(fam.map(c=>c.family));
    if(clothes.length>=3&&families.size<=3){colour+=7;note('good','A tight palette of three colours or fewer.')}
    else if(families.size>=5){colour-=10;note('warn','Five or more colours in one outfit — edit it down to three.')}
    const hasBlack=fam.some(c=>c.family==='black'),hasBrown=fam.some(c=>c.family==='brown');
    if(hasBlack&&hasBrown&&clothes.length>=3){colour-=5;note('info','Black and brown together need a bridge colour such as charcoal or camel.')}
    const accents=new Set(fam.filter(c=>ROLE[c.family]==='accent').map(c=>c.family));
    if(accents.size===2){colour-=12;note('warn','Two accent colours compete — keep one and let neutrals carry the rest.')}
    else if(accents.size>2){colour-=28;note('warn','Three or more accent colours clash; swap one piece for a neutral.')}
    else if(accents.size===1&&clothes.length>=3){colour+=4;note('good','One accent colour against neutrals reads deliberate.')}
    const upper=get('outerwear')||get('layer')||get('top'),lower=get('bottom');
    if(upper&&lower){
      const cu=colourOf(upper,overrides),cl=colourOf(lower,overrides),d=Math.abs(lightness(cu.hex)-lightness(cl.hex));
      if(d<7&&cu.family===cl.family){colour+=6;note('good','Tonal column — the matching upper and lower lengthen the line.')}
      else if(d<7){colour-=9;note('warn','Upper and lower blur together; add contrast or go fully tonal.')}
      else if(d>72){colour-=4;note('info','Very high contrast between top and bottom — soften one side for an old-money feel.')}
      if(upper.material==='denim'&&lower.material==='denim'){if(d<12){colour-=12;note('warn','Two near-identical denim washes — separate them more clearly.')}else{colour+=4;note('good','Two clearly different denim washes look intentional.')}}
    }
    const shoes=get('shoes'),belt=get('belt');
    if(shoes&&belt&&isLeatherShoe(shoes)){
      const cs=colourOf(shoes,overrides),cb=colourOf(belt,overrides);
      if(brownish(cs)&&cb.family==='black'||cs.family==='black'&&brownish(cb)){colour-=10;note('warn','Belt and shoe leathers disagree — match brown with brown, black with black.')}
      else if(cs.family===cb.family||brownish(cs)&&brownish(cb)){colour+=5;note('good','Belt and shoes share one leather colour.')}
    }
    if(shoes&&lower&&isLeatherShoe(shoes)&&brownish(colourOf(shoes,overrides))&&colourOf(lower,overrides).family==='black'){colour-=5;note('info','Brown shoes under black trousers look unplanned; try black or charcoal.')}
    colour=clamp(colour);
    // formality
    const fs=clothes.map(p=>p.formality).filter(v=>typeof v==='number');
    let formality=100;
    if(fs.length>1){
      const spread=Math.max(...fs)-Math.min(...fs);
      formality=clamp(100-Math.max(0,spread-.5)*26);
      const highLow=(get('outerwear')&&get('outerwear').type==='blazer')&&shoes&&shoes.type==='sneaker'&&shoes.formality>=2.5;
      if(highLow){formality=clamp(formality+14);note('good','Blazer with clean leather sneakers — a deliberate smart-casual mix.')}
      else if(spread>=2.5)note('warn','Formality jumps between pieces — bring the dressiest and most casual items closer.');
      else if(spread<=1&&fs.length>=3)note('good','Every piece sits at the same level of formality.');
    }
    // season
    let season=100;const want=ctx.season&&ctx.season!=='all'?ctx.season:null;
    if(clothes.length){
      if(want){const fit=clothes.filter(p=>p.seasons.includes(want)).length/clothes.length;season=Math.round(40+60*fit);if(fit<1)note('warn',`${clothes.filter(p=>!p.seasons.includes(want)).map(p=>p.name).slice(0,2).join(' and ')} ${clothes.filter(p=>!p.seasons.includes(want)).length>1?'are':'is'} not a ${want} piece.`)}
      else{
        const counts=['spring','summer','fall','winter'].map(s=>clothes.filter(p=>p.seasons.includes(s)).length/clothes.length);
        const best=Math.max(...counts);season=Math.round(40+60*best);
        if(best<1)note('warn','These pieces belong to different seasons.');
      }
      const outer=get('outerwear');
      if(lower&&/shorts|bermuda/.test(lower.length)&&outer&&['overcoat','peacoat','puffer','parka','shortcoat','trench'].includes(outer.type)){season=clamp(season-30);note('warn','Shorts under a cold-weather coat send mixed signals.')}
      if(shoes&&shoes.type==='sandal'&&clothes.some(p=>['wool','cashmere','down','fleece'].includes(p.material))){season=clamp(season-18);note('warn','Sandals with wool or down layers split the seasons.')}
    }
    // proportion (the site's own fit rules)
    let proportion=76;const outer=get('outerwear');
    if(outer&&lower&&['wide','relaxed','barrel'].includes(lower.fit)){
      if(['thigh','knee'].includes(outer.length)){proportion-=14;note('warn','A long coat over wide trousers doubles the volume — pick a straighter leg or a shorter layer.')}
      else if(outer.length==='cropped'){proportion+=8;note('good','The cropped layer balances the fuller trouser.')}
    }
    if(outer&&outer.length==='knee'&&ctx.height&&ctx.height<168){proportion-=8;note('info','A knee-length coat shortens a frame under 168 cm; try mid-thigh.')}
    const top=get('top');
    if(top&&lower&&!/shorts|bermuda/.test(lower.length)){
      const tuckable=!['sweatshirt','sweater','halfzip','turtleneck','mockneck'].includes(top.type);
      if(tuck&&tuckable){if(belt){proportion+=5;note('good','Tucked with a belt — the waist is clearly defined.')}else if(lower.crease||lower.pleats){proportion-=3;note('info','A tucked top with tailored trousers wants a belt.')}}
      if(!tuck&&top.type==='shirt'&&lower.crease){proportion-=4;note('info','Tuck the shirt in with tailored trousers.')}
    }
    if(shoes&&lower&&/shorts|bermuda/.test(lower.length)&&(shoes.type==='boot'||shoes.type==='chelsea')){proportion-=15;note('warn','Boots with shorts cut the leg in half.')}
    if(get('layer')&&!top){proportion-=15;note('warn','Wear a shirt or tee under the knit layer.')}
    if(outer&&outer.slot==='outerwear'&&top&&top.oversized&&outer.length==='cropped'){proportion-=4}
    proportion=clamp(proportion);
    // total
    // Weighted blend, pulled down by the weakest dimension, then stretched so random
    // combinations land around 60 and only well-built outfits clear 80.
    const raw=.34*colour+.26*formality+.2*season+.2*proportion;
    const weakest=Math.min(colour,formality,season,proportion);
    let total=Math.round(60+(raw-Math.max(0,70-weakest)*.4-74)*1.7);
    const missing=CORE.filter(s=>!get(s));
    if(missing.length){total-=missing.length*14;note('info',`Add ${missing.map(s=>SLOT_LABELS[s].toLowerCase()).join(', ')} to complete the look.`)}
    total=clamp(total);
    const brands=[...new Set(clothes.concat(worn).map(p=>p.brand))];
    const label=total>=80?'Strong match':total>=65?'Good match':total>=50?'Risky':'Clash';
    const tone=total>=80?'strong':total>=65?'good':total>=50?'risky':'clash';
    notes.sort((a,b)=>({warn:0,info:1,good:2})[a.tone]-({warn:0,info:1,good:2})[b.tone]);
    return{score:total,label,tone,parts:{colour,formality,season,proportion},notes,brands,mode:brands.length>1?'crossover':'same-brand',complete:!missing.length};
  }

  // ---------------------------------------------------------------- search helpers
  const rng=seed=>{let t=seed>>>0||1;return()=>{t+=0x6D2B79F5;let r=Math.imul(t^t>>>15,1|t);r^=r+Math.imul(r^r>>>7,61|r);return((r^r>>>14)>>>0)/4294967296}};
  const pick=(list,rand)=>list[Math.floor(rand()*list.length)];
  function pool(w,slot,{brand=null,season=null,exclude=[]}={}){
    const ex=new Set(exclude);
    return(w.bySlot[slot]||[]).filter(p=>(!brand||p.brand===brand)&&(!season||season==='all'||p.seasons.includes(season))&&!ex.has(p.id));
  }
  const FILL_ORDER=['bottom','top','shoes','outerwear','layer','belt'];
  const OPTIONAL=new Set(['outerwear','layer','belt','watch','bag','eyewear']);
  // Beam search for the best way to fill the unlocked slots.
  function suggest(w,{locked={},brand=null,mode='crossover',season=null,slots=FILL_ORDER,count=5,beam=24,exclude=[],ctx={}}={}){
    const base={};for(const [s,p] of Object.entries(locked))if(p)base[s]=p;
    let lockBrand=brand;
    if(mode==='same-brand'&&!lockBrand){const first=Object.values(base)[0];lockBrand=first?first.brand:null}
    let beams=[{slots:{...base},score:score({slots:base},{...ctx,season}).score}];
    for(const slot of slots){
      if(base[slot])continue;
      const candidates=pool(w,slot,{brand:mode==='same-brand'?lockBrand:brand,season,exclude});
      const next=[];
      for(const b of beams){
        if(OPTIONAL.has(slot))next.push(b);
        const brandsSoFar=new Set(Object.values(b.slots).map(p=>p.brand));
        for(const c of candidates){
          if(mode==='same-brand'&&!lockBrand&&brandsSoFar.size&&!brandsSoFar.has(c.brand))continue;
          const slotsN={...b.slots,[slot]:c};
          next.push({slots:slotsN,score:score({slots:slotsN},{...ctx,season}).score});
        }
      }
      next.sort((a,b)=>b.score-a.score);
      // keep diversity: at most 3 beams sharing the same piece in this slot
      const seen=new Map(),kept=[];
      for(const n of next){const key=n.slots[slot]?n.slots[slot].id:'none';const k=seen.get(key)||0;if(k<3){kept.push(n);seen.set(key,k+1)}if(kept.length>=beam)break}
      beams=kept.length?kept:beams;
    }
    let results=beams.map(b=>({slots:b.slots,...score({slots:b.slots},{...ctx,season})}));
    if(mode==='crossover'){const mixed=results.filter(r=>r.brands.length>1);if(mixed.length)results=mixed.concat(results.filter(r=>r.brands.length<=1))}
    results.sort((a,b)=>b.score-a.score);
    const out=[],sig=new Set();
    for(const r of results){const s=SLOTS.map(k=>r.slots[k]?r.slots[k].id:'').join('|');if(sig.has(s))continue;sig.add(s);out.push(r);if(out.length>=count)break}
    return out;
  }
  function randomOutfit(w,{locked={},brand=null,mode='crossover',season=null,rand=Math.random,outerChance=.55,layerChance=.2,beltChance=.5}={}){
    const slots={...locked};
    let b=brand;
    if(mode==='same-brand'&&!b){const first=Object.values(locked).find(Boolean);b=first?first.brand:pick([...new Set(w.pieces.map(p=>p.brand))],rand)}
    const want={top:1,bottom:1,shoes:1,outerwear:outerChance,layer:layerChance,belt:beltChance};
    for(const [slot,chance] of Object.entries(want)){
      if(slots[slot]||rand()>chance)continue;
      const list=pool(w,slot,{brand:mode==='same-brand'?b:null,season});
      if(list.length)slots[slot]=pick(list,rand);
    }
    return slots;
  }
  // Weighted random roll: sample many outfits, then choose one with probability ∝ e^(score/6).
  function shuffle(w,opts={}){
    const rand=opts.seed?rng(opts.seed):Math.random,samples=opts.samples||260,minScore=opts.minScore??60;
    const rolls=[];
    for(let i=0;i<samples;i++){
      const slots=randomOutfit(w,{...opts,rand});
      if(opts.mode==='crossover'&&new Set(Object.values(slots).map(p=>p.brand)).size<2&&i<samples*.8)continue;
      const r=score({slots},{...opts.ctx,season:opts.season});rolls.push({slots,...r});
    }
    const good=rolls.filter(r=>r.score>=minScore&&r.complete);const list=good.length?good:rolls;
    const weights=list.map(r=>Math.exp(r.score/6)),sum=weights.reduce((a,b)=>a+b,0);
    let x=rand()*sum;for(let i=0;i<list.length;i++){x-=weights[i];if(x<=0)return list[i]}
    return list[list.length-1]||null;
  }
  // Exact combination counts + Monte Carlo odds for every catalogue and for crossover mixes.
  function odds(w,{samples=2500,season=null,seed=20260924,ctx={}}={}){
    const rand=rng(seed);
    const brands=[...new Set(w.pieces.map(p=>p.brand))];
    const count=(brand)=>{
      const n=s=>pool(w,s,{brand,season}).length;
      return n('top')*n('bottom')*n('shoes')*(n('outerwear')+1);
    };
    const sampleStats=(mode,brand)=>{
      let strong=0,good=0,sum=0,n=0,best=null;
      for(let i=0;i<samples;i++){
        const slots=randomOutfit(w,{mode,brand,season,rand,layerChance:0,beltChance:.4});
        if(mode==='crossover'&&new Set(Object.values(slots).map(p=>p.brand)).size<2)continue;
        if(!slots.top||!slots.bottom||!slots.shoes)continue;
        const r=score({slots},{...ctx,season});n++;sum+=r.score;if(r.score>=80)strong++;if(r.score>=65)good++;
        if(!best||r.score>best.score)best={score:r.score,pieces:Object.values(slots).map(p=>p.id)};
      }
      return{sampled:n,strong:n?strong/n:0,good:n?good/n:0,average:n?Math.round(sum/n):0,best};
    };
    const all=count(null);let same=0;
    const perBrand=brands.map(brand=>{const combos=count(brand);same+=combos;return{brand,label:(w.pieces.find(p=>p.brand===brand)||{}).brandLabel||brand,combinations:combos,...sampleStats('same-brand',brand)}});
    return{season:season||'all',samplesPerGroup:samples,brands:perBrand,crossover:{combinations:Math.max(0,all-same),...sampleStats('crossover',null)},total:all};
  }

  return{SLOTS,SLOT_LABELS,CORE,ACCESSORY,TYPES,PALETTES,COLOURS:COLOUR_BY_NAME,classify,build,score,suggest,shuffle,odds,randomOutfit,pool,lightness,rng,slugify};
});
