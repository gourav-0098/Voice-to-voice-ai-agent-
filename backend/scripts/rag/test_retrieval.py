"""
Hybrid Retrieval Verification CLI Tool:
Tests Qdrant vector retrieval + Neo4j Graph traversal across collections.
Usage:
  python test_retrieval.py "Why is the government spending on Ram Mandir instead of schools?"
  python test_retrieval.py --factcheck "Did Modi stop the Russia Ukraine war?"
"""

import os
import sys

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

from dotenv import load_dotenv
from qdrant_client import QdrantClient
from sentence_transformers import SentenceTransformer
from neo4j import GraphDatabase

COLLECTION_NAME = "political_debate_rag"
MODEL_NAME = "all-MiniLM-L6-v2"
DEFAULT_QUERY = "Why is the government spending on Ram Mandir instead of schools?"


def load_credentials():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    env_path = os.path.join(script_dir, "../../.env")
    load_dotenv(dotenv_path=env_path)

    qdrant_url = os.getenv("QDRANT_URL") or os.getenv("cluster_endpoint")
    qdrant_api_key = os.getenv("QDRANT_API_KEY") or os.getenv("Qdrant_api")
    neo4j_uri = os.getenv("NEO4J_URI")
    neo4j_user = os.getenv("NEO4J_USER") or os.getenv("Neo4j_Username")
    neo4j_password = os.getenv("NEO4J_PASSWORD") or os.getenv("Neo4j_Password")

    return qdrant_url, qdrant_api_key, neo4j_uri, neo4j_user, neo4j_password


def search_qdrant(client, model, query_text):
    print(f"\n[Step 1] Vector Search via Qdrant Cloud ('{COLLECTION_NAME}')...")
    query_vector = model.encode(query_text).tolist()

    search_res = client.query_points(
        collection_name=COLLECTION_NAME,
        query=query_vector,
        limit=1,
        with_payload=True,
    ).points

    if not search_res:
        print("[ERROR] No matching vector points found in Qdrant.")
        return None

    top = search_res[0]
    p = top.payload
    print(f"  -> Top match found! (Similarity Score: {top.score:.4f})")
    print(f"  -> Matched ID: {p.get('id')}")
    print(f"  -> Matched Topic: {p.get('topic')}")

    return {
        "id": p.get("id"),
        "topic": p.get("topic"),
        "criticism": p.get("criticism"),
        "counter_argument": p.get("counter_argument"),
        "stats_and_facts": p.get("stats_and_facts"),
        "whataboutism": p.get("whataboutism_or_pre2014"),
        "catchphrase": p.get("signature_catchphrase"),
        "target_entity": p.get("graph_relations", {}).get("target_entity"),
        "counter_entity": p.get("graph_relations", {}).get("counter_entity"),
        "score": top.score,
    }


def query_neo4j(driver, criticism_id):
    if not driver:
        return None

    cypher = """
    MATCH (c:Criticism {id: $criticism_id})
    OPTIONAL MATCH (c)-[:BELONGS_TO]->(t:Topic)
    OPTIONAL MATCH (c)-[:COUNTERED_BY]->(a:Argument)
    OPTIONAL MATCH (a)-[:DEFENDS]->(target:Entity)
    OPTIONAL MATCH (a)-[:CONTRASTS_WITH]->(counter:Entity)
    RETURN c.id AS criticism_id,
           t.name AS topic,
           a.rebuttal AS rebuttal,
           a.stats AS stats,
           a.catchphrase AS catchphrase,
           target.name AS defends_entity,
           counter.name AS contrasts_entity
    """
    try:
        with driver.session() as s:
            r = s.run(cypher, {"criticism_id": criticism_id}).single()
            return dict(r) if r else None
    except Exception as e:
        print(f"[WARN] Neo4j query skipped: {e}")
        return None


def main():
    query = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_QUERY
    qdrant_url, qdrant_api_key, neo4j_uri, neo4j_user, neo4j_password = load_credentials()

    print(f"Loading embedding model: {MODEL_NAME}...")
    model = SentenceTransformer(MODEL_NAME)
    client = QdrantClient(url=qdrant_url, api_key=qdrant_api_key)

    driver = None
    if neo4j_uri and neo4j_user and neo4j_password:
        try:
            driver = GraphDatabase.driver(neo4j_uri, auth=(neo4j_user, neo4j_password))
            driver.verify_connectivity()
        except Exception:
            driver = None

    try:
        vec_match = search_qdrant(client, model, query)
        if not vec_match:
            return

        graph_data = query_neo4j(driver, vec_match["id"]) if driver else None

        print("\n" + "=" * 80)
        print("HYBRID RETRIEVAL RESULTS")
        print("=" * 80)
        print(f"Query: \"{query}\"")
        print(f"Topic: {vec_match['topic']} (Score: {vec_match['score']:.4f})")
        print(f"Defends: {vec_match.get('target_entity')}")
        print(f"Contrasts: {vec_match.get('counter_entity')}")
        if vec_match.get("catchphrase"):
            print(f"Catchphrase: \"{vec_match['catchphrase']}\"")
        print("\nCounter-Argument:")
        print(f"  {vec_match['counter_argument']}")
        print("\nStats & Facts:")
        print(f"  {vec_match['stats_and_facts']}")
        print("=" * 80)
    finally:
        if driver:
            driver.close()


if __name__ == "__main__":
    main()
