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


async def generate_concept_graph(
    transcript: str,
    session_title: str,
    context_files_text: str = ""
) -> dict:
    """
    Generate a concept graph from a lecture transcript.

    Returns dict with: nodes, edges, central_concept, summary,
    node_count, edge_count, error (if any).
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
        "You are an expert knowledge graph builder. Extract a semantic concept graph "
        "from the provided lecture transcript. Be precise and conservative — only extract "
        "concepts and relationships that are explicitly stated or strongly implied in the "
        "transcript. Do not invent relationships."
    )

    user_prompt = f"""Extract a concept graph from this lecture on "{session_title}".

Rules for nodes:
- Extract 8 to 18 concepts (not more — quality over quantity)
- Each concept must be a specific term, formula, algorithm, person, or process from the lecture
- Categories must be exactly one of: "definition", "formula", "algorithm", "application", "process", "principle"
- Importance is 1-3 (3 = central concept, 1 = supporting detail)

Rules for edges:
- Extract 10 to 25 relationships
- Relationship types must be exactly one of: "is_a", "uses", "produces", "requires", "contrasts_with", "part_of", "leads_to", "defined_by", "applied_in", "measures"
- Strength is 1-3 (3 = strongly related, 1 = loosely related)
- Only create edges between nodes that exist in your nodes list

Respond ONLY with valid JSON, no markdown fences, no extra text:
{{
  "nodes": [
    {{
      "id": "unique_snake_case_id",
      "label": "Display Name",
      "definition": "One sentence definition from the lecture",
      "category": "definition|formula|algorithm|application|process|principle",
      "importance": 1
    }}
  ],
  "edges": [
    {{
      "source": "source_node_id",
      "target": "target_node_id",
      "relationship": "is_a|uses|produces|requires|contrasts_with|part_of|leads_to|defined_by|applied_in|measures",
      "label": "short human readable label (2-4 words)",
      "strength": 1
    }}
  ],
  "central_concept": "id of the single most important node",
  "summary": "One sentence describing what this concept graph represents"
}}

Transcript:
{transcript}{context_section}"""

    # Attempt extraction (with one retry on parse failure)
    for attempt in range(2):
        temperature = 0.3 if attempt == 0 else 0.1
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
                    print(f"⚠️  Concept graph validation failed (attempt 1), retrying: {validated['error']}")
                    continue
                return validated

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
    - Clamp importance/strength to valid ranges
    """
    nodes = graph.get("nodes", [])
    edges = graph.get("edges", [])
    central_concept = graph.get("central_concept", "")
    summary = graph.get("summary", "")

    if not nodes:
        return {"error": "No nodes in concept graph"}

    # Validate nodes
    valid_nodes = []
    node_ids = set()
    for node in nodes:
        if not isinstance(node, dict):
            continue
        node_id = node.get("id", "")
        if not node_id or node_id in node_ids:
            continue

        # Ensure required fields
        label = node.get("label", node_id.replace("_", " ").title())
        definition = node.get("definition", "")
        category = node.get("category", "definition")
        if category not in VALID_CATEGORIES:
            category = "definition"
        importance = node.get("importance", 2)
        importance = max(1, min(3, int(importance)))

        valid_nodes.append({
            "id": node_id,
            "label": label,
            "definition": definition,
            "category": category,
            "importance": importance
        })
        node_ids.add(node_id)

    if not valid_nodes:
        return {"error": "No valid nodes after validation"}

    # Validate edges — remove any referencing non-existent nodes
    valid_edges = []
    for edge in edges:
        if not isinstance(edge, dict):
            continue
        source = edge.get("source", "")
        target = edge.get("target", "")
        if source not in node_ids or target not in node_ids:
            continue
        if source == target:
            continue

        relationship = edge.get("relationship", "uses")
        if relationship not in VALID_RELATIONSHIPS:
            relationship = "uses"
        label = edge.get("label", relationship.replace("_", " "))
        strength = edge.get("strength", 2)
        strength = max(1, min(3, int(strength)))

        valid_edges.append({
            "source": source,
            "target": target,
            "relationship": relationship,
            "label": label,
            "strength": strength
        })

    # Validate central_concept
    if central_concept not in node_ids and valid_nodes:
        # Pick the node with highest importance
        central_concept = max(valid_nodes, key=lambda n: n["importance"])["id"]

    return {
        "nodes": valid_nodes,
        "edges": valid_edges,
        "central_concept": central_concept,
        "summary": summary,
        "node_count": len(valid_nodes),
        "edge_count": len(valid_edges)
    }
