import 'server-only';
// The name of an RT's PDF. Kept apart from pdf.ts: the slug lives with the download helpers (session, rights), which
// the pdf:keep script (scripts/keep-rt-pdfs.ts, react-server condition outside Next) must not load.
import { slug } from '../download';
import { projectName } from './pdf';
import type { RtRow } from './queries';

/** The file's name: «RT-26-004-R1-<installation>.pdf». */
export const rtFileName = (r: Pick<RtRow, 'number' | 'revision' | 'projectData'>): string =>
  `RT-${r.number}-R${r.revision}-${slug(projectName(r.projectData))}.pdf`;
