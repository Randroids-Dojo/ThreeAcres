// Builds the sound bank off the main thread and hands each buffer's channels
// back as transferable arrays, in the order they are wanted.
import { JOBS, runJob } from './recipes';

const post = (self as unknown as { postMessage(m: unknown, o?: { transfer: Transferable[] }): void }).postMessage.bind(self);

JOBS.forEach((j, i) => {
  const { chans, f0 } = runJob(j);
  post({ i, chans, f0 }, { transfer: chans.map((c) => c.buffer) });
});
post({ done: true });
