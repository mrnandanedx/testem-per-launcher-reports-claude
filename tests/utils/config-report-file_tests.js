

const expect = require('chai').expect;

const Config = require('../../lib/config');

describe('Config report_file', function() {
  describe('report_file templates', function() {
    it('detects placeholders in report_file', function() {
      let config = new Config('ci', { report_file: 'out/{launcher}-{date}.xml' });
      expect(config.hasLauncherTemplate()).to.be.true();
      expect(config.hasDateTemplate()).to.be.true();
      expect(config.hasTimestampTemplate()).to.be.false();

      config = new Config('ci', { report_file: 'out/{timestamp}.xml' });
      expect(config.hasLauncherTemplate()).to.be.false();
      expect(config.hasDateTemplate()).to.be.false();
      expect(config.hasTimestampTemplate()).to.be.true();
    });

    it('returns false for all templates without report_file', function() {
      let config = new Config('ci', {});
      expect(config.hasLauncherTemplate()).to.be.false();
      expect(config.hasDateTemplate()).to.be.false();
      expect(config.hasTimestampTemplate()).to.be.false();
    });
  });

  describe('validateReportFile', function() {
    it('is valid without report_file', function() {
      expect(new Config('ci', {}).validateReportFile()).to.deep.equal({ valid: true, errors: [], warnings: [] });
    });

    it('is valid with known placeholders and an extension', function() {
      let config = new Config('ci', { report_file: 'out/{date}/{launcher}-{timestamp}.xml' });
      expect(config.validateReportFile()).to.deep.equal({ valid: true, errors: [], warnings: [] });
    });

    it('is valid with a plain path', function() {
      let config = new Config('ci', { report_file: 'out/report.xml' });
      expect(config.validateReportFile()).to.deep.equal({ valid: true, errors: [], warnings: [] });
    });

    it('reports unknown placeholders as errors', function() {
      let result = new Config('ci', { report_file: 'out/{browser}-{date}.xml' }).validateReportFile();
      expect(result.valid).to.be.false();
      expect(result.errors).to.have.length(1);
      expect(result.errors[0]).to.match(/unknown/i);
      expect(result.errors[0]).to.contain('{browser}');
      expect(result.warnings).to.deep.equal([]);
    });

    it('warns when {launcher} is used without a file extension', function() {
      ['out/{launcher}', 'out/report.{launcher}'].forEach(reportFile => {
        let result = new Config('ci', { report_file: reportFile }).validateReportFile();
        expect(result.valid, reportFile).to.be.true();
        expect(result.errors, reportFile).to.deep.equal([]);
        expect(result.warnings, reportFile).to.have.length(1);
        expect(result.warnings[0]).to.contain('extension');
      });
    });

    it('does not warn about a missing extension without {launcher}', function() {
      let result = new Config('ci', { report_file: 'out/report-{date}' }).validateReportFile();
      expect(result).to.deep.equal({ valid: true, errors: [], warnings: [] });
    });
  });

  describe('getExpandedReportFile', function() {
    it('returns null without report_file', function() {
      expect(new Config('ci', {}).getExpandedReportFile()).to.equal(null);
      expect(new Config('ci', {}).getExpandedReportFile('Chrome')).to.equal(null);
    });

    it('expands the launcher, sanitized', function() {
      let config = new Config('ci', { report_file: 'out/{launcher}.xml' });
      expect(config.getExpandedReportFile('Firefox (nightly)')).to.equal('out/Firefox__nightly_.xml');
    });

    it('leaves {launcher} in place when no launcher is given', function() {
      let config = new Config('ci', { report_file: 'out/{launcher}.xml' });
      expect(config.getExpandedReportFile()).to.equal('out/{launcher}.xml');
    });

    it('expands {date} to today', function() {
      let now = new Date();
      let pad = n => String(n).padStart(2, '0');
      let today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

      let config = new Config('ci', { report_file: 'out/{date}.xml' });
      expect(config.getExpandedReportFile()).to.equal(`out/${today}.xml`);
    });
  });
});
