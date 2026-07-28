async function waitForCuratTest(check, timeout = 2000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const result = check();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("テストデータの反映がタイムアウトしました");
}

async function loadCuratTestData(frame, data) {
  const appWindow = frame.contentWindow;
  const appDocument = frame.contentDocument;
  const input = appDocument.querySelector("#restoreInput");
  const transfer = new appWindow.DataTransfer();
  const payload = {
    app: "CURAT",
    version: 1,
    exportedAt: new Date().toISOString(),
    data,
  };
  transfer.items.add(
    new appWindow.File(
      [JSON.stringify(payload)],
      "curat-test-backup.json",
      { type: "application/json" },
    ),
  );
  input.files = transfer.files;
  input.dispatchEvent(new appWindow.Event("change", { bubbles: true }));
  await waitForCuratTest(
    () => appDocument.querySelectorAll("[data-project-series]").length === data.series.length,
  );
}

async function exportCuratTestData(frame) {
  const appWindow = frame.contentWindow;
  const appDocument = frame.contentDocument;
  let exportedBlob = null;
  const originalCreateObjectURL = appWindow.URL.createObjectURL;
  const originalRevokeObjectURL = appWindow.URL.revokeObjectURL;
  const originalAnchorClick = appWindow.HTMLAnchorElement.prototype.click;

  appWindow.URL.createObjectURL = (blob) => {
    exportedBlob = blob;
    return "blob:curat-test";
  };
  appWindow.URL.revokeObjectURL = () => {};
  appWindow.HTMLAnchorElement.prototype.click = () => {};
  try {
    appDocument.querySelector("#downloadSave").click();
    if (!exportedBlob) throw new Error("エクスポートデータを取得できませんでした");
    return JSON.parse(await exportedBlob.text()).data;
  } finally {
    appWindow.URL.createObjectURL = originalCreateObjectURL;
    appWindow.URL.revokeObjectURL = originalRevokeObjectURL;
    appWindow.HTMLAnchorElement.prototype.click = originalAnchorClick;
  }
}
