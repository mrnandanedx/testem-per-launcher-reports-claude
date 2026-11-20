

const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');
const PassThrough = require('stream').PassThrough;
const Bluebird = require('bluebird');

const LAUNCHER_TEMPLATE = '{launcher}';
const DATE_TEMPLATE = '{date}';
const TIMESTAMP_TEMPLATE = '{timestamp}';

function pad(value) {
  return String(value).padStart(2, '0');
}

// YYYY-MM-DD in local time
function formatDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// YYYY-MM-DD-HH-mm-ss in local time
function formatTimestamp(date) {
  return `${formatDate(date)}-${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

// Launcher names such as "Headless Chrome" or "Chrome 120.0" can contain
// characters that are awkward or invalid in file names.
function sanitizeLauncher(launcher) {
  return String(launcher).replace(/[^A-Za-z0-9._-]+/g, '_');
}

function hasTemplate(filePath, template) {
  return typeof filePath === 'string' && filePath.indexOf(template) !== -1;
}

module.exports = class ReportFile {
  constructor(reportFile, options) {
    this.file = ReportFile.expandPath(reportFile, options);

    this.outputStream = new PassThrough();

    mkdirp.sync(path.dirname(path.resolve(this.file)));

    this.outputStream = fs.createWriteStream(this.file, { flags: 'w+' });

    let alreadyEnded = false;
    function finish(data) {
      if (!alreadyEnded) {
        alreadyEnded = true;
        this.outputStream.end(data);
      }
    }

    this.outputStream.on('end', finish);
    this.outputStream.on('error', finish);

    this.closePromise = new Bluebird.Promise((resolve, reject) => {
      this.outputStream.on('finish', resolve);
      this.outputStream.on('error', reject);
    });
  }

  getFilePath() {
    return this.file;
  }

  close() {
    this.outputStream.end();

    return this.closePromise;
  }

  /**
   * Replaces `{launcher}`, `{date}` (YYYY-MM-DD) and `{timestamp}`
   * (YYYY-MM-DD-HH-mm-ss) in `filePath`. Uses the current time when
   * `options.date` is not given. `{launcher}` is left as is when no
   * launcher is given.
   */
  static expandPath(filePath, options) {
    if (typeof filePath !== 'string') {
      return filePath;
    }

    options = options || {};
    let date = options.date instanceof Date ? options.date : new Date();
    let expanded = filePath
      .split(DATE_TEMPLATE).join(formatDate(date))
      .split(TIMESTAMP_TEMPLATE).join(formatTimestamp(date));

    if (options.launcher !== undefined && options.launcher !== null) {
      expanded = expanded.split(LAUNCHER_TEMPLATE).join(sanitizeLauncher(options.launcher));
    }

    return expanded;
  }

  static hasLauncherTemplate(filePath) {
    return hasTemplate(filePath, LAUNCHER_TEMPLATE);
  }

  static hasDateTemplate(filePath) {
    return hasTemplate(filePath, DATE_TEMPLATE);
  }

  static hasTimestampTemplate(filePath) {
    return hasTemplate(filePath, TIMESTAMP_TEMPLATE);
  }
};
