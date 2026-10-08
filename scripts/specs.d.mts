// Types for scripts/specs.mjs, so vite.config.ts can import it under strict TypeScript.
export declare const BACKGROUND_COLOURS: Record<string, string>;
export declare const REGIONS: string[];
export declare const CATEGORIES: string[];
export declare const SINGLE_VALUE_TOLERANCE: number;
export declare function slugify(s: string): string;
export declare function parseSpecs(
  documentsText: string,
  countriesText: string,
  files?: { documents?: string; countries?: string }
): { countries: Record<string, unknown>[]; documents: Record<string, unknown>[] };
export declare function specsModule(documentsText: string, countriesText: string): string;
