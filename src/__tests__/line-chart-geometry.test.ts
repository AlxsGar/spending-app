import { pointX, pointY } from '@/components/ui/LineChart';
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
