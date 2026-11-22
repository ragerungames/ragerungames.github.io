"""Builds the four legal pages of the Vertical Shorts Editor page from the reviewed drafts.

Run AFTER the drafts in  D:\\RageRun Games\\Tools\\RageRun Shorts Editor\\Store\\  (03 EULA.md, 04 Refund policy.md,
05 Privacy policy.md, 06 Terms of sale.md) have your name, city and date filled in and your reviewer's changes:

    py -3 make_legal_pages.py "D:\\RageRun Games\\Tools\\RageRun Shorts Editor\\Store"

It writes eula/, refunds/, privacy/ and terms/ next to this file. It stops if a [placeholder] is still in a draft.
The DRAFT line and the *italic reviewer notes* are left out. Delete this script from the website folder if you like;
it does nothing on the live site.
"""
import html, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
PAGES = [("03 EULA.md", "eula", "Licence (EULA)"), ("04 Refund policy.md", "refunds", "Refund policy"),
         ("05 Privacy policy.md", "privacy", "Privacy policy"), ("06 Terms of sale.md", "terms", "Terms of sale")]


def inline(t):
    t = html.escape(t, quote=False)
    t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
    t = re.sub(r"\[([^\]]+)\]\((https?://[^)]+)\)", r'<a href="\2">\1</a>', t)
    t = re.sub(r"(?<![\"'>])(https?://[^\s<]+)", r'<a href="\1">\1</a>', t)
    return t


def convert(md):
    out, in_list = [], False
    for line in md.splitlines():
        s = line.strip()
        if s.startswith(">") or not s:
            if in_list:
                out.append("</ul>"); in_list = False
            continue
        s = re.sub(r"\s*\*\[[^\]]*\]\*", "", s)          # *[decide: ...]* notes
        if re.fullmatch(r"\*[^*].*\*", s):               # whole-line reviewer note
            continue
        s = re.sub(r"(?<!\*)\*(?!\*)[^*]+(?<!\*)\*(?!\*)", "", s).strip()   # inline *notes*
        if not s:
            continue
        if s.startswith("# "):
            continue
        if s.startswith("## "):
            if in_list:
                out.append("</ul>"); in_list = False
            out.append("<h2>%s</h2>" % inline(s[3:])); continue
        if s.startswith("- "):
            if not in_list:
                out.append("<ul>"); in_list = True
            out.append("<li>%s</li>" % inline(s[2:])); continue
        if in_list:
            out.append("</ul>"); in_list = False
        out.append("<p>%s</p>" % inline(s))
    if in_list:
        out.append("</ul>")
    return "\n".join(out)


TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} – Vertical Shorts Editor | RageRun Games</title>
<meta name="robots" content="noindex">
<link rel="icon" href="../../favicon.ico" sizes="any">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Nunito:wght@500;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../assets/site.css">
<style>.theme-hub main {{ max-width: 820px; margin: 0 auto; padding: 40px 20px 70px; }} .theme-hub main a {{ color: var(--accent); }} .theme-hub h1 {{ font-family: var(--head); }}</style>
</head>
<body class="theme-hub">
<header class="bar"><div class="wrap"><a class="brand" href="../../index.html"><b>RR</b>RageRun Games</a>
<nav><a href="../">Vertical Shorts Editor</a></nav></div></header>
<main>
<h1>{title}</h1>
{body}
<p><a href="../">&larr; Back to Vertical Shorts Editor</a></p>
<h2>Support</h2>
<p>support@ragerungames.com and <a href="https://discord.gg/kj8D8kwttZ">https://discord.gg/kj8D8kwttZ</a></p>
</main>
</body>
</html>
"""


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "..", "Store")
    problems = []
    pages = []
    for fn, slug, title in PAGES:
        md = open(os.path.join(src, fn), encoding="utf-8").read()
        body = convert(md)
        left = re.findall(r"\[(Your full legal name|city|date|[^\]]{0,40})\]", body)
        if left:
            problems.append("%s still has [%s]" % (fn, "], [".join(sorted(set(left)))))
        pages.append((slug, TEMPLATE.format(title=title, body=body)))
    if problems:
        print("Not written. Fill these in first:\n  " + "\n  ".join(problems))
        sys.exit(1)
    for slug, page in pages:
        os.makedirs(os.path.join(HERE, slug), exist_ok=True)
        with open(os.path.join(HERE, slug, "index.html"), "w", encoding="utf-8") as f:
            f.write(page)
        print("wrote", slug + "/index.html")


if __name__ == "__main__":
    main()
