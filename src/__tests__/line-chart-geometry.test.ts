import { nearestIndex, pointX, pointY } from '@/components/ui/LineChart';
import { chart } from '@/theme';

describe('pointX', () => {
  it('puts each point in the middle of its equal column', () => {
    expect(pointX(0, 7, 350)).toBe(25);
    expect(pointX(3, 7, 350)).toBe(175);
    expect(pointX(6, 7, 350)).toBe(325);
  });

  it('first and last points sit half a column from the edges', () => {
    const width = 420;
    const count = 5;
    expect(pointX(0, count, width)).toBe(width / count / 2);
    expect(pointX(count - 1, count, width)).toBe(width - width / count / 2);
  });

  it('is 0 with no points', () => {
    expect(pointX(0, 0, 350)).toBe(0);
  });
});

describe('nearestIndex', () => {
  it('picks the day whose column contains x (7 days, 350 px)', () => {
    expect(nearestIndex(0, 7, 350)).toBe(0);
    expect(nearestIndex(49, 7, 350)).toBe(0);
    expect(nearestIndex(50, 7, 350)).toBe(1);
    expect(nearestIndex(175, 7, 350)).toBe(3);
    expect(nearestIndex(349, 7, 350)).toBe(6);
  });

  it('is the inverse of pointX', () => {
    for (const count of [7, 30, 366]) {
      for (let index = 0; index < count; index++) {
        expect(nearestIndex(pointX(index, count, 350), count, 350)).toBe(index);
      }
    }
  });

  it('works for 30 days', () => {
    expect(nearestIndex(0, 30, 360)).toBe(0);
    expect(nearestIndex(11.9, 30, 360)).toBe(0);
    expect(nearestIndex(12, 30, 360)).toBe(1);
    expect(nearestIndex(359, 30, 360)).toBe(29);
  });

  it('clamps past either edge', () => {
    expect(nearestIndex(-50, 7, 350)).toBe(0);
    expect(nearestIndex(350, 7, 350)).toBe(6);
    expect(nearestIndex(9999, 30, 350)).toBe(29);
  });

  it('is 0 with nothing to choose from', () => {
    expect(nearestIndex(10, 0, 350)).toBe(0);
    expect(nearestIndex(10, 7, 0)).toBe(0);
  });
});

describe('pointY', () => {
  it('puts the largest value at the top inset', () => {
    expect(pointY(5000, 5000)).toBe(chart.plotInset);
  });

  it('puts zero at the bottom inset', () => {
    expect(pointY(0, 5000)).toBe(chart.plotHeight - chart.plotInset);
  });

  it('scales in between', () => {
    expect(pointY(2500, 5000)).toBe(chart.plotHeight / 2);
  });

  it('sits on the baseline when everything is zero (max 0)', () => {
    expect(pointY(0, 0)).toBe(chart.plotHeight - chart.plotInset);
  });
});
