import { setTimeout as delay } from 'node:timers/promises';

export async function fetchPublic(url, signal) {
  for (let attempt = 0; attempt < 3; attempt++) {
    signal?.throwIfAborted();
    try {
      const response = await fetch(url, {signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000)});
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        await response.body?.cancel();
        await delay(400 * 2 ** attempt, undefined, {signal}); continue;
      }
      return response;
    } catch (error) {
      if (signal?.aborted || attempt === 2) throw error;
      await delay(400 * 2 ** attempt, undefined, {signal});
    }
  }
}
