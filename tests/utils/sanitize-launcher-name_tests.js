

const expect = require('chai').expect;

const sanitizeLauncherName = require('../../lib/utils/sanitize-launcher-name');

describe('sanitizeLauncherName', function() {
  it('turns whitespace into an underscore', function() {
    expect(sanitizeLauncherName('IE 11')).to.equal('IE_11');
  });

  it('turns each parenthesis into an underscore', function() {
    expect(sanitizeLauncherName('Firefox (nightly)')).to.equal('Firefox__nightly_');
  });

  it('turns each unsafe character into one underscore', function() {
    expect(sanitizeLauncherName('a/b\\c:d*e?f"g<h>i|j(k)l')).to.equal('a_b_c_d_e_f_g_h_i_j_k_l');
    expect(sanitizeLauncherName('//')).to.equal('__');
  });

  it('collapses any run of whitespace into one underscore', function() {
    expect(sanitizeLauncherName('Headless  \t Chrome\n')).to.equal('Headless_Chrome_');
  });

  it('keeps other characters', function() {
    expect(sanitizeLauncherName('Chrome-120.0_beta')).to.equal('Chrome-120.0_beta');
  });

  it('returns "unknown" for null or undefined', function() {
    expect(sanitizeLauncherName(null)).to.equal('unknown');
    expect(sanitizeLauncherName(undefined)).to.equal('unknown');
  });
});
