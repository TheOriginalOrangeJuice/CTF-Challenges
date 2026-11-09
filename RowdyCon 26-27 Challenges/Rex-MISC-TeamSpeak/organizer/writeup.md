# My First Gaming Clan — writeup

The target is a browser clone of a 2010-era TeamSpeak 3 server. The flag is held by a scripted bot,
**[Admin] Marcel**, who only talks on voice (your browser's speech recognition turns what you say into
text) and only ever *speaks* the flag. Every answer he wants is hidden somewhere in the client.

Requirements: Chrome or Edge, microphone, hold **Ctrl** to talk (Options > Capture).

## 0. Find Marcel

The welcome message says admins hang out in **Support** and don't read chat. The Support channel's
description repeats it: use your microphone. Join Support; after a few seconds Marcel walks in from the
Admin Room and whispers "Yo, who's that? You need something?" (his sphere turns purple while he talks).

Ask for the key: *"Can I have the admin key?"* → *"Nice try. Only clan members get that. Who recruited you?"*

## 1. Who recruited you? → Tobi

Click through the clients in the tree. `Tobi^` (Operator in *Ranked 5v5*) has the description
**"WG recruiter – poke me if you want to join Wasted Gaming"**.

Say: *"Tobi recruited me."*

## 2. The battle cry → RUSH B

Marcel: *"What's our battle cry? It's written on the server, if you know where to look."*
(His hint if you stall: *"Not everything on the server tree is decoration."* Kevin also wonders in
chat who made "that weird dot dash spacer".)

The decorative spacer channels use `▬` bars, except one near the bottom:

```
▪▬▪   ▪▪▬   ▪▪▪   ▪▪▪▪      ▬▪▪▪
 R     U     S     H         B
```

Morse code with `▪` as dot and `▬` as dash. Say: *"Rush B."*

## 3. The motto → no lag, no mercy

Marcel: *"What's our motto? Every member knows it, it's in the rules."*

The rules are the **Lobby** channel description (click the channel). They end with a line you cannot
see because it is white text on the white info frame, written as `[color=#ffffff]...[/color]` BBCode.
Select the description text (drag or Ctrl+A in the info frame) and it appears:

> Clan motto (members only): no lag, no mercy

Say: *"No lag, no mercy."*

## 4. The listening test → say the spelled word back

Marcel: *"I spell a word in our alphabet, say it back to me: sierra, oscar, delta, alpha."*

NATO alphabet; the word is random per session (soda, gold, ruby, nova, ...). Say the word. *"Repeat"*
makes him spell it again, and so does a wrong answer. This is the warm-up for how the flag is delivered.

## 5. The staff code → 4471

Marcel: *"Last one, and this one only staff knows: what's the staff code?"* If you ask for help:
*"I keep it somewhere safe, in my identity. Ask your recruiter."*

Poke or private-message **Tobi**. He replies that Marcel is paranoid and "hides it in his own unique ID,
copy it and look at it closely". Right-click Marcel > *Copy Unique ID* (it is also shown at the bottom of
his info frame):

```
c3RhZmYgY29kZSA9IDQ0NzEgOik=
```

It has the shape of a real TS3 UID (28 base64 characters, 20 bytes), but:

```
$ echo c3RhZmYgY29kZSA9IDQ0NzEgOik= | base64 -d
staff code = 4471 :)
```

Say: *"The staff code is 4471."*

## 6. Become a member → use the privilege key

Marcel: *"Correct. First I make you a member. Check your pokes."* A poke arrives:

> member key: WGmember-… (Permissions > Use Privilege Key)

Open **Permissions > Use Privilege Key**, paste the token. The Member icon appears next to your name and
Marcel reacts: *"Now you're a member. But I don't say the key in public. Come to the admin room. The
password is our map plus the year we started."*

## 7. The Admin Room password → dust22010

* "our map": the *Counter-Strike: Source* channel topic is `de_dust2 24/7` → **dust2**
* "the year we started": click the server name, the info frame says *Created: 14.03.2010* → **2010**

Double-click **Admin Room**, enter `dust22010`.

## 8. The flag

Marcel follows you in: *"Okay. Now we're alone. Listen carefully, I say it once."* He then spells the
flag in the NATO alphabet: *capital romeo, capital charlie, capital charlie, open curly bracket, …* with *capital* before
uppercase letters, *underscore*, *dash*, digits as words, *close curly bracket*. Write it down.
*"Repeat"* works three times, then he refuses.

```
RCC{m0m_1m_1n_4_cl4n_n0w}            (default baked into the image; the FLAG environment variable overrides it)
```

## Notes for the curious

* Marcel is not an LLM. He is a state machine with fuzzy matching (synonyms, Levenshtein, number
  words), so "rush bee", "no leg no mercy" or "four four seven one" all work. Insults, nonsense and
  wrong answers raise an annoyance counter; five strikes and he kicks you from the channel and ignores
  you for a minute. Progress survives the kick.
* Speech recognition happens in the browser; the server only receives text over the WebSocket. Sending
  the text yourself works too, but the flag is still only delivered as audio clip ids that you have to
  listen to (or map by hand, which is more work than listening).
* The voice is Piper TTS run through a real Speex narrowband encoder at quality 3, because that is what
  TeamSpeak sounded like in 2010.
