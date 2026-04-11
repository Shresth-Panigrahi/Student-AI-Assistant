import { useEffect, useRef, useCallback } from 'react'
import * as d3 from 'd3'

// ─── Types ───────────────────────────────────────────────────
export interface GraphNode {
  id: string
  label: string
  definition: string
  category: 'definition' | 'formula' | 'algorithm' | 'application' | 'process' | 'principle'
  importance: 1 | 2 | 3
  // D3 adds at runtime:
  x?: number
  y?: number
  vx?: number
  vy?: number
  fx?: number | null
  fy?: number | null
}

export interface GraphEdge {
  source: string | GraphNode
  target: string | GraphNode
  relationship: string
  label: string
  strength: 1 | 2 | 3
}

interface ConceptGraphProps {
  nodes: GraphNode[]
  edges: GraphEdge[]
  centralConcept: string
  onNodeClick: (node: GraphNode) => void
}

// ─── Color mapping by category ──────────────────────────────
const CATEGORY_COLORS: Record<string, string> = {
  definition: '#7c3aed',
  formula: '#2563eb',
  algorithm: '#059669',
  application: '#d97706',
  process: '#dc2626',
  principle: '#8b5cf6',
}

// ─── Node radius by importance ──────────────────────────────
function nodeRadius(d: GraphNode): number {
  switch (d.importance) {
    case 3: return 28
    case 2: return 22
    case 1: return 16
    default: return 18
  }
}

// ─── Component ──────────────────────────────────────────────
export default function ConceptGraph({ nodes, edges, centralConcept, onNodeClick }: ConceptGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)

  const buildGraph = useCallback(() => {
    if (!svgRef.current || nodes.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const rect = svgRef.current.getBoundingClientRect()
    const width = rect.width || 800
    const height = rect.height || 600

    // ─── Validate edges: ensure source/target exist in nodes ────
    const nodeIds = new Set(nodes.map(n => n.id))
    const validEdges = edges.filter(e => {
      const src = typeof e.source === 'string' ? e.source : e.source.id
      const tgt = typeof e.target === 'string' ? e.target : e.target.id
      return nodeIds.has(src) && nodeIds.has(tgt)
    })

    // Deep clone to avoid D3 mutating props
    const simNodes: GraphNode[] = nodes.map(n => ({ ...n }))
    const simEdges: GraphEdge[] = validEdges.map(e => ({ ...e }))

    // ─── Arrow marker definition ────────────────────────────────
    const defs = svg.append('defs')
    defs.append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-4L8,0L0,4')
      .attr('fill', 'rgba(255,255,255,0.2)')

    // Glow filter for central node
    const filter = defs.append('filter')
      .attr('id', 'glow')
    filter.append('feGaussianBlur')
      .attr('stdDeviation', '4')
      .attr('result', 'coloredBlur')
    const feMerge = filter.append('feMerge')
    feMerge.append('feMergeNode').attr('in', 'coloredBlur')
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic')

    // ─── Force simulation ───────────────────────────────────────
    const simulation = d3.forceSimulation<GraphNode>(simNodes)
      .force('charge', d3.forceManyBody<GraphNode>().strength(-300))
      .force('link', d3.forceLink<GraphNode, GraphEdge>(simEdges)
        .id(d => d.id)
        .distance((d: any) => 120 - ((d.strength || 2) * 20))
      )
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide<GraphNode>().radius(d => nodeRadius(d) + 15))

    // ─── Main group (for zoom/pan) ──────────────────────────────
    const g = svg.append('g')

    // ─── Zoom behavior ──────────────────────────────────────────
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })
    svg.call(zoom)
    zoomRef.current = zoom

    // ─── Draw edges ─────────────────────────────────────────────
    const edgeGroup = g.append('g').attr('class', 'edges')
    const edgeLines = edgeGroup.selectAll('line')
      .data(simEdges)
      .join('line')
      .attr('stroke', (d: any) => {
        const s = d.strength || 2
        return s >= 3 ? 'rgba(255,255,255,0.4)' : s >= 2 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)'
      })
      .attr('stroke-width', (d: any) => {
        const s = d.strength || 2
        return s >= 3 ? 2.5 : s >= 2 ? 1.5 : 1
      })
      .attr('marker-end', 'url(#arrowhead)')

    // ─── Draw edge labels ───────────────────────────────────────
    const edgeLabelGroup = g.append('g').attr('class', 'edge-labels')
    const edgeLabels = edgeLabelGroup.selectAll('text')
      .data(simEdges.filter((d: any) => (d.strength || 2) >= 2))
      .join('text')
      .attr('font-size', '9px')
      .attr('fill', 'rgba(255,255,255,0.35)')
      .attr('text-anchor', 'middle')
      .attr('dy', '-4')
      .text((d: any) => d.label || d.relationship?.replace('_', ' ') || '')

    // ─── Draw nodes ─────────────────────────────────────────────
    const nodeGroup = g.append('g').attr('class', 'nodes')

    const nodeContainers = nodeGroup.selectAll('g')
      .data(simNodes)
      .join('g')
      .attr('cursor', 'pointer')
      .on('click', (_event: any, d: GraphNode) => {
        onNodeClick(d)
      })

    // Central concept outer ring
    nodeContainers.filter(d => d.id === centralConcept)
      .append('circle')
      .attr('r', d => nodeRadius(d) + 6)
      .attr('fill', 'none')
      .attr('stroke', d => CATEGORY_COLORS[d.category] || '#7c3aed')
      .attr('stroke-opacity', 0.5)
      .attr('stroke-width', 2)
      .attr('filter', 'url(#glow)')

    // Node circles
    nodeContainers.append('circle')
      .attr('r', d => nodeRadius(d))
      .attr('fill', d => CATEGORY_COLORS[d.category] || '#7c3aed')
      .attr('stroke', 'rgba(255,255,255,0.15)')
      .attr('stroke-width', 1.5)
      .attr('opacity', 0.9)
      .on('mouseover', function () {
        d3.select(this).transition().duration(150).attr('r', (d: any) => nodeRadius(d) + 4)
      })
      .on('mouseout', function () {
        d3.select(this).transition().duration(150).attr('r', (d: any) => nodeRadius(d))
      })

    // ─── Draw node labels ───────────────────────────────────────
    const labelGroup = g.append('g').attr('class', 'labels')
    const labels = labelGroup.selectAll('text')
      .data(simNodes)
      .join('text')
      .attr('text-anchor', 'middle')
      .attr('font-size', '11px')
      .attr('fill', 'white')
      .attr('font-weight', '500')
      .attr('pointer-events', 'none')
      .each(function (d) {
        const text = d3.select(this)
        const label = d.label || d.id
        if (label.length > 12) {
          // Split into two lines
          const mid = Math.ceil(label.length / 2)
          const spaceIdx = label.indexOf(' ', mid - 4)
          const splitAt = spaceIdx > 0 && spaceIdx < label.length - 2 ? spaceIdx : mid
          text.append('tspan')
            .attr('x', 0)
            .attr('dy', `${nodeRadius(d) + 14}`)
            .text(label.slice(0, splitAt).trim())
          text.append('tspan')
            .attr('x', 0)
            .attr('dy', '13')
            .text(label.slice(splitAt).trim())
        } else {
          text.append('tspan')
            .attr('x', 0)
            .attr('dy', `${nodeRadius(d) + 14}`)
            .text(label)
        }
      })

    // ─── Drag behavior ──────────────────────────────────────────
    const drag = d3.drag<SVGGElement, GraphNode>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart()
        d.fx = d.x
        d.fy = d.y
      })
      .on('drag', (event, d) => {
        d.fx = event.x
        d.fy = event.y
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0)
        d.fx = null
        d.fy = null
      })

    nodeContainers.call(drag as any)

    // ─── Simulation tick ────────────────────────────────────────
    simulation.on('tick', () => {
      edgeLines
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y)

      edgeLabels
        .attr('x', (d: any) => (d.source.x + d.target.x) / 2)
        .attr('y', (d: any) => (d.source.y + d.target.y) / 2)

      nodeContainers.attr('transform', (d: any) => `translate(${d.x},${d.y})`)

      labels
        .attr('x', (d: any) => d.x)
        .attr('y', (d: any) => d.y)
        // Update tspan x positions for word-wrapped labels
        .selectAll('tspan')
        .attr('x', function () {
          const parent = (this as SVGTSpanElement).parentNode as SVGTextElement
          const d = d3.select(parent).datum() as GraphNode
          return d.x || 0
        })
    })

    // ─── Cleanup on unmount ─────────────────────────────────────
    return () => {
      simulation.stop()
    }
  }, [nodes, edges, centralConcept, onNodeClick])

  useEffect(() => {
    const cleanup = buildGraph()
    return () => {
      if (cleanup) cleanup()
    }
  }, [buildGraph])

  // ─── Expose zoom controls ────────────────────────────────────
  const zoomIn = useCallback(() => {
    if (svgRef.current && zoomRef.current) {
      d3.select(svgRef.current).transition().duration(300).call(
        zoomRef.current.scaleBy, 1.3
      )
    }
  }, [])

  const zoomOut = useCallback(() => {
    if (svgRef.current && zoomRef.current) {
      d3.select(svgRef.current).transition().duration(300).call(
        zoomRef.current.scaleBy, 0.7
      )
    }
  }, [])

  const resetView = useCallback(() => {
    if (svgRef.current && zoomRef.current) {
      d3.select(svgRef.current).transition().duration(500).call(
        zoomRef.current.transform, d3.zoomIdentity
      )
    }
  }, [])

  return (
    <div className="relative w-full h-full">
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        style={{ background: 'transparent' }}
      />
      {/* Zoom controls overlay */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
        <button
          onClick={zoomIn}
          className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:bg-white/10 hover:text-white transition-all text-sm font-bold"
        >
          +
        </button>
        <button
          onClick={zoomOut}
          className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:bg-white/10 hover:text-white transition-all text-sm font-bold"
        >
          −
        </button>
        <button
          onClick={resetView}
          className="h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:bg-white/10 hover:text-white transition-all text-[10px] px-2"
        >
          Reset
        </button>
      </div>
    </div>
  )
}

export { CATEGORY_COLORS }
