import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

out = Path(__file__).parent
trace = out / 'v2-cold-actions.jsonl'
step = 0
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
    context = browser.new_context(viewport={'width': 1440, 'height': 1050})
    page = context.new_page()
    page.goto('http://localhost:18115', wait_until='networkidle')
    print('READY', flush=True)
    for line in sys.stdin:
        try:
            command = json.loads(line)
            op = command['op']
            if op == 'quit':
                break
            if op == 'click':
                if 'role' in command:
                    page.get_by_role(command['role'], name=command['name'], exact=command.get('exact', True)).click()
                elif 'text' in command:
                    page.get_by_text(command['text'], exact=command.get('exact', True)).click()
                else:
                    page.mouse.click(command['x'], command['y'])
            elif op == 'hover':
                if 'text' in command:
                    page.get_by_text(command['text'], exact=command.get('exact', True)).hover()
                else:
                    page.mouse.move(command['x'], command['y'])
            elif op == 'fill':
                page.get_by_role(command.get('role', 'textbox'), name=command.get('name', ''), exact=command.get('exact', True)).fill(command['value'])
            elif op == 'key':
                page.keyboard.press(command['key'])
            elif op == 'drag':
                page.mouse.move(*command['start'])
                page.mouse.down()
                page.mouse.move(*command['end'], steps=20)
                page.mouse.up()
            elif op == 'wait':
                page.wait_for_timeout(command.get('ms', 1000))
            elif op == 'inspect':
                pass
            else:
                raise ValueError('Unsupported ordinary UI operation')
            page.wait_for_timeout(400)
            step += 1
            file = out / f'v2-cold-{step:03d}.png'
            page.screenshot(path=str(file), full_page=True)
            result = {'step': step, 'command': command, 'screenshot': str(file), 'text': page.locator('body').inner_text(), 'controls': []}
            for element in page.locator('button, input, select, textarea, a, [role=button], [tabindex]').all():
                if element.is_visible():
                    result['controls'].append({'tag': element.evaluate('(e) => e.tagName'), 'text': element.inner_text(), 'aria': element.get_attribute('aria-label'), 'title': element.get_attribute('title'), 'type': element.get_attribute('type'), 'box': element.bounding_box()})
            with trace.open('a', encoding='utf-8') as f:
                f.write(json.dumps(result) + '\n')
            print(json.dumps(result), flush=True)
        except Exception as e:
            print(json.dumps({'error': str(e)}), flush=True)
    browser.close()
