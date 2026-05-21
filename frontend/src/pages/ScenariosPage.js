import React, { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { FileCode, Clock, Target, Play, Search, Filter, CheckCircle2, Info } from 'lucide-react';
import { toast } from 'sonner';
import Pagination from '../components/Pagination';
import api from '../services/api';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Checkbox } from '../components/ui/checkbox';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';

export default function ScenariosPage() {
  const { t } = useTranslation();
  const [challenges, setChallenges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [completedIds, setCompletedIds] = useState(new Set()); // Track completed challenges
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [activeTab, setActiveTab] = useState('training');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDifficulty, setFilterDifficulty] = useState([]);
  const [filterCategory, setFilterCategory] = useState([]);

  const allDifficulties = useMemo(() => ['easy', 'medium', 'hard'], []);
  const allCategories = useMemo(() => {
    const cats = new Set();
    challenges.forEach(c => c.cialdini_categories?.forEach(cat => cats.add(cat)));
    return Array.from(cats).sort();
  }, [challenges]);


  useEffect(() => {
    loadChallenges();
  }, []);

  const loadChallenges = async () => {
    try {
      const [challengesRes, historyRes] = await Promise.all([
        api.get('/challenges/all'),  // returns flat array, no pagination
        api.get('/simulations'),
      ]);
      setChallenges(Array.isArray(challengesRes.data) ? challengesRes.data : []);
      const completed = new Set(
        historyRes.data
          .filter((s) => s.status === 'completed' && s.challenge_id)
          .map((s) => s.challenge_id)
      );
      setCompletedIds(completed);
    } catch (error) {
      toast.error('Failed to load challenges');
    } finally {
      setLoading(false);
    }
  };

  const startChallenge = async (challengeId) => {
    try {
      const response = await api.post('/simulations', {
        challenge_id: challengeId,
        title: challenges.find((c) => c.id === challengeId)?.title,
        simulation_type: 'simulation',
        status: 'running',
      });
      window.location.href = `/simulations/${response.data.id}/play`;
    } catch (error) {
      toast.error('Failed to start challenge');
    }
  };

  const getDifficultyColor = (difficulty) => {
    switch (difficulty) {
      case 'easy': return 'bg-tertiary/20 text-tertiary';
      case 'medium': return 'bg-warning/20 text-warning';
      case 'hard': return 'bg-destructive/20 text-destructive';
      default: return 'bg-muted/20 text-muted-foreground';
    }
  };

  // Fungsi untuk memfilter dan mencari tantangan
  const filteredChallenges = useMemo(() => {
    setCurrentPage(1); // Reset halaman ke 1 setiap kali filter berubah

    return challenges.filter(challenge => {
      // Tab Filtering
      const isProfessional = challenge.metadata?.type === 'professional' || challenge.metadata?.tags?.includes('professional');
      if (activeTab === 'training' && isProfessional) return false;
      if (activeTab === 'professional' && !isProfessional) return false;

      const matchesSearch = searchTerm === '' ||
        challenge.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        challenge.description.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesDifficulty = filterDifficulty.length === 0 ||
        filterDifficulty.includes(challenge.difficulty);

      const matchesCategory = filterCategory.length === 0 ||
        filterCategory.some(cat => challenge.cialdini_categories?.includes(cat));

      return matchesSearch && matchesDifficulty && matchesCategory;
    });
  }, [challenges, searchTerm, filterDifficulty, filterCategory, activeTab]);

  const handleDifficultyFilterChange = (difficulty, checked) => {
    setFilterDifficulty(prev =>
      checked ? [...prev, difficulty] : prev.filter(d => d !== difficulty)
    );
  };

  const handleCategoryFilterChange = (category, checked) => {
    setFilterCategory(prev =>
      checked ? [...prev, category] : prev.filter(c => c !== category)
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-primary font-mono animate-pulse">{t('common.loading')}</div>
      </div>
    );
  }

  const paginatedChallenges = filteredChallenges.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      <PageHeader
        icon={FileCode}
        title={t('scenarios.title')}
        description={t('scenarios.page_description')}
      >
        <Badge variant="secondary" className="font-mono text-xs tracking-wider">
          {challenges.length} {t('scenarios.title').toLowerCase()}
        </Badge>
      </PageHeader>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-primary/10 pb-1">
        {[['training', 'Training Modules'], ['professional', 'Professional']].map(([key, label]) => (
          <button
            key={key}
            className={`px-4 py-2 text-xs font-mono font-semibold uppercase tracking-widest transition-colors border-b-2 -mb-px ${
              activeTab === key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Search & Filter */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder={t('scenarios.search_placeholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 font-mono text-sm"
            data-testid="search-input"
          />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2 font-mono text-xs uppercase tracking-widest">
              <Filter className="w-3 h-3" />
              {t('common.filter')}
              {(filterDifficulty.length + filterCategory.length) > 0 && (
                <span className="bg-primary text-primary-foreground text-[10px] px-1 rounded-full">
                  {filterDifficulty.length + filterCategory.length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-4 space-y-4">
            <h4 className="font-mono font-bold text-xs uppercase tracking-widest text-primary">{t('common.filter')}</h4>
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">{t('scenarios.difficulty')}</p>
              {allDifficulties.map((d) => (
                <div key={d} className="flex items-center gap-2">
                  <Checkbox id={`diff-${d}`} checked={filterDifficulty.includes(d)} onCheckedChange={(c) => handleDifficultyFilterChange(d, c)} />
                  <Label htmlFor={`diff-${d}`} className="text-sm capitalize font-mono">{t(`scenarios.${d}`, d)}</Label>
                </div>
              ))}
            </div>
            {allCategories.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-white/5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">{t('scenarios.cialdini_principle')}</p>
                <div className="max-h-36 overflow-y-auto space-y-2 pr-1">
                  {allCategories.map((cat) => (
                    <div key={cat} className="flex items-center gap-2">
                      <Checkbox id={`cat-${cat}`} checked={filterCategory.includes(cat)} onCheckedChange={(c) => handleCategoryFilterChange(cat, c)} />
                      <Label htmlFor={`cat-${cat}`} className="text-xs font-mono">{cat}</Label>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {(filterDifficulty.length > 0 || filterCategory.length > 0) && (
              <Button variant="ghost" size="sm" onClick={() => { setFilterDifficulty([]); setFilterCategory([]); }} className="w-full text-xs text-destructive hover:text-destructive">
                {t('common.cancel')} {t('common.filter')}
              </Button>
            )}
          </PopoverContent>
        </Popover>
      </div>

      {filteredChallenges.length === 0 ? (
        <EmptyState
          icon={FileCode}
          title={searchTerm || filterDifficulty.length > 0 || filterCategory.length > 0 ? t('scenarios.no_results') : t('scenarios.no_challenges')}
          description={t('scenarios.no_challenges')}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {paginatedChallenges.map((challenge) => (
              <div
                key={challenge.id}
                className="glass-panel p-6 hover:border-primary/30 transition-colors group"
                data-testid={`challenge-card-${challenge.id}`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-xl font-bold mb-2 group-hover:text-primary transition-colors flex items-center">
                      {challenge.title}
                      {completedIds.has(challenge.id) && (
                        <span className="ml-2 text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 border border-emerald-500/20 flex items-center font-mono">
                          <CheckCircle2 className="w-3 h-3 mr-1" /> {t('simulation.status_completed')}
                        </span>
                      )}
                    </h3>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {challenge.description}
                    </p>
                  </div>
                  <FileCode className="w-6 h-6 text-primary" />
                </div>

                <div className="flex flex-wrap gap-2 mb-4">
                  <Badge className={getDifficultyColor(challenge.difficulty)}>
                    {challenge.difficulty.toUpperCase()}
                  </Badge>
                  {challenge.cialdini_categories?.map((cat) => (
                    <Badge key={cat} variant="outline" className="font-mono text-xs">
                      {cat}
                    </Badge>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-border">
                  <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                    <div className="flex items-center space-x-1">
                      <Clock className="w-4 h-4" />
                      <span>{challenge.estimated_time} min</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Target className="w-4 h-4" />
                      <span>{challenge.node_count ?? challenge.nodes?.length ?? 0} {t('scenarios.nodes')}</span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => startChallenge(challenge.id)}
                    data-testid={`start-challenge-${challenge.id}`}
                    className="text-xs uppercase tracking-widest"
                  >
                    <Play className="w-3 h-3 mr-2" />
                    {t('scenarios.start')}
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <Pagination
            currentPage={currentPage}
            totalPages={Math.ceil(filteredChallenges.length / itemsPerPage)}
            totalItems={filteredChallenges.length}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
          />

          {/* FOOTER DESKRIPSI DAN NOTE PENTING */}
          <div className="flex items-start p-4 space-x-3 bg-primary/10 border-l-4 border-primary rounded-r-lg">
            <Info className="w-5 h-5 mt-1 text-primary flex-shrink-0" />
            <div className="text-sm">
              <p className="font-bold mb-1">{t('scenarios.note_title')}</p>
              <p className="text-muted-foreground">
                {t('scenarios.note_content_1')}
              </p>
              <p className="text-muted-foreground mt-1">
                {t('scenarios.note_content_2')}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}