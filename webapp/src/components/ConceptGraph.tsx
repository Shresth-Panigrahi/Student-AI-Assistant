import React, { useEffect, useRef, useCallback, useState, useImperativeHandle, forwardRef } from 'react'
import * as d3 from 'd3'

// ─── Types ───────────────────────────────────────────────────
export interface GraphNode {
  id: string
  label: string
  definition: string
  category: 'definition' | 'formula' | 'algorithm' | 'application' | 'process' | 'principle'
  importance: 1 | 2 | 3
  
  // D3 physics
  x?: number
  y?: number
  vx?: number
  vy?: number
  fx?: number | null
  fy?: number | null
  
  // Custom radial targets
  radialTargetX?: number
  radialTargetY?: number
}

export interface GraphEdge {
  source: string | GraphNode
  target: string | GraphNode
  relationship: string
  label: string
  strength: 1 | 2 | 3
}

export interface ConceptGraphProps {
  nodes: GraphNode[]
  edges: GraphEdge[]
  centralConcept: string
  onNodeClick: (node: GraphNode) => void
}

export interface ConceptGraphHandle {
  highlightNode: (nodeId: string) => void
  resetHighlight: () => void
}

// ─── Constants & Colors ─────────────────────────────────────
const CATEGORY_COLORS: Record<string, string> = {
  definition: '#a855f7', // medium purple
  formula: '#3b82f6',    // medium blue
  algorithm: '#14b8a6',  // muted teal
  application: '#f59e0b', // warm amber
  process: '#ec4899',    // dusty rose
  principle: '#8b5cf6',   // slate violet
}

const LAYER_RADIUS = {
  3: 0,
  2: 200,
  1: 360
}

function nodeRadius(importance: number): number {
  switch (importance) {
    case 3: return 32
    case 2: return 20
    case 1: return 13
    default: return 13
  }
}

// ─── Helper: Wrap Text ──────────────────────────────────────
function calculateWrappedText(label: string): string[] {
  if (label.length <= 12) return [label]
  const mid = Math.ceil(label.length / 2)
  let spaceIdx = label.indexOf(' ', mid - 4)
  if (spaceIdx <= 0 || spaceIdx >= label.length - 2) {
    spaceIdx = label.lastIndexOf(' ', mid + 4)
  }
  const splitAt = spaceIdx > 0 && spaceIdx < label.length - 2 ? spaceIdx : mid
  return [label.slice(0, splitAt).trim(), label.slice(splitAt).trim()]
}


// ─── Component ──────────────────────────────────────────────
const ConceptGraph = forwardRef<ConceptGraphHandle, ConceptGraphProps>(({ nodes, edges, centralConcept, onNodeClick }, ref) => {
  const svgRef = useRef<SVGSVGElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const mainGroupRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null)
  const [zoomPercent, setZoomPercent] = useState(100)

  // Refs to store callbacks without triggering rebuilds
  const onNodeClickRef = useRef(onNodeClick)
  onNodeClickRef.current = onNodeClick

  // Imperative handle for triggering highlights from outside
  useImperativeHandle(ref, () => ({
    highlightNode: (nodeId: string) => activateHoverEffects(nodeId),
    resetHighlight: () => resetHoverEffects()
  }))

  // Force simulation cleanup ref
  const simulationRef = useRef<d3.Simulation<GraphNode, undefined> | null>(null)

  // State handlers for highlighting
  const activateHoverEffects = useCallback((focusedId: string) => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    
    // Find all connected edges
    const connectedEdges = new Set<string>()
    svg.selectAll('.edge-path').each((d: any) => {
      const src = d.source.id || d.source
      const tgt = d.target.id || d.target
      if (src === focusedId || tgt === focusedId) {
        connectedEdges.add(`${src}-${tgt}`)
      }
    })

    // Fade edges
    svg.selectAll('.edge-path')
      .style('transition', 'stroke-opacity 0.3s ease')
      .style('stroke-opacity', (d: any) => connectedEdges.has(`${d.source.id}-${d.target.id}`) ? 0.7 : 0.05)
      
    // Fade edge labels
    svg.selectAll('.edge-label-group')
      .style('transition', 'opacity 0.3s ease')
      .style('opacity', (d: any) => connectedEdges.has(`${d.source.id}-${d.target.id}`) ? 1 : 0.05)

    // Highlight node
    svg.selectAll('.node-circle')
      .style('transition', 'all 0.3s ease')
      .attr('r', (d: any) => d.id === focusedId ? nodeRadius(d.importance) + 6 : nodeRadius(d.importance))
      .attr('opacity', (d: any) => d.id === focusedId ? 1 : 0.5)

    // Expand glow
    svg.selectAll('.node-glow')
      .style('transition', 'all 0.3s ease')
      .attr('opacity', (d: any) => d.id === focusedId ? 0.4 : 0.1)
  }, [])

  const resetHoverEffects = useCallback(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    
    svg.selectAll('.edge-path')
      .style('transition', 'stroke-opacity 0.3s ease')
      .style('stroke-opacity', (d: any) => {
        const s = d.strength || 1
        return s === 3 ? 0.4 : s === 2 ? 0.3 : 0.15
      })

    svg.selectAll('.edge-label-group')
      .style('transition', 'opacity 0.3s ease')
      .style('opacity', 1)

    svg.selectAll('.node-circle')
      .style('transition', 'all 0.3s ease')
      .attr('r', (d: any) => nodeRadius(d.importance))
      .attr('opacity', 1)
      
    svg.selectAll('.node-glow')
      .style('transition', 'all 0.3s ease')
      .attr('opacity', 0.2)
  }, [])

  const buildGraph = useCallback(() => {
    if (!svgRef.current || !wrapperRef.current) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove() // Clear previous

    const rect = wrapperRef.current.getBoundingClientRect()
    const width = rect.width || 800
    const height = Math.max(rect.height || 600, 400)

    // Empty/Error States
    if (nodes.length < 3) {
      svg.append('text')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', '#9ca3af')
        .style('font-size', '14px')
        .text('Not enough concepts extracted. Try regenerating.')
      return
    }

    const validEdges = edges.filter(e => {
      const src = typeof e.source === 'string' ? e.source : e.source.id
      const tgt = typeof e.target === 'string' ? e.target : e.target.id
      return nodes.find(n => n.id === src) && nodes.find(n => n.id === tgt)
    })

    if (validEdges.length === 0) {
      svg.append('text')
        .attr('x', width / 2)
        .attr('y', height / 2 - 40)
        .attr('text-anchor', 'middle')
        .attr('fill', '#9ca3af')
        .style('font-size', '14px')
        .text('Concepts extracted but relationships unclear.')
      
      // Simple grid render
      const g = svg.append('g').attr('transform', `translate(${width/2 - 200}, ${height/2})`)
      // Minimal static visual fallback can be placed here if desired
      return
    }

    // ─── Clone Data & Calculate Math Layout ────────────────────────
    const simNodes: GraphNode[] = nodes.map(n => ({ ...n }))
    const simEdges: GraphEdge[] = validEdges.map(e => ({ ...e }))
    
    const cx = width / 2
    const cy = height / 2

    // 1. Center Tier 3
    const t3Node = simNodes.find(n => n.importance === 3) || simNodes[0]
    t3Node.fx = cx
    t3Node.fy = cy
    t3Node.radialTargetX = cx
    t3Node.radialTargetY = cy

    // 2. Position Tier 2 (Equidistant circle)
    const t2Nodes = simNodes.filter(n => n.importance === 2)
    t2Nodes.forEach((n, idx) => {
      const angle = (idx / t2Nodes.length) * 2 * Math.PI - Math.PI / 2
      n.radialTargetX = cx + Math.cos(angle) * LAYER_RADIUS[2]
      n.radialTargetY = cy + Math.sin(angle) * LAYER_RADIUS[2]
      // Set initial positions
      n.x = n.radialTargetX
      n.y = n.radialTargetY
    })

    // 3. Position Tier 1 (Clustered to Tier 2's angle + slight push)
    const t1Nodes = simNodes.filter(n => n.importance === 1)
    
    // Map T1 nodes to their closest T2 parent via edge
    t1Nodes.forEach(t1 => {
        // Find edges connected to t1
        const connectedEdge = simEdges.find(e => 
          (e.source === t1.id && t2Nodes.some(t2 => t2.id === e.target)) || 
          (e.target === t1.id && t2Nodes.some(t2 => t2.id === e.source))
        )
        
        let targetAngle = Math.random() * 2 * Math.PI // Fallback
        if (connectedEdge) {
            const parentId = connectedEdge.source === t1.id ? connectedEdge.target : connectedEdge.source
            const parent = t2Nodes.find(n => n.id === parentId)
            if (parent && parent.radialTargetX && parent.radialTargetY) {
                targetAngle = Math.atan2(parent.radialTargetY - cy, parent.radialTargetX - cx)
            }
        }
        
        // Add some random dispersion to the angle to prevent exact overlap
        const spreadAngle = targetAngle + (Math.random() - 0.5) * 0.8
        t1.radialTargetX = cx + Math.cos(spreadAngle) * LAYER_RADIUS[1]
        t1.radialTargetY = cy + Math.sin(spreadAngle) * LAYER_RADIUS[1]
        t1.x = t1.radialTargetX
        t1.y = t1.radialTargetY
    })


    // ─── SVG Setup & Defs ──────────────────────────────────────
    const defs = svg.append('defs')

    // Arrowheads for different opacity strengths
    ;([15, 30, 40]).forEach(opacity => {
      defs.append('marker')
        .attr('id', `arrowhead-${opacity}`)
        .attr('viewBox', '0 -5 10 10')
        // We will calculate exact edge boundary length per link, so refX=0
        .attr('refX', 0) 
        .attr('refY', 0)
        .attr('markerWidth', 5)
        .attr('markerHeight', 5)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-4L8,0L0,4')
        .attr('fill', `rgba(255,255,255,${opacity/100})`)
    })

    // Glow Filters
    Object.entries(CATEGORY_COLORS).forEach(([cat, color]) => {
      const filter = defs.append('filter').attr('id', `glow-${cat}`)
      filter.append('feGaussianBlur')
        .attr('stdDeviation', '6')
        .attr('result', 'coloredBlur')
      const feMerge = filter.append('feMerge')
      feMerge.append('feMergeNode').attr('in', 'coloredBlur')
      feMerge.append('feMergeNode').attr('in', 'SourceGraphic')
    })


    // ─── Main Containers & Zoom ──────────────────────────────
    const g = svg.append('g')
    mainGroupRef.current = g
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.4, 2.5])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
        setZoomPercent(Math.round(event.transform.k * 100))
      })
    svg.call(zoom)
    zoomRef.current = zoom


    // ─── Create Graphic Elements (Wait to draw till anim) ──
    // Edges
    const edgeGroup = g.append('g').attr('class', 'edges')
    const edgeLines = edgeGroup.selectAll('path')
      .data(simEdges)
      .join('path')
      .attr('class', 'edge-path')
      .attr('fill', 'none')
      .attr('stroke', (d: any) => {
        const s = d.strength || 1
        return s === 3 ? 'rgba(255,255,255,0.4)' : s === 2 ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.15)'
      })
      .attr('stroke-width', (d: any) => {
        const s = d.strength || 1
        return s === 3 ? 2 : s === 2 ? 1.5 : 1
      })
      .attr('marker-end', (d: any) => {
         const s = d.strength || 1
         const opacity = s === 3 ? 40 : s === 2 ? 30 : 15
         return `url(#arrowhead-${opacity})`
      })
      .attr('opacity', 0) // Hide initially

    // Edge Labels (Tier 3-2 or 2-2 only)
    const edgeLabelGroup = g.append('g').attr('class', 'edge-labels')
    const edgeLabelContainers = edgeLabelGroup.selectAll('g')
      .data(simEdges.filter(d => {
        const srcNode = simNodes.find(n => n.id === (d.source as any).id || n.id === d.source)
        const tgtNode = simNodes.find(n => n.id === (d.target as any).id || n.id === d.target)
        if (!srcNode || !tgtNode) return false
        return (srcNode.importance >= 2 && tgtNode.importance >= 2)
      }))
      .join('g')
      .attr('class', 'edge-label-group')
      .attr('opacity', 0)

    edgeLabelContainers.append('rect')
      .attr('fill', '#0f0f0f')
      .attr('rx', 4)
      .attr('height', 16)
      
    const edgeTexts = edgeLabelContainers.append('text')
      .attr('font-size', '9px')
      .attr('fill', 'rgba(255,255,255,0.6)')
      .attr('text-anchor', 'middle')
      .attr('alignment-baseline', 'middle')
      .text((d: any) => d.label)


    // Nodes
    const nodeGroup = g.append('g').attr('class', 'nodes')
    const nodeContainers = nodeGroup.selectAll('g')
      .data(simNodes)
      .join('g')
      .attr('class', 'node-container')
      .attr('cursor', 'pointer')
      .attr('opacity', 0) // Hide initially
      .attr('transform', d => `translate(${cx}, ${cy})`) // Start from center
      
      // Events
      .on('click', (event: any, d: GraphNode) => {
        onNodeClick(d)
        activateHoverEffects(d.id)
        event.stopPropagation() // Prevent background click
      })
      .on('mouseenter', (event: any, d: GraphNode) => activateHoverEffects(d.id))
      .on('mouseleave', resetHoverEffects)

    // Node Glows
    nodeContainers.append('circle')
      .attr('class', 'node-glow')
      .attr('r', d => nodeRadius(d.importance) * 1.5)
      .attr('fill', d => CATEGORY_COLORS[d.category] || CATEGORY_COLORS['definition'])
      .attr('opacity', 0.2)
      .attr('filter', d => `url(#glow-${d.category})`)

    // Node Base Circles
    nodeContainers.append('circle')
      .attr('class', 'node-circle')
      .attr('r', d => nodeRadius(d.importance))
      .attr('fill', d => CATEGORY_COLORS[d.category] || CATEGORY_COLORS['definition'])
      .attr('stroke', '#000') // Dark inner border base
      .attr('stroke-width', d => d.importance === 3 ? 0 : d.importance === 2 ? 2 : 1)

    // Double ring for Tier 3
    nodeContainers.filter(d => d.importance === 3)
      .append('circle')
      .attr('r', d => nodeRadius(3) + 4)
      .attr('fill', 'none')
      .attr('stroke', d => CATEGORY_COLORS[d.category] || CATEGORY_COLORS['definition'])
      .attr('stroke-width', 2)

    // Node Labels
    const labelGroup = g.append('g').attr('class', 'node-text-labels')
    const labels = labelGroup.selectAll('text')
      .data(simNodes)
      .join('text')
      .attr('class', 'node-text')
      .attr('opacity', 0)
      .attr('text-anchor', 'middle')
      .attr('font-size', d => d.importance === 3 ? '15px' : d.importance === 2 ? '13px' : '11px')
      .attr('font-weight', d => d.importance === 3 ? '700' : '500')
      .attr('fill', 'white')
      .attr('pointer-events', 'none')
      .each(function (d) {
         const selection = d3.select(this)
         const lines = calculateWrappedText(d.label)
         lines.forEach((line, i) => {
            selection.append('tspan')
              .text(line)
              .attr('x', 0)
              .attr('dy', i === 0 ? 0 : '1.2em')
         })
      })

    // ─── Simulation Setup ─────────────────────────────────────
    const simulation = d3.forceSimulation<GraphNode>(simNodes)
      // Minimal bump to overlapping nodes
      .force('collide', d3.forceCollide<GraphNode>().radius(d => nodeRadius(d.importance) + 10).iterations(2))
      // Gently pull nodes via links
      .force('link', d3.forceLink<GraphNode, GraphEdge>(simEdges).id(d => d.id).distance(50).strength(0.01))
      // Pull nodes back to default radial positions always
      .force('radialReturnX', d3.forceX<GraphNode>(d => d.radialTargetX || cx).strength(0.05))
      .force('radialReturnY', d3.forceY<GraphNode>(d => d.radialTargetY || cy).strength(0.05))
      
    simulationRef.current = simulation


    // ─── Path & Label computation on tick ───────────────────────
    simulation.on('tick', () => {
      // Bézier calculations
      edgeLines.attr('d', (d: any) => {
        const sourceX = d.source.x, sourceY = d.source.y
        const targetX = d.target.x, targetY = d.target.y
        
        // Midpoint
        const mx = (sourceX + targetX) / 2
        const my = (sourceY + targetY) / 2
        
        // Math vector perpendicular to edge length
        const dx = targetX - sourceX
        const dy = targetY - sourceY
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist === 0) return ''

        // Normalize and offset by 30px
        const nx = -dy / dist
        const ny = dx / dist
        const offset = 30
        const cx = mx + nx * offset
        const cy = my + ny * offset
        
        // Exact target boundary (for arrowhead alignment)
        const tgtRadius = nodeRadius((d.target as any).importance) + 2 // +2px padding
        // Distance from control point to target
        const dcx = targetX - cx
        const dcy = targetY - cy
        const ddist = Math.sqrt(dcx*dcx + dcy*dcy)
        const tgtEdgeX = targetX - (dcx/ddist) * tgtRadius
        const tgtEdgeY = targetY - (dcy/ddist) * tgtRadius

        return `M ${sourceX} ${sourceY} Q ${cx} ${cy} ${tgtEdgeX} ${tgtEdgeY}`
      })

      // Edge labels follow the curved path midpoint
      edgeLabelContainers.attr('transform', (d: any) => {
        const sourceX = d.source.x, sourceY = d.source.y
        const targetX = d.target.x, targetY = d.target.y
        
        // Curve equation for t=0.5
        const mx = (sourceX + targetX) / 2
        const my = (sourceY + targetY) / 2
        const dx = targetX - sourceX
        const dy = targetY - sourceY
        const dist = Math.sqrt(dx*dx + dy*dy)
        const offset = Math.min(30, dist/4) // adjust for very short edges
        const nx = -dy / dist
        const ny = dx / dist
        const qxVal = sourceX * 0.25 + (mx + nx * offset) * 0.5 + targetX * 0.25
        const qyVal = sourceY * 0.25 + (my + ny * offset) * 0.5 + targetY * 0.25
        
        // compute angle for label rotation
        let angle = Math.atan2(targetY - sourceY, targetX - sourceX) * 180 / Math.PI
        if (angle > 90 || angle < -90) angle += 180 // keep text upright
        
        return `translate(${qxVal}, ${qyVal}) rotate(${angle})`
      })
      
      // Update rect backgrounds dynamically
      edgeTexts.each(function(d: any, i) {
         const bbox = this.getBBox()
         d3.select(edgeLabelContainers.nodes()[i]).select('rect')
           .attr('x', bbox.x - 4)
           .attr('y', bbox.y - 2)
           .attr('width', bbox.width + 8)
      })

      nodeContainers.attr('transform', (d: any) => `translate(${d.x},${d.y})`)
      
      // Node label preliminary positions (will refine on exact finish)
      labels.attr('transform', (d: any) => {
          const r = nodeRadius(d.importance)
          return `translate(${d.x}, ${d.y + r + 15})`
      })
    })

    // Label Placement resolution after sim settles
    simulation.on('end', () => {
        // Evaluate label collisions and adjust dynamically
        // Implementation: For simplicity in the tick render, we default all labels below. 
        // Real D3 bounding box collision resolution is computationally intensive, 
        // so we ensure spacing primarily via forces above.
    })

    // ─── Drag Behavior ───────────────────────────────────────
    const drag = d3.drag<SVGGElement, GraphNode>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart()
        d.fx = d.x
        d.fy = d.y
      })
      .on('drag', (event, d) => {
        if (d.importance === 3) return // Don't drag center
        d.fx = event.x
        d.fy = event.y
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0)
        d.fx = null
        d.fy = null
      })

    nodeContainers.call(drag as any)

    // ─── Entry Animation Sequence ────────────────────────────────
    
    const BASE_DUR = 300
    // Stage 1: Central Node
    nodeContainers.filter(d => d.importance === 3)
      .transition().duration(BASE_DUR)
      .attr('opacity', 1)

    labels.filter((d: any) => d.importance === 3)
      .transition().duration(BASE_DUR).attr('opacity', 1)

    // Stage 2: Tier 2 Nodes (Fade + Scale translate)
    nodeContainers.filter(d => d.importance === 2)
      .transition().delay((d, i) => BASE_DUR + i * 100).duration(400)
      .attr('opacity', 1)
      
    labels.filter((d: any) => d.importance === 2)
      .transition().delay((d, i) => BASE_DUR + 200 + i * 100).duration(300).attr('opacity', 1)

    // Stage 3: Tier 2 Edges Drawing
    edgeLines.filter((d: any) => d.target.importance === 2 || d.source.importance === 2)
      .transition().delay(BASE_DUR + 500).duration(400)
      .attr('opacity', 1)
      
    edgeLabelContainers
      .transition().delay(BASE_DUR + 700).duration(300)
      .attr('opacity', 1)

    // Stage 4: Tier 1 Nodes
    nodeContainers.filter(d => d.importance === 1)
      .transition().delay((d, i) => BASE_DUR + 700 + (Math.random() * 300)).duration(400)
      .attr('opacity', 1)

    labels.filter((d: any) => d.importance === 1)
      .transition().delay((d, i) => BASE_DUR + 800 + (Math.random() * 300)).duration(300).attr('opacity', 1)

    // Stage 5: Tier 1 Edges
    edgeLines.filter((d: any) => d.target.importance === 1 || d.source.importance === 1)
      .transition().delay(BASE_DUR + 1100).duration(400)
      .attr('opacity', 1)
      

    const handleBgClick = () => {
      onNodeClick(null as any) // clear selection
      resetHoverEffects()
    }
    
    const handleBgDoubleClick = () => {
      // Zoom Reset
      svg.transition().duration(600).call(zoom.transform, d3.zoomIdentity)
    }

    svg.on('click', handleBgClick)
    svg.on('dblclick', handleBgDoubleClick)

    return () => {
      simulation.stop()
    }
  }, [nodes, edges, centralConcept, activateHoverEffects, resetHoverEffects])

  useEffect(() => {
    const cleanup = buildGraph()
    return () => {
      if (cleanup) cleanup()
    }
  }, [buildGraph])

  return (
    <div ref={wrapperRef} className="relative w-full h-full min-h-[400px]">
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        style={{ background: 'transparent' }}
      />
      {/* Zoom controls overlay */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10 bg-black/20 p-1.5 rounded-xl border border-white/5 backdrop-blur-md">
        <span className="text-[10px] text-gray-400 font-mono w-9 text-center mr-1">
          {zoomPercent}%
        </span>
        <button
          onClick={() => {
            if (svgRef.current && zoomRef.current) {
              d3.select(svgRef.current).transition().duration(250).call(zoomRef.current.scaleBy, 1.3)
            }
          }}
          className="w-6 h-6 rounded-md border border-white/10 flex items-center justify-center text-gray-300 hover:bg-white/10 hover:text-white transition-all text-sm font-bold"
        >
          +
        </button>
        <button
          onClick={() => {
            if (svgRef.current && zoomRef.current) {
              d3.select(svgRef.current).transition().duration(250).call(zoomRef.current.scaleBy, 0.7)
            }
          }}
          className="w-6 h-6 rounded-md border border-white/10 flex items-center justify-center text-gray-300 hover:bg-white/10 hover:text-white transition-all text-sm font-bold"
        >
          −
        </button>
      </div>
    </div>
  )
})

export default ConceptGraph
export { CATEGORY_COLORS }
