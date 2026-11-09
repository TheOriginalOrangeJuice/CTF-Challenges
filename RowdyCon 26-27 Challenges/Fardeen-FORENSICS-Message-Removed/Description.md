# Message Removed

Forensics / Upper Medium

## Description

The old Skype group chat is getting active again. We were planning a reunion but someone always has to bring up the past :/. Streets are claiming that Max rage-quit but Max keeps saying it was his internet. I don't remember it like that, I just wish I had the receipts to prove it. Ravi and Jess claim they do but I'm not sure how to recover them. Can you help me out?  

## Files

Deploy the static Skype client from `challenge/`. From this challenge folder:

```sh
docker build -t message-removed ./challenge
docker run -d --name message-removed \
  --restart unless-stopped --read-only \
  --cap-drop ALL --security-opt no-new-privileges \
  -p 18111:18111 message-removed
```

Open `http://localhost:18111`. Stop it with `docker stop message-removed`.

Publish only the Description narrative in CTFd. Distribute [skype-backups.zip](challenge/public/evidence/skype-backups.zip), also available as Jess’s file transfer in the group chat. It contains only `Jess-laptop/` and `Ravi-netbook/`. Each folder includes a Skype `main.db` and `Downloads/receipts.zip`. A compatible AES ZIP tool, such as 7-Zip, is needed to open the receipt archive.

Keep these submission documents, `organizer/`, and `screenshots/` private. The container copies only the server and its explicit public assets. [Organizer operations](organizer/OPERATIONS.md) covers regeneration, frozen sounds, and maintenance.

## Hint(s)

None

## Walkthrough

The two laptop backups remember different parts of the same deleted message. Find the file Max shared, match the conversation between the laptops, and recover the overlapping pieces of its original password. That password opens a picture containing Max’s contradiction and the flag. Chatting and calling are optional atmosphere.

1. In the group chat, choose **Save file** on Jess’s `skype-backups.zip` transfer. Extract it. Keep the two laptop folders separate: their local message IDs are different.

![Jess’s file transfer in the group chat](screenshots/01-reunion-1366.png)

2. Open `Jess-laptop/Skype/jess.flower/main.db` in DB Browser for SQLite, then open `Ravi-netbook/Skype/ravi.exe/main.db` separately. The website has no backup-history viewer. In **Browse Data**, inspect `Messages` and `Transfers`. Both laptops recorded Max’s `receipts.zip` transfer; its file is in each laptop’s `Downloads` folder.

3. In **Execute SQL**, run these queries against each database. `chatmsg_guid` associates the transfer with its message; GUIDs and account handles establish correspondence between profiles. Local numeric IDs do not. Jess’s current password message is edited; the matching row in Ravi’s database has an empty body.

```sql
SELECT filename, partner_handle, hex(chatmsg_guid)
FROM Transfers;

SELECT id, hex(guid), author, timestamp,
       edited_timestamp, body_xml
FROM Messages
WHERE author = 'max.power.97';
```

The disputed password message has GUID `c42db5a60e894f779ead1ff0671b9413` and original timestamp `1370985262` (21:14:22 UTC). Its current IDs are 1090 and 8090. Jess’s edit is at 21:16:22; Ravi’s removal is at 21:16:51. The visible edited password is a later version.

4. Open both databases in a hex editor. A SQL query shows current rows; a hex editor also shows bytes left behind after deletion. In Jess’s file, search for `receipts.zip password:` and inspect the older occurrence on page 2. Set the editor’s offset display to decimal. The surviving SQLite cell starts at offset 4777. Its old row ID is 417, and its record still identifies the same GUID, author, conversation, and original timestamp.

5. Decode the record header using SQLite’s documented serial types. For the nine columns in `Messages`, the older cell has types `0, 44, 83, 4, 37, 6675, 8, 1, 1`. Type **8** in the `edited_timestamp` position means integer zero, establishing that this remnant belongs to the unedited message. Its body starts at offset 4859. These structures are described in the [SQLite file format](https://www.sqlite.org/fileformat2.html#record_format).

6. Jess’s surviving password prefix begins at offset 4882. Ravi’s matching suffix begins at offset 4894 and ends immediately before a newline and `<quote>`. Align their shared eight characters and include that overlap only once:

```text
Jess: H7vQ3mZ8rT2xK6pN9sW4
Ravi:             K6pN9sW4cF5jL1dB0yUa
Full: H7vQ3mZ8rT2xK6pN9sW4cF5jL1dB0yUa
```

The [reference recovery script](organizer/solve.py) joins transfer records, matches message GUIDs, decodes surviving cell headers, and merges overlapping fragments from different profiles. Run `python organizer/solve.py skype-backups.zip --out recovered` after installing `pyzipper==0.3.6`.

7. Open `Jess-laptop/Downloads/receipts.zip` with 7-Zip and enter the reconstructed password. Ravi’s copy is identical. Alternatively, run the command below and paste the password at the prompt. Open `receipts.png` in an image viewer; the client’s ordinary **Open a picture** control can also display it.

```sh
7z x Jess-laptop/Downloads/receipts.zip -orecovered
```

![The recovered receipt opened in the Skype picture viewer](screenshots/05-recovered-receipt.png)

8. Read the flag at the bottom of the receipt and submit it to the CTF platform.

## Flag

`RCC{skype_kept_the_receipts_74a9c2e6}`
