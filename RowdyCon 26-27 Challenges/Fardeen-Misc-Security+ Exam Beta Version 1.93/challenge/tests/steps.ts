import {randomUUID} from 'node:crypto';
import {createState,transition,type Action,type State} from '../server/state.js';

/** Private test walkthrough; never imported by the player client. */
export const stationSteps:Record<number,[string,Record<string,unknown>][]>={
  1:[['place-plus',{index:1}],['answer',{index:1}]],
  2:[['inspect',{}],['answer',{id:'2.0'}]],
  3:[['answer',{id:'d'}]],
  4:[['move-tools',{start:8}],['resize-c',{size:8}],['apply',{}]],
  5:[['toggle-account',{id:'NOBODY',allowed:false}],['apply',{}]],
  6:[['answer',{id:'both-routes'}]],
  7:[['submit-password',{value:' '}]],
  8:[['route',{from:'PC',to:'S1'}],['route',{from:'S1',to:'S2'}],['route',{from:'S2',to:'S3'}],['route',{from:'S3',to:'SERVER'}],['launch',{}]],
  9:[['overlay',{visible:false}],['edit',{field:'employeeId',value:''}],['edit',{field:'comment',value:''}],['publish',{}]],
  10:[['select-source',{id:'approved'}],['copy-file',{}],['select-device',{id:'09'}],['paste-file',{}],['eject',{}]],
  11:[['outer',{open:true}],['move-person',{person:'candidate',to:'vestibule'}],['outer',{open:false}],['hatch',{open:false}],['open-inner',{}]],
  12:[['settings',{page:2,copies:1}],['cancel-host',{}],['cancel-printer',{}],['print',{}]],
  13:[['answer',{id:'C'}]],
  14:[['source',{id:'aux'}],['answer',{id:'d'}]],
  15:[['reorder',{order:['intern','staff443','deny','header','any']}],['apply',{}]],
  16:[['set-count',{value:'06'}],['submit-count',{}]],
  17:[['bind',{reference:'rel-k7m2'}],['deploy',{}]],
  18:[['answer',{id:'neither'}]],
  19:[['archive-event',{id:'EV-B4Q'}]],
  20:[['unlock',{pin:'604827'}]]
};
export function action(s:Pick<State,'attempt'|'revision'|'q'>,kind:Action['kind']='play',fields:Partial<Action>={}):Action {
  return {requestId:randomUUID(),attempt:s.attempt,revision:s.revision,q:s.q,kind,...fields};
}
export function completeThrough(last:number,state=createState()):State {
  for(let q=state.q;q<=last;q++)for(const [op,args] of stationSteps[q])state=transition(state,action(state,'play',{op,args})).state;
  return state;
}
