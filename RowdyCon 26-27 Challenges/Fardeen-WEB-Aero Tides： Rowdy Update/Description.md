# Aero Tides: Rowdy Ascension

**Web**

## Description

My feed is full of people showing off Legendary Dolphin Rowdy. Meanwhile, I'm sitting on 40 Aero Gems and a collection full of question marks. I've been watching some YouTube tutorials on how to hack games with databases but can't understand them. I know you got me. Get me that Dolphin Rowdy!!!

## Files

Docker Compose: one game container and one private PostgreSQL container in [challenge/](challenge/). From this folder:

```sh
cd challenge
cp .env.example .env
```

Set `POSTGRES_PASSWORD`, `VULN_DB_PASSWORD`, and `SESSION_SECRET` in `.env`. Keep the supplied flag, seed, and flag-prefix values. Then start the stack:

```sh
docker compose -p gatcha-review up --build -d
```

Open `http://localhost:18112`. Give players only the event URL and these credentials: **TheOriginalAppleJuice** / **ShoutoutJohnCena@123!**. Keep the source, containers, organizer files, and these submission documents private. Maintenance: [organizer/OPERATIONS.md](organizer/OPERATIONS.md).

## Hint(s)

None.

## Walkthrough

The intended solve restores the player's wallet through a stored-input trust-boundary flaw, then uses genuine summons to obtain Dolphin Rowdy's message. The outline below covers the reasoning and normal game controls; it does not reproduce the injection procedure.

1. Select **Enter Event** and sign in with the supplied account. The Summon screen shows **40** gems; one pull costs **100**.

![The starting account cannot afford a summon](screenshots/03-summon-1366.png)

2. Open **Player Card**. Saving and synchronization are separate actions. The flaw occurs when synchronization treats stored motto text as database instructions. The intended result is a funded wallet.

![The ordinary Player Card editor](screenshots/05-player-card-1366.png)

3. Return to **Summon** and select **Roll ×1**. Each pull costs **100 gems**. Legendary odds start at **0.67%**; each nonlegendary adds **one percentage point** (**1.67%, 2.67%, …**), capped at **100%**. A legendary resets the chance to **0.67%**. Pity persists between visits.

4. When **Legendary Dolphin Rowdy** appears, read its message. Select **Copy Message**, or reopen the message in **History**.

## Flag

`RCC{g0ld3n_t1d3_d0lph1n_r0wdy}`
