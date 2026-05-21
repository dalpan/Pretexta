import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Pencil, Plus, Trash2, Save, Upload, CheckCircle2,
  MessageSquare, HelpCircle, FlagOff, ArrowRight, Info,
  Eye, ChevronRight, FileCode, AlertTriangle
} from 'lucide-react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import EmptyState from '../components/EmptyState';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const CHANNELS = [
  { value: 'email_inbox',   label: '📧 Email Inbox' },
  { value: 'chat',          label: '💬 Chat / WhatsApp' },
  { value: 'telephone',     label: '📞 Telepon' },
  { value: 'sms',           label: '📱 SMS' },
  { value: 'social_media',  label: '👥 Media Sosial' },
  { value: 'narrator',      label: '🎬 Narator (Konteks)' },
];

const CIALDINI = [
  { value: 'reciprocity',  label: 'Timbal Balik' },
  { value: 'scarcity',     label: 'Kelangkaan / Urgensi' },
  { value: 'authority',    label: 'Otoritas' },
  { value: 'commitment',   label: 'Komitmen' },
  { value: 'liking',       label: 'Rasa Suka / Kepercayaan' },
  { value: 'social_proof', label: 'Bukti Sosial' },
];

const NODE_TYPE_CONFIG = {
  message:  { icon: MessageSquare, label: 'Pesan',    color: 'text-blue-400',    desc: 'Pesan dari attacker kepada peserta' },
  question: { icon: HelpCircle,   label: 'Pertanyaan', color: 'text-yellow-400', desc: 'Pilihan keputusan untuk peserta' },
  end:      { icon: FlagOff,      label: 'Akhir',     color: 'text-primary',     desc: 'Akhir skenario (berhasil/gagal)' },
};

export default function ScenarioBuilderPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [current, setCurrent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [publishedId, setPublishedId] = useState(null);

  useEffect(() => { loadTemplates(); }, []);

  const loadTemplates = async () => {
    try {
      const res = await api.get('/scenario-builder/templates');
      setTemplates(res.data);
    } catch {}
    finally { setLoading(false); }
  };

  const createNew = async () => {
    try {
      const res = await api.post('/scenario-builder/templates', {
        title: 'Skenario Baru',
        description: '',
        nodes: [
          {
            id: 'start',
            type: 'message',
            channel: 'email_inbox',
            content_en: { subject: 'Judul Email', from: 'pengirim@contoh.com', body: 'Isi pesan attacker di sini...' },
            next: 'pilihan_1',
          },
          {
            id: 'pilihan_1',
            type: 'question',
            content_en: { text: 'Apa yang Anda lakukan?' },
            options: [
              { text: 'Klik tautan', next: 'akhir_gagal', score_impact: -20 },
              { text: 'Hapus email', next: 'akhir_berhasil', score_impact: +20 },
            ],
          },
          {
            id: 'akhir_berhasil',
            type: 'end',
            result: 'success',
            content_en: { title: 'Serangan Dicegah!', explanation: 'Anda berhasil mengidentifikasi serangan.' },
          },
          {
            id: 'akhir_gagal',
            type: 'end',
            result: 'failure',
            content_en: { title: 'Dikompromikan!', explanation: 'Anda terjebak dalam serangan ini.' },
          },
        ],
      });
      toast.success('Template skenario dibuat');
      await loadTemplates();
      // Select the newly created template
      const created = { id: res.data.id, title: 'Skenario Baru', description: '', difficulty: 'medium', cialdini_categories: [], is_published: false, is_draft: true,
        nodes: [
          { id: 'start', type: 'message', channel: 'email_inbox', content_en: { subject: 'Judul Email', from: 'pengirim@contoh.com', body: 'Isi pesan attacker...' }, next: 'pilihan_1' },
          { id: 'pilihan_1', type: 'question', content_en: { text: 'Apa yang Anda lakukan?' }, options: [{ text: 'Klik tautan', next: 'akhir_gagal', score_impact: -20 }, { text: 'Hapus email', next: 'akhir_berhasil', score_impact: +20 }] },
          { id: 'akhir_berhasil', type: 'end', result: 'success', content_en: { title: 'Berhasil!', explanation: '' } },
          { id: 'akhir_gagal', type: 'end', result: 'failure', content_en: { title: 'Gagal!', explanation: '' } },
        ]
      };
      setCurrent(created);
    } catch { toast.error(t('errors.generic')); }
  };

  const saveTemplate = async () => {
    if (!current) return;
    try {
      await api.put(`/scenario-builder/templates/${current.id}`, current);
      toast.success('Tersimpan!');
      await loadTemplates();
    } catch { toast.error(t('errors.generic')); }
  };

  const publishTemplate = async () => {
    if (!current) return;
    // Validation
    const hasStart = current.nodes?.some(n => n.id === 'start');
    const hasEnd = current.nodes?.some(n => n.type === 'end');
    if (!hasStart || !hasEnd) {
      toast.error('Skenario harus memiliki node "start" dan minimal satu node "end"');
      return;
    }
    if (!current.title || current.title === 'Skenario Baru') {
      toast.error('Beri judul yang deskriptif sebelum publish');
      return;
    }
    if (!window.confirm('Publish skenario ini? Akan tersedia di halaman Scenario untuk semua pengguna.')) return;
    try {
      const res = await api.post(`/scenario-builder/templates/${current.id}/publish`, {});
      setPublishedId(res.data.challenge_id);
      toast.success('Skenario berhasil dipublish dan tersedia di halaman Scenario!');
      await loadTemplates();
      // Update current to mark as published
      setCurrent(prev => prev ? { ...prev, is_published: true } : prev);
    } catch (err) {
      toast.error(err.response?.data?.detail || t('errors.generic'));
    }
  };

  const addNode = () => {
    if (!current) return;
    const id = `node_${Date.now()}`;
    setCurrent({
      ...current,
      nodes: [...current.nodes, {
        id,
        type: 'question',
        channel: 'email_inbox',
        content_en: { text: 'Pertanyaan baru...' },
        options: [
          { text: 'Pilihan benar', next: 'akhir_berhasil', score_impact: +20 },
          { text: 'Pilihan salah', next: 'akhir_gagal', score_impact: -20 },
        ],
      }],
    });
  };

  const updateNode = (idx, updates) => {
    const nodes = [...current.nodes];
    nodes[idx] = { ...nodes[idx], ...updates };
    setCurrent({ ...current, nodes });
  };

  const removeNode = (idx) => {
    const node = current.nodes[idx];
    if (['start', 'akhir_berhasil', 'akhir_gagal'].includes(node.id)) {
      toast.error('Node "start" dan "end" tidak dapat dihapus');
      return;
    }
    setCurrent({ ...current, nodes: current.nodes.filter((_, i) => i !== idx) });
  };

  const updateOption = (nodeIdx, optIdx, key, val) => {
    const nodes = [...current.nodes];
    const opts = [...(nodes[nodeIdx].options || [])];
    opts[optIdx] = { ...opts[optIdx], [key]: key === 'score_impact' ? parseInt(val) : val };
    nodes[nodeIdx] = { ...nodes[nodeIdx], options: opts };
    setCurrent({ ...current, nodes });
  };

  const allNodeIds = current?.nodes?.map(n => n.id) || [];

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      <PageHeader icon={Pencil} title={t('scenario_builder.title')} description="Buat skenario latihan rekayasa sosial kustom Anda sendiri">
        <Button onClick={createNew} className="text-xs uppercase tracking-widest">
          <Plus className="w-3.5 h-3.5 mr-2" /> Skenario Baru
        </Button>
      </PageHeader>

      {/* How it works */}
      <div className="p-4 border border-primary/15 bg-primary/3 space-y-2">
        <p className="text-[10px] font-mono text-primary uppercase tracking-widest font-bold flex items-center gap-2">
          <Info className="w-3.5 h-3.5" /> Cara Membuat Skenario
        </p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {[
            { n: '1', t: 'Buat Template', d: 'Klik "Skenario Baru"' },
            { n: '2', t: 'Edit Konten', d: 'Isi judul, deskripsi, dan node skenario' },
            { n: '3', t: 'Simpan', d: 'Klik Simpan untuk menyimpan draft' },
            { n: '4', t: 'Publish', d: 'Publish agar tersedia di halaman Scenario' },
          ].map(s => (
            <div key={s.n} className="flex items-start gap-2 text-[10px] font-mono">
              <span className="text-primary bg-primary/15 w-5 h-5 flex items-center justify-center flex-shrink-0 font-bold">{s.n}</span>
              <div>
                <p className="font-bold text-foreground">{s.t}</p>
                <p className="text-muted-foreground">{s.d}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Success after publish */}
      {publishedId && (
        <div className="p-4 border border-emerald-500/30 bg-emerald-500/5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-mono font-bold text-emerald-400">Skenario berhasil dipublish!</p>
              <p className="text-[10px] text-muted-foreground font-mono">Sekarang tersedia di halaman Scenario untuk semua pengguna</p>
            </div>
          </div>
          <Link to="/scenarios">
            <Button size="sm" variant="outline" className="text-[10px] uppercase tracking-widest border-emerald-500/30 text-emerald-400 flex-shrink-0">
              Lihat di Scenario <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Templates List */}
        <div className="space-y-2">
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Draf Saya ({templates.length})</p>
          {loading ? (
            <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-14 glass-panel animate-pulse" />)}</div>
          ) : templates.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-primary/20 cursor-pointer hover:border-primary/40" onClick={createNew}>
              <Pencil className="w-8 h-8 mx-auto mb-2 text-primary/30" />
              <p className="text-[10px] font-mono text-muted-foreground">Klik untuk membuat skenario pertama</p>
            </div>
          ) : (
            templates.map(tmpl => (
              <div
                key={tmpl.id}
                onClick={() => { setCurrent(tmpl); setPublishedId(null); }}
                className={`p-3 border cursor-pointer transition-all ${
                  current?.id === tmpl.id ? 'border-primary bg-primary/8 text-primary' : 'border-white/5 hover:border-primary/30 hover:bg-white/3'
                }`}
              >
                <p className="text-xs font-mono font-bold truncate">{tmpl.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[9px] font-mono text-muted-foreground">{tmpl.nodes?.length || 0} node</span>
                  <span className={`text-[9px] font-mono uppercase border px-1 ${
                    tmpl.is_published ? 'text-emerald-400 border-emerald-400/30' : 'text-yellow-400 border-yellow-400/30'
                  }`}>
                    {tmpl.is_published ? '✓ Published' : 'Draft'}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Editor */}
        <div className="lg:col-span-3">
          {!current ? (
            <EmptyState
              icon={Pencil}
              title="Pilih atau buat skenario"
              description="Pilih template dari daftar kiri, atau buat skenario baru untuk memulai."
              action={createNew}
              actionLabel="Buat Skenario Baru"
            />
          ) : (
            <div className="space-y-5">
              {/* Editor header */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-mono text-muted-foreground">Mengedit:</p>
                  <p className="text-xs font-mono font-bold text-primary truncate max-w-[200px]">{current.title}</p>
                  {current.is_published && (
                    <span className="text-[9px] font-mono text-emerald-400 border border-emerald-400/30 px-1.5 py-0.5">Published</span>
                  )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <Button size="sm" variant="outline" onClick={saveTemplate} className="text-[10px] uppercase tracking-widest">
                    <Save className="w-3 h-3 mr-1.5" /> Simpan
                  </Button>
                  <Button size="sm" onClick={publishTemplate} disabled={current.is_published}
                    className="text-[10px] uppercase tracking-widest"
                    title={current.is_published ? 'Sudah dipublish' : 'Publish ke halaman Scenario'}>
                    <Upload className="w-3 h-3 mr-1.5" />
                    {current.is_published ? 'Published ✓' : 'Publish'}
                  </Button>
                </div>
              </div>

              {/* Metadata */}
              <SectionCard title="Informasi Skenario">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="font-mono uppercase text-xs">Judul *</Label>
                    <Input value={current.title} onChange={e => setCurrent({ ...current, title: e.target.value })}
                      className="font-mono mt-1 text-sm" placeholder="Penipuan Transfer Dana Direktur" />
                  </div>
                  <div>
                    <Label className="font-mono uppercase text-xs">Tingkat Kesulitan</Label>
                    <Select value={current.difficulty} onValueChange={v => setCurrent({ ...current, difficulty: v })}>
                      <SelectTrigger className="font-mono text-xs mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="easy">Mudah</SelectItem>
                        <SelectItem value="medium">Sedang</SelectItem>
                        <SelectItem value="hard">Sulit</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="font-mono uppercase text-xs">Deskripsi</Label>
                  <textarea value={current.description} onChange={e => setCurrent({ ...current, description: e.target.value })}
                    className="w-full mt-1 bg-black/40 border border-input rounded-none px-3 py-2 text-sm font-mono text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary min-h-[60px]"
                    placeholder="Peserta akan menerima email dari 'Direktur' yang meminta transfer dana mendesak..." />
                </div>
                <div>
                  <Label className="font-mono uppercase text-xs">Prinsip Cialdini (pilih yang relevan)</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {CIALDINI.map(cat => (
                      <button key={cat.value} type="button"
                        onClick={() => {
                          const cats = current.cialdini_categories || [];
                          setCurrent({ ...current, cialdini_categories: cats.includes(cat.value) ? cats.filter(c => c !== cat.value) : [...cats, cat.value] });
                        }}
                        className={`px-2.5 py-1 text-[10px] font-mono border transition-all ${
                          (current.cialdini_categories || []).includes(cat.value)
                            ? 'border-primary bg-primary/15 text-primary' : 'border-white/10 text-muted-foreground hover:border-primary/30'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>
              </SectionCard>

              {/* Nodes */}
              <SectionCard
                title={`Node Skenario (${current.nodes?.length || 0})`}
                icon={MessageSquare}
                actions={
                  <Button size="sm" variant="outline" onClick={addNode} className="text-[10px] uppercase tracking-widest">
                    <Plus className="w-3 h-3 mr-1" /> Tambah Node
                  </Button>
                }
              >
                <div className="text-[10px] font-mono text-muted-foreground mb-3 p-2 bg-black/20 border border-white/5 leading-relaxed">
                  <strong className="text-foreground/60">Panduan Node:</strong> Mulai dari node <code>start</code> → sambungkan ke <code>pilihan_1</code> → arahkan ke <code>akhir_berhasil</code> atau <code>akhir_gagal</code>.
                  Gunakan field <strong>ID Node Berikutnya</strong> untuk menghubungkan antar node.
                </div>

                <div className="space-y-3">
                  {(current.nodes || []).map((node, idx) => {
                    const typeCfg = NODE_TYPE_CONFIG[node.type] || NODE_TYPE_CONFIG.message;
                    const Icon = typeCfg.icon;
                    const isProtected = idx < 1; // start node

                    return (
                      <div key={node.id || idx} className="border border-white/10 bg-black/20 overflow-hidden">
                        {/* Node header */}
                        <div className={`flex items-center justify-between px-3 py-2 border-b border-white/5 bg-black/20`}>
                          <div className="flex items-center gap-2">
                            <Icon className={`w-3.5 h-3.5 ${typeCfg.color}`} />
                            <code className={`text-[10px] font-mono font-bold ${typeCfg.color}`}>{node.id}</code>
                            <span className="text-[9px] text-muted-foreground border border-white/10 px-1">{typeCfg.label}</span>
                          </div>
                          {!isProtected && (
                            <button onClick={() => removeNode(idx)} className="text-muted-foreground hover:text-destructive transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        <div className="p-3 space-y-3">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="font-mono text-[9px] uppercase">Tipe Node</Label>
                              <Select value={node.type} onValueChange={v => updateNode(idx, { type: v })}>
                                <SelectTrigger className="font-mono text-[10px] mt-0.5 h-7">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {Object.entries(NODE_TYPE_CONFIG).map(([k, v]) => (
                                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label className="font-mono text-[9px] uppercase">Saluran</Label>
                              <Select value={node.channel || 'email_inbox'} onValueChange={v => updateNode(idx, { channel: v })}>
                                <SelectTrigger className="font-mono text-[10px] mt-0.5 h-7">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {CHANNELS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          {/* Content based on type */}
                          {node.type === 'message' && (
                            <div className="space-y-2">
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <Label className="font-mono text-[9px] uppercase">Pengirim (From)</Label>
                                  <Input value={node.content_en?.from || ''}
                                    onChange={e => updateNode(idx, { content_en: { ...node.content_en, from: e.target.value } })}
                                    className="font-mono text-[10px] mt-0.5 h-7" placeholder="direktur@bumn.go.id" />
                                </div>
                                <div>
                                  <Label className="font-mono text-[9px] uppercase">Subjek</Label>
                                  <Input value={node.content_en?.subject || ''}
                                    onChange={e => updateNode(idx, { content_en: { ...node.content_en, subject: e.target.value } })}
                                    className="font-mono text-[10px] mt-0.5 h-7" placeholder="URGENT: Transfer Dana" />
                                </div>
                              </div>
                              <div>
                                <Label className="font-mono text-[9px] uppercase">Isi Pesan</Label>
                                <textarea value={node.content_en?.body || node.content_en?.text || ''}
                                  onChange={e => updateNode(idx, { content_en: { ...node.content_en, body: e.target.value, text: e.target.value } })}
                                  className="w-full mt-0.5 bg-black/40 border border-white/10 px-2.5 py-1.5 text-[10px] font-mono text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                                  rows={3} placeholder="Isi pesan dari attacker..." />
                              </div>
                              <div>
                                <Label className="font-mono text-[9px] uppercase">ID Node Berikutnya</Label>
                                <Select value={node.next || ''} onValueChange={v => updateNode(idx, { next: v })}>
                                  <SelectTrigger className="font-mono text-[10px] mt-0.5 h-7">
                                    <SelectValue placeholder="Pilih node selanjutnya..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {allNodeIds.filter(id => id !== node.id).map(id => (
                                      <SelectItem key={id} value={id}>{id}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          )}

                          {node.type === 'question' && (
                            <div className="space-y-2">
                              <div>
                                <Label className="font-mono text-[9px] uppercase">Teks Pertanyaan</Label>
                                <Input value={node.content_en?.text || ''}
                                  onChange={e => updateNode(idx, { content_en: { ...node.content_en, text: e.target.value } })}
                                  className="font-mono text-[10px] mt-0.5 h-7" placeholder="Apa yang Anda lakukan?" />
                              </div>
                              <div className="space-y-2">
                                <Label className="font-mono text-[9px] uppercase">Pilihan Jawaban</Label>
                                {(node.options || []).map((opt, oi) => (
                                  <div key={oi} className="grid grid-cols-12 gap-1.5 items-center">
                                    <div className="col-span-5">
                                      <Input value={opt.text}
                                        onChange={e => updateOption(idx, oi, 'text', e.target.value)}
                                        className="font-mono text-[10px] h-7" placeholder={`Pilihan ${oi + 1}`} />
                                    </div>
                                    <div className="col-span-4">
                                      <Select value={opt.next || ''} onValueChange={v => updateOption(idx, oi, 'next', v)}>
                                        <SelectTrigger className="font-mono text-[10px] h-7">
                                          <SelectValue placeholder="→ node" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {allNodeIds.filter(id => id !== node.id).map(id => (
                                            <SelectItem key={id} value={id}>{id}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <div className="col-span-3">
                                      <Input type="number" value={opt.score_impact || 0}
                                        onChange={e => updateOption(idx, oi, 'score_impact', e.target.value)}
                                        className="font-mono text-[10px] h-7" placeholder="Skor" />
                                    </div>
                                  </div>
                                ))}
                                <Button size="sm" variant="ghost" onClick={() => {
                                  const opts = [...(node.options || []), { text: 'Pilihan baru', next: '', score_impact: 0 }];
                                  updateNode(idx, { options: opts });
                                }} className="text-[9px] h-6">+ Tambah pilihan</Button>
                              </div>
                            </div>
                          )}

                          {node.type === 'end' && (
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label className="font-mono text-[9px] uppercase">Hasil</Label>
                                <Select value={node.result || 'success'} onValueChange={v => updateNode(idx, { result: v })}>
                                  <SelectTrigger className="font-mono text-[10px] mt-0.5 h-7"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="success">✓ Berhasil Bertahan</SelectItem>
                                    <SelectItem value="failure">✗ Dikompromikan</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Label className="font-mono text-[9px] uppercase">Judul Akhir</Label>
                                <Input value={node.content_en?.title || ''}
                                  onChange={e => updateNode(idx, { content_en: { ...node.content_en, title: e.target.value } })}
                                  className="font-mono text-[10px] mt-0.5 h-7" placeholder="Serangan Dicegah!" />
                              </div>
                              <div className="col-span-2">
                                <Label className="font-mono text-[9px] uppercase">Penjelasan (debriefing)</Label>
                                <textarea value={node.content_en?.explanation || ''}
                                  onChange={e => updateNode(idx, { content_en: { ...node.content_en, explanation: e.target.value } })}
                                  className="w-full mt-0.5 bg-black/40 border border-white/10 px-2.5 py-1.5 text-[10px] font-mono resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                                  rows={2} placeholder="Penjelasan mengapa pilihan ini benar/salah..." />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </SectionCard>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
