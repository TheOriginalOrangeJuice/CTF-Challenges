import os
from flask import Flask, render_template, abort

app = Flask(__name__)
FLAG = os.environ.get("FLAG", "CTF{w0_x1_hu4n_q1_z1_n1_h40}")


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/about")
def about():
    return render_template("about.html")


@app.route("/guestbook")
def guestbook():
    return render_template("guestbook.html")


@app.route("/robots.txt")
def robots():
    return (
        "User-agent: *\nDisallow: /admin\nDisallow: /flag\n",
        200,
        {"Content-Type": "text/plain"},
    )


@app.route("/admin")
@app.route("/flag")
def red_herring():
    return render_template("nope.html"), 403


# Chinese words for "flag" (Simplified + Traditional where they differ)
FLAG_WORDS = [
    "旗",            # qí - flag
    "旗子",          # qízi - flag (colloquial)
    "旗帜", "旗幟",  # qízhì - flag / banner
    "国旗", "國旗",  # guóqí - national flag
    "小旗",          # xiǎoqí - small flag
    "彩旗",          # cǎiqí - colored flag / bunting
    "旗标", "旗標",  # qíbiāo - flag (computing)
    "标志", "標誌",  # biāozhì - flag / marker (e.g. 标志位, flag bit)
]


def qi():
    return render_template("flag.html", flag=FLAG)


for word in FLAG_WORDS:
    app.add_url_rule(f"/{word}", endpoint=f"flag_{word}", view_func=qi)


@app.errorhandler(404)
def not_found(_):
    return render_template("404.html"), 404


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)
