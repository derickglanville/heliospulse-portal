from __future__ import annotations

import json
import sys
from datetime import date, timedelta
from pathlib import Path
from typing import Any

CODEX_ROOT = Path(r"C:\Software Developement\ChatGPT Codex\Solar Energy - SunRun")
MORE_BILLS_DIR = CODEX_ROOT / "NYSEG Bill" / "Bills" / "More Bills"

if str(CODEX_ROOT) not in sys.path:
    sys.path.insert(0, str(CODEX_ROOT))

from solar_tracker.monthly_bill import (  # noqa: E402
    _parse_nyseg_bill_pdf,
    build_bill_summary_report,
)


def _one_line_summary(rec: dict[str, Any]) -> str:
    energy = float(rec.get("total_energy_charges") or 0.0)
    delivery = float(rec.get("delivery_charges") or 0.0)
    supply = float(rec.get("supply_charges") or 0.0)
    taxes = float(rec.get("taxes") or 0.0)
    imp = float(rec.get("imported_kwh") or 0.0)
    exp = float(rec.get("exported_kwh") or 0.0)
    prior = rec.get("prior_excess_generation_kwh")
    credited = rec.get("credited_usage_kwh")
    remaining = rec.get("remaining_excess_generation_kwh")
    superseded_by = rec.get("superseded_by")

    cost_part = f"Cost: ${energy:,.2f}"
    if energy > 0 and (delivery > 0 or supply > 0):
        cost_part += f" (${delivery:,.2f} del + ${supply:,.2f} sup + ${taxes:,.2f} tax)"
    if superseded_by:
        cost_part += f" [Superseded by {superseded_by}]"

    if remaining is not None:
        prior_v = float(prior or 0.0)
        cred_v = float(credited or 0.0)
        delta = remaining - prior_v
        sign = "+" if delta >= 0 else ""
        credit_part = (
            f"Credit: {cred_v:,.0f} kWh offset from {exp:,.0f} kWh M02 export -> "
            f"{remaining:,.0f} kWh bank ({sign}{delta:,.0f} kWh)"
        )
    elif exp > 0:
        net_flow = exp - imp
        sign = "+" if net_flow >= 0 else ""
        credit_part = f"Credit: {exp:,.0f} kWh M02 export recorded ({sign}{net_flow:,.0f} kWh net vs M01; no bank line itemized)"
    else:
        rate = (energy / imp) if imp > 0 else 0.0
        credit_part = f"Credit: $0.00 (Pre-solar · {imp:,.0f} kWh @ ${rate:.3f}/kWh)"

    return f"{cost_part}  |  {credit_part}"


def load_more_bills(bills_dir: Path = MORE_BILLS_DIR) -> dict[str, Any]:
    raw_records: list[dict[str, Any]] = []
    seen_signatures: set[tuple[Any, ...]] = set()

    if bills_dir.exists():
        for pdf_path in sorted(bills_dir.glob("*.pdf")):
            parsed = _parse_nyseg_bill_pdf(pdf_path)
            if not parsed:
                continue
            sig = (
                parsed.get("statement_date"),
                parsed.get("billing_start_date"),
                parsed.get("billing_end_date"),
                round(float(parsed.get("imported_kwh") or 0.0), 2),
                round(float(parsed.get("exported_kwh") or 0.0), 2),
                round(float(parsed.get("total_energy_charges") or 0.0), 2),
            )
            if sig in seen_signatures:
                continue
            seen_signatures.add(sig)
            parsed["file_name"] = pdf_path.name
            parsed["file_modified_at"] = pdf_path.stat().st_mtime
            raw_records.append(parsed)

    # Determine authoritative record per (billing_start_date, billing_end_date)
    latest_stmt_by_period: dict[tuple[str, str], str] = {}
    for r in raw_records:
        key = (str(r.get("billing_start_date")), str(r.get("billing_end_date")))
        stmt = str(r.get("statement_date") or "")
        if key not in latest_stmt_by_period or stmt > latest_stmt_by_period[key]:
            latest_stmt_by_period[key] = stmt

    for r in raw_records:
        key = (str(r.get("billing_start_date")), str(r.get("billing_end_date")))
        latest_stmt = latest_stmt_by_period[key]
        is_auth = str(r.get("statement_date") or "") == latest_stmt
        r["is_authoritative"] = is_auth
        r["superseded_by"] = None if is_auth else latest_stmt
        r["net_grid_kwh"] = round(float(r.get("exported_kwh") or 0.0) - float(r.get("imported_kwh") or 0.0), 1)
        r["one_line_summary"] = _one_line_summary(r)

    # Sort newest billing period first, then newest statement date
    bills_desc = sorted(
        raw_records,
        key=lambda r: (str(r.get("billing_end_date") or ""), str(r.get("statement_date") or "")),
        reverse=True,
    )

    # Credit Bank history (chronological across authoritative bills that itemize remaining_excess_generation_kwh)
    authoritative_asc = sorted(
        [r for r in raw_records if r["is_authoritative"]],
        key=lambda r: (str(r.get("billing_end_date") or ""), str(r.get("statement_date") or "")),
    )

    credit_bank_history: list[dict[str, Any]] = []
    for r in authoritative_asc:
        rem = r.get("remaining_excess_generation_kwh")
        if rem is None:
            continue
        prior = float(r.get("prior_excess_generation_kwh") or 0.0)
        exp = float(r.get("exported_kwh") or 0.0)
        used = float(r.get("credited_usage_kwh") or 0.0)
        rem_f = float(rem)
        credit_bank_history.append({
            "statement_date": r.get("statement_date"),
            "billing_start_date": r.get("billing_start_date"),
            "billing_end_date": r.get("billing_end_date"),
            "period_label": f"{r.get('billing_start_date')} to {r.get('billing_end_date')}",
            "prior_kwh": prior,
            "exported_kwh": exp,
            "credited_used_kwh": used,
            "remaining_kwh": rem_f,
            "net_change_kwh": round(rem_f - prior, 1),
            "estimated_value": round(rem_f * 0.24, 2),
        })

    # Project next bill using monthly_bill.py forecast & actual unbilled intervals
    report = build_bill_summary_report()
    forecast = report.get("credit_bank_forecast") or {}

    latest_auth = authoritative_asc[-1] if authoritative_asc else None
    next_bill_projection = None
    if latest_auth and forecast.get("available"):
        last_end = date.fromisoformat(str(latest_auth["billing_end_date"]))
        next_start = last_end + timedelta(days=1)
        next_end = next_start + timedelta(days=29)
        total_days = (next_end - next_start).days + 1

        unbilled_m01 = float(forecast.get("unbilled_m01_kwh") or 0.0)
        unbilled_m02 = float(forecast.get("unbilled_m02_kwh") or 0.0)
        interval_end = date.fromisoformat(str(forecast.get("interval_file_end") or next_start.isoformat()))
        measured_days = max(0, (interval_end - next_start).days + 1)
        remaining_days = max(0, total_days - measured_days)

        # Use December/November blended forecast daily averages from forecast rows
        dec_row = (forecast.get("rows") or [{}])[0]
        daily_m01_proj = float(dec_row.get("predicted_m01_kwh") or 698.8) / 31.0
        daily_m02_proj = float(dec_row.get("predicted_m02_kwh") or 159.3) / 31.0

        proj_m01_total = round(unbilled_m01 + remaining_days * daily_m01_proj, 1)
        proj_m02_total = round(unbilled_m02 + remaining_days * daily_m02_proj, 1)
        proj_net_import = round(proj_m01_total - proj_m02_total, 1)

        current_bank = float(
            latest_auth.get("remaining_excess_generation_kwh")
            or forecast.get("official_credit_kwh")
            or 2210.0
        )
        # Net-metering balance: credits applied = max(0, proj_m01_total - proj_m02_total) capped by current_bank
        if proj_net_import >= 0:
            credits_applied = min(current_bank, proj_net_import)
            bank_after = round(max(0.0, current_bank - proj_net_import), 1)
        else:
            credits_applied = 0.0
            bank_after = round(current_bank + abs(proj_net_import), 1)

        bank_delta = round(bank_after - current_bank, 1)
        min_charge_floor = float(
            (forecast.get("billing_estimate_basis") or {}).get("minimum_monthly_amount_due") or 43.57
        )
        chargeable_kwh = max(0.0, proj_net_import - credits_applied)
        projected_energy_charge = round(min_charge_floor + chargeable_kwh * 0.24, 2)

        next_bill_projection = {
            "billing_start_date": next_start.isoformat(),
            "billing_end_date": next_end.isoformat(),
            "days_in_period": total_days,
            "measured_through_date": interval_end.isoformat(),
            "measured_days": measured_days,
            "remaining_forecast_days": remaining_days,
            "measured_m01_kwh": round(unbilled_m01, 1),
            "measured_m02_kwh": round(unbilled_m02, 1),
            "projected_m01_kwh": proj_m01_total,
            "projected_m02_kwh": proj_m02_total,
            "projected_net_import_kwh": proj_net_import,
            "projected_energy_charge": projected_energy_charge,
            "minimum_charge_floor": min_charge_floor,
            "chargeable_kwh": round(chargeable_kwh, 1),
            "credit_bank_before_kwh": round(current_bank, 1),
            "credit_bank_after_kwh": bank_after,
            "credit_bank_delta_kwh": bank_delta,
            "summary": (
                f"Projected bill ({next_start.isoformat()} to {next_end.isoformat()}): "
                f"${projected_energy_charge:,.2f} energy charge • "
                f"Bank shifts {current_bank:,.0f} -> {bank_after:,.0f} kWh ({bank_delta:+,.1f} kWh)"
            ),
        }

    return {
        "source_folder": str(bills_dir),
        "scanned_at": date.today().isoformat(),
        "total_pdf_files": len(list(bills_dir.glob("*.pdf"))) if bills_dir.exists() else 0,
        "unique_bill_count": len(bills_desc),
        "authoritative_count": len(authoritative_asc),
        "bills": bills_desc,
        "credit_bank_history": credit_bank_history,
        "current_credit_bank_kwh": credit_bank_history[-1]["remaining_kwh"] if credit_bank_history else 0.0,
        "next_bill_projection": next_bill_projection,
        "historical_usage_analysis": _build_historical_usage_analysis_rows(authoritative_asc),
    }


HISTORICAL_USAGE_ANALYSIS_BASELINE: tuple[dict[str, Any], ...] = (
    {"month_label": "November 2025", "billing_start_date": "2025-10-07", "billing_end_date": "2025-11-04", "usage_kwh": 523.0, "charges": 146.96},
    {"month_label": "December 2025", "billing_start_date": "2025-11-05", "billing_end_date": "2025-12-05", "usage_kwh": 2296.0, "charges": 506.01},
    {"month_label": "January 2026", "billing_start_date": "2025-12-06", "billing_end_date": "2026-01-06", "usage_kwh": 1955.0, "charges": 518.76},
    {"month_label": "February 2026", "billing_start_date": "2026-01-07", "billing_end_date": "2026-02-04", "usage_kwh": 1419.0, "charges": 416.73},
    {"month_label": "March 2026", "billing_start_date": "2026-02-05", "billing_end_date": "2026-03-03", "usage_kwh": 3160.0, "charges": 852.35},
    {"month_label": "April 2026", "billing_start_date": "2026-03-04", "billing_end_date": "2026-04-06", "usage_kwh": 3485.0, "charges": 964.08},
    {"month_label": "May 2026", "billing_start_date": "2026-04-07", "billing_end_date": "2026-05-05", "usage_kwh": 1473.0, "charges": 424.25},
    {"month_label": "June 2026", "billing_start_date": "2026-05-06", "billing_end_date": "2026-06-04", "usage_kwh": 1913.0, "charges": 512.25},
    {"month_label": "July 2026", "billing_start_date": "2026-06-05", "billing_end_date": "2026-07-15", "usage_kwh": 537.0, "charges": 162.30, "combined_period": True},
    {"month_label": "August 2026", "billing_start_date": "2026-07-16", "billing_end_date": "2026-08-05", "usage_kwh": 391.0, "charges": 30.49, "imported": True},
    {"month_label": "September 2026", "billing_start_date": "2026-08-06", "billing_end_date": "2026-09-03", "usage_kwh": 518.0, "charges": 43.57, "imported": True},
    {"month_label": "October 2026", "billing_start_date": "2026-09-04", "billing_end_date": "2026-10-06", "usage_kwh": 495.0, "charges": 43.57, "imported": True},
)


def _build_historical_usage_analysis_rows(authoritative_records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = [dict(row) for row in HISTORICAL_USAGE_ANALYSIS_BASELINE]
    latest_baseline_end = max(row["billing_end_date"] for row in rows)
    seen_periods = {
        (row["billing_start_date"], row["billing_end_date"]): idx
        for idx, row in enumerate(rows)
        if not row.get("combined_period")
    }

    for record in authoritative_records:
        start = str(record.get("billing_start_date") or "")
        end = str(record.get("billing_end_date") or "")
        if not start or not end:
            continue
        key = (start, end)
        if key not in seen_periods and end <= latest_baseline_end:
            continue
        usage = float(record.get("imported_kwh") or 0.0)
        charges = float(record.get("total_energy_charges") or 0.0)
        if usage <= 0 or charges < 0:
            continue
        row = {
            "month_label": date.fromisoformat(end).strftime("%B %Y"),
            "billing_start_date": start,
            "billing_end_date": end,
            "usage_kwh": usage,
            "charges": charges,
            "imported": bool(record.get("exported_kwh") or record.get("remaining_excess_generation_kwh") is not None),
            "source_name": str(record.get("file_name") or "NYSEG statement"),
        }
        key = (start, end)
        if key in seen_periods:
            rows[seen_periods[key]] = row
        else:
            seen_periods[key] = len(rows)
            rows.append(row)

    rows.sort(key=lambda r: r["billing_end_date"], reverse=True)
    for row in rows:
        row["usage_display"] = f"{row['usage_kwh']:,.0f} kWh" + (" imported" if row.get("imported") else "")
        prefix = "Combined statements" if row.get("combined_period") else "Billing period"
        row["billing_period_display"] = f"{prefix}: {row['billing_start_date']} to {row['billing_end_date']}"
    return rows


if __name__ == "__main__":
    result = load_more_bills()
    print(json.dumps(result, indent=2))
