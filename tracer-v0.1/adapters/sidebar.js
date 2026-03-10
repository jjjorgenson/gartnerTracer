/**
 * TRACER - _Sidebar.md generator
 * Generates GitHub Wiki sidebar markdown from a wiki-structure config (YAML).
 * Source of truth: .tracer/wiki-structure.yaml or wiki.sections in manifest.
 */

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

/**
 * Generate _Sidebar.md content from a wiki structure definition.
 *
 * @param {object} structure - { sections: [{ title, pages: string[] }] }
 * @returns {string} markdown for _Sidebar.md
 *
 * Input example:
 *   { sections: [
 *       { title: "Getting Started", pages: ["Introduction", "Quick-Start"] },
 *       { title: "API Reference", pages: ["Authentication", "Users-Endpoint"] }
 *   ] }
 *
 * Output:
 *   * [Home](Home)
 *   * **Getting Started**
 *     * [Introduction](Introduction)
 *     * [Quick Start](Quick-Start)
 *   * **API Reference**
 *     * [Authentication](Authentication)
 *     * [Users Endpoint](Users-Endpoint)
 */
function generateSidebar(structure) {
  const lines = ['* [Home](Home)'];

  const sections = structure.sections || [];
  for (const section of sections) {
    lines.push(`* **${section.title}**`);
    const pages = section.pages || [];
    for (const page of pages) {
      const label = slugToLabel(page);
      lines.push(`  * [${label}](${page})`);
    }
  }

  return lines.join('\n') + '\n';
}

/**
 * Convert a page slug to a display label.
 * "API-Reference" -> "API Reference", "Quick-Start" -> "Quick Start"
 */
function slugToLabel(slug) {
  return slug.replace(/-/g, ' ');
}

/**
 * Convert a display label to a page slug.
 * "API Reference" -> "API-Reference", "Quick Start" -> "Quick-Start"
 */
function labelToSlug(label) {
  return label.replace(/\s+/g, '-');
}

/**
 * Parse _Sidebar.md back into a structure.
 * Handles the format:  * **Section** / * [Label](Slug)
 *
 * @param {string} markdown
 * @returns {{ sections: Array<{ title: string, pages: string[] }>, topLevel: string[] }}
 */
function parseSidebar(markdown) {
  const lines = markdown.split('\n');
  const sections = [];
  const topLevel = [];
  let currentSection = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;

    const sectionMatch = line.match(/^\*\s+\*\*(.+?)\*\*/);
    if (sectionMatch) {
      currentSection = { title: sectionMatch[1], pages: [] };
      sections.push(currentSection);
      continue;
    }

    const nestedPageMatch = line.match(/^\s+\*\s+\[.+?\]\((.+?)\)/);
    if (nestedPageMatch && currentSection) {
      currentSection.pages.push(nestedPageMatch[1]);
      continue;
    }

    const topPageMatch = line.match(/^\*\s+\[.+?\]\((.+?)\)/);
    if (topPageMatch) {
      topLevel.push(topPageMatch[1]);
      continue;
    }
  }

  return { sections, topLevel };
}

/**
 * Add a page to a section. If sectionTitle is null, appends to last section.
 *
 * @param {object} structure - { sections: [...] }
 * @param {string} pageSlug
 * @param {string|null} sectionTitle - section to add to; null = last section
 * @returns {object} updated structure (mutated in place)
 */
function addPageToStructure(structure, pageSlug, sectionTitle = null) {
  if (!structure.sections || structure.sections.length === 0) {
    structure.sections = [{ title: 'General', pages: [] }];
  }

  let target;
  if (sectionTitle) {
    target = structure.sections.find(s => s.title === sectionTitle);
    if (!target) {
      target = { title: sectionTitle, pages: [] };
      structure.sections.push(target);
    }
  } else {
    target = structure.sections[structure.sections.length - 1];
  }

  if (!target.pages.includes(pageSlug)) {
    target.pages.push(pageSlug);
  }

  return structure;
}

/**
 * Load wiki structure from a YAML file.
 * @param {string} filePath - path to wiki-structure.yaml
 * @returns {object|null} parsed structure or null if file doesn't exist
 */
function loadWikiStructure(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf8');
  const data = yaml.load(raw);
  return data?.wiki || data || null;
}

/**
 * Save wiki structure to a YAML file.
 * @param {string} filePath
 * @param {object} structure - { sections: [...] }
 */
function saveWikiStructure(filePath, structure) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const content = yaml.dump({ wiki: structure }, { lineWidth: 120 });
  fs.writeFileSync(filePath, content, 'utf8');
}

module.exports = {
  generateSidebar,
  parseSidebar,
  addPageToStructure,
  slugToLabel,
  labelToSlug,
  loadWikiStructure,
  saveWikiStructure,
};
