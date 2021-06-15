/** Sleep function
 * @example
 * // sleeps 3 seconds
 * await sleep(3000);
 */
export const sleep = (msec: number) =>
  new Promise((resolve) => setTimeout(resolve, msec));
