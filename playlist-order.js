(function attachPlaylistOrdering(root) {
  "use strict";

  function compareRecentSeries(a, b) {
    const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return bTime - aTime;
  }

  function normalizePlaylistOrder(series, savedOrder = []) {
    const seriesById = new Map(series.map((item) => [item.id, item]));
    const seen = new Set();
    const order = [];

    for (const id of Array.isArray(savedOrder) ? savedOrder : []) {
      if (!seriesById.has(id) || seen.has(id)) continue;
      seen.add(id);
      order.push(id);
    }

    const missing = series
      .filter((item) => !seen.has(item.id))
      .sort(compareRecentSeries);
    for (const item of missing) order.push(item.id);
    return order;
  }

  function sortSeriesByPlaylistOrder(series, savedOrder = []) {
    const positions = new Map(
      normalizePlaylistOrder(series, savedOrder).map((id, index) => [id, index]),
    );
    return [...series].sort(
      (a, b) => positions.get(a.id) - positions.get(b.id),
    );
  }

  function reorderVisiblePlaylistOrder(
    allOrder,
    visibleIds,
    draggedId,
    targetId,
    placement,
  ) {
    if (
      draggedId === targetId ||
      !visibleIds.includes(draggedId) ||
      !visibleIds.includes(targetId)
    ) {
      return [...allOrder];
    }

    const reorderedVisible = visibleIds.filter((id) => id !== draggedId);
    const targetIndex = reorderedVisible.indexOf(targetId);
    const insertIndex = targetIndex + (placement === "after" ? 1 : 0);
    reorderedVisible.splice(insertIndex, 0, draggedId);

    const visibleSet = new Set(visibleIds);
    let visibleIndex = 0;
    return allOrder.map((id) =>
      visibleSet.has(id) ? reorderedVisible[visibleIndex++] : id,
    );
  }

  root.CuratPlaylistOrder = {
    normalizePlaylistOrder,
    sortSeriesByPlaylistOrder,
    reorderVisiblePlaylistOrder,
  };
})(typeof window !== "undefined" ? window : globalThis);
