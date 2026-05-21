import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import api from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import {
  Settings as SettingsIcon, Globe, Zap, Key, RefreshCw, ExternalLink,
  Server, Wifi, WifiOff, Check, ChevronDown, Search, Shield, UserCog
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import SectionCard from '../components/SectionCard';

function AdminPanel() {
  const { t } = useTranslation();
  const [promoteUsername, setPromoteUsername] = useState('');
  const [promoteRole, setPromoteRole] = useState('trainer');
  const [promoting, setPromoting] = useState(false);

  const handlePromote = async (e) => {
    e.preventDefault();
    if (!promoteUsername) return;
    setPromoting(true);
    try {
      const res = await api.post('/auth/promote', { username: promoteUsername, role: promoteRole });
      toast.success(res.data.message);
      setPromoteUsername('');
    } catch (err) {
      toast.error(err.response?.data?.detail || t('errors.generic'));
    } finally {
      setPromoting(false);
    }
  };

  return (
    <SectionCard title="User Management" icon={UserCog}>
      <p className="text-[10px] text-muted-foreground font-mono mb-4 leading-relaxed">
        Promote users to Trainer role. Trainers can manage training groups, assign exercises to users, and view assessment reports.
      </p>
      <form onSubmit={handlePromote} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="font-mono uppercase text-xs">Username</Label>
            <Input
              value={promoteUsername}
              onChange={e => setPromoteUsername(e.target.value)}
              className="font-mono text-xs mt-1"
              placeholder="username_to_promote"
              required
            />
          </div>
          <div>
            <Label className="font-mono uppercase text-xs">New Role</Label>
            <Select value={promoteRole} onValueChange={setPromoteRole}>
              <SelectTrigger className="font-mono text-xs mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="trainer">Trainer</SelectItem>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button type="submit" disabled={promoting} variant="outline" className="text-xs uppercase tracking-widest">
          <Shield className="w-3.5 h-3.5 mr-2" />
          {promoting ? t('common.loading') : 'Promote User'}
        </Button>
      </form>
    </SectionCard>
  );
}


export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [settings, setSettings] = useState({
    language: 'en',
    theme: 'dark',
    reduce_motion: false,
    llm_enabled: false
  });
  const [llmConfigs, setLlmConfigs] = useState([]);
  const [providers, setProviders] = useState({});
  const [selectedProvider, setSelectedProvider] = useState('openrouter');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [models, setModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [localStatus, setLocalStatus] = useState(null); // null, 'connected', 'disconnected'

  useEffect(() => {
    loadSettings();
    loadLLMConfigs();
    loadProviders();
  }, []);

  useEffect(() => {
    loadModels(selectedProvider);
  }, [selectedProvider]);

  const loadSettings = async () => {
    try {
      const response = await api.get('/settings');
      setSettings(response.data);
    } catch (error) {
      console.error('Failed to load settings');
    }
  };

  const loadProviders = async () => {
    try {
      const response = await api.get('/llm/providers');
      setProviders(response.data);
    } catch (error) {
      console.error('Failed to load providers');
    }
  };

  const loadLLMConfigs = async () => {
    try {
      const response = await api.get('/llm/config');
      setLlmConfigs(response.data);
    } catch (error) {
      console.error('Failed to load LLM configs', error);
    }
  };

  const loadModels = async (provider, forceRefresh = false) => {
    setModelsLoading(true);
    setModelSearch('');
    try {
      const endpoint = forceRefresh
        ? `/llm/models/${provider}/refresh${baseUrl ? `?base_url=${encodeURIComponent(baseUrl)}` : ''}`
        : `/llm/models/${provider}`;
      const response = await api.get(endpoint);
      const data = response.data;
      setModels(data.models || []);
      if (data.models?.length > 0 && !selectedModel) {
        setSelectedModel(data.models[0].id);
      }
      if (provider === 'local') {
        setLocalStatus(data.models?.length > 0 ? 'connected' : 'disconnected');
      } else {
        setLocalStatus(null);
      }
    } catch (error) {
      console.error('Failed to load models', error);
      setModels([]);
      if (provider === 'local') setLocalStatus('disconnected');
    } finally {
      setModelsLoading(false);
    }
  };

  const updateSettings = async (updates) => {
    try {
      await api.put('/settings', updates);
      setSettings({ ...settings, ...updates });
      toast.success(t('settings.settings_updated'));
    } catch (error) {
      toast.error(t('errors.generic'));
    }
  };

  const saveLLMConfig = async () => {
    if (selectedProvider !== 'local' && !apiKey) {
      toast.error('Please enter an API key');
      return;
    }
    const finalModel = customModel || selectedModel;
    if (!finalModel) {
      toast.error('Please select a model');
      return;
    }
    try {
      await api.post('/llm/config', {
        provider: selectedProvider,
        api_key: apiKey || '',
        model_name: finalModel,
        base_url: selectedProvider === 'local'
          ? (baseUrl || 'http://localhost:11434/v1')
          : (selectedProvider === 'openrouter' ? 'https://openrouter.ai/api/v1' : ''),
        enabled: true,
      });
      setApiKey('');
      setCustomModel('');
      loadLLMConfigs();
      toast.success(`${providers[selectedProvider]?.name || selectedProvider} configured with ${finalModel}`);
    } catch (error) {
      toast.error(t('errors.generic'));
    }
  };

  const handleLanguageChange = (lang) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('soceng_language', lang);
    updateSettings({ language: lang });
  };

  const providerInfo = providers[selectedProvider] || {};
  const filteredModels = models.filter(m =>
    !modelSearch || m.name?.toLowerCase().includes(modelSearch.toLowerCase()) || m.id?.toLowerCase().includes(modelSearch.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto space-y-8 p-4">
      <div>
        <h1 className="text-3xl font-bold font-mono uppercase tracking-widest text-primary">{t('settings.title')}</h1>
        <p className="text-muted-foreground font-mono">Configure your Pretexta preferences</p>
      </div>

      {/* Admin Panel — only for admin users */}
      {isAdmin && <AdminPanel />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* LEFT COLUMN */}
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
                  <SelectTrigger>
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
                />
              </div>
            </div>
          </div>

          {/* LLM Configuration */}
          <div className="glass-panel p-6 space-y-6">
            <div className="flex items-center space-x-3 mb-4">
              <Zap className="w-6 h-6 text-yellow-500" />
              <h2 className="text-2xl font-bold">{t('settings.llm_config')}</h2>
            </div>

            {/* Provider Selection */}
            <div className="space-y-3">
              <Label className="font-mono text-xs uppercase tracking-widest">Select Provider</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {Object.entries(providers).map(([key, info]) => (
                  <button
                    key={key}
                    onClick={() => { setSelectedProvider(key); setSelectedModel(''); setApiKey(''); setCustomModel(''); }}
                    className={`p-3 border text-left transition-all ${
                      selectedProvider === key
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-white/10 hover:border-primary/50 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {key === 'local' ? <Server className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                      <span className="font-mono text-sm font-bold">{info.name}</span>
                    </div>
                    {info.recommended && (
                      <span className="text-[9px] bg-primary/20 text-primary px-1 mt-1 inline-block">RECOMMENDED</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Provider Description */}
            {providerInfo.description && (
              <div className="p-3 border border-primary/20 bg-primary/5 text-sm text-muted-foreground">
                {providerInfo.description}
                {providerInfo.signup_url && (
                  <a
                    href={providerInfo.signup_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline ml-2 inline-flex items-center gap-1"
                  >
                    Get API Key <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            )}

            {/* API Key / Base URL */}
            <div className="space-y-4">
              {selectedProvider === 'local' ? (
                <div className="space-y-3">
                  <Label className="flex items-center space-x-2">
                    <Server className="w-4 h-4" />
                    <span>Server Endpoint</span>
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      placeholder={providerInfo.placeholder || 'http://localhost:11434/v1'}
                      className="font-mono flex-1"
                    />
                    <Button
                      variant="outline"
                      onClick={() => loadModels('local', true)}
                      disabled={modelsLoading}
                    >
                      <RefreshCw className={`w-4 h-4 ${modelsLoading ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>

                  {/* Quick presets */}
                  {providerInfo.presets && (
                    <div className="flex gap-2 flex-wrap">
                      {Object.entries(providerInfo.presets).map(([name, url]) => (
                        <button
                          key={name}
                          onClick={() => { setBaseUrl(url); setTimeout(() => loadModels('local', true), 100); }}
                          className="px-2 py-1 text-[10px] font-mono border border-white/10 hover:border-primary/50 text-muted-foreground hover:text-primary transition-all"
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Connection status */}
                  {localStatus && (
                    <div className={`flex items-center gap-2 text-xs font-mono ${localStatus === 'connected' ? 'text-green-400' : 'text-red-400'}`}>
                      {localStatus === 'connected' ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                      {localStatus === 'connected' ? `Connected - ${models.length} models found` : 'Not connected. Is the server running?'}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <Label className="flex items-center space-x-2">
                    <Key className="w-4 h-4" />
                    <span>API Key</span>
                  </Label>
                  <Input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={providerInfo.placeholder || 'sk-...'}
                    className="font-mono"
                  />
                </div>
              )}

              {/* Model Selection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="font-mono text-xs uppercase tracking-widest">Select Model</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => loadModels(selectedProvider, true)}
                    disabled={modelsLoading}
                    className="text-xs"
                  >
                    <RefreshCw className={`w-3 h-3 mr-1 ${modelsLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>

                {/* Search for large catalogs */}
                {models.length > 10 && (
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={modelSearch}
                      onChange={(e) => setModelSearch(e.target.value)}
                      placeholder="Search models..."
                      className="pl-9 font-mono text-sm"
                    />
                  </div>
                )}

                {modelsLoading ? (
                  <div className="p-4 text-center text-muted-foreground font-mono text-sm animate-pulse">
                    Loading models...
                  </div>
                ) : filteredModels.length > 0 ? (
                  <div className="max-h-64 overflow-y-auto border border-white/10 divide-y divide-white/5">
                    {filteredModels.map((model) => (
                      <button
                        key={model.id}
                        onClick={() => { setSelectedModel(model.id); setCustomModel(''); }}
                        className={`w-full text-left p-3 flex items-center justify-between transition-all ${
                          selectedModel === model.id
                            ? 'bg-primary/10 text-primary'
                            : 'hover:bg-white/5 text-foreground'
                        }`}
                      >
                        <div>
                          <span className="text-sm font-mono block">{model.name}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {model.id}
                            {model.context ? ` | ${(model.context / 1000).toFixed(0)}K ctx` : ''}
                            {model.free && <span className="ml-1 text-green-400">FREE</span>}
                            {model.local && <span className="ml-1 text-blue-400">LOCAL</span>}
                          </span>
                        </div>
                        {selectedModel === model.id && <Check className="w-4 h-4 text-primary" />}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 text-center text-muted-foreground font-mono text-xs border border-dashed border-white/10">
                    {selectedProvider === 'local'
                      ? 'No models found. Start your local server first.'
                      : 'No models available'}
                  </div>
                )}

                {/* Custom model input */}
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Or enter custom model ID:</Label>
                  <Input
                    value={customModel}
                    onChange={(e) => { setCustomModel(e.target.value); if (e.target.value) setSelectedModel(''); }}
                    placeholder="e.g. my-custom-model"
                    className="font-mono text-sm"
                  />
                </div>
              </div>

              {/* Save */}
              <Button onClick={saveLLMConfig} className="w-full">
                <Check className="w-4 h-4 mr-2" />
                Save {providers[selectedProvider]?.name || selectedProvider} Configuration
              </Button>
            </div>

            {/* Configured Providers */}
            {llmConfigs.length > 0 && (
              <div className="space-y-3 pt-4 border-t border-white/10">
                <Label className="font-mono text-xs uppercase tracking-widest">Active Providers</Label>
                <div className="space-y-2">
                  {llmConfigs.map((config) => (
                    <div
                      key={config.provider}
                      className="flex items-center justify-between p-3 bg-muted/10 rounded border border-muted/30"
                    >
                      <div className="flex items-center space-x-3">
                        <div>
                          <span className="font-mono text-sm font-bold">{config.provider.toUpperCase()}</span>
                          {config.model_name && (
                            <span className="text-xs text-muted-foreground ml-2">({config.model_name})</span>
                          )}
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] ${
                          config.enabled ? 'bg-primary/20 text-primary' : 'bg-muted/20 text-muted-foreground'
                        }`}>
                          {config.enabled ? 'ACTIVE' : 'DISABLED'}
                        </span>
                        {config.base_url && (
                          <span className="text-[10px] text-muted-foreground font-mono truncate max-w-32">
                            {config.base_url}
                          </span>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={async () => {
                          try {
                            await api.post('/llm/config', {
                              provider: config.provider,
                              api_key: '',
                              enabled: false,
                            });
                            loadLLMConfigs();
                            toast.success(`${config.provider} removed`);
                          } catch (error) {
                            toast.error('Failed to revoke');
                          }
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT SIDEBAR */}
        <div className="lg:col-span-1">
          <div className="glass-panel p-6 space-y-6 lg:sticky lg:top-8">
            <h3 className="text-lg font-bold uppercase tracking-wider text-primary">Provider Guide</h3>
            <hr className="border-border" />

            <div className="space-y-4 text-sm">
              <div className="space-y-2">
                <h4 className="font-bold text-primary/80 flex items-center gap-2">
                  <Zap className="w-4 h-4" /> Best Free Options
                </h4>
                <ul className="space-y-1 text-muted-foreground text-xs">
                  <li><span className="text-primary">OpenRouter</span> - Many free models (Llama, Gemini)</li>
                  <li><span className="text-primary">Groq</span> - Ultra-fast Llama, free tier</li>
                  <li><span className="text-primary">Gemini</span> - Generous free limits</li>
                  <li><span className="text-primary">Local</span> - Fully free with your hardware</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-primary/80 flex items-center gap-2">
                  <Server className="w-4 h-4" /> Local LLM Setup
                </h4>
                <ul className="space-y-1 text-muted-foreground text-xs">
                  <li><span className="text-blue-400">Ollama</span>: Install, run <code className="bg-black/50 px-1">ollama serve</code>, pull a model</li>
                  <li><span className="text-blue-400">LM Studio</span>: Download, load model, start server on port 1234</li>
                  <li><span className="text-blue-400">llama.cpp</span>: Start with <code className="bg-black/50 px-1">--port 8080</code></li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-primary/80">Recommended Models</h4>
                <ul className="space-y-1 text-muted-foreground text-xs">
                  <li><span className="text-yellow-400">Best quality</span>: Claude 3.5 Sonnet, GPT-4o</li>
                  <li><span className="text-green-400">Best free</span>: Llama 3.3 70B (Groq/OpenRouter)</li>
                  <li><span className="text-blue-400">Best local</span>: Llama 3.1 8B, Mistral 7B, Qwen 2.5</li>
                  <li><span className="text-purple-400">Best speed</span>: Groq (any model)</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
