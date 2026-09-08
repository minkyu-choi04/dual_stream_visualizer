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

  const repoRaw = 'https://raw.githubusercontent.com/minkyu-choi04/DualStreamBrains/main/input_images/';
  const presets = { frame0: repoRaw+'frame0.png', frame1: repoRaw+'frame1.png', frame2: repoRaw+'frame2.png' };
  const state = { image:new Image(), ready:false, fix:{x:0,y:0}, target:{x:0,y:0}, auto:true, follow:false, showGrid:true, gridMode:'both', mDensity:2.5, pDensity:15, scanIndex:0, lastStep:0 };
  state.image.crossOrigin = 'anonymous';
  const scanpath = [ [-.44,-.22],[-.12,.08],[.35,-.18],[.52,.26],[.05,.43],[-.55,.31],[-.22,-.46],[.38,-.44] ];

  function coverImage(ctx,img,w,h){
    const ir=img.width/img.height, cr=w/h; let sw,sh,sx,sy;
    if(ir>cr){sh=img.height;sw=sh*cr;sx=(img.width-sw)/2;sy=0}else{sw=img.width;sh=sw/cr;sx=0;sy=(img.height-sh)/2}
    ctx.clearRect(0,0,w,h);ctx.drawImage(img,sx,sy,sw,sh,0,0,w,h);
  }

  // JS port of make_xy2ret_grid_r radial mapping. Coordinates are normalized to [-1,1].
  function mapRetinalToCartesian(u,v,fix,density,m=720,n=64){
    const rpMax=n/m, a=Math.log(density)/rpMax;
    const b=Math.sqrt(Math.PI)*(1-Math.exp(a/2))/(1-Math.exp(a/2*rpMax));
    const convXY2Ret=(xy)=>2/a*Math.log(1-Math.sqrt(Math.PI)/b*(1-Math.exp(a/2))*xy);
    const convRet2XY=(r)=>b/Math.sqrt(Math.PI)*((1-Math.exp(a/2*r))/(1-Math.exp(a/2)));
    const fxLen=1-Math.abs(fix.x), fyLen=1-Math.abs(fix.y);
    const fxp=Math.sign(fix.x||1)*(n/m-convXY2Ret(fxLen));
    const fyp=Math.sign(fix.y||1)*(n/m-convXY2Ret(fyLen));
    const xp=u*(n/m)-fxp, yp=v*(n/m)-fyp;
    const rp=Math.hypot(xp,yp), theta=Math.atan2(yp,xp), r=convRet2XY(rp);
    return {x:r*Math.cos(theta)+fix.x,y:r*Math.sin(theta)+fix.y};
  }

  function foveatedSource(fix){
    // Lightweight visual approximation of Get_foveated_images: blurred base + sharp fixation-centered aperture.
    blurCtx.clearRect(0,0,720,720); blurCtx.filter='blur(7px)'; blurCtx.drawImage(work,0,0); blurCtx.filter='none';
    const out=document.createElement('canvas'); out.width=720;out.height=720; const c=out.getContext('2d');
    c.drawImage(blurCanvas,0,0);
    const px=(fix.x+1)*360, py=(fix.y+1)*360; const radius=250;
    c.save(); const g=c.createRadialGradient(px,py,30,px,py,radius); g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.58,'rgba(255,255,255,.9)');g.addColorStop(1,'rgba(255,255,255,0)');
    c.globalCompositeOperation='destination-out'; c.fillStyle=g; c.fillRect(0,0,720,720); c.restore();
    c.save(); c.beginPath(); c.arc(px,py,radius,0,Math.PI*2); c.clip(); c.globalAlpha=.98; c.drawImage(work,0,0); c.restore();
    return out;
  }

  function renderRetina(ctx,density){
    if(!state.ready)return;
    const source=foveatedSource(state.fix), src=source.getContext('2d').getImageData(0,0,720,720), dst=sampleCtx.createImageData(64,64);
    const sd=src.data, dd=dst.data;
    for(let j=0;j<64;j++)for(let i=0;i<64;i++){
      const u=(i/63-.5)*2, v=(j/63-.5)*2, p=mapRetinalToCartesian(u,v,state.fix,density);
      const x=Math.max(0,Math.min(719,Math.round((p.x+1)*.5*719))), y=Math.max(0,Math.min(719,Math.round((p.y+1)*.5*719)));
      const si=(y*720+x)*4, di=(j*64+i)*4; dd[di]=sd[si];dd[di+1]=sd[si+1];dd[di+2]=sd[si+2];dd[di+3]=255;
    }
    sampleCtx.putImageData(dst,0,0); ctx.imageSmoothingEnabled=true;ctx.clearRect(0,0,384,384);ctx.drawImage(sampled,0,0,384,384);
    const vign=ctx.createRadialGradient(192,192,90,192,192,260);vign.addColorStop(.55,'rgba(0,0,0,0)');vign.addColorStop(1,'rgba(0,0,0,.35)');ctx.fillStyle=vign;ctx.fillRect(0,0,384,384);
  }

  function drawGrid(density,color,stride){
    sctx.save(); sctx.fillStyle=color; sctx.globalAlpha=.74;
    for(let j=0;j<64;j+=stride)for(let i=0;i<64;i+=stride){const u=(i/63-.5)*2,v=(j/63-.5)*2,p=mapRetinalToCartesian(u,v,state.fix,density);const x=(p.x+1)*360,y=(p.y+1)*360;if(x>=0&&x<=720&&y>=0&&y<=720){sctx.beginPath();sctx.arc(x,y,1.45,0,Math.PI*2);sctx.fill()}}
    sctx.restore();
  }

  function renderScene(){
    if(!state.ready)return; sctx.clearRect(0,0,720,720);sctx.drawImage(work,0,0);
    const shade=sctx.createRadialGradient((state.fix.x+1)*360,(state.fix.y+1)*360,35,(state.fix.x+1)*360,(state.fix.y+1)*360,330);shade.addColorStop(0,'rgba(2,10,15,0)');shade.addColorStop(1,'rgba(2,10,15,.2)');sctx.fillStyle=shade;sctx.fillRect(0,0,720,720);
    if(state.showGrid){if(state.gridMode==='both'||state.gridMode==='m')drawGrid(state.mDensity,'#ffc66d',4);if(state.gridMode==='both'||state.gridMode==='p')drawGrid(state.pDensity,'#6ee7f2',4)}
    const x=(state.fix.x+1)*360,y=(state.fix.y+1)*360;sctx.save();sctx.strokeStyle='#fff';sctx.lineWidth=2;sctx.shadowColor='#6ee7f2';sctx.shadowBlur=14;sctx.beginPath();sctx.arc(x,y,10,0,Math.PI*2);sctx.stroke();sctx.beginPath();sctx.moveTo(x-17,y);sctx.lineTo(x-5,y);sctx.moveTo(x+5,y);sctx.lineTo(x+17,y);sctx.moveTo(x,y-17);sctx.lineTo(x,y-5);sctx.moveTo(x,y+5);sctx.lineTo(x,y+17);sctx.stroke();sctx.restore();
  }

  function renderAll(){renderScene();renderRetina(mctx,state.mDensity);renderRetina(pctx,state.pDensity);$('fixationText').textContent=`fixation ${state.fix.x.toFixed(2)}, ${state.fix.y.toFixed(2)}`;$('mDensityLabel').textContent=state.mDensity.toFixed(1)+'×';$('pDensityLabel').textContent=state.pDensity.toFixed(1)+'×';updateEyes();}
  function updateEyes(){const dx=state.fix.x*13,dy=state.fix.y*9;document.querySelector('.pupil-left').style.transform=`translate(${dx}px,${dy}px)`;document.querySelector('.pupil-right').style.transform=`translate(${dx}px,${dy}px)`;}
  function setImage(src){state.ready=false;state.image.onload=()=>{coverImage(wctx,state.image,720,720);state.ready=true;renderAll()};state.image.src=src;}
  function setTarget(x,y){state.target.x=Math.max(-.9,Math.min(.9,x));state.target.y=Math.max(-.9,Math.min(.9,y));}
  function pointerToFix(e){const r=scene.getBoundingClientRect();return{x:((e.clientX-r.left)/r.width)*2-1,y:((e.clientY-r.top)/r.height)*2-1}}

  scene.addEventListener('click',e=>{const p=pointerToFix(e);state.auto=false;syncAutoButton();setTarget(p.x,p.y)});
  scene.addEventListener('pointermove',e=>{if(!state.follow)return;const p=pointerToFix(e);state.auto=false;syncAutoButton();setTarget(p.x,p.y)});
  $('followCursor').addEventListener('change',e=>{state.follow=e.target.checked;if(state.follow){state.auto=false;syncAutoButton()}});
  $('showGrid').addEventListener('change',e=>{state.showGrid=e.target.checked;renderScene()});
  $('gridMode').addEventListener('change',e=>{state.gridMode=e.target.value;renderScene()});
  $('presetImage').addEventListener('change',e=>setImage(presets[e.target.value]));
  $('imageUpload').addEventListener('change',e=>{const f=e.target.files&&e.target.files[0];if(!f)return;const url=URL.createObjectURL(f);state.ready=false;state.image.onload=()=>{coverImage(wctx,state.image,720,720);state.ready=true;renderAll();URL.revokeObjectURL(url)};state.image.src=url});
  function syncAutoButton(){const b=$('autoButton');b.setAttribute('aria-pressed',String(state.auto));b.querySelector('.button-icon').textContent=state.auto?'Ⅱ':'▶';b.querySelector('.button-label').textContent=state.auto?'Pause eye movement':'Auto eye movement'}
  $('autoButton').addEventListener('click',()=>{state.auto=!state.auto;state.follow=false;$('followCursor').checked=false;syncAutoButton();if(state.auto){state.scanIndex=(state.scanIndex+1)%scanpath.length;setTarget(...scanpath[state.scanIndex]);state.lastStep=performance.now()}});
  function densityChange(which,val){state[which]=Number(val);const prefix=which==='mDensity'?'m':'p';$(prefix+'DensityOutput').textContent=Number(val).toFixed(1);renderAll()}
  $('mDensity').addEventListener('input',e=>densityChange('mDensity',e.target.value));$('pDensity').addEventListener('input',e=>densityChange('pDensity',e.target.value));
  $('resetDensity').addEventListener('click',()=>{$('mDensity').value='2.5';$('pDensity').value='15';densityChange('mDensity',2.5);densityChange('pDensity',15)});

  let lastRender=0;
  function animate(t){
    if(state.auto && t-state.lastStep>1850){state.scanIndex=(state.scanIndex+1)%scanpath.length;setTarget(...scanpath[state.scanIndex]);state.lastStep=t}
    const dx=state.target.x-state.fix.x,dy=state.target.y-state.fix.y;const dist=Math.hypot(dx,dy);if(dist>.001){const gain=dist>.22?.26:.12;state.fix.x+=dx*gain;state.fix.y+=dy*gain;if(t-lastRender>45){renderAll();lastRender=t}}
    requestAnimationFrame(animate);
  }
  setImage(presets.frame0);setTarget(...scanpath[0]);state.lastStep=performance.now();syncAutoButton();requestAnimationFrame(animate);
})();
