import React, { useState, useEffect, useCallback } from 'react';
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
  const [language, setLanguage] = useState('indonesian');

  // Challenge Data & Progress
  const [generatedChallenge, setGeneratedChallenge] = useState(null);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [userAnswers, setUserAnswers] = useState({});
  const [questionFeedback, setQuestionFeedback] = useState({});
  const [showResults, setShowResults] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  const [showDetailedExplanation, setShowDetailedExplanation] = useState({});

  // Chatbot state
  const [chatHistory, setChatHistory] = useState([]);
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [conversationState, setConversationState] = useState('question');
  const [evaluationResults, setEvaluationResults] = useState({}); // Store AI evaluation results

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
            language: language,
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
    const langLabel = language === 'indonesian' ? 'Indonesian' : 'English';
    const langInstructions = language === 'indonesian' 
      ? 'Semua teks harus dalam Bahasa Indonesia'
      : 'All text should be in English';
    
    const basePrompt = `You are an expert social engineering security trainer creating an interactive challenge for awareness training.

Challenge Type: ${config.label}
Category: ${selectedCategory}
Difficulty: ${difficulty}
Number of Questions: ${numQuestions}
Target Formats: ${config.formats.join(', ')}
Language: ${langLabel}

Create a comprehensive, detailed challenge with the following characteristics:
${langInstructions}`;

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

      // Ensure each question has required fields and normalize types
      challengeData.questions.forEach((q, idx) => {
        if (!q.id) q.id = `q${idx + 1}`;
        if (!q.type) q.type = 'multiple_choice';

        // Normalize question text
        if (!q.question) throw new Error(`Question ${idx + 1} missing question text`);
        if (typeof q.question !== 'string') q.question = JSON.stringify(q.question, null, 2);

        // Ensure explanation is a string
        if (!q.explanation) q.explanation = 'Penjelasan akan ditampilkan setelah Anda menjawab.';
        if (typeof q.explanation !== 'string') q.explanation = JSON.stringify(q.explanation, null, 2);

        // Normalize content (could be object for scenarios/emails)
        if (q.content && typeof q.content !== 'string') {
          try {
            q.content = typeof q.content === 'object' ? JSON.stringify(q.content, null, 2) : String(q.content);
          } catch (e) {
            q.content = String(q.content);
          }
        }

        // Normalize instructions/notes/learning objective
        if (!q.instructions) q.instructions = [];
        q.instructions = q.instructions.map(instr => (typeof instr === 'string' ? instr : JSON.stringify(instr)));

        if (!q.notes) q.notes = [];
        q.notes = q.notes.map(n => (typeof n === 'string' ? n : JSON.stringify(n)));

        if (!q.learning_objective) q.learning_objective = 'Belajar tentang social engineering tactics';
        if (typeof q.learning_objective !== 'string') q.learning_objective = JSON.stringify(q.learning_objective);

        // Normalize options: ensure array of { text }
        if (q.options && Array.isArray(q.options)) {
          q.options = q.options.map(opt => {
            if (typeof opt === 'string') return { text: opt };
            if (opt && typeof opt === 'object') {
              if (opt.text) return opt;
              // try common keys
              const text = opt.label || opt.choice || opt.answer || JSON.stringify(opt);
              return { ...opt, text };
            }
            return { text: String(opt) };
          });
        }

        // Normalize correct_answer to the option text (if options present)
        if (q.correct_answer !== undefined && q.correct_answer !== null) {
          const normalizeToText = (ans) => {
            if (typeof ans === 'number') {
              if (q.options && q.options[ans]) return q.options[ans].text;
              return String(ans);
            }
            if (typeof ans === 'string') {
              const a = ans.trim();
              // letter -> index (A,B,C)
              if (/^[A-Za-z]$/.test(a) && q.options) {
                const idx = a.toUpperCase().charCodeAt(0) - 65;
                if (q.options[idx]) return q.options[idx].text;
              }
              // numeric string
              if (/^\d+$/.test(a) && q.options) {
                const idx = parseInt(a, 10) - 1;
                if (q.options[idx]) return q.options[idx].text;
              }
              // try to match option text
              if (q.options) {
                const found = q.options.find(o => String(o.text).trim().toLowerCase() === a.toLowerCase());
                if (found) return found.text;
              }
              return a;
            }
            return String(ans);
          };

          if (Array.isArray(q.correct_answer)) {
            q.correct_answer = q.correct_answer.map(a => normalizeToText(a));
          } else {
            q.correct_answer = normalizeToText(q.correct_answer);
          }
        } else {
          // mark explicit no correct answer
          q.correct_answer = null;
        }

        // Normalize email_data fields
        if (q.email_data && typeof q.email_data === 'object') {
          const ed = q.email_data;
          ['from', 'to', 'subject', 'body'].forEach(k => {
            if (ed[k] && typeof ed[k] !== 'string') ed[k] = JSON.stringify(ed[k], null, 2);
          });
        }
      });

      console.log('✅ Challenge validated:', challengeData);
      return challengeData;
    } catch (error) {
      console.error('❌ Parse error:', error);
      throw error;
    }
  };

  // Helper to safely render values that might be objects
  const renderSafe = (val) => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'object') return JSON.stringify(val, null, 2);
    return String(val);
  };

  const initializeChatbot = useCallback(() => {
    if (generatedChallenge && chatHistory.length === 0) {
      const firstQuestion = generatedChallenge.questions[0];
      setChatHistory([
        {
          type: 'assistant',
          content: firstQuestion.question,
          question: firstQuestion,
          timestamp: new Date()
        }
      ]);
      setConversationState('question');
    }
  }, [generatedChallenge, chatHistory.length]);

  useEffect(() => {
    if (generatedChallenge) {
      initializeChatbot();
    }
  }, [generatedChallenge, initializeChatbot]);

  const submitAnswer = async () => {
    if (!currentAnswer.trim()) return;

    const currentQuestion = generatedChallenge.questions[currentQuestionIdx];
    setIsEvaluating(true);
    setConversationState('evaluating');

    // Add user message to chat
    const newHistory = [
      ...chatHistory,
      {
        type: 'user',
        content: currentAnswer,
        timestamp: new Date()
      }
    ];

    try {
      // Call AI to evaluate the answer
      const token = localStorage.getItem('soceng_token');
      const evaluationPrompt = `
You are evaluating a social engineering simulation answer. 
Question: ${currentQuestion.question}
User Answer: ${currentAnswer}
Expected/Correct Answer: ${currentQuestion.correct_answer || 'Open-ended - provide feedback'}
Explanation: ${currentQuestion.explanation}

Provide brief, encouraging feedback (2-3 sentences max) on their answer. Then provide a BRIEF insight about the scenario.
Format your response as:
FEEDBACK: [feedback here]
INSIGHT: [one key learning point]
NEXT: [Should they proceed? YES or NO]`;

      const response = await axios.post(
        `${API}/llm/generate`,
        {
          prompt: evaluationPrompt,
          context: { type: 'evaluation', challenge_type: selectedChallengeType }
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const responseText = response.data.generated_text;
      const feedbackMatch = responseText.match(/FEEDBACK:\s*(.+?)(?=INSIGHT:|$)/s);
      const insightMatch = responseText.match(/INSIGHT:\s*(.+?)(?=NEXT:|$)/s);
      const nextMatch = responseText.match(/NEXT:\s*(.+?)$/s);

      const feedback = feedbackMatch ? feedbackMatch[1].trim() : 'Jawaban dicatat.';
      const insight = insightMatch ? insightMatch[1].trim() : '';
      const shouldProceed = nextMatch ? nextMatch[1].includes('YES') : true;

      // Determine if AI considers it correct based on feedback
      const isCorrect = feedback.toLowerCase().includes('benar') || 
                        feedback.toLowerCase().includes('tepat') || 
                        feedback.toLowerCase().includes('correct') ||
                        feedback.toLowerCase().includes('good');

      newHistory.push({
        type: 'assistant',
        content: `${feedback}\n\n💡 ${insight}`,
        isEvaluation: true,
        timestamp: new Date()
      });

      setChatHistory(newHistory);
      setUserAnswers({
        ...userAnswers,
        [currentQuestion.id]: currentAnswer
      });

      // Store evaluation result from AI
      setEvaluationResults({
        ...evaluationResults,
        [currentQuestion.id]: {
          isCorrect,
          feedback,
          insight
        }
      });

      // Move to next question or finish
      if (currentQuestionIdx < generatedChallenge.questions.length - 1 && shouldProceed) {
        setTimeout(() => {
          const nextIdx = currentQuestionIdx + 1;
          setCurrentQuestionIdx(nextIdx);
          const nextQuestion = generatedChallenge.questions[nextIdx];
          setChatHistory(prev => [
            ...prev,
            {
              type: 'assistant',
              content: nextQuestion.question,
              question: nextQuestion,
              timestamp: new Date()
            }
          ]);
          setCurrentAnswer('');
          setConversationState('question');
        }, 1500);
      } else if (currentQuestionIdx >= generatedChallenge.questions.length - 1) {
        setTimeout(() => {
          setShowResults(true);
          calculateAndSubmitResults();
        }, 1500);
      } else {
        setConversationState('question');
      }
    } catch (error) {
      console.error('Error evaluating answer:', error);
      newHistory.push({
        type: 'assistant',
        content: 'Ada error dalam evaluasi. Silakan lanjut ke soal berikutnya.',
        timestamp: new Date()
      });
      setChatHistory(newHistory);
      setConversationState('question');
    } finally {
      setIsEvaluating(false);
    }
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

  function stringSimilarity(a, b) {
    if (!a || !b) return 0;
    a = a.trim().toLowerCase();
    b = b.trim().toLowerCase();
    if (a === b) return 1;
    // Levenshtein distance
    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }
    const distance = matrix[b.length][a.length];
    const maxLen = Math.max(a.length, b.length);
    return maxLen === 0 ? 1 : 1 - distance / maxLen;
  }

  const calculateAndSubmitResults = async () => {
    if (!generatedChallenge) return;

    let correctCount = 0;
    let scoredQuestions = 0;
    let similarityScores = {};

    generatedChallenge.questions.forEach(q => {
      const userAnswer = userAnswers[q.id];
      if (q.correct_answer !== null && q.correct_answer !== undefined) {
        scoredQuestions++;
        
        // Use stored evaluation result from AI (for chatbot flow)
        const aiEval = evaluationResults[q.id];
        if (aiEval) {
          // Use AI's evaluation result
          if (aiEval.isCorrect) correctCount++;
          similarityScores[q.id] = aiEval.isCorrect ? 1 : 0;
        } else if (userAnswer) {
          // Fallback: if no AI evaluation stored, use string matching
          const normalize = v => (v === null || v === undefined) ? '' : String(v).trim().toLowerCase();
          const ua = normalize(userAnswer);
          let correctVals = [];
          if (Array.isArray(q.correct_answer)) {
            correctVals = q.correct_answer.map(c => normalize(c));
          } else {
            correctVals = [normalize(q.correct_answer)];
          }
          // MCQ: exact match
          if (q.options && q.options.length > 0) {
            if (correctVals.includes(ua)) correctCount++;
            similarityScores[q.id] = correctVals.includes(ua) ? 1 : 0;
          } else {
            // Essay: use similarity
            let maxSim = 0;
            correctVals.forEach(cv => {
              const sim = stringSimilarity(ua, cv);
              if (sim > maxSim) maxSim = sim;
            });
            similarityScores[q.id] = maxSim;
            if (maxSim >= 0.7) correctCount++; // threshold for 'correct'
          }
        } else {
          similarityScores[q.id] = 0;
        }
      }
    });

    const score = scoredQuestions > 0 ? Math.round((correctCount / scoredQuestions) * 100) : 0;
    setFinalScore(score);
    setShowResults(true);
    // Save similarity scores for review
    window._aiChallengeSimilarityScores = similarityScores;

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
        simulation_type: 'ai_challenge',
        type: 'ai_challenge', // For backwards compatibility
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
                  <label className="block text-sm font-medium mb-2">Language</label>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="indonesian">🇮🇩 Indonesian</SelectItem>
                      <SelectItem value="english">🇬🇧 English</SelectItem>
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

  // Challenge Display Screen - Chatbot Style
  if (generatedChallenge && !showResults) {
    const question = generatedChallenge.questions[currentQuestionIdx];
    const hasOptions = question.options && question.options.length > 0;

    return (
      <div className="max-w-3xl mx-auto p-6 h-screen flex flex-col">
        {/* Header */}
        <div className="mb-4">
          <h2 className="text-2xl font-bold mb-2">{generatedChallenge.challenge_title}</h2>
          <div className="flex items-center justify-between">
            <Badge variant="outline">
              {currentQuestionIdx + 1} / {generatedChallenge.questions.length}
            </Badge>
            <div className="w-40 bg-gray-300 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{ width: `${((currentQuestionIdx + 1) / generatedChallenge.questions.length) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Chat Container */}
        <div className="flex-1 overflow-y-auto mb-4 space-y-4 bg-gradient-to-b from-gray-900 to-gray-800 p-4 rounded-lg">
          {chatHistory.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-2xl px-4 py-3 rounded-lg ${
                  msg.type === 'user'
                    ? 'bg-blue-600 text-white rounded-br-none'
                    : 'bg-gray-700 text-gray-100 rounded-bl-none'
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>
                {msg.question && (
                  <div className="mt-3 pt-3 border-t border-gray-600">
                    {/* Question metadata */}
                    {msg.question.email_data && (
                      <div className="text-sm space-y-1 mt-2">
                        <p><strong>From:</strong> {renderSafe(msg.question.email_data.from)}</p>
                        <p><strong>Subject:</strong> {renderSafe(msg.question.email_data.subject)}</p>
                        {msg.question.email_data.body && (
                          <div className="mt-2 p-2 bg-gray-600 rounded text-xs">
                            <p className="whitespace-pre-wrap">{renderSafe(msg.question.email_data.body)}</p>
                          </div>
                        )}
                      </div>
                    )}
                    {msg.question.content && (
                      <div className="text-sm mt-2 p-2 bg-gray-600 rounded">
                        <p className="whitespace-pre-wrap">{renderSafe(msg.question.content)}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          {isEvaluating && (
            <div className="flex justify-start">
              <div className="bg-gray-700 text-gray-100 px-4 py-3 rounded-lg rounded-bl-none">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            </div>
          )}
        </div>

        {/* Answer Input - MCQ Options */}
        {hasOptions && (
          <div className="space-y-2 mb-4">
            {question.options.map((option, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setCurrentAnswer((option && option.text) ? option.text : option);
                }}
                disabled={isEvaluating}
                className={`w-full p-3 rounded-lg border-2 transition-all text-left ${
                  currentAnswer === ((option && option.text) ? option.text : option)
                    ? 'border-cyan-400 bg-cyan-500 bg-opacity-20 text-white'
                    : 'border-gray-500 hover:border-gray-400 text-gray-100'
                }`}
              >
                <span className="font-semibold">{String.fromCharCode(65 + idx)}.</span>{' '}
                {renderSafe((option && option.text) ? option.text : option)}
              </button>
            ))}
          </div>
        )}

        {/* Answer Input - Open-ended */}
        {!hasOptions && (
          <div className="mb-4">
            <textarea
              value={currentAnswer}
              onChange={(e) => setCurrentAnswer(e.target.value)}
              placeholder="Tulis analisis atau jawaban Anda di sini..."
              disabled={isEvaluating}
              className="w-full p-3 border-2 border-gray-600 rounded-lg bg-gray-800 text-white placeholder-gray-500 focus:border-cyan-400 focus:outline-none"
              rows="3"
            />
          </div>
        )}

        {/* Submit Button */}
        <Button
          onClick={submitAnswer}
          disabled={!currentAnswer.trim() || isEvaluating}
          className="w-full"
        >
          {isEvaluating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              AI sedang menilai...
            </>
          ) : (
            <>
              Submit Jawaban
              <ChevronRight className="w-4 h-4 ml-2" />
            </>
          )}
        </Button>
      </div>
    );
  }  // Results Screen
  if (showResults) {
    const totalQuestions = generatedChallenge.questions.length;
    const answeredQuestions = Object.keys(userAnswers).length;
    
    // Use AI evaluation results for correctness
    const correctAnswers = Object.keys(userAnswers).filter(qId => {
      const evalResult = evaluationResults[qId];
      return evalResult && evalResult.isCorrect;
    }).length;

    return (
      <div className="max-w-4xl mx-auto p-6">
        {/* Score Card */}
        <Card className="mb-6 p-8 text-center bg-gray from-blue-50 to-purple-50">
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
              const evalResult = evaluationResults[question.id];
              const isCorrect = evalResult ? evalResult.isCorrect : false;
              
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
                      {evalResult && (
                        <p className="text-xs mt-1 text-blue-700 italic">{evalResult.feedback}</p>
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
