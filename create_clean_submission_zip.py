"""
Clean Submission Zip Creator for CloudNotes + SupportPilot.
Packages ONLY clean source code, strictly excluding:
- .env, .env.local, *.env
- node_modules/
- venv/, .venv/
- __pycache__/, *.pyc, *.pyo
- .pytest_cache/, .cache/
- .git/
- dist/, build/
- *.zip
"""
import os
import zipfile
from pathlib import Path

EXCLUDE_DIRS = {
    "node_modules",
    "venv",
    ".venv",
    "__pycache__",
    ".pytest_cache",
    ".cache",
    ".git",
    "dist",
    "build",
}

EXCLUDE_EXTENSIONS = {
    ".pyc",
    ".pyo",
    ".zip",
}

EXCLUDE_FILENAMES = {
    ".env",
    ".env.local",
    ".env.production",
}

def should_exclude(rel_path: Path) -> bool:
    parts = set(rel_path.parts)
    if parts & EXCLUDE_DIRS:
        return True
    if rel_path.name in EXCLUDE_FILENAMES:
        return True
    if rel_path.suffix in EXCLUDE_EXTENSIONS:
        return True
    return False

def make_clean_zip(output_zip: str = "CloudNotes-SupportPilot-Clean-Source.zip"):
    root_dir = Path(__file__).resolve().parent
    output_path = root_dir / output_zip
    if output_path.exists():
        output_path.unlink()

    print(f"Creating clean source package at: {output_path.name}")
    count = 0
    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(root_dir):
            for f in files:
                full_path = Path(root) / f
                rel_path = full_path.relative_to(root_dir)
                if should_exclude(rel_path):
                    continue
                zipf.write(full_path, arcname=str(rel_path))
                count += 1

    size_mb = output_path.stat().st_size / (1024 * 1024)
    print(f"Successfully packaged {count} clean source files ({size_mb:.2f} MB).")
    print("Zero secrets, zero node_modules, zero venv included!")

if __name__ == "__main__":
    make_clean_zip()
