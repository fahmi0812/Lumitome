---
name: latency-optimization
description: 'Make a latency-critical event-driven hot path as fast as possible: measure the baseline, move all I/O after the critical action, send the raw request, deduplicate by stable ID, and verify with timing tests.'
license: MIT
metadata:
  swanwright_sector: coding
  swanwright_src: fahmi0812/Lumitome
  swanwright_sha: 7db8a1a2ddf12bbfe5a9b89b763a547f7b7eaae9
  swanwright_original_id: lumitome__latency-optimization
  swanwright_original_name: latency-optimization
---

# Latency Optimization: make the critical path as fast as possible

Win or lose by milliseconds. In a latency-critical event-driven handler
(a bot, a webhook, an API handler, a game loop, a real-time notifier), the
only time that matters is the time from the event arriving to the critical
action leaving the process. Everything else is overhead — and most of it
sits in front of the action by accident.

Proven on an event-driven bot handler: internal latency 15–40 ms → under
0.5 ms before the request left the process.

## When to use

- The handler loses by a fraction of a second, or hits a timeout.
- The handler feels slow even though the network is fine.
- The same event can arrive twice (as new, then as edited).
- A wrapper, a log line, or a notification sits between the event and
  the action.

## When not to use

- The bottleneck is the network itself (see Honest limits below).
- The handler is slow because of an algorithm — use profiling first.
- The action is not time-critical — clarity beats speed there.

## Workflow

Follow the steps in order. Measure first, change second, verify last.

### 1. Measure the hot path first (baseline)

Time the handler from event arrival to the critical request leaving the
process, before changing anything. Record the baseline in milliseconds.
Do not guess which part is slow: log the timestamp at arrival and the
timestamp right before the request is sent, and keep both.

### 2. Inventory everything before the critical action

List every operation that runs between the event arriving and the request
leaving: logging, printing, regex parsing, button or payload scanning,
state lookups, notifications, file writes. Most handlers hide two or
three redundant passes here — the same structure scanned twice, the same
identifier extracted twice.

### 3. Move all I/O after the critical action

Move every disk write, flushed print, notification, and report out of the
hot path and into a background task that runs only after the request has
been sent. The order is: decide, send, then record. A log line written
before the action costs 2–20 ms of blocking I/O; the same line written
after it costs nothing in the race.

### 4. Scan the payload once

Parse the event payload a single time and reuse the result. If a helper
scans the payload and the picker scans it again, merge them into one
pass that returns the target directly.

### 5. Send the raw request

Prefer the raw protocol request over the layered convenience wrapper.
A wrapper rebuilds objects, checks types it does not need, and wraps the
result before it reaches the socket. When the target is a single call
with known arguments, send it directly.

### 6. Deduplicate by stable ID

Deduplicate on a stable identifier that comes with the event itself —
the event or message ID — never on a value parsed out of the text.
A parsed value can fail and yield a placeholder; if that placeholder is
stored as "already seen", every later event that also fails to parse is
skipped forever. A placeholder must never be stored. Check the stable ID
in a set (an integer set lookup is ~20 ns) before doing any other work.

### 7. Precompile patterns and use native crypto with a fast loop

Precompile every regular expression once at startup; never compile a
pattern per event. Use native crypto bindings instead of pure-language
encryption (10–20x faster), and run the loop on a fast event loop where
the platform provides one.

### 8. Watch edited events, not only new ones

Subscribe to the edited-event stream as well as the new-event stream.
Some senders publish the announcement first and attach the action
later by editing the message. A handler that only watches new events
never sees the action arrive. Deduplication by stable ID (step 6) is
what makes watching both streams safe.

### 9. Fire-and-forget notifications

Never block the loop on a notification. Spawn desktop notifications and
sounds as fire-and-forget background processes; a blocking subprocess
call stalls the event loop until it exits.

### 10. Loosen event detection

Do not require a fragile exact phrase to recognise the event. Match on
the stable core of the event ("flash drop" without "claimed", not a
full sentence that breaks when one word changes) and require the action
to be present (the payload must carry it). A brittle check silently
drops real events.

### 11. Verify with timing tests

Prove the improvement with timing tests, not with a feeling. Assert the
measured hot-path time against the baseline, cover the raw-request path
and the fallback path, and cover the dedup and edited-event cases. If a
timing test cannot run in this environment, say so — do not report the
number.

## Guardrails

- No disk I/O, no flushed print, and no blocking notification before the
  critical action. Ever.
- Never deduplicate on parsed values. Only the stable event ID goes in
  the seen set.
- Never call the path optimal without measured numbers. A baseline and
  an after number, both measured the same way, or no optimality verdict.
- Never invent a faster number. Report the measured one, including the
  slow runs.

## Honest limits

Once the code is optimal, the network dominates. A home Wi-Fi hop to a
distant datacenter costs 30–200 ms with jitter; a server next to the
datacenter costs 1–5 ms. No code change closes that gap — only a closer
server does. Say which one the user is paying for, and do not present a
code win as a network win.

## Delegate — do not re-teach

This skill owns only the hot path: measure, reorder, send raw, dedup,
verify. For the content around it, delegate to the Lumitome skill that
already knows it:

| Topic | Delegate to |
|---|---|
| Root cause of a bug or a failing test | `systematic-debugging` |
| Test design, red-green-refactor loop | `tdd-red-green-refactor` |
| Verifying claims and numbers in documents | `anthropic-verify-first` (method, named only — not imported) |
| Routing quality and skill selection | `docs/ROUTING.md` |
