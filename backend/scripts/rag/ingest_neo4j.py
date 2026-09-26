"""
Ingest dataset.json into Neo4j AuraDB graph database.
Maps criticisms, topics, arguments, and entities using idempotent MERGE queries.
"""

import os
import sys
import json
from dotenv import load_dotenv
from neo4j import GraphDatabase


def load_environment():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    env_path = os.path.join(script_dir, "../../.env")
    load_dotenv(dotenv_path=env_path)

    neo4j_uri = os.getenv("NEO4J_URI")
    neo4j_user = os.getenv("NEO4J_USER") or os.getenv("Neo4j_Username")
    neo4j_password = os.getenv("NEO4J_PASSWORD") or os.getenv("Neo4j_Password")

    if not neo4j_uri or not neo4j_user or not neo4j_password:
        print("[ERROR] Missing Neo4j credentials in .env file.")
        sys.exit(1)

    return neo4j_uri, neo4j_user, neo4j_password


def load_dataset():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    dataset_file = os.path.join(script_dir, "../../data/dataset.json")
    if not os.path.exists(dataset_file):
        print(f"[ERROR] 'data/dataset.json' not found at: {dataset_file}")
        sys.exit(1)

    with open(dataset_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    return data


def create_constraints(driver):
    constraints = [
        "CREATE CONSTRAINT IF NOT EXISTS FOR (c:Criticism) REQUIRE c.id IS UNIQUE",
        "CREATE CONSTRAINT IF NOT EXISTS FOR (t:Topic) REQUIRE t.name IS UNIQUE",
        "CREATE CONSTRAINT IF NOT EXISTS FOR (a:Argument) REQUIRE a.id IS UNIQUE",
        "CREATE CONSTRAINT IF NOT EXISTS FOR (e:Entity) REQUIRE e.name IS UNIQUE",
    ]
    with driver.session() as session:
        for query in constraints:
            try:
                session.run(query)
            except Exception as e:
                print(f"[INFO] Constraint note: {e}")


def ingest_data(driver, data):
    ingest_cypher = """
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

    print(f"\nIngesting {len(data)} items into Neo4j AuraDB...")
    with driver.session() as session:
        for idx, item in enumerate(data, start=1):
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
            session.run(ingest_cypher, params)
            print(f"  [{idx}/{len(data)}] Ingested '{item['id']}' under topic '{item.get('topic')}'")

    print("[OK] All items successfully ingested.")


def main():
    print("=" * 60)
    print("Neo4j AuraDB Ingestion Pipeline")
    print("=" * 60)

    neo4j_uri, neo4j_user, neo4j_password = load_environment()
    data = load_dataset()
    print(f"Loaded {len(data)} items from dataset.json")

    print(f"Connecting to Neo4j instance at: {neo4j_uri}")
    try:
        driver = GraphDatabase.driver(neo4j_uri, auth=(neo4j_user, neo4j_password))
        driver.verify_connectivity()
        print("[OK] Connected to Neo4j AuraDB successfully.")
    except Exception as e:
        print(f"[ERROR] Failed connecting to Neo4j: {e}")
        sys.exit(1)

    try:
        create_constraints(driver)
        ingest_data(driver, data)
    finally:
        driver.close()
        print("Neo4j driver connection closed.")


if __name__ == "__main__":
    main()
