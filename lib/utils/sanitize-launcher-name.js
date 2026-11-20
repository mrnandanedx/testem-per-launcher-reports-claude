

// Makes a launcher name safe to use as (part of) a file name.
// Each of / \ : * ? " < > | ( ) becomes one underscore, every run of
// whitespace becomes one underscore, and null/undefined becomes "unknown".
//
//   'IE 11'             -> 'IE_11'
//   'Firefox (nightly)' -> 'Firefox__nightly_'
module.exports = function sanitizeLauncherName(name) {
  if (name === null || name === undefined) {
    return 'unknown';
  }

  return String(name)
    .replace(/\s+/g, '_')
    .replace(/[/\\:*?"<>|()]/g, '_');
};
