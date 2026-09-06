'use strict';
/* The book sometimes breaks a long line across a page turn and prints a "+n"
   mark where it breaks, telling the singer how many lines carry over. That is
   a fact about the printed page, not about the text, and the corrected .docx
   carries the mark through with it. The app has no page turns, so the mark is
   stripped on import.

   The importer and the checker both use this, so the two can never disagree
   about what "identical to the document" is taken to mean.                  */

/** A page-continuation mark: "+" and a digit or two at the very end of a line. */
const CONTINUATION = /\s*\+\d{1,2}\s*$/;

/** The line as the app should hold it, with any continuation mark removed. */
function stripContinuation(line) {
  return line.replace(CONTINUATION, '');
}

module.exports = { CONTINUATION, stripContinuation };
