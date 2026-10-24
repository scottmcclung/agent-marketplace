#!/usr/bin/env python3
"""
Batch conversion script for pandoc operations.

This script handles converting multiple files with the same pandoc options,
maintaining directory structure and providing progress feedback.
"""

import subprocess
import sys
import json
from pathlib import Path
from typing import List, Dict, Any
import argparse


def find_files(patterns: List[str], base_dir: str = '.') -> List[Path]:
    """
    Find all files matching the given patterns.

    Args:
        patterns: List of glob patterns (e.g., ['*.md', '**/*.markdown'])
        base_dir: Base directory to search from

    Returns:
        List of Path objects for matching files
    """
    base = Path(base_dir).resolve()
    files = []

    for pattern in patterns:
        files.extend(base.glob(pattern))

    # Remove duplicates and sort
    return sorted(set(files))


def convert_file(input_file: Path,
                output_dir: Path,
                output_format: str,
                pandoc_args: List[str],
                preserve_structure: bool = True) -> Dict[str, Any]:
    """
    Convert a single file using pandoc.

    Args:
        input_file: Path to input file
        output_dir: Directory for output files
        output_format: Output format (e.g., 'pdf', 'docx')
        pandoc_args: Additional pandoc arguments
        preserve_structure: Whether to maintain directory structure

    Returns:
        Dictionary with conversion results
    """
    result = {
        'input': str(input_file),
        'success': False,
        'output': None,
        'error': None
    }

    try:
        # Determine output file path
        if preserve_structure:
            # Maintain relative directory structure
            rel_path = input_file.relative_to(Path.cwd())
            output_path = output_dir / rel_path.with_suffix(f'.{output_format}')
        else:
            # Flatten to output directory
            output_path = output_dir / input_file.with_suffix(f'.{output_format}').name

        # Create output directory if needed
        output_path.parent.mkdir(parents=True, exist_ok=True)

        # Build pandoc command
        cmd = [
            'pandoc',
            str(input_file),
            '-o', str(output_path),
        ]
        cmd.extend(pandoc_args)

        # Run conversion
        proc_result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300  # 5 minute timeout per file
        )

        if proc_result.returncode == 0:
            result['success'] = True
            result['output'] = str(output_path)
        else:
            result['error'] = proc_result.stderr

    except subprocess.TimeoutExpired:
        result['error'] = 'Conversion timed out (>5 minutes)'
    except Exception as e:
        result['error'] = str(e)

    return result


def main():
    """Main batch conversion function."""
    parser = argparse.ArgumentParser(
        description='Batch convert documents using pandoc'
    )
    parser.add_argument(
        'patterns',
        nargs='+',
        help='File patterns to convert (e.g., "*.md" "docs/**/*.rst")'
    )
    parser.add_argument(
        '-o', '--output-dir',
        default='output',
        help='Output directory (default: output)'
    )
    parser.add_argument(
        '-t', '--to',
        required=True,
        help='Output format (e.g., pdf, docx, html)'
    )
    parser.add_argument(
        '--flatten',
        action='store_true',
        help='Put all output files in output dir (do not preserve structure)'
    )
    parser.add_argument(
        '--pandoc-args',
        default='',
        help='Additional pandoc arguments (quote the entire string)'
    )
    parser.add_argument(
        '--json',
        action='store_true',
        help='Output results as JSON'
    )

    args = parser.parse_args()

    # Find input files
    input_files = find_files(args.patterns)

    if not input_files:
        print(f"No files found matching patterns: {args.patterns}", file=sys.stderr)
        sys.exit(1)

    # Parse additional pandoc arguments
    pandoc_args = args.pandoc_args.split() if args.pandoc_args else []

    # Create output directory
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Process files
    results = []
    for i, input_file in enumerate(input_files, 1):
        if not args.json:
            print(f"[{i}/{len(input_files)}] Converting {input_file}...", file=sys.stderr)

        result = convert_file(
            input_file,
            output_dir,
            args.to,
            pandoc_args,
            preserve_structure=not args.flatten
        )
        results.append(result)

        if not args.json and not result['success']:
            print(f"  ERROR: {result['error']}", file=sys.stderr)

    # Output results
    if args.json:
        print(json.dumps({
            'total': len(results),
            'successful': sum(1 for r in results if r['success']),
            'failed': sum(1 for r in results if not r['success']),
            'results': results
        }, indent=2))
    else:
        successful = sum(1 for r in results if r['success'])
        failed = len(results) - successful
        print(f"\nCompleted: {successful} successful, {failed} failed", file=sys.stderr)

        if failed > 0:
            print("\nFailed files:", file=sys.stderr)
            for r in results:
                if not r['success']:
                    print(f"  - {r['input']}: {r['error']}", file=sys.stderr)

    # Exit with appropriate code
    sys.exit(0 if all(r['success'] for r in results) else 1)


if __name__ == "__main__":
    main()
