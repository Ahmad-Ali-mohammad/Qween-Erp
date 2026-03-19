from __future__ import annotations

import re
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[4]
APP_CONFIG = REPO_ROOT / "packages" / "app-config" / "src" / "index.ts"
DOCS_SYSTEMS = REPO_ROOT / "docs" / "restructure" / "systems"

CODE_EXTENSIONS = {".ts", ".tsx", ".js", ".jsx", ".css"}
SCAN_ROOTS = [REPO_ROOT / "apps", REPO_ROOT / "packages", REPO_ROOT / "src"]
LEGACY_WEB_FORBIDDEN = [
    "@reduxjs/toolkit",
    "react-redux",
    "@sentry/react",
    "vite-plugin-pwa",
]
LEGACY_WEB_FORBIDDEN_PATHS = [
    Path("apps/web/src/app"),
    Path("apps/web/src/components"),
    Path("apps/web/src/features"),
    Path("apps/web/src/observability"),
]
LEGACY_FRONTEND_FORBIDDEN_PATHS = [
    Path("frontend/js/core"),
    Path("frontend/js/i18n"),
    Path("frontend/js/modules"),
    Path("frontend/styles"),
]


def parse_systems() -> list[dict[str, str]]:
    content = APP_CONFIG.read_text(encoding="utf-8")
    pattern = re.compile(
        r"\{\s*key:\s*'(?P<key>[^']+)'.*?routeBase:\s*'(?P<routeBase>[^']+)'.*?appDir:\s*'(?P<appDir>[^']+)'",
        re.DOTALL,
    )
    systems: list[dict[str, str]] = []
    for match in pattern.finditer(content):
        systems.append(match.groupdict())
    return systems


def scan_forbidden_imports() -> list[str]:
    violations: list[str] = []
    for root in SCAN_ROOTS:
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if not path.is_file() or path.suffix not in CODE_EXTENSIONS:
                continue
            relative = path.relative_to(REPO_ROOT).as_posix()
            text = path.read_text(encoding="utf-8", errors="ignore")

            if "legacy-ops-runtime" in text:
                violations.append(f"Forbidden legacy runtime reference: {relative}")

            if relative.startswith("apps/web/"):
                continue

            if "apps/web/" in text or "apps\\web\\" in text:
                violations.append(f"Forbidden import or path reference to apps/web: {relative}")

    return violations


def check_legacy_web_transition_state() -> list[str]:
    violations: list[str] = []
    legacy_package = REPO_ROOT / "apps" / "web" / "package.json"
    legacy_app = REPO_ROOT / "apps" / "web" / "src" / "App.tsx"

    for relative_path in LEGACY_WEB_FORBIDDEN_PATHS:
        absolute_path = REPO_ROOT / relative_path
        if absolute_path.exists():
            violations.append(
                f"apps/web must stay minimal; forbidden legacy path still exists: {relative_path.as_posix()}"
            )

    if legacy_package.exists():
        package_text = legacy_package.read_text(encoding="utf-8", errors="ignore")
        for item in LEGACY_WEB_FORBIDDEN:
            if item in package_text:
                violations.append(f"apps/web must stay minimal; forbidden dependency found: {item}")

    if legacy_app.exists():
        app_text = legacy_app.read_text(encoding="utf-8", errors="ignore")
        if "features/" in app_text or "useAppSelector" in app_text or "LoginPage" in app_text:
            violations.append("apps/web App.tsx must remain transition-only and must not render legacy business features")

    return violations


def check_legacy_frontend_transition_state() -> list[str]:
    violations: list[str] = []

    for relative_path in LEGACY_FRONTEND_FORBIDDEN_PATHS:
        absolute_path = REPO_ROOT / relative_path
        if absolute_path.exists():
            violations.append(
                f"frontend legacy shell must stay minimal; forbidden path still exists: {relative_path.as_posix()}"
            )

    legacy_index = REPO_ROOT / "frontend" / "index.html"
    if legacy_index.exists():
        index_text = legacy_index.read_text(encoding="utf-8", errors="ignore")
        if "/styles/" in index_text:
            violations.append("frontend/index.html must not reference legacy /styles assets")

    legacy_app = REPO_ROOT / "frontend" / "js" / "app.js"
    if legacy_app.exists():
        app_text = legacy_app.read_text(encoding="utf-8", errors="ignore")
        forbidden_tokens = ["./core/", "./modules/", "./i18n/"]
        for token in forbidden_tokens:
            if token in app_text:
                violations.append(f"frontend/js/app.js must stay standalone; forbidden import token found: {token}")

    return violations


def check_system_files(systems: list[dict[str, str]]) -> list[str]:
    violations: list[str] = []
    for system in systems:
        app_dir = REPO_ROOT / "apps" / system["appDir"]
        key = system["key"]

        if not app_dir.exists():
            violations.append(f"Missing app directory for system '{key}': apps/{system['appDir']}")
            continue

        app_file = app_dir / "src" / "App.tsx"
        main_file = app_dir / "src" / "main.tsx"
        if not app_file.exists():
            violations.append(f"Missing App.tsx for system '{key}': {app_file.relative_to(REPO_ROOT).as_posix()}")
        if not main_file.exists():
            violations.append(f"Missing main.tsx for system '{key}': {main_file.relative_to(REPO_ROOT).as_posix()}")

        if key != "control-center":
            system_file = app_dir / "src" / "system.ts"
            if not system_file.exists():
                violations.append(
                    f"Missing system.ts for system '{key}': {system_file.relative_to(REPO_ROOT).as_posix()}"
                )

        doc_file = DOCS_SYSTEMS / f"{key}.ar.md"
        if not doc_file.exists():
            violations.append(f"Missing system doc for '{key}': {doc_file.relative_to(REPO_ROOT).as_posix()}")

    return violations


def main() -> int:
    if not APP_CONFIG.exists():
        print("ERROR: app config file not found.", file=sys.stderr)
        return 2

    systems = parse_systems()
    if not systems:
        print("ERROR: could not parse systems from packages/app-config/src/index.ts", file=sys.stderr)
        return 2

    violations = []
    violations.extend(check_system_files(systems))
    violations.extend(scan_forbidden_imports())
    violations.extend(check_legacy_web_transition_state())
    violations.extend(check_legacy_frontend_transition_state())

    if violations:
        print("ERP Qween modular guardrails failed:")
        for violation in violations:
            print(f"- {violation}")
        return 1

    print("ERP Qween modular guardrails passed.")
    print(f"Checked {len(systems)} systems from packages/app-config/src/index.ts")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
