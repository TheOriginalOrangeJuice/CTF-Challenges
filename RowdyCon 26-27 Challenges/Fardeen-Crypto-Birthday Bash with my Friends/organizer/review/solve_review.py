"""Recover only from downloaded public evidence; no application/private imports."""
import hashlib
import json
import pathlib
import re
import sys
from playwright.sync_api import sync_playwright

OUT = pathlib.Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)
BASE = 'http://host.docker.internal:18113'
def letters(s):
    return re.sub('[^A-Z]', '', s.upper())
def render(template, recovered):
    it = iter(recovered)
    return ''.join(next(it) if c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' else c for c in template)
def propagate(cipher, pins, shift):
    known = dict(pins)
    changed = True
    while changed:
        changed = False
        for i in range(shift, len(cipher)):
            for a,b in [(i, i-shift),(i-shift,i)]:
                if a in known and b not in known:
                    known[b] = chr((ord(cipher[i])-ord(known[a])) % 26 + 65)
                    changed = True
    return ''.join(known.get(i, '.') for i in range(len(cipher)))

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium-browser', headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width':1366, 'height':768})
    page.goto(BASE, wait_until='networkidle')
    samples = page.request.get(BASE+'/evidence/birthday-postcard.txt').text()
    target = page.request.get(BASE+'/evidence/05-last-note.enc.txt').text()
    example_plain, example_code = samples.split('MESSAGE\n',1)[1].split('\nENCODED\n')
    ep, ec = letters(example_plain), letters(example_code)
    key = ''.join(chr((ord(c)-ord(m))%26+65) for m,c in zip(ep,ec))
    offsets = [n for n in range(1,33) if key[n:]==ep[:-n]]
    assert offsets == [16], offsets
    cipher = letters(target)
    greeting = {i:c for i,c in enumerate('HELLOHELLO')}
    ending = {len(cipher)-len('GOODNIGHT')+i:c for i,c in enumerate('GOODNIGHT')}
    partial = propagate(cipher, greeting, offsets[0])
    tail_only = propagate(cipher, ending, offsets[0])
    complete = propagate(cipher, greeting | ending, offsets[0])
    assert '.' not in complete
    recovered = render(target, complete)
    print('INFERRED OFFSET', offsets)
    print('GREETING ONLY', render(target, partial))
    print('ENDING ONLY', render(target, tail_only))
    print('PUBLICLY RECOVERED', recovered)
    page.locator('#phrase').fill('HELLOHELLO')
    page.get_by_role('button', name='Pin', exact=True).click()
    independent = page.locator('body').inner_text()
    assert '10 / 256 letters filled' in independent
    page.locator('#link-source').select_option(label='Copy message')
    linked = page.locator('body').inner_text()
    assert '160 / 256 letters filled' in linked
    page.screenshot(path=str(OUT/'03-greeting-only-1366.png'), full_page=True)
    page.locator('#phrase').fill('GOODNIGHT')
    page.locator('#position').fill(str(len(cipher)-8))
    page.get_by_role('button', name='Pin', exact=True).click()
    assert '256 / 256 letters filled' in page.locator('body').inner_text()
    page.locator('#open-message').click()
    ui_message = page.locator('dialog[open]').inner_text()
    assert recovered.strip() in ui_message
    page.screenshot(path=str(OUT/'04-recovered-1366.png'), full_page=True)
    with page.expect_download() as download_info:
        page.locator('#reader-download').click()
    download = download_info.value
    download.save_as(str(OUT/'publicly-recovered.txt'))
    page.keyboard.press('Escape')
    with page.expect_download() as download_info:
        page.locator('#save-work').click()
    download_info.value.save_as(str(OUT/'solved-working-copy.json'))
    hashes = {}
    for path in ['/', '/app.js', '/evidence/05-last-note.enc.txt', '/evidence/birthday-postcard.txt']:
        response = page.request.get(BASE+path)
        hashes[path] = hashlib.sha256(response.body()).hexdigest()
    result = {'review_kind':'independent agent public-evidence solve, design known',
              'private_sources_read_before_recovery':False,
              'offset_inferred_from_pair':offsets, 'letters':len(cipher),
              'no_link_greeting_letters':10, 'linked_greeting_letters':160,
              'greeting_only':render(target,partial), 'ending_only':render(target,tail_only),
              'recovered':recovered, 'flag':re.search(r'RCC\{[^}]+\}',recovered).group(),
              'ui_matches_independent_recovery':True,'public_sha256':hashes}
    (OUT/'public-solve.json').write_text(json.dumps(result,indent=2))
    browser.close()
