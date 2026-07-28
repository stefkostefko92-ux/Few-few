#!/usr/bin/env python3
"""Проверява, че нито един текст на екрана не е останал без превод.

Три проверки, всяка fail-closed:

1. Каталозите (`Localizable.xcstrings`, `InfoPlist.xcstrings`) са валиден JSON и
   **всеки** ключ има превод за всеки обявен език.
2. Всеки литерален ключ, употребен в Swift кода (`Text("list.title")`,
   `String(localized: "row.done")`), съществува в каталога.
3. Всеки case на изброяванията, които раздават ключове по `rawValue`
   (`RepeatRule`, `ReminderSection`, `SnoozeOption`, `DayBucket`, `ReminderWarning`),
   има свой ключ — тези не се виждат като литерали в кода.

Нула зависимости. Пуска се от `karakochev/`:

    python3 scripts/check-localization.py
"""

from __future__ import annotations

import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
CATALOGS = [
    ROOT / "Karakochev/Resources/Localizable.xcstrings",
    ROOT / "Karakochev/Resources/InfoPlist.xcstrings",
]
LANGUAGES = {"bg", "en", "it"}

# Изброяване → шаблон на ключа. Такъв ключ никога не се вижда като литерал.
ENUM_KEYS = {
    "RepeatRule": ["repeat.{case}", "repeat.short.{case}"],
    "ReminderSection": ["section.{case}"],
    "SnoozeOption": ["snooze.{case}"],
    "DayBucket": ["date.{case}"],
    "ReminderWarning": ["warning.{case}"],
}
# Еднократното няма къс етикет — то не носи капсула в реда.
ENUM_EXCEPTIONS = {"repeat.short.once"}

KEY_PATTERN = re.compile(r'"([a-z][a-zA-Z]*(?:\.[a-zA-Z]+)+)(?:\s+\\\([^"]*)?"')
# Имената на SF Symbol-ите изглеждат като ключове („bell.badge“), но не са текст.
# Режем до края на реда, за да хванем и тернарните („isDone ? "a" : "b"“).
SYMBOL_PATTERN = re.compile(r"(?:systemImage|systemName):.*$", re.MULTILINE)
CASE_PATTERN = re.compile(r"^\s*case\s+([a-zA-Z, ]+)$", re.MULTILINE)

problems: list[str] = []


def load_catalog(path: pathlib.Path) -> dict:
    try:
        catalog = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        problems.append(f"{path.name}: не се чете ({error})")
        return {"strings": {}}

    for key, entry in catalog.get("strings", {}).items():
        localizations = entry.get("localizations", {})
        for missing in sorted(LANGUAGES - set(localizations)):
            problems.append(f"{path.name}: ключът „{key}“ няма превод на {missing}")

        # Празна обвивка минава за „преведено“, ако не проверим съдържанието:
        # всеки език носи или готов низ, или пълен набор форми за брой.
        for language, unit in localizations.items():
            if "stringUnit" in unit:
                continue
            forms = unit.get("variations", {}).get("plural", {})
            if not {"one", "other"} <= set(forms):
                problems.append(
                    f"{path.name}: „{key}“ на {language} няма нито текст, нито форми one/other"
                )
    return catalog


def enum_cases(name: str) -> list[str]:
    """Изважда case-овете на дадено изброяване от Core."""
    for path in (ROOT / "Karakochev/Core").glob("*.swift"):
        text = path.read_text(encoding="utf-8")
        match = re.search(rf"enum {name}[^{{]*{{(.*?)\n}}", text, re.DOTALL)
        if not match:
            continue
        cases: list[str] = []
        for line in CASE_PATTERN.findall(match.group(1)):
            cases += [part.strip() for part in line.split(",") if part.strip()]
        return cases
    problems.append(f"изброяването {name} не е намерено в Core/")
    return []


def main() -> int:
    known: set[str] = set()
    for path in CATALOGS:
        known |= set(load_catalog(path).get("strings", {}))

    # 2. Литералите в кода.
    used: set[str] = set()
    for path in (ROOT / "Karakochev").rglob("*.swift"):
        source = SYMBOL_PATTERN.sub("", path.read_text(encoding="utf-8"))
        for key in KEY_PATTERN.findall(source):
            used.add(key)
    for key in sorted(used - known):
        problems.append(f"кодът ползва ключ „{key}“, който липсва в каталога")

    # 3. Ключовете, раздавани по rawValue.
    expected: set[str] = set()
    for enum, templates in ENUM_KEYS.items():
        for case in enum_cases(enum):
            for template in templates:
                key = template.format(case=case)
                if key not in ENUM_EXCEPTIONS:
                    expected.add(key)
    for key in sorted(expected - known):
        problems.append(f"изброяване раздава ключ „{key}“, който липсва в каталога")

    unused = known - used - expected - {"CFBundleDisplayName", "CFBundleName"}
    for key in sorted(unused):
        problems.append(f"каталогът носи неизползван ключ „{key}“")

    if problems:
        print("✗ локализация:")
        for problem in problems:
            print(f"  - {problem}")
        return 1

    print(f"✓ локализация: {len(known)} ключа, езици {sorted(LANGUAGES)} — пълни и употребени")
    return 0


if __name__ == "__main__":
    sys.exit(main())
