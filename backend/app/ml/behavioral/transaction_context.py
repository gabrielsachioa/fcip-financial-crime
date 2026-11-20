"""Optional, versioned transaction observations; never assertions of criminal intent.

Windows include the current row and strictly earlier exact-time observations.
Equal timestamps never acquire an order from identifiers. Available day-only
history that might overlap a window makes that window unknown. Counterparty
counts describe supplied identifiers, not ownership, banks or a money trail.
"""

from __future__ import annotations

from collections import Counter, deque

import numpy as np
import pandas as pd

VERSION = "transaction_context_v1"
VOCABULARY_KEY = "transaction_context_version"
SECOND = 1_000_000_000
HOUR = 3600 * SECOND
DEFINITIONS = {
    "COUNT_R5M": "Observed transactions in the previous five source-clock minutes plus this row; equal-time peers excluded.",
    "VALUE_R1H": "Observed amount in the previous source-clock hour plus this row, in unchanged source currency.",
    "KNOWN_CHANNELS_R24H": "Distinct supplied channels in the preceding 24 hours plus this row; UNKNOWN is not a known channel.",
    "CREDIT_VALUE_R4H": "Observed incoming amount in the previous four hours plus this row if incoming; not traced source funds.",
    "DEBIT_VALUE_R4H": "Observed outgoing amount in the previous four hours plus this row if outgoing; not traced onward funds.",
    "OUT_IN_VALUE_RATIO_R4H": "Observed outgoing/incoming amount over four hours including this row; unknown without positive incoming value; not proof of pass-through.",
    "SECONDS_SINCE_PRIOR_CREDIT": "Time since the latest strictly earlier exact-time incoming observation; not a matched-funds dwell time.",
    "KNOWN_COUNTERPARTIES_R24H": "Distinct supplied counterparty IDs over the preceding 24 hours plus this row; a lower bound when IDs are missing.",
    "COUNTERPARTY_COVERAGE_R24H": "Fraction of observed rows in that 24-hour window, including this row, with a supplied counterparty ID.",
    "OBSERVED_SAME_COUNTERPARTY_COUNT_R1H": "Strictly earlier observed rows with this counterparty ID in the previous hour; no direction or ownership inferred.",
    "AMOUNT_OVER_PRIOR_COUNTERPARTY_MIN_R1H": "This amount divided by the smallest strictly earlier observed amount with this counterparty in the previous hour; not proof of a probe.",
}
FEATURES = tuple(DEFINITIONS)


def enabled(vocabulary: dict, unit: str) -> bool:
    version = vocabulary.get(VOCABULARY_KEY)
    if version is None:
        return False
    if version != VERSION or unit != "FRAUD":
        raise ValueError("Unsupported transaction context feature version or unit")
    return True


def build(prepared: pd.DataFrame) -> pd.DataFrame:
    """Build from the base feature library's validated, single-currency rows."""
    out = pd.DataFrame(np.nan, index=prepared.index, columns=FEATURES)
    for _, account in prepared.groupby("account_number", sort=False):
        exact = account[account.timestamp_precision.ne("day")].sort_values("_time", kind="stable")
        if exact.empty:
            continue
        times = exact._time.to_numpy(dtype=np.int64)
        ids = exact.index.to_numpy()
        amounts = exact.amount.to_numpy(dtype=float)
        debit = exact.direction.eq("DEBIT").to_numpy()
        hi = np.searchsorted(times, times, side="left")
        day_available = np.sort(account.loc[account.timestamp_precision.eq("day"), "_available"].to_numpy())

        def clean(window):
            return (np.searchsorted(day_available, times, side="left")
                    == np.searchsorted(day_available, times - window, side="left"))

        def total(values, window):
            prefix = np.r_[0., np.cumsum(values)]
            lo = np.searchsorted(times, times - window, side="left")
            return prefix[hi] - prefix[lo] + values

        valid5, valid1, valid4, valid24 = (clean(w) for w in (300 * SECOND, HOUR, 4 * HOUR, 24 * HOUR))
        count5 = hi - np.searchsorted(times, times - 300 * SECOND, side="left") + 1
        incoming = total(np.where(debit, 0., amounts), 4 * HOUR)
        outgoing = total(np.where(debit, amounts, 0.), 4 * HOUR)
        ratio = np.divide(outgoing, incoming, out=np.full(len(times), np.nan), where=incoming > 0)
        for name, values, valid in (
            ("COUNT_R5M", count5, valid5), ("VALUE_R1H", total(amounts, HOUR), valid1),
            ("CREDIT_VALUE_R4H", incoming, valid4), ("DEBIT_VALUE_R4H", outgoing, valid4),
            ("OUT_IN_VALUE_RATIO_R4H", ratio, valid4),
        ):
            out.loc[ids, name] = np.where(valid, values, np.nan)

        credit_times = times[~debit]
        prior = np.searchsorted(credit_times, times, side="left") - 1
        for i in np.flatnonzero(prior >= 0):
            previous = credit_times[prior[i]]
            # A later available date-only credit/debit could hide a newer credit.
            if np.searchsorted(day_available, times[i]) == np.searchsorted(day_available, previous):
                out.loc[ids[i], "SECONDS_SINCE_PRIOR_CREDIT"] = (int(times[i]) - int(previous)) / SECOND

        counterparties = (exact.counterparty_ref.fillna("").astype(str).str.strip().to_numpy()
                          if "counterparty_ref" in exact else np.full(len(exact), ""))
        channels = exact.channel.fillna("").astype(str).str.strip().to_numpy()
        channels = np.where(np.isin(channels, ["", "UNKNOWN"]), "", channels)
        cp_counts, channel_counts = Counter(), Counter()
        left = right = known = 0
        lo24 = np.searchsorted(times, times - 24 * HOUR, side="left")
        for i in range(len(times)):
            while right < hi[i]:
                cp, channel = counterparties[right], channels[right]
                if cp:
                    cp_counts[cp] += 1
                    known += 1
                if channel:
                    channel_counts[channel] += 1
                right += 1
            while left < lo24[i]:
                cp, channel = counterparties[left], channels[left]
                if cp:
                    cp_counts[cp] -= 1
                    known -= 1
                    if not cp_counts[cp]:
                        del cp_counts[cp]
                if channel:
                    channel_counts[channel] -= 1
                    if not channel_counts[channel]:
                        del channel_counts[channel]
                left += 1
            if not valid24[i]:
                continue
            cp, channel = counterparties[i], channels[i]
            known_now = known + bool(cp)
            out.loc[ids[i], "COUNTERPARTY_COVERAGE_R24H"] = known_now / (hi[i] - lo24[i] + 1)
            if known_now:
                out.loc[ids[i], "KNOWN_COUNTERPARTIES_R24H"] = len(cp_counts) + bool(cp and cp not in cp_counts)
            distinct_channels = len(channel_counts) + bool(channel and channel not in channel_counts)
            if distinct_channels:
                out.loc[ids[i], "KNOWN_CHANNELS_R24H"] = distinct_channels

        # Monotone minimum queues: linear work per account/counterparty, not
        # repeatedly scanning a potentially large burst for every transaction.
        pairs = pd.DataFrame({"position": np.arange(len(times)), "counterparty": counterparties})
        for cp, group in pairs.groupby("counterparty", sort=False):
            if not cp:
                continue
            positions = group.position.to_numpy()
            pair_times, pair_amounts = times[positions], amounts[positions]
            pair_hi = np.searchsorted(pair_times, pair_times, side="left")
            pair_lo = np.searchsorted(pair_times, pair_times - HOUR, side="left")
            minimum, added = deque(), 0
            for j, position in enumerate(positions):
                while added < pair_hi[j]:
                    while minimum and pair_amounts[minimum[-1]] >= pair_amounts[added]:
                        minimum.pop()
                    minimum.append(added)
                    added += 1
                while minimum and minimum[0] < pair_lo[j]:
                    minimum.popleft()
                if valid1[position]:
                    out.loc[ids[position], "OBSERVED_SAME_COUNTERPARTY_COUNT_R1H"] = pair_hi[j] - pair_lo[j]
                    if minimum:
                        out.loc[ids[position], "AMOUNT_OVER_PRIOR_COUNTERPARTY_MIN_R1H"] = amounts[position] / pair_amounts[minimum[0]]
    return out
