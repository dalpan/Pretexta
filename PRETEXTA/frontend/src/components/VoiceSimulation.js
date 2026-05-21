import React, { useState, useEffect, useRef } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Volume2 } from 'lucide-react';
import { Button } from './ui/button';

export default function VoiceSimulation({ persona, onMessage, disabled }) {
  const [isCallActive, setIsCallActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const recognitionRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);

  useEffect(() => {
    // Check for speech recognition support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
          setTranscript(finalTranscript);
          if (onMessage) {
            onMessage(finalTranscript);
          }
        }
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (e) { /* ignore */ }
      }
      synthRef.current.cancel();
    };
  }, [onMessage]);

  const startCall = () => {
    setIsCallActive(true);
    if (recognitionRef.current && !isMuted) {
      try { recognitionRef.current.start(); } catch (e) { /* already started */ }
    }
  };

  const endCall = () => {
    setIsCallActive(false);
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) { /* ignore */ }
    }
    synthRef.current.cancel();
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (recognitionRef.current) {
      if (!isMuted) {
        try { recognitionRef.current.stop(); } catch (e) { /* ignore */ }
      } else {
        try { recognitionRef.current.start(); } catch (e) { /* ignore */ }
      }
    }
  };

  // Text-to-speech for AI responses
  const speakText = (text) => {
    if (!synthRef.current || !text) return;
    synthRef.current.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    synthRef.current.speak(utterance);
  };

  // Expose speakText to parent
  useEffect(() => {
    if (window) {
      window.__pretexta_speak = speakText;
    }
  }, []);

  const hasVoiceSupport = !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  if (!hasVoiceSupport) {
    return (
      <div className="p-4 border border-yellow-500/30 bg-yellow-500/5 text-center">
        <p className="text-xs text-yellow-400 font-mono">Voice simulation requires a browser with Speech Recognition support (Chrome, Edge)</p>
      </div>
    );
  }

  return (
    <div className="glass-panel p-6 text-center space-y-4">
      {/* Phone UI */}
      <div className={`w-24 h-24 mx-auto rounded-full flex items-center justify-center transition-all duration-500 ${
        isCallActive
          ? 'bg-green-500/20 border-2 border-green-500 animate-pulse'
          : 'bg-muted/20 border-2 border-muted'
      }`}>
        <Phone className={`w-10 h-10 ${isCallActive ? 'text-green-500' : 'text-muted-foreground'}`} />
      </div>

      <div>
        <p className="font-mono text-sm text-primary">{persona?.name || 'Unknown Caller'}</p>
        <p className="text-xs text-muted-foreground">
          {isCallActive ? (isSpeaking ? 'Speaking...' : 'Connected') : 'Ready to call'}
        </p>
      </div>

      {/* Speaking indicator */}
      {isSpeaking && (
        <div className="flex items-center justify-center gap-1">
          <Volume2 className="w-4 h-4 text-primary animate-pulse" />
          <div className="flex gap-0.5">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="w-1 bg-primary rounded-full animate-pulse" style={{ height: `${Math.random() * 16 + 4}px`, animationDelay: `${i * 0.1}s` }} />
            ))}
          </div>
        </div>
      )}

      {/* Transcript */}
      {transcript && (
        <div className="p-2 bg-black/30 border border-white/10 text-xs font-mono text-muted-foreground max-h-20 overflow-y-auto">
          You said: "{transcript}"
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-center gap-4">
        {isCallActive ? (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={toggleMute}
              className={isMuted ? 'border-red-500 text-red-500' : ''}
            >
              {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </Button>
            <Button
              onClick={endCall}
              className="bg-red-500 hover:bg-red-600 rounded-full w-14 h-14"
            >
              <PhoneOff className="w-6 h-6" />
            </Button>
          </>
        ) : (
          <Button
            onClick={startCall}
            disabled={disabled}
            className="bg-green-500 hover:bg-green-600 rounded-full w-14 h-14"
          >
            <Phone className="w-6 h-6" />
          </Button>
        )}
      </div>
    </div>
  );
}
