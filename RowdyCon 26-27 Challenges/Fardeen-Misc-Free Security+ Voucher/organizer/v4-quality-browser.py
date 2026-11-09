"""Source-informed focused review via public controls/API; run only in verified Condev staging."""
from pathlib import Path
import argparse, hashlib, json, re, traceback, uuid
from playwright.sync_api import sync_playwright

p=argparse.ArgumentParser()
p.add_argument('--output',required=True)
p.add_argument('--live-stage',required=True)
p.add_argument('--base',default='http://localhost:18115')
p.add_argument('--only',default='')
args=p.parse_args()
OUT=Path(args.output);OUT.mkdir(parents=True,exist_ok=True);BASE=args.base
R={'method':'Independent source-informed public-interface review; public API navigation between scoped questions',
   'human_playtesting':False,'human_listening':False,'anti_agent_effectiveness_tested':False,
   'live_stage':args.live_stage,'base':BASE,'checks':{},'screenshots':[],'errors':[]}
STEPS={1:[('place-plus',{'index':1}),('answer',{'index':1})],2:[('inspect',{}),('answer',{'id':'2.0'})],
       3:[('answer',{'id':'c'})],4:[('answer',{'id':'destroy-key'})],5:[('toggle-account',{'id':'NOBODY','allowed':False}),('apply',{})],
       6:[('answer',{'id':'both-routes'})],7:[('submit-password',{'value':' '})],8:[('answer',{'id':'c'})],
       9:[('overlay',{'visible':False}),('edit',{'field':'employeeId','value':''}),('edit',{'field':'comment','value':''}),('publish',{})],
       10:[('select-source',{'id':'approved'}),('copy-file',{}),('select-device',{'id':'09'}),('paste-file',{}),('eject',{})],
       11:[('outer',{'open':True}),('move-person',{'person':'candidate','to':'vestibule'}),('outer',{'open':False}),('hatch',{'open':False}),('open-inner',{})],
       12:[('select-session',{'id':i,'selected':True}) for i in ['desk','phone','tablet','remote','header']]+[('revoke',{})],
       13:[('answer',{'id':'C'})],14:[('recording',{'on':False}),('answer',{'id':'a'})],
       15:[('reorder',{'order':['intern','staff443','deny','header','any']}),('apply',{})],
       16:[('set-count',{'value':'06'}),('submit-count',{})],18:[('answer',{'id':'neither'})]}

def write(): (OUT/'v4-quality-report.json').write_text(json.dumps(R,indent=2),encoding='utf8')
def sha(value):return hashlib.sha256(value.encode()).hexdigest()
def combine_bits(tokens, transforms):
    width=tokens[0]['share']['width'];height=tokens[0]['share']['height'];result=[0]*(width*height)
    for t in tokens:
        if t['id'] not in transforms:continue
        transform=transforms[t['id']];b=t['share']
        for y in range(b['height']):
            for x in range(b['width']):
                if b['pixels'][y*b['width']+x]!='1':continue
                tx,ty=x,y
                if transform['rotation']==180:tx,ty=b['width']-1-x,b['height']-1-y
                tx+=transform['x'];ty+=transform['y']
                if 0<=tx<width and 0<=ty<height:result[ty*width+tx]^=1
    path=''
    for y in range(height):
        x=0
        while x<width:
            if not result[y*width+x]:x+=1;continue
            start=x
            while x<width and result[y*width+x]:x+=1
            path+=f'M{start},{y}h{x-start}v1h-{x-start}z'
    return path

with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True)
    ctx=browser.new_context(viewport={'width':1366,'height':768})
    page=ctx.new_page();page.set_default_timeout(6000)
    page.on('pageerror',lambda e:R['errors'].append(str(e)))
    page.on('console',lambda m:R['errors'].append(m.text) if m.type=='error' else None)
    def state():return ctx.request.get(BASE+'/api/state').json()['state']
    def idle():page.wait_for_function("!document.querySelector('.question-body')||document.querySelector('.question-body').getAttribute('aria-busy')==='false'")
    def button(name):return page.get_by_role('button',name=name,exact=True)
    def click(name):button(name).click();idle()
    def key(name):button(name).focus();page.keyboard.press('Enter');idle()
    def refresh():
        page.reload(wait_until='networkidle');click('RESUME' if state()['q']>1 else 'START')
    def api(op,fields):
        s=state();r=ctx.request.post(BASE+'/api/action',data={'requestId':str(uuid.uuid4()),'questionVersion':s['questionVersion'],
          'attempt':s['attempt'],'revision':s['revision'],'q':s['q'],'kind':'play','op':op,'args':fields});d=r.json()
        assert r.ok and d.get('event') not in ['wrong','gameover'],d
        return d
    def nav(q):
        while state()['q']<q:
            current=state()
            if current['q']==10:
                R.setdefault('q10_navigation_hash',next(f['sha256'] for f in current['facts']['files'] if f['id']=='approved'))
            if current['q']==17:
                api('bind',{'reference':R.get('q10_observed_hash') or R['q10_navigation_hash']});api('deploy',{})
            else:
                for op,fields in STEPS[current['q']]:api(op,fields)
        assert state()['q']==q;refresh()
    def shot(name):
        idle();page.screenshot(path=str(OUT/(name+'.png')),full_page=True)
        data=page.evaluate(r'''()=>{const s=document.querySelector('.stage').getBoundingClientRect();return {
          text:document.body.innerText,viewport:[innerWidth,innerHeight],scroll:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],
          controls:[...document.querySelectorAll('.question-body button,.question-body input,.question-body textarea')].filter(e=>e.getClientRects().length).map(e=>{
            const r=e.getBoundingClientRect(),c=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {
              name:e.getAttribute('aria-label')||e.innerText,disabled:!!e.disabled,rect:{x:r.x,y:r.y,w:r.width,h:r.height},
              covered:!!c&&!e.contains(c)&&!c.contains(e),outside:r.left<s.left-1||r.right>s.right+1||r.top<s.top-1||r.bottom>s.bottom+1};})};}''')
        data['name']=name;R['screenshots'].append(data);write();print(name,flush=True)
    def sizes(name):
        for w,h in [(1366,768),(1920,1080)]:page.set_viewport_size({'width':w,'height':h});shot(name+'-'+str(w))
        page.set_viewport_size({'width':1366,'height':768})
    def check(name,fn):
        if args.only and name not in args.only.split(','):return
        try:R['checks'][name]=fn()
        except Exception as exc:
            R['checks'][name]={'failed':str(exc),'traceback':traceback.format_exc()}
            try:shot('failure-'+name)
            except Exception:pass
        write()
    def dialog_focus():
        observations=[]
        for _ in range(8):
            page.keyboard.press('Tab')
            observations.append(page.evaluate("({name:document.activeElement.getAttribute('aria-label')||document.activeElement.tagName,inDialog:!!document.activeElement.closest('[role=dialog]')})"))
        assert all(x['inDialog'] for x in observations),observations
        return observations
    def dismiss():
        if button('Dismiss message').count():click('Dismiss message')
    def pixels(label):return page.get_by_role('img',name=label,exact=True).locator('path').nth(0).get_attribute('d')
    try:
        page.goto(BASE,wait_until='networkidle');page.wait_for_function("document.querySelector('.menu-grid button')&&!document.querySelector('.menu-grid button').disabled")
        click('START');R['questionVersion']=state()['questionVersion'];assert state()['questionVersion']==4
        nav(4)
        def archive():
            text=page.locator('.question-body').inner_text();assert 'DESTROY K7' in text and 'FORGET IT' not in text,text
            sizes('q04-key-erasure');return {'visible_copy':text}
        check('archive_wording',archive);nav(10)
        def source_hash():
            initial=page.locator('.question-body').inner_text();sizes('q10-initial')
            key('Select approved file')
            # Names are ordinary file-operation labels, not a request to remember this evidence.
            options=page.get_by_role('button',name=re.compile('properties|details|inspect',re.I)).all()
            assert options,'No ordinary file-properties control found at Q10'
            options[0].focus();page.keyboard.press('Enter');idle()
            digest=page.get_by_role('dialog').locator('textarea,input').all()
            values=[e.input_value() for e in digest]
            full=next((v for v in values if re.fullmatch('[0-9a-f]{64}',v)),None)
            assert full,values
            source=next(f for f in state()['facts']['files'] if f['id']=='approved')
            assert full==sha(source['bytes'])
            R['q10_observed_hash']=full
            sizes('q10-file-properties');focus=dialog_focus();page.keyboard.press('Escape')
            restored=page.evaluate("document.activeElement.getAttribute('aria-label')||document.activeElement.innerText")
            key('COPY');key('Select destination device 09');key('PASTE');key('⏏ EJECT 09')
            s=state();assert s['q']==11
            assert not any(n['id']=='approved-release' for n in s['notebook']),s['notebook']
            assert full not in s['notes'],s['notes']
            key('Open evidence notebook');notebook_text=page.get_by_role('dialog').inner_text()
            assert full not in notebook_text and 'USB BACKUP' not in notebook_text,notebook_text
            page.keyboard.press('Escape')
            return {'initial_copy':initial,'observed_sha256':full,'focus_cycle':focus,'restored_focus':restored,
                    'automatic_release_notebook_artifact':False,'automatic_personal_notes':False}
        check('q10_hash_visibility',source_hash);nav(13)
        def badges():
            badges=state()['facts']['badges'];counts={b['id']:{k:b[k]['pixels'].count('1') for k in ['approved','current']} for b in badges}
            dims={b['id']:[b['current']['width'],b['current']['height']] for b in badges}
            assert len(set(tuple(x) for x in dims.values()))==1,dims
            assert len(set(x[k] for x in counts.values() for k in x))==1,counts
            delta={b['id']:sum(a!=c for a,c in zip(b['approved']['pixels'],b['current']['pixels'])) for b in badges}
            assert delta=={'A':0,'B':0,'C':20,'D':0},delta
            sizes('q13-raw-badges');key('LOAD APPROVED')
            assert pixels('Difference pixels A')=='' and pixels('Difference pixels B')=='' and pixels('Difference pixels D')==''
            baseline=pixels('Difference pixels C');assert baseline
            key('Move image right');assert pixels('Difference pixels A')!=''
            key('Move image left');assert pixels('Difference pixels A')=='' and pixels('Difference pixels C')==baseline
            sizes('q13-real-difference');return {'black_pixel_counts':counts,'dimensions':dims,'changed_pixels':delta,'misalignment_changes_actual_pixels':True}
        check('badge_data_and_viewer',badges);nav(16)
        def checksum():
            original=page.locator('.checksum-reference-v4').inner_text();sizes('q16-reference')
            field=page.get_by_label('Revised two-digit count',exact=True);field.focus();field.fill('06')
            assert page.locator('.checksum-reference-v4').inner_text()==original
            revised=page.locator('.checksum-edit-v4').inner_text();sizes('q16-collision')
            refresh();assert page.get_by_label('Revised two-digit count',exact=True).input_value()=='06'
            key('REPLACE FILE');assert state()['q']==17
            return {'fixed_original_copy':original,'revised_copy':revised,'leading_zero_preserved_on_reload':True,'keyboard_commit':True}
        check('checksum_reference',checksum);nav(17)
        def deploy():
            s=state();assert not any(n['id']=='approved-release' for n in s['notebook'])
            assert not button('Inspect USB backup').count()
            initial=page.locator('.question-body').inner_text();sizes('q17-no-receipt')
            q10=R.get('q10_observed_hash') or R.get('q10_navigation_hash')
            assert q10,'Q10 hash must be available from its earlier public evidence'
            key('Open evidence notebook');note='Manual review note: '+q10
            page.get_by_label('Your notes',exact=True).fill(note);page.keyboard.press('Escape');idle();refresh()
            key('Open evidence notebook');assert page.get_by_label('Your notes',exact=True).input_value()==note
            page.keyboard.press('Escape');idle()
            releases=s['facts']['releases'];matched=next(r for r in releases if r['sha256']==q10)
            key('Inspect '+matched['id']);digest=page.get_by_label('Artifact digest',exact=True).input_value();assert digest==q10
            sizes('q17-release-details');focus=dialog_focus();page.keyboard.press('Escape')
            wrong=next(r for r in releases if r['sha256']!=q10)
            page.get_by_label('Deployment reference',exact=True).fill(wrong['sha256'])
            lives=s['lives'];key('DEPLOY →');after=state();assert after['q']==17 and after['lives']==lives-2,(lives,after)
            reaction=page.locator('.footer-proctor').inner_html();message=page.locator('body').inner_text();shot('q17-wrong-deployment')
            assert 'angry' in reaction or 'wrong' in reaction or 'angry' in message.lower(),(reaction,message)
            dismiss();page.get_by_label('Deployment reference',exact=True).fill(q10);refresh()
            assert page.get_by_label('Deployment reference',exact=True).input_value()==q10
            key('DEPLOY →');assert state()['q']==18
            return {'initial_copy':initial,'matched_reference':matched['id'],'digest':digest,'focus_cycle':focus,
                    'q10_hash_source':'file properties UI' if R.get('q10_observed_hash') else 'earlier public facts for focused navigation',
                    'wrong_cost':lives-after['lives'],'wrong_message':message,'reaction_markup':reaction,
                    'draft_preserved_on_reload':True,'manual_notes_label_and_reload':True,'recovered_with_observed_hash':True}
        check('q17_recall_and_penalty',deploy);nav(19)
        def log_chain():
            records=state()['draft']['records'];assert len(records)==8,len(records)
            assert len({r['timestamp'] for r in records})==1
            denials=[r for r in records if r['action']=='DENY'];assert len(denials)>=5
            assert all(sha(r['bytes'])==r['sha256'] for r in records)
            chain=[next(r for r in records if r['anchor'])]
            while True:
                found=[r for r in records if r['previousHash']==chain[-1]['sha256']]
                if not found:break
                assert len(found)==1;chain.append(found[0]);assert len(chain)<=len(records)
            assert len(chain)==len(records)
            target=[r for r in chain if r['action']=='DENY'][-1];assert target!=chain[-1]
            sizes('q19-page1');seen=[]
            for page_number in [1,2]:
                ids=[b.get_attribute('aria-label').replace('Inspect log ','') for b in page.get_by_role('button',name=re.compile('^Inspect log ')).all()]
                assert len(ids)==4,ids;seen.extend(ids)
                for rid in ids:
                    row=next(r for r in records if r['id']==rid);key('Inspect log '+rid)
                    assert page.get_by_label('Record fingerprint',exact=True).input_value()==row['sha256']
                    assert page.get_by_label('Previous fingerprint',exact=True).input_value()==(row['previousHash'] or 'Chain anchor')
                    assert page.locator('.evidence-body pre').text_content()==row['bytes']
                    if rid==target['id']:
                        sizes('q19-target-full-details');dialog_focus()
                        for w,h in [(1366,768),(1920,1080)]:
                            page.set_viewport_size({'width':w,'height':h})
                            page.locator('.evidence-body pre').focus();page.keyboard.press('Control+End')
                            scroll=page.locator('.evidence-body').evaluate('(e)=>({top:e.scrollTop,height:e.clientHeight,total:e.scrollHeight})')
                            assert scroll['top']>0,scroll
                            shot('q19-record-scrolled-'+str(w))
                        page.set_viewport_size({'width':1366,'height':768})
                    page.keyboard.press('Escape');assert page.evaluate("document.activeElement.getAttribute('aria-label')")=='Inspect log '+rid
                if page_number==1:
                    next_buttons=page.get_by_role('button',name=re.compile('next',re.I)).all();assert len(next_buttons)==1
                    next_buttons[0].focus();page.keyboard.press('Enter');idle();sizes('q19-page2')
            assert set(seen)=={r['id'] for r in records}
            if not button('Archive log '+target['id']).count():
                previous=page.get_by_role('button',name=re.compile('previous',re.I));previous.focus();page.keyboard.press('Enter');idle()
            key('Archive log '+target['id']);assert state()['q']==20
            return {'record_count':len(records),'deny_count':len(denials),'timestamp':records[0]['timestamp'],
                    'display_order':[r['id'] for r in records],'chain':[r['id'] for r in chain],'latest_deny':target['id'],
                    'hashes_match_exact_bytes':True,'all_records_inspected':seen,'keyboard_archive':True}
        check('causal_log_review',log_chain)
        def final_viewer():
            assert state()['q']==20
            tokens=state()['tokens'];transforms={};zero={'x':0,'y':0,'rotation':0}
            def current():return page.get_by_role('img',name=re.compile('^Combined token pixels from ')).locator('path').nth(0).get_attribute('d')
            def exact():assert current()==combine_bits(tokens,transforms)
            for i in range(1,4):assert button(f'Add token {i} layer').is_disabled()
            assert button('Move selected image right by 1 pixel').is_disabled()
            sizes('q20-empty-viewer')
            key('Show token 1 reverse');key('Add token 1 layer');transforms[tokens[0]['id']]=dict(zero);exact()
            assert button('Select token 1 layer').get_attribute('aria-pressed')=='true'
            key('Show token 2 reverse')
            button('Pick up token 2 reverse image').focus();page.keyboard.press('Space')
            assert page.locator('.drag-status').inner_text();page.keyboard.press('Escape')
            assert not page.locator('.drag-status').inner_text();exact()
            button('Pick up token 2 reverse image').focus();page.keyboard.press('Space')
            page.get_by_role('group',name='XOR viewer image input',exact=True).focus();page.keyboard.press('Enter')
            transforms[tokens[1]['id']]=dict(zero);exact()
            key('Show token 3 reverse');key('Add token 3 layer');transforms[tokens[2]['id']]=dict(zero);exact()
            aligned=current();sizes('q20-aligned-three')
            key('Move selected image right by 1 pixel');transforms[tokens[2]['id']]['x']=1;exact();assert current()!=aligned
            shifted=current();key('Rotate selected image by 180 degrees');transforms[tokens[2]['id']]['rotation']=180;exact();assert current()!=shifted
            sizes('q20-misaligned-rotated')
            key('Select token 1 layer');assert 'X: 0' in page.get_by_label('Selected image position and angle',exact=True).inner_text();exact()
            key('Select token 3 layer');assert 'X: 1' in page.get_by_label('Selected image position and angle',exact=True).inner_text()
            page.get_by_label('Certificate PIN',exact=True).fill('604');refresh();exact()
            assert page.get_by_label('Certificate PIN',exact=True).input_value()=='604'
            assert button('Select token 3 layer').get_attribute('aria-pressed')=='true'
            key('Remove token 3 layer');del transforms[tokens[2]['id']];exact()
            assert button('Select token 3 layer').is_disabled()
            key('Add token 3 layer');transforms[tokens[2]['id']]=dict(zero);exact();assert current()==aligned
            key('Show token 3 front');exact()
            key('Magnify combined token pixels');assert pixels('Magnified combined pixels')==aligned
            sizes('q20-magnified');focus=dialog_focus();page.keyboard.press('Escape')
            restored=page.evaluate("document.activeElement.getAttribute('aria-label')")
            assert restored=='Magnify combined token pixels',restored
            page.emulate_media(reduced_motion='reduce');sizes('q20-reduced-motion');exact()
            page.get_by_label('Certificate PIN',exact=True).fill('604827');key('UNLOCK')
            page.get_by_role('heading',name='CERTIFIED!',exact=True).wait_for();sizes('q20-reward')
            assert state()['status']=='won' and state()['skips']==0
            return {'ordinary_add_and_keyboard_drop':True,'cancel_pickup_preserves_pixels':True,
                    'independent_pixel_transform_checks':['one layer','two layers','three layers','x offset','180-degree rotation','remove','re-add'],
                    'aligned_svg_path_sha256':sha(aligned),'misaligned_svg_path_sha256':sha(shifted),
                    'pin_and_layer_drafts_survive_reload':True,'layer_selection_survives_reload':True,
                    'front_face_does_not_remove_pinned_layer':True,'magnifier_same_actual_pixels':True,
                    'magnifier_focus_cycle':focus,'restored_focus':restored,'reduced_motion_checked':True,
                    'reward_and_atomic_token_consumption':True}
        check('final_viewer_controls_and_pixels',final_viewer)
        R['status']='focused checks completed; individual failures retained'
    except Exception as exc:
        R['status']='interrupted';R['exception']=str(exc);R['traceback']=traceback.format_exc()
    finally:
        write();print(json.dumps({'status':R.get('status'),'checks':{k:('failed' if 'failed' in v else 'passed') for k,v in R['checks'].items()}}),flush=True)
        browser.close()
