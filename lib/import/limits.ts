/** Upper bounds on a single statement upload, to keep one request from exhausting memory/CPU. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_IMPORT_ROWS = 20_000;
