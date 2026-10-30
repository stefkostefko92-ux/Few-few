// The texts of the «?» of the RT after the owner's model (round 52): the first page's, the signatures', the components'
// (one file per group of components, messages/aiuto/rt*.json), by «<component>.<field>» or by the field's path. Pure.
import RT from '../../../messages/aiuto/rt.json';
import AMM from '../../../messages/aiuto/rt-amm.json';
import CQPL from '../../../messages/aiuto/rt-cqpl.json';
import GUIDE from '../../../messages/aiuto/rt-guide.json';
import { testoAiuto, type TestiAiuto } from '@/lib/aiuto';

const TESTI: TestiAiuto = { ...RT, ...CQPL, ...GUIDE, ...AMM };
export const aiutoRt2 = (chiave: string): string | null => testoAiuto(TESTI, chiave);
