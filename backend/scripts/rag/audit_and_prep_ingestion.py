"""
Script to audit, filter, and prepare verified records from veniceurl.json and perplexityurl.json,
checking against url.json for duplicates or high similarity.
"""

import os
import sys
import json
import re
import urllib.parse
from difflib import SequenceMatcher

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../data")

def normalize_url(u):
    if not u:
        return ""
    u = u.strip().lower()
    # remove fragment
    u = u.split("#")[0]
    # parse
    parsed = urllib.parse.urlparse(u)
    netloc = parsed.netloc.replace("www.", "")
    path = parsed.path.rstrip("/")
    # filter query params
    q = urllib.parse.parse_qs(parsed.query)
    q_filtered = {k: v for k, v in q.items() if not k.startswith("utm_") and k not in ["ref", "source", "fbclid"]}
    query = urllib.parse.urlencode(q_filtered, doseq=True)
    return urllib.parse.urlunparse((parsed.scheme or "https", netloc, path, "", query, ""))

def get_path_slug(u):
    parsed = urllib.parse.urlparse(normalize_url(u))
    return f"{parsed.netloc}{parsed.path}"

def main():
    print("=" * 70)
    print("AUDIT & FILTER: VENICE & PERPLEXITY URLS VS URL.JSON")
    print("=" * 70)

    # 1. Load url.json
    url_file = os.path.join(DATA_DIR, "url.json")
    with open(url_file, "r", encoding="utf-8") as f:
        existing_urls = json.load(f)

    existing_canonical = {}
    existing_slugs = {}
    for item in existing_urls:
        raw_u = item.get("url") or item.get("source_url") or ""
        canon = normalize_url(raw_u)
        slug = get_path_slug(raw_u)
        if canon:
            existing_canonical[canon] = item
        if slug:
            existing_slugs[slug] = item

    print(f"Loaded existing url.json: {len(existing_urls)} entries ({len(existing_canonical)} unique canonical)")

    # 2. Load Venice records
    venice_file = os.path.join(DATA_DIR, "veniceurl.json")
    venice_records = []
    with open(venice_file, "r", encoding="utf-8") as f:
        for idx, line in enumerate(f, 1):
            line = line.strip()
            if line:
                try:
                    venice_records.append(json.loads(line))
                except Exception as e:
                    print(f"Venice parse error on line {idx}: {e}")

    print(f"Loaded Venice records: {len(venice_records)}")

    # 3. Load Perplexity records
    perp_file = os.path.join(DATA_DIR, "perplexityurl.json")
    perp_records = []
    with open(perp_file, "r", encoding="utf-8") as f:
        for idx, line in enumerate(f, 1):
            line = line.strip()
            if line and line.startswith("{"):
                try:
                    perp_records.append(json.loads(line))
                except Exception as e:
                    print(f"Perplexity parse error on line {idx}: {e}")

    print(f"Loaded Perplexity records: {len(perp_records)}")

    # 4. Processing candidates
    all_candidates = []
    for r in venice_records:
        r["_origin_file"] = "veniceurl.json"
        all_candidates.append(r)
    for r in perp_records:
        r["_origin_file"] = "perplexityurl.json"
        all_candidates.append(r)

    print(f"\nTotal candidate records to evaluate: {len(all_candidates)}")

    ignored_duplicates_existing = []
    ignored_similar_existing = []
    ignored_unverified = []
    ignored_cross_duplicates = []
    accepted_records = []

    seen_in_batch = set()

    for r in all_candidates:
        origin = r["_origin_file"]
        rec_id = r.get("id") or r.get("record_id")
        raw_u = r.get("source_url") or ""
        canon_u = normalize_url(raw_u)
        slug_u = get_path_slug(raw_u)
        title = r.get("title") or ""

        # Step A: Check unverified / quarantined
        sq = r.get("source_quality", {})
        if sq.get("specific_url_verified") is False or "UNVERIFIED" in r.get("verification_notes", ""):
            ignored_unverified.append({
                "origin": origin,
                "id": rec_id,
                "url": raw_u,
                "reason": r.get("verification_notes", "source_quality.specific_url_verified is False")
            })
            continue

        # Step B: Check exact duplicate in url.json
        if canon_u in existing_canonical or slug_u in existing_slugs:
            matched_item = existing_canonical.get(canon_u) or existing_slugs.get(slug_u)
            ignored_duplicates_existing.append({
                "origin": origin,
                "id": rec_id,
                "url": raw_u,
                "matched_existing": matched_item.get("url"),
                "reason": "Exact canonical URL or slug match with url.json"
            })
            continue

        # Step C: Check fuzzy similarity against url.json
        is_similar = False
        for ex_canon, ex_obj in existing_canonical.items():
            ex_parsed = urllib.parse.urlparse(ex_canon)
            cur_parsed = urllib.parse.urlparse(canon_u)
            # If same domain, check path similarity
            if ex_parsed.netloc == cur_parsed.netloc and len(ex_parsed.path) > 3 and len(cur_parsed.path) > 3:
                ratio = SequenceMatcher(None, ex_parsed.path, cur_parsed.path).ratio()
                if ratio > 0.85:
                    ignored_similar_existing.append({
                        "origin": origin,
                        "id": rec_id,
                        "url": raw_u,
                        "matched_existing": ex_obj.get("url"),
                        "reason": f"High URL path similarity ({ratio:.2f}) on {cur_parsed.netloc}"
                    })
                    is_similar = True
                    break
            # Also check title similarity
            ex_title = ex_obj.get("title", "")
            if ex_title and title:
                t_ratio = SequenceMatcher(None, title.lower(), ex_title.lower()).ratio()
                if t_ratio > 0.85:
                    ignored_similar_existing.append({
                        "origin": origin,
                        "id": rec_id,
                        "url": raw_u,
                        "matched_existing": ex_obj.get("url"),
                        "reason": f"High title similarity ({t_ratio:.2f}) with '{ex_title}'"
                    })
                    is_similar = True
                    break

        if is_similar:
            continue

        # Step D: Check cross-batch duplicates
        if canon_u in seen_in_batch or slug_u in seen_in_batch:
            ignored_cross_duplicates.append({
                "origin": origin,
                "id": rec_id,
                "url": raw_u,
                "reason": "Duplicate URL already processed in current batch"
            })
            continue

        seen_in_batch.add(canon_u)
        seen_in_batch.add(slug_u)
        accepted_records.append(r)

    print("\n" + "=" * 70)
    print("AUDIT RESULTS SUMMARY:")
    print("=" * 70)
    print(f"Total candidate records:             {len(all_candidates)}")
    print(f"Ignored (Unverified / Quarantined):  {len(ignored_unverified)}")
    print(f"Ignored (Exact Match in url.json):   {len(ignored_duplicates_existing)}")
    print(f"Ignored (High Similarity url.json):  {len(ignored_similar_existing)}")
    print(f"Ignored (Cross-batch Duplicates):    {len(ignored_cross_duplicates)}")
    print(f"ACCEPTED FOR KNOWLEDGE DB:           {len(accepted_records)}")
    print("=" * 70)

    if ignored_unverified:
        print(f"\nSample Quarantined Items ({len(ignored_unverified)} total):")
        for u in ignored_unverified[:5]:
            print(f" - [{u['origin']}] {u['id']}: {u['url']} -> {u['reason']}")

    if ignored_cross_duplicates:
        print(f"\nCross-batch Duplicates ({len(ignored_cross_duplicates)} total):")
        for d in ignored_cross_duplicates:
            print(f" - [{d['origin']}] {d['id']}: {d['url']}")

    print(f"\nAccepted Breakdown by Origin:")
    venice_accepted = [r for r in accepted_records if r["_origin_file"] == "veniceurl.json"]
    perp_accepted = [r for r in accepted_records if r["_origin_file"] == "perplexityurl.json"]
    print(f" - From veniceurl.json:     {len(venice_accepted)}")
    print(f" - From perplexityurl.json: {len(perp_accepted)}")

    # Category breakdown of accepted
    cat_counts = {}
    for r in accepted_records:
        c = r.get("category", "UNKNOWN")
        cat_counts[c] = cat_counts.get(c, 0) + 1
    print("\nAccepted Breakdown by Category:")
    for c, cnt in sorted(cat_counts.items(), key=lambda x: -x[1]):
        print(f" - {c.ljust(25)}: {cnt}")

if __name__ == "__main__":
    main()
