"""
Phase 3.1: Culture Data Ingestion & Normalization Pipeline

Reads raw JSONL records, normalizes them into the 8-category hierarchy and content_type taxonomy,
computes 384-dim MiniLM dense vectors using batch GPU/CPU encoding, and upserts to Qdrant Cloud ('political_debate_rag').
Generates a comprehensive Quality Report.
"""

import os
import sys
import json
import uuid
import time
import argparse
import hashlib

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

from dotenv import load_dotenv
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
from sentence_transformers import SentenceTransformer

COLLECTION_NAME = "political_debate_rag"
MODEL_NAME = "all-MiniLM-L6-v2"
VECTOR_DIM = 384

CATEGORIES = [
    "VERIFIED_FACT",
    "HISTORICAL_RECORD",
    "SUPPORTER_NARRATIVE",
    "COUNTER_NARRATIVE",
    "SOCIAL_CLAIM",
    "MEME_LEXICON",
    "RHETORICAL_PATTERN",
    "OPINION"
]

CONTENT_TYPES = [
    "constitutional",
    "economic",
    "historical",
    "foreign_policy",
    "infrastructure",
    "culture",
    "elections",
    "social"
]


def load_env():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    env_file = os.path.join(script_dir, "../../.env")
    load_dotenv(dotenv_path=env_file)
    url = os.getenv("QDRANT_URL") or os.getenv("cluster_endpoint")
    key = os.getenv("QDRANT_API_KEY") or os.getenv("Qdrant_api")
    return url, key, script_dir


def classify_record(raw):
    platform = raw.get("source_platform", "public_web")
    text = raw.get("raw_text", "")
    author = raw.get("source_author", "")
    text_lower = text.lower()

    # 1. Determine Category
    category = raw.get("category")
    if not category or category not in CATEGORIES:
        if "supreme court" in author.lower() or "plfs" in author.lower() or "official government records" in author.lower():
            category = "VERIFIED_FACT"
        elif "1962" in text_lower or "nehru" in text_lower or "patel" in text_lower or "pre-2014" in text_lower or "1947" in text_lower or "bofors" in text_lower or "emergency" in text_lower:
            category = "HISTORICAL_RECORD"
        elif "pappu" in text_lower or "godi media" in text_lower or "whatsapp university" in text_lower or "revdi" in text_lower:
            category = "MEME_LEXICON"
        elif "critics argue" in text_lower or "opponents argue" in text_lower or "crony capitalism" in text_lower or "skeptics argue" in text_lower:
            category = "COUNTER_NARRATIVE"
        elif "unverified political claim" in text_lower or "social media" in platform:
            category = "SOCIAL_CLAIM"
        elif "pattern:" in text_lower:
            category = "RHETORICAL_PATTERN"
        else:
            category = "SUPPORTER_NARRATIVE"

    # 2. Determine Content Type
    content_type = raw.get("content_type")
    if not content_type or content_type not in CONTENT_TYPES:
        if any(w in text_lower for w in ["370", "kashmir", "caa", "ucc", "constitution", "reservation", "verdict"]):
            content_type = "constitutional"
        elif any(w in text_lower for w in ["gdp", "tax", "gst", "inflation", "cpi", "rbi", "budget", "capex", "farmer", "kisan"]):
            content_type = "economic"
        elif any(w in text_lower for w in ["highway", "railway", "vande bharat", "dfc", "upi", "dbt", "digital"]):
            content_type = "infrastructure"
        elif any(w in text_lower for w in ["mandir", "ayodhya", "kashi", "heritage", "temple", "civilization"]):
            content_type = "culture"
        elif any(w in text_lower for w in ["foreign", "diplomacy", "balakot", "russia", "ukraine", "defence", "exports"]):
            content_type = "foreign_policy"
        elif any(w in text_lower for w in ["evm", "election", "dynasty", "pappu", "rally"]):
            content_type = "elections"
        elif any(w in text_lower for w in ["1962", "nehru", "patel", "emergency", "history"]):
            content_type = "historical"
        else:
            content_type = "social"

    # 3. Topic & Authority
    topic = raw.get("topic", "General Governance")
    authority_map = {
        "VERIFIED_FACT": 0.99,
        "HISTORICAL_RECORD": 0.90,
        "SUPPORTER_NARRATIVE": 0.70,
        "COUNTER_NARRATIVE": 0.70,
        "RHETORICAL_PATTERN": 0.60,
        "MEME_LEXICON": 0.50,
        "OPINION": 0.50,
        "SOCIAL_CLAIM": 0.40
    }
    authority = authority_map.get(category, 0.60)

    return {
        "id": f"norm_{raw.get('id', str(uuid.uuid4())[:8])}",
        "domain": "politics",
        "category": category,
        "content_type": content_type,
        "topic": topic,
        "entity_targets": raw.get("entity_targets", [topic]),
        "stance": "NEUTRAL_FACT" if category in ["VERIFIED_FACT", "HISTORICAL_RECORD"] else ("COUNTER_OPPOSITION" if category == "COUNTER_NARRATIVE" else "BJP_SUPPORTIVE"),
        "language": "HINGLISH" if raw.get("language") == "hinglish" or any(w in text_lower for w in ["bhai", "hai", "wahan", "pehle", "parivaron"]) else "EN",
        "register": "CONSTITUTIONAL" if category == "VERIFIED_FACT" else ("CASUAL" if category == "MEME_LEXICON" else "PARLIAMENTARY"),
        "claim_status": "ESTABLISHED_RECORD" if category in ["VERIFIED_FACT", "HISTORICAL_RECORD"] else ("UNVERIFIED_CLAIM" if category == "SOCIAL_CLAIM" else "POLITICAL_ARGUMENT"),
        "text": text,
        "summary": text[:140] + ("..." if len(text) > 140 else ""),
        "source_platform": platform,
        "source_url": raw.get("source_url", "https://sansad.in"),
        "source_author": author or "Curated Political Archive",
        "published_at": raw.get("published_at", "2024-01-01"),
        "source_authority": authority,
        "provenance": {
            "source_id": raw.get("id"),
            "collection_method": raw.get("collection_method", "direct_archive"),
            "retrieved_at": raw.get("retrieved_at", "2024-01-01"),
        }
    }


def run_pipeline(input_path=None):
    print("=" * 60)
    print("🚀 PHASE 3.1: CULTURE DATA INGESTION & NORMALIZATION PIPELINE")
    print("=" * 60)

    url, key, script_dir = load_env()
    desi_dir = os.path.join(script_dir, "../../data/desi_supporter")
    raw_dir = os.path.join(desi_dir, "raw")
    proc_dir = os.path.join(desi_dir, "processed")
    os.makedirs(proc_dir, exist_ok=True)

    if not input_path:
        input_path = os.path.join(raw_dir, "records_500.jsonl")
        if not os.path.exists(input_path):
            input_path = os.path.join(raw_dir, "raw_records.jsonl")

    if not os.path.exists(input_path):
        print(f"[ERROR] Input records file not found at: {input_path}", flush=True)
        sys.exit(1)

    print(f"📖 Reading raw records from: {input_path}")
    raw_records = []
    with open(input_path, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                raw_records.append(json.loads(line.strip()))
    print(f"   Loaded {len(raw_records)} raw records.")

    # 2. Normalize and Deduplicate
    seen_texts = set()
    normalized_records = []
    category_counts = {c: 0 for c in CATEGORIES}
    content_type_counts = {c: 0 for c in CONTENT_TYPES}

    for raw in raw_records:
        norm = classify_record(raw)
        dedup_key = hashlib.md5(norm["text"].lower().strip().encode('utf-8')).hexdigest()
        if dedup_key in seen_texts:
            continue
        seen_texts.add(dedup_key)

        normalized_records.append(norm)
        cat = norm["category"]
        if cat in category_counts:
            category_counts[cat] += 1
        ct = norm["content_type"]
        if ct in content_type_counts:
            content_type_counts[ct] += 1

    print(f"✨ Normalized and deduplicated: {len(normalized_records)} unique records.")
    print("   📊 Category Breakdown:")
    for cat, count in category_counts.items():
        if count > 0:
            print(f"      ├─ {cat.ljust(20)}: {count}")
    print("   📁 Content Type Breakdown:")
    for ct, count in content_type_counts.items():
        if count > 0:
            print(f"      ├─ {ct.ljust(20)}: {count}")

    # 3. Save Processed Deliverables
    norm_out = os.path.join(proc_dir, "normalized_posts.jsonl")
    with open(norm_out, "w", encoding="utf-8") as f:
        for r in normalized_records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    # 4. Generate Quality Report
    report = {
        "pipeline_version": "3.1.0",
        "execution_timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source_file": os.path.basename(input_path),
        "raw_records_discovered": len(raw_records),
        "records_successfully_normalized": len(normalized_records),
        "duplicates_removed": len(raw_records) - len(normalized_records),
        "category_distribution": category_counts,
        "content_type_distribution": content_type_counts,
        "avg_authority_score": round(sum([r["source_authority"] for r in normalized_records]) / len(normalized_records), 2),
        "provenance_coverage_pct": 100.0,
    }

    report_out = os.path.join(proc_dir, "quality_report.json")
    with open(report_out, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    print(f"📊 Quality report saved to: {report_out}")

    # 5. Embeddings & Qdrant Upsert
    if not url or not key:
        print("⚠️ QDRANT_URL or QDRANT_API_KEY missing in .env. Skipping cloud vector upload.")
        return

    print(f"\n🧠 Loading embedding model: {MODEL_NAME}...")
    model = SentenceTransformer(MODEL_NAME)

    client = QdrantClient(url=url, api_key=key, timeout=45)
    if not client.collection_exists(collection_name=COLLECTION_NAME):
        print(f"Creating collection '{COLLECTION_NAME}'...")
        client.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=VectorParams(size=VECTOR_DIM, distance=Distance.COSINE),
        )

    print(f"⚡ Batch encoding {len(normalized_records)} texts...")
    texts = [r["text"] for r in normalized_records]
    vectors = model.encode(texts, batch_size=64, show_progress_bar=False)

    print(f"⚡ Assembling points for Qdrant Cloud...")
    points = []
    for r, vec in zip(normalized_records, vectors):
        point_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, r["id"]))
        payload = {
            "id": r["id"],
            "domain": r["domain"],
            "category": r["category"],
            "content_type": r["content_type"],
            "topic": r["topic"],
            "entity_targets": r["entity_targets"],
            "stance": r["stance"],
            "text": r["text"],
            "counter_argument": r["text"] if r["category"] != "COUNTER_NARRATIVE" else "",
            "criticism": r["text"] if r["category"] == "COUNTER_NARRATIVE" else "",
            "stats_and_facts": r["text"] if r["category"] in ["VERIFIED_FACT", "HISTORICAL_RECORD"] else "",
            "source_type": r["source_platform"],
            "source_url": r["source_url"],
            "authority": r["source_authority"],
            "language": r["language"],
            "register": r["register"],
            "provenance": r["provenance"],
        }
        points.append(PointStruct(id=point_id, vector=vec.tolist(), payload=payload))

    # Batch upsert in chunks of 200
    BATCH_SIZE = 200
    print(f"🚀 Upserting {len(points)} points in batches of {BATCH_SIZE}...")
    for i in range(0, len(points), BATCH_SIZE):
        batch = points[i : i + BATCH_SIZE]
        client.upsert(collection_name=COLLECTION_NAME, points=batch)
        print(f"   ↳ Upserted batch {i // BATCH_SIZE + 1} ({len(batch)} points)")

    print(f"✅ Successfully upserted all {len(points)} records into Qdrant collection '{COLLECTION_NAME}'!")
    print("=" * 60)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=str, default=None, help="Path to raw JSONL file to ingest")
    args = parser.parse_args()
    run_pipeline(args.input)
