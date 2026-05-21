import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Terminal, Shield, Globe, Check } from 'lucide-react';

export default function InstallerPage({ onComplete }) {
  const { t, i18n } = useTranslation();
  const [step, setStep] = useState(1);
  const [language, setLanguage] = useState('en');
  const [consentGiven, setConsentGiven] = useState(false);
  const [showIntro, setShowIntro] = useState(true);

  const handleLanguageChange = (lang) => {
    setLanguage(lang);
    i18n.changeLanguage(lang);
    localStorage.setItem('soceng_language', lang);
  };

  const handleComplete = () => {
    if (step === 2 && !consentGiven) {
      toast.error('You must consent to continue');
      return;
    }
    if (step === 3) {
      onComplete();
    }
  };

  if (showIntro) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4 grid-bg">
        <div className="glass-panel p-12 max-w-2xl w-full text-center space-y-8">
          <div className="flex items-center justify-center space-x-4">
            <Terminal className="w-16 h-16 text-primary animate-pulse-slow" />
            <h1 className="text-6xl font-bold glitch text-primary">
              Pretexta
            </h1>
          </div>

          <p className="text-xl font-mono text-muted-foreground terminal-typing">
            &gt; Initializing adaptive social engineering simulator...
          </p>

          <Button
            onClick={() => {
              console.log('BEGIN SETUP clicked');
              setShowIntro(false);
            }}
            className="uppercase tracking-wider"
            data-testid="begin-setup-btn"
            type="button"
          >
            BEGIN SETUP
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="glass-panel p-8 max-w-2xl w-full">
        <div className="mb-8">
          <div className="flex items-center space-x-2 mb-4">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${step >= 1 ? 'bg-primary text-background' : 'bg-muted text-muted-foreground'
              }`}>
              {step > 1 ? <Check /> : '1'}
            </div>
            <div className="flex-1 h-1 bg-muted">
              <div className={`h-full bg-primary transition-all ${step >= 2 ? 'w-full' : 'w-0'
                }`} />
            </div>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${step >= 2 ? 'bg-primary text-background' : 'bg-muted text-muted-foreground'
              }`}>
              {step > 2 ? <Check /> : '2'}
            </div>
            <div className="flex-1 h-1 bg-muted">
              <div className={`h-full bg-primary transition-all ${step >= 3 ? 'w-full' : 'w-0'
                }`} />
            </div>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${step >= 3 ? 'bg-primary text-background' : 'bg-muted text-muted-foreground'
              }`}>
              3
            </div>
          </div>
        </div>

        {step === 1 && (
          <div className="space-y-6">
            <div className="space-y-2">
              <Globe className="w-12 h-12 text-primary" />
              <h2 className="text-3xl font-bold">{t('settings.language')}</h2>
              <p className="text-muted-foreground">Choose your preferred language</p>
            </div>

            <Select value={language} onValueChange={handleLanguageChange}>
              <SelectTrigger className="w-full" data-testid="language-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="id">Bahasa Indonesia</SelectItem>
              </SelectContent>
            </Select>

            <Button
              onClick={() => {
                console.log('Next step clicked, current step:', step);
                setStep(2);
              }}
              className="w-full"
              data-testid="next-step-btn"
              type="button"
            >
              NEXT
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="space-y-2">
              <Shield className="w-12 h-12 text-warning" />
              <h2 className="text-3xl font-bold">{t('ethics.title')}</h2>
              <p className="text-muted-foreground">{t('ethics.warning')}</p>
            </div>

            <div className="bg-destructive/10 border border-destructive/50 rounded-lg p-6 space-y-4">
              <h3 className="font-bold text-lg">⚠️ Important Ethical Guidelines</h3>
              <ul className="list-disc list-inside space-y-2 text-sm">
                <li>Use only for authorized security awareness training</li>
                <li>Never use for malicious purposes or unauthorized testing</li>
                <li>All participants must provide informed consent</li>
                <li>Data must be handled according to privacy regulations</li>
                <li>No real credentials or PII should be collected</li>
              </ul>
            </div>

            <div className="flex items-start space-x-3">
              <Checkbox
                id="consent"
                checked={consentGiven}
                onCheckedChange={setConsentGiven}
                data-testid="consent-checkbox"
              />
              <label htmlFor="consent" className="text-sm leading-relaxed">
                {t('ethics.consent_required')}
              </label>
            </div>

            <div className="flex space-x-4">
              <Button
                onClick={() => setStep(1)}
                variant="outline"
                className="w-full"
                type="button"
              >
                BACK
              </Button>
              <Button
                onClick={() => {
                  console.log('Accept ethics clicked, consent:', consentGiven);
                  if (consentGiven) {
                    setStep(3);
                  } else {
                    toast.error('Please accept the ethics agreement');
                  }
                }}
                disabled={!consentGiven}
                className="w-full"
                data-testid="accept-ethics-btn"
                type="button"
              >
                I AGREE
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6 text-center">
            <div className="space-y-4">
              <div className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center mx-auto">
                <Check className="w-10 h-10 text-primary" />
              </div>
              <h2 className="text-3xl font-bold">Setup Complete</h2>
              <p className="text-muted-foreground">
                Pretexta is ready to use. Default credentials:<br />
                <code className="text-primary">soceng / Cialdini@2025!</code>
              </p>
            </div>

            <Button
              onClick={() => {
                console.log('Complete setup clicked');
                handleComplete();
              }}
              className="w-full uppercase tracking-wider"
              data-testid="complete-setup-btn"
              type="button"
            >
              Launch Pretexta
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}