(() => {
  'use strict';

  const flyButton = document.querySelector('[data-mode="fly"]');
  if (!flyButton) return;

  const modeButtons = [...document.querySelectorAll('[data-mode]')];
  const lab = document.querySelector('[data-fly-lab]');
  const panelEyebrow = document.querySelector('[data-panel-eyebrow]');
  const panelTitle = document.querySelector('[data-panel-title]');
  const panelLede = document.querySelector('[data-panel-lede]');
  const scienceNote = document.querySelector('[data-science-note]');
  const liveState = document.querySelector('[data-live-state]');
  const liveCopy = document.querySelector('[data-live-copy]');
  const hint = document.querySelector('[data-hint]');
  const selectedName = document.querySelector('[data-selected-name]');
  const selectedRegion = document.querySelector('[data-selected-region]');
  const selectedCount = document.querySelector('[data-selected-count]');
  const selectedOut = document.querySelector('[data-selected-out]');
  const selectedIn = document.querySelector('[data-selected-in]');
  const labels = [...document.querySelectorAll('[data-stat-label]')];
  const visible = document.querySelector('[data-visible]');
  const edgeCount = document.querySelector('[data-edge-count]');
  const edgeCopy = document.querySelector('[data-edge-copy]');
  const leftLabel = document.querySelector('[data-left-label]');
  const leftCopy = document.querySelector('[data-left-copy]');
  const rightLabel = document.querySelector('[data-right-label]');
  const breezeRange = document.querySelector('[data-breeze-range]');
  const breezeOutput = document.querySelector('[data-breeze-output]');
  const windDir = document.querySelector('[data-wind-dir]');
  const windOutput = document.querySelector('[data-wind-output]');
  const flyStateEl = document.querySelector('[data-fly-state]');
  const flyFocusEl = document.querySelector('[data-fly-focus]');
  const flyAltitudeEl = document.querySelector('[data-fly-altitude]');
  const flyReactionEl = document.querySelector('[data-fly-reaction]');
  const flyLog = document.querySelector('[data-fly-log]');

  const canvas = document.createElement('canvas');
  canvas.className = 'fly-lab-stage';
  canvas.setAttribute('aria-label', 'Fly Lab behavioural sandbox');
  document.body.insertBefore(canvas, document.querySelector('.ui-shell'));
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(devicePixelRatio || 1, 2);

  const state = {
    active: false,
    width: innerWidth,
    height: innerHeight,
    x: 0, y: 0, vx: 0, vy: 0, angle: 0,
    altitude: 0, wing: 0, leg: 0,
    behavior: 'idle', focus: 'Ambient scan', reaction: 'Calm',
    target: null, objects: [], gust: 0, startle: 0,
    breeze: 0, wind: 0, groomClock: 0, timer: 0,
    lastTime: performance.now()
  };

  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const lerp = (a,b,t) => a+(b-a)*t;
  const rnd = (a,b) => a+Math.random()*(b-a);

  function stage() {
    const w = Math.min(innerWidth * .48, 760);
    const h = Math.min(innerHeight * .62, 640);
    return {x:innerWidth*.5-w*.5,y:innerHeight*.5-h*.46,w,h,cx:innerWidth*.5,cy:innerHeight*.5,floor:innerHeight*.5+h*.18};
  }

  function resize() {
    state.width = innerWidth; state.height = innerHeight;
    canvas.width = Math.floor(innerWidth*dpr); canvas.height = Math.floor(innerHeight*dpr);
    canvas.style.width = innerWidth+'px'; canvas.style.height = innerHeight+'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  addEventListener('resize', resize, {passive:true}); resize();

  function setBehavior(name, focus, reaction) {
    state.behavior = name;
    if (focus) state.focus = focus;
    if (reaction) state.reaction = reaction;
  }
  function log(text) { if (flyLog) flyLog.textContent = text; }

  function addObject(type) {
    const o={type,x:0,y:0,vx:0,vy:0,r:9,life:8,glow:1};
    if(type==='food'){
      o.x=clamp(state.x+rnd(-130,130),-220,220); o.y=clamp(state.y+rnd(45,85),-80,130); o.r=8;o.life=18;
      setBehavior('curious','Food cue','Orienting'); log('Se soltó una partícula de comida. La mosca se orienta, rastrea proximidad y se aproxima.');
    } else if(type==='obstacle'){
      o.x=clamp(state.x+rnd(-190,190),-260,260);o.y=clamp(state.y+rnd(-70,110),-120,140);o.r=rnd(18,28);o.life=999;
      log('Obstáculo añadido. La trayectoria se corrige automáticamente cuando la mosca se acerca.');
    } else if(type==='throw'){
      o.x=rnd(-310,310);o.y=-170;o.r=7;o.life=1.7;
      const tx=state.x+rnd(-45,45),ty=state.y+rnd(-30,30);o.vx=(tx-o.x)*1.6;o.vy=(ty-o.y)*1.6;
      setBehavior('alert','Nearby object','Startle ready');log('Objeto lanzado. Si pasa cerca activa una respuesta rápida de sobresalto y escape.');
    } else if(type==='light'){
      o.x=clamp(state.x+rnd(-170,170),-250,250);o.y=clamp(state.y-rnd(80,150),-190,40);o.r=14;o.life=.9;
      setBehavior('alert','Light pulse','Reorientation');log('Destello activado. La mosca reajusta orientación corporal y antenas ante el cambio súbito.');
    }
    state.objects.push(o);
  }

  function clearScene(){state.objects=[];state.target=null;state.startle=0;state.altitude=0;setBehavior('idle','Ambient scan','Calm');log('Escena limpia. La mosca vuelve a conducta basal y exploración suave.');}
  function gust(){state.gust=1;setBehavior('bracing','Airflow','Bracing wings');log('Mini brisa aplicada. La mosca compensa postura, antenas y alas; con flujo alto puede despegar.');}

  function nearest(type){
    let best=null,dist=1e9;
    for(const o of state.objects){if(o.type!==type)continue;const d=Math.hypot(o.x-state.x,o.y-state.y);if(d<dist){dist=d;best=o;}}
    return best?{o:best,dist}:null;
  }

  function update(dt){
    state.breeze=(+breezeRange?.value||0)/100; state.wind=(+windDir?.value||0)/100;
    state.gust=Math.max(0,state.gust-dt*.8); state.groomClock+=dt;
    const windForce=state.breeze*42+state.gust*95, wx=state.wind*windForce, wy=-state.breeze*6;

    for(const o of state.objects){o.life-=dt;if(o.type==='throw'){o.x+=o.vx*dt;o.y+=o.vy*dt;o.vy+=220*dt;}if(o.type==='light')o.glow=Math.max(0,o.glow-dt*1.4);}
    state.objects=state.objects.filter(o=>o.life>0);

    const threat=nearest('throw'), food=nearest('food'), light=nearest('light');
    if(threat&&threat.dist<70){
      state.startle=1;state.altitude=Math.max(state.altitude,18);
      const dx=state.x-threat.o.x,dy=state.y-threat.o.y,m=Math.hypot(dx,dy)||1;state.vx+=dx/m*160;state.vy+=dy/m*130;
      setBehavior('startled','Threat avoidance','Rapid escape');
    }
    if(light&&light.dist<125&&state.startle<.55){state.vx+=Math.sign(state.x-light.o.x||1)*14*dt;setBehavior('alert','Light pulse','Reorientation');}

    if(food&&state.startle<.3){
      const dx=food.o.x-state.x,dy=food.o.y-state.y,d=Math.hypot(dx,dy);
      if(d>18){state.target={x:food.o.x,y:food.o.y};setBehavior('walking','Food cue','Approaching');}
      else{state.vx*=.84;state.vy*=.84;state.altitude=lerp(state.altitude,0,.2);setBehavior('feeding','Food cue','Proboscis extended');food.o.life-=dt*1.5;}
    }

    if(state.startle>.02){state.startle=Math.max(0,state.startle-dt*.7);state.altitude=Math.min(38,state.altitude+dt*30);}
    else if(windForce>44){state.altitude=lerp(state.altitude,14+state.breeze*15,.06);state.vx+=wx*dt*.16;setBehavior(state.altitude>8?'flight':'bracing','Airflow',state.altitude>8?'Hover correction':'Wind compensation');}
    else state.altitude=lerp(state.altitude,0,.08);

    if(state.target&&state.startle<.3){const dx=state.target.x-state.x,dy=state.target.y-state.y,d=Math.hypot(dx,dy);if(d<10)state.target=null;else{state.vx+=dx/d*55*dt;state.vy+=dy/d*55*dt;}}
    if(!state.target&&!food&&state.startle<.15&&Math.random()>.994){state.target={x:clamp(state.x+rnd(-120,120),-250,250),y:clamp(state.y+rnd(-80,80),-135,135)};setBehavior('walking','Exploration','Sampling space');}
    if(!state.target&&!food&&state.startle<.15&&state.groomClock>8&&Math.random()>.988){state.groomClock=0;state.timer=1.6;setBehavior('grooming','Self-cleaning','Leg sweep');}
    if(state.timer>0){state.timer-=dt;if(state.timer<=0&&state.behavior==='grooming')setBehavior('idle','Ambient scan','Calm');}

    for(const o of state.objects){if(o.type!=='obstacle')continue;const dx=state.x-o.x,dy=state.y-o.y,d=Math.hypot(dx,dy),min=o.r+25;if(d<min){const nx=dx/(d||1),ny=dy/(d||1);state.x=o.x+nx*min;state.y=o.y+ny*min;state.vx+=nx*15;state.vy+=ny*15;setBehavior('walking','Obstacle','Avoidance path');}}

    state.vx+=wx*dt*(state.altitude>4?.1:.04);state.vy+=wy*dt*.05;state.vx*=state.altitude>2?.97:.9;state.vy*=state.altitude>2?.97:.9;
    state.x=clamp(state.x+state.vx*dt,-295,295);state.y=clamp(state.y+state.vy*dt,-170,170);
    if(Math.abs(state.vx)+Math.abs(state.vy)>1)state.angle=lerp(state.angle,Math.atan2(state.vy,state.vx),.12);
    state.leg+=dt*(1.5+Math.min(3.5,Math.hypot(state.vx,state.vy)*.03));
    state.wing+=dt*(state.altitude>3?38:8+state.gust*20+state.breeze*8);
    if(!state.target&&!food&&state.startle<.1&&Math.hypot(state.vx,state.vy)<6&&state.altitude<2&&!['grooming','feeding'].includes(state.behavior))setBehavior('idle','Ambient scan',state.breeze>.2?'Postural compensation':'Calm');

    if(flyStateEl)flyStateEl.textContent=state.behavior.toUpperCase();
    if(flyFocusEl)flyFocusEl.textContent=state.focus;
    if(flyAltitudeEl)flyAltitudeEl.textContent=Math.round(state.altitude)+' px';
    if(flyReactionEl)flyReactionEl.textContent=state.reaction;
    if(selectedRegion)selectedRegion.textContent=state.behavior.toUpperCase();
    if(selectedOut)selectedOut.textContent=Math.round((state.startle+state.gust*.6)*100)+'%';
    if(selectedIn)selectedIn.textContent=Math.round(state.breeze*100)+'%';
    if(visible)visible.textContent=String(1+state.objects.length);
    if(edgeCount)edgeCount.textContent=String(state.objects.length);
    if(breezeOutput)breezeOutput.textContent=Math.round(state.breeze*100)+'%';
    if(windOutput)windOutput.textContent=String(Math.round(state.wind*100));
  }

  function arrow(x1,y1,x2,y2,a){ctx.save();ctx.strokeStyle=`rgba(190,218,255,${a})`;ctx.fillStyle=`rgba(190,218,255,${a})`;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();const ang=Math.atan2(y2-y1,x2-x1);ctx.beginPath();ctx.moveTo(x2,y2);ctx.lineTo(x2-Math.cos(ang-.5)*7,y2-Math.sin(ang-.5)*7);ctx.lineTo(x2-Math.cos(ang+.5)*7,y2-Math.sin(ang+.5)*7);ctx.fill();ctx.restore();}

  function drawFly(s,now){
    const x=s.cx+state.x,y=s.floor+state.y-state.altitude,scale=1+state.altitude*.006,wing=Math.sin(state.wing);
    ctx.save();ctx.fillStyle=`rgba(0,0,0,${.18+state.altitude*.01})`;ctx.beginPath();ctx.ellipse(s.cx+state.x,s.floor+state.y+12,42+state.altitude*.5,14+state.altitude*.12,0,0,Math.PI*2);ctx.fill();ctx.restore();
    ctx.save();ctx.translate(x,y);ctx.rotate(state.angle);ctx.scale(scale,scale);
    const halo=ctx.createRadialGradient(0,0,5,0,0,78+state.altitude);halo.addColorStop(0,'rgba(255,255,255,.58)');halo.addColorStop(.22,'rgba(154,197,255,.42)');halo.addColorStop(.55,'rgba(73,111,255,.14)');halo.addColorStop(1,'rgba(23,45,120,0)');ctx.fillStyle=halo;ctx.beginPath();ctx.arc(0,0,80+state.altitude,0,Math.PI*2);ctx.fill();
    for(const side of [-1,1]){ctx.save();const flare=.25+Math.abs(wing)*(state.altitude>1?.75:.28)+state.gust*.22;ctx.rotate(side*(.55+flare));const wg=ctx.createLinearGradient(side*4,-22,side*52,18);wg.addColorStop(0,'rgba(255,255,255,.58)');wg.addColorStop(.45,'rgba(161,203,255,.25)');wg.addColorStop(1,'rgba(161,203,255,0)');ctx.fillStyle=wg;ctx.strokeStyle='rgba(235,246,255,.32)';ctx.shadowColor='rgba(134,175,255,.35)';ctx.shadowBlur=18;ctx.beginPath();ctx.ellipse(side*23,-4,37,14,side*.18,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore();}
    for(const side of [-1,1]){ctx.save();ctx.strokeStyle='rgba(220,239,255,.56)';ctx.lineWidth=1.25;ctx.shadowColor='rgba(128,170,255,.45)';ctx.shadowBlur=9;for(let i=0;i<3;i++){const oy=-12+i*11,sw=Math.sin(state.leg+i*.7)*(state.behavior==='grooming'&&i===0?7:3.5);ctx.beginPath();ctx.moveTo(side*4,oy);ctx.quadraticCurveTo(side*(18+i*4),oy+sw,side*(34+i*7),oy+8+sw*.5);ctx.stroke();}ctx.restore();}
    ctx.shadowColor='rgba(96,142,255,.48)';ctx.shadowBlur=28;const bg=ctx.createLinearGradient(-12,-38,12,55);bg.addColorStop(0,'#ffffff');bg.addColorStop(.18,'#bfe6ff');bg.addColorStop(.48,'#4f7cff');bg.addColorStop(.78,'#162a76');bg.addColorStop(1,'#070b18');ctx.fillStyle=bg;ctx.strokeStyle='rgba(255,255,255,.32)';ctx.lineWidth=1.1;ctx.beginPath();ctx.ellipse(0,0,18,23,0,0,Math.PI*2);ctx.fill();ctx.stroke();
    const ag=ctx.createLinearGradient(-7,12,8,50);ag.addColorStop(0,'#eaf8ff');ag.addColorStop(.25,'#78b7ff');ag.addColorStop(.7,'#263f9c');ag.addColorStop(1,'#081022');ctx.fillStyle=ag;ctx.beginPath();ctx.ellipse(0,32,12,22,0,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.fillStyle='#f2fbff';ctx.beginPath();ctx.ellipse(0,-26,11,14,0,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='white';ctx.shadowBlur=10;ctx.beginPath();ctx.ellipse(-4,-28,4.2,5.8,0,0,Math.PI*2);ctx.ellipse(4,-28,4.2,5.8,0,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
    ctx.strokeStyle='rgba(230,244,255,.8)';for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(side*3,-36);ctx.quadraticCurveTo(side*12,-46+Math.sin(now*.004+side)*3,side*17,-57);ctx.stroke();}
    ctx.font='500 9px Inter,sans-serif';ctx.fillStyle='rgba(220,236,255,.68)';ctx.fillText('head',18,-28);ctx.fillText('thorax',22,-2);ctx.fillText('abdomen',18,34);ctx.fillText('wings',-70,-14);ctx.fillText('legs',-54,18);ctx.restore();
  }

  function draw(now){
    const s=stage();ctx.clearRect(0,0,state.width,state.height);
    const g=ctx.createRadialGradient(s.cx,s.cy-20,18,s.cx,s.cy,s.w*.84);g.addColorStop(0,'rgba(86,119,224,.19)');g.addColorStop(.34,'rgba(20,27,54,.10)');g.addColorStop(1,'rgba(0,0,0,.38)');ctx.fillStyle=g;ctx.fillRect(0,0,state.width,state.height);
    const desk=ctx.createLinearGradient(0,s.floor-90,0,s.floor+140);desk.addColorStop(0,'rgba(13,16,24,.2)');desk.addColorStop(.5,'rgba(7,9,14,.46)');desk.addColorStop(1,'rgba(2,3,5,.82)');ctx.fillStyle=desk;ctx.fillRect(s.x,s.floor-96,s.w,190);
    ctx.strokeStyle='rgba(112,145,255,.055)';ctx.lineWidth=1;for(let i=0;i<=6;i++){const yy=s.floor-60+i*26;ctx.beginPath();ctx.moveTo(s.x+26,yy);ctx.lineTo(s.x+s.w-26,yy);ctx.stroke();}for(let i=0;i<=8;i++){const xx=s.x+24+i*((s.w-48)/8);ctx.beginPath();ctx.moveTo(xx,s.floor-74);ctx.lineTo(xx,s.floor+110);ctx.stroke();}
    ctx.strokeStyle='rgba(205,225,255,.13)';ctx.beginPath();ctx.moveTo(s.x+26,s.floor+10);ctx.lineTo(s.x+s.w-26,s.floor+10);ctx.stroke();
    const ba=clamp(state.breeze*.6+state.gust*.6,0,.9);if(ba>.02){const dir=state.wind===0?1:Math.sign(state.wind);for(let i=0;i<4;i++){const yy=s.floor-70+i*38,sx=dir>0?s.x+40:s.x+s.w-40;arrow(sx,yy,sx+dir*72,yy,.18+ba*.28);}}
    for(const o of state.objects){const ox=s.cx+o.x,oy=s.floor+o.y;if(o.type==='food'){ctx.shadowColor='rgba(255,212,107,.5)';ctx.shadowBlur=18;ctx.fillStyle='rgba(255,212,107,.96)';ctx.beginPath();ctx.arc(ox,oy+4,o.r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;}else if(o.type==='obstacle'){ctx.fillStyle='rgba(210,225,255,.08)';ctx.strokeStyle='rgba(150,180,255,.10)';ctx.beginPath();ctx.roundRect(ox-o.r,oy-o.r*.55,o.r*2.1,o.r*1.2,6);ctx.fill();ctx.stroke();}else if(o.type==='throw'){ctx.shadowColor='rgba(135,170,255,.4)';ctx.shadowBlur=20;ctx.fillStyle=`rgba(245,250,255,${.6*clamp(o.life,0,1)})`;ctx.beginPath();ctx.arc(ox,oy,o.r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;}else if(o.type==='light'){const r=16+(1-o.life)*80;ctx.strokeStyle=`rgba(255,240,170,${o.glow*.4})`;ctx.beginPath();ctx.arc(ox,oy,r,0,Math.PI*2);ctx.stroke();}}
    drawFly(s,now);
    const rg=ctx.createRadialGradient(s.cx+state.x,s.floor+state.y+20,4,s.cx+state.x,s.floor+state.y+20,70+state.altitude);rg.addColorStop(0,'rgba(120,165,255,.15)');rg.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=rg;ctx.beginPath();ctx.ellipse(s.cx+state.x*.94,s.floor+state.y+25,65+state.altitude,17,0,0,Math.PI*2);ctx.fill();
    if(state.target&&state.behavior!=='feeding')arrow(s.cx+state.x,s.floor+state.y-state.altitude,s.cx+state.target.x,s.floor+state.target.y,.18);
  }

  function activate(){
    state.active=true;document.body.classList.add('is-fly-mode');if(lab)lab.hidden=false;
    if(panelEyebrow)panelEyebrow.textContent='BEHAVIOURAL ACTOR';if(panelTitle)panelTitle.innerHTML='LIVE<br>FLY.';if(panelLede)panelLede.textContent='Mosca glowing en una mesa de trabajo oscura. Probá brisa, objetos, comida, luz y obstáculos para observar respuestas conductuales aproximadas.';
    if(scienceNote)scienceNote.textContent='FLY LAB es una capa visual/behavioural experimental: las reacciones son aproximaciones interactivas, no una simulación biológica exacta del animal.';
    if(liveCopy)liveCopy.textContent='FLY LAB ACTIVE';if(liveState){liveState.classList.remove('is-live');liveState.classList.add('is-warning');}
    if(selectedName)selectedName.textContent='ADULT FLY';if(selectedRegion)selectedRegion.textContent='IDLE';if(selectedCount)selectedCount.textContent='2 WINGS · 6 LEGS';if(labels[0])labels[0].textContent='STATE';if(labels[1])labels[1].textContent='PARTS';if(labels[2])labels[2].textContent='ALERT';if(labels[3])labels[3].textContent='AIRFLOW';
    if(leftLabel)leftLabel.textContent='ACTORS';if(leftCopy)leftCopy.textContent='fly + environment';if(rightLabel)rightLabel.textContent='TOOLS';if(edgeCopy)edgeCopy.textContent='scene stimuli';if(hint)hint.textContent='CLICK STAGE TO RELOCATE · USE TOOLS TO ALTER THE ENVIRONMENT';
  }

  function deactivate(){
    state.active=false;document.body.classList.remove('is-fly-mode');if(lab)lab.hidden=true;
    if(panelEyebrow)panelEyebrow.textContent='CONNECTOME NAVIGATOR';if(panelTitle)panelTitle.innerHTML='139,255<br>NEURONS.';if(panelLede)panelLede.textContent='Explorá circuitos del cerebro completo de una mosca adulta como una red navegable.';
    if(scienceNote)scienceNote.textContent='El cableado y los conteos provienen del conectoma. La disposición espacial de esta interfaz es una proyección visual, no una reconstrucción anatómica 1:1. “Signal” es una simulación exploratoria.';
    if(liveCopy)liveCopy.textContent='PROJECTION MODE';if(liveState)liveState.classList.remove('is-warning');
    if(labels[0])labels[0].textContent='REGION';if(labels[1])labels[1].textContent='NEURONS';if(labels[2])labels[2].textContent='OUTFLOW';if(labels[3])labels[3].textContent='INFLOW';
    if(leftLabel)leftLabel.textContent='VISIBLE';if(leftCopy)leftCopy.textContent='sampled neurons';if(rightLabel)rightLabel.textContent='CONNECTIONS';
  }

  modeButtons.forEach(btn=>btn.addEventListener('click',()=>{btn.dataset.mode==='fly'?activate():deactivate();}));
  document.querySelectorAll('[data-fly-action]').forEach(btn=>btn.addEventListener('click',()=>{const a=btn.dataset.flyAction;if(a==='gust')gust();else if(a==='throw')addObject('throw');else if(a==='food')addObject('food');else if(a==='light')addObject('light');else if(a==='obstacle')addObject('obstacle');else if(a==='clear')clearScene();}));
  if(breezeRange)breezeRange.addEventListener('input',()=>{if(breezeOutput)breezeOutput.textContent=breezeRange.value+'%';});
  if(windDir)windDir.addEventListener('input',()=>{if(windOutput)windOutput.textContent=windDir.value;});

  canvas.addEventListener('pointerup',e=>{if(!state.active)return;const s=stage();state.target={x:clamp(e.clientX-s.cx,-280,280),y:clamp(e.clientY-s.floor,-160,160)};setBehavior('walking','Manual waypoint','Directed move');log('Waypoint manual definido. La mosca camina hacia el punto marcado sobre la mesa.');});

  function frame(now){
    const dt=Math.min(.033,(now-state.lastTime)/1000||.016);state.lastTime=now;
    if(state.active){update(dt);draw(now);}requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
