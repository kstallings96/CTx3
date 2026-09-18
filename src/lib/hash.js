/* FNV-1a. Not cryptographic and not meant to be — it exists so the same
   inputs always pick the same answer, question frame and puzzle, which is
   what "every student meets the identical partner" rests on. */
export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < String(str).length; i++) { h ^= String(str).charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
