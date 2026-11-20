

const Bluebird = require('bluebird');
const expect = require('chai').expect;
const sinon = require('sinon');
const tmp = require('tmp');
const fs = require('fs');
const PassThrough = require('stream').PassThrough;

const tmpNameAsync = Bluebird.promisify(tmp.tmpName);

const Reporter = require('../../lib/utils/reporter');
const FakeReporter = require('../support/fake_reporter');
const TapReporter = require('../../lib/reporters/tap_reporter');
const XUnitReporter = require('../../lib/reporters/xunit_reporter');

const fsReadFileAsync = Bluebird.promisify(fs.readFile);
const fsUnlinkAsync = Bluebird.promisify(fs.unlink);

describe('Reporter', function() {
  function mockApp(reporter) {
    reporter = reporter || new FakeReporter();

    return {
      config: {
        get: function(key) {
          switch (key) {
            case 'reporter':
              return reporter;
          }
        }
      }
    };
  }

  let sandbox, stream;

  beforeEach(function() {
    sandbox = sinon.createSandbox();
    stream = new PassThrough();
  });

  afterEach(function() {
    sandbox.restore();
  });

  describe('"new"', function() {
    it('can report to a file', function() {
      let close;
      tmpNameAsync().then(function(path) {
        return new Reporter(mockApp(), stream, path);
      }).then(function(reporter) {
        expect(reporter.reportFile).to.exist();

        close = sandbox.spy(reporter.reportFile, 'close');

        return reporter.close();
      }).then(function() {
        expect(close).to.have.been.called();
      });
    });

    // Regresses https://github.com/testem/testem/issues/900
    it('uses file stream when reporting', function() {
      let tapReporterSpy = sandbox.spy(require('../../lib/reporters'), 'tap');
      let reporter = new Reporter(mockApp('tap'), stream, 'report.xml');

      expect(reporter.reportFile).to.not.be.undefined();

      sinon.assert.calledWithMatch(tapReporterSpy,
        sinon.match.any,
        sinon.match.same(reporter.reportFile.outputStream),
        sinon.match.any,
        sinon.match.any);

      return reporter.close().then(function() {
        return fsUnlinkAsync('report.xml');
      });
    });
  });

  describe('"with"', function() {
    let app = mockApp();

    it('can be used as a disposable which returns a reporter', function() {
      return Bluebird.using(Reporter.with(app, stream), function(reporter) {
        expect(reporter).to.be.an.instanceof(Reporter);
      });
    });

    it('closes the reporter when done', function() {
      let close;
      return Bluebird.using(Reporter.with(app, stream), function(reporter) {
        close = sandbox.spy(reporter, 'close');
      }).then(function() {
        expect(close).to.have.been.called();
      });
    });

    it('closes the reporter when promise is rejected with error hidden from the reporter', function() {
      let close;
      return Bluebird.using(Reporter.with(app, stream), function(reporter) {
        close = sandbox.spy(reporter, 'close');

        let mockError = new Error('Not all tests passed.');
        mockError.hideFromReporter = true;
        return Bluebird.reject(mockError);
      }).catch(function() {
        expect(close).to.have.been.called();
      });
    });

    it('logs an error when the wrapped promise was rejected', function() {
      let report;

      return Bluebird.using(Reporter.with(app, stream), function(reporter) {
        report = sandbox.spy(reporter, 'report');
        return Bluebird.reject(new Error('Tests failed.'));
      }).catch(function() {
        expect(report).to.have.been.calledWith(null, {
          error: { message: 'Tests failed.' }, name: 'Error', passed: false
        });
      });
    });
  });

  describe('new', function() {
    it('creates a reporter and writes to stream', function() {
      let reporter = new Reporter({
        config: {
          get: function(key) {
            switch (key) {
              case 'reporter':
                return 'tap';
            }
          }
        }
      }, stream);

      expect(reporter.reporters.length).to.eq(1);

      reporter.report('phantomjs', {
        name: 'it does <cool> "cool" \'cool\' stuff',
        passed: true
      });
      reporter.finish();

      let output = stream.read().toString();
      expect(output).to.match(/tests 1/);
    });

    it('creates two reporters and writes to stream and path when path provided', function() {
      return tmpNameAsync().then(function(path) {
        let stream = new PassThrough();
        let reporter = new Reporter({
          config: {
            get: function(key) {
              switch (key) {
                case 'reporter':
                  return 'tap';
              }
            }
          }
        }, stream, path);

        reporter.report('phantomjs', {
          name: 'it does <cool> "cool" \'cool\' stuff',
          passed: true
        });

        reporter.finish();

        return reporter.close().then(function() {
          let output = stream.read().toString();
          expect(output).to.match(/tests 1/);

          return fsReadFileAsync(path, 'utf-8');
        }).then(function(output) {
          expect(output).to.match(/tests 1/);
        });
      });
    });

    it('creates two reporters in dev mode if path is present and 2nd reporter is tap', function() {
      return tmpNameAsync().then(function(path) {
        let stream = new PassThrough();
        let reporter = new Reporter({
          config: {
            appMode: 'dev',
            get: function(key) {
              switch (key) {
                case 'reporter':
                  return FakeReporter;
                case 'path':
                  return 'dev';
                case 'url':
                  return 'abc';
              }
            }
          },
          on: () => {},
        }, stream, path);

        expect(reporter.reporters).to.have.lengthOf(2);
        expect(reporter.reporters[0]).to.be.an.instanceof(FakeReporter);
        expect(reporter.reporters[1]).to.be.an.instanceof(TapReporter);
      });
    });

    it('creates two reporters in dev mode if path is present and 2nd reporter is dev_mode_file_reporter', function() {
      return tmpNameAsync().then(function(path) {
        let stream = new PassThrough();
        let reporter = new Reporter({
          config: {
            appMode: 'dev',
            get: function(key) {
              switch (key) {
                case 'reporter':
                  return FakeReporter;
                case 'path':
                  return 'dev';
                case 'dev_mode_file_reporter':
                  return 'xunit';
                case 'url':
                  return 'abc';
              }
            }
          },
          on: () => {},
        }, stream, path);

        expect(reporter.reporters).to.have.lengthOf(2);
        expect(reporter.reporters[0]).to.be.an.instanceof(FakeReporter);
        expect(reporter.reporters[1]).to.be.an.instanceof(XUnitReporter);
      });
    });

    it('creates a reporter when custom reporter dependent on configs is provided', function() {
      class CustomReporter extends TapReporter {
      }

      let config = { get: sinon.stub() };
      config.get.withArgs('reporter').returns(CustomReporter);
      config.get.withArgs('tap_quiet_logs').returns(true);
      let app = { config: config };
      let reporter = new Reporter(app, stream);

      expect(reporter).to.be.ok();
      expect(reporter.reporters.length).to.equal(1);
      expect(reporter.reporters[0].quietLogs).to.be.true();
    });

    it('writes xml to stream and file with xunit reporter and intermediate output is enabled', function() {
      return tmpNameAsync().then(function(path) {
        let stream = new PassThrough();
        let reporter = new Reporter({
          config: {
            get: function(key) {
              switch (key) {
                case 'reporter':
                  return 'xunit';
                case 'xunit_intermediate_output':
                  return false;
              }
            }
          }
        }, stream, path);

        reporter.report('phantomjs', {
          name: 'it does <cool> "cool" \'cool\' stuff',
          passed: true
        });
        reporter.finish();

        return reporter.close().then(function() {
          let output = stream.read().toString();
          expect(output).to.match(/<testsuite name/);

          return fsReadFileAsync(path, 'utf-8');
        }).then(function(output) {
          expect(output).to.match(/<testsuite name/);
        });
      });
    });

    it('writes tap to stream and xml to file with xunit reporter intermediate output is enabled', function() {
      return tmpNameAsync().then(function(path) {
        let stream = new PassThrough();
        let reporter = new Reporter({
          config: {
            get: function(key) {
              switch (key) {
                case 'reporter':
                  return 'xunit';
                case 'xunit_intermediate_output':
                  return true;
              }
            }
          }
        }, stream, path);

        reporter.report('phantomjs', {
          name: 'it does <cool> "cool" \'cool\' stuff',
          passed: true
        });
        reporter.finish();

        return reporter.close().then(function() {
          let output = stream.read().toString();
          expect(output).to.match(/tests 1/);

          return fsReadFileAsync(path, 'utf-8');
        }).then(function(output) {
          expect(output).to.match(/<testsuite name/);
        });
      });
    });
  });

  describe('hasPassed', function() {
    let app = mockApp();
    let reporter;

    beforeEach(function() {
      reporter = new Reporter(app, stream);
    });

    it('returns true when all tests passed', function() {
      reporter.report('test', { passed: 1 });

      expect(reporter.hasPassed()).to.be.true();
    });

    it('returns true when all tests skipped', function() {
      let reporter = new Reporter(app, stream);

      reporter.report('test', { skipped: 1 });

      expect(reporter.hasPassed()).to.be.true();
    });

    it('returns true when all tests skipped or passed', function() {
      let reporter = new Reporter(app, stream);

      reporter.report('test', { passed: 1 });
      reporter.report('test', { skipped: 1 });

      expect(reporter.hasPassed()).to.be.true();
    });

    it('returns false when not all passed / skipped', function() {
      let reporter = new Reporter(app, stream);

      reporter.report('test', { passed: 1 });
      reporter.report('test', { skipped: 1 });
      reporter.report('test', { });

      expect(reporter.hasPassed()).to.be.false();
    });
  });

  describe('hasTests', function() {
    let app = mockApp();
    let reporter;

    beforeEach(function() {
      reporter = new Reporter(app, stream);
    });

    it('returns false without reported tests', function() {
      let reporter = new Reporter(app, stream);

      expect(reporter.hasTests()).to.be.false();
    });

    it('returns true when tests were reported', function() {
      reporter.report('test', {});

      expect(reporter.hasTests()).to.be.true();
    });
  });
  describe('per-launcher report files', function() {
    const path = require('path');
    const tmpDirAsync = Bluebird.promisify(tmp.dir);
    let dir;

    function launcherApp(reporterName, extra) {
      return {
        config: {
          get: function(key) {
            if (key === 'reporter') {
              return reporterName;
            }
            return extra && extra[key];
          }
        }
      };
    }

    beforeEach(function() {
      return tmpDirAsync({ unsafeCleanup: true }).then(d => {
        dir = d;
      });
    });

    afterEach(function() {
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('writes one file per launcher', function() {
      let reporter = new Reporter(launcherApp('tap'), stream, path.join(dir, 'out', '{launcher}.tap'));

      reporter.onStart('Chrome', { launcherId: 1 });
      reporter.onStart('Firefox', { launcherId: 2 });
      reporter.report('Chrome', { name: 'chrome test', passed: true, logs: [] });
      reporter.report('Firefox', { name: 'firefox test', passed: true, logs: [] });
      reporter.onEnd('Chrome', { launcherId: 1 });
      reporter.onEnd('Firefox', { launcherId: 2 });

      expect(reporter.reportFile).to.be.undefined();

      return reporter.close().then(function() {
        let chrome = fs.readFileSync(path.join(dir, 'out', 'Chrome.tap'), 'utf8');
        let firefox = fs.readFileSync(path.join(dir, 'out', 'Firefox.tap'), 'utf8');

        expect(chrome).to.contain('chrome test');
        expect(chrome).to.not.contain('firefox test');
        expect(firefox).to.contain('firefox test');
        expect(firefox).to.not.contain('chrome test');
      });
    });

    it('still reports every launcher to stdout', function() {
      let output = '';
      stream.on('data', chunk => {
        output += chunk;
      });
      let reporter = new Reporter(launcherApp('tap'), stream, path.join(dir, '{launcher}.tap'));

      reporter.report('Chrome', { name: 'chrome test', passed: true, logs: [] });
      reporter.report('Firefox', { name: 'firefox test', passed: true, logs: [] });

      return reporter.close().then(function() {
        expect(output).to.contain('chrome test');
        expect(output).to.contain('firefox test');
      });
    });

    it('does not create files for launchers that only start and end', function() {
      let reporter = new Reporter(launcherApp('tap'), stream, path.join(dir, '{launcher}.tap'));

      reporter.onStart('testem', { launcherId: 0 });
      reporter.onEnd('testem', { launcherId: 0 });
      reporter.report('Chrome', { name: 'chrome test', passed: true, logs: [] });

      return reporter.close().then(function() {
        expect(fs.readdirSync(dir)).to.deep.equal(['Chrome.tap']);
      });
    });

    it('replays onStart to the file reporter once the launcher reports', function() {
      let starts = [];
      function StartRecorder() {}
      StartRecorder.prototype.report = function() {};
      StartRecorder.prototype.onStart = function(name, data) {
        starts.push([name, data]);
      };

      let reporter = new Reporter(launcherApp(StartRecorder), stream, path.join(dir, '{launcher}.txt'));
      reporter.onStart('Chrome', { launcherId: 1 });
      expect(starts).to.deep.equal([['Chrome', { launcherId: 1 }]]); // stdout reporter

      reporter.report('Chrome', { name: 'a', passed: true });
      expect(starts).to.deep.equal([['Chrome', { launcherId: 1 }], ['Chrome', { launcherId: 1 }]]);

      return reporter.close();
    });

    it('expands {date} and {timestamp} the same way for all launchers', function() {
      let reporter = new Reporter(launcherApp('tap'), stream, path.join(dir, '{timestamp}-{launcher}.tap'));

      reporter.report('Chrome', { name: 'a', passed: true, logs: [] });
      reporter.report('Firefox', { name: 'b', passed: true, logs: [] });

      return reporter.close().then(function() {
        let files = fs.readdirSync(dir).sort();
        expect(files).to.have.length(2);
        expect(files[0].replace('-Chrome.tap', '')).to.equal(files[1].replace('-Firefox.tap', ''));
        expect(files[0]).to.match(/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-Chrome\.tap$/);
      });
    });

    it('writes errors without a launcher to stdout only, not to a file', function() {
      let output = '';
      stream.on('data', chunk => {
        output += chunk;
      });

      return Bluebird.using(Reporter.with(launcherApp('tap'), stream, path.join(dir, '{launcher}.tap')), function() {
        return Bluebird.reject(new Error('Tests failed.'));
      }).catch(function() {
        expect(output).to.contain('Tests failed.');
        expect(fs.readdirSync(dir)).to.deep.equal([]);
      });
    });

    it('uses the xunit reporter per launcher with xunit_intermediate_output', function() {
      let reporter = new Reporter(launcherApp('xunit', { xunit_intermediate_output: true }), stream, path.join(dir, '{launcher}.xml'));

      reporter.report('Chrome', { name: 'chrome test', passed: true, logs: [] });

      return reporter.close().then(function() {
        let xml = fs.readFileSync(path.join(dir, 'Chrome.xml'), 'utf8');
        expect(xml).to.contain('<testsuite');
        expect(xml).to.contain('chrome test');
      });
    });
  });
  describe('per-launcher report files for each built-in reporter', function() {
    const path = require('path');
    const XmlDom = require('@xmldom/xmldom');
    const tmpDirAsync = Bluebird.promisify(tmp.dir);
    let dir, output;

    function appWith(reporterName) {
      return {
        config: {
          get: function(key) {
            if (key === 'reporter') {
              return reporterName;
            }
          }
        }
      };
    }

    function pass(name, launcherId) {
      return { name, passed: true, logs: [], launcherId };
    }

    function fail(name, launcherId) {
      return { name, passed: false, failed: 1, logs: [], launcherId, error: { message: `${name} broke` } };
    }

    // Chrome runs twice (two launcher ids): one pass, one fail.
    // Firefox runs once: one pass. The internal `testem` launcher fails.
    function runSuite(reporter) {
      reporter.onStart('testem', { launcherId: 0 });
      reporter.onStart('Chrome', { launcherId: 1 });
      reporter.onStart('Chrome', { launcherId: 2 });
      reporter.onStart('Firefox', { launcherId: 3 });
      reporter.report('Chrome', pass('chrome passes', 1));
      reporter.report('Firefox', pass('firefox passes', 3));
      reporter.report('Chrome', fail('chrome fails', 2));
      reporter.report('testem', fail('hook fails', 0));
      reporter.onEnd('Chrome', { launcherId: 1 });
      reporter.onEnd('Chrome', { launcherId: 2 });
      reporter.onEnd('Firefox', { launcherId: 3 });
      reporter.onEnd('testem', { launcherId: 0 });
    }

    function read(name) {
      return fs.readFileSync(path.join(dir, name), 'utf8');
    }

    beforeEach(function() {
      output = '';
      stream.on('data', chunk => {
        output += chunk;
      });
      return tmpDirAsync({ unsafeCleanup: true }).then(d => {
        dir = d;
      });
    });

    afterEach(function() {
      fs.rmSync(dir, { recursive: true, force: true });
    });

    function expectOnlyLauncherFiles(ext) {
      expect(fs.readdirSync(dir).sort()).to.deep.equal([`Chrome.${ext}`, `Firefox.${ext}`]);
    }

    it('tap: one valid file per launcher with its own counts', function() {
      let reporter = new Reporter(appWith('tap'), stream, path.join(dir, '{launcher}.tap'));
      runSuite(reporter);

      return reporter.close().then(function() {
        expectOnlyLauncherFiles('tap');

        let chrome = read('Chrome.tap');
        expect(chrome).to.match(/^ok 1 Chrome - .*chrome passes$/m);
        expect(chrome).to.match(/^not ok 2 Chrome - .*chrome fails$/m);
        expect(chrome).to.contain('1..2\n# tests 2\n# pass  1\n# skip  0\n# todo  0\n# fail  1');
        expect(chrome).to.not.contain('firefox');
        expect(chrome).to.not.contain('hook fails');

        let firefox = read('Firefox.tap');
        expect(firefox).to.match(/^ok 1 Firefox - .*firefox passes$/m);
        expect(firefox).to.contain('1..1\n# tests 1\n# pass  1\n# skip  0\n# todo  0\n# fail  0\n\n# ok');
        expect(firefox).to.not.contain('chrome');

        // stdout still shows everything combined
        expect(output).to.contain('chrome passes');
        expect(output).to.contain('firefox passes');
        expect(output).to.contain('hook fails');
        expect(output).to.contain('# tests 4');
      });
    });

    it('xunit: one valid XML file per launcher with its own counts', function() {
      let reporter = new Reporter(appWith('xunit'), stream, path.join(dir, '{launcher}.xml'));
      runSuite(reporter);

      return reporter.close().then(function() {
        expectOnlyLauncherFiles('xml');

        function parse(name) {
          let errors = [];
          let doc = new XmlDom.DOMParser({ onError: (level, msg) => errors.push(msg) })
            .parseFromString(read(name), 'text/xml');
          expect(errors, name).to.deep.equal([]);
          return doc.documentElement;
        }

        let chrome = parse('Chrome.xml');
        expect(chrome.tagName).to.equal('testsuite');
        expect(chrome.getAttribute('tests')).to.equal('2');
        expect(chrome.getAttribute('failures')).to.equal('1');
        expect(chrome.getElementsByTagName('testcase').length).to.equal(2);
        expect(read('Chrome.xml')).to.not.contain('firefox');

        let firefox = parse('Firefox.xml');
        expect(firefox.getAttribute('tests')).to.equal('1');
        expect(firefox.getAttribute('failures')).to.equal('0');
        expect(firefox.getElementsByTagName('testcase').length).to.equal(1);
        expect(read('Firefox.xml')).to.not.contain('chrome');

        expect(output).to.contain('tests="4"');
      });
    });

    it('dot: one file per launcher with its own counts', function() {
      let reporter = new Reporter(appWith('dot'), stream, path.join(dir, '{launcher}.txt'));
      runSuite(reporter);

      return reporter.close().then(function() {
        expectOnlyLauncherFiles('txt');

        let chrome = read('Chrome.txt');
        expect(chrome).to.match(/^\n {2}\.F\n/);
        expect(chrome).to.contain('# tests 2\n# pass  1');
        expect(chrome).to.contain('# fail  1');
        expect(chrome).to.contain('[Chrome] chrome fails');
        expect(chrome).to.not.contain('firefox');

        let firefox = read('Firefox.txt');
        expect(firefox).to.match(/^\n {2}\.\n/);
        expect(firefox).to.contain('# tests 1\n# pass  1');
        expect(firefox).to.contain('# ok');
        expect(firefox).to.not.contain('chrome');

        expect(output).to.contain('# tests 4');
      });
    });

    it('teamcity: one file per launcher with only its tests', function() {
      let reporter = new Reporter(appWith('teamcity'), stream, path.join(dir, '{launcher}.txt'));
      runSuite(reporter);

      return reporter.close().then(function() {
        expectOnlyLauncherFiles('txt');

        let count = (text, type) => text.split(`##teamcity[${type} `).length - 1;

        let chrome = read('Chrome.txt');
        expect(count(chrome, 'testStarted')).to.equal(2);
        expect(count(chrome, 'testFinished')).to.equal(2);
        expect(count(chrome, 'testFailed')).to.equal(1);
        expect(count(chrome, 'testSuiteFinished')).to.equal(1);
        expect(chrome).to.not.contain('firefox');

        let firefox = read('Firefox.txt');
        expect(count(firefox, 'testStarted')).to.equal(1);
        expect(count(firefox, 'testFailed')).to.equal(0);
        expect(count(firefox, 'testSuiteFinished')).to.equal(1);
        expect(firefox).to.not.contain('chrome');

        expect(count(output, 'testStarted')).to.equal(4);
      });
    });

    it('finish is safe to call more than once', function() {
      let reporter = new Reporter(appWith('tap'), stream, path.join(dir, '{launcher}.tap'));
      runSuite(reporter);

      reporter.finish();
      reporter.finish();

      return reporter.close().then(function() {
        expect(read('Chrome.tap').split('# tests').length - 1).to.equal(1);
        expect(read('Firefox.tap').split('# tests').length - 1).to.equal(1);
        expect(output.split('# tests').length - 1).to.equal(1);
      });
    });

    it('does not open new files after finishing', function() {
      let reporter = new Reporter(appWith('tap'), stream, path.join(dir, '{launcher}.tap'));
      reporter.report('Chrome', pass('chrome passes', 1));
      reporter.finish();
      reporter.report('Safari', pass('late result', 4));

      return reporter.close().then(function() {
        expect(fs.readdirSync(dir)).to.deep.equal(['Chrome.tap']);
      });
    });

    it('close resolves only after every file is written', function() {
      let reporter = new Reporter(appWith('tap'), stream, path.join(dir, '{launcher}.tap'));
      runSuite(reporter);

      let finished = [];
      reporter.reportFiles().forEach(file => {
        file.outputStream.on('finish', () => finished.push(path.basename(file.getFilePath())));
      });

      return reporter.close().then(function() {
        expect(finished.sort()).to.deep.equal(['Chrome.tap', 'Firefox.tap']);
        expect(read('Chrome.tap')).to.contain('# tests 2');
        expect(read('Firefox.tap')).to.contain('# tests 1');
      });
    });

    it('hasPassed is false when any launcher failed', function() {
      let reporter = new Reporter(appWith('tap'), stream, path.join(dir, '{launcher}.tap'));
      reporter.report('Chrome', fail('chrome fails', 1));
      reporter.report('Firefox', pass('firefox passes', 2));

      expect(reporter.hasPassed()).to.be.false();
      return reporter.close();
    });

    it('hasPassed is true when every launcher passed', function() {
      let reporter = new Reporter(appWith('tap'), stream, path.join(dir, '{launcher}.tap'));
      reporter.report('Chrome', pass('chrome passes', 1));
      reporter.report('Firefox', pass('firefox passes', 2));

      expect(reporter.hasPassed()).to.be.true();
      return reporter.close();
    });

    it('writes everything to one file when there is no {launcher} placeholder', function() {
      let reporter = new Reporter(appWith('tap'), stream, path.join(dir, 'report.tap'));
      runSuite(reporter);

      expect(reporter.reportFile).to.exist();
      expect(reporter.isPerLauncher()).to.be.false();

      return reporter.close().then(function() {
        expect(fs.readdirSync(dir)).to.deep.equal(['report.tap']);
        let report = read('report.tap');
        expect(report).to.contain('chrome passes');
        expect(report).to.contain('firefox passes');
        expect(report).to.contain('hook fails');
        expect(report).to.contain('# tests 4');
      });
    });
  });
});
