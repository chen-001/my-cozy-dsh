import { chromium } from 'playwright';
import { shellHtml } from './dsh-shell.js';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const out = process.env.LAMP_OUT || '/tmp/cozy-light-review';
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(out + '/shell.html', shellHtml());
const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? {executablePath: process.env.CHROME_PATH} : {}), headless: true });
try {
for (const mode of ['warm','white','rainbow']) {
 const page = await browser.newPage();
 const errors = []; page.on('pageerror', e => errors.push(e.message));
 await page.goto('file://' + out + '/shell.html');
 await page.evaluate(mode => {
  localStorage.setItem('dsh-desk-light-v2', JSON.stringify({on:true,mode,sizes:{warm:150,white:150,rainbow:150}}));
  window.__ModuleLoader__ = {load(p) {window.plugin=p;}};
 }, mode);
 await page.addScriptTag({path:'client.js'});
 await page.evaluate(() => window.plugin.factory().apply({effect(fn){window.cleanup=fn();}}));
 for (const width of [1440,800]) {
  await page.setViewportSize({width,height:1000});
  await page.waitForTimeout(200);
  const metrics = await page.evaluate(() => {
   const c=document.querySelector('canvas.dsh-lamp-flow');
   const {width:w,height:h}=c; const d=c.getContext('2d').getImageData(0,0,w,h).data;
   const rect=c.getBoundingClientRect();
   const composer=document.querySelector('[data-composer-card]').getBoundingClientRect();
   // The opaque composer intentionally occludes the light; test continuity above it.
   const lightEnd=Math.min(h-1,Math.floor((composer.top-rect.top-6)/rect.height*h));
   let maxJump=0, holes=0;
   for(let y=Math.floor(h*.25);y<lightEnd;y++) for(let x=1;x<w-1;x++) {
    const i=(y*w+x)*4+3;
    maxJump=Math.max(maxJump,Math.abs(d[i]-d[i-4]),Math.abs(d[i]-d[i+w*4]));
    if(d[i]===0 && d[i-4]>8 && d[i+4]>8) holes++;
   }
   let composerAlpha=0;
   for(let y=Math.max(0,Math.floor((composer.top-rect.top)/rect.height*h));y<h;y++)
    for(let x=Math.max(0,Math.ceil((composer.left-rect.left)/rect.width*w));x<Math.min(w,Math.floor((composer.right-rect.left)/rect.width*w));x++) composerAlpha=Math.max(composerAlpha,d[(y*w+x)*4+3]);
   return {maxJump,holes,composerAlpha, active:c.dataset.pool, oldBeam:getComputedStyle(document.querySelector('.dsh-lamp-beam')).visibility};
  });
  assert.equal(metrics.active,'desk'); assert.equal(metrics.oldBeam,'hidden');
  assert.equal(metrics.holes,0); assert.equal(metrics.composerAlpha,0); assert.ok(metrics.maxJump<=10,JSON.stringify(metrics));
  await page.screenshot({path:`${out}/${mode}-${width}.png`});
  console.log(mode,width,metrics);
 }
 for (const size of [50,150]) {
  const pixels = await page.evaluate(size => {
   const r=document.querySelector('#dsh-light-range'); r.value=String(size); r.dispatchEvent(new Event('input',{bubbles:true}));
   const c=document.querySelector('canvas.dsh-lamp-flow');
   return c.getContext('2d').getImageData(0,0,c.width,c.height).data.filter((v,i)=>i%4===3).reduce((a,b)=>a+b,0);
  },size);
  assert.ok(pixels>0);
 }
 await page.evaluate(() => {const s=document.querySelector('[aria-label="Light on"]');s.checked=false;s.dispatchEvent(new Event('change',{bubbles:true}));});
 assert.equal(await page.locator('.dsh-lamp-flow').evaluate(c=>getComputedStyle(c).display),'none');
 await page.evaluate(() => {const s=document.querySelector('[aria-label="Light on"]');s.checked=true;s.dispatchEvent(new Event('change',{bubbles:true}));});
 assert.equal(await page.locator('.dsh-lamp-flow').evaluate(c=>c.dataset.pool),'desk');
 await page.locator('.dsh-light-trigger').click();
 const transparency=page.locator('#dsh-light-transparency');
 await transparency.fill('50');
 await transparency.press('ArrowRight');
 assert.equal(await transparency.inputValue(),'55');
 assert.equal(await page.locator('.dsh-lamp-flow').evaluate(c=>getComputedStyle(c).opacity),'0.45');
 assert.equal(await page.locator('.dsh-lamp-beam').evaluate(c=>getComputedStyle(c).opacity),'0.45');
 await page.screenshot({path:`${out}/${mode}-controls.png`});
 await transparency.fill('100');
 assert.equal(await page.locator('.dsh-lamp-flow').evaluate(c=>getComputedStyle(c).opacity),'0');
 await transparency.fill('35');
 await page.evaluate(() => { window.cleanup(); window.plugin.factory().apply({effect(fn){window.cleanup=fn();}}); });
 assert.equal(await page.locator('#dsh-light-transparency').inputValue(),'35');
 assert.equal(await page.locator('.dsh-lamp-flow').evaluate(c=>getComputedStyle(c).opacity),'0.65');
 assert.deepEqual(errors,[]);
 await page.evaluate(() => window.cleanup());
 assert.equal(await page.locator('.dsh-lamp-flow').count(),0);
 await page.close();
}
} finally {await browser.close();}
