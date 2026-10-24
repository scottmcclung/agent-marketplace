# Pandoc Conversion Recipes

This document provides common conversion patterns and best practices for various document format conversions using pandoc.

## Format Support

### Input Formats (53 formats)
biblatex, bibtex, bits, commonmark, commonmark_x, creole, csljson, csv, djot, docbook, docx, dokuwiki, endnotexml, epub, fb2, gfm, haddock, html, ipynb, jats, jira, json, latex, man, markdown, markdown_github, markdown_mmd, markdown_phpextra, markdown_strict, mdoc, mediawiki, muse, native, odt, opml, org, pod, ris, rst, rtf, t2t, textile, tikiwiki, tsv, twiki, typst, vimwiki, xml

### Output Formats (68 formats)
ansi, asciidoc, asciidoc_legacy, asciidoctor, beamer, biblatex, bibtex, chunkedhtml, commonmark, commonmark_x, context, csljson, djot, docbook, docbook4, docbook5, docx, dokuwiki, dzslides, epub, epub2, epub3, fb2, gfm, haddock, html, html4, html5, icml, ipynb, jats, jats_archiving, jats_articleauthoring, jats_publishing, jira, json, latex, man, markdown, markdown_github, markdown_mmd, markdown_phpextra, markdown_strict, markua, mediawiki, ms, muse, native, odt, opendocument, opml, org, pdf, plain, pptx, revealjs, rst, rtf, s5, slideous, slidy, tei, texinfo, textile, typst, vimdoc, xml, xwiki, zimwiki

## Common Conversion Patterns

### Markdown to PDF

**Basic conversion:**
```bash
pandoc input.md -o output.pdf
```

**With table of contents and numbering:**
```bash
pandoc input.md -o output.pdf \
  --toc \
  --number-sections \
  -V geometry:margin=1in
```

**Using specific PDF engine:**
```bash
pandoc input.md -o output.pdf \
  --pdf-engine=xelatex  # Better Unicode support
```

**With custom template:**
```bash
pandoc input.md -o output.pdf \
  --template=custom.latex \
  -V documentclass=report
```

### Markdown to Word (DOCX)

**Basic conversion:**
```bash
pandoc input.md -o output.docx
```

**With reference document for styling:**
```bash
pandoc input.md -o output.docx \
  --reference-doc=template.docx
```

**With table of contents:**
```bash
pandoc input.md -o output.docx \
  --toc \
  --toc-depth=3
```

### Markdown to HTML

**Basic standalone HTML:**
```bash
pandoc input.md -o output.html --standalone
```

**Self-contained with CSS:**
```bash
pandoc input.md -o output.html \
  --standalone \
  --self-contained \
  --css=style.css
```

**With embedded resources:**
```bash
pandoc input.md -o output.html \
  --standalone \
  --embed-resources
```

**With syntax highlighting:**
```bash
pandoc input.md -o output.html \
  --standalone \
  --highlight-style=tango
```

### Markdown to Presentation (PPTX, Reveal.js)

**PowerPoint:**
```bash
pandoc input.md -o presentation.pptx \
  --reference-doc=template.pptx
```

**Reveal.js presentation:**
```bash
pandoc input.md -o slides.html \
  -t revealjs \
  --standalone \
  -V theme=moon
```

**Beamer (PDF slides):**
```bash
pandoc input.md -o slides.pdf \
  -t beamer \
  --slide-level=2
```

### HTML to Other Formats

**HTML to Markdown:**
```bash
pandoc input.html -o output.md
```

**HTML to PDF:**
```bash
pandoc input.html -o output.pdf \
  --pdf-engine=wkhtmltopdf
```

### LaTeX to Other Formats

**LaTeX to PDF:**
```bash
pandoc input.tex -o output.pdf
```

**LaTeX to Word:**
```bash
pandoc input.tex -o output.docx
```

**LaTeX to HTML:**
```bash
pandoc input.tex -o output.html --standalone
```

### Word (DOCX) to Other Formats

**DOCX to Markdown:**
```bash
pandoc input.docx -o output.md \
  --extract-media=./media
```

**DOCX to PDF:**
```bash
pandoc input.docx -o output.pdf
```

**DOCX to HTML:**
```bash
pandoc input.docx -o output.html \
  --standalone
```

### EPUB Creation

**From Markdown:**
```bash
pandoc input.md -o book.epub \
  --epub-cover-image=cover.jpg \
  --epub-metadata=metadata.xml \
  --toc \
  --toc-depth=2
```

**From multiple files:**
```bash
pandoc chapter*.md -o book.epub \
  --epub-cover-image=cover.jpg \
  --toc
```

## Advanced Features

### Citations and Bibliography

**Basic citation processing:**
```bash
pandoc input.md -o output.pdf \
  --citeproc \
  --bibliography=references.bib \
  --csl=chicago.csl
```

**Multiple bibliography files:**
```bash
pandoc input.md -o output.pdf \
  --citeproc \
  --bibliography=refs1.bib \
  --bibliography=refs2.bib
```

**With citation style:**
```bash
pandoc input.md -o output.pdf \
  --citeproc \
  --bibliography=references.bib \
  --csl=apa.csl
```

### Metadata and Variables

**Using YAML metadata block in document:**
```markdown
---
title: "Document Title"
author: "Author Name"
date: "2025-11-01"
abstract: "Brief summary of the document"
keywords: [pandoc, conversion, documentation]
---

# Document content here
```

**Command-line metadata:**
```bash
pandoc input.md -o output.pdf \
  -M title="Document Title" \
  -M author="Author Name" \
  -M date="2025-11-01"
```

**Using metadata file:**
```bash
pandoc input.md -o output.pdf \
  --metadata-file=metadata.yaml
```

### Templates and Variables

**Custom template variables:**
```bash
pandoc input.md -o output.pdf \
  --template=custom.latex \
  -V fontsize=12pt \
  -V geometry:margin=1in \
  -V documentclass=report
```

**Get default template:**
```bash
pandoc -D latex > default.latex
pandoc -D html > default.html
```

### Lua Filters

**Apply Lua filter:**
```bash
pandoc input.md -o output.html \
  --lua-filter=custom-filter.lua
```

**Multiple filters (executed in order):**
```bash
pandoc input.md -o output.html \
  --lua-filter=filter1.lua \
  --lua-filter=filter2.lua
```

**Example Lua filter (word count):**
```lua
-- word-count.lua
words = 0

wordcount = {
  Str = function(el)
    words = words + 1
  end
}

function Pandoc(el)
  pandoc.walk_block(pandoc.Div(el.blocks), wordcount)
  print(words .. " words")
  return el
end
```

### Includes and Composition

**Include files in header/footer:**
```bash
pandoc input.md -o output.html \
  --include-in-header=header.html \
  --include-before-body=nav.html \
  --include-after-body=footer.html
```

**Concatenate multiple input files:**
```bash
pandoc chapter1.md chapter2.md chapter3.md -o book.pdf
```

### Custom Styling

**PDF with custom fonts:**
```bash
pandoc input.md -o output.pdf \
  --pdf-engine=xelatex \
  -V mainfont="Times New Roman" \
  -V sansfont="Arial" \
  -V monofont="Courier New"
```

**HTML with custom CSS:**
```bash
pandoc input.md -o output.html \
  --standalone \
  --css=custom.css \
  --css=syntax.css
```

## Format-Specific Options

### PDF Options

- `--pdf-engine=ENGINE` - Specify PDF engine (pdflatex, xelatex, lualatex, wkhtmltopdf, etc.)
- `--pdf-engine-opt=STRING` - Pass options to PDF engine
- `-V geometry:margin=SIZE` - Set page margins
- `-V fontsize=SIZE` - Set font size (10pt, 11pt, 12pt)
- `-V documentclass=CLASS` - LaTeX document class (article, report, book)
- `--number-sections` - Number section headings

### HTML Options

- `--standalone` - Produce standalone HTML with header/footer
- `--self-contained` - Produce self-contained HTML (deprecated)
- `--embed-resources` - Embed images and other resources
- `--css=URL` - Link to CSS stylesheet
- `--toc` - Include table of contents
- `--toc-depth=N` - Depth of TOC (default 3)
- `--highlight-style=STYLE` - Syntax highlighting style

### DOCX Options

- `--reference-doc=FILE` - Use reference document for styles
- `--toc` - Include table of contents
- `--number-sections` - Number headings

### EPUB Options

- `--epub-cover-image=FILE` - Cover image
- `--epub-metadata=FILE` - Metadata XML file
- `--epub-embed-font=FILE` - Embed font file
- `--epub-chapter-level=N` - Heading level for chapters
- `--toc-depth=N` - TOC depth

## Troubleshooting

### PDF Generation Issues

**Missing LaTeX packages:**
Install full LaTeX distribution (TeXLive or MacTeX):
```bash
# macOS
brew install --cask mactex

# Ubuntu/Debian
sudo apt-get install texlive-full

# Minimal install
sudo apt-get install texlive-latex-base texlive-fonts-recommended texlive-latex-extra
```

**Unicode issues:**
Use XeLaTeX or LuaLaTeX instead of pdflatex:
```bash
pandoc input.md -o output.pdf --pdf-engine=xelatex
```

**Images not appearing:**
Ensure images are in supported formats (PNG, JPG, PDF) and paths are correct.

### HTML Issues

**Broken links to resources:**
Use `--embed-resources` to embed images and CSS:
```bash
pandoc input.md -o output.html --standalone --embed-resources
```

### Citation Issues

**Citations not processing:**
Ensure `--citeproc` flag is used and bibliography file exists:
```bash
pandoc input.md -o output.pdf --citeproc --bibliography=refs.bib
```

**Citation style not applied:**
Specify CSL file explicitly:
```bash
pandoc input.md -o output.pdf --citeproc --bibliography=refs.bib --csl=apa.csl
```

## Performance Tips

### Large Documents

**Use chunked HTML for large documents:**
```bash
pandoc large-book.md -o book.html \
  --standalone \
  --split-level=2 \
  --chunk-template="%n-%s.html"
```

**Process in parallel for batch conversions:**
Use the `batch_convert.py` script included with this skill.

### Memory Optimization

**For very large files, convert in stages:**
```bash
# First to intermediate format
pandoc huge.docx -o intermediate.md

# Then to final format
pandoc intermediate.md -o output.pdf
```
