/* First-play tips (public/rc-coach.js, shared with the plain-HTML games): shown once per game on this device. */
export type CoachStep = { title?: string; text: string; target?: string; pad?: number };
type CoachFn = ((key: string, steps: CoachStep[]) => Promise<boolean>) & { active?: boolean };
const fn = (): CoachFn | undefined => (window as unknown as { rcCoach?: CoachFn }).rcCoach;
export const coach = (key: string, steps: CoachStep[]) => fn()?.(key, steps) ?? Promise.resolve(false);
export const coachActive = () => !!fn()?.active;
