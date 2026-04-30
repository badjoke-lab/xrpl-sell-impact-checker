export function buildSceneNodes(items, width, height) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const normalized = (Array.isArray(items) ? items : [])
    .map((item, index) => ({
      ...item,
      areaValue: Number.isFinite(Number(item.areaValue)) ? Math.max(0, Number(item.areaValue)) : 0,
      __inputIndex: index,
    }))
    .filter((item) => item.areaValue > 0)
    .sort((a, b) => b.areaValue - a.areaValue);

  const rects = binaryTreemap(normalized, 0, 0, safeWidth, safeHeight);
  return rects.map((rect, index) => {
    const { item, ...box } = rect;
    const { __inputIndex, ...cleanItem } = item;
    return {
      ...cleanItem,
      ...box,
      rank: index + 1,
      inputIndex: __inputIndex,
    };
  });
}

function binaryTreemap(items, x, y, width, height) {
  if (!items.length) return [];
  if (items.length === 1) {
    return [{ item: items[0], x, y, width, height }];
  }

  const total = sumArea(items);
  if (total <= 0) return [];

  const splitIndex = findBalancedSplit(items, total);
  const leftItems = items.slice(0, splitIndex);
  const rightItems = items.slice(splitIndex);
  const leftSum = sumArea(leftItems);
  const ratio = clamp(leftSum / total, 0.05, 0.95);

  if (width >= height) {
    const leftWidth = width * ratio;
    return [
      ...binaryTreemap(leftItems, x, y, leftWidth, height),
      ...binaryTreemap(rightItems, x + leftWidth, y, width - leftWidth, height),
    ];
  }

  const topHeight = height * ratio;
  return [
    ...binaryTreemap(leftItems, x, y, width, topHeight),
    ...binaryTreemap(rightItems, x, y + topHeight, width, height - topHeight),
  ];
}

function findBalancedSplit(items, total) {
  const half = total / 2;
  let acc = 0;
  for (let i = 0; i < items.length - 1; i += 1) {
    const next = acc + items[i].areaValue;
    if (next >= half) {
      const beforeGap = Math.abs(half - acc);
      const afterGap = Math.abs(next - half);
      return Math.max(1, afterGap <= beforeGap ? i + 1 : i);
    }
    acc = next;
  }
  return Math.max(1, Math.floor(items.length / 2));
}

function sumArea(items) {
  return items.reduce((sum, item) => sum + item.areaValue, 0);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
