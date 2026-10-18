export function readSupportingJson(path: string): Promise<{ value: any; sha256: string }>;
export function writeSupportingJson(path: string, value: unknown): Promise<{ value: any; sha256: string }>;
export function supportingOutputPath(directory: string, filename: string): Promise<string>;
