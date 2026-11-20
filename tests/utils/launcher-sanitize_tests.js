

const expect = require('chai').expect;

const Launcher = require('../../lib/launcher');
const Config = require('../../lib/config');

describe('Launcher sanitized names', function() {
  describe('sanitizeLauncherName', function() {
    it('makes launcher names safe for file names', function() {
      expect(Launcher.sanitizeLauncherName('IE 11')).to.equal('IE_11');
      expect(Launcher.sanitizeLauncherName('Firefox (nightly)')).to.equal('Firefox__nightly_');
      expect(Launcher.sanitizeLauncherName(null)).to.equal('unknown');
      expect(Launcher.sanitizeLauncherName(undefined)).to.equal('unknown');
    });
  });

  describe('getSanitizedName', function() {
    it('returns the sanitized launcher name', function() {
      let config = new Config(null, {port: '7357', url: 'http://blah.com/'});
      let launcher = new Launcher('Firefox (nightly)', {command: 'echo hello'}, config);

      expect(launcher.getSanitizedName()).to.equal('Firefox__nightly_');
      expect(launcher.name).to.equal('Firefox (nightly)');
    });
  });
});
