const statusLine = document.querySelector(".status");
const estimateButton = document.querySelector(".primary-button");

estimateButton?.addEventListener("click", () => {
  if (statusLine) {
    statusLine.textContent = "Estimate queued. Connect data sources to compute.";
  }
});
