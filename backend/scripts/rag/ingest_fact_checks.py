"""
Ingest fact_checks.json into Qdrant Cloud collection 'fact_checks_rag'.
Embeds the 'claim' and 'context' using all-MiniLM-L6-v2.
Stores complete fact-checking details as payload for instant retrieval.
"""

import os
import sys
import json
import uuid

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

COLLECTION_NAME = "fact_checks_rag"
MODEL_NAME = "all-MiniLM-L6-v2"
VECTOR_DIM = 384


def load_credentials():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    env_path = os.path.join(script_dir, "../../.env")
    load_dotenv(dotenv_path=env_path)

    qdrant_url = os.getenv("QDRANT_URL") or os.getenv("cluster_endpoint")
    qdrant_api_key = os.getenv("QDRANT_API_KEY") or os.getenv("Qdrant_api")

    if not qdrant_url:
        print("[ERROR] QDRANT_URL is not set in .env.")
        sys.exit(1)

    return qdrant_url, qdrant_api_key


def load_fact_checks():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    file_path = os.path.join(script_dir, "../../data/fact_checks.json")

    if not os.path.exists(file_path):
        print(f"[ERROR] fact_checks.json not found at: {file_path}")
        sys.exit(1)

    with open(file_path, "r", encoding="utf-8") as f:
        items = json.load(f)

    return items


def ensure_collection(client: QdrantClient):
    if not client.collection_exists(collection_name=COLLECTION_NAME):
        print(f"Collection '{COLLECTION_NAME}' does not exist in Qdrant. Creating...")
        client.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=VectorParams(size=VECTOR_DIM, distance=Distance.COSINE),
        )
        print(f"[OK] Collection '{COLLECTION_NAME}' created.")
    else:
        print(f"[OK] Collection '{COLLECTION_NAME}' already exists.")


def ingest_fact_checks():
    print("=" * 70)
    print("Fact Checks Qdrant Ingestion Pipeline")
    print("=" * 70)

    # 1. Credentials & Client
    qdrant_url, qdrant_api_key = load_credentials()
    client = QdrantClient(url=qdrant_url, api_key=qdrant_api_key)
    ensure_collection(client)

    # 2. Data
    items = load_fact_checks()
    print(f"Loaded {len(items)} fact-check records from data/fact_checks.json.")

    # 3. Model
    print(f"\nLoading embedding model: {MODEL_NAME}...")
    model = SentenceTransformer(MODEL_NAME)

    # 4. Prepare Embeddings & Points
    print(f"\nEmbedding claims and preparing points...")
    texts_to_embed = [f"{item.get('claim', '')} (Context: {item.get('context', '')})" for item in items]
    embeddings = model.encode(texts_to_embed, show_progress_bar=True)

    points = []
    for idx, item in enumerate(items):
        raw_id = item.get("id", f"fact_check_{idx}")
        point_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, raw_id))

        points.append(
            PointStruct(
                id=point_id,
                vector=embeddings[idx].tolist(),
                payload=item,
            )
        )

    # 5. Upsert to Qdrant
    print(f"\nUpserting {len(points)} fact-check points into '{COLLECTION_NAME}'...")
    client.upsert(collection_name=COLLECTION_NAME, points=points, wait=True)
    print("[OK] Upsert complete.")

    # 6. Verification
    info = client.get_collection(collection_name=COLLECTION_NAME)
    print("\n" + "=" * 70)
    print(f"INGESTION SUCCESSFUL")
    print(f"Collection: {COLLECTION_NAME}")
    print(f"Total Points in Collection: {info.points_count}")
    print("=" * 70 + "\n")


def search_fact_checks(query: str, top_k: int = 2):
    """Utility function to search fact-checks."""
    qdrant_url, qdrant_api_key = load_credentials()
    client = QdrantClient(url=qdrant_url, api_key=qdrant_api_key)
    model = SentenceTransformer(MODEL_NAME)

    query_vec = model.encode(query).tolist()
    hits = client.query_points(
        collection_name=COLLECTION_NAME,
        query=query_vec,
        limit=top_k,
        with_payload=True,
    ).points

    print("\n" + "=" * 80)
    print(f"FACT-CHECK SEARCH RESULTS FOR: \"{query}\"")
    print("=" * 80)
    for rank, hit in enumerate(hits, start=1):
        p = hit.payload
        print(f"[{rank}] Score: {hit.score:.4f} | ID: {p.get('id')} | Leader: {p.get('leader')}")
        print(f"    Claim:       \"{p.get('claim')}\"")
        print(f"    Context:     {p.get('context')}")
        print(f"    Fact-Check:  {p.get('fact_check_summary')}")
        print(f"    Source:      {p.get('source_type')}\n")
    print("=" * 80)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--search":
        search_query = " ".join(sys.argv[2:]) if len(sys.argv) > 2 else "Did Modi stop the Russia Ukraine war?"
        search_fact_checks(search_query)
    else:
        ingest_fact_checks()
        search_fact_checks("Did Modi stop the Russia Ukraine war?")
