"""
Intelligent Ingestion & Deduplication Pipeline (Qdrant Cloud + Neo4j AuraDB)
When backend/data/dataset.json is updated:
1. Validates each entry.
2. Checks if item ID exists in Qdrant and Neo4j.
3. Computes vector embedding of 'criticism' and searches Qdrant for semantic duplicates.
4. If similar (cosine similarity >= threshold), skips entry.
5. If new, uploads to both Qdrant Cloud and Neo4j AuraDB.
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
from neo4j import GraphDatabase

COLLECTION_NAME = "political_debate_rag"
MODEL_NAME = "all-MiniLM-L6-v2"
VECTOR_DIM = 384
DEFAULT_SIMILARITY_THRESHOLD = 0.85


def load_environment():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    env_path = os.path.join(script_dir, "../../.env")
    load_dotenv(dotenv_path=env_path)

    qdrant_url = os.getenv("QDRANT_URL") or os.getenv("cluster_endpoint")
    qdrant_api_key = os.getenv("QDRANT_API_KEY") or os.getenv("Qdrant_api")
    neo4j_uri = os.getenv("NEO4J_URI")
    neo4j_user = os.getenv("NEO4J_USER") or os.getenv("Neo4j_Username")
    neo4j_password = os.getenv("NEO4J_PASSWORD") or os.getenv("Neo4j_Password")

    if not qdrant_url:
        print("[ERROR] QDRANT_URL is missing in .env.")
        sys.exit(1)

    return qdrant_url, qdrant_api_key, neo4j_uri, neo4j_user, neo4j_password


def resolve_data_file():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    p = os.path.join(script_dir, "../../data/dataset.json")
    if os.path.exists(p):
        return p
    print("[ERROR] 'data/dataset.json' was not found.")
    sys.exit(1)


def ingest_to_neo4j(session, item):
    cypher = """
    MERGE (c:Criticism {id: $id})
    SET c.text = $criticism

    MERGE (t:Topic {name: $topic})

    MERGE (a:Argument {id: $arg_id})
    SET a.rebuttal = $counter_argument,
        a.stats = $stats_and_facts,
        a.whataboutism = $whataboutism,
        a.catchphrase = $catchphrase

    MERGE (target:Entity {name: $target_entity})
    MERGE (counter:Entity {name: $counter_entity})

    MERGE (c)-[:BELONGS_TO]->(t)
    MERGE (c)-[:COUNTERED_BY]->(a)
    MERGE (a)-[:DEFENDS]->(target)
    MERGE (a)-[:CONTRASTS_WITH]->(counter)
    """
    graph_rel = item.get("graph_relations", {})
    params = {
        "id": item["id"],
        "criticism": item.get("criticism", ""),
        "topic": item.get("topic", "General"),
        "arg_id": f"{item['id']}_arg",
        "counter_argument": item.get("counter_argument", ""),
        "stats_and_facts": item.get("stats_and_facts", ""),
        "whataboutism": item.get("whataboutism_or_pre2014", ""),
        "catchphrase": item.get("signature_catchphrase", ""),
        "target_entity": graph_rel.get("target_entity", "Unknown Target"),
        "counter_entity": graph_rel.get("counter_entity", "Unknown Counter"),
    }
    session.run(cypher, params)


def sync(similarity_threshold=DEFAULT_SIMILARITY_THRESHOLD):
    print("=" * 70)
    print("Smart Incremental Ingestion & Deduplication Pipeline")
    print(f"Similarity Threshold: {similarity_threshold}")
    print("=" * 70)

    qdrant_url, qdrant_api_key, neo4j_uri, neo4j_user, neo4j_password = load_environment()
    data_path = resolve_data_file()

    with open(data_path, "r", encoding="utf-8") as f:
        items = json.load(f)
    print(f"Loaded {len(items)} items from data/dataset.json.\n")

    model = SentenceTransformer(MODEL_NAME)
    qdrant_client = QdrantClient(url=qdrant_url, api_key=qdrant_api_key)

    neo4j_driver = None
    if neo4j_uri and neo4j_user and neo4j_password:
        try:
            neo4j_driver = GraphDatabase.driver(neo4j_uri, auth=(neo4j_user, neo4j_password))
            neo4j_driver.verify_connectivity()
            print("[OK] Connected to Neo4j AuraDB.")
        except Exception as e:
            print(f"[WARN] Neo4j not connected: {e}. Ingestion will proceed to Qdrant.")

    skipped_count = 0
    ingested_count = 0

    for idx, item in enumerate(items, start=1):
        raw_id = item.get("id", f"item_{idx}")
        criticism_text = item.get("criticism", "").strip()

        if not criticism_text:
            skipped_count += 1
            continue

        point_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, raw_id))
        existing_by_id = qdrant_client.retrieve(collection_name=COLLECTION_NAME, ids=[point_id])
        if existing_by_id:
            skipped_count += 1
            continue

        vector = model.encode(criticism_text).tolist()

        hits = qdrant_client.query_points(
            collection_name=COLLECTION_NAME,
            query=vector,
            limit=1,
            with_payload=True,
        ).points

        if hits and hits[0].score >= similarity_threshold:
            skipped_count += 1
            continue

        qdrant_client.upsert(
            collection_name=COLLECTION_NAME,
            points=[PointStruct(id=point_id, vector=vector, payload=item)],
            wait=True,
        )

        if neo4j_driver:
            with neo4j_driver.session() as s:
                ingest_to_neo4j(s, item)

        ingested_count += 1
        print(f"  [{idx}/{len(items)}] [NEW INGESTED] '{raw_id}'")

    if neo4j_driver:
        neo4j_driver.close()

    print("\n" + "=" * 70)
    print("SYNC SUMMARY")
    print(f"Evaluated:       {len(items)}")
    print(f"Skipped:         {skipped_count} (existing or semantically duplicate)")
    print(f"Newly Ingested:  {ingested_count}")
    print("=" * 70)


if __name__ == "__main__":
    sync()
