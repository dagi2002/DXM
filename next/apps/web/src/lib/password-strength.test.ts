import { describe, expect, it } from 'vitest';
import { MIN_PASSWORD_LENGTH, passwordStrength } from './password-strength';

describe('passwordStrength', () => {
  it('shares the server minimum of 10 characters', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(10);
    expect(passwordStrength('Ab1!xyz').level).toBe('tooShort');
    expect(passwordStrength('Ab1!xyzQw9').level).not.toBe('tooShort');
  });

  it('counts Ge’ez characters like the server does', () => {
    expect(passwordStrength('ሰላምሰላምሰላ').level).toBe('tooShort'); // 9 characters
    expect(passwordStrength('ኢትዮጵያ-አዲስ-አበባ-2019').score).toBeGreaterThanOrEqual(3);
  });

  it.each([
    ['1234567890', 'weak'],
    ['password123', 'weak'],
    ['Ethiopia2026', 'weak'],
    ['aaaaaaaaaaaa', 'weak'],
    ['qwertyuiop', 'weak'],
    ['abcdefgh12', 'weak'],
  ])('rates %s as %s', (pw, level) => {
    expect(passwordStrength(pw).level).toBe(level);
  });

  it('penalizes passwords built from the user’s name or email', () => {
    const personal = ['Tigist Alemu', 'tigist.alemu@example.et'];
    expect(passwordStrength('Tigist#2019x', personal).score).toBeLessThan(
      passwordStrength('Tigist#2019x').score,
    );
  });

  it('rates long, varied passwords and passphrases as strong', () => {
    expect(passwordStrength('M3sk3rem!Buna#Ch3w').level).toBe('strong');
    expect(passwordStrength('coffee table river mountain').level).toBe('strong');
  });

  it('moves up monotonically as the password gets longer and more varied', () => {
    const steps = ['abcxyzmnop', 'abcxyzmnopQ7', 'abcxyzmnopQ7!vw', 'abcxyzmnopQ7!vwRT9'];
    const scores = steps.map((s) => passwordStrength(s).score);
    expect(scores).toEqual([...scores].sort((a, b) => a - b));
  });
});
