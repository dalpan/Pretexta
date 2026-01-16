import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Send, User, Bot, Shield, AlertTriangle, RefreshCw, Trophy, Skull } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

import { AI_PERSONAS } from '../data/aiPersonas';

export default function AIChatPage() {
    const { t } = useTranslation();
    const [selectedPersona, setSelectedPersona] = useState(null);
    const [messages, setMessages] = useState([]);
    const [inputValue, setInputValue] = useState('');
    const [loading, setLoading] = useState(false);
    const [gameStatus, setGameStatus] = useState('idle'); // idle, active, won, lost
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const startChat = (persona) => {
        setSelectedPersona(persona);
        setGameStatus('active');
        setMessages([
            {
                role: 'system',
                content: `Simulation Started: You are chatting with **${persona.name}**. Objective: ${persona.goal}`
            },
            {
                role: 'assistant',
                content: persona.openingLine
            }
        ]);
    };

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!inputValue.trim() || loading || gameStatus !== 'active') return;

        const userMsg = { role: 'user', content: inputValue };
        const newHistory = [...messages, userMsg];
        setMessages(newHistory);
        setInputValue('');
        setLoading(true);

        try {
            const token = localStorage.getItem('soceng_token');
            const response = await axios.post(
                `${API}/llm/chat`,
                {
                    history: newHistory.filter(m => m.role !== 'system'),
                    persona: selectedPersona,
                    message: userMsg.content
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            const aiMsg = response.data;

            setMessages(prev => [...prev, { role: 'assistant', content: aiMsg.content }]);

            if (aiMsg.status === 'failed' || aiMsg.status === 'completed') {
                const isWin = aiMsg.status === 'completed';
                setGameStatus(isWin ? 'won' : 'lost');
                toast[isWin ? 'success' : 'error'](isWin ? "Attack blocked!" : "You were compromised!", { duration: 5000 });

                // Save Result to History
                await axios.post(`${API}/simulations`, {
                    type: 'ai_challenge',
                    status: 'completed',
                    score: isWin ? 100 : 0,
                    title: `AI Battle: ${selectedPersona.name}`,
                    challenge_Title: `AI Battle: ${selectedPersona.name}`,
                    simulation_type: 'ai_challenge',
                    completed_at: new Date().toISOString()
                }, { headers: { Authorization: `Bearer ${token}` } });
            }

        } catch (error) {
            console.error(error);
            toast.error('AI Connection lost. Try again.');
        } finally {
            setLoading(false);
        }
    };

    const resetGame = () => {
        setSelectedPersona(null);
        setMessages([]);
        setGameStatus('idle');
    };

    // --- RENDER HELPERS ---

    if (!selectedPersona) {
        return (
            <div className="container mx-auto p-6 max-w-6xl animate-in fade-in">
                <div className="text-center mb-10">
                    <h1 className="text-3xl font-bold font-mono uppercase tracking-widest text-primary">
                        Realtime AI Simulations
                    </h1>
                    <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                        Test your social engineering defense skills against advanced AI personas.
                        Choose a scenario below to begin.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {AI_PERSONAS.map(p => (
                        <Card
                            key={p.id}
                            className="group relative overflow-hidden p-6 hover:shadow-lg transition-all cursor-pointer border-muted hover:border-primary/50"
                            onClick={() => startChat(p)}
                        >
                            <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                <Bot className="w-24 h-24 rotate-12" />
                            </div>

                            <div className="relative z-10 flex flex-col h-full">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-colors duration-300">
                                        <Bot className="w-6 h-6" />
                                    </div>
                                    <Badge variant={
                                        p.difficulty === 'Easy' ? 'secondary' :
                                            p.difficulty === 'Medium' ? 'default' : 'destructive'
                                    } className="capitalize">
                                        {p.difficulty}
                                    </Badge>
                                </div>

                                <h3 className="font-bold text-xl mb-1 group-hover:text-primary transition-colors">{p.name}</h3>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{p.category}</p>

                                <p className="text-sm text-muted-foreground mb-6 flex-grow line-clamp-3">
                                    {p.description}
                                </p>

                                <div className="mt-auto pt-4 border-t border-border/50 flex items-center justify-between text-sm">
                                    <span className="font-medium text-primary flex items-center">
                                        Start Simulation <Send className="w-3 h-3 ml-2 group-hover:translate-x-1 transition-transform" />
                                    </span>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-4 max-w-3xl h-[calc(100vh-100px)] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 p-4 border rounded-xl bg-card shadow-sm">
                <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-destructive/10 rounded-full flex items-center justify-center text-destructive animate-pulse">
                        <Bot className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="font-bold">{selectedPersona.name}</h2>
                        <p className="text-xs text-muted-foreground">AI Attacker • Real-time</p>
                    </div>
                </div>
                <Button variant="ghost" size="sm" onClick={resetGame}>
                    <RefreshCw className="w-4 h-4 mr-2" /> End Session
                </Button>
            </div>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto space-y-4 p-4 rounded-xl border bg-muted/5 mb-4 scroll-smooth">
                {messages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {msg.role === 'system' ? (
                            <div className="w-full text-center my-4">
                                <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-1 rounded">{msg.content}</span>
                            </div>
                        ) : (
                            <div className={`max-w-[80%] p-3 rounded-2xl ${msg.role === 'user'
                                ? 'bg-primary text-primary-foreground rounded-br-none'
                                : 'bg-card border shadow-sm rounded-bl-none'
                                }`}>
                                <p className="text-sm md:text-base leading-relaxed">{msg.content}</p>
                            </div>
                        )}
                    </div>
                ))}
                {loading && (
                    <div className="flex justify-start">
                        <div className="bg-card border p-3 rounded-2xl rounded-bl-none flex space-x-2 items-center">
                            <div className="w-2 h-2 bg-primary/50 rounded-full animate-bounce" />
                            <div className="w-2 h-2 bg-primary/50 rounded-full animate-bounce [animation-delay:0.2s]" />
                            <div className="w-2 h-2 bg-primary/50 rounded-full animate-bounce [animation-delay:0.4s]" />
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Status Banners */}
            {gameStatus === 'won' && (
                <Card className="p-4 mb-4 bg-green-500/10 border-green-500/50 flex items-center gap-3">
                    <Trophy className="w-8 h-8 text-green-500" />
                    <div>
                        <h3 className="font-bold text-green-600">You Won!</h3>
                        <p className="text-sm text-muted-foreground">You successfully identified and blocked the social engineering attempt.</p>
                    </div>
                </Card>
            )}

            {gameStatus === 'lost' && (
                <Card className="p-4 mb-4 bg-red-500/10 border-red-500/50 flex items-center gap-3">
                    <Skull className="w-8 h-8 text-red-500" />
                    <div>
                        <h3 className="font-bold text-red-600">Compromised!</h3>
                        <p className="text-sm text-muted-foreground">You gave away sensitive info or agreed to a malicious request.</p>
                    </div>
                </Card>
            )}

            {/* Input Area */}
            <form onSubmit={handleSendMessage} className="flex gap-2">
                <Input
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Type your response..."
                    disabled={gameStatus !== 'active' || loading}
                    className="flex-1"
                    autoFocus
                />
                <Button type="submit" disabled={gameStatus !== 'active' || loading || !inputValue.trim()}>
                    <Send className="w-4 h-4" />
                </Button>
            </form>
        </div>
    );
}
