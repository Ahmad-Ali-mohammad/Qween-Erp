#!/usr/bin/env python3
"""Generate a concise Arabic push/PR summary from the current git branch."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


IMPROVEMENT_KEYWORDS = (
    "fix",
    "stabilize",
    "stabilise",
    "harden",
    "align",
    "improve",
    "cleanup",
    "optimize",
    "resolve",
    "prevent",
    "avoid",
    "correct",
    "patch",
    "refine",
    "self-contained",
)

DEVELOPMENT_KEYWORDS = (
    "add",
    "create",
    "implement",
    "introduce",
    "expose",
    "support",
    "enable",
    "build",
)


def run_git(args: list[str], cwd: Path) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=str(cwd),
        text=True,
        capture_output=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or f"git {' '.join(args)} failed")
    return result.stdout.strip()


def classify_subject(subject: str) -> str:
    lowered = subject.lower()
    if any(keyword in lowered for keyword in IMPROVEMENT_KEYWORDS):
        return "improvement"
    if any(keyword in lowered for keyword in DEVELOPMENT_KEYWORDS):
        return "development"
    return "development"


def summarize_commits(subjects: list[str]) -> tuple[list[str], list[str]]:
    development: list[str] = []
    improvements: list[str] = []
    for subject in subjects:
        bucket = classify_subject(subject)
        if bucket == "improvement":
            improvements.append(subject)
        else:
            development.append(subject)
    return development, improvements


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="origin/master")
    parser.add_argument("--head", default="HEAD")
    parser.add_argument("--verify", action="append", default=[])
    parser.add_argument("--note", action="append", default=[])
    parser.add_argument("--repo", default=".")
    args = parser.parse_args()

    repo = Path(args.repo).resolve()

    try:
        branch = run_git(["branch", "--show-current"], repo) or "(detached HEAD)"
        commit_lines = run_git(["log", "--reverse", "--oneline", f"{args.base}..{args.head}"], repo)
        subjects = []
        for line in commit_lines.splitlines():
            line = line.strip()
            if not line:
                continue
            parts = line.split(" ", 1)
            subjects.append(parts[1] if len(parts) > 1 else parts[0])

        shortstat = run_git(["diff", "--shortstat", f"{args.base}..{args.head}"], repo)
        changed_files = run_git(["diff", "--name-only", f"{args.base}..{args.head}"], repo).splitlines()
        status = run_git(["status", "--short"], repo)
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    development, improvements = summarize_commits(subjects)
    dirty = bool(status.strip())
    default_branch = branch in {"master", "main"}

    print("## التطوير")
    if development:
        for item in development:
            print(f"- {item}")
    else:
        print("- لا توجد عناصر تطوير جديدة واضحة من عناوين الـ commits؛ راجع diff الفرع عند الحاجة.")

    print()
    print("## التحسينات")
    if improvements:
        for item in improvements:
            print(f"- {item}")
    else:
        print("- لا توجد عناصر تحسين منفصلة مصنفة من عناوين الـ commits.")
    if shortstat:
        print(f"- نطاق الفرق: `{shortstat}`")
    if changed_files:
        preview = ", ".join(f"`{path}`" for path in changed_files[:6])
        suffix = " ..." if len(changed_files) > 6 else ""
        print(f"- ملفات متأثرة: {preview}{suffix}")

    print()
    print("## التحقق")
    if args.verify:
        for item in args.verify:
            print(f"- `{item}`")
    else:
        print("- لم يتم تمرير أوامر تحقق إلى السكربت.")

    print()
    print("## ملاحظات")
    print(f"- الفرع الحالي: `{branch}` مقارنةً مع `{args.base}`.")
    if default_branch:
        print("- الفرع الحالي هو الفرع الافتراضي المحلي؛ تجنب الدفع المباشر إذا كان المقصود العمل عبر PR.")
    else:
        print("- الملخص موجّه لفرع عمل معزول، وليس للفرع الافتراضي.")
    if dirty:
        print("- الـ worktree يحتوي تغييرات محلية إضافية؛ يجب حصر الوصف في نطاق الفرع أو commits المقارنة فقط.")
    else:
        print("- لا توجد تغييرات محلية إضافية ضمن حالة git الحالية.")
    for item in args.note:
        print(f"- {item}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
