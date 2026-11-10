# My First Gaming Clan — voice social-engineering challenge

A browser clone of the 2012 TeamSpeak 3 client (Windows 7 Aero look) with a small Node.js backend
that behaves like a TS3 server: channel tree, spacers, password channels, groups, privilege keys,
pokes, chat, kicks, and scripted bots that chat and "talk". The challenge: get the server owner,
**[Admin] Marcel**, to tell you the flag — by speaking to him with your microphone. He only ever
*says* it, letter by letter.

Marcel is a deterministic state machine with fuzzy intent matching, not an LLM: no GPU, no API keys,
no network. Speech-to-text runs in the player's browser (Web Speech API), the server only receives
text, and Marcel's replies are pre-rendered Speex-flavoured voice clips. The container idles at ~17 MB.

## Deploy

```
docker build -t ts3-voice .
docker run --rm -p 8080:8080 -e FLAG='RCC{m0m_1m_1n_4_cl4n_n0w}' ts3-voice
```

* Plain HTTP on **8080**, nothing else. `/api/health` returns `{"ok":true,...,"voice":true}` and backs
  the image's HEALTHCHECK.
* **The microphone only works on HTTPS origins** (or `localhost`). The CTFd / instancer proxy in front
  of the container must terminate TLS and proxy WebSockets (`/ws`).
* `FLAG` may contain `a-z A-Z 0-9 { } _ - . ! @ # $ % & * + = / : ?` and spaces (uppercase is spoken as
  "capital"). The server refuses to start if a character has no clip.
* `docker compose up --build` does the same for local runs.

Challenge text for players should say: **Google Chrome or Edge, allow the microphone, Push-To-Talk is
Ctrl (Options > Capture).** Brave, Firefox, Safari and plain Chromium have no usable speech recognition;
the client tells them so.

| Environment variable | Default | Meaning |
|---|---|---|
| `FLAG` | `RCC{m0m_1m_1n_4_cl4n_n0w}` | the flag Marcel spells (`RCC{...}`) |
| `PORT` | 8080 | HTTP + WebSocket port |
| `ADMIN_ROOM_PASSWORD` | `dust22010` | part of the puzzle (map + founding year) |
| `QUERY_PORT` | 10011 (`0` in Docker) | TS3-style ServerQuery telnet interface, not needed for the challenge |
| `SERVER_PASSWORD` | empty | password for connecting |
| `ADMIN_TOKEN`, `QUERY_PASSWORD` | see `server/config.json` | Server Admin privilege key / query login, keep them secret |
| `VOICE_DEBUG` | 0 | log every transcript and Marcel's replies |
| `VOICE_BOT` | 1 | `0` disables Marcel |
| `TS_CONFIG` | `server/config.json` | alternative config file |

## Intended path (spoilers)

| Step | Marcel | Answer | How players find it |
|---|---|---|---|
| 0 | — | join **Support**, hold **Ctrl**, talk | welcome message and Support description say admins only listen on voice; Marcel walks over and greets |
| 1 | "Who recruited you?" | Tobi | `Tobi^`'s description: "WG recruiter – poke me if you want to join" |
| 2 | "What's our battle cry? It's written on the server, if you know where to look." | rush b | a decorative spacer channel at the bottom of the tree, `▪▬▪ ▪▪▬ ▪▪▪ ▪▪▪▪  ▬▪▪▪`, is Morse code; Marcel hints "not everything there is decoration", Kevin's chatter mentions the odd spacer |
| 3 | "What's our motto? Every member knows it, it's in the rules." | no lag, no mercy | the Lobby rules end with white-on-white BBCode text (`[color=#ffffff]`); select the description text or highlight it to read it. Marcel: "even the parts you can't see", Tobi: "read ALL of it" |
| 4 | "I spell a word in our alphabet, say it back: sierra, oscar, delta, alpha" | the word (random per session, e.g. soda) | pure listening: decode the NATO alphabet. "repeat" re-spells it; a wrong answer re-spells it too |
| 5 | "What's the staff code?" | 4471 | poke or message Tobi: Marcel "hides it in his own unique ID". Right-click Marcel > Copy Unique ID (or read it in his info frame): `c3RhZmYgY29kZSA9IDQ0NzEgOik=` looks like any TS3 UID but base64-decodes to `staff code = 4471 :)` |
| 6 | "First I make you a member. Check your pokes." | — | Marcel pokes a privilege key; redeem it via Permissions > Use Privilege Key. The Member icon appears next to the player's name and Marcel continues only when the server sees the group |
| 7 | "Come to the admin room. The password is our map plus the year we started." | `dust22010` | Counter-Strike: Source topic `de_dust2 24/7` + server info "Created: 14.03.2010" |
| 8 | (in the Admin Room) | — | Marcel spells the flag in the NATO alphabet; "repeat" works three times |

Guard rails: wrong answers, insults and nonsense raise an annoyance counter (warning at 3, channel
kick at 5 or after 3 wrong answers to one question, then Marcel ignores the player for 60 s).
Verified answers survive a kick. One utterance per 1.5 s, duplicates count as nonsense, wrong channel
passwords are limited to 10/min. Chat or pokes to Marcel get a "use voice" reply. Conversations are
private (Marcel whispers), so several players can be in Support at once.

## How it works

```
Chrome/Edge: hold Ctrl -> SpeechRecognition -> {t:'voicetext', text, alts}   -> server/voice/bot.js
                                                                                  sessions, presence, kicks
                                                                                  engine.js step() (pure)
          <- {t:'voice', clips:[{id,dur}]} <- clip ids from server/voice/manifest.json
          plays public/voice/<id>.ogg, Marcel's sphere turns purple (whisper) while it plays
```

* `server/voice/script.json` — Marcel's script: states (with `enter` actions such as spelling a word or
  handing out the member key), answers (static, or `session`-dynamic like the spelled word), global
  intents, synonyms for STT variants ("rush bee", "toby"), confusions, and every line he can say.
* `server/voice/match.js` — normalisation, number words to digits ("four four seven one" → 4471),
  token Levenshtein, phrase matching. `engine.js` — the pure dialogue step. `bot.js` — runtime.
* `public/js/voice.js` — push-to-talk, continuous mode, recognition error handling, clip playback.
* `public/js/sounds.js` — the client's notification sound pack ("Default Sound Pack (Female)"): "Connected to
  server", "User joined your channel", "User left your channel", "User in your channel was kicked from the
  server", "You were banned from the server", "You were poked", "Microphone muted", mic clicks on push-to-talk,
  a whisper beep before Marcel speaks, and so on. Event names follow the wav files of the original client's
  `sound/default` folder; Options > Notifications has the pack selector, volume, per-event switches and a
  Play button. The clips live in `public/sounds/` (about 300 KB, Piper `en_US-amy-medium`).
* Clip files are named by hash and the id→text manifest is not served, so the audio folder leaks nothing.

## Changing Marcel

Edit `server/voice/script.json` (lines, answers, synonyms) and `server/config.json` (channels, bots,
descriptions, the Morse spacer, Tobi's replies, Marcel's `uid`). New or changed lines need rendering:

```
python3.12 -m venv .venv && .venv/bin/pip install piper-tts    # once; also needs ffmpeg with libspeex/libopus
npm run build:voice -- --prune                                  # renders changed lines, deletes unreferenced clips
npm run build:sounds                                            # notification sound pack (public/sounds/), only if you change tools/build_sounds.py
```

Rendering is incremental (clip id = sha1 of voice + codec + text) and runs on the author's machine; the
container has no TTS, so commit `public/voice/` and `server/voice/manifest.json`. The voice is Piper
`en_GB-alan-medium`, downsampled to 8 kHz and passed through a real Speex narrowband encode/decode at
quality 3 to sound like a 2010 TS3 server; `--codec speex-wb|speex-ugly|clean` changes that.
Options > Playback > "Play test sound" plays a clip in the client.

Play-test with `VOICE_DEBUG=1` and add any recognition variants you see to `synonyms` / `confusions`.

## Testing

```
npm test                                                      # engine + matcher against STT-style inputs
npm start & FLAG='RCC{test}' npm run solve -- ws://localhost:8080/ws
docker exec <container> node tools/solve.js ws://127.0.0.1:8080/ws   # same, inside the image (instancer probe)
```

The solver plays the whole path as text (decodes the Morse spacer, the hidden motto, the spelled word,
the base64 UID and redeems the member key itself), checks the spelled flag, the repeat, and the kick
path. No browser is needed.

## Repository layout

```
server/index.js       HTTP + WebSocket server
server/state.js       virtual server: channels, clients, groups, bots, permissions
server/query.js       optional ServerQuery telnet look-alike (QUERY_PORT)
server/config.json    server name, channels, bots, groups, privilege keys
server/voice/         Marcel: script.json, match.js, engine.js, bot.js, manifest.json
public/               client: index.html (SVG icons), css/ts3.css, js/app.js, js/voice.js, js/sounds.js, voice/*.ogg, sounds/*.ogg
tools/build_voice.py  Piper + ffmpeg clip renderer (Marcel)
tools/build_sounds.py Piper + ffmpeg renderer for the notification sound pack
tools/solve.js        solver / health probe
test/engine.test.js   node:test suite
```

The base client also supports: right-click menus, drag & drop between channels, BBCode chat, private
tabs, pokes, privilege keys, kicks and IP bans with a ban list (admins), channel/server editing for admins,
bookmarks, options, notification sounds, and the usual dialogs. The WebSocket protocol is plain JSON; see `handle()` in `public/js/app.js` and the `switch`
in `server/index.js`.

## Notes

Icons are hand-drawn SVG approximations of the TS3 icon pack. TeamSpeak is a trademark of
TeamSpeak Systems GmbH; this is a look-alike built for a private CTF.
