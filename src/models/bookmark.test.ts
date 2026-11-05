import { describe, expect, it } from 'vitest';
import { createEmptyStore } from './bookmark';

describe('createEmptyStore', () => {
  it('returns an empty bookmark store with empty arrays', () => {
    const store = createEmptyStore();

    expect(store).toEqual({
      groups: [],
      bookmarks: [],
    });
  });

  it('creates a fresh store instance for each call', () => {
    const first = createEmptyStore();
    const second = createEmptyStore();

    first.groups.push({ name: 'Team' });

    expect(second.groups).toEqual([]);
    expect(second.bookmarks).toEqual([]);
  });
});
