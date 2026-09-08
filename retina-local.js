(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const scene = $('sceneCanvas'), mCanvas = $('mCanvas'), pCanvas = $('pCanvas');
  const sctx = scene.getContext('2d'), mctx = mCanvas.getContext('2d'), pctx = pCanvas.getContext('2d');

  const work = document.createElement('canvas'); work.width = 720; work.height = 720;
  const wctx = work.getContext('2d', { willReadFrequently: true });
  const sampled = document.createElement('canvas'); sampled.width = 64; sampled.height = 64;
  const sampleCtx = sampled.getContext('2d');

  const presets = {
    coco149442: { src: './assets/coco/COCO_train2014_000000149442.jpg', scan: [[-.52,-.18],[-.18,.05],[.28,-.12],[.55,.22],[.12,.42],[-.42,.36]] },
    coco282590: { src: './assets/coco/COCO_train2014_000000282590.jpg', scan: [[-.48,-.30],[-.12,.10],[.38,-.14],[.55,.32],[.02,.45],[-.55,.25]] },
    coco261977: { src: './assets/coco/COCO_train2014_000000261977.jpg', scan: [[-.50,.12],[-.18,-.18],[.20,.04],[.48,-.30],[.52,.34],[-.22,.42]] },
    coco488689: { src: './assets/coco/COCO_train2014_000000488689.jpg', scan: [[-.50,-.22],[-.10,-.35],[.32,-.12],[.54,.20],[.08,.42],[-.46,.34]] }
  };

  $('presetImage').innerHTML = `
    <option value="coco149442">COCO #149442</option>
    <option value="coco282590">COCO #282590</option>
    <option value="coco261977">COCO #261977</option>
    <option value="coco488689">COCO #488689</option>`;

  const state = {
    image: new Image(), ready: false,
    fix: {x:0,y:0}, target: {x:0,y:0},
    auto: true, follow: false, showGrid: true, gridMode: 'both',
    mDensity: 2.5, pDensity: 15,
    scanIndex: 0, lastStep: 0, preset: 'coco149442'
  };
  let scanpath = presets[state.preset].scan;

  function coverImage(ctx,img,w,h){
    const ir = img.width/img.height, cr = w/h;
    let sw, sh, sx, sy;
    if (ir > cr) { sh = img.height; sw = sh*cr; sx = (img.width-sw)/2; sy = 0; }
    else { sw = img.width; sh = sw/cr; sx = 0; sy = (img.height-sh)/2; }
    ctx.clearRect(0,0,w,h);
    ctx.drawImage(img,sx,sy,sw,sh,0,0,w,h);
  }

  // Direct JavaScript port of the fixation-centered radial coordinate mapping
  // used by make_xy2ret_grid_r in the original DualStreamBrains repository.
  // No extra fixation-dependent blur, sharpening, or vignette is applied here.
  function mapRetinalToCartesian(u,v,fix,density,m=720,n=64){
    const rpMax = n/m;
    const a = Math.log(density)/rpMax;
    const b = Math.sqrt(Math.PI)*(1-Math.exp(a/2))/(1-Math.exp(a/2*rpMax));
    const xy2ret = (xy) => 2/a*Math.log(1-Math.sqrt(Math.PI)/b*(1-Math.exp(a/2))*xy);
    const ret2xy = (r) => b/Math.sqrt(Math.PI)*((1-Math.exp(a/2*r))/(1-Math.exp(a/2)));
    const fxLen = 1-Math.abs(fix.x), fyLen = 1-Math.abs(fix.y);
    const fxp = Math.sign(fix.x)*(n/m-xy2ret(fxLen));
    const fyp = Math.sign(fix.y)*(n/m-xy2ret(fyLen));
    const xp = u*(n/m)-fxp, yp = v*(n/m)-fyp;
    const rp = Math.hypot(xp,yp), theta = Math.atan2(yp,xp), r = ret2xy(rp);
    return {x:r*Math.cos(theta)+fix.x, y:r*Math.sin(theta)+fix.y};
  }

  function retinalPoint(i,j,density){
    const u=(i/63-.5)*2, v=(j/63-.5)*2;
    const p=mapRetinalToCartesian(u,v,state.fix,density);
    return {
      x:Math.max(0,Math.min(719,(p.x+1)*.5*719)),
      y:Math.max(0,Math.min(719,(p.y+1)*.5*719))
    };
  }

  function renderRetina(ctx,density){
    if(!state.ready) return;
    const src = wctx.getImageData(0,0,720,720);
    const dst = sampleCtx.createImageData(64,64);
    const sd=src.data, dd=dst.data;
    for(let j=0;j<64;j++) for(let i=0;i<64;i++) {
      const p=retinalPoint(i,j,density);
      const x=Math.round(p.x), y=Math.round(p.y);
      const si=(y*720+x)*4, di=(j*64+i)*4;
      dd[di]=sd[si]; dd[di+1]=sd[si+1]; dd[di+2]=sd[si+2]; dd[di+3]=255;
    }
    sampleCtx.putImageData(dst,0,0);
    ctx.imageSmoothingEnabled=true;
    ctx.clearRect(0,0,384,384);
    ctx.drawImage(sampled,0,0,384,384);
  }

  function drawGrid(density,color,stride){
    sctx.save(); sctx.fillStyle=color; sctx.globalAlpha=.74;
    for(let j=0;j<64;j+=stride) for(let i=0;i<64;i+=stride){
      const p=retinalPoint(i,j,density);
      if(p.x>=0&&p.x<=720&&p.y>=0&&p.y<=720){ sctx.beginPath(); sctx.arc(p.x,p.y,1.45,0,Math.PI*2); sctx.fill(); }
    }
    sctx.restore();
  }

  function renderScene(){
    if(!state.ready) return;
    sctx.clearRect(0,0,720,720); sctx.drawImage(work,0,0);
    const fx=(state.fix.x+1)*360, fy=(state.fix.y+1)*360;
    if(state.showGrid){
      if(state.gridMode==='both'||state.gridMode==='m') drawGrid(state.mDensity,'#ffc66d',4);
      if(state.gridMode==='both'||state.gridMode==='p') drawGrid(state.pDensity,'#6ee7f2',4);
    }
    sctx.save(); sctx.strokeStyle='#fff'; sctx.lineWidth=2; sctx.shadowColor='#6ee7f2'; sctx.shadowBlur=14;
    sctx.beginPath(); sctx.arc(fx,fy,10,0,Math.PI*2); sctx.stroke();
    sctx.beginPath(); sctx.moveTo(fx-17,fy); sctx.lineTo(fx-5,fy); sctx.moveTo(fx+5,fy); sctx.lineTo(fx+17,fy);
    sctx.moveTo(fx,fy-17); sctx.lineTo(fx,fy-5); sctx.moveTo(fx,fy+5); sctx.lineTo(fx,fy+17); sctx.stroke(); sctx.restore();
  }

  function updateEyes(){
    const dx=state.fix.x*13, dy=state.fix.y*9;
    document.querySelector('.pupil-left').style.transform=`translate(${dx}px,${dy}px)`;
    document.querySelector('.pupil-right').style.transform=`translate(${dx}px,${dy}px)`;
  }

  function renderAll(){
    if(!state.ready) return;
    renderScene();
    renderRetina(mctx,state.mDensity);
    renderRetina(pctx,state.pDensity);
    $('fixationText').textContent=`fixation ${state.fix.x.toFixed(2)}, ${state.fix.y.toFixed(2)}`;
    $('mDensityLabel').textContent=state.mDensity.toFixed(1)+'×';
    $('pDensityLabel').textContent=state.pDensity.toFixed(1)+'×';
    updateEyes();
  }

  function setImage(src){
    state.ready=false;
    const img=new Image();
    img.onload=()=>{ state.image=img; coverImage(wctx,img,720,720); state.ready=true; renderAll(); };
    img.onerror=()=>{ state.ready=false; console.error('Unable to load local demo image:',src); };
    img.src=src;
  }

  function setTarget(x,y){ state.target.x=Math.max(-.9,Math.min(.9,x)); state.target.y=Math.max(-.9,Math.min(.9,y)); }
  function selectPreset(key){
    if(!presets[key]) return;
    state.preset=key; scanpath=presets[key].scan; state.scanIndex=0; state.fix={x:0,y:0}; setTarget(...scanpath[0]); setImage(presets[key].src);
  }
  function pointerToFix(e){ const r=scene.getBoundingClientRect(); return {x:((e.clientX-r.left)/r.width)*2-1,y:((e.clientY-r.top)/r.height)*2-1}; }

  scene.addEventListener('click',e=>{ const p=pointerToFix(e); state.auto=false; syncAutoButton(); setTarget(p.x,p.y); });
  scene.addEventListener('pointermove',e=>{ if(!state.follow)return; const p=pointerToFix(e); state.auto=false; syncAutoButton(); setTarget(p.x,p.y); });
  $('followCursor').addEventListener('change',e=>{ state.follow=e.target.checked; if(state.follow){state.auto=false;syncAutoButton();} });
  $('showGrid').addEventListener('change',e=>{ state.showGrid=e.target.checked; renderScene(); });
  $('gridMode').addEventListener('change',e=>{ state.gridMode=e.target.value; renderScene(); });
  $('presetImage').addEventListener('change',e=>selectPreset(e.target.value));
  $('imageUpload').addEventListener('change',e=>{
    const f=e.target.files&&e.target.files[0]; if(!f)return;
    const url=URL.createObjectURL(f), img=new Image(); state.ready=false;
    img.onload=()=>{ state.image=img; coverImage(wctx,img,720,720); state.ready=true; renderAll(); URL.revokeObjectURL(url); };
    img.src=url;
  });

  function syncAutoButton(){
    const b=$('autoButton'); b.setAttribute('aria-pressed',String(state.auto));
    b.querySelector('.button-icon').textContent=state.auto?'Ⅱ':'▶';
    b.querySelector('.button-label').textContent=state.auto?'Pause eye movement':'Auto eye movement';
  }
  $('autoButton').addEventListener('click',()=>{
    state.auto=!state.auto; state.follow=false; $('followCursor').checked=false; syncAutoButton();
    if(state.auto){ state.scanIndex=(state.scanIndex+1)%scanpath.length; setTarget(...scanpath[state.scanIndex]); state.lastStep=performance.now(); }
  });

  function densityChange(which,val){
    state[which]=Number(val); const prefix=which==='mDensity'?'m':'p';
    $(prefix+'DensityOutput').textContent=Number(val).toFixed(1); renderAll();
  }
  $('mDensity').addEventListener('input',e=>densityChange('mDensity',e.target.value));
  $('pDensity').addEventListener('input',e=>densityChange('pDensity',e.target.value));
  $('resetDensity').addEventListener('click',()=>{
    $('mDensity').value='2.5'; $('pDensity').value='15'; densityChange('mDensity',2.5); densityChange('pDensity',15);
  });

  let lastRender=0;
  function animate(t){
    if(state.auto && t-state.lastStep>1850){ state.scanIndex=(state.scanIndex+1)%scanpath.length; setTarget(...scanpath[state.scanIndex]); state.lastStep=t; }
    const dx=state.target.x-state.fix.x, dy=state.target.y-state.fix.y, dist=Math.hypot(dx,dy);
    if(dist>.001){ const gain=dist>.22?.26:.12; state.fix.x+=dx*gain; state.fix.y+=dy*gain; if(t-lastRender>45){renderAll();lastRender=t;} }
    requestAnimationFrame(animate);
  }

  selectPreset('coco149442'); state.lastStep=performance.now(); syncAutoButton(); requestAnimationFrame(animate);
})();
