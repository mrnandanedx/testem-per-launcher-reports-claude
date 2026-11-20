

const Bluebird = require('bluebird');
const log = require('npmlog');

const reporters = require('../reporters');
const isa = require('./isa');
const ReportFile = require('./report-file');

function setupReporter(name, out, config, app) {
  let reporter;

  if (isa(name, String)) {
    let TestReporter = reporters[name];
    if (TestReporter) {
      reporter = new TestReporter(false, out, config, app);
    }
  } else if (isa(name, Function)) {
    // name is a constructor function, ignore new-cap and instantiate
    // eslint-disable-next-line new-cap
    reporter = new name(false, out, config, app);
  } else {
    reporter = name;
  }

  if (!reporter) {
    throw new Error('Test reporter `' + name + '` not found.');
  }

  return reporter;
}


class Reporter {
  constructor(app, stdout, path) {
    this.total = 0;
    this.passed = 0;
    this.skipped = 0;
    this.todo = 0;

    let config = app.config;
    this.config = config;
    this.app = app;

    let stdoutReporterName = config.get('reporter');
    let fileReporterName = config.get('reporter');

    if (path && config.get('xunit_intermediate_output') && config.get('reporter') === 'xunit') {
      stdoutReporterName = 'tap';
    } else if (path && config.appMode === 'dev') {
      fileReporterName = config.get('dev_mode_file_reporter');
      if (!fileReporterName) {
        log.warn('You configured a `report_file`, you may want to configure the `dev_mode_file_reporter` as well. Using the `tap` logger now.');
        fileReporterName = 'tap';
      }
    }

    this.reporters = [setupReporter(stdoutReporterName, stdout, config, app)];

    if (path && ReportFile.hasLauncherTemplate(path)) {
      // One report file (and file reporter) per launcher, created lazily the
      // first time a launcher reports something. All files of a run share the
      // same date so that `{date}`/`{timestamp}` expand identically.
      this.reportFilePath = path;
      this.reportFileDate = new Date();
      this.fileReporterName = fileReporterName;
      this.launcherReports = new Map();
      this.pendingStarts = new Map();
    } else if (path) {
      this.reportFile = new ReportFile(path);
      this.reporters.push(setupReporter(fileReporterName, this.reportFile.outputStream, config, app));
    }
  }

  isPerLauncher() {
    return !!this.launcherReports;
  }

  launcherReport(launcher) {
    let entry = this.launcherReports.get(launcher);
    if (!entry) {
      let reportFile = new ReportFile(this.reportFilePath, {
        launcher,
        date: this.reportFileDate
      });
      let reporter = setupReporter(this.fileReporterName, reportFile.outputStream, this.config, this.app);
      entry = { reportFile, reporter };
      this.launcherReports.set(launcher, entry);

      let starts = this.pendingStarts.get(launcher) || [];
      this.pendingStarts.delete(launcher);
      starts.forEach(data => {
        if (reporter.onStart) {
          reporter.onStart(launcher, data);
        }
      });
    }
    return entry.reporter;
  }

  // Reporters that should receive an event for `launcher` in per-launcher
  // mode. Events without a launcher (e.g. errors from `Reporter.with`) go to
  // every open launcher file, or to a `testem` file when none is open yet.
  fileReportersFor(launcher) {
    if (launcher === null || launcher === undefined) {
      if (this.launcherReports.size === 0) {
        return [this.launcherReport('testem')];
      }
      return Array.from(this.launcherReports.values()).map(entry => entry.reporter);
    }
    return [this.launcherReport(launcher)];
  }

  allFileReporters() {
    return this.isPerLauncher() ? Array.from(this.launcherReports.values()).map(entry => entry.reporter) : [];
  }

  reportFiles() {
    if (this.isPerLauncher()) {
      return Array.from(this.launcherReports.values()).map(entry => entry.reportFile);
    }
    return this.reportFile ? [this.reportFile] : [];
  }

  testStarted(name, data) {
    let targets = this.isPerLauncher() ? this.reporters.concat(this.fileReportersFor(name)) : this.reporters;
    targets.forEach(reporter => {
      if (reporter.testStarted) {
        reporter.testStarted(name, data);
      }
    });
  }

  close() {
    this.finish();

    let files = this.reportFiles();
    if (files.length === 1) {
      return files[0].close();
    }
    if (files.length > 1) {
      return Bluebird.all(files.map(file => file.close()));
    }
  }

  hasTests() {
    return this.total > 0;
  }

  hasPassed() {
    return this.total <= ((this.passed || 0) + (this.skipped || 0) + (this.todo || 0));
  }

  report(name, result) {
    this.total++;
    if (result.skipped) {
      this.skipped++;
    } else if (result.passed && !result.todo) {
      this.passed++;
    } else if (!result.passed && result.todo) {
      this.todo++;
    }

    let targets = this.isPerLauncher() ? this.reporters.concat(this.fileReportersFor(name)) : this.reporters;
    targets.forEach(reporter => {
      reporter.report(name, result);
    });
  }
}

Reporter.with = (app, stdout, path) => Bluebird.try(() => new Reporter(app, stdout, path)).disposer((reporter, promise) => {
  if (promise.isRejected()) {
    let err = promise.reason();

    if (!err.hideFromReporter) {
      reporter.report(null, {
        passed: false,
        name: err.name || 'unknown error',
        error: {
          message: err.message
        }
      });
    }
  }

  return reporter.close();
});

function forwardToReporters(fn) {
  return function() {
    let args = new Array(arguments.length);
    for (let i = 0; i < args.length; ++i) {
      args[i] = arguments[i];
    }

    this.reporters.concat(this.allFileReporters()).forEach(reporter => {
      if (reporter[fn]) {
        reporter[fn].apply(reporter, args);
      }
    });
  };
}

['finish', 'reportMetadata'].forEach(fn => {
  Reporter.prototype[fn] = forwardToReporters(fn);
});

Reporter.prototype.onStart = function(launcher, data) {
  this.reporters.forEach(reporter => {
    if (reporter.onStart) {
      reporter.onStart(launcher, data);
    }
  });

  if (this.isPerLauncher()) {
    let entry = this.launcherReports.get(launcher);
    if (entry) {
      if (entry.reporter.onStart) {
        entry.reporter.onStart(launcher, data);
      }
    } else {
      // Defer until the launcher actually reports, so launchers that never
      // report anything (e.g. the app-level `testem` start) get no file.
      let starts = this.pendingStarts.get(launcher) || [];
      starts.push(data);
      this.pendingStarts.set(launcher, starts);
    }
  }
};

Reporter.prototype.onEnd = function(launcher, data) {
  this.reporters.forEach(reporter => {
    if (reporter.onEnd) {
      reporter.onEnd(launcher, data);
    }
  });

  if (this.isPerLauncher()) {
    let entry = this.launcherReports.get(launcher);
    if (entry) {
      if (entry.reporter.onEnd) {
        entry.reporter.onEnd(launcher, data);
      }
    } else {
      this.pendingStarts.delete(launcher);
    }
  }
};

module.exports = Reporter;
