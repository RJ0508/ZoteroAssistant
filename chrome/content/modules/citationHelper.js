/**
 * Citation Helper Module
 * 
 * Generates citations in various formats (APA, MLA, Chicago, etc.)
 */

var ZoteroAIAssistant = ZoteroAIAssistant || {};

ZoteroAIAssistant.CitationHelper = {
  // Supported citation styles
  STYLES: [
    { id: "apa", name: "APA (7th Edition)" },
    { id: "mla", name: "MLA (9th Edition)" },
    { id: "chicago", name: "Chicago (17th Edition)" },
    { id: "harvard", name: "Harvard" },
    { id: "ieee", name: "IEEE" },
    { id: "vancouver", name: "Vancouver" }
  ],
  
  /**
   * Get citation for an item in specified format
   * @param {Zotero.Item} item - Zotero item
   * @param {string} style - Citation style (apa, mla, chicago, etc.)
   * @returns {string} Formatted citation
   */
  async getCitation(item, style = "apa") {
    if (!item) return "";
    
    // Get item metadata
    const metadata = this.extractMetadata(item);
    
    // Generate citation based on style
    switch (style.toLowerCase()) {
      case "apa":
        return this.formatAPA(metadata);
      case "mla":
        return this.formatMLA(metadata);
      case "chicago":
        return this.formatChicago(metadata);
      case "harvard":
        return this.formatHarvard(metadata);
      case "ieee":
        return this.formatIEEE(metadata);
      case "vancouver":
        return this.formatVancouver(metadata);
      default:
        return this.formatAPA(metadata);
    }
  },
  
  /**
   * Extract metadata from Zotero item
   */
  extractMetadata(item) {
    const creators = item.getCreators?.() || [];
    const authors = creators.filter(c => c.creatorType === "author" || c.creatorType === "contributor");
    
    return {
      title: item.getField?.("title") || "",
      authors: authors.map(a => ({
        firstName: a.firstName || "",
        lastName: a.lastName || ""
      })),
      date: item.getField?.("date") || "",
      year: this.extractYear(item.getField?.("date") || ""),
      publicationTitle: item.getField?.("publicationTitle") || "",
      journalAbbreviation: item.getField?.("journalAbbreviation") || "",
      volume: item.getField?.("volume") || "",
      issue: item.getField?.("issue") || "",
      pages: item.getField?.("pages") || "",
      doi: item.getField?.("DOI") || "",
      url: item.getField?.("url") || "",
      publisher: item.getField?.("publisher") || "",
      place: item.getField?.("place") || "",
      itemType: item.itemType
    };
  },
  
  /**
   * Extract year from date string
   */
  extractYear(date) {
    if (!date) return "n.d.";
    const match = date.match(/\d{4}/);
    return match ? match[0] : "n.d.";
  },
  
  /**
   * Format authors for different styles
   */
  formatAuthorsAPA(authors) {
    if (!authors || authors.length === 0) return "";
    
    if (authors.length === 1) {
      return `${authors[0].lastName}, ${authors[0].firstName.charAt(0)}.`;
    } else if (authors.length === 2) {
      return `${authors[0].lastName}, ${authors[0].firstName.charAt(0)}., & ${authors[1].lastName}, ${authors[1].firstName.charAt(0)}.`;
    } else if (authors.length <= 20) {
      const allButLast = authors.slice(0, -1).map(a => `${a.lastName}, ${a.firstName.charAt(0)}.`).join(", ");
      const last = authors[authors.length - 1];
      return `${allButLast}, & ${last.lastName}, ${last.firstName.charAt(0)}.`;
    } else {
      const first19 = authors.slice(0, 19).map(a => `${a.lastName}, ${a.firstName.charAt(0)}.`).join(", ");
      const last = authors[authors.length - 1];
      return `${first19}, ... ${last.lastName}, ${last.firstName.charAt(0)}.`;
    }
  },
  
  formatAuthorsMLA(authors) {
    if (!authors || authors.length === 0) return "";
    
    if (authors.length === 1) {
      return `${authors[0].lastName}, ${authors[0].firstName}`;
    } else if (authors.length === 2) {
      return `${authors[0].lastName}, ${authors[0].firstName}, and ${authors[1].firstName} ${authors[1].lastName}`;
    } else {
      return `${authors[0].lastName}, ${authors[0].firstName}, et al.`;
    }
  },
  
  formatAuthorsChicago(authors) {
    if (!authors || authors.length === 0) return "";
    
    if (authors.length === 1) {
      return `${authors[0].lastName}, ${authors[0].firstName}`;
    } else if (authors.length === 2) {
      return `${authors[0].lastName}, ${authors[0].firstName}, and ${authors[1].firstName} ${authors[1].lastName}`;
    } else if (authors.length === 3) {
      return `${authors[0].lastName}, ${authors[0].firstName}, ${authors[1].firstName} ${authors[1].lastName}, and ${authors[2].firstName} ${authors[2].lastName}`;
    } else {
      return `${authors[0].lastName}, ${authors[0].firstName}, et al.`;
    }
  },
  
  /**
   * Format citation in APA style
   */
  formatAPA(meta) {
    const title = meta.title || "Untitled";
    const authorsText = this.formatAuthorsAPA(meta.authors).trim();
    let citation = "";

    if (authorsText) {
      citation += `${authorsText} (${meta.year}). `;
      citation += `${title}. `;
    } else {
      citation += `${title}. `;
      citation += `(${meta.year}). `;
    }
    
    if (meta.publicationTitle) {
      citation += `*${meta.publicationTitle}*`;
      if (meta.volume) citation += `, *${meta.volume}*`;
      if (meta.issue) citation += `(${meta.issue})`;
      if (meta.pages) citation += `, ${meta.pages}`;
      citation += ". ";
    } else if (meta.publisher) {
      citation += `${meta.publisher}. `;
    }
    
    if (meta.doi) {
      citation += `https://doi.org/${meta.doi}`;
    } else if (meta.url) {
      citation += meta.url;
    }
    
    return citation.trim();
  },
  
  /**
   * Format citation in MLA style
   */
  formatMLA(meta) {
    const title = meta.title || "Untitled";
    const authorsText = this.formatAuthorsMLA(meta.authors).trim();
    let citation = "";
    if (authorsText) {
      citation += `${authorsText}. "${title}." `;
    } else {
      citation += `"${title}." `;
    }
    
    if (meta.publicationTitle) {
      citation += `*${meta.publicationTitle}*`;
      if (meta.volume) citation += `, vol. ${meta.volume}`;
      if (meta.issue) citation += `, no. ${meta.issue}`;
      citation += `, ${meta.year}`;
      if (meta.pages) citation += `, pp. ${meta.pages}`;
      citation += ". ";
    } else if (meta.publisher) {
      citation += `${meta.publisher}, ${meta.year}. `;
    }
    
    if (meta.doi) {
      citation += `doi:${meta.doi}`;
    }
    
    return citation.trim();
  },
  
  /**
   * Format citation in Chicago style (Notes-Bibliography)
   */
  formatChicago(meta) {
    const title = meta.title || "Untitled";
    const authorsText = this.formatAuthorsChicago(meta.authors).trim();
    let citation = "";
    if (authorsText) {
      citation += `${authorsText}. "${title}." `;
    } else {
      citation += `"${title}." `;
    }
    
    if (meta.publicationTitle) {
      citation += `*${meta.publicationTitle}* `;
      if (meta.volume) citation += `${meta.volume}`;
      if (meta.issue) citation += `, no. ${meta.issue}`;
      citation += ` (${meta.year})`;
      if (meta.pages) citation += `: ${meta.pages}`;
      citation += ". ";
    } else if (meta.publisher) {
      if (meta.place) citation += `${meta.place}: `;
      citation += `${meta.publisher}, ${meta.year}. `;
    }
    
    if (meta.doi) {
      citation += `https://doi.org/${meta.doi}`;
    }
    
    return citation.trim();
  },
  
  /**
   * Format citation in Harvard style
   */
  formatHarvard(meta) {
    const title = meta.title || "Untitled";
    let citation = "";

    if (meta.authors.length > 0) {
      if (meta.authors.length === 1) {
        citation += `${meta.authors[0].lastName}, ${meta.authors[0].firstName.charAt(0)}.`;
      } else if (meta.authors.length === 2) {
        citation += `${meta.authors[0].lastName}, ${meta.authors[0].firstName.charAt(0)}. and ${meta.authors[1].lastName}, ${meta.authors[1].firstName.charAt(0)}.`;
      } else {
        citation += `${meta.authors[0].lastName}, ${meta.authors[0].firstName.charAt(0)}. et al.`;
      }
      citation += ` (${meta.year}) '${title}', `;
    } else {
      citation += `${title} (${meta.year}) `;
    }
    
    if (meta.publicationTitle) {
      citation += `*${meta.publicationTitle}*`;
      if (meta.volume) citation += `, ${meta.volume}`;
      if (meta.issue) citation += `(${meta.issue})`;
      if (meta.pages) citation += `, pp. ${meta.pages}`;
      citation += ". ";
    } else if (meta.publisher) {
      if (meta.place) citation += `${meta.place}: `;
      citation += `${meta.publisher}. `;
    }
    
    if (meta.doi) {
      citation += `doi: ${meta.doi}`;
    }
    
    return citation.trim();
  },
  
  /**
   * Format citation in IEEE style
   */
  formatIEEE(meta) {
    const title = meta.title || "Untitled";
    let citation = "";
    
    // Authors (initials first)
    if (meta.authors.length > 0) {
      const authorList = meta.authors.map(a => 
        `${a.firstName.charAt(0)}. ${a.lastName}`
      );
      
      if (authorList.length === 1) {
        citation += authorList[0];
      } else if (authorList.length === 2) {
        citation += `${authorList[0]} and ${authorList[1]}`;
      } else {
        citation += `${authorList.slice(0, -1).join(", ")}, and ${authorList[authorList.length - 1]}`;
      }
      citation += `, "${title}," `;
    } else {
      citation += `"${title}," `;
    }
    
    if (meta.publicationTitle) {
      citation += `*${meta.publicationTitle}*`;
      if (meta.volume) citation += `, vol. ${meta.volume}`;
      if (meta.issue) citation += `, no. ${meta.issue}`;
      if (meta.pages) citation += `, pp. ${meta.pages}`;
      citation += `, ${meta.year}`;
      citation += ". ";
    } else if (meta.publisher) {
      if (meta.place) citation += `${meta.place}: `;
      citation += `${meta.publisher}, ${meta.year}. `;
    }
    
    if (meta.doi) {
      citation += `doi: ${meta.doi}`;
    }
    
    return citation.trim();
  },
  
  /**
   * Format citation in Vancouver style
   */
  formatVancouver(meta) {
    let citation = "";
    
    // Authors (last name first, initials, no periods)
    if (meta.authors.length > 0) {
      const authorList = meta.authors.slice(0, 6).map(a => {
        const initials = a.firstName.split(" ").map(n => n.charAt(0).toUpperCase()).join("");
        return `${a.lastName} ${initials}`;
      });
      
      if (meta.authors.length > 6) {
        citation += `${authorList.join(", ")}, et al. `;
      } else {
        citation += `${authorList.join(", ")}. `;
      }
    }
    
    citation += `${meta.title}. `;
    
    if (meta.publicationTitle) {
      citation += `${meta.journalAbbreviation || meta.publicationTitle}. ${meta.year}`;
      if (meta.volume) citation += `;${meta.volume}`;
      if (meta.issue) citation += `(${meta.issue})`;
      if (meta.pages) citation += `:${meta.pages}`;
      citation += ". ";
    } else if (meta.publisher) {
      if (meta.place) citation += `${meta.place}: `;
      citation += `${meta.publisher}; ${meta.year}. `;
    }
    
    if (meta.doi) {
      citation += `doi: ${meta.doi}`;
    }
    
    return citation.trim();
  },
  
  /**
   * Get in-text citation
   */
  getInTextCitation(item, style = "apa") {
    const metadata = this.extractMetadata(item);
    const shortTitle = this.getShortTitle(metadata.title);
    
    switch (style.toLowerCase()) {
      case "apa":
        if (metadata.authors.length === 0) {
          return `("${shortTitle}", ${metadata.year})`;
        }
        if (metadata.authors.length === 1) {
          return `(${metadata.authors[0].lastName}, ${metadata.year})`;
        } else if (metadata.authors.length === 2) {
          return `(${metadata.authors[0].lastName} & ${metadata.authors[1].lastName}, ${metadata.year})`;
        } else {
          return `(${metadata.authors[0].lastName} et al., ${metadata.year})`;
        }
        
      case "mla":
        if (metadata.authors.length === 0) {
          return `("${shortTitle}")`;
        } else if (metadata.authors.length === 1) {
          return `(${metadata.authors[0].lastName})`;
        } else if (metadata.authors.length === 2) {
          return `(${metadata.authors[0].lastName} and ${metadata.authors[1].lastName})`;
        } else {
          return `(${metadata.authors[0].lastName} et al.)`;
        }
        
      case "chicago":
        if (metadata.authors.length === 0) {
          return `("${shortTitle}" ${metadata.year})`;
        }
        if (metadata.authors.length === 1) {
          return `(${metadata.authors[0].lastName} ${metadata.year})`;
        } else if (metadata.authors.length <= 3) {
          const names = metadata.authors.map(a => a.lastName).join(", ");
          return `(${names} ${metadata.year})`;
        } else {
          return `(${metadata.authors[0].lastName} et al. ${metadata.year})`;
        }
        
      default:
        return `(${metadata.authors[0]?.lastName || "Unknown"}, ${metadata.year})`;
    }
  },

  getShortTitle(title, maxLength = 30) {
    const value = (title || "Untitled").trim();
    if (value.length <= maxLength) {
      return value;
    }
    return value.slice(0, maxLength).trim() + "...";
  },
  
  /**
   * Copy citation to clipboard
   */
  async copyCitation(item, style) {
    const citation = await this.getCitation(item, style);
    
    try {
      const clipboardHelper = Components.classes["@mozilla.org/widget/clipboardhelper;1"]
        .getService(Components.interfaces.nsIClipboardHelper);
      clipboardHelper.copyString(citation);
      return true;
    } catch (error) {
      Zotero.debug("ZoteroAIAssistant.CitationHelper: Copy error: " + error);
      return false;
    }
  },
  
  /**
   * Copy in-text citation to clipboard
   */
  copyInTextCitation(item, style) {
    const citation = this.getInTextCitation(item, style);
    
    try {
      const clipboardHelper = Components.classes["@mozilla.org/widget/clipboardhelper;1"]
        .getService(Components.interfaces.nsIClipboardHelper);
      clipboardHelper.copyString(citation);
      return true;
    } catch (error) {
      Zotero.debug("ZoteroAIAssistant.CitationHelper: Copy error: " + error);
      return false;
    }
  }
};
