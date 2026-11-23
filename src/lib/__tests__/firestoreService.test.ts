import { describe, expect, it } from 'vitest';
import { FieldValue, Timestamp, serverTimestamp } from 'firebase/firestore';
import { stripUndefinedDeep } from '../firestoreService';

describe('stripUndefinedDeep', () => {
  it('preserves serverTimestamp() FieldValue and Timestamp instances while removing undefined', () => {
    const ts = serverTimestamp();
    const concreteTs = Timestamp.fromMillis(1700000000000);
    const input = {
      name: 'Bergamota',
      density: undefined,
      nested: {
        supplier: undefined,
        notes: 'ok',
      },
      items: [{ a: 1, b: undefined }],
      createdAt: ts,
      existingAt: concreteTs,
    };

    const cleaned = stripUndefinedDeep(input);

    expect('density' in cleaned).toBe(false);
    expect('supplier' in cleaned.nested).toBe(false);
    expect('b' in cleaned.items[0]).toBe(false);
    expect(cleaned.createdAt).toBe(ts);
    expect(cleaned.createdAt instanceof FieldValue).toBe(true);
    expect(cleaned.existingAt).toBe(concreteTs);
    expect(cleaned.existingAt instanceof Timestamp).toBe(true);
  });
});
