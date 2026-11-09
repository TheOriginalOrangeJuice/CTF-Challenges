# AquaWorld Deluxe

Misc / Easy · Organizer submission; only Description is player-facing.

## Description

A friend dug up an old OceanSpark Games bookmark, and somehow Bloop is still there, smiling through the bubbles. Coral Cove has seen better days. Let me bring the creatures back into the pool and hopefully they provide me with an award :) 

## Files

Deploy the application in [challenge/](challenge/) as one Docker container. Players receive the website only; this document, the original design handoff, and [organizer/](organizer/) stay private.

From this challenge folder:

```bash
cd challenge
docker compose --env-file ../organizer/event.env up --build -d
```

Open `http://localhost:18101`. The named volume preserves aquarium progress. For an event hostname, set `PUBLIC_ORIGIN` to its exact origin and `COOKIE_SECURE=true` behind HTTPS in the private environment file. The event flag is fixed in that file. See [organizer operations](organizer/OPERATIONS.md) for backup, reset, tests, and shutdown.

## Hint(s)

None.

## Walkthrough

1. Open the aquarium and select **Play with Sound**. It starts at stage 0. Select a library story to load it into the editor. Selecting another asks before replacing the current text. Music, effects, and Bloop’s voice can be adjusted in Sound settings.

![The starting aquarium and storybook](screenshots/01-empty-aquarium.png)

2. Read the four stories. They all contain several ordinary words, including `blue`, `fish`, `glass`, `light`, `music`, `ribbon`, `shell`, `silver`, `star`, and `water`. No single shared word identifies the answer by itself.

3. Submit a short test story such as `Today I wrote a cheerful account of an ordinary afternoon. blue`. The aquarium does not grow. Submit the same sentence ending in `fish` instead: the aquarium advances one stage. These controlled tests identify the useful word.

4. Submit distinct stories containing repeated standalone occurrences of `fish`. Each occurrence grows the aquarium by one stage, up to twenty per submission. Capitalization does not matter; words such as `selfish` do not count. Each official sample can be submitted only once, including copies with different capitalization, spacing, or punctuation.

5. This story supplies twenty occurrences. Submit it, then change `one` to `two`, `three`, `four`, and `five` for subsequent submissions. Changing the opening makes each story distinct. Any stages already earned simply bring completion sooner.

```text
On day one, my notebook contained this peculiar list:
fish fish fish fish fish
fish fish fish fish fish
fish fish fish fish fish
fish fish fish fish fish
```

![The aquarium halfway through its growth](screenshots/03-growing-reef.png)

6. At stage 100, the chest opens and the server returns the reward. Select **Copy treasure**. Closing the window leaves the aquarium available; **Open your treasure** reopens it after a reload.

![The completed aquarium and its actual reward](screenshots/04-treasure-unlocked.png)

The optional [reference solver](organizer/solve.py) performs the same public-story comparison, tests candidates through the website, and submits distinct stories after observing a positive response:

```bash
python organizer/solve.py http://localhost:18101
```

## Flag

`RCC{a_little_fish_makes_a_big_splash}`
