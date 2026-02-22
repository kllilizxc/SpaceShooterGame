const DEV = !!((import.meta as any).env?.DEV);
const warnedOnce = new Set<string>();

export function devWarnOnce(key: string, message: string) {
    if (!DEV) return;
    if (warnedOnce.has(key)) return;
    warnedOnce.add(key);
    // eslint-disable-next-line no-console
    console.warn(message);
}

export { DEV };

