from __future__ import annotations

import argparse
import hashlib
import json
import os
import smtplib
import sys
from datetime import datetime, timedelta
from email.message import EmailMessage
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parent.parent
LOGS_DIR = PROJECT_ROOT / "logs"
STATE_FILE = LOGS_DIR / "notification_state.json"

DEFAULT_EMAIL_INFO_FILE = Path(
    r"C:\Software Developement\ChatGPT Codex\Solar Energy - SunRun\SunRun Data\Script\Email_Info.txt"
)
EMAIL_INFO_FILE = Path(os.environ.get("SUNRUN_EMAIL_INFO_FILE", str(DEFAULT_EMAIL_INFO_FILE)))
ALERT_RECIPIENT = os.environ.get("HELIOSPULSE_ALERT_EMAIL", "dglanville@gmail.com").strip() or "dglanville@gmail.com"


def read_email_settings(config_path: Path = EMAIL_INFO_FILE) -> dict[str, Any]:
    if not config_path.is_file():
        raise FileNotFoundError(f"Email configuration file not found: {config_path}")

    raw: dict[str, str] = {}
    for line_no, raw_line in enumerate(config_path.read_text(encoding="utf-8-sig").splitlines(), 1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            raise ValueError(f"Invalid config syntax at line {line_no} in Email_Info.txt")
        k, v = line.split("=", 1)
        raw[k.strip().upper()] = v.strip()

    required = ("SMTP_SERVER", "SMTP_PORT", "EMAIL_FROM", "USERNAME", "APP_PASSWORD")
    missing = [k for k in required if not raw.get(k)]
    if missing:
        raise ValueError(f"Missing required SMTP setting(s): {', '.join(missing)}")

    return {
        "smtp_server": raw["SMTP_SERVER"],
        "smtp_port": int(raw["SMTP_PORT"]),
        "email_from": raw["EMAIL_FROM"],
        "email_to": ALERT_RECIPIENT,
        "username": raw["USERNAME"],
        "app_password": raw["APP_PASSWORD"],
    }


def load_state(state_path: Path = STATE_FILE) -> dict[str, Any]:
    if state_path.is_file():
        try:
            data = json.loads(state_path.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return {
                    "initialized": bool(data.get("initialized", False)),
                    "sent_anomaly_fingerprints": dict(data.get("sent_anomaly_fingerprints", {})),
                    "sent_runtime_errors": dict(data.get("sent_runtime_errors", {})),
                    "known_sunrun_dates": list(data.get("known_sunrun_dates", [])),
                    "known_nyseg_dates": list(data.get("known_nyseg_dates", [])),
                    "known_bill_files": list(data.get("known_bill_files", [])),
                    "recent_email_events": list(data.get("recent_email_events", [])),
                }
        except (OSError, json.JSONDecodeError, TypeError):
            pass
    return {
        "initialized": False,
        "sent_anomaly_fingerprints": {},
        "sent_runtime_errors": {},
        "known_sunrun_dates": [],
        "known_nyseg_dates": [],
        "known_bill_files": [],
        "recent_email_events": [],
    }


def save_state(state: dict[str, Any], state_path: Path = STATE_FILE) -> None:
    state_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = state_path.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    tmp.replace(state_path)


def send_email(subject: str, body: str) -> dict[str, Any]:
    settings = read_email_settings()
    msg = EmailMessage()
    msg["From"] = settings["email_from"]
    msg["To"] = settings["email_to"]
    msg["Subject"] = subject
    msg.set_content(body)

    with smtplib.SMTP(settings["smtp_server"], settings["smtp_port"], timeout=25) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.ehlo()
        smtp.login(settings["username"], settings["app_password"])
        smtp.send_message(msg)

    return {
        "sent_at": datetime.now().isoformat(timespec="seconds"),
        "recipient": settings["email_to"],
        "subject": subject,
        "status": "sent",
    }


def _append_event(state: dict[str, Any], event: dict[str, Any]) -> None:
    events = list(state.get("recent_email_events", []))
    events.insert(0, event)
    state["recent_email_events"] = events[:20]


def _anomaly_key_and_hash(item: dict[str, Any]) -> tuple[str, str]:
    key = f"{item.get('code', 'ANOMALY')}::{','.join(item.get('dates', []))}"
    payload = json.dumps(
        {
            "severity": item.get("severity"),
            "title": item.get("title"),
            "message": item.get("message"),
            "dates": item.get("dates", []),
        },
        sort_keys=True,
    )
    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]
    return key, digest


def process_sync_report(report: dict[str, Any], *, should_send: bool) -> dict[str, Any]:
    state = load_state()
    now_iso = datetime.now().isoformat(timespec="seconds")

    anomalies: list[dict[str, Any]] = list(report.get("anomalies", []))
    new_sunrun: list[dict[str, Any]] = list(report.get("new_sunrun_records", []))
    new_nyseg: list[dict[str, Any]] = list(report.get("new_nyseg_records", []))
    new_bills: list[str] = list(report.get("new_bill_files", []))
    current_sunrun_dates: list[str] = list(report.get("current_sunrun_dates", []))
    current_nyseg_dates: list[str] = list(report.get("current_nyseg_dates", []))
    current_bill_files: list[str] = list(report.get("current_bill_files", []))

    # Compare against state.known_* if caller did not already have a prior snapshot
    if state["initialized"]:
        prev_sr = set(state.get("known_sunrun_dates", []))
        prev_ny = set(state.get("known_nyseg_dates", []))
        prev_bills = set(state.get("known_bill_files", []))
        daily_by_date = {r["date"]: r for r in report.get("daily_rows_compact", []) if r.get("date")}
        if not new_sunrun and current_sunrun_dates:
            for d in current_sunrun_dates:
                if d not in prev_sr and d in daily_by_date:
                    new_sunrun.append(daily_by_date[d])
        if not new_nyseg and current_nyseg_dates:
            for d in current_nyseg_dates:
                if d not in prev_ny and d in daily_by_date:
                    new_nyseg.append(daily_by_date[d])
        if not new_bills and current_bill_files:
            new_bills = [f for f in current_bill_files if f not in prev_bills]

    sent_fingerprints: dict[str, str] = dict(state.get("sent_anomaly_fingerprints", {}))
    unsent_anomalies: list[dict[str, Any]] = []
    current_active_keys: dict[str, str] = {}

    for item in anomalies:
        if item.get("severity") == "info":
            continue
        k, h = _anomaly_key_and_hash(item)
        current_active_keys[k] = h
        if sent_fingerprints.get(k) != h:
            unsent_anomalies.append(item)

    results: list[dict[str, Any]] = []

    if should_send:
        # 1. Email for any new / changed anomalies or app/pipeline issues
        if unsent_anomalies:
            lines = [
                f"HeliosPulse Solar Portal detected {len(unsent_anomalies)} data/app anomaly or issue(s) at {now_iso}:",
                "",
            ]
            for idx, item in enumerate(unsent_anomalies, 1):
                sev = str(item.get("severity", "warning")).upper()
                dates_str = ", ".join(item.get("dates", []))
                lines.append(f"{idx}. [{sev}] {item.get('title', 'Anomaly')}")
                lines.append(f"   {item.get('message', '')}")
                if dates_str:
                    lines.append(f"   Affected date(s): {dates_str}")
                lines.append("")
            lines.append("Open HeliosPulse Portal to inspect details in the Alerts & Notifications panel.")
            subject = f"[HeliosPulse Alert] {len(unsent_anomalies)} Data/App Anomaly & Issue(s) Detected"
            try:
                ev = send_email(subject, "\n".join(lines))
                ev["category"] = "anomaly_alert"
                _append_event(state, ev)
                results.append(ev)
                for item in unsent_anomalies:
                    k, h = _anomaly_key_and_hash(item)
                    sent_fingerprints[k] = h
            except Exception as exc:
                ev = {
                    "sent_at": now_iso,
                    "recipient": ALERT_RECIPIENT,
                    "subject": subject,
                    "category": "anomaly_alert",
                    "status": "error",
                    "error": str(exc),
                }
                _append_event(state, ev)
                results.append(ev)

        # 2. Email when new SunRun and/or NYSEG records (or bills) are added
        if new_sunrun or new_nyseg or new_bills:
            lines = [
                f"HeliosPulse telemetry sync detected new records at {now_iso}:",
                "",
            ]
            if new_sunrun:
                lines.append(f"New SunRun Production Records ({len(new_sunrun)}):")
                for r in new_sunrun:
                    lines.append(
                        f"  - {r.get('date')}: {float(r.get('solar_kwh') or 0):.2f} kWh produced"
                        f" (EOD meter: {float(r.get('eod_meter_kwh') or 0):.1f} kWh)"
                    )
                lines.append("")
            if new_nyseg:
                lines.append(f"New NYSEG Smart-Meter Interval Records ({len(new_nyseg)}):")
                for r in new_nyseg:
                    m01 = float(r.get("m01_import_kwh") or 0)
                    m02 = float(r.get("m02_export_kwh") or 0)
                    net = m02 - m01
                    sign = "+" if net >= 0 else ""
                    lines.append(
                        f"  - {r.get('date')}: M01 Import {m01:.2f} kWh | M02 Export {m02:.2f} kWh "
                        f"| Net {sign}{net:.2f} kWh ({r.get('nyseg_hours', 24)}h)"
                    )
                lines.append("")
            if new_bills:
                lines.append(f"New NYSEG PDF Bill(s) Added ({len(new_bills)}):")
                for fname in new_bills:
                    lines.append(f"  - {fname}")
                lines.append("")

            parts = []
            if new_sunrun:
                parts.append(f"{len(new_sunrun)} SunRun")
            if new_nyseg:
                parts.append(f"{len(new_nyseg)} NYSEG")
            if new_bills:
                parts.append(f"{len(new_bills)} PDF Bill")
            subject = f"[HeliosPulse Sync] New Records Added ({', '.join(parts)})"
            try:
                ev = send_email(subject, "\n".join(lines))
                ev["category"] = "new_records"
                _append_event(state, ev)
                results.append(ev)
            except Exception as exc:
                ev = {
                    "sent_at": now_iso,
                    "recipient": ALERT_RECIPIENT,
                    "subject": subject,
                    "category": "new_records",
                    "status": "error",
                    "error": str(exc),
                }
                _append_event(state, ev)
                results.append(ev)

    # Clear fingerprints for anomalies that are resolved so if they reoccur later they alert again
    sent_fingerprints = {k: v for k, v in sent_fingerprints.items() if k in current_active_keys}

    state["initialized"] = True
    state["sent_anomaly_fingerprints"] = sent_fingerprints
    if current_sunrun_dates:
        state["known_sunrun_dates"] = sorted(set(current_sunrun_dates))
    if current_nyseg_dates:
        state["known_nyseg_dates"] = sorted(set(current_nyseg_dates))
    if current_bill_files:
        state["known_bill_files"] = sorted(set(current_bill_files))
    save_state(state)

    return {
        "recipient": ALERT_RECIPIENT,
        "should_send": should_send,
        "unsent_anomaly_count": len(unsent_anomalies),
        "new_sunrun_count": len(new_sunrun),
        "new_nyseg_count": len(new_nyseg),
        "new_bills_count": len(new_bills),
        "emails_dispatched": results,
        "recent_email_events": state["recent_email_events"][:5],
    }


def report_app_error(payload: dict[str, Any]) -> dict[str, Any]:
    state = load_state()
    now = datetime.now()
    title = str(payload.get("title") or "Application Error").strip()
    message = str(payload.get("message") or "Unknown error occurred in HeliosPulse Portal.").strip()
    source = str(payload.get("source") or "HeliosPulse Web App").strip()
    details = str(payload.get("details") or "").strip()

    key = hashlib.sha256(f"{title}::{message}".encode("utf-8")).hexdigest()[:16]
    last_sent_map = dict(state.get("sent_runtime_errors", {}))
    last_ts_str = last_sent_map.get(key)
    if last_ts_str:
        try:
            last_ts = datetime.fromisoformat(last_ts_str)
            if now - last_ts < timedelta(minutes=15):
                return {
                    "recipient": ALERT_RECIPIENT,
                    "status": "deduped",
                    "message": "Duplicate error alert suppressed within 15-minute window.",
                }
        except ValueError:
            pass

    body_lines = [
        f"HeliosPulse Portal reported an application/data issue at {now.isoformat(timespec='seconds')}:",
        "",
        f"Title: {title}",
        f"Source: {source}",
        f"Message: {message}",
    ]
    if details:
        body_lines.extend(["", "Technical Details:", details[:2000]])

    subject = f"[HeliosPulse App Issue] {title[:80]}"
    try:
        ev = send_email(subject, "\n".join(body_lines))
        ev["category"] = "app_error"
        _append_event(state, ev)
        last_sent_map[key] = now.isoformat(timespec="seconds")
        state["sent_runtime_errors"] = last_sent_map
        save_state(state)
        return ev
    except Exception as exc:
        ev = {
            "sent_at": now.isoformat(timespec="seconds"),
            "recipient": ALERT_RECIPIENT,
            "subject": subject,
            "category": "app_error",
            "status": "error",
            "error": str(exc),
        }
        _append_event(state, ev)
        save_state(state)
        return ev


def main() -> None:
    parser = argparse.ArgumentParser(description="HeliosPulse email notification dispatcher")
    parser.add_argument("--process-report", nargs="?", const="-", help="JSON report file path or '-' for stdin")
    parser.add_argument("--send", action="store_true", help="Actually dispatch emails for unsent alerts / new records")
    parser.add_argument("--report-app-error", nargs="?", const="-", help="JSON app error file path or '-' for stdin")
    parser.add_argument("--test-email", action="store_true", help="Send a test alert email to recipient")
    args = parser.parse_args()

    if args.test_email:
        ev = send_email(
            "[HeliosPulse Test] Anomaly & New-Record Email Alerts Active",
            f"HeliosPulse Portal email alerts are configured and active for {ALERT_RECIPIENT}.\n"
            f"Sent at: {datetime.now().isoformat(timespec='seconds')}",
        )
        print(json.dumps(ev))
        return

    if args.report_app_error is not None:
        raw = sys.stdin.read() if args.report_app_error == "-" else Path(args.report_app_error).read_text(encoding="utf-8")
        res = report_app_error(json.loads(raw or "{}"))
        print(json.dumps(res))
        return

    if args.process_report is not None:
        raw = sys.stdin.read() if args.process_report == "-" else Path(args.process_report).read_text(encoding="utf-8")
        res = process_sync_report(json.loads(raw or "{}"), should_send=args.send)
        print(json.dumps(res))
        return

    parser.print_help()


if __name__ == "__main__":
    main()
