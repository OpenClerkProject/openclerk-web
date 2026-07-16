// CSS class names main.ts uses to mark up the document surface (hyperlinks, embedded citation
// notes). Kept in their own module -- rather than defined in main.ts -- so exportDocument.ts can
// recognize the same markers when serializing the document without importing from main.ts and
// creating a circular dependency (main.ts also imports from exportDocument.ts to wire the
// download buttons).
export const CASE_HYPERLINK_CLASS = "oc-case-hyperlink";
export const PARENTHETICAL_HYPERLINK_CLASS = "oc-parenthetical-hyperlink";
export const MANUAL_HYPERLINK_CLASS = "oc-manual-hyperlink";
export const EMBED_NOTE_CLASS = "oc-embed-note";
export const EMBED_EXCERPT_CLASS = "oc-embed-excerpt";
