#!/usr/bin/env python3
"""
Checks for pandoc dependencies required for specific output formats.

This script verifies that required tools are installed for various pandoc
output formats, especially PDF generation which requires LaTeX or other engines.
"""

import subprocess
import sys
import json
from pathlib import Path


def check_command(cmd):
    """Check if a command is available."""
    try:
        subprocess.run([cmd, '--version'],
                      capture_output=True,
                      check=True,
                      timeout=5)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
        return False


def check_latex_packages():
    """Check for common LaTeX packages needed by pandoc."""
    packages = [
        'amsfonts', 'amsmath', 'lm', 'unicode-math',
        'listings', 'fancyvrb', 'longtable', 'booktabs',
        'graphicx', 'hyperref', 'xcolor', 'geometry'
    ]

    # Try to check if kpsewhich exists (part of LaTeX distributions)
    if not check_command('kpsewhich'):
        return None, "Cannot verify LaTeX packages (kpsewhich not found)"

    missing = []
    for pkg in packages:
        try:
            result = subprocess.run(['kpsewhich', f'{pkg}.sty'],
                                  capture_output=True,
                                  timeout=2)
            if result.returncode != 0:
                missing.append(pkg)
        except (subprocess.TimeoutExpired, FileNotFoundError):
            continue

    if missing:
        return False, f"Missing LaTeX packages: {', '.join(missing)}"
    return True, "All common LaTeX packages found"


def check_pdf_engines():
    """Check available PDF engines."""
    engines = {
        'pdflatex': 'Default LaTeX engine',
        'xelatex': 'XeLaTeX (better Unicode support)',
        'lualatex': 'LuaLaTeX (modern LaTeX)',
        'latexmk': 'LaTeX build tool',
        'tectonic': 'Modern self-contained LaTeX',
        'wkhtmltopdf': 'HTML to PDF converter',
        'weasyprint': 'CSS-based PDF generator',
        'context': 'ConTeXt document processor',
        'pdfroff': 'Groff-based PDF generator'
    }

    available = {}
    for engine, desc in engines.items():
        available[engine] = {
            'available': check_command(engine),
            'description': desc
        }

    return available


def check_bibliography_tools():
    """Check for bibliography processing tools."""
    tools = {
        'biber': 'BibLaTeX backend',
        'bibtex': 'Traditional BibTeX',
    }

    available = {}
    for tool, desc in tools.items():
        available[tool] = {
            'available': check_command(tool),
            'description': desc
        }

    return available


def check_pandoc():
    """Check pandoc installation and version."""
    try:
        result = subprocess.run(['pandoc', '--version'],
                              capture_output=True,
                              text=True,
                              check=True,
                              timeout=5)
        version_line = result.stdout.split('\n')[0]
        return True, version_line
    except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
        return False, "pandoc not found"


def main():
    """Run dependency checks and output results."""
    results = {
        'pandoc': {},
        'pdf_engines': {},
        'latex_packages': {},
        'bibliography_tools': {},
        'recommendations': []
    }

    # Check pandoc
    pandoc_ok, pandoc_info = check_pandoc()
    results['pandoc']['available'] = pandoc_ok
    results['pandoc']['info'] = pandoc_info

    if not pandoc_ok:
        print(json.dumps(results, indent=2))
        sys.exit(1)

    # Check PDF engines
    results['pdf_engines'] = check_pdf_engines()

    # Check LaTeX packages
    latex_ok, latex_info = check_latex_packages()
    results['latex_packages']['available'] = latex_ok
    results['latex_packages']['info'] = latex_info

    # Check bibliography tools
    results['bibliography_tools'] = check_bibliography_tools()

    # Generate recommendations
    any_pdf_engine = any(e['available'] for e in results['pdf_engines'].values())

    if not any_pdf_engine:
        results['recommendations'].append({
            'severity': 'warning',
            'message': 'No PDF engine found. Install LaTeX (TeXLive/MacTeX) or wkhtmltopdf for PDF output.'
        })

    if latex_ok is False:
        results['recommendations'].append({
            'severity': 'warning',
            'message': latex_info
        })

    # Check for at least one good modern engine
    modern_engines = ['xelatex', 'lualatex', 'tectonic']
    has_modern = any(results['pdf_engines'].get(e, {}).get('available') for e in modern_engines)

    if any_pdf_engine and not has_modern:
        results['recommendations'].append({
            'severity': 'info',
            'message': 'Consider installing xelatex or lualatex for better Unicode support.'
        })

    print(json.dumps(results, indent=2))

    # Exit with appropriate code
    if not any_pdf_engine:
        sys.exit(2)  # Warning level

    sys.exit(0)


if __name__ == "__main__":
    main()
