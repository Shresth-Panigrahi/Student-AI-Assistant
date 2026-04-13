"""
Concept Graph Generator
Extracts a semantic concept graph (nodes + edges) from a lecture transcript
using Groq, validates the graph, and caches in MongoDB.
"""
import os
import json
import re
import asyncio
from typing import Optional
from dotenv import load_dotenv
from groq import Groq

load_dotenv()

# Valid categories and relationship types
VALID_CATEGORIES = {"definition", "formula", "algorithm", "application", "process", "principle"}
VALID_RELATIONSHIPS = {
    "is_a", "uses", "produces", "requires", "contrasts_with",
    "part_of", "leads_to", "defined_by", "applied_in", "measures"
}

# The prompt demands specific verb phrases for edge labels, but we still map them to one of the above valid core relationships behind the scenes (or just keep the prompt's strong verb phrase as `label` and default `relationship` to closest match)


async def generate_concept_graph(
    transcript: str,
    session_title: str,
    context_files_text: str = ""
) -> dict:
    """
    Generate a concept graph from a lecture transcript.

    Returns dict with: nodes, edges, central_concept, summary,
    node_count, edge_count, tiers, error (if any).
    """
    if not transcript or len(transcript.strip()) < 50:
        return {"error": "Transcript too short to generate concept graph"}

    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return {"error": "GROQ_API_KEY not set"}

    client = Groq(api_key=api_key)

    # Build prompt
    context_section = ""
    if context_files_text and context_files_text.strip():
        context_section = f"\n\nAdditional context:\n{context_files_text}"

    system_prompt = (
        "You are an expert knowledge graph builder. Extract a hierarchical semantic "
        "concept graph from the provided lecture transcript."
    )

    user_prompt = f"""Analyze this lecture on "{session_title}" in THREE PASSES before generating output:

First pass: Identify the single most central concept that everything else depends on.
Second pass: Identify 2 to 5 second-tier concepts that directly support or branch from that central concept.
Third pass: Identify peripheral details, examples, and applications that hang off the second-tier concepts.

CRITICAL GRAPH CONSTRAINTS:
1. Minimum 8 nodes, Maximum 15 nodes.
2. Maximum 20 edges total.
3. Every node must have a meaningful definition pulled directly from transcript language, not generically paraphrased. 
4. FORBIDDEN NODES: Do not use generic nodes like "Introduction", "Overview", "Conclusion", "Example", "Concept".
5. Every edge label must be a specific directional verb phrase (e.g., "calculates using", "is a type of", "requires understanding of", "produces output of"). FORBIDDEN EDGE LABELS: "related to", "connected to", "associated with".

NODE IMPORTANCE RULES (Strictly Enforced):
- Exactly ONE node must be importance 3 (the central concept).
- Between 2 and 5 nodes must be importance 2 (direct children of central concept).
- All remaining nodes must be importance 1.

RELATIONSHIP CATEGORY (must be one of):
"is_a", "uses", "produces", "requires", "contrasts_with", "part_of", "leads_to", "defined_by", "applied_in", "measures"

NODE CATEGORY (must be one of):
"definition", "formula", "algorithm", "application", "process", "principle"

Respond ONLY with valid JSON exactly matching this schema:
{{
  "nodes": [
    {{
      "id": "unique_snake_case_id",
      "label": "Display Name",
      "definition": "Direct meaningful transcript quote or specific definition",
      "category": "definition|formula|algorithm|application|process|principle",
      "importance": 1|2|3
    }}
  ],
  "edges": [
    {{
      "source": "source_node_id",
      "target": "target_node_id",
      "relationship": "valid_relationship_category",
      "label": "specific verb phrase (e.g. calculates using)",
      "strength": 1|2|3
    }}
  ],
  "central_concept": "id of the single importance 3 node",
  "summary": "One sentence describing what this concept graph represents"
}}

Transcript:
{transcript}{context_section}"""

    # Attempt extraction (with one retry on parse or validation failure)
    for attempt in range(2):
        temperature = 0.3 if attempt == 0 else 0.5
        try:
            result = await asyncio.to_thread(
                lambda temp=temperature: client.chat.completions.create(
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    model="moonshotai/kimi-k2-instruct-0905",
                    temperature=temp,
                )
            )

            raw = result.choices[0].message.content.strip()

            # Strip markdown fences if present
            raw = re.sub(r'^```(?:json)?\s*', '', raw)
            raw = re.sub(r'\s*```$', '', raw)

            graph = json.loads(raw)

            # Validate and clean
            validated = _validate_graph(graph)
            
            if validated.get("error"):
                if attempt == 0:
                    print(f"⚠️  Concept graph validation error (attempt 1), retrying: {validated['error']}")
                    continue
                return validated
                
            if validated["node_count"] < 6:
                if attempt == 0:
                    print(f"⚠️  Too few valid nodes (<6) extracted after pruning (attempt 1), retrying.")
                    continue
                else:
                    return {"error": "Failed to extract enough valid connected nodes from transcript."}

            print(f"✅ Concept graph generated: {validated['node_count']} nodes, {validated['edge_count']} edges")
            return validated

        except json.JSONDecodeError as e:
            if attempt == 0:
                print(f"⚠️  JSON parse failed (attempt 1), retrying: {e}")
                continue
            return {"error": f"Failed to parse concept graph JSON: {str(e)}"}

        except Exception as e:
            print(f"❌ Concept graph generation error: {e}")
            import traceback
            traceback.print_exc()
            return {"error": f"Generation failed: {str(e)}"}

    return {"error": "Failed to generate valid concept graph after 2 attempts"}


def _validate_graph(graph: dict) -> dict:
    """
    Validate and clean the concept graph.
    - Ensure all nodes have required fields
    - Remove edges referencing non-existent nodes
    - Remove duplicate edges
    - Remove orphan nodes (0 edges connected)
    - Sort nodes so importance 3 is first, 2 follows, 1 is last
    - Clamp importance/strength to valid ranges
    """
    nodes = graph.get("nodes", [])
    edges = graph.get("edges", [])
    central_concept = graph.get("central_concept", "")
    summary = graph.get("summary", "")

    if not nodes:
        return {"error": "No nodes in concept graph"}

    # Pass 1: Parse provided nodes
    temp_nodes = {}
    for node in nodes:
        if not isinstance(node, dict):
            continue
        node_id = node.get("id", "")
        if not node_id or node_id in temp_nodes:
            continue

        label = node.get("label", node_id.replace("_", " ").title())
        definition = node.get("definition", "")
        category = node.get("category", "definition")
        if category not in VALID_CATEGORIES:
            category = "definition"
        importance = node.get("importance", 1)
        importance = max(1, min(3, int(importance)))

        temp_nodes[node_id] = {
            "id": node_id,
            "label": label,
            "definition": definition,
            "category": category,
            "importance": importance
        }

    # Pass 2: Clean and deduplicate edges
    valid_edges = []
    seen_edge_pairs = set()
    node_edge_counts = {nid: 0 for nid in temp_nodes.keys()}
    
    for edge in edges:
        if not isinstance(edge, dict):
            continue
        source = edge.get("source", "")
        target = edge.get("target", "")
        
        # Must exist in nodes and not be self-referential
        if source not in temp_nodes or target not in temp_nodes or source == target:
            continue
            
        # Deduplicate edges (ignore direction for duplication check)
        pair = tuple(sorted([source, target]))
        if pair in seen_edge_pairs:
            continue
        seen_edge_pairs.add(pair)

        node_edge_counts[source] += 1
        node_edge_counts[target] += 1

        relationship = edge.get("relationship", "uses")
        if relationship not in VALID_RELATIONSHIPS:
            relationship = "uses"
            
        label = edge.get("label", relationship.replace("_", " "))
        
        # Reject generic labels
        if label.lower() in ["related to", "connected to", "associated with"]:
            label = "interacts with" # forceful correction if LLM failed
            
        strength = edge.get("strength", 2)
        strength = max(1, min(3, int(strength)))

        valid_edges.append({
            "source": source,
            "target": target,
            "relationship": relationship,
            "label": label,
            "strength": strength
        })

    # Pass 3: Remove orphans and build final node list
    valid_nodes = []
    node_ids = set()
    for nid, node in temp_nodes.items():
        if node_edge_counts[nid] > 0: # Only keep nodes with at least 1 edge
            valid_nodes.append(node)
            node_ids.add(nid)
            
    if not valid_nodes:
        return {"error": "No non-orphan nodes remained after validation"}

    # Sort nodes by importance descending (3, 2, 1) to aid frontend rendering
    valid_nodes.sort(key=lambda n: n["importance"], reverse=True)

    # Guarantee central_concept existence
    if central_concept not in node_ids:
        central_concept = valid_nodes[0]["id"]
        
    # Map Tiers
    tiers = {}
    for node in valid_nodes:
        img = node["importance"]
        tiers[node["id"]] = img # Importance 3 maps to tier 3, etc.

    return {
        "nodes": valid_nodes,
        "edges": valid_edges,
        "central_concept": central_concept,
        "summary": summary,
        "tiers": tiers,
        "node_count": len(valid_nodes),
        "edge_count": len(valid_edges)
    }
