# Presence timeline — 2.5.9

The connector records employee state transitions as an interval timeline. Missed-call analysis must evaluate availability at queue-entry time, then preserve every state transition until answer/abandon/end.

A ready state at queue entry is availability evidence only. It is not proof that the call rang on that extension. Ring/no-answer attribution still requires source evidence naming the same extension.

Arabicss state snapshots are captured only when relevant fields change (`callid`, `waitingcall`, `onhold`, `break_id`, `calltype`, connection) to avoid one-second duplicate noise.
