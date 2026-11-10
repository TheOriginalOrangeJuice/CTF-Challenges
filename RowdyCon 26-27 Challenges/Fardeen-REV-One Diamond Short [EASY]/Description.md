# One Diamond Short

**Category:** Rev | **Difficulty:** Easy

## Description

I've been stuck playing the 15-minute Minecraft demo every day when I get home from school. I. AM. SICK. OF. IT. Today, they released an announcement where if you can get 10 diamonds in 15 minutes, they'll give you a free Minecraft code. I NEED THAT CODE! Give it to me. 

## Files

Player download: [artifacts/OneDiamondShort.zip](artifacts/OneDiamondShort.zip). Extract all files into a writable folder and run `OneDiamondShort.exe` on 64-bit Windows. Play is offline; controls are in `README.txt`.

Organizer rebuild: follow the [operations instructions](organizer/OPERATIONS.md) with the [pinned dependencies](organizer/toolchain.lock.json). This document and `organizer/` contain spoilers and are excluded from the player archive.

## Hint(s)

1. The game must keep track of the items you are carrying while it runs.
2. Only nine diamonds exist in the world. What controls the quantity shown in your inventory?
3. A memory editor can change the demo's inventory. You need exactly ten carried diamonds before time expires.

## Walkthrough

1. Extract the archive, launch `OneDiamondShort.exe`, and choose **Play Demo**. The fifteen-minute countdown appears in the clouds and continues while the game is paused.

2. Enter the nearby cave, mine exposed diamond ore with the starting iron pickaxe, and collect a diamond. Press **E** to inspect the inventory. There are only nine diamonds in the world, so ordinary collection cannot reach the advertised goal.

![One naturally mined diamond in the current demo's inventory](screenshots/inventory-final.png)

3. Use a memory editor to change the running demo's carried-diamond quantity to exactly ten. Finding all nine diamonds first is optional.

4. Keep the total at exactly ten before time expires. Diamonds in the backpack, hotbar, cursor, and crafting inputs count as carried; diamonds in storage, on the ground, or in an unclaimed crafting result do not.

5. The demo detects the winning inventory, ends gameplay, and shows a sixteen-character purchase code. It also writes the code and its `RCC{...}` flag into `README.txt` beside the executable. If saving fails, the result screen retains the earned code and offers **Retry Save**.

![Completed-demo reward screen from an earlier build](screenshots/trial-result-g.png)

*Reward screen from an earlier build; the current release shows its countdown only in the clouds.*

6. Choose **Open README** and submit the complete, case-sensitive flag below.

## Flag

`RCC{M7N3C4F8Q2D6R9K5}`
