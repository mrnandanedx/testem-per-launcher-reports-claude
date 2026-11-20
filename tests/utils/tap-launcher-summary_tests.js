

const assert = require('chai').assert;
const PassThrough = require('stream').PassThrough;

const TapReporter = require('../../lib/reporters/tap_reporter');
const Config = require('../../lib/config');

describe('tap reporter launcher summary', function() {
  var stream;

  function mixedRun(reporter) {
    reporter.report('Chrome', { name: 'a', passed: true, logs: [] });
    reporter.report('Firefox', { name: 'b', passed: true, logs: [] });
    reporter.report('Chrome', { name: 'c', passed: false, logs: [], error: { message: 'boom' } });
    reporter.report('Chrome', { name: 'd', skipped: true, logs: [] });
    reporter.finish();
    return stream.read().toString();
  }

  beforeEach(function() {
    stream = new PassThrough();
  });

  it('is not shown by default', function() {
    var output = mixedRun(new TapReporter(false, stream, new Config('ci', {})));
    assert.notInclude(output, 'per-launcher summary');
    assert.notInclude(output, '# Chrome:');
  });

  it('is not shown when tap_show_launcher_summary is false', function() {
    var output = mixedRun(new TapReporter(false, stream, new Config('ci', { tap_show_launcher_summary: false })));
    assert.notInclude(output, 'per-launcher summary');
  });

  it('prints one line per launcher after the summary when tap_show_launcher_summary is true', function() {
    var output = mixedRun(new TapReporter(false, stream, new Config('ci', { tap_show_launcher_summary: true })));

    assert.include(output, '# fail  1\n\n# per-launcher summary\n' +
      '# Chrome: 3 tests, 1 pass, 1 fail, 1 skip\n' +
      '# Firefox: 1 tests, 1 pass, 0 fail, 0 skip\n');
  });

  it('adds todo counts only when a launcher has todos', function() {
    var reporter = new TapReporter(false, stream, new Config('ci', { tap_show_launcher_summary: true }));
    reporter.report('Chrome', { name: 'a', passed: false, todo: true, logs: [] });
    reporter.report('Chrome', { name: 'b', passed: true, logs: [] });
    reporter.finish();
    var output = stream.read().toString();

    assert.include(output, '# Chrome: 2 tests, 1 pass, 0 fail, 0 skip, 1 todo\n');
  });

  it('prints nothing when silent', function() {
    var reporter = new TapReporter(true, stream, new Config('ci', { tap_show_launcher_summary: true }));
    reporter.report('Chrome', { name: 'a', passed: true, logs: [] });
    reporter.finish();
    assert.isNull(stream.read());
  });
});
