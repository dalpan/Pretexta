import React, { useMemo, useState } from 'react';
import {
  Share2, ShieldAlert, Crosshair, Target, RefreshCw, Trash2, Database,
  Banknote, KeyRound, Server, Loader2, TriangleAlert, Lock,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import EmptyState from '../components/EmptyState';
import { Button } from '../components/ui/button';
import { useApi } from '../hooks/useApi';
import api from '../services/api';
import { toast } from 'sonner';

// Military-theme susceptibility palette (readable on the dark field background).
const BAND_COLOR = { low: '#6f8f3f', medium: '#d39a22', high: '#c0453f' };
const ASSET_COLOR = '#c99a3a';
const EDGE_COLOR = 'rgba(234,234,230,0.10)';
const PATH_COLOR = '#e0b84a';
const INTERNET_COLOR = '#8a94a0';

const ASSET_ICON = { money: Banknote, admin: KeyRound, data: Database, credentials: Lock };
const POSTURE_COLOR = {
  SECURE: '#6f8f3f', GUARDED: '#9fae3a', ELEVATED: '#d39a22', HIGH: '#d9772a', SEVERE: '#c0453f',
};

// ---- deterministic left→right layout: closer to a crown jewel = further right ----
function layout(nodes, edges) {
  const people = nodes.filter((n) => !n.is_asset);
  const assets = nodes.filter((n) => n.is_asset);
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));

  // distToAsset: min number of hops from a person until an asset is reached.
  const dist = {};
  const rev = {}; // reverse adjacency over people-only hops
  const queue = [];
  for (const e of edges) {
    const tgt = byId[e.target_id];
    if (!tgt) continue;
    if (tgt.is_asset) {
      if (dist[e.source_id] === undefined) { dist[e.source_id] = 1; queue.push(e.source_id); }
    } else {
      (rev[e.target_id] ||= []).push(e.source_id);
    }
  }
  while (queue.length) {
    const cur = queue.shift();
    for (const src of rev[cur] || []) {
      if (dist[src] === undefined) { dist[src] = dist[cur] + 1; queue.push(src); }
    }
  }
  const maxDist = Math.max(1, ...Object.values(dist).filter(Number.isFinite));

  // Column index: people by (maxDist - dist); unreachable people go leftmost.
  const cols = {};
  for (const p of people) {
    const d = dist[p.id];
    const col = Number.isFinite(d) ? maxDist - d : 0;
    (cols[col] ||= []).push(p);
  }
  const assetCol = maxDist; // assets sit to the right of the closest people
  cols[assetCol + 1] = assets;

  const COL_W = 230, ROW_H = 96, PAD_X = 150, PAD_Y = 70;
  const colKeys = Object.keys(cols).map(Number).sort((a, b) => a - b);
  const maxRows = Math.max(...colKeys.map((k) => cols[k].length), 1);
  const pos = {};
  for (const k of colKeys) {
    const group = cols[k].slice().sort((a, b) =>
      a.is_asset ? 0 : (b.susceptibility || 0) - (a.susceptibility || 0));
    const n = group.length;
    group.forEach((node, i) => {
      pos[node.id] = {
        x: PAD_X + k * COL_W,
        y: PAD_Y + (ROW_H * (maxRows - 1)) / 2 - (ROW_H * (n - 1)) / 2 + i * ROW_H,
      };
    });
  }
  const width = PAD_X * 2 + (colKeys[colKeys.length - 1]) * COL_W;
  const height = PAD_Y * 2 + (maxRows - 1) * ROW_H;
  const internet = { x: 40, y: PAD_Y + (ROW_H * (maxRows - 1)) / 2 };
  return { pos, width: Math.max(width, 600), height: Math.max(height, 300), internet };
}

function curve(a, b) {
  const mx = (a.x + b.x) / 2;
  return `M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`;
}

function GraphCanvas({ graph, selectedPath, onSelectNode }) {
  const { pos, width, height, internet } = useMemo(
    () => layout(graph.nodes, graph.edges), [graph]);

  // Node-ids and consecutive edges that belong to the highlighted attack path.
  const pathIds = new Set((selectedPath?.hops || []).map((h) => h.id));
  const pathEdges = new Set();
  const hops = selectedPath?.hops || [];
  for (let i = 0; i < hops.length - 1; i++) pathEdges.add(`${hops[i].id}->${hops[i + 1].id}`);
  const entryId = hops[0]?.id;

  return (
    <div className="overflow-auto border border-primary/15 bg-black/30" style={{ maxHeight: 560 }}>
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height}
        className="min-w-full" style={{ fontFamily: 'Oswald, monospace' }}>
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
            <path d="M0,0 L7,3 L0,6 Z" fill={EDGE_COLOR} />
          </marker>
          <marker id="arrowHot" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto">
            <path d="M0,0 L7,3 L0,6 Z" fill={PATH_COLOR} />
          </marker>
        </defs>

        {/* edges */}
        {graph.edges.map((e) => {
          const a = pos[e.source_id], b = pos[e.target_id];
          if (!a || !b) return null;
          const hot = pathEdges.has(`${e.source_id}->${e.target_id}`);
          return (
            <path key={e.id} d={curve(a, b)} fill="none"
              stroke={hot ? PATH_COLOR : EDGE_COLOR} strokeWidth={hot ? 2.5 : 1.25}
              markerEnd={hot ? 'url(#arrowHot)' : 'url(#arrow)'}
              strokeDasharray={hot ? '6 4' : undefined}
              style={hot ? { animation: 'dash 1s linear infinite' } : undefined} />
          );
        })}

        {/* internet entry edge for the selected path */}
        {entryId && pos[entryId] && (
          <path d={curve(internet, pos[entryId])} fill="none" stroke={PATH_COLOR}
            strokeWidth={2.5} strokeDasharray="6 4" markerEnd="url(#arrowHot)"
            style={{ animation: 'dash 1s linear infinite' }} />
        )}
        <g transform={`translate(${internet.x},${internet.y})`}>
          <circle r="16" fill="#1a1d17" stroke={INTERNET_COLOR} strokeWidth="1.5" />
          <Share2 x="-8" y="-8" width="16" height="16" color={INTERNET_COLOR} />
          <text y="34" textAnchor="middle" fontSize="11" fill={INTERNET_COLOR}
            style={{ textTransform: 'uppercase', letterSpacing: 1 }}>Attacker</text>
        </g>

        {/* nodes */}
        {graph.nodes.map((n) => {
          const p = pos[n.id];
          if (!p) return null;
          const onPath = pathIds.has(n.id);
          if (n.is_asset) {
            const AIcon = ASSET_ICON[n.asset_kind] || Target;
            return (
              <g key={n.id} transform={`translate(${p.x},${p.y})`}
                onClick={() => onSelectNode(n)} style={{ cursor: 'pointer' }}>
                <rect x="-26" y="-26" width="52" height="52" transform="rotate(45)"
                  fill="#241d10" stroke={onPath ? PATH_COLOR : ASSET_COLOR}
                  strokeWidth={onPath ? 3 : 1.75} />
                <AIcon x="-11" y="-11" width="22" height="22" color={ASSET_COLOR} />
                <text y="46" textAnchor="middle" fontSize="12.5" fill="#e4e4e0"
                  style={{ letterSpacing: 0.5 }}>{n.name}</text>
                <text y="62" textAnchor="middle" fontSize="10" fill={ASSET_COLOR}
                  style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                  {n.asset_kind} · crown jewel
                </text>
              </g>
            );
          }
          const color = BAND_COLOR[n.band] || BAND_COLOR.medium;
          return (
            <g key={n.id} transform={`translate(${p.x},${p.y})`}
              onClick={() => onSelectNode(n)} style={{ cursor: 'pointer' }}>
              {onPath && <circle r="30" fill="none" stroke={PATH_COLOR} strokeWidth="2" opacity="0.8" />}
              <circle r="24" fill={`${color}22`} stroke={color} strokeWidth="2" />
              <text y="-2" textAnchor="middle" fontSize="15" fontWeight="700" fill={color}>
                {Math.round(n.susceptibility)}
              </text>
              <text y="11" textAnchor="middle" fontSize="8" fill={color}
                style={{ letterSpacing: 0.5 }}>SUSC</text>
              <text y="42" textAnchor="middle" fontSize="12.5" fill="#e4e4e0"
                style={{ letterSpacing: 0.3 }}>{n.name}</text>
              <text y="57" textAnchor="middle" fontSize="10" fill="#9a9a94"
                style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>{n.role}</text>
            </g>
          );
        })}
      </svg>
      <style>{'@keyframes dash { to { stroke-dashoffset: -20; } }'}</style>
    </div>
  );
}

function pct(x) { return `${Math.round((x || 0) * 100)}%`; }

export default function AttackSurfaceMapPage() {
  const { data: graph, loading: gLoading, refetch: refetchGraph } = useApi('/attack-surface/graph');
  const { data: analysis, loading: aLoading, refetch: refetchAnalysis } =
    useApi('/attack-surface/analysis');
  const [selectedPath, setSelectedPath] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => { refetchGraph(); refetchAnalysis(); };

  const act = async (fn, msg) => {
    setBusy(true);
    try { await fn(); toast.success(msg); setSelectedPath(null); refresh(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Gagal'); }
    finally { setBusy(false); }
  };

  const nodes = graph?.nodes ?? [];
  const empty = !gLoading && nodes.length === 0;
  const posture = analysis?.posture;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader
        icon={Share2}
        title="Peta Permukaan Serangan"
        description="Jalur social engineering dari luar menuju aset kritis — BloodHound untuk manusia"
      >
        <Button variant="outline" size="sm" onClick={refresh} disabled={busy}
          className="text-[10px] uppercase tracking-widest">
          <RefreshCw className="w-3 h-3 mr-1" /> Segarkan
        </Button>
        {!empty && (
          <Button variant="outline" size="sm" disabled={busy}
            onClick={() => act(() => api.delete('/attack-surface/reset'), 'Peta dikosongkan')}
            className="text-[10px] uppercase tracking-widest text-red-400 border-red-400/30">
            <Trash2 className="w-3 h-3 mr-1" /> Reset
          </Button>
        )}
      </PageHeader>

      {/* privacy note (G13) */}
      <div className="flex items-start gap-2 p-3 border border-primary/15 bg-primary/3">
        <Lock className="w-3.5 h-3.5 text-primary/60 mt-0.5 flex-shrink-0" />
        <p className="text-[10px] text-muted-foreground font-mono leading-relaxed">
          Ini memetakan <span className="text-primary/80">risiko organisasi</span>, bukan daftar
          target individu. Hanya terlihat oleh staf (admin/pelatih) yang memegang remediasi.
          Susceptibility berasal dari hasil kampanye live & latihan lab yang sudah ada.
        </p>
      </div>

      {empty ? (
        <EmptyState
          icon={Share2}
          title="Peta masih kosong"
          description="Muat organisasi contoh untuk melihat bagaimana penyerang berpindah dari satu orang ke aset kritis — lalu ganti dengan org Anda."
          action={() => act(() => api.post('/attack-surface/seed-demo'), 'Organisasi contoh dimuat')}
          actionLabel={busy ? 'Memuat...' : 'Muat Organisasi Contoh'}
        />
      ) : (
        <>
          {/* posture banner */}
          {posture && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-4 border md:col-span-1"
                style={{ borderColor: `${POSTURE_COLOR[posture.label]}55` }}>
                <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground mb-1">
                  Kesiapan
                </p>
                <p className="text-2xl font-bold font-mono"
                  style={{ color: POSTURE_COLOR[posture.label] }}>
                  {posture.label}
                </p>
                <p className="text-[10px] font-mono text-muted-foreground">
                  DEFCON {posture.condition} · skor {posture.score}
                </p>
              </div>
              <Stat label="Personel" value={analysis.counts.people} icon={Target} />
              <Stat label="Aset Kritis" value={analysis.counts.assets} icon={Crosshair} />
              <Stat label="Relasi Percaya" value={analysis.counts.edges} icon={Share2} />
            </div>
          )}

          <div className="grid lg:grid-cols-3 gap-6">
            {/* graph */}
            <div className="lg:col-span-2 space-y-3">
              {gLoading ? (
                <div className="h-96 glass-panel animate-pulse" />
              ) : (
                <GraphCanvas graph={graph} selectedPath={selectedPath}
                  onSelectNode={setSelectedNode} />
              )}
              <Legend />
            </div>

            {/* side: paths + choke points + AAR */}
            <div className="space-y-5">
              <SectionCard title="Jalur Serangan" icon={Crosshair}>
                {aLoading ? <SkeletonRows /> : (
                  <div className="space-y-2">
                    {(analysis?.attack_paths || []).map((p) => {
                      const active = selectedPath?.asset_id === p.asset_id;
                      return (
                        <button key={p.asset_id}
                          onClick={() => setSelectedPath(active ? null : p)}
                          className={`w-full text-left p-2.5 border transition-all ${
                            active ? 'border-accent bg-accent/10' : 'border-white/5 hover:border-accent/40'
                          }`}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-mono font-bold truncate">{p.asset_name}</span>
                            <span className="text-[11px] font-mono font-bold"
                              style={{ color: PATH_COLOR }}>{pct(p.probability)}</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground font-mono mt-1 leading-relaxed">
                            {p.hops.filter((h) => !h.is_asset).map((h) => h.name).join(' → ')}
                          </p>
                        </button>
                      );
                    })}
                    {!analysis?.attack_paths?.length && (
                      <p className="text-[11px] text-muted-foreground font-mono">
                        Belum ada jalur. Tambahkan aset & relasi akses.
                      </p>
                    )}
                  </div>
                )}
              </SectionCard>

              <SectionCard title="Latih Lebih Dulu" icon={ShieldAlert}>
                {aLoading ? <SkeletonRows /> : (
                  <div className="space-y-2">
                    {(analysis?.choke_points || []).map((c, i) => (
                      <div key={c.node_id} className="flex items-center gap-3 p-2 border border-white/5">
                        <span className="text-xs font-mono font-bold text-muted-foreground w-4">
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-mono font-bold truncate">{c.name}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">{c.role}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <span className="text-[11px] font-mono font-bold px-1.5 py-0.5 border"
                            style={{ color: BAND_COLOR[c.band], borderColor: `${BAND_COLOR[c.band]}55` }}>
                            {Math.round(c.susceptibility)}
                          </span>
                          {c.risk_reduction > 0 && (
                            <p className="text-[9px] font-mono mt-0.5" style={{ color: PATH_COLOR }}>
                              −{Math.round(c.risk_reduction * 100)} risiko
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>

              <SectionCard title="After-Action" icon={TriangleAlert}>
                <ul className="space-y-2">
                  {(analysis?.after_action || []).map((note, i) => (
                    <li key={i} className="text-[11px] text-muted-foreground font-mono leading-relaxed
                      border-l-2 border-accent/40 pl-2.5">{note}</li>
                  ))}
                </ul>
              </SectionCard>
            </div>
          </div>
        </>
      )}

      {/* node detail popover */}
      {selectedNode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setSelectedNode(null)}>
          <div className="glass-panel p-5 max-w-sm w-full border border-primary/30"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              {selectedNode.is_asset
                ? <Server className="w-4 h-4 text-accent" />
                : <Target className="w-4 h-4" style={{ color: BAND_COLOR[selectedNode.band] }} />}
              <h3 className="font-mono font-bold text-sm">{selectedNode.name}</h3>
            </div>
            <p className="text-[11px] font-mono text-muted-foreground mb-3">
              {selectedNode.role}{selectedNode.department ? ` · ${selectedNode.department}` : ''}
            </p>
            {!selectedNode.is_asset && (
              <>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-mono text-muted-foreground">Susceptibility</span>
                  <span className="text-sm font-mono font-bold"
                    style={{ color: BAND_COLOR[selectedNode.band] }}>
                    {Math.round(selectedNode.susceptibility)} / 100 ({selectedNode.band})
                  </span>
                </div>
                <div className="text-[10px] font-mono text-muted-foreground">
                  <span className="uppercase tracking-widest text-primary/60">Dasar: </span>
                  {(selectedNode.evidence || ['—']).join(', ')}
                  {selectedNode.data_quality && ` · ${selectedNode.data_quality}`}
                </div>
              </>
            )}
            {selectedNode.is_asset && (
              <p className="text-[11px] font-mono text-accent uppercase tracking-widest">
                Crown jewel · {selectedNode.asset_kind}
              </p>
            )}
            <Button variant="outline" size="sm" className="mt-4 w-full text-[10px] uppercase tracking-widest"
              onClick={() => setSelectedNode(null)}>Tutup</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, icon: Icon }) {
  return (
    <div className="p-4 border border-primary/15">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3 h-3 text-primary/50" />
        <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">{label}</p>
      </div>
      <p className="text-2xl font-bold font-mono text-primary">{value}</p>
    </div>
  );
}

function Legend() {
  const items = [
    ['Rendah (tahan)', BAND_COLOR.low], ['Sedang', BAND_COLOR.medium],
    ['Tinggi (rentan)', BAND_COLOR.high], ['Aset kritis', ASSET_COLOR],
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-1">
      {items.map(([label, color]) => (
        <div key={label} className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wide">{label}</span>
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <span className="w-4 h-0.5" style={{ background: PATH_COLOR }} />
        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wide">Jalur terpilih</span>
      </div>
    </div>
  );
}

function SkeletonRows() {
  return <div className="space-y-2">{[1, 2, 3].map((i) =>
    <div key={i} className="h-10 bg-white/3 animate-pulse" />)}</div>;
}
