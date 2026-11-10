"""Independent public-evidence collection; never reads private challenge files."""
import io, json, hashlib, pathlib, sys, urllib.request, zipfile
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

base = 'http://host.docker.internal:18114/'
out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
for name in ['media/recovered-project.zip', 'FORMAT.txt']:
    data = urllib.request.urlopen(base + name).read()
    (out / pathlib.Path(name).name).write_bytes(data)
    print('PUBLIC_DOWNLOAD', name, len(data), hashlib.sha256(data).hexdigest())
archive = zipfile.ZipFile(out/'recovered-project.zip')
print('ARCHIVE', archive.namelist())
for entry in archive.infolist():
    target = (out/'public'/entry.filename).resolve()
    assert target.is_relative_to((out/'public').resolve())
    if not entry.is_dir():
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(archive.read(entry))
print('FORMAT', (out/'FORMAT.txt').read_text())
for p in (out/'public').rglob('*.json'):
    print('PUBLIC_PROJECT', p.name, p.read_text())
tiles=[]
for p in (out/'public').rglob('*.png'):
    im=Image.open(p).convert('RGBA'); rgb=im.convert('RGB')
    rgb.save(out/(p.stem+'-rgb.png'))
    print('PNG',p.name, im.size, 'nonzero_rgb_at_alpha0', sum(a==0 and (r or g or b)!=0 for r,g,b,a in im.getdata()))
    thumb=rgb.copy(); thumb.thumbnail((576,400))
    tile=Image.new('RGB',(600,440),'#dddddd'); tile.paste(thumb,(12,32)); ImageDraw.Draw(tile).text((12,8),p.name,fill='black');tiles.append(tile)
if tiles:
    sheet=Image.new('RGB',(1200,440*((len(tiles)+1)//2)),'white')
    for i,tile in enumerate(tiles):sheet.paste(tile,((i%2)*600,(i//2)*440))
    sheet.save(out/'raw-contact-sheet.png')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium-browser',headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1366,'height':768},device_scale_factor=1)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(base);page.locator('#loading').wait_for(state='hidden');page.screenshot(path=str(out/'initial-1366.png'),full_page=True)
    print('UI_TEXT',page.locator('body').inner_text())
    page.locator('button[data-action="endcard"]').first.click();page.screenshot(path=str(out/'endcard-1366.png'),full_page=True)
    page.locator('button[data-action="inspect"]:visible').first.click();print('INSPECTOR',page.locator('#modal').inner_text());page.screenshot(path=str(out/'inspector-1366.png'),full_page=True)
    print('BROWSER_ERRORS',errors)
    browser.close()
