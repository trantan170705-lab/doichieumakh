import { ComparisonResult, ProcessedItem } from '../types';

export const cleanInput = (input: string): string[] => {
  return input.split(/\r?\n/).map(line => line.trim());
};

export const compareLists = (rawA: string, rawB: string): ComparisonResult => {
  const listA = cleanInput(rawA);
  const listB = cleanInput(rawB);

  // Frequency map for A
  const expectedA = new Map<string, number>();
  listA.filter(Boolean).forEach(x => {
    expectedA.set(x, (expectedA.get(x) || 0) + 1);
  });

  const matchedA = new Map<string, number>();

  const inBOnly: string[] = [];
  const intersection: string[] = [];

  const processedB: ProcessedItem[] = listB.map((val, idx) => {
    if (!val) {
      return { value: val, originalIndex: idx, existsInOther: false, isValid: false, isDuplicate: false };
    }

    const expected = expectedA.get(val) || 0;
    const matched = matchedA.get(val) || 0;

    let isMatch = false;
    if (matched < expected) {
      isMatch = true;
      intersection.push(val);
      matchedA.set(val, matched + 1);
    } else {
      // It exceeds the expected count in A, or doesn't exist in A
      inBOnly.push(val);
    }

    return {
      value: val,
      originalIndex: idx,
      existsInOther: isMatch,
      isValid: true,
      isDuplicate: false // computed below
    };
  });

  // Compute isDuplicate for processedB based on appearance in B
  const seenB = new Set<string>();
  processedB.forEach(p => {
    if (p.isValid) {
      p.isDuplicate = seenB.has(p.value);
      seenB.add(p.value);
    }
  });

  const inAOnly: string[] = [];
  const usedA = new Map<string, number>();

  const processedA: ProcessedItem[] = listA.map((val, idx) => {
    if (!val) {
      return { value: val, originalIndex: idx, existsInOther: false, isValid: false, isDuplicate: false };
    }

    const totalMatched = matchedA.get(val) || 0;
    const used = usedA.get(val) || 0;

    let isMatch = false;
    if (used < totalMatched) {
      isMatch = true;
      usedA.set(val, used + 1);
    } else {
      // It was expected but never matched from B
      inAOnly.push(val);
    }

    return {
      value: val,
      originalIndex: idx,
      existsInOther: isMatch,
      isValid: true,
      isDuplicate: false // computed below
    };
  });

  const seenA = new Set<string>();
  processedA.forEach(p => {
    if (p.isValid) {
      p.isDuplicate = seenA.has(p.value);
      seenA.add(p.value);
    }
  });

  return {
    inAOnly,
    inBOnly,
    intersection,
    totalA: listA.filter(Boolean).length,
    totalB: listB.filter(Boolean).length,
    processedA,
    processedB
  };
};