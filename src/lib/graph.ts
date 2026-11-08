import type { ElementDefinition, StylesheetJson } from 'cytoscape';
import type { Calls, Campaigns, Incidents, Indicators } from '../module_bindings/types';

export type Selection = {kind: 'incident' | 'campaign' | 'indicator'; id: string} | null;

/** Node ids are namespaced so a campaign, incident and indicator can never collide. */
export const nodeId = {
  campaign: (id: string) => `c|${id}`,
  incident: (id: string) => `i|${id}`,
  indicator: (fingerprint: string) => `x|${fingerprint}`,
};
export function parseNodeId(id: string): Selection {
  const [prefix, ...rest] = id.split('|');
  const value = rest.join('|');
  if (prefix === 'c') return {kind: 'campaign', id: value};
  if (prefix === 'i') return {kind: 'incident', id: value};
  if (prefix === 'x') return {kind: 'indicator', id: value};
  return null;
}

const LINKING_KINDS = new Set(['domain', 'brand', 'sender']);

/** Indicators that connect two or more incidents, grouped by fingerprint. */
export function sharedIndicators(indicators: readonly Indicators[]): Map<string, {label: string; kind: string; incidentIds: Set<string>}> {
  const groups = new Map<string, {label: string; kind: string; incidentIds: Set<string>}>();
  for (const ind of indicators) {
    if (!LINKING_KINDS.has(ind.kind)) continue;
    const g = groups.get(ind.fingerprint) ?? {label: ind.displayValue, kind: ind.kind === 'sender' ? 'domain' : ind.kind, incidentIds: new Set<string>()};
    g.incidentIds.add(ind.incidentId);
    groups.set(ind.fingerprint, g);
  }
  for (const [key, g] of groups) if (g.incidentIds.size < 2) groups.delete(key);
  return groups;
}

export function buildElements(incidents: readonly Incidents[], campaigns: readonly Campaigns[], indicators: readonly Indicators[], calls: readonly Calls[] = []): ElementDefinition[] {
  const elements: ElementDefinition[] = [];
  // Dismissed reports (operator: not a scam) stay in the feed but leave the graph.
  incidents = incidents.filter(i => i.status !== 'dismissed');
  const incidentIds = new Set(incidents.map(i => i.id));
  for (const c of campaigns) {
    elements.push({group: 'nodes', data: {id: nodeId.campaign(c.id), kind: 'campaign', label: c.label, weight: c.incidentCount}});
  }
  const campaignIds = new Set(campaigns.map(c => c.id));
  for (const i of incidents) {
    const live = i.sourceKind === 'elevenlabs_call' || i.sourceKind === 'photon_imessage';
    elements.push({group: 'nodes', data: {id: nodeId.incident(i.id), kind: 'incident', label: i.headline, risk: i.riskLevel, channel: i.channel, live: live ? 1 : 0, protected: i.status === 'protected' ? 1 : 0}});
    if (i.campaignId && campaignIds.has(i.campaignId)) {
      elements.push({group: 'edges', data: {id: `e|${i.id}|${i.campaignId}`, source: nodeId.incident(i.id), target: nodeId.campaign(i.campaignId), kind: 'member'}});
    }
  }
  // A call that has not been filed yet shows as a pending node with the incident's future id,
  // so the same node turns into the filed report (and links to its campaign) when the summary lands.
  for (const call of calls) {
    if (incidentIds.has(call.id) || call.status === 'failed' || call.status === 'done') continue;
    elements.push({group: 'nodes', data: {id: nodeId.incident(call.id), kind: 'incident', label: call.status === 'processing' ? 'Summarizing call' : 'Live call', risk: 'pending', channel: 'call', live: 1, protected: 0}});
  }
  for (const [fingerprint, g] of sharedIndicators(indicators)) {
    const linked = [...g.incidentIds].filter(id => incidentIds.has(id));
    if (linked.length < 2) continue;
    elements.push({group: 'nodes', data: {id: nodeId.indicator(fingerprint), kind: 'indicator', label: g.label, indicatorKind: g.kind}});
    for (const id of linked) elements.push({group: 'edges', data: {id: `e|${id}|${fingerprint}`, source: nodeId.incident(id), target: nodeId.indicator(fingerprint), kind: 'shares'}});
  }
  return elements;
}

/** Hex values mirror the CSS tokens in style.css (Cytoscape cannot read CSS variables). */
export const GRAPH_COLORS = {
  ink: '#17171b', ink2: '#55555e', ink3: '#9a9aa2', line: '#d9d5cd', paper: '#f4f2ee', surface: '#ffffff',
  high: '#d6452b', medium: '#c98a1b', low: '#9a9aa2', live: '#2f5bd3',
};

export const graphStyle: StylesheetJson = [
  {selector: 'node', style: {
    'font-family': 'Inter, system-ui, sans-serif', 'font-size': 11, color: GRAPH_COLORS.ink2,
    'text-valign': 'bottom', 'text-margin-y': 6, 'text-wrap': 'wrap', 'text-max-width': '150px',
    'overlay-opacity': 0, 'underlay-opacity': 0, 'underlay-padding': 4, 'underlay-color': GRAPH_COLORS.high,
    'transition-property': 'border-width, border-color, width, height, underlay-opacity, underlay-padding', 'transition-duration': 150,
  }},
  {selector: 'node[kind = "campaign"]', style: {
    shape: 'ellipse', 'background-color': GRAPH_COLORS.surface, 'border-width': 1.5, 'border-color': GRAPH_COLORS.ink,
    width: 'mapData(weight, 1, 8, 34, 64)', height: 'mapData(weight, 1, 8, 34, 64)',
    label: 'data(label)', 'font-size': 12, 'font-weight': 600, color: GRAPH_COLORS.ink,
  }},
  {selector: 'node[kind = "incident"]', style: {
    width: 14, height: 14, 'background-color': GRAPH_COLORS.low, 'border-width': 0, label: '',
  }},
  {selector: 'node[kind = "incident"][risk = "high"]', style: {'background-color': GRAPH_COLORS.high}},
  {selector: 'node[kind = "incident"][risk = "medium"]', style: {'background-color': GRAPH_COLORS.medium}},
  {selector: 'node[kind = "incident"][risk = "pending"]', style: {'background-color': GRAPH_COLORS.live, label: 'data(label)', color: GRAPH_COLORS.live, 'font-weight': 600}},
  {selector: 'node[kind = "incident"][channel = "email"]', style: {shape: 'round-rectangle'}},
  {selector: 'node[kind = "incident"][channel = "call"]', style: {shape: 'diamond', width: 17, height: 17}},
  {selector: 'node[kind = "incident"][live = 1]', style: {'border-width': 3, 'border-color': GRAPH_COLORS.live}},
  {selector: 'node[kind = "incident"][protected = 1]', style: {'background-opacity': 0.35}},
  {selector: 'node[kind = "indicator"]', style: {
    shape: 'round-rectangle', width: 9, height: 9, 'background-color': GRAPH_COLORS.paper, 'border-width': 1, 'border-color': GRAPH_COLORS.ink3,
    label: 'data(label)', 'font-family': '"IBM Plex Mono", ui-monospace, monospace', 'font-size': 10, color: GRAPH_COLORS.ink3, 'text-wrap': 'ellipsis', 'text-max-width': '170px',
  }},
  {selector: 'edge', style: {width: 1, 'line-color': GRAPH_COLORS.line, 'curve-style': 'straight', 'overlay-opacity': 0}},
  {selector: 'edge[kind = "shares"]', style: {'line-style': 'dashed', 'line-dash-pattern': [3, 3]}},
  {selector: 'node:selected', style: {'border-width': 2.5, 'border-color': GRAPH_COLORS.ink, label: 'data(label)', color: GRAPH_COLORS.ink}},
  {selector: 'node[kind = "incident"][live = 1]:selected', style: {'border-color': GRAPH_COLORS.live, 'border-width': 3.5}},
  {selector: 'node.hover', style: {label: 'data(label)', color: GRAPH_COLORS.ink}},
  {selector: '.faded', style: {opacity: 0.18}},
  // Just-arrived report: a soft halo that fades out (class removed after a few seconds).
  {selector: 'node.fresh', style: {'underlay-opacity': 0.22, 'underlay-padding': 14, 'transition-duration': 900, label: 'data(label)', color: GRAPH_COLORS.ink}},
  {selector: 'node.fresh[risk = "pending"]', style: {'underlay-color': GRAPH_COLORS.live}},
];

/** Graph filter groups: texts include SMS and iMessage. */
export type ChannelFilter = 'all' | 'text' | 'email' | 'call';
export const CHANNEL_GROUP: Record<string, Exclude<ChannelFilter, 'all'>> = {sms: 'text', imessage: 'text', email: 'email', call: 'call'};
