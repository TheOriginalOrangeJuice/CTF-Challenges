const key='iq-unsent-draft';
export function rememberDraft(s:any,draft:any){try{sessionStorage.setItem(key,JSON.stringify({attempt:s.attempt,q:s.q,revision:s.revision,base:s.draft,draft}));}catch{}}
export function recoverDraft(s:any){try{const p=JSON.parse(sessionStorage.getItem(key)||'null');if(p?.attempt===s.attempt&&p.q===s.q&&(p.revision===s.revision||JSON.stringify(p.base)===JSON.stringify(s.draft)))return p.draft;}catch{}return s.draft;}
export function forgetDraft(){try{sessionStorage.removeItem(key);}catch{}}
export function rememberNotes(s:any,notes:string){try{sessionStorage.setItem('iq-unsent-notes',JSON.stringify({attempt:s.attempt,base:s.notes,notes}));}catch{}}
export function recoverNotes(s:any){try{const p=JSON.parse(sessionStorage.getItem('iq-unsent-notes')||'null');if(p?.attempt===s.attempt&&p.base===s.notes)return p.notes;}catch{}return s.notes;}
export function acknowledgeNotes(notes:string){try{const p=JSON.parse(sessionStorage.getItem('iq-unsent-notes')||'null');if(p?.notes===notes)sessionStorage.removeItem('iq-unsent-notes');}catch{}}
