# Firefox 2.5.33 — clock check and lighter agent page

- Collector page shows how far the Arabicss server clock is from the Marsad clock (median of recent report requests). Arabicss history times use the Arabicss clock while employee states use the Marsad clock, so a non-zero offset shifts missed-call timing against employee states. Display only; no timestamps are changed.
- Agent page: break panel and alert banner no longer rewrite identical text every second.
- Live report polling stays at 5 seconds. No permission, policy or data changes.
