"""Source-informed UI review. Execute only against root-verified Condev staging.

Public API actions only navigate to a scoped question. Reviewed interactions use
the same visible controls and keyboard events available to players. This is not
a cold human playtest, an exploit test, or an audio-listening assessment.
"""
from pathlib import Path
import argparse
import hashlib
import json
import re
import traceback
import uuid
from playwright.sync_api import sync_playwright


parser = argparse.ArgumentParser()
parser.add_argument('--output', required=True)
parser.add_argument('--live-stage', required=True)
parser.add_argument('--base', default='http://localhost:18115')
parser.add_argument('--only', default='')
args = parser.parse_args()
OUT = Path(args.output)
OUT.mkdir(parents=True, exist_ok=True)
BASE = args.base.rstrip('/')
VIEWPORTS = [(1366, 768), (1920, 1080)]
REPORT = {
    'revision': 5,
    'method': 'Independent source-informed public-interface review; public API navigation between scoped questions',
    'human_playtesting': False,
    'human_listening': False,
    'anti_agent_effectiveness_tested': False,
    'runtime': 'Condev; staging and live-service parity are owned and attested separately by root',
    'live_stage': args.live_stage,
    'base': BASE,
    'checks': {},
    'screenshots': [],
    'errors': [],
}


def sha(value):
    return hashlib.sha256(value if isinstance(value, bytes) else value.encode()).hexdigest()


def write():
    (OUT / 'v5-quality-report.json').write_text(json.dumps(REPORT, indent=2), encoding='utf8')


def strong_characters(node, inherited=False):
    """Independent reading of supplied markup, not the server's answer predicate."""
    if 'text' in node:
        return [(char, inherited) for char in node['text']]
    covered = inherited or node['tag'].lower() == 'strong'
    return [item for child in node['children'] for item in strong_characters(child, covered)]


def proof_source(node):
    def escape(value):
        return str(value).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')
    if 'text' in node:
        return escape(node['text'])
    attrs = node.get('attrs', {})
    serialized = (' class="' + escape(attrs['class']) + '"') if attrs.get('class') else ''
    if 'fontWeight' in attrs.get('style', {}):
        serialized += ' style="font-weight: ' + str(attrs['style']['fontWeight']) + '"'
    return '<' + node['tag'] + serialized + '>' + ''.join(proof_source(child) for child in node['children']) + '</' + node['tag'] + '>'


NAV = {
    1: [('place-plus', {'index': 1}), ('answer', {'index': 1})],
    2: [('inspect', {}), ('answer', {'id': '2.0'})],
    4: [('move-tools', {'start': 10}), ('resize-c', {'size': 8}), ('apply', {})],
    5: [('toggle-account', {'id': 'NOBODY', 'allowed': False}), ('apply', {})],
    6: [('answer', {'id': 'both-routes'})],
    7: [('submit-password', {'value': ' '})],
    8: [('route', {'from': a, 'to': b}) for a, b in
        [('PC', 'S1'), ('S1', 'S2'), ('S2', 'S3'), ('S3', 'SERVER')]] + [('launch', {})],
    9: [('overlay', {'visible': False}), ('edit', {'field': 'employeeId', 'value': ''}),
        ('edit', {'field': 'comment', 'value': ''}), ('publish', {})],
    10: [('select-source', {'id': 'approved'}), ('copy-file', {}),
         ('select-device', {'id': '09'}), ('paste-file', {}), ('eject', {})],
    11: [('outer', {'open': True}), ('move-person', {'person': 'candidate', 'to': 'vestibule'}),
         ('outer', {'open': False}), ('hatch', {'open': False}), ('open-inner', {})],
    12: [('settings', {'page': 2, 'copies': 1}), ('cancel-host', {}),
         ('cancel-printer', {}), ('print', {})],
    13: [('answer', {'id': 'C'})],
    14: [('source', {'id': 'aux'}), ('answer', {'id': 'd'})],
}


class Review:
    def __init__(self, browser, target):
        self.target = target
        self.context = browser.new_context(viewport={'width': 1366, 'height': 768})
        self.page = self.context.new_page()
        self.page.set_default_timeout(7000)
        self.expected_http_error = None
        self.page.on('pageerror', lambda error: REPORT['errors'].append({'q': target, 'kind': 'page', 'text': str(error)}))
        self.page.on('console', lambda message: REPORT['errors'].append({'q': target, 'kind': 'console', 'text': message.text, 'expectedContext': self.expected_http_error}) if message.type == 'error' else None)
        self.keyboard_actions = []
        self.page.goto(BASE, wait_until='networkidle')
        self.page.wait_for_function("document.querySelector('.menu-grid button') && !document.querySelector('.menu-grid button').disabled")
        assert self.state()['questionVersion'] == 5, 'The live application is not revision 5.'
        self.navigate(target)

    def state(self):
        response = self.context.request.get(BASE + '/api/state')
        assert response.ok, response.text()
        return response.json()['state']

    def idle(self):
        self.page.wait_for_function("!document.querySelector('.question-body') || document.querySelector('.question-body').getAttribute('aria-busy') === 'false'")

    def button(self, name):
        return self.page.get_by_role('button', name=name, exact=True)

    def key(self, name):
        control = self.button(name)
        control.focus()
        focused = control.evaluate("e => ({focusVisible:e.matches(':focus-visible'),outline:getComputedStyle(e).outlineStyle})")
        assert focused['focusVisible'], (name, focused)
        self.page.keyboard.press('Enter')
        self.idle()
        self.keyboard_actions.append({'control': str(name), **focused})

    def select(self, label, value):
        """Use keyboard selection instead of assigning select values in page JS."""
        control = self.page.get_by_label(label, exact=True)
        options = control.locator('option').evaluate_all('(items)=>items.map(x=>({value:x.value,disabled:x.disabled}))')
        enabled = [item['value'] for item in options if not item['disabled']]
        assert str(value) in enabled, (label, value, enabled)
        control.focus()
        self.page.keyboard.press('Home')
        self.idle()
        for _ in range(enabled.index(str(value))):
            self.page.keyboard.press('ArrowDown')
            self.idle()
        self.page.keyboard.press('Enter')
        self.idle()
        assert control.input_value() == str(value), (label, control.input_value())
        self.keyboard_actions.append({'control': label, 'value': str(value), 'method': 'Home/ArrowDown/Enter'})

    def number(self, label, value):
        control = self.page.get_by_label(label, exact=True)
        control.focus()
        self.page.keyboard.press('Control+A')
        self.page.keyboard.type(str(value))
        self.page.keyboard.press('Tab')
        self.idle()
        self.keyboard_actions.append({'control': label, 'value': value, 'method': 'keyboard text'})

    def api(self, op, fields):
        current = self.state()
        response = self.context.request.post(BASE + '/api/action', data={
            'requestId': str(uuid.uuid4()), 'questionVersion': current['questionVersion'],
            'attempt': current['attempt'], 'revision': current['revision'], 'q': current['q'],
            'kind': 'play', 'op': op, 'args': fields,
        })
        result = response.json()
        assert response.ok and result.get('event') not in ['wrong', 'gameover'], result
        return result

    def navigate(self, target):
        while self.state()['q'] < target:
            current = self.state()
            if current['q'] == 3:
                candidates = [(item['id'], strong_characters(item['tree'])) for item in current['facts']['passwords']]
                answer = [identifier for identifier, chars in candidates if chars and all(inside for _, inside in chars)]
                assert len(answer) == 1, answer
                self.api('answer', {'id': answer[0]})
            else:
                for op, fields in NAV[current['q']]:
                    self.api(op, fields)
        assert self.state()['q'] == target
        self.reload()

    def reload(self):
        self.page.reload(wait_until='networkidle')
        self.key('RESUME' if self.state()['q'] > 1 else 'START')

    def dismiss(self):
        if self.button('Dismiss message').count():
            self.key('Dismiss message')

    def shot(self, name):
        self.idle()
        self.page.screenshot(path=str(OUT / (name + '.png')), full_page=True)
        observation = self.page.evaluate(r'''() => {
            const stage = document.querySelector('.stage').getBoundingClientRect();
            const dialog = document.querySelector('[role=dialog]');
            const candidates = [...document.querySelectorAll('.question-body button,.question-body input,.question-body select,.question-body textarea,[role=dialog] button,[role=dialog] input,[role=dialog] select,[role=dialog] textarea')];
            return {
                text:document.body.innerText,
                viewport:[innerWidth,innerHeight],
                documentSize:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],
                controls:[...new Set(candidates)].filter(e=>e.getClientRects().length).map(e=>{
                    const rect=e.getBoundingClientRect();
                    const over=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
                    return {
                        name:e.getAttribute('aria-label')||e.innerText||e.labels?.[0]?.innerText||e.tagName,
                        tag:e.tagName,disabled:!!e.disabled,
                        rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},
                        covered:!!over&&!e.contains(over)&&!over.contains(e),
                        backgroundWhileDialogOpen:!!dialog&&!e.closest('[role=dialog]'),
                        outsideStage:rect.left<stage.left-1||rect.right>stage.right+1||rect.top<stage.top-1||rect.bottom>stage.bottom+1,
                        textOverflow:e.scrollWidth>e.clientWidth+2,
                        cssOverflow:getComputedStyle(e).overflow
                    };
                })
            };
        }''')
        observation['name'] = name
        REPORT['screenshots'].append(observation)
        write()
        print(name, flush=True)

    def sizes(self, name):
        for width, height in VIEWPORTS:
            self.page.set_viewport_size({'width': width, 'height': height})
            self.shot(name + '-' + str(width))
        self.page.set_viewport_size({'width': 1366, 'height': 768})

    def dialog(self, opener, capture=None):
        self.key(opener)
        dialog = self.page.get_by_role('dialog')
        text = dialog.inner_text()
        pre_text = dialog.locator('pre').all_text_contents()
        controls = dialog.locator('button,input,select,textarea,[tabindex="0"]').all()
        focus = []
        for _ in range(max(5, len(controls) + 2)):
            self.page.keyboard.press('Tab')
            focus.append(self.page.evaluate("({name:document.activeElement.getAttribute('aria-label')||document.activeElement.innerText||document.activeElement.tagName,inside:!!document.activeElement.closest('[role=dialog]')})"))
        assert all(item['inside'] for item in focus), focus
        if capture:
            self.sizes(capture)
        self.page.keyboard.press('Escape')
        assert not self.page.get_by_role('dialog').count()
        assert self.button(opener).evaluate('e=>e===document.activeElement'), opener
        return {'text': text, 'preText': pre_text, 'focusCycle': focus, 'focusReturned': True}

    def tab_order(self):
        self.page.locator('.question-header h1').focus()
        result = []
        seen = set()
        for _ in range(100):
            self.page.keyboard.press('Tab')
            item = self.page.evaluate(r'''() => {
                const e=document.activeElement;
                return {index:[...document.querySelectorAll('button,input,select,textarea,[tabindex]')].indexOf(e),
                    name:e.getAttribute('aria-label')||e.innerText||e.labels?.[0]?.innerText||e.tagName,
                    inQuestion:!!e.closest('.question-body'),visible:e.matches(':focus-visible')};
            }''')
            if item['index'] in seen and item['index'] >= 0:
                break
            seen.add(item['index'])
            result.append(item)
        assert any(item['inQuestion'] for item in result), result
        assert all(item['visible'] for item in result if item['inQuestion']), result
        return result

    def proof(self):
        initial = self.state()
        trees = initial['facts']['passwords']
        semantic = {item['id']: strong_characters(item['tree']) for item in trees}
        correct = [key for key, chars in semantic.items() if chars and all(covered for _, covered in chars)]
        assert len(correct) == 1
        self.sizes('q03-house-style')
        tab_order = self.tab_order()

        def glyphs():
            return self.page.locator('.proof-card').evaluate_all(r'''cards => cards.map(card => {
                const root=card.querySelector('.password-proof');
                const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
                let node;const characters=[];
                while(node=walker.nextNode()) for(const char of node.textContent)
                    characters.push({char,weight:getComputedStyle(node.parentElement).fontWeight});
                return {id:card.querySelector('[data-answer]').dataset.answer,characters};
            })''')

        house = glyphs()
        assert all(''.join(char['char'] for char in card['characters']) == 'password' for card in house)
        assert {char['weight'] for card in house for char in card['characters']} == {'700'}, house
        inspected = {}
        for item in trees:
            card = item['id'].upper()
            inspected[card] = self.dialog('Inspect password ' + card + ' markup', 'q03-source-' + card.lower())
            assert inspected[card]['preText'] == [proof_source(item['tree'])], inspected[card]
        assert self.state()['lives'] == initial['lives'] and self.state()['q'] == 3
        self.key('Toggle house styling')
        authored = glyphs()
        assert any(char['weight'] != '700' for card in authored for char in card['characters'])
        winner = next(card for card in authored if card['id'] == correct[0])
        assert all(char['weight'] == '400' for char in winner['characters']), winner
        self.sizes('q03-authored-style')
        self.key('Toggle house styling')
        assert glyphs() == house
        self.key('Choose password ' + correct[0].upper())
        assert self.state()['q'] == 4 and self.state()['lives'] == 3
        return {'tabOrder': tab_order, 'semanticCoverage': semantic, 'houseStyleGlyphs': house,
                'authoredStyleGlyphs': authored, 'inspectedSource': inspected,
                'actualSourceMatchesSuppliedTrees': True, 'inspectionCostsNoLife': True,
                'semanticAnswerNotDeterminedByVisualWeight': True, 'keyboardActions': self.keyboard_actions}

    def disk(self):
        initial = self.state()
        initial_bytes = [block for block in initial['draft']['blocks'] if block is not None]
        prefs = self.page.evaluate("localStorage.getItem('iq-sound')")
        self.sizes('q04-mixer')
        tab_order = self.tab_order()
        level = self.page.get_by_label('Simulated speaker volume', exact=True)
        level.focus()
        self.page.keyboard.press('End')
        self.idle()
        mixer = self.state()
        assert mixer['draft']['mixer'] == 100 and mixer['draft']['cSize'] == 4
        assert mixer['draft']['blocks'] == initial['draft']['blocks']
        assert self.page.evaluate("localStorage.getItem('iq-sound')") == prefs
        self.sizes('q04-mixer-at-100')
        self.key('Open drive C volume')
        self.sizes('q04-initial-map')
        self.number('Drive C size in GB', 8)
        self.expected_http_error = 'Expected free geometry rejection: TOOLS blocks adjacent expansion.'
        self.key('RESIZE C:')
        rejected = self.state()
        self.expected_http_error = None
        assert rejected['lives'] == 3 and rejected['draft']['cSize'] == 4
        assert rejected['draft']['blocks'] == initial['draft']['blocks']
        obstruction = self.page.locator('.status-message').inner_text()
        self.sizes('q04-obstructed-extension')
        self.dismiss()
        self.number('TOOLS start block', 8)
        self.key('MOVE TOOLS')
        first_layout = self.state()['draft']
        assert first_layout['toolsStart'] == 8 and first_layout['blocks'][8:10] == initial['draft']['blocks'][4:6]
        assert sorted(block for block in first_layout['blocks'] if block is not None) == sorted(initial_bytes)
        self.number('Drive C size in GB', 8)
        self.key('RESIZE C:')
        assert self.state()['draft']['cSize'] == 8
        self.sizes('q04-tools-at-8-expanded')
        self.number('TOOLS start block', 10)
        self.key('MOVE TOOLS')
        prepared = self.state()['draft']
        assert prepared['toolsStart'] == 10 and prepared['cSize'] == 8
        assert prepared['blocks'][:4] == initial['draft']['blocks'][:4]
        assert prepared['blocks'][10:12] == initial['draft']['blocks'][4:6]
        assert sorted(block for block in prepared['blocks'] if block is not None) == sorted(initial_bytes)
        self.sizes('q04-tools-at-10-expanded')
        self.reload()
        assert self.state()['draft'] == prepared
        self.key('Open drive C volume')
        self.sizes('q04-expanded-after-reload')
        self.key('APPLY')
        assert self.state()['q'] == 5 and self.state()['lives'] == 3
        return {'tabOrder': tab_order, 'mixerDoesNotChangeDriveOrAudioPreference': True,
                'obstructionFeedback': obstruction, 'invalidGeometryCostsNoLifeOrBytes': True,
                'firstValidLayout': first_layout, 'secondValidLayout': prepared,
                'preservedFileHashes': [sha(block) for block in initial_bytes],
                'actualFileBytesRetained': True, 'allocationPersists': True,
                'keyboardActions': self.keyboard_actions}

    def recorder(self):
        initial = self.state()
        passwords = {item['id']: item['value'] for item in initial['facts']['passwords']}
        self.sizes('q14-initial')
        tab_order = self.tab_order()
        rule = self.page.locator('.capture-rule').inner_text()
        assert 'retained' in rule and 'queued' in rule and 'final tape' in rule
        tape = self.dialog('Inspect recorded tape', 'q14-retained-tape')
        spool = self.dialog('Inspect queued samples', 'q14-pending-spool')
        assert tape['preText'] == [initial['draft']['tape']]
        assert spool['preText'] == [''.join(initial['draft']['pending'])]
        self.key('AUX')
        assert self.state()['draft']['source'] == 'aux'
        self.key('INPUT')
        assert self.state()['draft']['source'] == 'input'
        self.key('Pause monitor')
        paused = self.state()
        assert paused['draft']['source'] == 'input' and paused['draft']['paused']
        assert self.dialog('Inspect queued samples')['preText'] == spool['preText']
        self.key(passwords['d'])
        captured = self.state()
        assert captured['q'] == 14 and captured['lives'] == 2
        assert passwords['d'] in captured['draft']['tape'] and not captured['draft']['pending']
        assert captured['draft']['monitorText'] == initial['draft']['monitorText']
        assert captured['draft']['tape'] == initial['draft']['tape'] + ''.join(initial['draft']['pending']) + passwords['d'] + '\n'
        self.dismiss()
        self.sizes('q14-paused-monitor-capture')
        after_tape = self.dialog('Inspect recorded tape', 'q14-live-tape-while-monitor-paused')
        assert after_tape['preText'] == [captured['draft']['tape']]
        self.key('Resume monitor')
        assert self.state()['draft']['monitorText'] == captured['draft']['tape']
        self.key(re.compile(r'^RELOAD DEMO'))
        assert self.state()['lives'] == 2 and self.state()['draft'] == initial['draft']
        self.key('AUX')
        self.key(passwords['a'])
        queued = self.state()
        assert queued['q'] == 14 and queued['lives'] == 1
        assert queued['draft']['source'] == 'aux'
        assert queued['draft']['tape'] == initial['draft']['tape'] + ''.join(initial['draft']['pending'])
        self.dismiss()
        self.sizes('q14-aux-does-not-erase-spool')
        self.dialog('Inspect recorded tape', 'q14-queued-choice-retained')
        self.key(re.compile(r'^RELOAD DEMO'))
        assert self.state()['lives'] == 1 and self.state()['draft'] == initial['draft']
        self.key('AUX')
        prepared = self.state()['draft']
        self.sizes('q14-aux-prepared')
        self.reload()
        assert self.state()['draft'] == prepared
        self.page.emulate_media(reduced_motion='reduce')
        self.sizes('q14-aux-reduced-motion')
        self.key(passwords['d'])
        assert self.state()['q'] == 15 and self.state()['lives'] == 1
        return {'tabOrder': tab_order, 'finalTapeRule': rule, 'retainedEvidence': tape,
                'spoolEvidence': spool, 'pausedCaptureState': captured['draft'],
                'auxQueuedChoiceState': queued['draft'], 'monitorPauseDoesNotStopCapture': True,
                'retainedAndQueuedBytesRemainInspectable': True, 'resetDoesNotRefundLives': True,
                'sourceAndStoragePersist': True, 'keyboardActions': self.keyboard_actions,
                'auxPlusPreviouslyAbsentSamplePasses': True}

    def packet(self):
        initial = self.state()
        self.sizes('q08-initial')
        tab_order = self.tab_order()
        inspected = {}
        for node in ['PC', 'R1', 'S1', 'S2', 'S3', 'SERVER']:
            self.key('Inspect ' + node)
            inspected[node] = self.page.locator('.question-body').inner_text()
            if node in ['R1', 'S1']:
                self.sizes('q08-inspect-' + node.lower())
        assert self.state()['lives'] == initial['lives']
        self.key('LAUNCH PACKET')
        expired = self.state()
        assert expired['q'] == 8 and expired['lives'] == 2, expired
        assert any(row['node'] == 'R1' and row['ttlIn'] == 1 and row['ttlOut'] == 0 and row['event'] == 'expired' for row in expired['draft']['trace'])
        self.dismiss()
        trace_expired = self.dialog('Inspect last packet trace', 'q08-router-trace')
        for source, destination in [('PC', 'S1'), ('S1', 'S2')]:
            self.key('Inspect ' + source)
            self.key('Route ' + source + ' to ' + destination)
        self.key('LAUNCH PACKET')
        loop = self.state()
        assert loop['q'] == 8 and loop['lives'] == 1
        assert loop['draft']['trace'][-1]['event'] == 'loop'
        assert all(row['ttlIn'] == 1 and row['ttlOut'] == 1 for row in loop['draft']['trace'])
        self.dismiss()
        trace_loop = self.dialog('Inspect last packet trace', 'q08-loop-trace')
        for source, destination in [('S2', 'S3'), ('S3', 'SERVER')]:
            self.key('Inspect ' + source)
            self.key('Route ' + source + ' to ' + destination)
        self.sizes('q08-switch-route')
        before = self.state()['draft']
        self.reload()
        assert self.state()['draft']['routes'] == before['routes']
        self.page.emulate_media(reduced_motion='reduce')
        self.sizes('q08-switch-route-reduced-motion')
        self.key('LAUNCH PACKET')
        assert self.state()['q'] == 9 and self.state()['lives'] == 1
        return {'tabOrder': tab_order, 'deviceEvidence': inspected, 'expiredTrace': expired['draft']['trace'],
                'loopTrace': loop['draft']['trace'], 'expiredDialog': trace_expired, 'loopDialog': trace_loop,
                'preparedRoutes': before['routes'], 'routeStatePersists': True, 'keyboardActions': self.keyboard_actions,
                'successfulSwitchRouteAfterTwoDistinctFailures': True}

    def printer(self):
        initial = self.state()
        self.sizes('q12-initial')
        tab_order = self.tab_order()
        preview_texts = [self.page.locator('.question-body').inner_text()]
        for _ in range(3):
            self.key('Next document page')
            preview_texts.append(self.page.locator('.question-body').inner_text())
        for _ in range(2):
            self.key('Previous document page')
        self.sizes('q12-second-document-page')
        document = self.dialog('Inspect document pages', 'q12-document-evidence')
        assert document['preText'] == [page['bytes'] for page in initial['facts']['document']['pages']]
        host = self.dialog('Inspect PC print queue', 'q12-host-queue')
        buffer = self.dialog('Inspect printer buffer', 'q12-printer-buffer')
        self.key('Cancel PC queue')
        after_cancel = self.state()['draft']
        assert not after_cancel['hostQueue'] and after_cancel['printerBuffer'] == initial['draft']['printerBuffer']
        self.select('Print page', '2')
        self.select('Copies', '1')
        self.key('PRINT')
        first_failure = self.state()
        assert first_failure['q'] == 12 and first_failure['lives'] == 2
        output = first_failure['draft']['output']
        assert len(output) == 2 and output[0]['bytes'] == initial['draft']['printerBuffer'][0]['bytes']
        assert output[1]['ordinal'] == 2
        self.dismiss()
        output_dialog = self.dialog('Inspect printed output', 'q12-buffer-survived-host-cancel')
        for sheet in output:
            assert sheet['bytes'].strip() in output_dialog['text'], output_dialog['text']
        self.key('Reset printer demo')
        reset = self.state()
        assert reset['lives'] == 2 and reset['draft'] == initial['draft']
        self.key('Cancel PC queue')
        self.key('Cancel printer buffer')
        self.select('Print page', '2')
        self.select('Copies', '2')
        self.key('PRINT')
        duplicate = self.state()
        assert duplicate['q'] == 12 and duplicate['lives'] == 1
        assert len(duplicate['draft']['output']) == 2
        assert all(sheet['ordinal'] == 2 for sheet in duplicate['draft']['output'])
        self.dismiss()
        self.dialog('Inspect printed output', 'q12-two-copies')
        self.key('Reset printer demo')
        assert self.state()['lives'] == 1 and self.state()['draft'] == initial['draft']
        self.key('Cancel printer buffer')
        self.key('Cancel PC queue')
        self.select('Print page', '2')
        self.select('Copies', '1')
        prepared = self.state()['draft']
        self.sizes('q12-one-page-prepared')
        self.reload()
        assert self.state()['draft'] == prepared
        self.key('PRINT')
        assert self.state()['q'] == 13 and self.state()['lives'] == 1
        return {'tabOrder': tab_order, 'documentPreviews': preview_texts, 'documentEvidence': document, 'hostEvidence': host,
                'printerEvidence': buffer, 'hostCancellationRetainsPrinterBuffer': True,
                'bufferedThenRequestedOutput': output, 'wrongCopiesOutput': duplicate['draft']['output'],
                'resetDoesNotRefundLives': True, 'preparedStatePersists': True,
                'keyboardActions': self.keyboard_actions, 'correctOneSheetCommit': True}


def main():
    stage = Path(args.live_stage)
    app = stage / 'challenge'
    if app.is_dir():
        REPORT['source_sha256'] = {
            str(path.relative_to(stage)): sha(path.read_bytes())
            for sub in ['server', 'client/src']
            for path in sorted((app / sub).rglob('*')) if path.is_file()
        }
    else:
        raise RuntimeError('The supplied live-stage does not contain the challenge source tree.')
    checks = [(3, 'semantic_password_scope', 'proof'), (4, 'disk_volume_and_adjacency', 'disk'),
              (8, 'packet_forwarding', 'packet'), (12, 'printer_ordinal_and_queues', 'printer'),
              (14, 'recorder_source_and_fifo', 'recorder')]
    selected = set(args.only.split(',')) if args.only else None
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            for question, name, method in checks:
                if selected and name not in selected and str(question) not in selected:
                    continue
                review = None
                try:
                    review = Review(browser, question)
                    REPORT['checks'][name] = {'status': 'passed', **getattr(review, method)()}
                except Exception as error:
                    REPORT['checks'][name] = {'status': 'failed', 'error': str(error), 'traceback': traceback.format_exc()}
                    if review:
                        try:
                            review.sizes('failure-q' + str(question).zfill(2))
                        except Exception as capture_error:
                            REPORT['checks'][name]['capture_error'] = str(capture_error)
                finally:
                    if review:
                        review.context.close()
                    write()
            REPORT['status'] = 'focused checks completed; individual failures retained'
        finally:
            write()
            browser.close()
    print(json.dumps({'status': REPORT.get('status'), 'checks': {name: result['status'] for name, result in REPORT['checks'].items()}}), flush=True)


if __name__ == '__main__':
    main()
