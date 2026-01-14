/**
 * Model Registry
 * 
 * Defines all available AI models for GitHub Copilot and OpenAI Codex
 * Updated January 2026
 */

var ZoteroAIAssistant = ZoteroAIAssistant || {};

ZoteroAIAssistant.ModelRegistry = {
  // GitHub Copilot models
  COPILOT_MODELS: [
    // Anthropic - Claude
    {
      id: "claude-sonnet-4.5",
      name: "Claude Sonnet 4.5",
      provider: "anthropic",
      description: "Latest Claude Sonnet - balanced performance",
      premium: 1,
      default: true
    },
    {
      id: "claude-sonnet-4",
      name: "Claude Sonnet 4",
      provider: "anthropic",
      description: "Previous Claude Sonnet - reliable and fast",
      premium: 1
    },
    {
      id: "claude-opus-4.5",
      name: "Claude Opus 4.5",
      provider: "anthropic",
      description: "Most capable Claude model",
      premium: 3
    },
    {
      id: "claude-opus-4.1",
      name: "Claude Opus 4.1",
      provider: "anthropic",
      description: "Powerful reasoning and analysis",
      premium: 10
    },
    {
      id: "claude-haiku-4.5",
      name: "Claude Haiku 4.5",
      provider: "anthropic",
      description: "Fast and cost-effective",
      premium: 0.33
    },
    
    // Google - Gemini
    {
      id: "gemini-2.5-pro",
      name: "Gemini 2.5 Pro",
      provider: "google",
      description: "Google's advanced reasoning model",
      premium: 1
    },
    {
      id: "gemini-3-pro",
      name: "Gemini 3 Pro",
      provider: "google",
      description: "Latest Gemini - preview",
      premium: 1
    },
    {
      id: "gemini-3-flash",
      name: "Gemini 3 Flash",
      provider: "google",
      description: "Fast Gemini model - preview",
      premium: 0.33
    },
    
    // OpenAI
    {
      id: "gpt-4.1",
      name: "GPT-4.1",
      provider: "openai",
      description: "Smartest non-reasoning model",
      premium: 0
    },
    {
      id: "gpt-5",
      name: "GPT-5",
      provider: "openai",
      description: "Intelligent reasoning model",
      premium: 1
    },
    {
      id: "gpt-5-mini",
      name: "GPT-5 Mini",
      provider: "openai",
      description: "Fast and cost-efficient",
      premium: 0
    },
    {
      id: "gpt-5.1",
      name: "GPT-5.1",
      provider: "openai",
      description: "Previous GPT-5 iteration",
      premium: 1
    },
    {
      id: "gpt-5.1-codex",
      name: "GPT-5.1 Codex",
      provider: "openai",
      description: "Optimized for agentic coding",
      premium: 1
    },
    {
      id: "gpt-5.1-codex-mini",
      name: "GPT-5.1 Codex Mini",
      provider: "openai",
      description: "Smaller, cost-effective version",
      premium: 0.33
    },
    {
      id: "gpt-5.1-codex-max",
      name: "GPT-5.1 Codex Max",
      provider: "openai",
      description: "Most intelligent coding model for long-horizon tasks",
      premium: 1
    },
    {
      id: "gpt-5.2",
      name: "GPT-5.2",
      provider: "openai",
      description: "Best for coding and agentic tasks",
      premium: 1
    },
    {
      id: "gpt-5-codex",
      name: "GPT-5 Codex",
      provider: "openai",
      description: "Previous Codex generation",
      premium: 1
    },
    
    // xAI
    {
      id: "grok-code-fast-1",
      name: "Grok Code Fast 1",
      provider: "xai",
      description: "xAI's fast coding model",
      premium: 0.25
    },
    
    // Other
    {
      id: "raptor-mini",
      name: "Raptor mini",
      provider: "other",
      description: "Fine-tuned GPT-5 mini",
      premium: 0
    }
  ],
  
  /**
   * Get models for a provider (only Copilot supported)
   * @param {string} provider - "copilot"
   * @returns {array}
   */
  getModels(provider) {
    return this.COPILOT_MODELS;
  },
  
  /**
   * Get the default model for a provider
   * @param {string} provider - "copilot" or "codex"
   * @returns {object}
   */
  getDefaultModel(provider) {
    const models = this.getModels(provider);
    return models.find(m => m.default) || models[0];
  },
  
  /**
   * Get a specific model by ID
   * @param {string} provider - "copilot" or "codex"
   * @param {string} modelId - Model ID
   * @returns {object|null}
   */
  getModel(provider, modelId) {
    const models = this.getModels(provider);
    return models.find(m => m.id === modelId) || null;
  },
  
  /**
   * Get models grouped by provider (for Copilot)
   * @returns {object}
   */
  getCopilotModelsByProvider() {
    const grouped = {};
    
    for (const model of this.COPILOT_MODELS) {
      const provider = model.provider;
      if (!grouped[provider]) {
        grouped[provider] = [];
      }
      grouped[provider].push(model);
    }
    
    return grouped;
  },
  
  /**
   * Get provider display name
   * @param {string} providerId
   * @returns {string}
   */
  getProviderName(providerId) {
    const names = {
      anthropic: "Anthropic",
      google: "Google",
      openai: "OpenAI",
      xai: "xAI",
      other: "Other"
    };
    return names[providerId] || providerId;
  }
};
