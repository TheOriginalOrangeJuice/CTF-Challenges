# Follow Me for a Cookie

**Category:** Web | **Difficulty:** Easy

## Description

I was scrolling Twitter and Mr. FlagBeast just said he would give me a flag if I gave him some crypto... unfortunately, I don't have much. There must be a way to get into his account and grab the flag myself. 

## Files

One hosted Docker container, built from [challenge/](challenge/). From this challenge folder:

```bash
docker build -t rowdy09-cookie ./challenge
docker run -d --name rowdy09-cookie -p 18109:18109 rowdy09-cookie
```


## Hint(s)

1. The person demanding donations appears in someone else's public leak.
2. Inspect what your browser sends to remain signed in. Does the leaked list contain the same kind of value?
3. Replace your challenge session cookie with the row for `@FlagBeast`, reload, and open Drafts.

## Walkthrough

1. Open `http://localhost:18109` and find @FlagBeast's post demanding **67K** for the stolen flag. This identifies the account to investigate.

![AeroTwitter timeline and FlagBeast's donation demand.](screenshots/01-timeline-flagbeast-boast.png)

2. Click **Sign up**. Choose an unused handle of at most 15 characters, a display name, and a password of at least six characters. Signing up signs you in automatically.

3. Press **F12**. In Chrome or Edge, open **Application → Storage → Cookies** and select the challenge's origin. Find `aero_session`, the cookie that lets the server recognize your signed-in account. Leave its name, domain, and `/` path unchanged.

4. On the timeline, find @AnonymousArchive's **SESSION LEAK** post. Read the explicitly labeled `FlagBeast` row and copy its cookie value:

```text
Username: FlagBeast
Cookie Name: aero_session
Cookie Value: aero_sess_flagbeast_2026_stolen_flag
```

![AnonymousArchive's public post associates FlagBeast with the leaked cookie.](screenshots/02-leak-post.png)

5. In the cookie table, double-click the **Value** cell for `aero_session`, replace the entire value with `aero_sess_flagbeast_2026_stolen_flag`, and press **Enter**. Edit the cookie in the browser's storage tools: its `HttpOnly` setting prevents page JavaScript from reading or replacing it.

6. Reload the page. The account menu now shows **@FlagBeast**. The server accepts the leaked token as an existing authenticated session, so no password is needed.

7. Click **Drafts** in the top navigation. Read the unpublished message containing `RCC{aero_session_hijack_1n_th3_w1ld}`. The draft is private to the server-authenticated account; reading it completes the challenge.



## Flag

`RCC{aero_session_hijack_1n_th3_w1ld}`
