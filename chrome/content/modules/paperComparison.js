/**
 * Paper Comparison Module
 * 
 * Compares multiple papers and generates analysis of similarities and differences.
 */

var ZoteroAIAssistant = ZoteroAIAssistant || {};

ZoteroAIAssistant.PaperComparison = {
  /**
   * Compare two or more papers
   * @param {Array<Zotero.Item>} items - Array of Zotero items to compare
   * @param {object} options - Comparison options
   * @returns {Promise<string>} Comparison result
   */
  async comparePapers(items, options = {}) {
    if (!items || items.length < 2) {
      return "Please select at least two papers to compare.";
    }
    
    // Extract metadata for each paper
    const papersInfo = await Promise.all(items.map(item => this.extractPaperInfo(item)));
    
    // Build comparison prompt
    const prompt = this.buildComparisonPrompt(papersInfo, options);
    
    // Send to AI
    try {
      const settings = ZoteroAIAssistant.ChatManager?.getModelSettings?.({ task: "compare" }) || {
        provider: Zotero.Prefs.get("extensions.zotero-ai-assistant.defaultProvider", true) || "copilot",
        modelId: Zotero.Prefs.get("extensions.zotero-ai-assistant.defaultModel", true) || "grok-code-fast-1"
      };

      const messages = [
        {
          role: "system",
          content: "You are an academic research assistant helping compare scientific papers. Provide clear, structured comparisons highlighting similarities, differences, and relationships between papers."
        },
        {
          role: "user",
          content: prompt
        }
      ];

      let response;
      if (settings.provider === "ollama" || settings.provider === "lmstudio") {
        if (!ZoteroAIAssistant.LocalModelClient) {
          throw new Error("Local model client not available");
        }
        response = await ZoteroAIAssistant.LocalModelClient.chat({
          provider: settings.provider,
          model: settings.modelId,
          messages,
          stream: false
        });
      } else {
        response = await ZoteroAIAssistant.CopilotClient.chat({
          model: settings.modelId,
          messages,
          stream: false
        });
      }
      
      return response.content || response.choices?.[0]?.message?.content || "No response received.";
    } catch (error) {
      Zotero.debug("ZoteroAIAssistant.PaperComparison: Error: " + error);
      return "Error comparing papers: " + error.message;
    }
  },
  
  /**
   * Extract paper information
   */
  async extractPaperInfo(item) {
    if (!item) return null;
    
    const creators = item.getCreators?.() || [];
    const authors = creators.filter(c => c.creatorType === "author" || c.creatorType === "contributor");
    
    return {
      title: item.getField?.("title") || "Unknown",
      authors: authors.map(a => `${a.firstName || ""} ${a.lastName || ""}`).join(", "),
      year: this.extractYear(item.getField?.("date") || ""),
      abstract: item.getField?.("abstractNote") || "",
      publicationTitle: item.getField?.("publicationTitle") || "",
      doi: item.getField?.("DOI") || "",
      tags: item.getTags?.().map(t => t.tag) || []
    };
  },
  
  /**
   * Extract year from date
   */
  extractYear(date) {
    if (!date) return "n.d.";
    const match = date.match(/\d{4}/);
    return match ? match[0] : "n.d.";
  },
  
  /**
   * Build comparison prompt
   */
  buildComparisonPrompt(papers, options) {
    const { focusAreas = ["methodology", "findings", "approach"] } = options;
    
    let prompt = "Please compare the following academic papers:\n\n";
    
    papers.forEach((paper, index) => {
      if (!paper) return;
      
      prompt += `**Paper ${index + 1}:** ${paper.title}\n`;
      prompt += `- Authors: ${paper.authors}\n`;
      prompt += `- Year: ${paper.year}\n`;
      if (paper.publicationTitle) {
        prompt += `- Published in: ${paper.publicationTitle}\n`;
      }
      if (paper.abstract) {
        prompt += `- Abstract: ${paper.abstract.substring(0, 500)}${paper.abstract.length > 500 ? "..." : ""}\n`;
      }
      if (paper.tags.length > 0) {
        prompt += `- Tags: ${paper.tags.join(", ")}\n`;
      }
      prompt += "\n";
    });
    
    prompt += "\nPlease provide a structured comparison including:\n";
    prompt += "1. **Research Questions/Objectives**: How do their goals compare?\n";
    prompt += "2. **Methodology**: What approaches does each paper use?\n";
    prompt += "3. **Key Findings**: What are the main results of each?\n";
    prompt += "4. **Similarities**: What do these papers have in common?\n";
    prompt += "5. **Differences**: How do they differ in approach or conclusions?\n";
    prompt += "6. **Complementary Aspects**: How might these papers complement each other?\n";
    prompt += "7. **Summary Table**: A brief comparison table highlighting key aspects.\n";
    
    return prompt;
  },
  
  /**
   * Get selected items from Zotero library
   */
  getSelectedItems() {
    const zoteroPane = Zotero.getActiveZoteroPane();
    if (!zoteroPane) return [];
    
    const selectedItems = zoteroPane.getSelectedItems();
    // Filter to only regular items (not attachments, notes)
    return selectedItems.filter(item => item.isRegularItem?.() || item.itemType === "journalArticle" || item.itemType === "conferencePaper" || item.itemType === "book");
  },
  
  /**
   * Compare currently selected papers
   */
  async compareSelected() {
    const items = this.getSelectedItems();
    
    if (items.length < 2) {
      return {
        success: false,
        message: "Please select at least 2 papers in your library to compare."
      };
    }
    
    if (items.length > 5) {
      return {
        success: false,
        message: "Please select no more than 5 papers to compare at once."
      };
    }
    
    const result = await this.comparePapers(items);
    
    return {
      success: true,
      message: result,
      papers: items.map(i => i.getField?.("title") || "Unknown")
    };
  },
  
  /**
   * Generate a literature review outline from selected papers
   */
  async generateLiteratureReview(items) {
    if (!items || items.length < 2) {
      return "Please select at least two papers to generate a literature review.";
    }
    
    const papersInfo = await Promise.all(items.map(item => this.extractPaperInfo(item)));
    
    let prompt = "Based on the following papers, generate a literature review outline:\n\n";
    
    papersInfo.forEach((paper, index) => {
      if (!paper) return;
      prompt += `**Paper ${index + 1}:** ${paper.title} (${paper.year})\n`;
      prompt += `Authors: ${paper.authors}\n`;
      if (paper.abstract) {
        prompt += `Abstract: ${paper.abstract.substring(0, 300)}...\n`;
      }
      prompt += "\n";
    });
    
    prompt += "\nPlease provide:\n";
    prompt += "1. A suggested structure for organizing these papers in a literature review\n";
    prompt += "2. Key themes that emerge across the papers\n";
    prompt += "3. Research gaps that could be addressed\n";
    prompt += "4. Suggested transition sentences between topics\n";
    prompt += "5. An example introduction paragraph for the literature review\n";
    
    try {
      const settings = ZoteroAIAssistant.ChatManager?.getModelSettings?.({ task: "compare" }) || {
        provider: Zotero.Prefs.get("extensions.zotero-ai-assistant.defaultProvider", true) || "copilot",
        modelId: Zotero.Prefs.get("extensions.zotero-ai-assistant.defaultModel", true) || "grok-code-fast-1"
      };

      const messages = [
        {
          role: "system",
          content: "You are an academic writing assistant helping researchers write literature reviews. Provide clear, well-organized suggestions for structuring a literature review."
        },
        {
          role: "user",
          content: prompt
        }
      ];

      let response;
      if (settings.provider === "ollama" || settings.provider === "lmstudio") {
        if (!ZoteroAIAssistant.LocalModelClient) {
          throw new Error("Local model client not available");
        }
        response = await ZoteroAIAssistant.LocalModelClient.chat({
          provider: settings.provider,
          model: settings.modelId,
          messages,
          stream: false
        });
      } else {
        response = await ZoteroAIAssistant.CopilotClient.chat({
          model: settings.modelId,
          messages,
          stream: false
        });
      }
      
      return response.content || response.choices?.[0]?.message?.content || "No response received.";
    } catch (error) {
      Zotero.debug("ZoteroAIAssistant.PaperComparison: Literature review error: " + error);
      return "Error generating literature review: " + error.message;
    }
  }
};
