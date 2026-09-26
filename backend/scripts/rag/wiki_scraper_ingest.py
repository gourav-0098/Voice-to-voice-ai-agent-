"""
Robust Web & Wikipedia Scraper with Automatic Anti-Bot Bypass & Qdrant Ingestion.
Uses backend/data/url.json and stores in 'wiki_knowledge_chunks' collection.
"""

import os
import sys
import json
import re
import uuid
import warnings
from typing import List, Dict, Any

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

import requests
import urllib3
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
from sentence_transformers import SentenceTransformer

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
warnings.filterwarnings("ignore", category=UserWarning)

COLLECTION_NAME = "wiki_knowledge_chunks"
MODEL_NAME = "all-MiniLM-L6-v2"
VECTOR_DIM = 384
CHUNK_SIZE = 700
CHUNK_OVERLAP = 120

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,hi;q=0.8",
}


def load_credentials():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    env_path = os.path.join(script_dir, "../../.env")
    load_dotenv(dotenv_path=env_path)

    qdrant_url = os.getenv("QDRANT_URL") or os.getenv("cluster_endpoint")
    qdrant_api_key = os.getenv("QDRANT_API_KEY") or os.getenv("Qdrant_api")

    if not qdrant_url:
        print("[ERROR] QDRANT_URL is missing in .env.")
        sys.exit(1)

    return qdrant_url, qdrant_api_key


def load_urls() -> List[Dict[str, str]]:
    script_dir = os.path.dirname(os.path.abspath(__file__))
    file_path = os.path.join(script_dir, "../../data/url.json")

    if not os.path.exists(file_path):
        print(f"[ERROR] url.json not found at: {file_path}")
        sys.exit(1)

    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    normalized = []
    if isinstance(data, list):
        for item in data:
            if isinstance(item, str) and item.strip():
                normalized.append({"url": item.strip(), "title": "", "topic": "General"})
            elif isinstance(item, dict) and "url" in item:
                normalized.append({
                    "url": item["url"].strip(),
                    "title": item.get("title", "").strip(),
                    "topic": item.get("topic") or item.get("category", "General"),
                })
    return normalized


def clean_text(text: str) -> str:
    text = re.sub(r"\[\d+\]|\[citation needed\]|\[edit\]", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def scrape_direct(url: str, default_title: str = "", default_topic: str = "General") -> Dict[str, Any]:
    is_wikipedia = "wikipedia.org" in url.lower()
    response = requests.get(url, headers=HEADERS, timeout=12, verify=False)
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")

    title = default_title
    if not title:
        if is_wikipedia:
            h1 = soup.find("h1", {"id": "firstHeading"})
            title = h1.get_text().strip() if h1 else url.split("/")[-1].replace("_", " ")
        else:
            h1 = soup.find("h1")
            if h1 and len(h1.get_text().strip()) > 3:
                title = h1.get_text().strip()
            elif soup.title:
                title = soup.title.get_text().strip()
            else:
                title = url

    for tag in soup.find_all([
        "script", "style", "noscript", "iframe", "svg", "nav", "footer", "header",
        "aside", "form", "table", "sup", "div.navbox", "div.reflist", "div.hatnote",
        "div.printfooter", "div.sidebar", "div.widget", "div.ad", "div.advertisement"
    ]):
        tag.decompose()

    if is_wikipedia:
        content = soup.find("div", {"id": "mw-content-text"}) or soup.find("div", class_="mw-parser-output") or soup
    else:
        content = soup.find("article") or soup.find("main") or soup.find("div", class_="content") or soup.find("body") or soup

    sections = []
    current_section = "Overview"
    current_paragraphs = []

    for elem in content.find_all(["h2", "h3", "h4", "p", "li"]):
        tag_name = elem.name

        if tag_name in ["h2", "h3", "h4"]:
            heading_text = clean_text(elem.get_text())
            if not heading_text:
                continue

            if heading_text.lower() in [
                "references", "see also", "further reading", "external links",
                "notes", "footer", "navigation", "share this", "related articles"
            ]:
                current_section = None
                continue

            if current_paragraphs and current_section:
                combined = " ".join(current_paragraphs)
                if len(combined) >= 70:
                    sections.append({"section": current_section, "text": combined})

            current_section = heading_text
            current_paragraphs = []

        elif tag_name in ["p", "li"] and current_section is not None:
            p_text = clean_text(elem.get_text())
            if len(p_text) >= 40:
                current_paragraphs.append(p_text)

    if current_paragraphs and current_section:
        combined = " ".join(current_paragraphs)
        if len(combined) >= 70:
            sections.append({"section": current_section, "text": combined})

    return {
        "url": url,
        "title": title,
        "topic": default_topic,
        "sections": sections,
    }


def scrape_with_bypass(url: str, default_title: str = "", default_topic: str = "General") -> Dict[str, Any]:
    jina_url = f"https://r.jina.ai/{url}"
    bypass_headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "X-Return-Format": "markdown",
    }

    resp = requests.get(jina_url, headers=bypass_headers, timeout=20)
    resp.raise_for_status()
    raw_text = resp.text

    if len(raw_text.strip()) < 200 or "Warning: This page maybe requiring CAPTCHA" in raw_text:
        raise ValueError("Target website requires CAPTCHA.")

    title = default_title
    title_match = re.search(r"^Title:\s*(.+)$", raw_text, re.MULTILINE)
    if title_match and not title:
        title = title_match.group(1).strip()

    lines = raw_text.splitlines()
    sections = []
    current_sec = "Overview"
    current_lines = []

    in_content = False
    for line in lines:
        if line.startswith("Markdown Content:"):
            in_content = True
            continue
        if not in_content:
            continue

        header_match = re.match(r"^#{1,3}\s+(.+)$", line.strip())
        if header_match:
            heading = header_match.group(1).strip()
            if current_lines and current_sec:
                text_block = clean_text(" ".join(current_lines))
                if len(text_block) >= 60:
                    sections.append({"section": current_sec, "text": text_block})
            current_sec = heading
            current_lines = []
        else:
            cleaned_line = line.strip()
            cleaned_line = re.sub(r"!\[.*?\]\(.*?\)", "", cleaned_line)
            cleaned_line = re.sub(r"\[(.*?)\]\(.*?\)", r"\1", cleaned_line)
            if len(cleaned_line) > 25:
                current_lines.append(cleaned_line)

    if current_lines and current_sec:
        text_block = clean_text(" ".join(current_lines))
        if len(text_block) >= 60:
            sections.append({"section": current_sec, "text": text_block})

    return {
        "url": url,
        "title": title or url,
        "topic": default_topic,
        "sections": sections,
    }


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> List[str]:
    chunks = []
    start = 0
    text_len = len(text)

    while start < text_len:
        end = start + chunk_size
        if end >= text_len:
            c = text[start:].strip()
            if len(c) > 30:
                chunks.append(c)
            break

        break_pos = -1
        for punct in [". ", "? ", "! ", "\n"]:
            p = text.rfind(punct, start + int(chunk_size * 0.6), end)
            if p != -1:
                break_pos = p + len(punct)
                break

        if break_pos == -1:
            space_pos = text.rfind(" ", start + int(chunk_size * 0.6), end)
            break_pos = space_pos + 1 if space_pos != -1 else end

        c = text[start:break_pos].strip()
        if len(c) > 30:
            chunks.append(c)

        start = break_pos - overlap

    return chunks


def process_articles_into_chunks(articles: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    chunks = []
    for art in articles:
        url = art["url"]
        title = art["title"]
        topic = art["topic"]

        chunk_idx = 0
        for sec in art["sections"]:
            sec_title = sec["section"]
            sec_chunks = chunk_text(sec["text"])

            for c_text in sec_chunks:
                chunk_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{url}#{chunk_idx}"))
                chunks.append({
                    "id": chunk_id,
                    "url": url,
                    "title": title,
                    "topic": topic,
                    "section": sec_title,
                    "chunk_index": chunk_idx,
                    "text": c_text,
                })
                chunk_idx += 1

    return chunks


def ensure_collection(client: QdrantClient):
    if not client.collection_exists(collection_name=COLLECTION_NAME):
        client.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=VectorParams(size=VECTOR_DIM, distance=Distance.COSINE),
        )
        print(f"[OK] Collection '{COLLECTION_NAME}' created.")


def main():
    print("=" * 75)
    print("Multi-Tier Knowledge Scraper with Anti-Bot Protection Bypass")
    print("=" * 75)

    qdrant_url, qdrant_api_key = load_credentials()
    client = QdrantClient(url=qdrant_url, api_key=qdrant_api_key)
    ensure_collection(client)

    urls = load_urls()
    print(f"Loaded {len(urls)} URLs from data/url.json to process.\n")

    scraped_articles = []
    for idx, item in enumerate(urls, start=1):
        url = item["url"]
        label = item.get("title") or url
        print(f"[{idx}/{len(urls)}] Processing: {label}")

        try:
            art = scrape_direct(url, default_title=item.get("title"), default_topic=item.get("topic", "General"))
            if len(art["sections"]) > 0:
                scraped_articles.append(art)
                print(f"    -> [DIRECT OK] {len(art['sections'])} sections.")
                continue
        except Exception:
            pass

        try:
            art = scrape_with_bypass(url, default_title=item.get("title"), default_topic=item.get("topic", "General"))
            if len(art["sections"]) > 0:
                scraped_articles.append(art)
                print(f"    -> [BYPASS OK] {len(art['sections'])} sections.")
        except Exception as e:
            print(f"    -> [FAILED] {e}")

    all_chunks = process_articles_into_chunks(scraped_articles)
    print(f"\n[OK] Generated {len(all_chunks)} semantic chunks. Embedding...")

    model = SentenceTransformer(MODEL_NAME)
    texts = [c["text"] for c in all_chunks]
    embeddings = model.encode(texts, show_progress_bar=True, batch_size=32)

    points = [
        PointStruct(id=c["id"], vector=embeddings[i].tolist(), payload=c)
        for i, c in enumerate(all_chunks)
    ]

    for i in range(0, len(points), 100):
        client.upsert(collection_name=COLLECTION_NAME, points=points[i:i + 100], wait=True)

    print(f"[OK] Successfully upserted {len(points)} chunks into '{COLLECTION_NAME}'.")


if __name__ == "__main__":
    main()
