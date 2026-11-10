# Dan's Corner of the Interwebz (web, easy)

**Description for players:** Dan's blog hasn't been updated since 2013. He says he's in
"a very Chinese point in his life." Can you find his flag?

## Run
    docker compose up --build -d     # http://localhost:8080
Change the flag with the `FLAG` env var in docker-compose.yml.

## Solution (organizers only)
Visit the Chinese word for "flag" as a path. Any of these work:
旗, 旗子, 旗帜/旗幟, 国旗/國旗, 小旗, 彩旗, 旗标/旗標, 标志/標誌
(e.g. `/旗` = `/%E6%97%97`). The list is `FLAG_WORDS` in app.py.
`/admin` (listed in robots.txt) is a red herring that returns 403.
