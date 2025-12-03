import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { Activity, TrendingUp, Calendar, Download, Eye, Filter, BarChart3, Trash2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import Pagination from '../components/Pagination';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function SimulationsPage() {
  const { t } = useTranslation();
  const [simulations, setSimulations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [filterType, setFilterType] = useState('all'); // all, simulation, quiz, scenario, ai_challenge
  const [selectedSimulation, setSelectedSimulation] = useState(null);
  const [showDetails, setShowDetails] = useState(false);

  const itemsPerPage = 10;

  useEffect(() => {
    loadSimulations();
  }, []);

  const loadSimulations = async () => {
    try {
      const token = localStorage.getItem('soceng_token');
      const response = await axios.get(`${API}/simulations`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // Ensure response is an array
      const data = Array.isArray(response.data) ? response.data : [];

      // Sort by date descending (newest first)
      const sorted = data.sort((a, b) => {
        const dateA = new Date(a.completed_at || a.created_at || 0);
        const dateB = new Date(b.completed_at || b.created_at || 0);
        return dateB - dateA;
      });

      console.log('✅ Loaded simulations:', sorted);
      setSimulations(sorted);
    } catch (error) {
      console.error('Failed to load simulations', error);
      toast.error('Failed to load simulations');
      setSimulations([]);
    } finally {
      setLoading(false);
    }
  };

  const downloadReport = async (simulationId) => {
    try {
      const token = localStorage.getItem('soceng_token');
      const response = await axios.get(`${API}/reports/${simulationId}/json`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const blob = new Blob([JSON.stringify(response.data, null, 2)], {
        type: 'application/json'
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `simulation_${simulationId}_${Date.now()}.json`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('Report downloaded');
    } catch (error) {
      console.error('Failed to download report', error);
      toast.error('Failed to download report');
    }
  };

  const deleteSimulation = async (simulationId, e) => {
    e.stopPropagation();
    
    if (window.confirm('Are you sure you want to delete this record?')) {
      try {
        const token = localStorage.getItem('soceng_token');
        
        // Try multiple endpoint variations for DELETE
        try {
          await axios.delete(`${API}/simulations/${simulationId}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
        } catch (deleteError) {
          // If DELETE doesn't work, try PUT with status deleted
          if (deleteError.response?.status === 405) {
            console.warn('DELETE not allowed, trying PUT instead');
            await axios.put(
              `${API}/simulations/${simulationId}`,
              { status: 'deleted' },
              { headers: { Authorization: `Bearer ${token}` } }
            );
          } else {
            throw deleteError;
          }
        }

        // Remove from local state
        setSimulations(simulations.filter(s => s.id !== simulationId));
        toast.success('Record deleted successfully');
      } catch (error) {
        console.error('Failed to delete simulation', error);
        toast.error(`Failed to delete: ${error.response?.statusText || error.message}`);
      }
    }
  };

  const getScoreBadgeColor = (score) => {
    if (typeof score !== 'number') return 'bg-gray-100 text-gray-200';
    if (score >= 80) return 'bg-green-100 text-green-800';
    if (score >= 60) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const getScoreBadgeIcon = (score) => {
    if (typeof score !== 'number') return '❓';
    if (score >= 80) return '🏆';
    if (score >= 60) return '✅';
    return '📚';
  };

  const getTypeIcon = (type) => {
    switch(type) {
      case 'ai_challenge':
        return '🤖';
      case 'simulation':
        return '🎮';
      case 'quiz':
        return '📝';
      case 'scenario':
        return '🎭';
      default:
        return '📊';
    }
  };

  const getTypeBadge = (type) => {
    switch(type) {
      case 'ai_challenge':
        return 'AI Challenge';
      case 'simulation':
        return 'Simulation';
      case 'quiz':
        return 'Quiz';
      case 'scenario':
        return 'Scenario';
      default:
        return 'Activity';
    }
  };

  const getCategoryLabel = (category) => {
    const labels = {
      phishing: '📧 Phishing',
      pretexting: '🎭 Pretexting',
      baiting: '🪤 Baiting',
      tailgating: '🚪 Tailgating',
      vishing: '☎️ Vishing',
      spear_phishing: '🎯 Spear Phishing',
      email_analysis: '📧 Email Analysis',
      comprehensive: '📋 Comprehensive'
    };
    return labels[category] || (category ? `📌 ${category}` : 'General');
  };

  const getFormattedDate = (dateString) => {
    try {
      if (!dateString) return 'Invalid Date';
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Invalid Date';
      return date.toLocaleString('id-ID', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      console.error('Date parse error:', dateString, error);
      return 'Invalid Date';
    }
  };

  const getTitle = (simulation) => {
    if (simulation.challenge_type) {
      const types = {
        comprehensive: '📋 Comprehensive Challenge',
        email_analysis: '📧 Email Analysis',
        interactive: '💬 Interactive Conversation',
        scenario: '🎭 Real-World Scenarios'
      };
      return types[simulation.challenge_type] || `${getTypeIcon(simulation.type)} Challenge`;
    }

    if (simulation.title) return simulation.title;
    if (simulation.name) return simulation.name;

    return `${getTypeIcon(simulation.type)} ${getTypeBadge(simulation.type)}`;
  };

  // Filter simulations
  const filteredSimulations = simulations.filter(sim => {
    if (filterType === 'all') return true;
    return sim.type === filterType;
  });

  const paginatedSimulations = filteredSimulations.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const totalPages = Math.ceil(filteredSimulations.length / itemsPerPage);

  // Calculate statistics
  const stats = {
    total: simulations.length,
    avgScore: simulations.length > 0 
      ? Math.round(simulations.reduce((sum, s) => sum + (s.score || 0), 0) / simulations.length)
      : 0,
    bestScore: simulations.length > 0 
      ? Math.max(...simulations.map(s => s.score || 0))
      : 0,
    challenges: simulations.filter(s => s.type === 'ai_challenge').length,
    quizzes: simulations.filter(s => s.type === 'quiz').length,
    scenarios: simulations.filter(s => s.type === 'scenario').length
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Activity className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">📊 Your History & Results</h1>
        <p className="text-gray-500">View all your simulations, quizzes, scenarios and AI challenges</p>
      </div>

      {/* Statistics Cards */}
      {simulations.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <Card className="p-4 bg-gradient-to-br from-blue-50 to-blue-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-100 font-medium">Total Sessions</p>
                <p className="text-3xl font-bold text-blue-600">{stats.total}</p>
              </div>
              <Activity className="w-8 h-8 text-blue-400 opacity-70" />
            </div>
          </Card>

          <Card className="p-4 bg-gradient-to-br from-purple-50 to-purple-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-100 font-medium">Average Score</p>
                <p className="text-3xl font-bold text-purple-600">{stats.avgScore}%</p>
              </div>
              <BarChart3 className="w-8 h-8 text-purple-400 opacity-70" />
            </div>
          </Card>

          <Card className="p-4 bg-gradient-to-br from-green-50 to-green-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-100 font-medium">Best Score</p>
                <p className="text-3xl font-bold text-green-600">{stats.bestScore}%</p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-400 opacity-70" />
            </div>
          </Card>

          <Card className="p-4 bg-gradient-to-br from-orange-50 to-orange-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-100 font-medium">🤖 Challenges</p>
                <p className="text-3xl font-bold text-orange-600">{stats.challenges}</p>
              </div>
              <span className="text-4xl">🤖</span>
            </div>
          </Card>

          <Card className="p-4 bg-gradient-to-br from-cyan-50 to-cyan-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-100 font-medium">📝 Quizzes</p>
                <p className="text-3xl font-bold text-cyan-600">{stats.quizzes}</p>
              </div>
              <span className="text-4xl">📝</span>
            </div>
          </Card>
        </div>
      )}

      {/* Filter Controls */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex gap-2 flex-wrap">
          <Button
            variant={filterType === 'all' ? 'default' : 'outline'}
            onClick={() => {
              setFilterType('all');
              setCurrentPage(1);
            }}
            className="flex items-center gap-2"
          >
            <Filter className="w-4 h-4" />
            All ({simulations.length})
          </Button>
          <Button
            variant={filterType === 'ai_challenge' ? 'default' : 'outline'}
            onClick={() => {
              setFilterType('ai_challenge');
              setCurrentPage(1);
            }}
            className="flex items-center gap-2"
          >
            🤖 AI Challenges ({stats.challenges})
          </Button>
          <Button
            variant={filterType === 'quiz' ? 'default' : 'outline'}
            onClick={() => {
              setFilterType('quiz');
              setCurrentPage(1);
            }}
            className="flex items-center gap-2"
          >
            📝 Quizzes ({stats.quizzes})
          </Button>
          <Button
            variant={filterType === 'scenario' ? 'default' : 'outline'}
            onClick={() => {
              setFilterType('scenario');
              setCurrentPage(1);
            }}
            className="flex items-center gap-2"
          >
            🎭 Scenarios ({stats.scenarios})
          </Button>
          <Button
            variant={filterType === 'simulation' ? 'default' : 'outline'}
            onClick={() => {
              setFilterType('simulation');
              setCurrentPage(1);
            }}
            className="flex items-center gap-2"
          >
            🎮 Simulations ({simulations.filter(s => s.type === 'simulation').length})
          </Button>
        </div>
      </div>

      {/* Main Content */}
      {filteredSimulations.length === 0 ? (
        <Card className="p-12 text-center bg-gradient-to-br from-gray-50 to-gray-100">
          <Activity className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <h3 className="text-xl font-semibold mb-2">No activities yet</h3>
          <p className="text-gray-100">
            Start a challenge, quiz, scenario or simulation to see your history here!
          </p>
        </Card>
      ) : (
        <>
          {/* Results List */}
          <div className="space-y-4">
            {paginatedSimulations.map((simulation) => {
              const isExpanded = selectedSimulation?.id === simulation.id && showDetails;
              const score = simulation.score || 0;

              return (
                <Card
                  key={simulation.id}
                  className="p-4 hover:shadow-lg transition-all cursor-pointer bg-gray border border-gray-200"
                  onClick={() => {
                    setSelectedSimulation(simulation);
                    setShowDetails(!isExpanded);
                  }}
                >
                  {/* Main Row */}
                  <div className="flex items-center justify-between gap-4">
                    {/* Left Side - Info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-2xl">{getTypeIcon(simulation.type)}</span>
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg text-gray-200">
                            {getTitle(simulation)}
                          </h3>
                          <div className="flex gap-2 mt-1 flex-wrap">
                            {simulation.category && (
                              <Badge variant="outline" className="text-xs">
                                {getCategoryLabel(simulation.category)}
                              </Badge>
                            )}
                            {simulation.difficulty && (
                              <Badge variant="outline" className="text-xs">
                                {simulation.difficulty}
                              </Badge>
                            )}
                            <Badge variant="outline" className="text-xs">
                              <Calendar className="w-3 h-3 mr-1" />
                              {getFormattedDate(simulation.completed_at || simulation.created_at)}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right Side - Score & Actions */}
                    <div className="flex items-center gap-4">
                      {/* Score Display */}
                      <div className="text-right min-w-[120px]">
                        <div className={`inline-block px-4 py-2 rounded-lg font-bold text-lg ${getScoreBadgeColor(score)}`}>
                          {getScoreBadgeIcon(score)} {score}%
                        </div>
                        {simulation.correct_answers !== undefined && simulation.total_questions && (
                          <p className="text-sm text-gray-100 mt-1">
                            {simulation.correct_answers}/{simulation.total_questions} correct
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadReport(simulation.id);
                          }}
                          className="flex items-center gap-1 whitespace-nowrap"
                          title="Download report"
                        >
                          <Download className="w-4 h-4" />
                          <span className="hidden sm:inline">Download</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedSimulation(simulation);
                            setShowDetails(!isExpanded);
                          }}
                          className="flex items-center gap-1 whitespace-nowrap"
                          title="View details"
                        >
                          <Eye className="w-4 h-4" />
                          <span className="hidden sm:inline">{isExpanded ? 'Hide' : 'View'}</span>
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={(e) => deleteSimulation(simulation.id, e)}
                          className="flex items-center gap-1 whitespace-nowrap"
                          title="Delete record"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span className="hidden sm:inline">Delete</span>
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="mt-6 pt-6 border-t border-gray-200 space-y-4">
                      {/* AI Challenge Details */}
                      {simulation.type === 'ai_challenge' && simulation.challenge_data && (
                        <div>
                          <h4 className="font-semibold mb-3 text-gray-200">Questions Summary</h4>
                          <div className="space-y-2 max-h-96 overflow-y-auto">
                            {simulation.challenge_data.questions && simulation.challenge_data.questions.map((q, idx) => {
                              const userAnswer = simulation.answers?.[q.id];
                              const isCorrect = userAnswer === q.correct_answer;

                              return (
                                <div
                                  key={q.id}
                                  className={`p-3 rounded border-l-4 ${
                                    isCorrect
                                      ? 'bg-green-50 border-green-500'
                                      : 'bg-red-50 border-red-500'
                                  }`}
                                >
                                  <div className="flex items-start gap-2">
                                    <span className="font-semibold text-gray-700 min-w-[24px]">
                                      {isCorrect ? '✅' : '❌'} {idx + 1}.
                                    </span>
                                    <div className="flex-1">
                                      <p className="font-medium text-gray-200">{q.question}</p>
                                      <p className="text-sm mt-1 text-gray-700">
                                        <span className={isCorrect ? 'text-green-700' : 'text-red-700'}>
                                          Your answer:
                                        </span>{' '}
                                        {userAnswer || '(not answered)'}
                                      </p>
                                      {!isCorrect && (
                                        <p className="text-sm text-red-700">
                                          Correct: {q.correct_answer}
                                        </p>
                                      )}
                                      {q.explanation && (
                                        <p className="text-xs text-gray-100 mt-2 pt-2 border-t border-gray-300">
                                          <span className="font-semibold">Explanation:</span> {q.explanation}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Quiz/Scenario Details */}
                      {(simulation.type === 'quiz' || simulation.type === 'scenario') && simulation.questions && (
                        <div>
                          <h4 className="font-semibold mb-3 text-gray-200">Questions Summary ({simulation.questions.length})</h4>
                          <div className="space-y-2 max-h-96 overflow-y-auto">
                            {simulation.questions.map((q, idx) => (
                              <div key={idx} className="p-3 rounded bg-gray-50 border border-gray-200">
                                <p className="font-medium text-gray-200">{idx + 1}. {q.question}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Simulation Events */}
                      {simulation.type === 'simulation' && simulation.events && simulation.events.length > 0 && (
                        <div>
                          <h4 className="font-semibold mb-3 text-gray-200">Event Timeline ({simulation.events.length} events)</h4>
                          <div className="space-y-2 max-h-96 overflow-y-auto">
                            {simulation.events.map((event, idx) => (
                              <div
                                key={idx}
                                className="p-3 rounded bg-gray-50 border-l-2 border-blue-500"
                              >
                                <div className="flex items-start justify-between">
                                  <div>
                                    <p className="font-medium text-sm text-gray-200">{event.action}</p>
                                    <p className="text-xs text-gray-100 mt-1">
                                      {event.node_id ? `Node: ${event.node_id}` : 'Event'}
                                    </p>
                                  </div>
                                  {event.score_impact !== undefined && (
                                    <span
                                      className={`text-xs font-semibold px-2 py-1 rounded whitespace-nowrap ${
                                        event.score_impact > 0
                                          ? 'bg-red-100 text-red-700'
                                          : 'bg-green-100 text-green-700'
                                      }`}
                                    >
                                      {event.score_impact > 0 ? '+' : ''}{event.score_impact}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Common Details */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-gray-200">
                        <div>
                          <p className="text-sm text-gray-100 font-medium">Type</p>
                          <p className="font-semibold text-gray-200">
                            {getTypeIcon(simulation.type)} {getTypeBadge(simulation.type)}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-100 font-medium">Status</p>
                          <Badge>{simulation.status || 'completed'}</Badge>
                        </div>
                        <div>
                          <p className="text-sm text-gray-100 font-medium">Date</p>
                          <p className="font-semibold text-sm text-gray-200">
                            {getFormattedDate(simulation.completed_at || simulation.created_at)}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-100 font-medium">Score</p>
                          <p className="font-semibold text-lg text-gray-200">{score}%</p>
                        </div>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-8 flex justify-center">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}