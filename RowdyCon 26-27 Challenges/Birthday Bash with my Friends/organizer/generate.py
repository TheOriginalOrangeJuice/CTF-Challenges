"""Deterministic authored evidence. Run inside Condev; never ship this directory."""
from pathlib import Path
import hashlib, json
ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'challenge' / 'public'
KEY = 'QXJMVZPKTRNBYWFS'
SAMPLE_KEY = 'BZQYHXRKVJPTMNFS'
FLAG = 'RCC{STAY_QUIET_VJQZKXMPYBNDFLRAS}'
TARGET = f'''HELLO, HELLO.

IF YOU FIND THIS, I AM NOT IN THE OFFICE.
THE KIDS LEFT THEIR CLUB PROGRAM ON THIS MACHINE.
IT CAN KEEP A SECRET BETTER THAN THE PHONE.
TAKE THIS, PLEASE: {FLAG}

DO NOT TRUST THE VOICE IN THE HALL. IT HAS BEEN PRACTISING MY GREETING.
THE DOOR IS OPEN. I CAN HEAR IT BREATHING. GO.

GOOD NIGHT.'''
SAMPLE = '''DEAR BIRTHDAY CLUB,
THANK YOU FOR THE PARTY. FREDDY SANG MY FAVOURITE SONG AND BONNIE LET ME HOLD HIS GUITAR.
PLEASE SAVE ME ANOTHER SLICE OF CAKE!
YOUR FRIEND, SAM.'''
NOTES = [
 {'id':'01','name':'01 - welcome.txt','stamp':'11/10/2014 11:46 PM','text':'''Hello, hello.

Welcome to the night shift! I used to sit in that chair. A few things before I go:

The fan rattles. The left drawer sticks. The computer still has that birthday-club software on it. The kids used it to write secret postcards. There is one saved example if you fancy a quiet minute.

Leave the place looking cheerful for the morning crew. They never see it like this.

Good night.''','tag':'First shift'},
 {'id':'03','name':'03 - about the phone.txt','stamp':'11/12/2014 11:51 PM','text':'''Hello, hello.

I heard myself on the phone tonight. A recording, probably. Except it answered before I said anything.

I put fresh batteries in the little club decoder. Sixteen letters to start the ribbon. The children never used words for those starters. The postcard has its own; I used a different one for my notes.

Please stop leaving the office door open. I know it gets warm in there.

Good night.''','tag':'Third shift'},
 {'id':'04','name':'04 - do not call.txt','stamp':'11/13/2014 11:58 PM','text':'''Hello, hello.

Do not pick up the phone.

It has the laugh right now. It has the pauses. It is learning the rest.

I am putting my last message in the club program. If anyone comes looking, leave the computer on. I always start and finish a note the same way. Habit, I suppose.

Good night.''','tag':'Fourth shift'}
]
def az(text):
    return ''.join(c for c in text.upper() if 'A' <= c <= 'Z')
def encrypt(text, key):
    p = az(text); ribbon = key + p
    encoded = iter(chr(65+(ord(c)+ord(ribbon[i])-130)%26) for i,c in enumerate(p))
    return ''.join(next(encoded) if 'A' <= c <= 'Z' else c for c in text)
def main():
    assert len(az(TARGET)) == 256, len(az(TARGET))
    assert az(TARGET).startswith('HELLOHELLO') and az(TARGET).endswith('GOODNIGHT')
    assert az(TARGET).index('RCC') == 128
    assert len(KEY) == len(SAMPLE_KEY) == 16 and KEY != SAMPLE_KEY
    PUBLIC.mkdir(parents=True, exist_ok=True)
    (PUBLIC/'evidence').mkdir(exist_ok=True)
    (ROOT/'challenge'/'completion.sha256').write_text(hashlib.sha256(FLAG.encode('utf-8')).hexdigest()+'\n',encoding='ascii')
    data = {'version':'hello-hello-v2','sample':{'name':'Birthday postcard','plain':SAMPLE,'cipher':encrypt(SAMPLE,SAMPLE_KEY)},'target':{'name':'05 - last note.enc','cipher':encrypt(TARGET,KEY)},'notes':NOTES}
    (PUBLIC/'evidence.json').write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    (PUBLIC/'evidence'/'05-last-note.enc.txt').write_text(data['target']['cipher']+'\n',encoding='utf-8')
    (PUBLIC/'evidence'/'birthday-postcard.txt').write_text('FAZBEAR SECRET CLUB — SAVED POSTCARD\n\nMESSAGE\n'+SAMPLE+'\n\nENCODED\n'+data['sample']['cipher']+'\n',encoding='utf-8')
    for note in NOTES:
        (PUBLIC/'evidence'/note['name'].replace(' ','-')).write_text(note['text']+'\n',encoding='utf-8')
    hashes={str(p.relative_to(PUBLIC)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(PUBLIC.rglob('*')) if p.is_file()}
    (ROOT/'organizer'/'generated-hashes.json').write_text(json.dumps(hashes,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'letters':len(az(TARGET)),'flag_start':128,'public_files':len(hashes),'deterministic':True}))
if __name__ == '__main__': main()
