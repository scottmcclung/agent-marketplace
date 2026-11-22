---
name: pandoc-converter
description: This skill should be used when converting documents between formats using the pandoc CLI utility. Supports 53+ input formats and 68+ output formats including Markdown, PDF, HTML, DOCX, LaTeX, EPUB, presentations (PPTX, Beamer, Reveal.js), and more. Use when tasks involve format conversion, batch document processing, PDF generation with LaTeX/custom templates, bibliography/citation handling with citeproc, applying Lua filters for document transformation, or creating ebooks and presentations from source documents.
---

# Pandoc Document Converter

## Overview

This skill enables sophisticated document format conversion using pandoc, a universal document converter. Pandoc converts between 53 input formats and 68 output formats, supporting advanced features like custom templates, Lua filters, bibliography processing, and batch conversions.

## When to Use This Skill

Invoke this skill when:
- Converting documents between formats (Markdown → PDF, HTML → DOCX, etc.)
- Generating PDFs with custom styling, templates, or LaTeX
- Batch processing multiple documents with consistent formatting
- Creating ebooks (EPUB) or presentations (PPTX, Beamer, Reveal.js)
- Processing academic papers with citations and bibliographies
- Applying custom transformations via Lua filters
- Converting documentation to multiple output formats

## Workflow Decision Tree

Before starting conversions, follow this decision tree:

1. **Check dependencies** → Run `scripts/check_dependencies.py` to verify required tools
2. **Single or batch?**
   - Single file → Construct pandoc command directly
   - Multiple files → Use `scripts/batch_convert.py`
3. **PDF output?**
   - Yes → Verify LaTeX or alternative PDF engine installed
   - No → Proceed with conversion
4. **Advanced features needed?**
   - Citations/bibliography → Add `--citeproc` and bibliography files
   - Custom styling → Use templates or reference documents
   - Document transformation → Apply Lua filters
   - Standard conversion → Use basic pandoc command

## Dependency Checking

**Always check dependencies before PDF conversions or when using advanced features.**

Run the dependency checker:

```bash
python3 scripts/check_dependencies.py
```

This script checks:
- Pandoc installation and version
- Available PDF engines (pdflatex, xelatex, lualatex, wkhtmltopdf, etc.)
- LaTeX packages (amsmath, geometry, hyperref, etc.)
- Bibliography tools (biber, bibtex)

**Output interpretation:**
- Exit code 0: All dependencies satisfied
- Exit code 1: Pandoc not found
- Exit code 2: Missing PDF engines (warning level)
- JSON output includes recommendations for installation

**Common dependency installations:**

```bash
# macOS - Full LaTeX
brew install --cask mactex

# macOS - Minimal (faster)
brew install --cask basictex

# Ubuntu/Debian - Full LaTeX
sudo apt-get install texlive-full

# Ubuntu/Debian - Minimal
sudo apt-get install texlive-latex-base texlive-fonts-recommended

# Alternative: Tectonic (modern, self-contained)
brew install tectonic  # macOS
cargo install tectonic  # Cross-platform via Rust
```

## Basic Document Conversion

### Common Conversion Patterns

**Markdown to PDF:**
```bash
pandoc document.md -o output.pdf
```

**Markdown to Word:**
```bash
pandoc document.md -o output.docx
```

**HTML to Markdown:**
```bash
pandoc webpage.html -o output.md
```

**Word to PDF:**
```bash
pandoc document.docx -o output.pdf
```

**LaTeX to HTML:**
```bash
pandoc paper.tex -o paper.html --standalone
```

### Standalone Documents

For HTML output with complete document structure:

```bash
pandoc input.md -o output.html --standalone
```

### Self-Contained Documents

Embed all resources (images, CSS) in a single file:

```bash
pandoc input.md -o output.html --standalone --embed-resources
```

## Batch Conversion

For converting multiple files with consistent options, use the batch conversion script.

**Basic batch usage:**

```bash
python3 scripts/batch_convert.py "*.md" -t pdf -o output/
```

**With glob patterns:**

```bash
python3 scripts/batch_convert.py "docs/**/*.md" "README.md" -t html -o dist/
```

**Preserve directory structure:**

```bash
python3 scripts/batch_convert.py "**/*.md" -t pdf -o converted/
```

**Flatten output (all files in one directory):**

```bash
python3 scripts/batch_convert.py "**/*.md" -t pdf -o converted/ --flatten
```

**Pass pandoc arguments:**

```bash
python3 scripts/batch_convert.py "*.md" -t pdf -o output/ \
  --pandoc-args="--toc --number-sections -V geometry:margin=1in"
```

**JSON output for scripting:**

```bash
python3 scripts/batch_convert.py "*.md" -t html -o output/ --json
```

## PDF Generation

### Choosing a PDF Engine

Different PDF engines have different capabilities:

- **pdflatex** (default): Fast, widely compatible, limited Unicode
- **xelatex**: Better Unicode support, custom fonts, slower
- **lualatex**: Modern LaTeX, programmable, best Unicode
- **wkhtmltopdf**: HTML/CSS to PDF (no LaTeX needed)
- **weasyprint**: CSS Paged Media to PDF
- **tectonic**: Modern self-contained LaTeX engine

**Specify PDF engine:**

```bash
pandoc input.md -o output.pdf --pdf-engine=xelatex
```

### PDF with Table of Contents

```bash
pandoc input.md -o output.pdf \
  --toc \
  --toc-depth=3 \
  --number-sections
```

### PDF with Custom Styling

```bash
pandoc input.md -o output.pdf \
  --pdf-engine=xelatex \
  -V geometry:margin=1in \
  -V fontsize=12pt \
  -V mainfont="Times New Roman" \
  -V documentclass=report
```

### PDF from HTML (no LaTeX required)

```bash
pandoc input.md -o output.pdf \
  --pdf-engine=wkhtmltopdf \
  --css=styles.css
```

## Advanced Document Features

### Citations and Bibliography

Enable citation processing with `--citeproc`:

```bash
pandoc paper.md -o paper.pdf \
  --citeproc \
  --bibliography=references.bib \
  --csl=chicago-author-date.csl
```

**Multiple bibliography files:**

```bash
pandoc paper.md -o paper.pdf \
  --citeproc \
  --bibliography=main.bib \
  --bibliography=additional.bib
```

**CSL styles:**
Download citation styles from https://github.com/citation-style-language/styles

Common styles: `apa.csl`, `chicago-author-date.csl`, `ieee.csl`, `nature.csl`

### Metadata Handling

**YAML metadata block in document:**

```markdown
---
title: "Document Title"
author: "Author Name"
date: "2025-11-01"
abstract: "Brief summary of the document"
keywords: [pandoc, conversion, documentation]
bibliography: references.bib
csl: apa.csl
---

# Content starts here
```

**Command-line metadata:**

```bash
pandoc input.md -o output.pdf \
  -M title="Custom Title" \
  -M author="Author Name" \
  -M date="2025-11-01"
```

**Metadata file:**

```bash
pandoc input.md -o output.pdf --metadata-file=metadata.yaml
```

### Custom Templates

Templates control document structure and styling.

**Get default template for customization:**

```bash
pandoc -D latex > custom-template.latex
pandoc -D html > custom-template.html
```

**Use custom template:**

```bash
pandoc input.md -o output.pdf \
  --template=custom-template.latex \
  -V custom-variable="value"
```

**Install template for automatic use:**

```bash
mkdir -p ~/.local/share/pandoc/templates
cp custom-template.latex ~/.local/share/pandoc/templates/default.latex
```

See `references/filters_and_templates.md` for detailed template customization guidance.

### Lua Filters

Lua filters transform the document AST during conversion.

**Apply Lua filter:**

```bash
pandoc input.md -o output.html \
  --lua-filter=custom-filter.lua
```

**Multiple filters (executed in order):**

```bash
pandoc input.md -o output.html \
  --lua-filter=preprocess.lua \
  --lua-filter=transform.lua \
  --lua-filter=postprocess.lua
```

**Common filter use cases:**
- Adding custom classes to elements
- Modifying links (e.g., open external links in new tab)
- Custom div/span processing
- Include external file contents
- Auto-numbering figures/tables
- Custom syntax extensions

**Example: Add target="_blank" to external links:**

```lua
-- external-links.lua
function Link(elem)
  if string.match(elem.target, "^http") then
    elem.attributes.target = "_blank"
    elem.attributes.rel = "noopener noreferrer"
  end
  return elem
end
```

See `references/filters_and_templates.md` for comprehensive filter examples and patterns.

## Creating Presentations

### PowerPoint (PPTX)

```bash
pandoc slides.md -o presentation.pptx
```

**With reference template:**

```bash
pandoc slides.md -o presentation.pptx \
  --reference-doc=template.pptx
```

**Slide structure in Markdown:**

```markdown
# Title Slide

## Slide with Content

- Point one
- Point two
- Point three

## Slide with Two Columns

::: columns
:::: column
Left content
::::

:::: column
Right content
::::
:::
```

### Reveal.js Presentations

```bash
pandoc slides.md -o slides.html \
  -t revealjs \
  --standalone \
  -V theme=moon \
  -V transition=slide
```

**Available themes:** black, white, league, beige, sky, night, serif, simple, solarized

### Beamer (PDF Slides)

```bash
pandoc slides.md -o slides.pdf \
  -t beamer \
  --slide-level=2
```

**With theme:**

```bash
pandoc slides.md -o slides.pdf \
  -t beamer \
  -V theme=Madrid \
  -V colortheme=beaver
```

## Creating Ebooks (EPUB)

**Basic EPUB:**

```bash
pandoc book.md -o book.epub \
  --toc \
  --toc-depth=2
```

**With cover and metadata:**

```bash
pandoc book.md -o book.epub \
  --epub-cover-image=cover.jpg \
  --epub-metadata=metadata.xml \
  --toc \
  --css=styles.css
```

**From multiple chapters:**

```bash
pandoc chapter1.md chapter2.md chapter3.md -o book.epub \
  --epub-cover-image=cover.jpg \
  --toc
```

**EPUB metadata XML example:**

```xml
<dc:title>Book Title</dc:title>
<dc:creator>Author Name</dc:creator>
<dc:language>en-US</dc:language>
<dc:date>2025-11-01</dc:date>
<dc:rights>Copyright 2025</dc:rights>
```

## Format-Specific Styling

### Word (DOCX) with Custom Styles

```bash
pandoc input.md -o output.docx \
  --reference-doc=template.docx \
  --toc
```

**Create reference document:**
1. Convert sample document: `pandoc sample.md -o reference.docx`
2. Open in Word and modify styles
3. Save and use as `--reference-doc`

### HTML with Custom CSS

```bash
pandoc input.md -o output.html \
  --standalone \
  --css=style.css \
  --css=syntax-highlighting.css \
  --toc
```

**Embed CSS in HTML:**

```bash
pandoc input.md -o output.html \
  --standalone \
  --embed-resources \
  --css=style.css
```

### Syntax Highlighting

**Available styles:**
```bash
pandoc --list-highlight-styles
```

Common: pygments, tango, espresso, zenburn, kate, monochrome, breezedark, haddock

**Apply highlighting style:**

```bash
pandoc input.md -o output.html \
  --standalone \
  --highlight-style=tango
```

**Get highlighting CSS:**

```bash
pandoc --print-highlight-style=tango > syntax.css
```

## Supported Formats

### Input Formats (53)
biblatex, bibtex, bits, commonmark, commonmark_x, creole, csljson, csv, djot, docbook, docx, dokuwiki, endnotexml, epub, fb2, gfm, haddock, html, ipynb, jats, jira, json, latex, man, markdown, markdown_github, markdown_mmd, markdown_phpextra, markdown_strict, mdoc, mediawiki, muse, native, odt, opml, org, pod, ris, rst, rtf, t2t, textile, tikiwiki, tsv, twiki, typst, vimwiki, xml

### Output Formats (68)
ansi, asciidoc, asciidoc_legacy, asciidoctor, beamer, biblatex, bibtex, chunkedhtml, commonmark, commonmark_x, context, csljson, djot, docbook, docbook4, docbook5, docx, dokuwiki, dzslides, epub, epub2, epub3, fb2, gfm, haddock, html, html4, html5, icml, ipynb, jats, jats_archiving, jats_articleauthoring, jats_publishing, jira, json, latex, man, markdown, markdown_github, markdown_mmd, markdown_phpextra, markdown_strict, markua, mediawiki, ms, muse, native, odt, opendocument, opml, org, pdf, plain, pptx, revealjs, rst, rtf, s5, slideous, slidy, tei, texinfo, textile, typst, vimdoc, xml, xwiki, zimwiki

**List formats:**
```bash
pandoc --list-input-formats
pandoc --list-output-formats
```

## Troubleshooting

### PDF Generation Fails

**Missing LaTeX packages:**
Run `scripts/check_dependencies.py` to identify missing packages.

Install full LaTeX:
```bash
# macOS
brew install --cask mactex

# Ubuntu/Debian
sudo apt-get install texlive-full
```

**Unicode characters not rendering:**
Use XeLaTeX or LuaLaTeX instead of pdflatex:
```bash
pandoc input.md -o output.pdf --pdf-engine=xelatex
```

**Images not appearing:**
- Ensure images are in supported formats (PNG, JPG, PDF)
- Use absolute paths or relative paths from document location
- Check image file permissions

### Citations Not Processing

Ensure `--citeproc` flag is present:
```bash
pandoc paper.md -o paper.pdf --citeproc --bibliography=refs.bib
```

Verify bibliography file format (BibTeX, BibLaTeX, CSL JSON, etc.)

### Batch Conversion Errors

Check individual file errors:
```bash
python3 scripts/batch_convert.py "*.md" -t pdf -o output/ --json
```

Review JSON output for specific file errors.

### Template Variables Not Substituted

Verify metadata is set via YAML block, command-line, or metadata file:
```bash
pandoc input.md -o output.pdf --template=custom.latex -M title="Title"
```

Check template syntax: `$variable$` or `${variable}`

## Reference Documentation

Detailed documentation is available in the `references/` directory:

- **`conversion_recipes.md`** - Common conversion patterns, format-specific options, troubleshooting
- **`filters_and_templates.md`** - Lua filter examples, template syntax, customization patterns

**Search reference files:**
```bash
grep -r "pattern" references/
```

## Resources

### Scripts

**`scripts/check_dependencies.py`**
- Checks pandoc installation and version
- Verifies PDF engines (LaTeX, wkhtmltopdf, etc.)
- Validates LaTeX packages
- Provides installation recommendations
- Usage: `python3 scripts/check_dependencies.py`

**`scripts/batch_convert.py`**
- Batch convert multiple files with consistent options
- Supports glob patterns for file matching
- Preserves or flattens directory structure
- Progress reporting and error handling
- JSON output for scripting
- Usage: `python3 scripts/batch_convert.py "*.md" -t pdf -o output/`

### References

**`references/conversion_recipes.md`**
- Common conversion patterns (Markdown → PDF, HTML, DOCX, etc.)
- Format-specific options and best practices
- Advanced features: citations, metadata, templates, filters
- Troubleshooting guide
- Performance optimization tips

**`references/filters_and_templates.md`**
- Lua filter structure and patterns
- Common filter examples (links, classes, includes, etc.)
- Template syntax and variables
- LaTeX and HTML template customization
- Filter and template development workflow

### External Resources

- **Pandoc User's Guide:** https://pandoc.org/MANUAL.html
- **Lua Filters Documentation:** https://pandoc.org/lua-filters.html
- **CSL Citation Styles:** https://github.com/citation-style-language/styles
- **Filter Examples:** https://github.com/pandoc/lua-filters

## Best Practices

1. **Always check dependencies first** for PDF conversions using `scripts/check_dependencies.py`
2. **Use batch conversion script** for multiple files to ensure consistency
3. **Choose appropriate PDF engine** based on requirements (Unicode → xelatex/lualatex)
4. **Test custom templates** with sample documents before batch processing
5. **Version control templates and filters** for reproducible conversions
6. **Use metadata files** for consistent document properties across conversions
7. **Chain filters thoughtfully** - order matters for filter execution
8. **Embed resources** (`--embed-resources`) for portable HTML documents
9. **Reference comprehensive documentation** in `references/` for advanced use cases
10. **Validate output** after conversion, especially for complex documents with citations or custom styling
