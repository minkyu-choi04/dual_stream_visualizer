(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const scene = $('sceneCanvas'), mCanvas = $('mCanvas'), pCanvas = $('pCanvas');
  const sctx = scene.getContext('2d'), mctx = mCanvas.getContext('2d'), pctx = pCanvas.getContext('2d');

  const work = document.createElement('canvas'); work.width = 720; work.height = 720;
  const wctx = work.getContext('2d', {willReadFrequently:true});
  const sampled = document.createElement('canvas'); sampled.width = 64; sampled.height = 64;
  const sampleCtx = sampled.getContext('2d');
  const blurCanvas = document.createElement('canvas'); blurCanvas.width = 720; blurCanvas.height = 720;
  const blurCtx = blurCanvas.getContext('2d');
  const foveatedCanvas = document.createElement('canvas'); foveatedCanvas.width = 720; foveatedCanvas.height = 720;
  const foveatedCtx = foveatedCanvas.getContext('2d');

  const cocoBase = 'https://images.cocodataset.org/train2014/';
  const presets = {
    coco149442: {
      src: cocoBase + 'COCO_train2014_000000149442.jpg',
      page: 'http://cocodataset.org/#explore?id=149442',
      scan: [[-.52,-.18],[-.18,.05],[.28,-.12],[.55,.22],[.12,.42],[-.42,.36]]
    },
    coco282590: {
      src: cocoBase + 'COCO_train2014_000000282590.jpg',
      page: 'http://cocodataset.org/#explore?id=282590',
      scan: [[-.48,-.3],[-.12,.1],[.38,-.14],[.55,.32],[.02,.45],[-.55,.25]]
    },
    coco261977: {
      src: cocoBase + 'COCO_train2014_000000261977.jpg',
      page: 'http://cocodataset.org/#explore?id=261977',
      scan: [[-.5,.12],[-.18,-.18],[.2,.04],[.48,-.3],[.52,.34],[-.22,.42]]
    },
    coco488689: {
      src: cocoBase + 'COCO_train2014_000000488689.jpg',
      page: 'http://cocodataset.org/#explore?id=488689',
      scan: [[-.5,-.22],[-.1,-.35],[.32,-.12],[.54,.2],[.08,.42],[-.46,.34]]
    }
  };

  $('presetImage').innerHTML = `
    <option value="coco149442">COCO #149442</option>
    <option value="coco282590">COCO #282590</option>
    <option value="coco261977">COCO #261977</option>
    <option value="coco488689">COCO #488689</option>`;

  const state = {
    image: null,
    ready: false,
    fix: {x:0,y:0},
    target: {x:0,y:0},
    auto: true,
    follow: false,
    showGrid: true,
    gridMode: 'both',
    mDensity: 2.5,
    pDensity: 15,
    scanIndex: 0,
    lastStep: 0,
    preset: 'coco149442'
  };

  let scanpath = presets[state.preset].scan;
  let pixelReadAvailable = true;

  function coverImage(ctx,img,w,h){
    const ir=img.width/img.height, cr=w/h; let sw,sh,sx,sy;
    if(ir>cr){sh=img.height;sw=sh*cr;sx=(img.width-sw)/2;sy=0}
    else{sw=img.width;sh=sw/cr;sx=0;sy=(img.height-sh)/2}
    ctx.clearRect(0,0,w,h);ctx.drawImage(img,sx,sy,sw,sh,0,0,w,h);
  }

  // JS port of make_xy2ret_grid_r radial mapping. Coordinates are normalized to [-1,1].
  function mapRetinalToCartesian(u,v,fix,density,m=720,n=64){
    const rpMax=n/m, a=Math.log(density)/rpMax;
    const b=Math.sqrt(Math.PI)*(1-Math.exp(a/2))/(1-Math.exp(a/2*rpMax));
    const convXY2Ret=(xy)=>2/a*Math.log(1-Math.sqrt(Math.PI)/b*(1-Math.exp(a/2))*xy);
    const convRet2XY=(r)=>b/Math.sqrt(Math.PI)*((1-Math.exp(a/2*r))/(1-Math.exp(a/2)));
    const fxLen=1-Math.abs(fix.x), fyLen=1-Math.abs(fix.y);
    const fxp=Math.sign(fix.x)*(n/m-convXY2Ret(fxLen));
    const fyp=Math.sign(fix.y)*(n/m-convXY2Ret(fyLen));
    const xp=u*(n/m)-fxp, yp=v*(n/m)-fyp;
    const rp=Math.hypot(xp,yp), theta=Math.atan2(yp,xp), r=convRet2XY(rp);
    return {x:r*Math.cos(theta)+fix.x,y:r*Math.sin(theta)+fix.y};
  }

  function foveatedSource(fix){
    // Lightweight visual approximation of Get_foveated_images: blurred base + sharp fixation-centered aperture.
    blurCtx.clearRect(0,0,720,720);
    blurCtx.filter='blur(7px)';
    blurCtx.drawImage(work,0,0);
    blurCtx.filter='none';

    foveatedCtx.clearRect(0,0,720,720);
    foveatedCtx.globalCompositeOperation='source-over';
    foveatedCtx.globalAlpha=1;
    foveatedCtx.drawImage(blurCanvas,0,0);

    const px=(fix.x+1)*360, py=(fix.y+1)*360, radius=250;
    foveatedCtx.save();
    const g=foveatedCtx.createRadialGradient(px,py,30,px,py,radius);
    g.addColorStop(0,'rgba(255,255,255,1)');
    g.addColorStop(.58,'rgba(255,255,255,.9)');
    g.addColorStop(1,'rgba(255,255,255,0)');
    foveatedCtx.globalCompositeOperation='destination-out';
    foveatedCtx.fillStyle=g;
    foveatedCtx.fillRect(0,0,720,720);
    foveatedCtx.restore();

    foveatedCtx.save();
    foveatedCtx.beginPath();
    foveatedCtx.arc(px,py,radius,0,Math.PI*2);
    foveatedCtx.clip();
    foveatedCtx.globalAlpha=.98;
    foveatedCtx.drawImage(work,0,0);
    foveatedCtx.restore();
    return foveatedCanvas;
  }

  function retinalPoint(i,j,density){
    const u=(i/63-.5)*2, v=(j/63-.5)*2;
    const p=mapRetinalToCartesian(u,v,state.fix,density);
    return {
      x:Math.max(0,Math.min(719,(p.x+1)*.5*719)),
      y:Math.max(0,Math.min(719,(p.y+1)*.5*719))
    };
  }

  function renderRetinaByDraw(ctx,density,source){
    sampleCtx.clearRect(0,0,64,64);
    sampleCtx.imageSmoothingEnabled=true;
    for(let j=0;j<64;j++){
      for(let i=0;i<64;i++){
        const p=retinalPoint(i,j,density);
        sampleCtx.drawImage(source,p.x,p.y,1,1,i,j,1,1);
      }
    }
    paintRetinaOutput(ctx);
  }

  function paintRetinaOutput(ctx){
    ctx.imageSmoothingEnabled=true;
    ctx.clearRect(0,0,384,384);
    ctx.drawImage(sampled,0,0,384,384);
    const vign=ctx.createRadialGradient(192,192,90,192,192,260);
    vign.addColorStop(.55,'rgba(0,0,0,0)');
    vign.addColorStop(1,'rgba(0,0,0,.35)');
    ctx.fillStyle=vign;
    ctx.fillRect(0,0,384,384);
  }

  function renderRetina(ctx,density,source){
    if(!state.ready)return;

    if(!pixelReadAvailable){
      renderRetinaByDraw(ctx,density,source);
      return;
    }

    try{
      const src=source.getContext('2d').getImageData(0,0,720,720);
      const dst=sampleCtx.createImageData(64,64);
      const sd=src.data, dd=dst.data;
      for(let j=0;j<64;j++)for(let i=0;i<64;i++){
        const p=retinalPoint(i,j,density);
        const x=Math.round(p.x), y=Math.round(p.y);
        const si=(y*720+x)*4, di=(j*64+i)*4;
        dd[di]=sd[si];dd[di+1]=sd[si+1];dd[di+2]=sd[si+2];dd[di+3]=255;
      }
      sampleCtx.putImageData(dst,0,0);
      paintRetinaOutput(ctx);
    }catch(err){
      // Some public image hosts do not expose CORS headers. Drawing is still allowed,
      // so fall back to direct canvas sampling without reading source pixels.
      pixelReadAvailable=false;
      renderRetinaByDraw(ctx,density,source);
    }
  }

  function drawGrid(density,color,stride){
    sctx.save();sctx.fillStyle=color;sctx.globalAlpha=.74;
    for(let j=0;j<64;j+=stride)for(let i=0;i<64;i+=stride){
      const u=(i/63-.5)*2,v=(j/63-.5)*2,p=mapRetinalToCartesian(u,v,state.fix,density);
      const x=(p.x+1)*360,y=(p.y+1)*360;
      if(x>=0&&x<=720&&y>=0&&y<=720){sctx.beginPath();sctx.arc(x,y,1.45,0,Math.PI*2);sctx.fill()}
    }
    sctx.restore();
  }

  function renderScene(){
    if(!state.ready)return;
    sctx.clearRect(0,0,720,720);sctx.drawImage(work,0,0);
    const fx=(state.fix.x+1)*360, fy=(state.fix.y+1)*360;
    const shade=sctx.createRadialGradient(fx,fy,35,fx,fy,330);
    shade.addColorStop(0,'rgba(2,10,15,0)');shade.addColorStop(1,'rgba(2,10,15,.2)');
    sctx.fillStyle=shade;sctx.fillRect(0,0,720,720);
    if(state.showGrid){
      if(state.gridMode==='both'||state.gridMode==='m')drawGrid(state.mDensity,'#ffc66d',4);
      if(state.gridMode==='both'||state.gridMode==='p')drawGrid(state.pDensity,'#6ee7f2',4);
    }
    sctx.save();sctx.strokeStyle='#fff';sctx.lineWidth=2;sctx.shadowColor='#6ee7f2';sctx.shadowBlur=14;
    sctx.beginPath();sctx.arc(fx,fy,10,0,Math.PI*2);sctx.stroke();
    sctx.beginPath();sctx.moveTo(fx-17,fy);sctx.lineTo(fx-5,fy);sctx.moveTo(fx+5,fy);sctx.lineTo(fx+17,fy);sctx.moveTo(fx,fy-17);sctx.lineTo(fx,fy-5);sctx.moveTo(fx,fy+5);sctx.lineTo(fx,fy+17);sctx.stroke();sctx.restore();
  }

  function renderAll(){
    if(!state.ready)return;
    renderScene();
    const source=foveatedSource(state.fix);
    renderRetina(mctx,state.mDensity,source);
    renderRetina(pctx,state.pDensity,source);
    $('fixationText').textContent=`fixation ${state.fix.x.toFixed(2)}, ${state.fix.y.toFixed(2)}`;
    $('mDensityLabel').textContent=state.mDensity.toFixed(1)+'×';
    $('pDensityLabel').textContent=state.pDensity.toFixed(1)+'×';
    updateEyes();
  }

  function updateEyes(){
    const dx=state.fix.x*13,dy=state.fix.y*9;
    document.querySelector('.pupil-left').style.transform=`translate(${dx}px,${dy}px)`;
    document.querySelector('.pupil-right').style.transform=`translate(${dx}px,${dy}px)`;
  }

  function finishImageLoad(img){
    state.image=img;
    coverImage(wctx,img,720,720);
    state.ready=true;
    renderAll();
  }

  function setImage(src){
    state.ready=false;
    const img=new Image();
    img.crossOrigin='anonymous';
    img.onload=()=>finishImageLoad(img);
    img.onerror=()=>{
      // Retry without CORS. The rendering path automatically switches to draw-only sampling.
      const fallback=new Image();
      fallback.onload=()=>finishImageLoad(fallback);
      fallback.onerror=()=>{
        state.ready=false;
        console.error('Unable to load image:',src);
      };
      fallback.src=src;
    };
    img.src=src;
  }

  function selectPreset(key){
    if(!presets[key])return;
    state.preset=key;
    scanpath=presets[key].scan;
    state.scanIndex=0;
    state.fix.x=0;state.fix.y=0;
    setTarget(...scanpath[0]);
    setImage(presets[key].src);
  }

  function setTarget(x,y){state.target.x=Math.max(-.9,Math.min(.9,x));state.target.y=Math.max(-.9,Math.min(.9,y));}
  function pointerToFix(e){const r=scene.getBoundingClientRect();return{x:((e.clientX-r.left)/r.width)*2-1,y:((e.clientY-r.top)/r.height)*2-1}}

  scene.addEventListener('click',e=>{const p=pointerToFix(e);state.auto=false;syncAutoButton();setTarget(p.x,p.y)});
  scene.addEventListener('pointermove',e=>{if(!state.follow)return;const p=pointerToFix(e);state.auto=false;syncAutoButton();setTarget(p.x,p.y)});
  $('followCursor').addEventListener('change',e=>{state.follow=e.target.checked;if(state.follow){state.auto=false;syncAutoButton()}});
  $('showGrid').addEventListener('change',e=>{state.showGrid=e.target.checked;renderScene()});
  $('gridMode').addEventListener('change',e=>{state.gridMode=e.target.value;renderScene()});
  $('presetImage').addEventListener('change',e=>selectPreset(e.target.value));
  $('imageUpload').addEventListener('change',e=>{
    const f=e.target.files&&e.target.files[0];if(!f)return;
    const url=URL.createObjectURL(f),img=new Image();
    state.ready=false;
    img.onload=()=>{finishImageLoad(img);URL.revokeObjectURL(url)};
    img.src=url;
  });

  function syncAutoButton(){
    const b=$('autoButton');b.setAttribute('aria-pressed',String(state.auto));
    b.querySelector('.button-icon').textContent=state.auto?'Ⅱ':'▶';
    b.querySelector('.button-label').textContent=state.auto?'Pause eye movement':'Auto eye movement';
  }

  $('autoButton').addEventListener('click',()=>{
    state.auto=!state.auto;state.follow=false;$('followCursor').checked=false;syncAutoButton();
    if(state.auto){state.scanIndex=(state.scanIndex+1)%scanpath.length;setTarget(...scanpath[state.scanIndex]);state.lastStep=performance.now()}
  });

  function densityChange(which,val){
    state[which]=Number(val);const prefix=which==='mDensity'?'m':'p';
    $(prefix+'DensityOutput').textContent=Number(val).toFixed(1);renderAll();
  }
  $('mDensity').addEventListener('input',e=>densityChange('mDensity',e.target.value));
  $('pDensity').addEventListener('input',e=>densityChange('pDensity',e.target.value));
  $('resetDensity').addEventListener('click',()=>{$('mDensity').value='2.5';$('pDensity').value='15';densityChange('mDensity',2.5);densityChange('pDensity',15)});

  let lastRender=0;
  function animate(t){
    if(state.auto && t-state.lastStep>1850){state.scanIndex=(state.scanIndex+1)%scanpath.length;setTarget(...scanpath[state.scanIndex]);state.lastStep=t}
    const dx=state.target.x-state.fix.x,dy=state.target.y-state.fix.y,dist=Math.hypot(dx,dy);
    if(dist>.001){
      const gain=dist>.22?.26:.12;state.fix.x+=dx*gain;state.fix.y+=dy*gain;
      const interval=pixelReadAvailable?45:85;
      if(t-lastRender>interval){renderAll();lastRender=t}
    }
    requestAnimationFrame(animate);
  }

  selectPreset(state.preset);
  state.lastStep=performance.now();
  syncAutoButton();
  requestAnimationFrame(animate);
})();