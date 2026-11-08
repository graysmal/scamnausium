import { useEffect, useRef } from 'react';
import cytoscape, { type Core, type ElementDefinition, type LayoutOptions } from 'cytoscape';
import { graphStyle, nodeId, parseNodeId, type Selection } from '../lib/graph';

interface Props {
  elements: ElementDefinition[];
  selection: Selection;
  onSelect: (selection: Selection) => void;
}

const layoutOptions = (fit: boolean, animate: boolean): LayoutOptions => ({
  name: 'cose', animate, animationDuration: 500, randomize: false, fit, padding: 56,
  nodeRepulsion: () => 26000, nodeOverlap: 24, idealEdgeLength: () => 85, edgeElasticity: () => 90,
  componentSpacing: 110, gravity: 0.6, numIter: 2500, coolingFactor: 0.97, nodeDimensionsIncludeLabels: true,
} as LayoutOptions);

const selectionNodeId = (s: Selection) => (s ? nodeId[s.kind](s.id) : '');

/** Interactive campaign network: drag, select, zoom. Cytoscape owns the canvas; React owns the data. */
export function NetworkGraph({elements, selection, onSelect}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const hasFit = useRef(false);
  const layoutTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!container.current) return;
    const cy = cytoscape({
      container: container.current, style: graphStyle, elements: [],
      minZoom: 0.35, maxZoom: 2.5, wheelSensitivity: 0.25, boxSelectionEnabled: false, autoungrabify: false,
    });
    cy.on('tap', 'node', e => onSelectRef.current(parseNodeId(e.target.id())));
    cy.on('tap', e => { if (e.target === cy) onSelectRef.current(null); });
    cy.on('mouseover', 'node', e => e.target.addClass('hover'));
    cy.on('mouseout', 'node', e => e.target.removeClass('hover'));
    cyRef.current = cy;
    return () => { clearTimeout(layoutTimer.current); cy.destroy(); cyRef.current = null; };
  }, []);

  // Reconcile elements: add/remove by id, update data in place. Re-layout only on structural change.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const next = new Map(elements.map(e => [String(e.data.id), e]));
    let structural = false;
    const arrived: string[] = [];
    cy.batch(() => {
      cy.elements().forEach(ele => {
        if (!next.has(ele.id())) { ele.remove(); structural = true; }
      });
      const center = {x: cy.width() / 2, y: cy.height() / 2};
      for (const [id, def] of next) {
        const existing = cy.getElementById(id);
        if (existing.nonempty()) { existing.data(def.data); continue; }
        if (def.group === 'nodes') {
          // Seed new nodes near something they connect to so the layout settles quickly.
          const neighborEdge = elements.find(e => e.group === 'edges' && (e.data.source === id || e.data.target === id));
          const otherId = neighborEdge ? (neighborEdge.data.source === id ? neighborEdge.data.target : neighborEdge.data.source) : undefined;
          const anchor = otherId ? cy.getElementById(String(otherId)) : undefined;
          const base = anchor?.nonempty() ? anchor.position() : center;
          cy.add({...def, position: {x: base.x + (Math.random() - 0.5) * 60, y: base.y + (Math.random() - 0.5) * 60}});
          if (hasFit.current && def.data.kind === 'incident') arrived.push(id);
        }
        structural = true;
      }
      for (const [id, def] of next) {
        if (def.group === 'edges' && cy.getElementById(id).empty()) cy.add(def);
      }
    });
    // Highlight reports that arrived live (not the initial load), then let the halo fade.
    for (const id of arrived) {
      const node = cy.getElementById(id);
      node.addClass('fresh');
      setTimeout(() => { if (!node.removed()) node.removeClass('fresh'); }, 4000);
    }
    if (structural && cy.nodes().nonempty()) {
      // Tables arrive one subscription at a time; wait for the burst to settle, then lay out once.
      clearTimeout(layoutTimer.current);
      layoutTimer.current = setTimeout(() => {
        const first = !hasFit.current;
        cy.layout(layoutOptions(true, !first)).run();
        hasFit.current = true;
      }, 220);
    }
  }, [elements]);

  // Selection: highlight the node and its neighborhood.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const id = selectionNodeId(selection);
    cy.batch(() => {
      cy.elements().unselect().removeClass('faded');
      const node = id ? cy.getElementById(id) : undefined;
      if (node?.nonempty()) {
        node.select();
        const hood = node.closedNeighborhood();
        cy.elements().not(hood).addClass('faded');
      }
    });
  }, [selection, elements]);

  const fit = () => cyRef.current?.animate({fit: {eles: cyRef.current.elements(), padding: 48}, duration: 300});
  const relayout = () => cyRef.current?.layout({...layoutOptions(true, true), randomize: true} as LayoutOptions).run();

  return (
    <div className="graph">
      <div ref={container} className="graph-canvas" aria-label="Campaign network. Drag nodes to rearrange, click to inspect." role="application" />
      {elements.length === 0 && <p className="graph-empty">Reports and calls appear here as they arrive.</p>}
      <div className="graph-tools">
        <button type="button" className="ghost" onClick={fit}>Fit</button>
        <button type="button" className="ghost" onClick={relayout}>Re-arrange</button>
      </div>
      <ul className="graph-legend" aria-label="Legend">
        <li><i className="lg campaign" />Campaign</li>
        <li><i className="lg dot" />Text</li>
        <li><i className="lg square" />Email</li>
        <li><i className="lg diamond" />Call</li>
        <li><i className="lg live" />Real provider event</li>
        <li><i className="lg shared" />Shared link or brand</li>
      </ul>
    </div>
  );
}
