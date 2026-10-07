from pathlib import Path
import json

root = Path('extension-current')
manifest_path = root / 'manifest.json'
content_path = root / 'content.js'

manifest = json.loads(manifest_path.read_text())
if manifest.get('version') not in ('2.5.8', '2.5.9'):
    raise SystemExit(f"unexpected manifest version: {manifest.get('version')}")
manifest['version'] = '2.5.9'
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')

s = content_path.read_text()
s = s.replace("VERSION='2.5.8'", "VERSION='2.5.9'", 1)

old_presence = """let presenceFingerprint='';
 function reportPresence(force=false){
  if(!employee||!sessionToken||!ext())return;
  const state=sourceConnection!=='connected'?'unknown':breakActive?'break':call?'on_call':sourceStateKnown?'ready':'unknown';
  const payload={sourceConnection,breakStartedAt:breakStarted,callStartedAt:call?.startedAt||null,callId:call?.callId||'',phone:call?.phone||'',callType:call?.callType||'',queue:call?.queue||''};
  const fingerprint=JSON.stringify({extension:ext(),state,payload});
  if(!force&&fingerprint===presenceFingerprint)return;
  presenceFingerprint=fingerprint;activity('heartbeat',{state,payload});
 }"""

new_presence = """let presenceFingerprint='',presenceState='unknown',presenceStateSince='',presenceSequence=0,lastArabicssSnapshotFingerprint='';
 function reportPresence(force=false){
  if(!employee||!sessionToken||!ext())return;
  const state=sourceConnection!=='connected'?'unknown':breakActive?'break':call?'on_call':sourceStateKnown?'ready':'unknown';
  const now=new Date().toISOString(),previousState=presenceState||'unknown',changed=state!==presenceState;
  if(changed||!presenceStateSince){presenceState=state;presenceStateSince=now;presenceSequence+=1}
  const payload={sourceConnection,breakStartedAt:breakStarted,callStartedAt:call?.startedAt||null,callId:call?.callId||'',phone:call?.phone||'',callType:call?.callType||'',queue:call?.queue||'',presenceStateSince,presenceSequence,stateTransition:changed?{from:previousState,to:state,at:now}:null,availabilityAtThisMoment:state==='ready'};
  const fingerprint=JSON.stringify({extension:ext(),state,payload:{...payload,stateTransition:null}});
  if(!force&&!changed&&fingerprint===presenceFingerprint)return;
  presenceFingerprint=fingerprint;activity('heartbeat',{state,payload});
 }
 function captureArabicssStateEvidence(payload={}){
  const snapshot={connection:payload.connection||sourceConnection,callid:String(payload.callid||''),waitingcall:payload.waitingcall??null,onhold:payload.onhold??null,break_id:payload.break_id??null,calltype:payload.calltype??null};
  const fingerprint=JSON.stringify(snapshot);
  if(fingerprint===lastArabicssSnapshotFingerprint)return;
  lastArabicssSnapshotFingerprint=fingerprint;
  captureSourceEvidence('arabicss_state',{...payload,_snapshotChanged:true,_presenceStateBefore:evidenceState()});
 }"""

if "presenceStateSince" not in s:
    if old_presence not in s:
        raise SystemExit('presence block not found')
    s = s.replace(old_presence, new_presence, 1)

old_reset = "employee=null;sessionToken='';call=null;breakActive=false;breakStarted=null;breakAllowedSeconds=900;breakGraceSeconds=0;sourceStateKnown=false;savedFingerprint='';presenceFingerprint='';arabicssAuthenticated=false;globalThis.kpiBreakPermit=null;"
new_reset = "employee=null;sessionToken='';call=null;breakActive=false;breakStarted=null;breakAllowedSeconds=900;breakGraceSeconds=0;sourceStateKnown=false;savedFingerprint='';presenceFingerprint='';presenceState='unknown';presenceStateSince='';presenceSequence=0;lastArabicssSnapshotFingerprint='';arabicssAuthenticated=false;globalThis.kpiBreakPermit=null;"
if old_reset in s:
    s = s.replace(old_reset, new_reset, 1)
elif "presenceState='unknown'" not in s:
    raise SystemExit('reset block not found')

old_handler = "if(type==='arabicss_state'){acceptState(payload);return}"
new_handler = "if(type==='arabicss_state'){captureArabicssStateEvidence(payload);acceptState(payload);return}"
if old_handler in s:
    s = s.replace(old_handler, new_handler, 1)
elif "captureArabicssStateEvidence(payload);acceptState(payload)" not in s:
    raise SystemExit('arabicss_state handler not found')

content_path.write_text(s)

notes = root / 'PRESENCE-TIMELINE-2.5.9.md'
notes.write_text(
    '# Presence timeline — 2.5.9\n\n'
    'The connector records employee state transitions as an interval timeline. '
    'Missed-call analysis must evaluate availability at queue-entry time, then preserve every state transition until answer/abandon/end.\n\n'
    'A ready state at queue entry is availability evidence only. It is not proof that the call rang on that extension. '
    'Ring/no-answer attribution still requires source evidence naming the same extension.\n\n'
    'Arabicss state snapshots are captured only when relevant fields change (`callid`, `waitingcall`, `onhold`, `break_id`, `calltype`, connection) to avoid one-second duplicate noise.\n'
)
