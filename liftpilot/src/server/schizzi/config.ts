import 'server-only';
// Whether the reading of the survey sketches is on (round 50): Claude through Google Cloud Vertex AI in the EU, only
// with a Google Cloud project (VERTEX_PROJECT_ID), an EU region (VERTEX_REGION, `eu` by default; env-schema.ts refuses
// any other) and the service account's key file (VERTEX_CREDENTIALS_FILE, in the directory mounted read-only into the
// container: a regular file readable by its owner only, mode 600). Anything missing or wrong turns it off — fail
// closed: the panel shows the sketch beside the form and the measures are typed by hand. Checked at each use (a key
// put in place or taken away needs no restart); the reason it is off is logged once per change, never the path or
// the key's content.
import { statSync } from 'node:fs';
import { env } from '@/lib/env';
import { log } from '@/lib/log';

export interface SketchConfig { projectId: string; region: string; credentialsFile: string; model: string }
export type SketchOff = 'unset' | 'noCredentials' | 'notAFile' | 'openMode';
export type SketchState = { on: true; config: SketchConfig } | { on: false; reason: SketchOff };

let logged: string | null = null;
function note(state: SketchState): SketchState {
  const key = state.on ? 'on' : state.reason;
  if (key !== logged) {
    logged = key;
    // 'unset' is the normal state of a server without the feature: said once at info level
    if (state.on) log.info({ region: state.config.region, model: state.config.model }, 'sketch reading on');
    else if (state.reason === 'unset') log.info('sketch reading off: not configured');
    else log.warn({ reason: state.reason }, 'sketch reading off: the service account key is missing or open to others');
  }
  return state;
}

/** The feature's state now. */
export function sketchState(): SketchState {
  const e = env();
  if (!e.VERTEX_PROJECT_ID) return note({ on: false, reason: 'unset' });
  if (!e.VERTEX_CREDENTIALS_FILE) return note({ on: false, reason: 'noCredentials' });
  let st;
  try {
    st = statSync(e.VERTEX_CREDENTIALS_FILE);
  } catch {
    return note({ on: false, reason: 'noCredentials' });
  }
  if (!st.isFile() || st.size === 0 || st.size > 64 * 1024) return note({ on: false, reason: 'notAFile' });
  if ((st.mode & 0o077) !== 0) return note({ on: false, reason: 'openMode' });
  return note({ on: true, config: { projectId: e.VERTEX_PROJECT_ID, region: e.VERTEX_REGION, credentialsFile: e.VERTEX_CREDENTIALS_FILE, model: e.SKETCH_MODEL } });
}

/** Whether the pages offer «Leggi lo schizzo» (and /data names the sub-processor). */
export const aiEnabled = (): boolean => sketchState().on;
