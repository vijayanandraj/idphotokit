// Types for scripts/specs.mjs, so vite.config.ts can import it under strict TypeScript.
export declare const BACKGROUND_COLOURS: Record<string, string>;
export declare const REGIONS: string[];
export declare function parseSpecs(text: string, fileName?: string): Record<string, unknown>[];
