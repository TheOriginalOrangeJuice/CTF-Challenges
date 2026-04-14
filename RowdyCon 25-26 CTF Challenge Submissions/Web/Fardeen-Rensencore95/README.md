# Rensencore 95

> **Category**: Web Exploitation  
> **Difficulty**: Very Hard

## Description

Someone at RowdyCon thought it would be funny to ship a Windows 95 themed recovery desktop that behaves like a browser-based Rensenware clone.

Your files are encrypted. The desktop says the recovery password is released if you somehow cross **67,000,000** points in the Touhou practice game, or if you can make the old recovery daemon believe you did.

The practice game can submit a legitimate clear replay, but the score gain has been nerfed into the floor. Grinding it out is technically possible and clearly miserable.

There is one small mercy: the machine still includes an ancient route scripting utility called `ROUTE95.EXE`.

## Hints

1. The target score looks ugly. Watch how the score actually changes.
2. `ROUTE95.EXE` is more than a replay uploader. Read the helper text carefully.
3. If a function is exposed to an expression engine, what else does that object usually expose?

## Challenge Layout

- `challenge/`: Flask application, assets, Dockerfile, helper scripts, and secrets used to build the challenge.
- `challenge/tools/exploit.py`: local proof-of-concept exploit for validation.
- `vendor-toho-like-js/`: pulled source baseline used for Touhou-inspired art and audio assets.

## Run Locally

```bash
cd challenge
python3 -m pip install --user --break-system-packages -r requirements.txt
python3 tools/generate_blob.py
python3 app.py
```

Then browse to `http://127.0.0.1:8000`.

## Docker

```bash
cd challenge
docker build -t rensencore95 .
docker run --rm -p 8000:8000 rensencore95
```

## Attribution

The practice game uses selected Touhou-inspired assets and audio pulled from `takahirox/toho-like-js` as the visual/audio baseline and then wrapped in the custom Win95 challenge shell.
