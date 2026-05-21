import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import api from '../services/api';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import {
  Zap, Loader2, AlertTriangle, CheckCircle2, XCircle, Award,
  Eye, EyeOff, Flag, MessageSquare, AlertCircle, BookOpen,
  ChevronLeft, ChevronRight, RotateCcw, Download, RefreshCw
} from 'lucide-react';


export default function AIChallengePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const chatEndRef = useRef(null);

  // State Management
  const [llmConfigured, setLlmConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  // Error Handling
  const [generateError, setGenerateError] = useState(null);

  // Challenge Configuration
  const [selectedCategory, setSelectedCategory] = useState('phishing');
  const [selectedChallengeType, setSelectedChallengeType] = useState('comprehensive');
  const [numQuestions, setNumQuestions] = useState(5); // Default reduced for speed
  const [difficulty, setDifficulty] = useState('medium');
  const [language, setLanguage] = useState('indonesian');
  const [selectedProvider, setSelectedProvider] = useState('gemini');

  // Challenge Data & Progress
  const [generatedChallenge, setGeneratedChallenge] = useState(null);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [userAnswers, setUserAnswers] = useState({});
  const [showResults, setShowResults] = useState(false);
  const [finalScore, setFinalScore] = useState(0);

  // Chatbot state
  const [chatHistory, setChatHistory] = useState([]);
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationResults, setEvaluationResults] = useState({}); // Store AI evaluation results

  // Challenge Type Configuration
  const challengeTypes = {
    comprehensive: {
      label: 'Comprehensive Challenge',
      icon: '🛡️',
      description: 'Full-spectrum social engineering test (Quiz, Scenarios, & Analysis)',
      formats: ['multiple_choice', 'scenario_analysis', 'red_flag_identification', 'email_analysis'],
      instructions: [
        'Analyze each situation carefully',
        'Identify red flags and manipulation tactics',
        'Choose the best course of action',
        'Learn from detailed AI feedback'
      ]
    },
    email_analysis: {
      label: 'Email Security Analyst',
      icon: '📧',
      description: 'Deep dive into phishing email detection and header analysis',
      formats: ['email_full_analysis'],
      instructions: [
        'Examine sender, subject, and headers',
        'Spot malicious links or attachments',
        'Identify urgency and authority triggers',
        'Differentiate between spam and targeted attacks'
      ]
    },
    interactive: {
      label: 'Live Attacker Simulation',
      icon: '💬',
      description: 'Real-time roleplay against an AI social engineer',
      formats: ['conversation'],
      instructions: [
        'Engage with a potential "attacker"',
        'Identify when the conversation turns malicious',
        'Resist manipulation techniques',
        'Report the incident correctly'
      ]
    },
    scenario: {
      label: 'Corporate Scenarios',
      icon: '🏢',
      description: 'Complex business situations requiring security judgment',
      formats: ['scenario_branching'],
      instructions: [
        'Review the business context',
        'Weigh security vs. productivity',
        'Make critical decisions under pressure',
        'Understand the business impact'
      ]
    }
  };

  useEffect(() => {
    checkLLMConfig();
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isEvaluating]);

  const checkLLMConfig = async () => {
    try {
      const response = await api.get('/llm/config');
      const hasEnabled = response.data.some(config => config.enabled);
      setLlmConfigured(hasEnabled);
      if (!hasEnabled) {
        // Don't toast on load, just show the UI state
      }
    } catch (error) {
      console.error('Failed to check LLM config', error);
    } finally {
      setLoading(false);
    }
  };

  const generateChallenge = async () => {
    if (!llmConfigured) {
      toast.error('LLM not configured. Please check Settings.');
      navigate('/settings');
      return;
    }

    setGenerating(true);
    setGenerateError(null);
    setGeneratedChallenge(null);
    setUserAnswers({});
    setCurrentQuestionIdx(0);
    setShowResults(false);
    setChatHistory([]);
    setEvaluationResults({});

    try {
      const challengeTypeConfig = challengeTypes[selectedChallengeType];
      const prompt = buildPrompt(selectedChallengeType, challengeTypeConfig);

      const response = await api.post('/llm/generate', {
        prompt,
        context: {
          category: selectedCategory,
          challenge_type: selectedChallengeType,
          num_questions: numQuestions,
          difficulty,
          language,
        },
        provider: selectedProvider,
      });

      // Backend should handle JSON repair, but we double check here
      let challengeData;
      try {
        if (typeof response.data.generated_text === 'object') {
          challengeData = response.data.generated_text;
        } else {
          challengeData = JSON.parse(response.data.generated_text);
        }
      } catch (e) {
        console.warn("Retrying JSON parse with cleanup...");
        // Client-side fallback repair
        const cleanText = response.data.generated_text.replace(/```json/g, '').replace(/```/g, '').trim();
        const jsonStart = cleanText.indexOf('{');
        const jsonEnd = cleanText.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
          challengeData = JSON.parse(cleanText.substring(jsonStart, jsonEnd + 1));
        } else {
          throw new Error("Could not parse AI response as JSON");
        }
      }

      // Validate structure
      if (!challengeData.questions || !Array.isArray(challengeData.questions)) {
        throw new Error("Invalid challenge structure received from AI");
      }

      // Normalize structure
      challengeData.questions = challengeData.questions.map((q, idx) => ({
        ...q,
        id: q.id || `q-${idx}`,
        type: q.type || 'multiple_choice',
        options: Array.isArray(q.options)
          ? q.options.map(opt => (typeof opt === 'string' ? { text: opt } : opt))
          : []
      }));

      setGeneratedChallenge(challengeData);
      toast.success(`🎉 Generated ${challengeData.questions.length} questions!`);

      // Initialize chat
      initializeChatbot(challengeData.questions[0]);

    } catch (error) {
      console.error('Failed to generate challenge', error);
      setGenerateError(error.message || "Failed to generate challenge. Please try again.");
      toast.error("Generation failed. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const initializeChatbot = (firstQuestion) => {
    setChatHistory([{
      type: 'assistant',
      content: firstQuestion.question,
      question: firstQuestion,
      timestamp: new Date()
    }]);
  };

  const buildPrompt = (type, config) => {
    const langInstructions = language === 'indonesian'
      ? 'OUTPUT LANGUAGE: INDONESIAN (BAHASA INDONESIA) ONLY.'
      : 'OUTPUT LANGUAGE: ENGLISH ONLY.';

    return `
    ROLE: You are an expert Cyber Security Trainer specializing in Social Engineering.
    TASK: Create a ${difficulty} level '${config.label}' challenge about '${selectedCategory}'.
    
    ${langInstructions}
    
    FORMAT: valid JSON only. NO MARKDOWN. NO EXPLANATIONS.
    STRUCTURE:
    {
      "challenge_title": "Creative Title Here",
      "questions": [
        {
          "id": "q1",
          "type": "multiple_choice", 
          "question": "Detailed scenario description or question text...",
          "options": [{"text": "Option A"}, {"text": "Option B"}, {"text": "Option C"}, {"text": "Option D"}],
          "correct_answer": "Option A", 
          "explanation": "Detailed educational explanation of why A is correct and others are wrong.",
          "cialdini_principle": "Authority/Urgency/etc",
          "learning_objective": "Key takeaway"
        }
      ]
    }
    
    REQUIREMENTS:
    - Generate exactly ${numQuestions} questions.
    - Difficulty: ${difficulty} (Adjust complexity of scenarios accordingly).
    - For 'email_analysis' type, include an 'email_data' object in the question with {from, subject, body, headers}.
    - Make scenarios realistic and modern (2024-2025 era threats).
    `;
  };

  const submitAnswer = async () => {
    if (!currentAnswer.trim() || isEvaluating) return;

    const currentQuestion = generatedChallenge.questions[currentQuestionIdx];
    setIsEvaluating(true);

    // Update Chat UI immediately
    const newHistory = [
      ...chatHistory,
      { type: 'user', content: currentAnswer, timestamp: new Date() }
    ];
    setChatHistory(newHistory);
    setCurrentAnswer(''); // Clear input

    try {
      const evalPrompt = `
        Evaluate this answer for a security training scenario.
        Question: ${currentQuestion.question}
        User Answer: ${currentAnswer}
        Correct Answer/Goal: ${currentQuestion.correct_answer || "Safe security practice"}
        Explanation Context: ${currentQuestion.explanation}

        Respond in JSON:
        {
          "isCorrect": boolean,
          "feedback": "Brief, encouraging feedback (max 2 sentences)",
          "insight": "One key security insight",
          "score": 0-100 (confidence of correctness)
        }
        Lang: ${language}
        `;

      const response = await api.post('/llm/generate', { prompt: evalPrompt, provider: selectedProvider });

      let evalData = { isCorrect: false, feedback: "Could not evaluate.", insight: "", score: 0 };
      try {
        evalData = typeof response.data.generated_text === 'object'
          ? response.data.generated_text
          : JSON.parse(response.data.generated_text.replace(/```json/g, '').replace(/```/g, '').trim());
      } catch (e) {
        // Fallback for parsing error
        evalData.feedback = response.data.generated_text;
        evalData.isCorrect = currentAnswer.toLowerCase().includes((currentQuestion.correct_answer || "").toLowerCase());
      }

      // Store result
      const newEvalResults = { ...evaluationResults, [currentQuestion.id]: evalData };
      setEvaluationResults(newEvalResults);
      setUserAnswers({ ...userAnswers, [currentQuestion.id]: currentAnswer });

      // Add AI response to chat
      const responseMsg = {
        type: 'assistant',
        content: `${evalData.feedback}\n\n💡 ${evalData.insight}`,
        isEvaluation: true,
        isCorrect: evalData.isCorrect,
        timestamp: new Date()
      };

      setChatHistory(prev => [...prev, responseMsg]);

      // Proceed to next question after short delay
      setTimeout(() => {
        if (currentQuestionIdx < generatedChallenge.questions.length - 1) {
          const nextIdx = currentQuestionIdx + 1;
          setCurrentQuestionIdx(nextIdx);
          setChatHistory(prev => [...prev, {
            type: 'assistant',
            content: generatedChallenge.questions[nextIdx].question,
            question: generatedChallenge.questions[nextIdx],
            timestamp: new Date()
          }]);
        } else {
          finishChallenge(newEvalResults);
        }
      }, 1500);

    } catch (error) {
      console.error("Evaluation failed", error);
      toast.error("Evaluation failed. Please try answering again.");
    } finally {
      setIsEvaluating(false);
    }
  };

  const finishChallenge = async (finalEvaluations) => {
    // Calculate Score
    let correctCount = 0;
    Object.values(finalEvaluations).forEach(ev => {
      if (ev.isCorrect || ev.score > 70) correctCount++;
    });

    const score = Math.round((correctCount / generatedChallenge.questions.length) * 100);
    setFinalScore(score);
    setShowResults(true);

    // Save History
    try {
      await api.post('/simulations', {
        simulation_type: 'ai_challenge',
        challenge_type: selectedChallengeType,
        category: selectedCategory,
        difficulty,
        score,
        total_questions: generatedChallenge.questions.length,
        correct_answers: correctCount,
        answers: userAnswers,
        title: generatedChallenge.challenge_title,
        status: 'completed',
        completed_at: new Date().toISOString(),
      });
    } catch (e) {
      console.error("Failed to save history", e);
    }
  };

  const renderContentSafe = (content) => {
    if (typeof content === 'object') return JSON.stringify(content, null, 2);
    return content;
  };

  // --- RENDER HELPERS ---

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div>;
  }

  if (!llmConfigured) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <AlertTriangle className="w-16 h-16 text-yellow-500 mb-4" />
        <h1 className="text-3xl font-bold mb-2">AI Not Configured</h1>
        <p className="text-muted-foreground mb-6 max-w-md">To use the AI Challenge Generator, you need to configure a free Google Gemini API key (or other provider) in the settings.</p>
        <Button onClick={() => navigate('/settings')}>Go to Settings</Button>
      </div>
    );
  }

  // --- RESULTS SCREEN ---
  if (showResults) {
    return (
      <div className="container mx-auto max-w-4xl p-6 space-y-8 animate-in fade-in duration-500">
        <Card className="text-center p-10 border-primary/20 bg-primary/5">
          <Award className={`w-20 h-20 mx-auto mb-4 ${finalScore > 70 ? 'text-yellow-400' : 'text-gray-400'}`} />
          <h1 className="text-5xl font-bold mb-2">{finalScore}%</h1>
          <p className="text-xl text-muted-foreground">Challenge Complete!</p>
          <div className="flex justify-center gap-4 mt-8">
            <Button variant="outline" onClick={() => setShowResults(false) || setGeneratedChallenge(null)}>
              <RotateCcw className="w-4 h-4 mr-2" /> Try Again
            </Button>
            <Button onClick={() => navigate('/simulations')}>View History</Button>
          </div>
        </Card>

        <div className="space-y-6">
          <h2 className="text-2xl font-bold">Analysis Breakdown</h2>
          {generatedChallenge.questions.map((q, idx) => {
            const isCorrect = evaluationResults[q.id]?.isCorrect;
            return (
              <Card key={idx} className={`p-6 border-l-4 ${isCorrect ? 'border-l-green-500' : 'border-l-red-500'}`}>
                <div className="flex gap-4">
                  <div className="mt-1">
                    {isCorrect ? <CheckCircle2 className="text-green-500" /> : <XCircle className="text-red-500" />}
                  </div>
                  <div className="flex-1 space-y-2">
                    <h3 className="font-semibold text-lg">{q.question}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mt-3 bg-muted/50 p-3 rounded-lg">
                      <div>
                        <span className="font-bold block text-muted-foreground">Your Answer:</span>
                        <span className={isCorrect ? 'text-green-400' : 'text-red-400'}>{userAnswers[q.id]}</span>
                      </div>
                      <div>
                        <span className="font-bold block text-muted-foreground">AI Insight:</span>
                        <span className="text-blue-400">{evaluationResults[q.id]?.feedback}</span>
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      <span className="font-semibold text-primary">Lesson:</span> {q.explanation}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  // --- GAMEPLAY SCREEN ---
  if (generatedChallenge) {
    const q = generatedChallenge.questions[currentQuestionIdx];
    return (
      <div className="flex flex-col h-[calc(100vh-4rem)] max-w-5xl mx-auto p-4 md:p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold truncate max-w-md">{generatedChallenge.challenge_title}</h2>
          <Badge variant="outline" className="text-lg px-4 py-1">
            {currentQuestionIdx + 1} / {generatedChallenge.questions.length}
          </Badge>
        </div>

        {/* Chat Window */}
        <ScrollArea className="flex-1 bg-card/50 border rounded-xl p-4 mb-4 backdrop-blur-sm">
          <div className="space-y-6">
            {chatHistory.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] md:max-w-[75%] p-4 rounded-2xl shadow-sm ${msg.type === 'user'
                  ? 'bg-primary text-primary-foreground rounded-tr-none'
                  : 'bg-muted rounded-tl-none border border-border'
                  }`}>
                  {msg.type === 'assistant' && msg.isEvaluation && (
                    <div className={`mb-2 font-bold flex items-center gap-2 ${msg.isCorrect ? 'text-green-500' : 'text-red-400'}`}>
                      {msg.isCorrect ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                      {msg.isCorrect ? 'Correct Analysis' : 'Vulnerable Response'}
                    </div>
                  )}

                  <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>

                  {/* Embedded Data Display */}
                  {msg.question?.email_data && (
                    <div className="mt-4 bg-background/50 p-3 rounded text-sm font-mono border border-border/50">
                      <div className="border-b border-border/50 pb-2 mb-2">
                        <div><span className="text-muted-foreground">From:</span> {msg.question.email_data.from}</div>
                        <div><span className="text-muted-foreground">Subject:</span> {msg.question.email_data.subject}</div>
                      </div>
                      <div className="text-foreground/90">{renderContentSafe(msg.question.email_data.body)}</div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isEvaluating && (
              <div className="flex justify-start">
                <div className="bg-muted p-4 rounded-2xl rounded-tl-none flex items-center gap-3">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm text-muted-foreground animate-pulse">Analyzing your response...</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="mt-auto">
          {q.options && q.options.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {q.options.map((opt, i) => (
                <Button
                  key={i}
                  variant="outline"
                  className="h-auto py-4 justify-start text-left hover:bg-primary/10 hover:border-primary transition-all"
                  onClick={() => {
                    setCurrentAnswer(opt.text);
                    // Small delay to allow state update before submit
                    setTimeout(() => submitAnswer(), 0);
                  }}
                  disabled={isEvaluating}
                >
                  <span className="bg-primary/20 text-primary w-6 h-6 rounded flex items-center justify-center mr-3 text-xs font-bold shrink-0">
                    {String.fromCharCode(65 + i)}
                  </span>
                  {opt.text}
                </Button>
              ))}
            </div>
          ) : (
            <div className="flex gap-2">
              <textarea
                value={currentAnswer}
                onChange={e => setCurrentAnswer(e.target.value)}
                placeholder="Type your analysis here..."
                className="flex-1 bg-background border rounded-lg p-3 min-h-[80px] focus:ring-2 ring-primary/50 outline-none resize-none"
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    submitAnswer();
                  }
                }}
              />
              <Button
                onClick={submitAnswer}
                disabled={!currentAnswer.trim() || isEvaluating}
                className="h-auto w-24"
              >
                {isEvaluating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-6 h-6" />}
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- CONFIG SCREEN ---
  return (
    <div className="container mx-auto max-w-6xl p-6">
      <div className="flex flex-col md:flex-row gap-8 items-start">

        {/* Left: Config */}
        <div className="w-full md:w-1/3 space-y-6 sticky top-6">
          <div>
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">
              AI Challenge
            </h1>
            <p className="text-muted-foreground mt-2">
              {t('Generate custom social engineering scenarios powered by Gemini AI.')}
            </p>
          </div>

          <Card className="p-6 space-y-5 border-primary/20 shadow-lg shadow-primary/5">
            <div className="space-y-2">
              <label className="text-sm font-medium">Topic</label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="phishing">Phishing</SelectItem>
                  <SelectItem value="pretexting">Pretexting</SelectItem>
                  <SelectItem value="baiting">Baiting</SelectItem>
                  <SelectItem value="vishing">Vishing (Voice)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Mode</label>
              <Select value={selectedChallengeType} onValueChange={setSelectedChallengeType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(challengeTypes).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.icon} {v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Difficulty</label>
              <Select value={difficulty} onValueChange={setDifficulty}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="novice">Novice</SelectItem>
                  <SelectItem value="intermediate">Intermediate</SelectItem>
                  <SelectItem value="expert">Expert</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Language</label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="english">English</SelectItem>
                  <SelectItem value="indonesian">Bahasa Indonesia</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Provider</label>
              <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gemini">Google Gemini (Free/Pro)</SelectItem>
                  <SelectItem value="claude">Anthropic Claude</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              size="lg"
              className="w-full relative overflow-hidden group"
              onClick={generateChallenge}
              disabled={generating}
            >
              {generating ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Crafting Scenario...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 group-hover:text-yellow-300 transition-colors" />
                  <span>Start Simulation</span>
                </div>
              )}
            </Button>

            {generateError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded text-sm text-red-500 flex gap-2 items-center">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {generateError}
              </div>
            )}
          </Card>
        </div>

        {/* Right: Info */}
        <div className="w-full md:w-2/3">
          <div className="grid md:grid-cols-2 gap-4 mb-8">
            {Object.entries(challengeTypes).map(([key, info]) => (
              <Card
                key={key}
                className={`p-5 cursor-pointer transition-all border-l-4 ${selectedChallengeType === key ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-transparent hover:bg-muted/50'}`}
                onClick={() => setSelectedChallengeType(key)}
              >
                <div className="text-3xl mb-3">{info.icon}</div>
                <h3 className="font-bold text-lg mb-1">{info.label}</h3>
                <p className="text-sm text-muted-foreground">{info.description}</p>
              </Card>
            ))}
          </div>

          <Card className="p-6 bg-gradient-to-br from-background to-muted border-none">
            <h3 className="font-bold mb-4 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" />
              Mission Briefing
            </h3>
            <ul className="space-y-3">
              {challengeTypes[selectedChallengeType].instructions.map((inst, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary font-bold text-xs shrink-0">
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{inst}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

      </div>
    </div>
  );
}

// Temporary ScrollArea component if not available in UI lib
const ScrollArea = ({ children, className }) => (
  <div className={`overflow-y-auto ${className}`}>{children}</div>
);
