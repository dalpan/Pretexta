import React, { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';

import { FileCode, Clock, Target, Play, Search, Filter, Info, CheckCircle2 } from 'lucide-react'; // Added CheckCircle2
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

import Pagination from '../components/Pagination';
import { Input } from '../components/ui/input'; // Import Input untuk form pencarian
import { Label } from '../components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover'; // Import Popover untuk filter
import { Checkbox } from '../components/ui/checkbox'; // Import Checkbox untuk filter

export default function ScenariosPage() {
  const { t } = useTranslation();
  const [challenges, setChallenges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [completedIds, setCompletedIds] = useState(new Set()); // Track completed challenges
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // State baru untuk fitur pencarian dan filtering
  const [activeTab, setActiveTab] = useState('training'); // 'training' | 'professional'
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDifficulty, setFilterDifficulty] = useState([]);
  const [filterCategory, setFilterCategory] = useState([]);

  // Daftar unik kategori dan kesulitan yang tersedia
  const allDifficulties = useMemo(() => ['easy', 'medium', 'hard'], []);
  const allCategories = useMemo(() => {
    const cats = new Set();
    challenges.forEach(c => c.cialdini_categories?.forEach(cat => cats.add(cat)));
    return Array.from(cats).sort();
  }, [challenges]);

  // Statistik Tambahan
  const totalNodes = useMemo(() => {
    return challenges.reduce((sum, challenge) => sum + (challenge.nodes?.length || 0), 0);
  }, [challenges]);


  useEffect(() => {
    loadChallenges();
  }, []);

  const loadChallenges = async () => {
    try {
      const token = localStorage.getItem('soceng_token');
      const response = await axios.get(`${API}/challenges`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setChallenges(response.data);

      // Fetch history to mark completed
      const historyRes = await axios.get(`${API}/simulations`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const completed = new Set(
        historyRes.data
          .filter(s => s.status === 'completed' && s.challenge_id)
          .map(s => s.challenge_id)
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
      const token = localStorage.getItem('soceng_token');
      const response = await axios.post(`${API}/simulations`, {
        challenge_id: challengeId,
        title: challenges.find(c => c.id === challengeId)?.title, // Pass title for logs
        simulation_type: 'simulation',
        status: 'running'
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // Navigate to simulation player
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
        <div className="text-primary font-mono animate-pulse">LOADING CHALLENGES...</div>
      </div>
    );
  }

  const paginatedChallenges = filteredChallenges.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold font-mono uppercase tracking-widest text-primary">{t('scenarios.title')}</h1>
          <p className="text-muted-foreground mb-4">
            {t('scenarios.page_description')}
          </p>
          {/* Tambahkan Badge Statistik */}
          <div className="flex space-x-3">
            <Badge variant="secondary" className="text-sm font-mono tracking-wider px-3 py-1">
              Scenario Total: {challenges.length}
            </Badge>
          </div>
        </div>
      </div>

      {/* --- TABS NAVIGATION --- */}
      <div className="flex space-x-4 border-b border-border mb-6">
        <button
          className={`pb-2 px-4 font-medium transition-colors border-b-2 ${activeTab === 'training'
            ? 'border-primary text-primary'
            : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          onClick={() => setActiveTab('training')}
        >
          Training Modules
        </button>
        <button
          className={`pb-2 px-4 font-medium transition-colors border-b-2 ${activeTab === 'professional'
            ? 'border-primary text-primary'
            : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          onClick={() => setActiveTab('professional')}
        >
          Professional Scenarios 🛡️
        </button>
      </div>

      {/* --- PENCARIAN & FILTER --- */}
      <div className="flex space-x-4">
        {/* Form Pencarian */}
        <div className="relative flex-1">
          <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search by title or description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 font-mono"
            data-testid="search-input"
          />
        </div>

        {/* Filter Popover */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="flex items-center space-x-2">
              <Filter className="w-4 h-4" />
              <span>Filter ({filterDifficulty.length + filterCategory.length})</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-4 space-y-4">
            <h4 className="font-bold text-sm uppercase text-primary">Filter Scenario</h4>

            {/* Filter Kesulitan */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase">Kesulitan</p>
              {allDifficulties.map((d) => (
                <div key={d} className="flex items-center space-x-2">
                  <Checkbox
                    id={`difficulty-${d}`}
                    checked={filterDifficulty.includes(d)}
                    onCheckedChange={(checked) => handleDifficultyFilterChange(d, checked)}
                  />
                  <Label htmlFor={`difficulty-${d}`} className="text-sm capitalize">{d}</Label>
                </div>
              ))}
            </div>

            {/* Filter Kategori Cialdini */}
            <div className="space-y-2 pt-2 border-t border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase">Category Cialdini</p>
              <div className="max-h-40 overflow-y-auto space-y-2 pr-2">
                {allCategories.map((cat) => (
                  <div key={cat} className="flex items-center space-x-2">
                    <Checkbox
                      id={`category-${cat}`}
                      checked={filterCategory.includes(cat)}
                      onCheckedChange={(checked) => handleCategoryFilterChange(cat, checked)}
                    />
                    <Label htmlFor={`category-${cat}`} className="text-sm">{cat}</Label>
                  </div>
                ))}
              </div>
            </div>

            {(filterDifficulty.length > 0 || filterCategory.length > 0) && (
              <Button
                variant="ghost"
                onClick={() => { setFilterDifficulty([]); setFilterCategory([]); }}
                className="w-full text-xs text-destructive hover:text-destructive"
              >
                Delete Filter
              </Button>
            )}
          </PopoverContent>
        </Popover>
      </div>
      {/* --------------------------- */}


      {filteredChallenges.length === 0 ? (
        <div className="glass-panel p-12 text-center">
          <FileCode className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground font-mono">
            {searchTerm || filterDifficulty.length > 0 || filterCategory.length > 0
              ? t('scenarios.no_results') // Tampilkan pesan 'Tidak ada hasil' jika ada filter
              : t('scenarios.no_challenges')}
          </p>
        </div>
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
                        <span className="ml-2 text-xs bg-green-500/10 text-green-500 px-2 py-0.5 rounded-full border border-green-500/20 flex items-center">
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Done
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
                      <span>{challenge.nodes?.length || 0} nodes</span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => startChallenge(challenge.id)}
                    data-testid={`start-challenge-${challenge.id}`}
                  >
                    <Play className="w-4 h-4 mr-2" />
                    START
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