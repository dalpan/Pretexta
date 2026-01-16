import React, { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { ListChecks, Play, HelpCircle, Search, Filter, CheckCircle2 } from 'lucide-react'; // Added CheckCircle2
import { toast } from 'sonner';

import Pagination from '../components/Pagination';

// Import komponen UI yang diperlukan untuk filter dan pencarian
import { Input } from '../components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Checkbox } from '../components/ui/checkbox';
import { Label } from '../components/ui/label'; // Label, penting agar tidak blank lagi

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function QuizzesPage() {
  const { t } = useTranslation();
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [completedIds, setCompletedIds] = useState(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // State baru untuk fitur pencarian dan filtering
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDifficulty, setFilterDifficulty] = useState([]);
  const [filterCategory, setFilterCategory] = useState([]);

  // Daftar unik kategori dan kesulitan yang tersedia
  const allDifficulties = useMemo(() => ['easy', 'medium', 'hard'], []);
  const allCategories = useMemo(() => {
    const cats = new Set();
    quizzes.forEach(q => q.cialdini_categories?.forEach(cat => cats.add(cat)));
    return Array.from(cats).sort();
  }, [quizzes]);

  useEffect(() => {
    loadQuizzes();
  }, []);

  const loadQuizzes = async () => {
    try {
      const token = localStorage.getItem('soceng_token');
      const response = await axios.get(`${API}/quizzes`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setQuizzes(response.data);

      // Fetch history for completion status
      const historyRes = await axios.get(`${API}/simulations`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const completed = new Set(
        historyRes.data
          .filter(s => s.status === 'completed' && s.quiz_id)
          .map(s => s.quiz_id)
      );
      setCompletedIds(completed);

    } catch (error) {
      toast.error('Failed to load quizzes');
    } finally {
      setLoading(false);
    }
  };

  const startQuiz = (quizId) => {
    // Navigate directly to quiz player
    window.location.href = `/quizzes/${quizId}/play`;
  };

  const getDifficultyColor = (difficulty) => {
    switch (difficulty) {
      case 'easy': return 'bg-tertiary/20 text-tertiary';
      case 'medium': return 'bg-warning/20 text-warning';
      case 'hard': return 'bg-destructive/20 text-destructive';
      default: return 'bg-muted/20 text-muted-foreground';
    }
  };

  // Fungsi untuk memfilter dan mencari kuis (analog dengan ScenariosPage)
  const filteredQuizzes = useMemo(() => {
    setCurrentPage(1); // Reset halaman ke 1 setiap kali filter berubah

    return quizzes.filter(quiz => {
      const matchesSearch = searchTerm === '' ||
        quiz.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        quiz.description.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesDifficulty = filterDifficulty.length === 0 ||
        filterDifficulty.includes(quiz.difficulty);

      const matchesCategory = filterCategory.length === 0 ||
        filterCategory.some(cat => quiz.cialdini_categories?.includes(cat));

      return matchesSearch && matchesDifficulty && matchesCategory;
    });
  }, [quizzes, searchTerm, filterDifficulty, filterCategory]);

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
        <div className="text-primary font-mono animate-pulse">LOADING QUIZZES...</div>
      </div>
    );
  }

  const paginatedQuizzes = filteredQuizzes.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (

    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold font-mono uppercase tracking-widest text-primary">{t('quizzes.title')}</h1>
          <p className="text-muted-foreground mb-4">
            {t('quizzes.page_description')}
          </p>
        </div>
        <div className="flex space-x-3">
          <Badge variant="secondary" className="text-sm font-mono tracking-wider px-3 py-1">
            Quiz Total: {quizzes.length}
          </Badge>
        </div>
      </div>

      {/* --- PENCARIAN & FILTER --- */}
      <div className="flex space-x-4">
        {/* Form Pencarian */}
        <div className="relative flex-1">
          <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search by quiz title or description..."
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
            <h4 className="font-bold text-sm uppercase text-primary">Filter Kuis</h4>

            {/* Filter Kesulitan */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase">Kesulitan</p>
              {allDifficulties.map((d) => (
                <div key={d} className="flex items-center space-x-2">
                  <Checkbox
                    id={`difficulty-quiz-${d}`}
                    checked={filterDifficulty.includes(d)}
                    onCheckedChange={(checked) => handleDifficultyFilterChange(d, checked)}
                  />
                  <Label htmlFor={`difficulty-quiz-${d}`} className="text-sm capitalize">{d}</Label>
                </div>
              ))}
            </div>

            {/* Filter Kategori Cialdini */}
            <div className="space-y-2 pt-2 border-t border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase">Kategori Cialdini</p>
              <div className="max-h-40 overflow-y-auto space-y-2 pr-2">
                {allCategories.map((cat) => (
                  <div key={cat} className="flex items-center space-x-2">
                    <Checkbox
                      id={`category-quiz-${cat}`}
                      checked={filterCategory.includes(cat)}
                      onCheckedChange={(checked) => handleCategoryFilterChange(cat, checked)}
                    />
                    <Label htmlFor={`category-quiz-${cat}`} className="text-sm">{cat}</Label>
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
                Hapus Semua Filter
              </Button>
            )}
          </PopoverContent>
        </Popover>
      </div>
      {/* --------------------------- */}


      {filteredQuizzes.length === 0 ? ( // Menggunakan filteredQuizzes
        <div className="glass-panel p-12 text-center">
          <ListChecks className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground font-mono">
            {searchTerm || filterDifficulty.length > 0 || filterCategory.length > 0
              ? t('quizzes.no_results') // Tampilkan pesan 'Tidak ada hasil'
              : t('quizzes.no_quizzes')}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {paginatedQuizzes.map((quiz) => ( // Menggunakan paginatedQuizzes
              <div
                key={quiz.id}
                className="glass-panel p-6 hover:border-primary/30 transition-colors group"
                data-testid={`quiz-card-${quiz.id}`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-xl font-bold mb-2 group-hover:text-primary transition-colors flex items-center">
                      {quiz.title}
                      {completedIds.has(quiz.id) && (
                        <span className="ml-2 text-xs bg-green-500/10 text-green-500 px-2 py-0.5 rounded-full border border-green-500/20 flex items-center">
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Done
                        </span>
                      )}
                    </h3>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {quiz.description}
                    </p>
                  </div>
                  <ListChecks className="w-6 h-6 text-secondary" />
                </div>

                <div className="flex flex-wrap gap-2 mb-4">
                  <Badge className={getDifficultyColor(quiz.difficulty)}>
                    {quiz.difficulty.toUpperCase()}
                  </Badge>
                  {quiz.cialdini_categories?.map((cat) => (
                    <Badge key={cat} variant="outline" className="font-mono text-xs">
                      {cat}
                    </Badge>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-border">
                  <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                    <HelpCircle className="w-4 h-4" />
                    <span>{quiz.questions?.length || 0} questions</span>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => startQuiz(quiz.id)}
                    data-testid={`start-quiz-${quiz.id}`}
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
            totalPages={Math.ceil(filteredQuizzes.length / itemsPerPage)} // Menggunakan filteredQuizzes
            totalItems={filteredQuizzes.length} // Menggunakan filteredQuizzes
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
          />
        </>
      )}
    </div>
  );
}