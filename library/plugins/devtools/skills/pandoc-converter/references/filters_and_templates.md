# Pandoc Filters and Templates Guide

This document provides guidance on using Lua filters and custom templates with pandoc.

## Lua Filters

Lua filters allow you to modify the pandoc AST (Abstract Syntax Tree) during conversion. They are more efficient and portable than JSON filters.

### Basic Filter Structure

```lua
-- example-filter.lua
function Header(elem)
  -- Modify header elements
  return elem
end

function Para(elem)
  -- Modify paragraph elements
  return elem
end
```

### Common Filter Patterns

#### Adding Custom Classes to Elements

```lua
-- add-class.lua
function CodeBlock(elem)
  -- Add 'highlighted' class to all code blocks
  if elem.classes[1] == nil then
    elem.classes = {'highlighted'}
  end
  return elem
end
```

#### Modifying Links

```lua
-- external-links.lua
function Link(elem)
  -- Add target="_blank" to external links
  if string.match(elem.target, "^http") then
    elem.attributes.target = "_blank"
    elem.attributes.rel = "noopener noreferrer"
  end
  return elem
end
```

#### Custom Div Processing

```lua
-- callout-boxes.lua
function Div(elem)
  -- Convert divs with 'note' class to custom HTML
  if elem.classes[1] == "note" then
    local content = pandoc.write(pandoc.Pandoc(elem.content), 'html')
    return pandoc.RawBlock('html',
      '<div class="callout-note">' .. content .. '</div>')
  end
  return elem
end
```

#### Word Count Filter

```lua
-- word-count.lua
local word_count = 0

function Str(elem)
  word_count = word_count + 1
end

function Pandoc(doc)
  pandoc.walk_block(pandoc.Div(doc.blocks), {Str = Str})
  print(string.format("Word count: %d", word_count))
  return doc
end
```

#### Include Files Filter

```lua
-- include-files.lua
function CodeBlock(elem)
  -- Include file contents when code block has 'include' class
  if elem.classes[1] == "include" then
    local filepath = elem.text
    local f = io.open(filepath, "r")
    if f then
      local content = f:read("*all")
      f:close()
      elem.text = content
      elem.classes = elem.classes[2] and {elem.classes[2]} or {}
    end
  end
  return elem
end
```

#### Table Processing

```lua
-- table-captions.lua
function Table(elem)
  -- Add numbering to table captions
  if elem.caption.long then
    local caption_text = pandoc.utils.stringify(elem.caption.long)
    local new_caption = pandoc.Str("Table X: " .. caption_text)
    elem.caption.long = {pandoc.Plain({new_caption})}
  end
  return elem
end
```

### Advanced Filter Techniques

#### Accessing Metadata

```lua
-- use-metadata.lua
local title = nil

function Meta(meta)
  title = pandoc.utils.stringify(meta.title)
  return meta
end

function Header(elem)
  if elem.level == 1 and title then
    -- Use metadata in processing
  end
  return elem
end
```

#### Multi-pass Filters

```lua
-- two-pass.lua
local citations = {}

-- First pass: collect citations
function Cite(elem)
  table.insert(citations, elem)
  return elem
end

-- Second pass: modify document
function Pandoc(doc)
  -- Process collected citations
  return doc
end
```

#### Custom Syntax Extensions

```lua
-- shortcodes.lua
function Str(elem)
  -- Convert {{% date %}} to current date
  local text = elem.text
  text = string.gsub(text, "{{%% date %%}}", os.date("%Y-%m-%d"))
  elem.text = text
  return elem
end
```

### Using Filters

**Single filter:**
```bash
pandoc input.md -o output.html --lua-filter=custom.lua
```

**Multiple filters (executed in order):**
```bash
pandoc input.md -o output.html \
  --lua-filter=filter1.lua \
  --lua-filter=filter2.lua \
  --lua-filter=filter3.lua
```

**Filters with citeproc:**
```bash
# Filters run before citeproc
pandoc input.md -o output.pdf \
  --lua-filter=preprocess.lua \
  --citeproc

# Filters run after citeproc
pandoc input.md -o output.pdf \
  --citeproc \
  --lua-filter=postprocess.lua
```

### Filter Resources

**Pandoc Lua filter documentation:**
https://pandoc.org/lua-filters.html

**Filter examples repository:**
https://github.com/pandoc/lua-filters

**Pandoc types reference:**
Access via `pandoc.types` in Lua filters

## Templates

Templates control the overall structure and formatting of generated documents.

### Getting Default Templates

**View default template:**
```bash
pandoc -D latex    # LaTeX template
pandoc -D html     # HTML template
pandoc -D docx     # Not available (use reference-doc instead)
```

**Save default template for customization:**
```bash
pandoc -D latex > custom.latex
pandoc -D html > custom.html
```

### Template Syntax

#### Variables

**Basic variable:**
```
$title$
${title}
```

**Variable with default:**
```
${author-meta}
$if(author)$$author$$else$Anonymous$endif$
```

**Nested variables:**
```
$author.name$
$author.affiliation$
```

#### Conditionals

**Basic if:**
```
$if(toc)$
<nav id="TOC">
$toc$
</nav>
$endif$
```

**If-else:**
```
$if(lang)$
<html lang="$lang$">
$else$
<html>
$endif$
```

**Multiple conditions:**
```
$if(title)$
  $if(subtitle)$
    <h1>$title$: $subtitle$</h1>
  $else$
    <h1>$title$</h1>
  $endif$
$endif$
```

#### Loops

**For loop:**
```
$for(author)$
<meta name="author" content="$author$">
$endfor$
```

**Loop with separator:**
```
$for(author)$$author$$sep$, $endfor$
```

**Nested loops:**
```
$for(include-before)$
$include-before$
$endfor$
```

#### Partials

**Include another template:**
```
$for(header-includes)$
$header-includes$
$endfor$
```

### LaTeX Template Customization

**Custom document class:**
```latex
\documentclass[$if(fontsize)$$fontsize$,$endif$$if(lang)$$babel-lang$,$endif$]{$documentclass$}
```

**Custom packages:**
```latex
$if(highlighting-macros)$
$highlighting-macros$
$endif$

\usepackage{custom-package}
```

**Custom headers/footers:**
```latex
\usepackage{fancyhdr}
\pagestyle{fancy}
\fancyhead[L]{$title$}
\fancyhead[R]{$author$}
```

**Example minimal LaTeX template:**
```latex
\documentclass{article}

$if(fontsize)$
\usepackage[$fontsize$]{extsizes}
$endif$

\usepackage[margin=$if(margin)$$margin$$else$1in$endif$]{geometry}

$if(title)$
\title{$title$}
$endif$

$if(author)$
\author{$for(author)$$author$$sep$ \and $endfor$}
$endif$

\begin{document}

$if(title)$
\maketitle
$endif$

$body$

\end{document}
```

### HTML Template Customization

**Custom CSS inclusion:**
```html
$for(css)$
<link rel="stylesheet" href="$css$">
$endfor$
```

**Custom scripts:**
```html
$for(header-includes)$
$header-includes$
$endfor$
```

**Example minimal HTML5 template:**
```html
<!DOCTYPE html>
<html$if(lang)$ lang="$lang$"$endif$>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  $if(title)$
  <title>$title$</title>
  $endif$
  $for(css)$
  <link rel="stylesheet" href="$css$">
  $endfor$
</head>
<body>
$if(title)$
<header>
  <h1 class="title">$title$</h1>
  $if(subtitle)$
  <p class="subtitle">$subtitle$</p>
  $endif$
  $if(author)$
  <p class="author">$for(author)$$author$$sep$, $endfor$</p>
  $endif$
  $if(date)$
  <p class="date">$date$</p>
  $endif$
</header>
$endif$

$if(toc)$
<nav id="TOC">
$toc$
</nav>
$endif$

<main>
$body$
</main>

$for(include-after)$
$include-after$
$endfor$

</body>
</html>
```

### Using Custom Templates

**LaTeX template:**
```bash
pandoc input.md -o output.pdf \
  --template=custom.latex \
  -V documentclass=report \
  -V fontsize=12pt
```

**HTML template:**
```bash
pandoc input.md -o output.html \
  --template=custom.html \
  --standalone
```

**Template with metadata:**
```bash
pandoc input.md -o output.pdf \
  --template=custom.latex \
  -M title="Custom Title" \
  -M author="Author Name" \
  -V geometry:margin=1.5in
```

### Template Variables

#### Common Variables

**Metadata variables:**
- `$title$` - Document title
- `$author$` - Author(s)
- `$date$` - Date
- `$abstract$` - Abstract text
- `$keywords$` - Keywords

**Content variables:**
- `$body$` - Main document body
- `$toc$` - Table of contents
- `$include-before$` - Content before body
- `$include-after$` - Content after body

**Format-specific variables:**
- `$documentclass$` - LaTeX document class
- `$fontsize$` - Font size
- `$geometry$` - Page geometry
- `$mainfont$` - Main font (XeLaTeX/LuaLaTeX)
- `$lang$` - Document language

### Template Development Workflow

1. **Get default template:**
   ```bash
   pandoc -D latex > my-template.latex
   ```

2. **Make modifications:**
   Edit the template file with custom styling, packages, etc.

3. **Test template:**
   ```bash
   pandoc test.md -o test.pdf --template=my-template.latex
   ```

4. **Install template (optional):**
   ```bash
   mkdir -p ~/.local/share/pandoc/templates
   cp my-template.latex ~/.local/share/pandoc/templates/default.latex
   ```

5. **Use installed template:**
   ```bash
   pandoc input.md -o output.pdf
   # Uses ~/.local/share/pandoc/templates/default.latex automatically
   ```

### Best Practices

**Filters:**
- Keep filters focused on single tasks
- Use descriptive function names
- Add comments explaining complex transformations
- Test filters with various input documents
- Chain multiple simple filters rather than one complex filter

**Templates:**
- Start from default templates
- Use conditionals to make templates flexible
- Provide sensible defaults for variables
- Document custom variables in comments
- Test with and without optional metadata

### Common Use Cases

#### Academic Papers

**Filter for equation numbering:**
```lua
-- equation-numbers.lua
local eq_num = 0

function Math(elem)
  if elem.mathtype == "DisplayMath" then
    eq_num = eq_num + 1
    return pandoc.RawInline('latex',
      '\\begin{equation}' .. elem.text .. '\\end{equation}')
  end
  return elem
end
```

**Template with institutional branding:**
```latex
\documentclass[12pt]{article}
\usepackage{graphicx}
\usepackage{fancyhdr}

\pagestyle{fancy}
\lhead{\includegraphics[height=1cm]{logo.png}}
\rhead{$title$}

% ... rest of template
```

#### Web Documentation

**Filter for GitHub-style alerts:**
```lua
-- github-alerts.lua
function BlockQuote(elem)
  local first = elem.content[1]
  if first and first.t == "Para" then
    local text = pandoc.utils.stringify(first)
    local alert_type = text:match("^%[!(%w+)%]")

    if alert_type then
      return pandoc.Div(elem.content, {class = "alert-" .. alert_type:lower()})
    end
  end
  return elem
end
```

#### Reports

**Filter for executive summary:**
```lua
-- exec-summary.lua
function Div(elem)
  if elem.classes[1] == "executive-summary" then
    -- Extract and format executive summary
    return pandoc.Div(elem.content, {class = "summary-box"})
  end
  return elem
end
```

## Debugging

**Verbose output:**
```bash
pandoc input.md -o output.pdf --verbose
```

**Check intermediate AST:**
```bash
pandoc input.md -t native
```

**Test filter output:**
```bash
pandoc input.md -t native --lua-filter=test.lua
```

**Pandoc trace mode:**
```bash
pandoc input.md -o output.pdf --trace
```
