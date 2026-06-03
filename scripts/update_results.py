#!/usr/bin/env python3
"""Baixa e normaliza resultados historicos da Lotofacil publicados pelo Lotorama."""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

BASE_URL = "https://lotorama.com.br/lotofacil/todos-os-resultados/"
USER_AGENT = "Mozilla/5.0 (compatible; GeradorLotoFacil/1.0)"
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "lotofacil.json"


def fetch(url: str) -> str:
    request = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(request, timeout=30) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(charset, errors="replace")


def clean_text(raw_html: str) -> str:
    text = re.sub(r"<script\b.*?</script>", " ", raw_html, flags=re.I | re.S)
    text = re.sub(r"<style\b.*?</style>", " ", text, flags=re.I | re.S)
    text = re.sub(r"<[^>]+>", "\n", text)
    text = html.unescape(text)
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    text = re.sub(r"\n\s+", "\n", text)
    return text


def extract_total_pages(raw_html: str) -> int:
    raw_match = re.search(r"P(?:á|&aacute;)gina\s+\d+\s+de\s+(\d+)", raw_html, flags=re.I)
    if raw_match:
        return int(raw_match.group(1))

    text = clean_text(raw_html)
    matches = [int(value) for value in re.findall(r"Pagina\s+\d+\s+de\s+(\d+)|Página\s+\d+\s+de\s+(\d+)", text) for value in value if value]
    if matches:
        return max(matches)

    page_links = [int(value) for value in re.findall(r"/page/(\d+)/|[?&]paged=(\d+)", raw_html) for value in value if value]
    return max(page_links, default=1)


def parse_page(raw_html: str) -> list[dict]:
    contests: list[dict] = []
    card_pattern = re.compile(
        r'<div class="resultado-card">(.*?)(?=<div class="resultado-card">|<div class="pagination|<footer|$)',
        flags=re.I | re.S,
    )

    for card_match in card_pattern.finditer(raw_html):
        card = card_match.group(1)
        text = clean_text(card)
        match = re.search(r"Concurso\s+(\d+)\s+-\s+(.+?)\s+(\d{2}/\d{2}/\d{4})", text)
        if not match:
            continue

        numbers = sorted(
            int(value)
            for value in re.findall(r"result-number[^>]*>\s*(\d{1,2})\s*<", card)
            if 1 <= int(value) <= 25
        )
        if len(numbers) != 15 or len(set(numbers)) != 15:
            continue

        contests.append(
            {
                "contest": int(match.group(1)),
                "weekday": match.group(2).strip(),
                "date": match.group(3),
                "numbers": numbers,
            }
        )

    return contests


def page_url(page: int) -> str:
    if page <= 1:
        return BASE_URL
    return f"{BASE_URL}?paged={page}"


def dedupe(contests: Iterable[dict]) -> list[dict]:
    by_contest = {item["contest"]: item for item in contests}
    return [by_contest[key] for key in sorted(by_contest, reverse=True)]


def update(max_pages: int | None = None) -> dict:
    first_html = fetch(BASE_URL)
    total_pages = extract_total_pages(first_html)
    if max_pages:
        total_pages = min(total_pages, max_pages)

    all_contests = parse_page(first_html)
    for page in range(2, total_pages + 1):
        print(f"Baixando pagina {page}/{total_pages}...", file=sys.stderr)
        all_contests.extend(parse_page(fetch(page_url(page))))

    contests = dedupe(all_contests)
    if not contests:
        raise RuntimeError("Nenhum concurso foi encontrado. O layout do site pode ter mudado.")

    payload = {
        "source": BASE_URL,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "total_pages": total_pages,
        "total_contests": len(contests),
        "latest_contest": contests[0]["contest"],
        "oldest_contest": contests[-1]["contest"],
        "results": contests,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return payload


def main() -> int:
    parser = argparse.ArgumentParser(description="Atualiza data/lotofacil.json com resultados do Lotorama.")
    parser.add_argument("--max-pages", type=int, default=None, help="Limita paginas para testes rapidos.")
    args = parser.parse_args()

    try:
        payload = update(args.max_pages)
    except (HTTPError, URLError, TimeoutError, RuntimeError) as error:
        print(f"Erro ao atualizar resultados: {error}", file=sys.stderr)
        return 1

    print(
        f"OK: {payload['total_contests']} concursos salvos em {OUTPUT} "
        f"({payload['oldest_contest']} a {payload['latest_contest']})."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
