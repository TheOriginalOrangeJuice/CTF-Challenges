// Focused timer/lifecycle checks; fake media does not establish actual playback.
import assert from 'node:assert/strict';
import {GameAudio} from '../challenge/public/audio.js';

class FakeMedia extends EventTarget {
  constructor(){super();this.dataset={};this.paused=true;this.currentTime=0;this.calls=[]}
  play(){this.paused=false;this.calls.push(this.dataset.cue);this.dispatchEvent(new Event('playing'));return Promise.resolve()}
  pause(){this.paused=true}
  end(){this.paused=true;this.dispatchEvent(new Event('ended'))}
  remove(){this.removed=true}
}
globalThis.document=Object.assign(new EventTarget(),{hidden:false,body:{append(){}},createElement:()=>new FakeMedia()});
globalThis.window=new EventTarget();
let now=0,id=0,timers=new Map(),delays=[],randoms=[0,.5,.999999],randomIndex=0;
globalThis.performance={now:()=>now};
globalThis.setTimeout=(fn,ms)=>{const timer=++id;timers.set(timer,{fn,at:now+ms});delays.push(ms);return timer};
globalThis.clearTimeout=timer=>timers.delete(timer);
Math.random=()=>randoms[(randomIndex++)%randoms.length];
function advance(ms){const end=now+ms;for(;;){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;timers.delete(next[0]);next[1].fn()}now=end}
function nextWait(){return Math.min(...[...timers.values()].map(t=>t.at-now))}
function visibility(hidden){document.hidden=hidden;document.dispatchEvent(new Event('visibilitychange'))}
function pageEvent(type,persisted=true){window.dispatchEvent(Object.assign(new Event(type),{persisted}))}
function reset(){timers.clear();now=0;delays=[];randomIndex=0;document.hidden=false}
const checks=[];

reset();let firstHello=0;
let audio=new GameAudio({onHello:()=>firstHello++});
advance(300000);assert.equal(audio.player.calls.length,0);assert.equal(timers.size,0);
audio.activate();assert.deepEqual(audio.player.calls,['hello']);assert.equal(firstHello,1);audio.player.end();
assert.equal(nextWait(),45000);advance(44999);assert.equal(audio.player.calls.length,1);advance(1);
assert.deepEqual(audio.player.calls,['hello','hello']);assert.equal(firstHello,1);audio.player.end();
assert.equal(nextWait(),72500);advance(72500);audio.player.end();assert.ok(nextWait()>99999&&nextWait()<100000);
audio.activate();audio.activate();assert.equal(timers.size,1);assert.ok(delays.every(d=>d>=45000&&d<=100000));
checks.push('No automatic greeting before activation; first greeting persists once; ambient repeats with varied 45–100 second waits and one timer despite repeated gestures');audio.destroy();

for(const state of ['mute','zero','hidden']){
  reset();audio=new GameAudio({helloDone:true});audio.activate();advance(44000);
  if(state==='mute')audio.setMuted(true);else if(state==='zero')audio.setVolume(0);else visibility(true);
  assert.equal(timers.size,0);advance(500000);assert.equal(audio.player.calls.length,0);
  if(state==='mute')audio.setMuted(false);else if(state==='zero')audio.setVolume(.35);else visibility(false);
  assert.equal(timers.size,1);assert.ok(nextWait()>=45000);advance(nextWait()-1);assert.equal(audio.player.calls.length,0);advance(1);
  assert.deepEqual(audio.player.calls,['hello']);
  if(state==='mute')audio.setMuted(true);else if(state==='zero')audio.setVolume(0);else visibility(true);
  assert.equal(audio.player.paused,true);assert.equal(timers.size,0);audio.destroy();
}
checks.push('Mute, zero volume and hidden tab stop ambient audio/cancel waits; restoring each starts a fresh wait with no catch-up burst');

reset();audio=new GameAudio({helloDone:true});audio.activate();audio.request('yay');advance(nextWait());
assert.deepEqual(audio.player.calls,['yay']);assert.equal(audio.current,'yay');assert.equal(audio.pending,null);audio.player.end();
advance(nextWait());assert.deepEqual(audio.player.calls,['yay','hello']);audio.request('yay');
assert.deepEqual(audio.player.calls,['yay','hello']);audio.player.end();assert.deepEqual(audio.player.calls,['yay','hello','yay']);
advance(nextWait());assert.equal(audio.current,'yay');assert.equal(audio.player.calls.length,3);audio.player.end();
audio.request('page');advance(nextWait());assert.equal(audio.current,'page');assert.equal(audio.player.calls.length,4);
checks.push('Busy action or Yay skips an ambient attempt; ambient never overlaps or interrupts the cheer; a cheer requested during Hello plays after it');audio.destroy();

reset();audio=new GameAudio({helloDone:true});audio.activate();pageEvent('pagehide');
assert.equal(timers.size,0);advance(500000);pageEvent('pageshow');assert.equal(timers.size,1);assert.ok(nextWait()>=45000);
pageEvent('pagehide',false);assert.equal(timers.size,0);assert.ok(audio.player.removed);pageEvent('pageshow');visibility(false);audio.activate();advance(500000);assert.equal(audio.player.calls.length,0);
checks.push('Page hide cancels the wait; BFCache restoration starts a fresh wait; final navigation destroys audio and lifecycle listeners');

reset();audio=new GameAudio({helloDone:true});audio.activate();audio.player.dispatchEvent(new Event('error'));assert.equal(timers.size,0);advance(500000);assert.equal(audio.player.calls.length,0);audio.destroy();
checks.push('Media error stops ambient retries until a later permitted interaction');
console.log(JSON.stringify({passed:true,checks,limits:'Fake media validates scheduling only; browser waveform evidence is recorded separately.'},null,2));
