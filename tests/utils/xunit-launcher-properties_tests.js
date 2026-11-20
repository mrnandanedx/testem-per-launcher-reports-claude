

const assert = require('chai').assert;
const PassThrough = require('stream').PassThrough;
const XmlDom = require('@xmldom/xmldom');

const XUnitReporter = require('../../lib/reporters/xunit_reporter');
const Config = require('../../lib/config');

function assertXmlIsValid(xmlString) {
  let failure = null;
  let parser = new XmlDom.DOMParser({
    errorHandler: {
      warning: txt => { failure = txt; },
      error: txt => { failure = txt; },
      fatalError: txt => { failure = txt; }
    }
  });
  parser.parseFromString(xmlString, 'text/xml');
  if (failure) {
    assert(false, failure + '\n---\n' + xmlString + '\n---\n');
  }
}

describe('xunit reporter launcher properties', function() {
  var stream;

  function mixedRun(reporter) {
    reporter.report('Chrome', { name: 'a', passed: true });
    reporter.report('Firefox', { name: 'b', passed: true });
    reporter.report('Chrome', { name: 'c', passed: false, error: { message: 'boom' } });
    reporter.report('Chrome', { name: 'd', skipped: true });
  }

  beforeEach(function() {
    stream = new PassThrough();
  });

  it('getLauncherStats returns total, pass and fail per launcher', function() {
    var reporter = new XUnitReporter(false, stream, new Config('ci', {}));
    mixedRun(reporter);

    assert.deepEqual(reporter.getLauncherStats(), {
      Chrome: { total: 3, pass: 1, fail: 1 },
      Firefox: { total: 1, pass: 1, fail: 0 }
    });
  });

  it('counts a passing todo as a failure, like the failures attribute', function() {
    var reporter = new XUnitReporter(false, stream, new Config('ci', {}));
    reporter.report('Chrome', { name: 'a', passed: true, todo: true });
    reporter.report('Chrome', { name: 'b', passed: false, todo: true });

    assert.deepEqual(reporter.getLauncherStats(), { Chrome: { total: 2, pass: 0, fail: 1 } });
    assert.equal(reporter.failures(), 1);
  });

  it('adds no properties element by default', function() {
    var reporter = new XUnitReporter(false, stream, new Config('ci', {}));
    mixedRun(reporter);
    reporter.setLauncherName('Chrome');
    reporter.finish();
    var output = stream.read().toString();

    assert.notInclude(output, '<properties');
    assert.notInclude(output, '<property');
    assertXmlIsValid(output);
  });

  it('adds no properties element when xunit_include_launcher_properties is false', function() {
    var reporter = new XUnitReporter(false, stream, new Config('ci', { xunit_include_launcher_properties: false }));
    mixedRun(reporter);
    reporter.finish();
    assert.notInclude(stream.read().toString(), '<properties');
  });

  it('adds launchers and per-launcher pass/fail properties when enabled', function() {
    var reporter = new XUnitReporter(false, stream, new Config('ci', { xunit_include_launcher_properties: true }));
    mixedRun(reporter);
    reporter.finish();
    var output = stream.read().toString();

    assertXmlIsValid(output);
    var doc = new XmlDom.DOMParser().parseFromString(output, 'text/xml');
    var root = doc.documentElement;
    var properties = root.getElementsByTagName('properties');
    assert.equal(properties.length, 1);
    assert.equal(properties[0].parentNode, root);

    var values = {};
    var nodes = properties[0].getElementsByTagName('property');
    for (var i = 0; i < nodes.length; i++) {
      values[nodes[i].getAttribute('name')] = nodes[i].getAttribute('value');
    }
    assert.deepEqual(values, {
      launchers: 'Chrome,Firefox',
      'Chrome.pass': '1',
      'Chrome.fail': '1',
      'Firefox.pass': '1',
      'Firefox.fail': '0'
    });
  });

  it('setLauncherName adds a launcher property when enabled', function() {
    var reporter = new XUnitReporter(false, stream, new Config('ci', { xunit_include_launcher_properties: true }));
    reporter.setLauncherName('Chrome');
    reporter.report('Chrome', { name: 'a', passed: true });
    reporter.finish();
    var output = stream.read().toString();

    assert.include(output, '<property name="launcher" value="Chrome"/>');
    assert.include(output, '<property name="launchers" value="Chrome"/>');
    assertXmlIsValid(output);
  });
});
