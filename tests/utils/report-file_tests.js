

const Bluebird = require('bluebird');
const expect = require('chai').expect;
const tmp = require('tmp');
const fs = require('fs');
const path = require('path');
const Writable = require('stream').Writable;

const tmpNameAsync = Bluebird.promisify(tmp.tmpName);
const tmpDirAsync = Bluebird.promisify(tmp.dir);

const ReportFile = require('../../lib/utils/report-file');

describe('ReportFile', function() {
  describe('close', function() {
    it('resolves when all data has been written', function() {

      let noopStream = new Writable();
      noopStream._write = function(chunk, encoding, done) {
        done();
      };

      let finished = false;

      return tmpNameAsync().then(function(path) {
        return new ReportFile(path, noopStream);
      }).then(function(reportFile) {
        expect(reportFile.closePromise).to.exist();

        reportFile.outputStream.on('finish', function() {
          finished = true;
        });

        return reportFile.close();
      }).then(function() {
        expect(finished).to.be.true();
      });
    });
  });
  describe('expandPath', function() {
    // 2024-03-05 07:08:09 local time
    let date = new Date(2024, 2, 5, 7, 8, 9);

    it('replaces {date} with YYYY-MM-DD', function() {
      expect(ReportFile.expandPath('out/{date}.xml', { date })).to.equal('out/2024-03-05.xml');
    });

    it('replaces {timestamp} with YYYY-MM-DD-HH-mm-ss', function() {
      expect(ReportFile.expandPath('out/{timestamp}.xml', { date })).to.equal('out/2024-03-05-07-08-09.xml');
    });

    it('replaces {launcher}', function() {
      expect(ReportFile.expandPath('out/{launcher}.xml', { launcher: 'Firefox' })).to.equal('out/Firefox.xml');
    });

    it('makes launcher names safe for file names', function() {
      expect(ReportFile.expandPath('out/{launcher}.xml', { launcher: 'Headless Chrome 1/2' })).to.equal('out/Headless_Chrome_1_2.xml');
    });

    it('replaces every occurrence and combinations of placeholders', function() {
      expect(ReportFile.expandPath('{date}/{launcher}-{timestamp}-{launcher}.xml', { date, launcher: 'Chrome' }))
        .to.equal('2024-03-05/Chrome-2024-03-05-07-08-09-Chrome.xml');
    });

    it('leaves {launcher} untouched when no launcher is given', function() {
      expect(ReportFile.expandPath('out/{launcher}.xml', { date })).to.equal('out/{launcher}.xml');
    });

    it('uses today when no date is given', function() {
      let now = new Date();
      let pad = n => String(n).padStart(2, '0');
      let today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

      expect(ReportFile.expandPath('{date}.xml')).to.equal(`${today}.xml`);
      expect(ReportFile.expandPath('{timestamp}.xml', {})).to.match(new RegExp(`^${today}-\\d{2}-\\d{2}-\\d{2}\\.xml$`));
    });

    it('returns paths without placeholders unchanged', function() {
      expect(ReportFile.expandPath('out/report.xml', { date, launcher: 'Chrome' })).to.equal('out/report.xml');
    });

    it('returns null and undefined unchanged', function() {
      expect(ReportFile.expandPath(null)).to.equal(null);
      expect(ReportFile.expandPath(undefined)).to.equal(undefined);
    });
  });

  describe('template detection', function() {
    it('hasLauncherTemplate', function() {
      expect(ReportFile.hasLauncherTemplate('out/{launcher}.xml')).to.be.true();
      expect(ReportFile.hasLauncherTemplate('out/{date}.xml')).to.be.false();
      expect(ReportFile.hasLauncherTemplate(null)).to.be.false();
      expect(ReportFile.hasLauncherTemplate(undefined)).to.be.false();
    });

    it('hasDateTemplate', function() {
      expect(ReportFile.hasDateTemplate('out/{date}.xml')).to.be.true();
      expect(ReportFile.hasDateTemplate('out/{timestamp}.xml')).to.be.false();
      expect(ReportFile.hasDateTemplate(null)).to.be.false();
      expect(ReportFile.hasDateTemplate(undefined)).to.be.false();
    });

    it('hasTimestampTemplate', function() {
      expect(ReportFile.hasTimestampTemplate('out/{timestamp}.xml')).to.be.true();
      expect(ReportFile.hasTimestampTemplate('out/{date}.xml')).to.be.false();
      expect(ReportFile.hasTimestampTemplate(null)).to.be.false();
      expect(ReportFile.hasTimestampTemplate(undefined)).to.be.false();
    });
  });

  describe('getFilePath', function() {
    let dir;

    beforeEach(function() {
      return tmpDirAsync({ unsafeCleanup: true }).then(d => {
        dir = d;
      });
    });

    afterEach(function() {
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('returns the path unchanged when it has no placeholders', function() {
      let file = path.join(dir, 'report.xml');
      let reportFile = new ReportFile(file);

      expect(reportFile.getFilePath()).to.equal(file);
      return reportFile.close();
    });

    it('returns the expanded path and writes to it, creating missing folders', function() {
      let date = new Date(2024, 2, 5, 7, 8, 9);
      let reportFile = new ReportFile(path.join(dir, '{date}', 'nested', '{launcher}-{timestamp}.xml'), {
        launcher: 'Headless Firefox',
        date
      });
      let expected = path.join(dir, '2024-03-05', 'nested', 'Headless_Firefox-2024-03-05-07-08-09.xml');

      expect(reportFile.getFilePath()).to.equal(expected);

      reportFile.outputStream.write('per launcher data');
      return reportFile.close().then(() => {
        expect(fs.readFileSync(expected, 'utf8')).to.equal('per launcher data');
      });
    });
  });
});
