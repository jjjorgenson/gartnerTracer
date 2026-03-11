/**
 * Tests for sidebar generation and parsing.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {
  generateSidebar,
  parseSidebar,
  addPageToStructure,
  slugToLabel,
  labelToSlug,
  loadWikiStructure,
  saveWikiStructure,
} = require('../adapters/sidebar');

describe('slugToLabel', () => {
  it('converts dashes to spaces', () => {
    assert.strictEqual(slugToLabel('API-Reference'), 'API Reference');
  });
  it('handles single-word slugs', () => {
    assert.strictEqual(slugToLabel('Home'), 'Home');
  });
  it('handles multiple dashes', () => {
    assert.strictEqual(slugToLabel('Getting-Started-Guide'), 'Getting Started Guide');
  });
});

describe('labelToSlug', () => {
  it('converts spaces to dashes', () => {
    assert.strictEqual(labelToSlug('API Reference'), 'API-Reference');
  });
  it('handles multiple spaces', () => {
    assert.strictEqual(labelToSlug('Getting Started Guide'), 'Getting-Started-Guide');
  });
});

describe('generateSidebar', () => {
  it('generates sidebar with Home link and sections', () => {
    const structure = {
      sections: [
        { title: 'Getting Started', pages: ['Introduction', 'Quick-Start'] },
        { title: 'API Reference', pages: ['Authentication', 'Users-Endpoint'] },
      ]
    };
    const result = generateSidebar(structure);
    assert.ok(result.includes('* [Home](Home)'));
    assert.ok(result.includes('* **Getting Started**'));
    assert.ok(result.includes('  * [Introduction](Introduction)'));
    assert.ok(result.includes('  * [Quick Start](Quick-Start)'));
    assert.ok(result.includes('* **API Reference**'));
    assert.ok(result.includes('  * [Authentication](Authentication)'));
    assert.ok(result.includes('  * [Users Endpoint](Users-Endpoint)'));
  });

  it('handles empty sections array', () => {
    const result = generateSidebar({ sections: [] });
    assert.ok(result.includes('* [Home](Home)'));
    assert.strictEqual(result.trim().split('\n').length, 1);
  });

  it('handles section with no pages', () => {
    const result = generateSidebar({ sections: [{ title: 'Empty', pages: [] }] });
    assert.ok(result.includes('* **Empty**'));
  });
});

describe('parseSidebar', () => {
  it('parses generated sidebar back to structure', () => {
    const structure = {
      sections: [
        { title: 'Getting Started', pages: ['Introduction', 'Quick-Start'] },
        { title: 'API Reference', pages: ['Authentication'] },
      ]
    };
    const md = generateSidebar(structure);
    const parsed = parseSidebar(md);

    assert.strictEqual(parsed.sections.length, 2);
    assert.strictEqual(parsed.sections[0].title, 'Getting Started');
    assert.deepStrictEqual(parsed.sections[0].pages, ['Introduction', 'Quick-Start']);
    assert.strictEqual(parsed.sections[1].title, 'API Reference');
    assert.deepStrictEqual(parsed.sections[1].pages, ['Authentication']);
  });

  it('captures top-level page links', () => {
    const md = '* [Home](Home)\n* [About](About)\n';
    const parsed = parseSidebar(md);
    assert.ok(parsed.topLevel.includes('Home'));
    assert.ok(parsed.topLevel.includes('About'));
  });

  it('handles empty input', () => {
    const parsed = parseSidebar('');
    assert.strictEqual(parsed.sections.length, 0);
    assert.strictEqual(parsed.topLevel.length, 0);
  });
});

describe('addPageToStructure', () => {
  it('adds a page to an existing section', () => {
    const structure = {
      sections: [
        { title: 'API Reference', pages: ['Authentication'] }
      ]
    };
    addPageToStructure(structure, 'Users-Endpoint', 'API Reference');
    assert.ok(structure.sections[0].pages.includes('Users-Endpoint'));
  });

  it('creates a new section if title does not exist', () => {
    const structure = {
      sections: [{ title: 'Existing', pages: ['Page-A'] }]
    };
    addPageToStructure(structure, 'New-Page', 'New Section');
    assert.strictEqual(structure.sections.length, 2);
    assert.strictEqual(structure.sections[1].title, 'New Section');
    assert.ok(structure.sections[1].pages.includes('New-Page'));
  });

  it('adds to the last section when no title given', () => {
    const structure = {
      sections: [
        { title: 'First', pages: ['A'] },
        { title: 'Second', pages: ['B'] }
      ]
    };
    addPageToStructure(structure, 'C');
    assert.ok(structure.sections[1].pages.includes('C'));
  });

  it('creates a General section if no sections exist', () => {
    const structure = { sections: [] };
    addPageToStructure(structure, 'New-Page');
    assert.strictEqual(structure.sections[0].title, 'General');
    assert.ok(structure.sections[0].pages.includes('New-Page'));
  });

  it('does not add duplicate pages', () => {
    const structure = {
      sections: [{ title: 'API', pages: ['Auth'] }]
    };
    addPageToStructure(structure, 'Auth', 'API');
    assert.strictEqual(structure.sections[0].pages.filter(p => p === 'Auth').length, 1);
  });
});

describe('loadWikiStructure / saveWikiStructure', () => {
  it('round-trips structure through YAML file', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracer-sidebar-test-'));
    const filePath = path.join(tmpDir, 'wiki-structure.yaml');

    const structure = {
      sections: [
        { title: 'Getting Started', pages: ['Intro', 'Setup'] },
        { title: 'API', pages: ['Auth'] }
      ]
    };

    saveWikiStructure(filePath, structure);
    assert.ok(fs.existsSync(filePath));

    const loaded = loadWikiStructure(filePath);
    assert.deepStrictEqual(loaded.sections, structure.sections);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null for non-existent file', () => {
    const result = loadWikiStructure('/tmp/does-not-exist-wiki-structure.yaml');
    assert.strictEqual(result, null);
  });
});
