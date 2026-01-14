/**
 * Authentication Dialog Controller
 * 
 * Handles the authentication flow for both GitHub Copilot (Device Flow)
 * and OpenAI Codex (OAuth PKCE).
 */

var ZoteroAIAssistantAuth = {
  // Current provider being authenticated
  provider: "copilot",
  
  // State
  isAuthenticating: false,
  
  /**
   * Initialize the auth dialog
   */
  init() {
    Zotero.debug("ZoteroAIAssistantAuth: Initializing");
    
    // Load ZoteroAIAssistant from main window
    this.loadModules();
    
    // Get provider from window arguments
    if (window.arguments && window.arguments[0]) {
      this.provider = window.arguments[0].provider || "copilot";
    }
    
    // Setup UI based on provider
    this.setupUI();
    
    // Bind events
    this.bindEvents();
  },
  
  /**
   * Load modules from main Zotero window
   */
  loadModules() {
    if (typeof ZoteroAIAssistant === "undefined") {
      const mainWindow = Services.wm.getMostRecentWindow("navigator:browser");
      if (mainWindow && mainWindow.ZoteroAIAssistant) {
        window.ZoteroAIAssistant = mainWindow.ZoteroAIAssistant;
      }
    }
  },
  
  /**
   * Setup UI for the selected provider
   */
  setupUI() {
    const title = document.getElementById("zai-auth-title");
    const githubSection = document.getElementById("zai-auth-github");
    const openaiSection = document.getElementById("zai-auth-openai");
    
    if (this.provider === "copilot") {
      title.textContent = "Connect to GitHub Copilot";
      githubSection.style.display = "block";
      openaiSection.style.display = "none";
    } else {
      title.textContent = "Connect to OpenAI Codex";
      githubSection.style.display = "none";
      openaiSection.style.display = "block";
    }
  },
  
  /**
   * Bind event listeners
   */
  bindEvents() {
    // GitHub Copilot events
    document.getElementById("zai-github-start-btn")?.addEventListener("click", () => {
      this.startGitHubAuth();
    });
    
    document.getElementById("zai-github-cancel-btn")?.addEventListener("click", () => {
      this.cancelAuth();
    });
    
    document.getElementById("zai-github-done-btn")?.addEventListener("click", () => {
      window.close();
    });
    
    document.getElementById("zai-github-retry-btn")?.addEventListener("click", () => {
      this.resetGitHubUI();
    });
    
    document.getElementById("zai-copy-code-btn")?.addEventListener("click", () => {
      this.copyDeviceCode();
    });
    
    // Link removed - user opens github.com/login/device manually or uses copy button
    
    // OpenAI Codex events
    document.getElementById("zai-openai-start-btn")?.addEventListener("click", () => {
      this.startOpenAIAuth();
    });
    
    document.getElementById("zai-openai-cancel-btn")?.addEventListener("click", () => {
      this.cancelAuth();
    });
    
    document.getElementById("zai-openai-done-btn")?.addEventListener("click", () => {
      window.close();
    });
    
    document.getElementById("zai-openai-retry-btn")?.addEventListener("click", () => {
      this.resetOpenAIUI();
    });
  },
  
  /**
   * Start GitHub Device Flow authentication
   */
  async startGitHubAuth() {
    if (this.isAuthenticating) return;
    this.isAuthenticating = true;
    
    try {
      // Show step 2 (device code)
      this.showGitHubStep(2);
      
      // Start the device flow
      const result = await ZoteroAIAssistant.GitHubDeviceFlow.authenticate(
        // onShowCode callback
        (userCode, verificationUri) => {
          document.getElementById("zai-device-code").textContent = userCode;
          // Store verification URI for potential future use
          this._verificationUri = verificationUri;
        },
        // onStatusUpdate callback
        (status) => {
          const statusEl = document.getElementById("zai-github-status");
          switch (status) {
            case "waiting":
              statusEl.textContent = "Waiting for authorization...";
              break;
            case "success":
              statusEl.textContent = "Authorization successful!";
              break;
          }
        }
      );
      
      // Success - show step 3
      if (result.user) {
        document.getElementById("zai-github-user").textContent = `Signed in as ${result.user.login}`;
      }
      this.showGitHubStep(3);
      
    } catch (error) {
      Zotero.debug("ZoteroAIAssistantAuth: GitHub auth failed: " + error);
      document.getElementById("zai-github-error-msg").textContent = error.message;
      this.showGitHubStep("error");
    } finally {
      this.isAuthenticating = false;
    }
  },
  
  /**
   * Start OpenAI OAuth PKCE authentication
   */
  async startOpenAIAuth() {
    if (this.isAuthenticating) return;
    this.isAuthenticating = true;
    
    try {
      // Show step 2 (waiting)
      this.showOpenAIStep(2);
      
      // Start OAuth flow
      await ZoteroAIAssistant.OpenAICodexOAuth.authenticate();
      
      // Success - show step 3
      this.showOpenAIStep(3);
      
    } catch (error) {
      Zotero.debug("ZoteroAIAssistantAuth: OpenAI auth failed: " + error);
      document.getElementById("zai-openai-error-msg").textContent = error.message;
      this.showOpenAIStep("error");
    } finally {
      this.isAuthenticating = false;
    }
  },
  
  /**
   * Cancel authentication
   */
  cancelAuth() {
    if (this.provider === "copilot") {
      ZoteroAIAssistant.GitHubDeviceFlow.cancelFlow();
      this.resetGitHubUI();
    } else {
      ZoteroAIAssistant.OpenAICodexOAuth.cancelAuth();
      this.resetOpenAIUI();
    }
    this.isAuthenticating = false;
  },
  
  /**
   * Show a specific step in GitHub auth flow
   */
  showGitHubStep(step) {
    const steps = ["step1", "step2", "step3", "error"];
    
    for (const s of steps) {
      const el = document.getElementById(`zai-github-${s}`);
      if (el) {
        el.style.display = (s === `step${step}` || s === step) ? "block" : "none";
      }
    }
  },
  
  /**
   * Show a specific step in OpenAI auth flow
   */
  showOpenAIStep(step) {
    const steps = ["step1", "step2", "step3", "error"];
    
    for (const s of steps) {
      const el = document.getElementById(`zai-openai-${s}`);
      if (el) {
        el.style.display = (s === `step${step}` || s === step) ? "block" : "none";
      }
    }
  },
  
  /**
   * Reset GitHub UI to initial state
   */
  resetGitHubUI() {
    this.showGitHubStep(1);
    document.getElementById("zai-device-code").textContent = "--------";
    document.getElementById("zai-github-status").textContent = "Waiting for authorization...";
  },
  
  /**
   * Reset OpenAI UI to initial state
   */
  resetOpenAIUI() {
    this.showOpenAIStep(1);
    document.getElementById("zai-openai-status").textContent = "Waiting for sign-in...";
  },
  
  /**
   * Copy device code to clipboard
   */
  copyDeviceCode() {
    const code = document.getElementById("zai-device-code").textContent;
    if (code && code !== "--------") {
      // Use Zotero's clipboard utility
      Zotero.Utilities.Internal.copyTextToClipboard(code);
      
      // Visual feedback
      const btn = document.getElementById("zai-copy-code-btn");
      const originalTitle = btn.title;
      btn.title = "Copied!";
      btn.classList.add("copied");
      
      setTimeout(() => {
        btn.title = originalTitle;
        btn.classList.remove("copied");
      }, 2000);
    }
  },
  
  /**
   * Open the device verification URL
   */
  openDeviceURL() {
    const url = this._verificationUri || "https://github.com/login/device";
    Zotero.launchURL(url);
  },
  
  /**
   * Cleanup on dialog close
   */
  destroy() {
    if (this.isAuthenticating) {
      this.cancelAuth();
    }
    Zotero.debug("ZoteroAIAssistantAuth: Destroyed");
  }
};
