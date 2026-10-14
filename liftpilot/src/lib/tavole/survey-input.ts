// What the drawing set of a machine replacement is made of: the calculation (form values) and the standards of its
// acceptance test, the machine room as surveyed, and, as for a whole design (input.ts), the data of the installation,
// the project, the company, the client's logo and the identity of the issue; the type declared with the calculation
// (round 45; none: saved before it, sheet 1 as it was).
import type { Collaudo } from '../lift/collaudo';
import type { Survey } from '../room/survey';
import type { TavoleInput } from './input';

export type SurveyTavoleInput = Omit<TavoleInput, 'layout' | 'marks'> & { survey: Survey; collaudo: Collaudo };
