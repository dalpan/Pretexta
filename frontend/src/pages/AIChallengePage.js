import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { 
  Zap, Loader2, AlertTriangle, CheckCircle2, XCircle, Award, 
  Eye, EyeOff, Flag, MessageSquare, AlertCircle, BookOpen,
  ChevronLeft, ChevronRight, RotateCcw, Download
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function AIChallengePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // State Management
  const [llmConfigured, setLlmConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Challenge Configuration
  const [selectedCategory, setSelectedCategory] = useState('phishing');
  const [selectedChallengeType, setSelectedChallengeType] = useState('comprehensive');
  const [numQuestions, setNumQuestions] = useState(10);
  const [difficulty, setDifficulty] = useState('medium');
  
  // Challenge Data & Progress
  const [generatedChallenge, setGeneratedChallenge] = useState(null);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [userAnswers, setUserAnswers] = useState({});
  const [questionFeedback, setQuestionFeedback] = useState({});
  const [showResults, setShowResults] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  const [showDetailedExplanation, setShowDetailedExplanation] = useState({});

// Challenge Type Configuration
const challengeTypes = {
  comprehensive: {
    label: 'Comprehensive Challenge',
    icon: '📋',
    description: 'Multi-format challenge with various question types',
    formats: ['multiple_choice', 'scenario_analysis', 'red_flag_identification', 'email_analysis'],
    instructions: [
      'Read each question carefully',
      'Apply logic and knowledge of social engineering tactics',
      'Each question may have a different format',
      'There is no time limit for each question',
      'You can return to previous questions',
      'Detailed explanations are available after submitting your answers'
    ]
  },
  email_analysis: {
    label: 'Email Analysis Challenge',
    icon: '📧',
    description: 'Analyze phishing emails and identify red flags',
    formats: ['email_full_analysis', 'header_analysis'],
    instructions: [
      'Analyze every provided email thoroughly',
      'Identify the social engineering tactics used',
      'Pay attention to the sender, subject line, and body content',
      'Look for authentication signs (SPF, DKIM, DMARC)',
      'Document every red flag you find',
      'Provide recommendations for improvement for each email'
    ]
  },
  interactive: {
    label: 'Interactive Conversation',
    icon: '💬',
    description: 'Real-time conversation simulation with an attacker',
    formats: ['conversation', 'reactive_scenario'],
    instructions: [
      'Interact with an AI acting as a social engineer',
      'Respond naturally using the available options',
      'Your choices will affect the flow of the conversation',
      'The AI will adapt based on your choices',
      'Goal: Avoid manipulation and maintain security awareness',
      'Each interaction is scored for susceptibility level'
    ]
  },
  scenario: {
    label: 'Real-World Scenarios',
    icon: '🎭',
    description: 'Real-world scenarios with multiple decision points',
    formats: ['scenario_branching', 'consequence_analysis'],
    instructions: [
      'Read the scenario completely',
      'Consider all aspects: context, techniques, warning signs',
      'Choose the most appropriate action for the situation',
      'Understand the consequences of each choice',
      'Some decisions may have different outcomes',
      'Learn from suboptimal results'
    ]
  }
};

  useEffect(() => {
    checkLLMConfig();
  }, []);

  const checkLLMConfig = async () => {
    try {
      const token = localStorage.getItem('soceng_token');
      const response = await axios.get(`${API}/llm/config`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const hasEnabled = response.data.some(config => config.enabled);
      setLlmConfigured(hasEnabled);
      if (!hasEnabled) {
        toast.error('Please configure LLM API key in Settings first');
      }
    } catch (error) {
      console.error('Failed to check LLM config', error);
    } finally {
      setLoading(false);
    }
  };

  const generateChallenge = async () => {
    if (!llmConfigured) {
      toast.error('LLM not configured. Go to Settings → LLM Configuration');
      navigate('/settings');
      return;
    }

    setGenerating(true);
    setGeneratedChallenge(null);
    setUserAnswers({});
    setQuestionFeedback({});
    setCurrentQuestionIdx(0);
    setShowResults(false);

    try {
      const token = localStorage.getItem('soceng_token');
      const challengeTypeConfig = challengeTypes[selectedChallengeType];
      
      // Build comprehensive prompt based on challenge type
      let prompt = buildPrompt(selectedChallengeType, challengeTypeConfig);

      const response = await axios.post(
        `${API}/llm/generate`,
        {
          prompt: prompt,
          context: {
            category: selectedCategory,
            challenge_type: selectedChallengeType,
            num_questions: numQuestions,
            difficulty: difficulty,
            language: 'id',
            formats: challengeTypeConfig.formats
          }
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      const challengeData = parseAndValidateChallenge(response.data.generated_text, selectedChallengeType);
      setGeneratedChallenge(challengeData);
      toast.success(`🤖 Generated ${challengeData.questions?.length || 0} challenge questions!`);
    } catch (error) {
      console.error('Failed to generate challenge', error);
      toast.error(`Failed to generate challenge: ${error.response?.data?.detail || error.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const buildPrompt = (type, config) => {
    const basePrompt = `You are an expert social engineering security trainer creating an interactive challenge for awareness training.

Challenge Type: ${config.label}
Category: ${selectedCategory}
Difficulty: ${difficulty}
Number of Questions: ${numQuestions}
Target Formats: ${config.formats.join(', ')}

Create a comprehensive, detailed challenge in Indonesian with the following characteristics:`;

    const typeSpecificPrompts = {
      comprehensive: `
1. MIX QUESTION TYPES:
   - Multiple choice (dengan 4-5 pilihan)
   - Scenario analysis (skenario + pertanyaan terbuka)
   - Red flag identification (identifikasi tanda peringatan)
   - Email analysis (analisis email phishing)

2. SETIAP PERTANYAAN HARUS MEMILIKI:
   - "question": Pertanyaan yang jelas dan detail
   - "type": Tipe pertanyaan (multiple_choice|scenario|red_flag|email)
   - "content": Konten lengkap (email body, skenario, dll)
   - "correct_answer": Jawaban yang benar
   - "explanation": Penjelasan detail mengapa jawaban tersebut benar
   - "instructions": Instruksi step-by-step untuk menjawab
   - "notes": Tips dan hal-hal penting yang harus diperhatikan
   - "cialdini_principle": Prinsip Cialdini yang digunakan (authority|urgency|reciprocity|social_proof|liking|scarcity)
   - "learning_objective": Apa yang seharusnya dipelajari
   - "real_world_context": Konteks kehidupan nyata

3. FORMAT RESPONSE JSON:
{
  "challenge_title": "Judul challenge",
  "category": "${selectedCategory}",
  "difficulty": "${difficulty}",
  "type": "${type}",
  "total_questions": ${numQuestions},
  "estimated_time": "X menit",
  "questions": [
    {
      "id": "q1",
      "type": "multiple_choice|scenario|red_flag|email",
      "question": "...",
      "content": "...",
      "options": [...], // untuk multiple choice
      "correct_answer": "...",
      "explanation": "Penjelasan detail dan edukatif",
      "instructions": ["Step 1: ...", "Step 2: ...", ...],
      "notes": ["Note 1: ...", "Note 2: ...", ...],
      "cialdini_principle": "...",
      "learning_objective": "...",
      "real_world_context": "...",
      "difficulty_level": "beginner|intermediate|advanced",
      "hint": "Petunjuk untuk membantu (optional)"
    },
    ...
  ]
}`,

      email_analysis: `
1. SETIAP EMAIL HARUS LENGKAP:
   - From address (bisa spoofed)
   - Subject line
   - Body content
   - Header information
   - Attachments (jika ada)

2. ANALISIS HARUS COVER:
   - Identifikasi sender
   - Analisis SPF/DKIM/DMARC
   - Red flags dalam content
   - Psychological tactics digunakan
   - Rekomendasi action

3. FORMAT RESPONSE:
{
  "challenge_title": "Email Security Analysis Challenge",
  "category": "${selectedCategory}",
  "type": "email_analysis",
  "questions": [
    {
      "id": "email1",
      "type": "email_full_analysis",
      "question": "Analisis email berikut dan identifikasi semua red flags...",
      "email_data": {
        "from": "...",
        "to": "...",
        "subject": "...",
        "body": "...",
        "received_headers": "...",
        "attachments": [...]
      },
      "correct_answer": "Jawaban analisis yang benar",
      "explanation": "Penjelasan detail tentang setiap red flag",
      "instructions": ["Langkah analisis..."],
      "notes": ["Perhatian penting...", "Best practice..."],
      "cialdini_principle": "...",
      "learning_objective": "..."
    }
  ]
}`,

      interactive: `
1. CONVERSATION FLOW:
   - Attacker membuka dengan teknik social engineering
   - User diberikan 3-4 pilihan response
   - AI menilai response dan melanjutkan percakapan
   - Score berdasarkan awareness level

2. SETIAP NODE HARUS:
   - Natural dan realistis
   - Ada tanda-tanda manipulation
   - Multiple paths based on user choice
   - Feedback immediate

3. FORMAT RESPONSE:
{
  "challenge_title": "Interactive Social Engineering Simulation",
  "type": "interactive",
  "questions": [
    {
      "id": "conv1",
      "type": "conversation",
      "question": "Anda menerima pesan dari 'IT Support'...",
      "attacker_message": "Pesan dari attacker...",
      "user_options": [
        {"text": "Option 1", "susceptibility_impact": -10, "next_id": "conv2"},
        {"text": "Option 2", "susceptibility_impact": 5, "next_id": "conv3"},
        {"text": "Option 3", "susceptibility_impact": -15, "next_id": "conv4"}
      ],
      "correct_action": "Option yang paling secure",
      "explanation": "Penjelasan...",
      "notes": ["Tanda peringatan...", "Best practice..."],
      "cialdini_principle": "..."
    }
  ]
}`,

      scenario: `
1. REAL-WORLD SCENARIOS:
   - Setup konteks yang detail
   - Multiple decision points
   - Consequences untuk setiap keputusan
   - Learning outcomes yang jelas

2. SCENARIO HARUS INCLUDE:
   - Background/context
   - Trigger event
   - Available actions
   - Consequences (positif dan negatif)
   - Lessons learned

3. FORMAT RESPONSE:
{
  "challenge_title": "Real-World Scenario Challenges",
  "type": "scenario",
  "questions": [
    {
      "id": "scenario1",
      "type": "scenario_branching",
      "question": "Baca skenario berikut...",
      "scenario": {
        "background": "...",
        "trigger": "...",
        "context": "..."
      },
      "available_actions": [
        {"text": "Action A", "outcome_score": 90, "explanation": "..."},
        {"text": "Action B", "outcome_score": 40, "explanation": "..."},
        {"text": "Action C", "outcome_score": 10, "explanation": "..."}
      ],
      "correct_action": "...",
      "explanation": "Penjelasan why this is best...",
      "notes": ["Konsiderasi...", "Best practice..."],
      "learning_objective": "..."
    }
  ]
}`,
    };

    return basePrompt + (typeSpecificPrompts[type] || '') + `

CRITICAL REQUIREMENTS:
- Generate EXACTLY ${numQuestions} questions
- Setiap pertanyaan HARUS lengkap dengan instruction dan notes
- Semua text dalam Indonesian
- Pastikan JSON valid dan dapat di-parse
- Fokus pada pembelajaran, bukan hanya testing
- Include real-world context dan practical tips
- Variasi difficulty level`;
  };

  const parseAndValidateChallenge = (responseText, type) => {
    try {
      let jsonText = responseText;
      
      // Clean markdown and extract JSON
      jsonText = jsonText.replace(/\[TRAINING\]\s*/gi, '').replace(/\[TRAINING MATERIAL\]\s*/gi, '');
      const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonText = codeBlockMatch[1].trim();
      }
      
      const startMatch = jsonText.search(/[\{\[]/);
      if (startMatch !== -1) {
        jsonText = jsonText.substring(startMatch);
      }
      
      const endMatch = jsonText.search(/[\}\]][^\}\]]*$/);
      if (endMatch !== -1) {
        jsonText = jsonText.substring(0, endMatch + 1);
      }

      const challengeData = JSON.parse(jsonText.trim());

      // Validate structure
      if (!challengeData.questions || !Array.isArray(challengeData.questions)) {
        throw new Error('Invalid challenge structure');
      }

      if (challengeData.questions.length === 0) {
        throw new Error('No questions generated');
      }

      // Ensure each question has required fields
      challengeData.questions.forEach((q, idx) => {
        if (!q.id) q.id = `q${idx + 1}`;
        if (!q.type) q.type = 'multiple_choice';
        if (!q.question) throw new Error(`Question ${idx + 1} missing question text`);
        if (!q.explanation) q.explanation = 'Penjelasan akan ditampilkan setelah Anda menjawab.';
        if (!q.instructions) q.instructions = [];
        if (!q.notes) q.notes = [];
        if (!q.learning_objective) q.learning_objective = 'Belajar tentang social engineering tactics';
      });

      console.log('✅ Challenge validated:', challengeData);
      return challengeData;
    } catch (error) {
      console.error('❌ Parse error:', error);
      throw error;
    }
  };

  const handleAnswerSelect = (questionId, answer) => {
    setUserAnswers({
      ...userAnswers,
      [questionId]: answer
    });
    // Immediately provide feedback
    evaluateAnswer(questionId, answer);
  };

  const evaluateAnswer = (questionId, userAnswer) => {
    const question = generatedChallenge.questions.find(q => q.id === questionId);
    if (!question) return;

    const isCorrect = userAnswer === question.correct_answer || 
                     (Array.isArray(question.correct_answer) && 
                      question.correct_answer.includes(userAnswer));

    setQuestionFeedback({
      ...questionFeedback,
      [questionId]: {
        isCorrect,
        userAnswer,
        feedback: isCorrect 
          ? '✅ Jawaban yang tepat!' 
          : '❌ Jawaban tidak sesuai, perhatikan penjelasan di bawah.'
      }
    });
  };

  const handleShowExplanation = (questionId) => {
    setShowDetailedExplanation({
      ...showDetailedExplanation,
      [questionId]: !showDetailedExplanation[questionId]
    });
  };

  const handleNextQuestion = () => {
    if (currentQuestionIdx < generatedChallenge.questions.length - 1) {
      setCurrentQuestionIdx(currentQuestionIdx + 1);
    }
  };

  const handlePreviousQuestion = () => {
    if (currentQuestionIdx > 0) {
      setCurrentQuestionIdx(currentQuestionIdx - 1);
    }
  };

  const calculateAndSubmitResults = async () => {
    if (!generatedChallenge) return;

    let correctCount = 0;
    generatedChallenge.questions.forEach(q => {
      const userAnswer = userAnswers[q.id];
      if (userAnswer && (userAnswer === q.correct_answer || 
          (Array.isArray(q.correct_answer) && q.correct_answer.includes(userAnswer)))) {
        correctCount++;
      }
    });

    const score = Math.round((correctCount / generatedChallenge.questions.length) * 100);
    setFinalScore(score);
    setShowResults(true);

    // Show toast feedback
    if (score >= 80) {
      toast.success('🏆 Excellent! Anda menunjukkan pemahaman yang kuat tentang social engineering tactics!');
    } else if (score >= 60) {
      toast('🎯 Good job! Review penjelasan untuk memperkuat pemahaman Anda.');
    } else {
      toast.error('💡 Keep learning! Pelajari setiap penjelasan dan coba lagi untuk hasil lebih baik.');
    }

    // Save to history
    await saveToHistory(score, correctCount);
  };

  const saveToHistory = async (score, correctCount) => {
    setSaving(true);
    try {
      const token = localStorage.getItem('soceng_token');
      
      // Create a simulation record for history
      const simulationData = {
        type: 'ai_challenge',
        challenge_type: selectedChallengeType,
        category: selectedCategory,
        difficulty: difficulty,
        total_questions: generatedChallenge.questions.length,
        score: score,
        correct_answers: correctCount,
        answers: userAnswers,
        challenge_data: generatedChallenge,
        completed_at: new Date().toISOString(),
        status: 'completed'
      };

      await axios.post(`${API}/simulations`, simulationData, {
        headers: { Authorization: `Bearer ${token}` }
      });

      toast.success('✅ Challenge hasil disimpan ke history!');
    } catch (error) {
      console.error('Failed to save challenge', error);
      toast.error('Failed to save challenge history');
    } finally {
      setSaving(false);
    }
  };

  const downloadReport = () => {
    const report = {
      title: generatedChallenge.challenge_title,
      category: selectedCategory,
      type: selectedChallengeType,
      difficulty: difficulty,
      date: new Date().toISOString(),
      score: finalScore,
      results: generatedChallenge.questions.map(q => ({
        question: q.question,
        userAnswer: userAnswers[q.id],
        correctAnswer: q.correct_answer,
        isCorrect: userAnswers[q.id] === q.correct_answer,
        explanation: q.explanation
      }))
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `challenge_report_${Date.now()}.json`;
    a.click();
  };

  const resetChallenge = () => {
    setGeneratedChallenge(null);
    setUserAnswers({});
    setQuestionFeedback({});
    setCurrentQuestionIdx(0);
    setShowResults(false);
    setShowDetailedExplanation({});
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!llmConfigured) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card className="p-8 text-center">
          <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-yellow-500" />
          <h2 className="text-2xl font-bold mb-2">LLM Not Configured</h2>
          <p className="text-gray-600 mb-4">
            Anda perlu mengkonfigurasi LLM API key terlebih dahulu untuk menggunakan AI Challenge.
          </p>
          <Button onClick={() => navigate('/settings')} className="w-full">
            Go to Settings → LLM Configuration
          </Button>
        </Card>
      </div>
    );
  }

  // Configuration Screen
  if (!generatedChallenge && !showResults) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">🎓 AI Challenge Generator</h1>
          <p className="text-gray-600">Create powerful, detailed social engineering challenges for comprehensive training</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Configuration Panel */}
          <div className="lg:col-span-1">
            <Card className="p-6 sticky top-6">
              <h3 className="text-lg font-semibold mb-4">Configure Challenge</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Challenge Type</label>
                  <Select value={selectedChallengeType} onValueChange={setSelectedChallengeType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(challengeTypes).map(([key, config]) => (
                        <SelectItem key={key} value={key}>
                          {config.icon} {config.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Category</label>
                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="phishing">📧 Phishing</SelectItem>
                      <SelectItem value="pretexting">🎭 Pretexting</SelectItem>
                      <SelectItem value="baiting">🪤 Baiting</SelectItem>
                      <SelectItem value="tailgating">🚪 Tailgating</SelectItem>
                      <SelectItem value="vishing">☎️ Vishing</SelectItem>
                      <SelectItem value="spear_phishing">🎯 Spear Phishing</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Difficulty</label>
                  <Select value={difficulty} onValueChange={setDifficulty}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="beginner">🟢 Beginner</SelectItem>
                      <SelectItem value="intermediate">🟡 Intermediate</SelectItem>
                      <SelectItem value="advanced">🔴 Advanced</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Number of Questions: {numQuestions}
                  </label>
                  <input
                    type="range"
                    min="3"
                    max="20"
                    value={numQuestions}
                    onChange={(e) => setNumQuestions(parseInt(e.target.value))}
                    className="w-full"
                  />
                </div>

                <Button 
                  onClick={generateChallenge} 
                  disabled={generating}
                  className="w-full"
                >
                  {generating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 mr-2" />
                      Generate Challenge
                    </>
                  )}
                </Button>
              </div>
            </Card>
          </div>

          {/* Challenge Type Info */}
          <div className="lg:col-span-2">
            <Card className="p-6">
              <div className="flex items-start mb-4">
                <span className="text-4xl mr-3">
                  {challengeTypes[selectedChallengeType].icon}
                </span>
                <div>
                  <h3 className="text-2xl font-bold">
                    {challengeTypes[selectedChallengeType].label}
                  </h3>
                  <p className="text-gray-600 mt-1">
                    {challengeTypes[selectedChallengeType].description}
                  </p>
                </div>
              </div>

              <div className="bg-blue p-4 rounded-lg mb-6">
                <h4 className="font-semibold mb-3 flex items-center">
                  <BookOpen className="w-4 h-4 mr-2" />
                  Instructions for This Challenge Type:
                </h4>
                <ol className="space-y-2 text-sm">
                  {challengeTypes[selectedChallengeType].instructions.map((instr, idx) => (
                    <li key={idx} className="flex">
                      <span className="font-semibold mr-3 text-blue-600">{idx + 1}.</span>
                      <span>{instr}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {challengeTypes[selectedChallengeType].formats.map((format) => (
                  <div key={format} className="bg-gray p-3 rounded flex items-center">
                    <CheckCircle2 className="w-4 h-4 text-green-600 mr-2 flex-shrink-0" />
                    <span className="text-sm capitalize">{format.replace(/_/g, ' ')}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // Challenge Display Screen
  if (generatedChallenge && !showResults) {
    const question = generatedChallenge.questions[currentQuestionIdx];
    const feedback = questionFeedback[question.id];
    const isAnswered = !!userAnswers[question.id];

    return (
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-3xl font-bold mb-2">{generatedChallenge.challenge_title}</h2>
          <div className="flex items-center gap-4">
            <Badge variant="outline">
              {currentQuestionIdx + 1} / {generatedChallenge.questions.length}
            </Badge>
            <Badge variant="outline">{difficulty}</Badge>
            <div className="ml-auto text-sm text-gray-600">
              Answered: {Object.keys(userAnswers).length} / {generatedChallenge.questions.length}
            </div>
          </div>
          <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${((currentQuestionIdx + 1) / generatedChallenge.questions.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Question Content */}
        <Card className="mb-6 p-6">
          {/* Question Type Badge */}
          <div className="mb-4">
            <Badge className="mb-4">{question.type.replace(/_/g, ' ').toUpperCase()}</Badge>
          </div>

          {/* Question Text */}
          <h3 className="text-2xl font-semibold mb-4">{question.question}</h3>

          {/* Instructions Box */}
          {question.instructions && question.instructions.length > 0 && (
            <div className="bg-blue border-l-4 border-blue-500 p-4 mb-6 rounded">
              <h4 className="font-semibold text-blue-900 mb-2 flex items-center">
                <AlertCircle className="w-4 h-4 mr-2" />
                How to Answer This Question:
              </h4>
              <ol className="space-y-1 text-sm text-blue-900">
                {question.instructions.map((instr, idx) => (
                  <li key={idx}>
                    <span className="font-semibold">Step {idx + 1}:</span> {instr}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Question Content (for scenarios, emails, etc) */}
          {question.content && (
            <div className="bg-gray p-4 rounded-lg mb-6 font-mono text-sm whitespace-pre-wrap">
              {question.content}
            </div>
          )}

          {/* Email Data Display */}
          {question.email_data && (
            <div className="bg-gray p-4 rounded-lg mb-6 space-y-3 text-sm">
              <div>
                <span className="font-semibold">From:</span> {question.email_data.from}
              </div>
              <div>
                <span className="font-semibold">To:</span> {question.email_data.to}
              </div>
              <div>
                <span className="font-semibold">Subject:</span> {question.email_data.subject}
              </div>
              {question.email_data.body && (
                <div className="border-t pt-3">
                  <span className="font-semibold block mb-2">Message:</span>
                  <div className="whitespace-pre-wrap">{question.email_data.body}</div>
                </div>
              )}
            </div>
          )}

          {/* Answer Options */}
          {question.options && question.options.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-semibold">Select your answer:</h4>
              {question.options.map((option, idx) => (
                <button
                  key={idx}
                  onClick={() => handleAnswerSelect(question.id, option.text || option)}
                  className={`w-full p-3 rounded-lg border-2 transition-all text-left ${
                    userAnswers[question.id] === (option.text || option)
                      ? 'border-blue-500 bg-blue'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className="font-semibold">{String.fromCharCode(65 + idx)}.</span> {option.text || option}
                </button>
              ))}
            </div>
          )}

          {/* Text Input for Open-ended */}
          {!question.options && (
            <div>
              <h4 className="font-semibold mb-2">Your Analysis:</h4>
              <textarea
                value={userAnswers[question.id] || ''}
                onChange={(e) => handleAnswerSelect(question.id, e.target.value)}
                placeholder="Write your detailed analysis here..."
                className="w-full p-3 border-2 border-gray-200 rounded-lg font-mono text-sm bg-gray-800 text-white"
                rows="6"
              />
            </div>
          )}
        </Card>

        {/* Feedback */}
        {isAnswered && feedback && (
          <Card className={`mb-6 p-4 ${feedback.isCorrect ? 'bg-green border-green-200' : 'bg-red border-red-200'}`}>
            <div className="flex items-start">
              {feedback.isCorrect ? (
                <CheckCircle2 className="w-5 h-5 text-green-600 mr-3 flex-shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-5 h-5 text-red-600 mr-3 flex-shrink-0 mt-0.5" />
              )}
              <div>
                <p className="font-semibold">{feedback.feedback}</p>
              </div>
            </div>
          </Card>
        )}

        {/* Notes & Learning */}
        {question.notes && question.notes.length > 0 && (
          <Card className="mb-6 p-4 bg-yellow border-yellow-200">
            <h4 className="font-semibold mb-2 flex items-center text-yellow-900">
              <Flag className="w-4 h-4 mr-2" />
              Important Notes:
            </h4>
            <ul className="space-y-1 text-sm text-yellow-900">
              {question.notes.map((note, idx) => (
                <li key={idx} className="flex">
                  <span className="mr-2">•</span>
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* Explanation */}
        <Card className="mb-6 p-4 bg-purple border-purple-200">
          <button
            onClick={() => handleShowExplanation(question.id)}
            className="w-full font-semibold text-purple-900 flex items-center justify-between"
          >
            <span className="flex items-center">
              <MessageSquare className="w-4 h-4 mr-2" />
              {showDetailedExplanation[question.id] ? 'Hide' : 'Show'} Detailed Explanation
            </span>
            {showDetailedExplanation[question.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
          
          {showDetailedExplanation[question.id] && (
            <div className="mt-4 pt-4 border-t border-purple-200 text-sm space-y-3">
              <div>
                <p className="font-semibold text-purple-900 mb-1">Explanation:</p>
                <p className="text-purple-800">{question.explanation}</p>
              </div>
              {question.learning_objective && (
                <div>
                  <p className="font-semibold text-purple-900 mb-1">Learning Objective:</p>
                  <p className="text-purple-800">{question.learning_objective}</p>
                </div>
              )}
              {question.real_world_context && (
                <div>
                  <p className="font-semibold text-purple-900 mb-1">Real-World Context:</p>
                  <p className="text-purple-800">{question.real_world_context}</p>
                </div>
              )}
              {question.cialdini_principle && (
                <div>
                  <p className="font-semibold text-purple-900 mb-1">Cialdini Principle Used:</p>
                  <Badge variant="outline" className="bg-purple-100">{question.cialdini_principle}</Badge>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Navigation */}
        <div className="flex gap-3 justify-between">
          <Button
            onClick={handlePreviousQuestion}
            disabled={currentQuestionIdx === 0}
            variant="outline"
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Previous
          </Button>

          {currentQuestionIdx === generatedChallenge.questions.length - 1 ? (
            <Button
              onClick={calculateAndSubmitResults}
              disabled={Object.keys(userAnswers).length < generatedChallenge.questions.length}
              className="ml-auto"
            >
              Submit Challenge
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleNextQuestion}
              className="ml-auto"
            >
              Next
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Results Screen
  if (showResults) {
    const totalQuestions = generatedChallenge.questions.length;
    const answeredQuestions = Object.keys(userAnswers).length;
    const correctAnswers = Object.entries(userAnswers).filter(([qId, answer]) => {
      const q = generatedChallenge.questions.find(qu => qu.id === qId);
      return q && answer === q.correct_answer;
    }).length;

    return (
      <div className="max-w-4xl mx-auto p-6">
        {/* Score Card */}
        <Card className="mb-6 p-8 text-center bg-gradient-to-r from-blue-50 to-purple-50">
          <Award className="w-16 h-16 mx-auto mb-4 text-yellow-500" />
          <h2 className="text-4xl font-bold mb-2">{finalScore}%</h2>
          <p className="text-xl text-gray-600 mb-6">
            You answered {correctAnswers} out of {totalQuestions} questions correctly
          </p>
          
          {finalScore >= 80 && (
            <Badge className="mb-4 text-lg py-2">🏆 Outstanding Performance!</Badge>
          )}
          {finalScore >= 60 && finalScore < 80 && (
            <Badge className="mb-4 text-lg py-2">✅ Good Job!</Badge>
          )}
          {finalScore < 60 && (
            <Badge className="mb-4 text-lg py-2">📚 Keep Learning</Badge>
          )}
        </Card>

        {/* Results Summary */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card className="p-4 text-center">
            <div className="text-3xl font-bold text-blue-600">{totalQuestions}</div>
            <div className="text-sm text-gray-600">Total Questions</div>
          </Card>
          <Card className="p-4 text-center">
            <div className="text-3xl font-bold text-green-600">{correctAnswers}</div>
            <div className="text-sm text-gray-600">Correct Answers</div>
          </Card>
          <Card className="p-4 text-center">
            <div className="text-3xl font-bold text-red-600">{totalQuestions - correctAnswers}</div>
            <div className="text-sm text-gray-600">To Review</div>
          </Card>
        </div>

        {/* Detailed Review */}
        <Card className="mb-6 p-6">
          <h3 className="text-2xl font-bold mb-4">Detailed Review</h3>
          <div className="space-y-4">
            {generatedChallenge.questions.map((question) => {
              const userAnswer = userAnswers[question.id];
              const isCorrect = userAnswer === question.correct_answer;
              return (
                <div key={question.id} className={`p-4 rounded-lg border-l-4 ${isCorrect ? 'bg-green border-green-500' : 'bg-red border-red-500'}`}>
                  <div className="flex items-start mb-2">
                    {isCorrect ? (
                      <CheckCircle2 className="w-5 h-5 text-green-600 mr-2 flex-shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1">
                      <p className="font-semibold">{question.question}</p>
                      <p className="text-sm mt-1">
                        <span className={isCorrect ? 'text-green-700' : 'text-red-700'}>Your answer:</span> {userAnswer}
                      </p>
                      {!isCorrect && (
                        <p className="text-sm text-red-700">
                          Correct answer: {question.correct_answer}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="bg-gray p-3 rounded mt-2 text-sm">
                    <p className="font-semibold mb-2">Explanation:</p>
                    <p>{question.explanation}</p>
                    {question.cialdini_principle && (
                      <p className="mt-2"><span className="font-semibold">Cialdini Principle:</span> {question.cialdini_principle}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Actions */}
        <div className="flex gap-3 justify-center">
          <Button variant="outline" onClick={downloadReport}>
            <Download className="w-4 h-4 mr-2" />
            Download Report
          </Button>
          <Button variant="outline" onClick={resetChallenge}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Try Another Challenge
          </Button>
          <Button onClick={() => navigate('/simulations')}>
            View Challenge History
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    );
  }
}
