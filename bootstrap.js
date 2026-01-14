/**
 * Zotero AI Assistant - Bootstrap Entry Point
 * 
 * This file handles the plugin lifecycle in Zotero 7+
 * Uses the bootstrap pattern (not overlay XUL)
 */

var ZoteroAIAssistant;
var chromeHandle;
var chromeManifestLocation = null;
var resourceSubstitutionSet = false;

// Debug logging helper
function log(msg) {
  Zotero.debug("ZoteroAIAssistant: " + msg);
}

function registerChromeManifest(rootURI) {
  if (chromeHandle || chromeManifestLocation) {
    return;
  }
  
  try {
    const uri = Services.io.newURI(rootURI);
    if (uri?.scheme === "jar") {
      const jarURI = uri.QueryInterface(Components.interfaces.nsIJARURI);
      chromeManifestLocation = jarURI.JARFile.QueryInterface(Components.interfaces.nsIFileURL).file;
    } else if (uri?.scheme === "file") {
      chromeManifestLocation = uri.QueryInterface(Components.interfaces.nsIFileURL).file;
    }
    
    if (chromeManifestLocation && Components.manager.addBootstrappedManifestLocation) {
      Components.manager.addBootstrappedManifestLocation(chromeManifestLocation);
      log("Registered chrome.manifest via bootstrapped location");
      return;
    }
  } catch (error) {
    log("Failed to register bootstrapped chrome.manifest: " + error);
    chromeManifestLocation = null;
  }
  
  try {
    const manifestURI = Services.io.newURI(rootURI + "chrome.manifest");
    let AddonManagerPrivate;
    
    try {
      ({ AddonManagerPrivate } = ChromeUtils.import("resource://gre/modules/AddonManager.jsm"));
    } catch (error) {
      ({ AddonManagerPrivate } = Components.utils.import("resource://gre/modules/AddonManager.jsm"));
    }
    
    if (AddonManagerPrivate?.registerChrome) {
      chromeHandle = AddonManagerPrivate.registerChrome(manifestURI);
      log("Registered chrome.manifest");
    } else {
      log("AddonManagerPrivate.registerChrome not available");
    }
  } catch (error) {
    log("Failed to register chrome.manifest: " + error);
  }
}

function unregisterChromeManifest() {
  if (chromeManifestLocation && Components.manager.removeBootstrappedManifestLocation) {
    Components.manager.removeBootstrappedManifestLocation(chromeManifestLocation);
    chromeManifestLocation = null;
    log("Unregistered chrome.manifest via bootstrapped location");
  }
  
  if (chromeHandle?.destruct) {
    chromeHandle.destruct();
    chromeHandle = null;
    log("Unregistered chrome.manifest");
  }
}

function registerResourceSubstitution(rootURI) {
  if (resourceSubstitutionSet) {
    return;
  }
  
  try {
    const resProto = Services.io
      .getProtocolHandler("resource")
      .QueryInterface(Components.interfaces.nsIResProtocolHandler);
    const baseURI = Services.io.newURI(rootURI + "chrome/");
    resProto.setSubstitution("zotero-ai-assistant", baseURI);
    resourceSubstitutionSet = true;
    log("Registered resource substitution");
  } catch (error) {
    log("Failed to register resource substitution: " + error);
  }
}

function unregisterResourceSubstitution() {
  if (!resourceSubstitutionSet) {
    return;
  }
  
  try {
    const resProto = Services.io
      .getProtocolHandler("resource")
      .QueryInterface(Components.interfaces.nsIResProtocolHandler);
    resProto.setSubstitution("zotero-ai-assistant", null);
    resourceSubstitutionSet = false;
    log("Unregistered resource substitution");
  } catch (error) {
    log("Failed to unregister resource substitution: " + error);
  }
}

/**
 * Called when the plugin is first installed
 */
function install(data, reason) {
  log("Installed version " + data.version);
}

/**
 * Called when the plugin starts (Zotero initialized)
 */
async function startup({ id, version, rootURI }, reason) {
  try {
    log("Starting version " + version);
    
    // Wait for Zotero to be ready
    await Zotero.initializationPromise;
    log("Zotero initialization complete");
    
    registerChromeManifest(rootURI);
    registerResourceSubstitution(rootURI);
    
    // Load the main plugin module
    log("Loading main module from: " + rootURI + "chrome/content/zoteroAssistant.js");
    Services.scriptloader.loadSubScript(rootURI + "chrome/content/zoteroAssistant.js");
    log("Main module loaded");
    
    // Initialize the plugin
    ZoteroAIAssistant.init({ id, version, rootURI });
    log("Plugin initialized");
    
    // Run main initialization first (loads modules, registers prefs)
    await ZoteroAIAssistant.main();
    log("Main initialization complete");
    
    // Add to all existing windows
    log("Adding to all windows...");
    ZoteroAIAssistant.addToAllWindows();
    log("Added to all windows");
    
  } catch (error) {
    log("Startup error: " + error);
    log("Error stack: " + (error.stack || "no stack"));
  }
}

/**
 * Called when a main Zotero window opens
 */
function onMainWindowLoad({ window }) {
  log("onMainWindowLoad called");
  if (ZoteroAIAssistant) {
    ZoteroAIAssistant.addToWindow(window);
  }
}

/**
 * Called when a main Zotero window closes
 */
function onMainWindowUnload({ window }) {
  log("onMainWindowUnload called");
  if (ZoteroAIAssistant) {
    ZoteroAIAssistant.removeFromWindow(window);
  }
}

/**
 * Called when the plugin shuts down
 */
function shutdown({ id, version, rootURI }, reason) {
  log("Shutting down");
  
  // Skip cleanup if Zotero is shutting down
  if (reason === APP_SHUTDOWN) {
    return;
  }
  
  // Remove from all windows
  if (ZoteroAIAssistant) {
    ZoteroAIAssistant.removeFromAllWindows();
    ZoteroAIAssistant.shutdown();
  }
  
  unregisterChromeManifest();
  unregisterResourceSubstitution();
  
  // Clear the module reference
  ZoteroAIAssistant = undefined;
}

/**
 * Called when the plugin is uninstalled
 */
function uninstall(data, reason) {
  log("Uninstalled");
}
