// One media element keeps original game cues from overlapping.
const clips={hello:['balloon-boy-hello.mp3',.75],yay:['children-yay.mp3',.65],page:['camera-open.mp3',.45],click:['camera-close.mp3',.25],error:['camera-open.mp3',.35],clear:['camera-close.mp3',.3],window:['camera-close.mp3',.25]};
export class GameAudio {
  constructor({muted=false,volume=.35,helloDone=false,onHello=()=>{},onState=()=>{}}={}) {
    this.muted=muted;this.volume=volume;this.helloDone=helloDone;this.onHello=onHello;this.onState=onState;
    this.unlocked=false;this.current=null;this.pending=null;this.lastStarted=-Infinity;this.blocked=false;this.sequence=0;
    this.ambientTimer=null;this.ambientPlaying=false;this.suspended=false;this.destroyed=false;
    this.player=document.createElement('audio');this.player.id='game-audio';this.player.preload='auto';this.player.hidden=true;document.body.append(this.player);
    this.player.addEventListener('playing',()=>{this.blocked=false;if(this.current==='hello'&&!this.helloDone){this.helloDone=true;this.onHello()}this.scheduleAmbient();this.onState()});
    this.player.addEventListener('ended',()=>{this.current=null;this.ambientPlaying=false;const pending=this.pending;this.pending=null;if(pending)this.request(pending);this.onState()});
    this.player.addEventListener('error',()=>{this.current=null;this.ambientPlaying=false;this.blocked=true;this.clearAmbient();this.onState()});
    this.onVisibility=()=>{if(document.hidden){this.clearAmbient();if(this.ambientPlaying)this.stop()}else this.scheduleAmbient()};
    this.onPageHide=event=>{this.suspended=true;this.stop();if(!event.persisted)this.destroy()};
    this.onPageShow=()=>{this.suspended=false;this.scheduleAmbient()};
    document.addEventListener('visibilitychange',this.onVisibility);
    window.addEventListener('pagehide',this.onPageHide);window.addEventListener('pageshow',this.onPageShow);
  }
  activate(){if(this.destroyed||this.suspended)return;this.unlocked=true;if(!this.helloDone&&!this.muted&&this.volume>0&&this.current!=='hello')this.play('hello');else if(this.blocked&&!this.muted&&this.volume>0)this.play(this.failedCue||'click');this.scheduleAmbient();this.onState()}
  ambientAllowed(){return this.unlocked&&this.helloDone&&!this.muted&&this.volume>0&&!document.hidden&&!this.blocked&&!this.suspended&&!this.destroyed}
  clearAmbient(){clearTimeout(this.ambientTimer);this.ambientTimer=null}
  scheduleAmbient(){
    if(this.ambientTimer!==null||!this.ambientAllowed())return;
    // A fresh wait after every attempt means busy, hidden, or muted time never queues greetings.
    this.ambientTimer=setTimeout(()=>{
      this.ambientTimer=null;
      if(!this.ambientAllowed())return;
      if(!this.current&&!this.pending)this.play('hello',true);
      this.scheduleAmbient();
    },45000+Math.random()*55000);
  }
  request(name){
    if(!clips[name]||this.muted||this.volume===0||!this.unlocked||this.suspended||this.destroyed)return;
    if(!this.helloDone){if(name==='yay')this.pending='yay';if(this.current!=='hello')this.play('hello');return}
    if(this.current==='hello'||this.current==='yay'){if(name==='yay'&&this.current!=='yay')this.pending='yay';return}
    if(name!=='yay'&&performance.now()-this.lastStarted<160)return;
    this.play(name);
  }
  play(name,ambient=false){
    if(this.muted||this.volume===0||this.suspended||this.destroyed)return;
    const sequence=++this.sequence;
    this.player.pause();this.player.currentTime=0;this.current=name;this.ambientPlaying=ambient;this.lastStarted=performance.now();
    this.player.dataset.cue=name;this.player.src=`audio/${clips[name][0]}`;this.player.volume=this.volume*clips[name][1];
    this.player.play().catch(()=>{if(sequence!==this.sequence)return;this.current=null;this.ambientPlaying=false;this.failedCue=name;this.blocked=true;this.clearAmbient();this.onState()});
  }
  setMuted(muted){this.muted=muted;if(muted)this.stop();else this.activate();this.onState()}
  setVolume(volume){this.volume=volume;if(this.current)this.player.volume=volume*clips[this.current][1];if(volume===0)this.stop();else if(this.unlocked&&!this.helloDone)this.activate();this.scheduleAmbient();this.onState()}
  stop(){this.clearAmbient();this.sequence++;this.player.pause();this.player.currentTime=0;this.current=null;this.pending=null;this.ambientPlaying=false}
  destroy(){this.destroyed=true;this.stop();document.removeEventListener('visibilitychange',this.onVisibility);window.removeEventListener('pagehide',this.onPageHide);window.removeEventListener('pageshow',this.onPageShow);this.player.remove()}
}
