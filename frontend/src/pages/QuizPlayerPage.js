import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, Clock, Award } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function QuizPlayerPage() {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [quiz, setQuiz] = useState(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [showResults, setShowResults] = useState(false);
  const [score, setScore] = useState(0);
  const [loading, setLoading] = useState(true);
  const [language, setLanguage] = useState('en');
  const [startTime, setStartTime] = useState(null);

  const [endTime, setEndTime] = useState(null);
  const [timeLeft, setTimeLeft] = useState(30); // 30 seconds per question

  useEffect(() => {
    loadQuiz();
    setLanguage(localStorage.getItem('soceng_language') || 'en');
    setStartTime(Date.now());
  }, [quizId]);

  // Timer Effect
  useEffect(() => {
    if (showResults || !quiz) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          // Time expired, move next
          handleNext(true);
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [currentQuestionIndex, showResults, quiz]);

  const loadQuiz = async () => {
    try {
      const token = localStorage.getItem('soceng_token');
      const response = await axios.get(`${API}/quizzes/${quizId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setQuiz(response.data);
    } catch (error) {
      toast.error('Failed to load quiz');
      navigate('/quizzes');
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerSelect = (questionId, optionIndex) => {
    setSelectedAnswers({
      ...selectedAnswers,
      [questionId]: optionIndex
    });
  };

  const handleNext = (autoSkip = false) => {
    // If autoSkip (timer), mark as skipped/wrong if not answered
    if (autoSkip && selectedAnswers[quiz.questions[currentQuestionIndex].id] === undefined) {
      // Optionally mark as -1 or null to indicate timeout
      setSelectedAnswers(prev => ({
        ...prev,
        [quiz.questions[currentQuestionIndex].id]: -1
      }));
    }

    if (currentQuestionIndex < quiz.questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setTimeLeft(30); // Reset timer
    } else if (autoSkip) {
      // Timeout on last question -> Submit
      handleSubmit();
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  const handleSubmit = async () => {
    setEndTime(Date.now());

    // Calculate score
    let correctCount = 0;
    quiz.questions.forEach(q => {
      const selectedIndex = selectedAnswers[q.id];
      if (selectedIndex !== undefined && q.options[selectedIndex]?.correct) {
        correctCount++;
      }
    });

    const finalScore = Math.round((correctCount / quiz.questions.length) * 100);
    setScore(finalScore);
    setShowResults(true);

    // Save simulation
    try {
      const token = localStorage.getItem('soceng_token');
      await axios.post(`${API}/simulations`, {
        quiz_id: quizId,
        simulation_type: 'quiz',
        status: 'completed',
        score: finalScore,
        events: Object.entries(selectedAnswers).map(([qId, ansIdx]) => ({
          question_id: qId,
          answer_index: ansIdx,
          timestamp: new Date().toISOString()
        })),
        title: quiz.title,
        challenge_Title: quiz.title,
        metadata: {
          correct_count: correctCount,
          total_questions: quiz.questions.length
        }
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (error) {
      console.error('Failed to save quiz results', error);
    }
  };

  const getContent = (obj, key) => {
    const contentKey = language === 'id' && obj.content_id ? 'content_id' : 'content_en';
    return obj[contentKey]?.[key] || obj.content_en?.[key] || '';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-primary font-mono animate-pulse">LOADING QUIZ...</div>
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className="text-center p-12">
        <p className="text-muted-foreground">Quiz not found</p>
        <Button onClick={() => navigate('/quizzes')} className="mt-4">
          Back to Quizzes
        </Button>
      </div>
    );
  }

  if (showResults) {
    const timeTaken = Math.round((endTime - startTime) / 1000);
    const correctCount = quiz.questions.filter(q => {
      const selectedIndex = selectedAnswers[q.id];
      return selectedIndex !== undefined && q.options[selectedIndex]?.correct;
    }).length;

    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Card className="glass-panel p-8 text-center">
          <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 ${score >= 70 ? 'bg-tertiary/20' : score >= 40 ? 'bg-warning/20' : 'bg-destructive/20'
            }`}>
            <Award className={`w-12 h-12 ${score >= 70 ? 'text-tertiary' : score >= 40 ? 'text-warning' : 'text-destructive'
              }`} />
          </div>

          <h2 className="text-3xl font-bold mb-4">Quiz Completed!</h2>

          <div className="grid grid-cols-3 gap-6 mb-8">
            <div className="glass-panel p-4">
              <div className="text-sm text-muted-foreground uppercase">Score</div>
              <div className={`text-4xl font-bold font-mono ${score >= 70 ? 'text-tertiary' : score >= 40 ? 'text-warning' : 'text-destructive'
                }`}>
                {score}%
              </div>
            </div>
            <div className="glass-panel p-4">
              <div className="text-sm text-muted-foreground uppercase">Correct</div>
              <div className="text-4xl font-bold font-mono text-tertiary">
                {correctCount}/{quiz.questions.length}
              </div>
            </div>
            <div className="glass-panel p-4">
              <div className="text-sm text-muted-foreground uppercase">Time</div>
              <div className="text-4xl font-bold font-mono text-primary">
                {timeTaken}s
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center space-x-4">
            <Button onClick={() => navigate('/quizzes')}>
              Back to Quizzes
            </Button>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Retake Quiz
            </Button>
          </div>
        </Card>

        {/* Review Answers */}
        <div className="space-y-4">
          <h3 className="text-2xl font-bold">Answer Review</h3>
          {quiz.questions.map((question, qIdx) => {
            const selectedIndex = selectedAnswers[question.id];
            const isCorrect = selectedIndex !== undefined && question.options[selectedIndex]?.correct;

            return (
              <Card key={question.id} className={`glass-panel p-6 ${isCorrect ? 'border-tertiary/30' : 'border-destructive/30'
                }`}>
                <div className="flex items-start space-x-4">
                  {isCorrect ? (
                    <CheckCircle2 className="w-6 h-6 text-tertiary mt-1" />
                  ) : (
                    <XCircle className="w-6 h-6 text-destructive mt-1" />
                  )}

                  <div className="flex-1">
                    <div className="font-bold mb-3">
                      Question {qIdx + 1}: {getContent(question, 'text')}
                    </div>

                    <div className="space-y-2 mb-4">
                      {question.options.map((option, optIdx) => {
                        const isSelected = selectedIndex === optIdx;
                        const isCorrectOption = option.correct;

                        return (
                          <div
                            key={optIdx}
                            className={`p-3 rounded border ${isCorrectOption
                              ? 'border-tertiary/50 bg-tertiary/10'
                              : isSelected
                                ? 'border-destructive/50 bg-destructive/10'
                                : 'border-muted/30'
                              }`}
                          >
                            <div className="flex items-center justify-between">
                              <span>{language === 'id' && option.text_id ? option.text_id : option.text}</span>
                              {isCorrectOption && <Badge className="bg-tertiary/20 text-tertiary">Correct</Badge>}
                              {isSelected && !isCorrectOption && <Badge className="bg-destructive/20 text-destructive">Your Answer</Badge>}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {getContent(question, 'explanation') && (
                      <div className="p-4 bg-muted/20 rounded border border-muted/30">
                        <div className="text-sm font-bold mb-1">💡 Explanation:</div>
                        <p className="text-sm text-muted-foreground">{getContent(question, 'explanation')}</p>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  const currentQuestion = quiz.questions[currentQuestionIndex];
  const selectedAnswer = selectedAnswers[currentQuestion.id];
  const progress = ((currentQuestionIndex + 1) / quiz.questions.length) * 100;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="glass-panel p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">{quiz.title}</h1>
            <div className="flex items-center space-x-2 mt-1">
              {quiz.cialdini_categories?.map(cat => (
                <Badge key={cat} variant="outline" className="text-xs">
                  {cat}
                </Badge>
              ))}
            </div>
          </div>
          <div className="text-right">
            <div className={`text-xl font-mono font-bold ${timeLeft < 10 ? 'text-destructive animate-pulse' : 'text-primary'}`}>
              <Clock className="w-4 h-4 inline mr-1" />
              {timeLeft}s
            </div>
            <div className="text-xs text-muted-foreground">remaining</div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-muted/20 rounded-full h-2">
          <div
            className="bg-primary h-2 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Question */}
      <Card className="glass-panel p-8">
        <h2 className="text-xl font-bold mb-6">
          {getContent(currentQuestion, 'text')}
        </h2>

        <div className="space-y-3">
          {currentQuestion.options.map((option, idx) => (
            <button
              key={idx}
              onClick={() => handleAnswerSelect(currentQuestion.id, idx)}
              className={`w-full p-4 text-left rounded-lg border transition-colors ${selectedAnswer === idx
                ? 'bg-primary/10 border-primary/50'
                : 'bg-muted/10 border-muted/30 hover:border-primary/30'
                }`}
              data-testid={`quiz-option-${idx}`}
            >
              <div className="flex items-center space-x-3">
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${selectedAnswer === idx
                  ? 'border-primary bg-primary'
                  : 'border-muted-foreground'
                  }`}>
                  {selectedAnswer === idx && (
                    <div className="w-2 h-2 bg-background rounded-full" />
                  )}
                </div>
                <span>{language === 'id' && option.text_id ? option.text_id : option.text}</span>
              </div>
            </button>
          ))}
        </div>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={handlePrevious}
          disabled={currentQuestionIndex === 0}
        >
          Previous
        </Button>

        <div className="text-sm text-muted-foreground">
          {Object.keys(selectedAnswers).length}/{quiz.questions.length} answered
        </div>

        {currentQuestionIndex < quiz.questions.length - 1 ? (
          <Button onClick={handleNext}>
            Next
          </Button>
        ) : (

          <Button
            onClick={handleSubmit}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
            data-testid="submit-quiz-btn"
          >
            Finish & Submit
          </Button>
        )}
      </div>
    </div >
  );
}
