# Firefox 2.5.32 — reduce Arabicss server load

- Direct live report polling (get_inbound_calls_real_time.php) goes back from every 1 second to every 5 seconds. Since 2.5.31 the Arabicss agent console became slow during call flow and recovered when the extension was disabled.
- Employee agent-console events (SSE) are unchanged and still reach the dashboard as they happen.
- No other behavior, permission or data changes.
