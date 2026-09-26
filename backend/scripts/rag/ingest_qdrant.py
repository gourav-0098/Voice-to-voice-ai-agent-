"""
Ingest dataset.json into Qdrant Cloud collection 'political_debate_rag'.
Embeds the 'criticism' field using sentence-transformers/all-MiniLM-L6-v2.
Stores the entire item entry as payload.
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

COLLECTION_NAME = "political_debate_rag"
MODEL_NAME = "all-MiniLM-L6-v2"
VECTOR_DIM = 384


def main():
    print("=" * 60)
    print("Qdrant Ingestion Pipeline: political_debate_rag")
    print("=" * 60)

    # 1. Load environment variables
    script_dir = os.path.dirname(os.path.abspath(__file__))
    env_file = os.path.join(script_dir, "../../.env")
    load_dotenv(dotenv_path=env_file)

    qdrant_url = os.getenv("QDRANT_URL") or os.getenv("cluster_endpoint")
    qdrant_api_key = os.getenv("QDRANT_API_KEY") or os.getenv("Qdrant_api")

    if not qdrant_url:
        print("[ERROR] QDRANT_URL is not set in .env.")
        sys.exit(1)

    print(f"Connecting to Qdrant at: {qdrant_url}")

    # 2. Load dataset.json
    dataset_file = os.path.join(script_dir, "../../data/dataset.json")
    if not os.path.exists(dataset_file):
        print(f"[ERROR] dataset.json not found at: {dataset_file}")
        sys.exit(1)

    with open(dataset_file, "r", encoding="utf-8") as f:
        data = json.load(f)
    print(f"[OK] Loaded {len(data)} entries from dataset.json")

    # 3. Model
    print(f"\nLoading embedding model: {MODEL_NAME}...")
    model = SentenceTransformer(MODEL_NAME)

    # 4. Connect to Qdrant
    client = QdrantClient(url=qdrant_url, api_key=qdrant_api_key, timeout=30)

    # 5. Check or create collection
    if not client.collection_exists(collection_name=COLLECTION_NAME):
        print(f"Collection '{COLLECTION_NAME}' does not exist. Creating...")
        client.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=VectorParams(size=VECTOR_DIM, distance=Distance.COSINE),
        )
        print(f"[OK] Created collection '{COLLECTION_NAME}'.")
    else:
        print(f"[OK] Collection '{COLLECTION_NAME}' already exists.")

    # 6. Generate embeddings
    print(f"\nGenerating embeddings for 'criticism' across {len(data)} items...")
    criticisms = [item.get("criticism", "").strip() for item in data]
    embeddings = model.encode(criticisms, show_progress_bar=True, batch_size=32)

    # 7. Upsert points
    points = []
    for idx, item in enumerate(data):
        raw_id = item.get("id", f"item_{idx}")
        point_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, raw_id))
        points.append(
            PointStruct(
                id=point_id,
                vector=embeddings[idx].tolist(),
                payload=item,
            )
        )

    print(f"Upserting {len(points)} points into '{COLLECTION_NAME}'...")
    client.upsert(collection_name=COLLECTION_NAME, points=points, wait=True)

    info = client.get_collection(collection_name=COLLECTION_NAME)
    print("\n" + "=" * 60)
    print(f"Ingestion successful! Total points in '{COLLECTION_NAME}': {info.points_count}")
    print("=" * 60)


if __name__ == "__main__":
    main()
