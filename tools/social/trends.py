#!/usr/bin/env python3
"""trends.py — trend-sensing за съдържание (Социалджията v2.0).

Дава тренд-сигнали (Google Trends) за тема/регион, за да избереш ъгъл/ключови думи
за следващата партида клипове. TikTok Creative Center няма официален публичен API —
там провери ръчно „Trend Discovery → Songs" по 7-дневен растеж.

Употреба:  python3 trends.py "дежурна аптека" "евро" --geo BG
Зависимост: pytrends (pip install pytrends). Казва ясно, ако липсва.
"""
from __future__ import annotations
import argparse
import sys


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("terms", nargs="+")
    ap.add_argument("--geo", default="BG")
    ap.add_argument("--timeframe", default="now 7-d")
    a = ap.parse_args()

    try:
        from pytrends.request import TrendReq
    except Exception:
        sys.exit("✘ Липсва pytrends. Инсталирай: pip install pytrends")

    py = TrendReq(hl="bg-BG", tz=180)
    py.build_payload(a.terms[:5], geo=a.geo, timeframe=a.timeframe)

    print(f"# Тренд за {a.terms} · {a.geo} · {a.timeframe}\n")
    try:
        iot = py.interest_over_time()
        if not iot.empty:
            print("── Интерес във времето (последни стойности) ──")
            print(iot.tail(5).to_string())
    except Exception as e:
        print(f"⚠ interest_over_time: {e}")

    try:
        rel = py.related_queries()
        for term, d in rel.items():
            rising = d.get("rising")
            if rising is not None and not rising.empty:
                print(f'\n── Изгряващи заявки за „{term}" ──')
                print(rising.head(8).to_string(index=False))
    except Exception as e:
        print(f"⚠ related_queries: {e}")

    print("\nИзползвай изгряващите заявки като hook/ключови думи в captions + изговорен текст.")
    print("Звук: TikTok Creative Center → Songs по 7-дн. растеж (ръчно; филтрирай commercial за ранния прозорец).")


if __name__ == "__main__":
    main()
