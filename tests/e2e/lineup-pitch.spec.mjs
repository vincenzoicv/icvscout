import { test, expect } from '@playwright/test';

async function preview(page) {
  await page.route('https://**',route=>route.abort());
  await page.route('**/api/**',route=>route.abort());
  await page.goto('/');
  await page.evaluate(async () => {
    await document.fonts.ready;
    const positions=[[0,6.4],[-3.2,3.7],[0,3.7],[3.2,3.7],[-4.1,.4],[-1.4,.4],[1.4,.4],[4.1,.4],[-2,-3],[2,-3],[0,-5.8]];
    window.ICV_LINEUP_DATA={module:'3-4-2-1',players:positions.map(([x,z],i)=>({name:['Portiere','Centrale SX','Centrale','Centrale DX','Esterno SX','Mediano SX','Mediano DX','Esterno DX','Trequartista SX','Trequartista DX','Attaccante'][i],x,z}))};
    await import('/assets/lineup-pitch-3d.js?v=20261005-1');
    document.getElementById('matchHubProbable').hidden=false;
    document.getElementById('matchHubProbableModule').textContent='3-4-2-1 · Esempio grafico';
    document.getElementById('matchHubProbableNote').textContent='Anteprima con ruoli dimostrativi, non una probabile formazione';
  });
}

test('both pitches are complete, framed and readable at three widths',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await preview(page);
  for(const width of [320,390,820,1440]){
    await page.setViewportSize({width,height:1000});
    for(const mode of ['3d','2d']){
      await page.evaluate(mode=>window.ICVLineupPitch.setView(mode),mode);
      const labels=page.locator(mode==='3d'?'.lineup-projected-label':'.lineup-2d-player');
      await expect(labels).toHaveCount(11);
      const boxes=await labels.evaluateAll(nodes=>nodes.map(node=>{
        const box=node.getBoundingClientRect(),stage=document.getElementById('matchHubLineupStage').getBoundingClientRect();
        return {left:box.left-stage.left,top:box.top-stage.top,right:box.right-stage.left,bottom:box.bottom-stage.top,width:stage.width,height:stage.height};
      }));
      for(const box of boxes){expect(box.left).toBeGreaterThanOrEqual(0);expect(box.top).toBeGreaterThanOrEqual(0);expect(box.right).toBeLessThanOrEqual(box.width);expect(box.bottom).toBeLessThanOrEqual(box.height);}
      for(let a=0;a<boxes.length;a++)for(let b=a+1;b<boxes.length;b++){
        const x=boxes[a],y=boxes[b];
        expect(x.right<=y.left||y.right<=x.left||x.bottom<=y.top||y.bottom<=x.top,`${width} ${mode}: labels ${a}, ${b}`).toBe(true);
      }
      if(mode==='3d'){
        const pixels=await page.evaluate(()=>{
          window.dispatchEvent(new Event('resize'));
          const c=document.getElementById('matchHubLineupCanvas'),gl=c.getContext('webgl2');
          const rgba=new Uint8Array(c.width*c.height*4);
          gl.readPixels(0,0,c.width,c.height,gl.RGBA,gl.UNSIGNED_BYTE,rgba);
          let grass=0,shirts=0;
          for(let i=0;i<rgba.length;i+=4){if(rgba[i+1]>rgba[i]*1.3&&rgba[i+1]>40)grass++;if(rgba[i]>170&&rgba[i+1]>170&&rgba[i+2]>170)shirts++;}
          return {grass,shirts};
        });
        expect(pixels.grass).toBeGreaterThan(1000);expect(pixels.shirts).toBeGreaterThan(100);
      }
      await page.locator('#matchHubProbable').screenshot({path:`/tmp/icv-lineup-${mode}-${width}.png`});
    }
  }
});

test('WebGL unavailable keeps the complete 2D formation and selected state',async({page})=>{
  await page.addInitScript(()=>{
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:original.call(this,type,...args);};
  });
  await preview(page);
  await expect(page.locator('#matchHubLineup2d')).toBeVisible();
  await expect(page.locator('.lineup-2d-player')).toHaveCount(11);
  await expect(page.locator('[data-lineup-view="2d"]')).toHaveAttribute('aria-pressed','true');
});

test('3D drag changes the view and 2D stays available from keyboard',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await preview(page);
  const canvas=page.locator('#matchHubLineupCanvas');
  await canvas.scrollIntoViewIfNeeded();
  const before=await canvas.screenshot();
  const rect=await canvas.boundingBox();
  await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);
  await page.mouse.down();await page.mouse.move(rect.x+rect.width/2+45,rect.y+rect.height/2);await page.mouse.up();
  expect((await canvas.screenshot()).equals(before)).toBe(false);
  const button=page.locator('[data-lineup-view="2d"]');
  await button.focus();await page.keyboard.press('Enter');
  await expect(button).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#matchHubLineup2d')).toBeVisible();
});
