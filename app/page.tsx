import { readFile } from 'node:fs/promises';
import Radar from './radar';
import type { Snapshot } from '../lib/types';
export default async function Page() {
  const data:Snapshot=JSON.parse(await readFile('data/state.json','utf8'));
  return <Radar initial={data}/>;
}
