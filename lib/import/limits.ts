/** Upper bounds on a single statement upload, to keep one request from exhausting memory/CPU. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // 4 MB (under Vercel's ~4.5 MB request-body cap, so the 413 stays our JSON error)
export const MAX_IMPORT_ROWS = 20_000;
