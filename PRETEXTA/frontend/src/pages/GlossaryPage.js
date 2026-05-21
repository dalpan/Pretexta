import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BookOpen, Search, Shield, AlertTriangle, Brain, Plus, Edit2,
  Trash2, X, Save, Tag
} from 'lucide-react';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { toast } from 'sonner';

const CIALDINI_PRINCIPLES = [
  'reciprocity', 'scarcity', 'authority', 'commitment', 'liking', 'social_proof'
];
const CATEGORIES = ['Psychology', 'Attack Vector', 'Technology', 'Regulation', 'Konteks Indonesia', 'General'];
const CATEGORY_COLORS = {
  'Psychology':          'bg-purple-500',
  'Attack Vector':       'bg-red-500',
  'Technology':          'bg-blue-500',
  'Regulation':          'bg-yellow-500',
  'Konteks Indonesia':   'bg-emerald-500',
  'General':             'bg-primary/60',
};

function TermModal({ term = null, onClose, onSaved }) {
  const [form, setForm] = useState({
    term: term?.term || '',
    definition: term?.definition || '',
    category: term?.category || 'General',
    cialdini_principle: term?.cialdini_principle || '',
    example: term?.example || '',
    related_terms: (term?.related_terms || []).join(', '),
    tags: (term?.tags || []).join(', '),
  });
  const [loading, setLoading] = useState(false);
  const update = f => e => setForm(p => ({ ...p, [f]: typeof e === 'string' ? e : e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.term.trim() || !form.definition.trim()) {
      toast.error('Istilah dan definisi wajib diisi');
      return;
    }
    setLoading(true);
    try {
      const payload = {
        ...form,
        related_terms: form.related_terms ? form.related_terms.split(',').map(s => s.trim()).filter(Boolean) : [],
        tags: form.tags ? form.tags.split(',').map(s => s.trim()).filter(Boolean) : [],
        cialdini_principle: form.cialdini_principle || undefined,
      };
      if (term?.id) {
        await api.put(`/glossary/${term.id}`, payload);
        toast.success('Istilah diperbarui');
      } else {
        await api.post('/glossary', payload);
        toast.success('Istilah ditambahkan');
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menyimpan');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="glass-panel border border-primary/30 p-6 max-w-lg w-full space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-mono font-bold uppercase tracking-widest text-primary text-sm">
            {term ? 'Edit Istilah' : 'Tambah Istilah Baru'}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-primary"><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="font-mono uppercase text-xs">Istilah *</Label>
              <Input value={form.term} onChange={update('term')} className="font-mono mt-1 text-sm" placeholder="Phishing" required />
            </div>
            <div>
              <Label className="font-mono uppercase text-xs">Kategori</Label>
              <Select value={form.category} onValueChange={update('category')}>
                <SelectTrigger className="font-mono text-xs mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="font-mono uppercase text-xs">Definisi *</Label>
            <textarea
              value={form.definition}
              onChange={update('definition')}
              className="w-full mt-1 font-mono text-xs bg-black/40 border border-input rounded-none px-3 py-2 text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              rows={3}
              placeholder="Penjelasan lengkap istilah..."
              required
            />
          </div>

          <div>
            <Label className="font-mono uppercase text-xs">Contoh Serangan</Label>
            <textarea
              value={form.example}
              onChange={update('example')}
              className="w-full mt-1 font-mono text-xs bg-black/40 border border-input rounded-none px-3 py-2 text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              rows={2}
              placeholder="Contoh nyata penggunaan teknik ini..."
            />
          </div>

          <div>
            <Label className="font-mono uppercase text-xs">Prinsip Cialdini Terkait</Label>
            <Select value={form.cialdini_principle || '__none__'} onValueChange={v => update('cialdini_principle')(v === '__none__' ? '' : v)}>
              <SelectTrigger className="font-mono text-xs mt-1"><SelectValue placeholder="Tidak ada" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Tidak ada</SelectItem>
                {CIALDINI_PRINCIPLES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="font-mono uppercase text-xs">Istilah Terkait (pisahkan dengan koma)</Label>
            <Input value={form.related_terms} onChange={update('related_terms')} className="font-mono mt-1 text-xs" placeholder="Spear Phishing, Vishing, BEC" />
          </div>

          <div>
            <Label className="font-mono uppercase text-xs">Tags (pisahkan dengan koma)</Label>
            <Input value={form.tags} onChange={update('tags')} className="font-mono mt-1 text-xs" placeholder="email, indonesia, attack" />
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={loading} className="flex-1 text-xs uppercase tracking-widest">
              <Save className="w-3.5 h-3.5 mr-2" />{loading ? 'Menyimpan...' : 'Simpan'}
            </Button>
            <Button type="button" variant="outline" onClick={onClose} className="text-xs uppercase tracking-widest">Batal</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TermCard({ term, canEdit, onEdit, onDelete }) {
  const barColor = CATEGORY_COLORS[term.category] || 'bg-primary/60';
  return (
    <Card className="glass-panel overflow-hidden border transition-all hover:border-primary/40 hover:shadow-lg group">
      <div className={`h-1.5 w-full ${barColor}`} />
      <div className="p-5">
        <div className="flex justify-between items-start mb-3">
          <h3 className="text-base font-bold font-mono group-hover:text-primary transition-colors">{term.term}</h3>
          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
            <Badge variant="secondary" className="text-[10px] font-mono">{term.category}</Badge>
            {canEdit && (
              <>
                <button onClick={() => onEdit(term)} className="p-1 text-muted-foreground hover:text-primary transition-colors">
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => onDelete(term)} className="p-1 text-muted-foreground hover:text-destructive transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>

        {term.cialdini_principle && (
          <span className="inline-block text-[9px] font-mono border border-primary/30 text-primary/70 px-1.5 py-0.5 uppercase tracking-widest mb-2">
            {term.cialdini_principle}
          </span>
        )}

        <p className="text-xs text-muted-foreground leading-relaxed mb-3">{term.definition}</p>

        {term.example && (
          <div className="flex items-start gap-2 text-xs mb-2">
            <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 mt-0.5 shrink-0" />
            <div>
              <span className="font-bold text-yellow-400 font-mono">Contoh: </span>
              <span className="text-foreground/70">{term.example}</span>
            </div>
          </div>
        )}

        {term.related_terms?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-white/5">
            {term.related_terms.map(rt => (
              <span key={rt} className="text-[9px] font-mono border border-white/10 text-muted-foreground px-1.5 py-0.5">{rt}</span>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

export default function GlossaryPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canEdit = user?.role === 'admin' || user?.role === 'trainer';
  const canDelete = user?.role === 'admin';

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [refreshKey, setRefreshKey] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [editingTerm, setEditingTerm] = useState(null);

  const endpoint = `/glossary?${search ? `search=${encodeURIComponent(search)}&` : ''}${selectedCategory !== 'all' ? `category=${encodeURIComponent(selectedCategory)}` : ''}`;
  const { data: termsRaw, loading } = useApi(endpoint, { deps: [search, selectedCategory, refreshKey] });
  const { data: categoriesRaw } = useApi('/glossary/categories', { deps: [refreshKey] });

  const terms = termsRaw ?? [];
  const categories = ['all', ...(categoriesRaw ?? [])];

  const handleDelete = async (term) => {
    if (!window.confirm(`Hapus istilah "${term.term}"?`)) return;
    try {
      await api.delete(`/glossary/${term.id}`);
      toast.success('Istilah dihapus');
      setRefreshKey(k => k + 1);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menghapus');
    }
  };

  const openEdit = (term) => {
    setEditingTerm(term);
    setShowModal(true);
  };

  const openAdd = () => {
    setEditingTerm(null);
    setShowModal(true);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-700">
      <PageHeader
        icon={BookOpen}
        title={t('glossary.title')}
        description={t('glossary.page_description')}
      >
        {canEdit && (
          <Button size="sm" onClick={openAdd} className="text-xs uppercase tracking-widest">
            <Plus className="w-3.5 h-3.5 mr-2" /> Tambah Istilah
          </Button>
        )}
      </PageHeader>

      {/* Controls */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cari istilah atau definisi..."
            className="pl-9 font-mono text-sm"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1 flex-shrink-0">
          {categories.map(cat => (
            <Button
              key={cat}
              variant={selectedCategory === cat ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setSelectedCategory(cat)}
              className="whitespace-nowrap text-[10px] uppercase tracking-widest"
            >
              {cat === 'all' ? 'Semua' : cat}
            </Button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
        {terms.length} istilah{search || selectedCategory !== 'all' ? ' ditemukan' : ' dalam glosarium'}
      </p>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-40 glass-panel animate-pulse" />)}
        </div>
      ) : terms.length === 0 ? (
        <EmptyState
          icon={Brain}
          title="Tidak ada istilah ditemukan"
          description={canEdit ? 'Tambahkan istilah pertama dengan tombol di atas.' : 'Belum ada istilah dalam glosarium.'}
          action={canEdit ? openAdd : undefined}
          actionLabel={canEdit ? 'Tambah Istilah' : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {terms.map(term => (
            <TermCard
              key={term.id}
              term={term}
              canEdit={canEdit}
              onEdit={openEdit}
              onDelete={canDelete ? handleDelete : null}
            />
          ))}
        </div>
      )}

      {showModal && (
        <TermModal
          term={editingTerm}
          onClose={() => setShowModal(false)}
          onSaved={() => setRefreshKey(k => k + 1)}
        />
      )}
    </div>
  );
}
