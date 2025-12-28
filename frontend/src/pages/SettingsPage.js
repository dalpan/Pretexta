import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { Settings as SettingsIcon, Globe, Zap, Key } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// --- Komponen Bantuan untuk Sisi Kanan (Deskripsi) ---
const SettingsSidebar = ({ t }) => (
  <div className="glass-panel p-6 space-y-6 lg:sticky lg:top-8 lg:h-fit">
    <h3 className="text-xl font-bold uppercase tracking-wider text-primary">
      {t('settings.sidebar_title')} {/* "Help & Instructions" */}
    </h3>
    <hr className="border-border" />
    
    {/* Instruksi Umum */}
    <div className="space-y-4">
      <h4 className="font-semibold text-lg flex items-center space-x-2 text-primary/80">
        <SettingsIcon className="w-5 h-5" />
        <span>{t('settings.general_title')}</span>
      </h4>
      <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
        <li>
          **{t('settings.language_instruction_bold')}**: {t('settings.language_instruction')}
        </li>
        <li>
          **{t('settings.reduce_motion_instruction_bold')}**: {t('settings.reduce_motion_instruction')}
        </li>
      </ul>
    </div>
    
    <hr className="border-border" />

    {/* Instruksi LLM */}
    <div className="space-y-4">
      <h4 className="font-semibold text-lg flex items-center space-x-2 text-warning/80">
        <Zap className="w-5 h-5" />
        <span>{t('settings.llm_config_title')}</span>
      </h4>
      <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
        <li>
          **{t('settings.api_key_note_bold')}**: {t('settings.api_key_note')}
        </li>
        <li>
          **{t('settings.provider_selection_bold')}**: {t('settings.provider_selection')}
        </li>
        <li>
          **{t('settings.revoke_key_bold')}**: {t('settings.revoke_key')}
        </li>
      </ul>
    </div>
  </div>
);
// --- Akhir Komponen Bantuan ---


export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const [settings, setSettings] = useState({
    language: 'en',
    theme: 'dark',
    reduce_motion: false,
    llm_enabled: false
  });
  const [llmConfigs, setLlmConfigs] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState('openai');
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    loadSettings();
    loadLLMConfigs();
  }, []);

  const loadSettings = async () => {
    try {
      const token = localStorage.getItem('soceng_token');
      const response = await axios.get(`${API}/settings`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSettings(response.data);
    } catch (error) {
      console.error('Failed to load settings');
    }
  };

  const loadLLMConfigs = async () => {
    try {
      const token = localStorage.getItem('soceng_token');
      const response = await axios.get(`${API}/llm/config`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      console.log('Loaded LLM configs:', response.data);
      
      // Show all configs (api_key is masked as '***' by backend)
      setLlmConfigs(response.data);
    } catch (error) {
      console.error('Failed to load LLM configs', error);
    }
  };

  const updateSettings = async (updates) => {
    try {
      const token = localStorage.getItem('soceng_token');
      await axios.put(`${API}/settings`, updates, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSettings({ ...settings, ...updates });
      toast.success('Settings updated');
    } catch (error) {
      toast.error('Failed to update settings');
    }
  };

  const saveLLMConfig = async () => {
    if (!apiKey) {
      toast.error('Please enter an API key');
      return;
    }

    try {
      const token = localStorage.getItem('soceng_token');
      await axios.post(`${API}/llm/config`, {
        provider: selectedProvider,
        api_key: apiKey,
        enabled: true
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setApiKey('');
      loadLLMConfigs();
      toast.success('LLM configuration saved');
    } catch (error) {
      toast.error('Failed to save LLM configuration');
    }
  };

  const handleLanguageChange = (lang) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('soceng_language', lang);
    updateSettings({ language: lang });
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 p-4">
      <div>
        <h1 className="text-4xl font-bold mb-2">{t('settings.title')}</h1>
        <p className="text-muted-foreground font-mono">Configure your Soceng Lab preferences</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* KOLOM KIRI (Pengaturan) */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* General Settings */}
          <div className="glass-panel p-6 space-y-6">
            <div className="flex items-center space-x-3 mb-4">
              <SettingsIcon className="w-6 h-6 text-primary" />
              <h2 className="text-2xl font-bold">General</h2>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="flex items-center space-x-2">
                  <Globe className="w-4 h-4" />
                  <span>{t('settings.language')}</span>
                </Label>
                <Select value={settings.language} onValueChange={handleLanguageChange}>
                  <SelectTrigger data-testid="settings-language-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="id">Bahasa Indonesia</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="reduce-motion">{t('settings.reduce_motion')}</Label>
                <Switch
                  id="reduce-motion"
                  checked={settings.reduce_motion}
                  onCheckedChange={(checked) => updateSettings({ reduce_motion: checked })}
                  data-testid="reduce-motion-toggle"
                />
              </div>
            </div>
          </div>

          {/* LLM Configuration */}
          <div className="glass-panel p-6 space-y-6">
            <div className="flex items-center space-x-3 mb-4">
              <Zap className="w-6 h-6 text-warning" />
              <h2 className="text-2xl font-bold">{t('settings.llm_config')}</h2>
            </div>

            <div className="bg-warning/10 border border-warning/30 rounded-lg p-4">
              <p className="text-sm text-warning">
                ⚠️ LLM features are optional. Enter your own API keys. Usage is subject to provider rate limits and costs.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Provider</Label>
                <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                  <SelectTrigger data-testid="llm-provider-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">OpenAI (GPT-4o)</SelectItem>
                    <SelectItem value="gemini">Google Gemini</SelectItem>
                    <SelectItem value="claude">Anthropic Claude</SelectItem>
                    <SelectItem value="generic">Generic OpenAI-Compatible</SelectItem>
                    <SelectItem value="openrouter">OpenRouter</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="api-key" className="flex items-center space-x-2">
                  <Key className="w-4 h-4" />
                  <span>{t('settings.api_key')}</span>
                </Label>
                <Input
                  id="api-key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="font-mono"
                  data-testid="llm-api-key-input"
                />
              </div>

              <Button onClick={saveLLMConfig} data-testid="save-llm-config-btn">
                Save LLM Configuration
              </Button>
            </div>

            {llmConfigs.length > 0 && (
              <div className="space-y-2">
                <Label>Configured Providers</Label>
                <div className="space-y-2">
                  {llmConfigs.map((config) => (
                    <div
                      key={config.provider}
                      className="flex items-center justify-between p-3 bg-muted/10 rounded border border-muted/30"
                    >
                      <div className="flex items-center space-x-3">
                        <span className="font-mono text-sm font-bold">{config.provider.toUpperCase()}</span>
                        <span className={`px-2 py-1 rounded text-xs ${
                          config.enabled ? 'bg-primary/20 text-primary' : 'bg-muted/20 text-muted-foreground'
                        }`}>
                          {config.enabled ? 'ENABLED' : 'DISABLED'}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={async () => {
                          try {
                            const token = localStorage.getItem('soceng_token');
                            await axios.post(`${API}/llm/config`, {
                              provider: config.provider,
                              api_key: '',
                              enabled: false
                            }, {
                              headers: { Authorization: `Bearer ${token}` }
                            });
                            loadLLMConfigs();
                            toast.success(`${config.provider} API key revoked`);
                          } catch (error) {
                            toast.error('Failed to revoke API key');
                          }
                        }}
                        data-testid={`revoke-${config.provider}-btn`}
                      >
                        Revoke Key
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* KOLOM KANAN (Sidebar Deskripsi) */}
        <div className="lg:col-span-1">
          <SettingsSidebar t={t} />
        </div>
      </div>
    </div>
  );
}