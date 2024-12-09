let fileData;

document.addEventListener("DOMContentLoaded", init);

function init() {
  console.log("Content script loaded");

  const fileInput = document.getElementById("file");
  const compressButton = document.getElementById("compress");
  const downloadLink = document.getElementById("download");

  setupFileInput(fileInput, compressButton, downloadLink);
  setupCompressButton(compressButton);
}

function setupFileInput(fileInput, compressButton, downloadLink) {
  fileInput.addEventListener("change", () => {
    resetDownloadLink(downloadLink);
    handleFileInput(fileInput, compressButton);
  });
}

function resetDownloadLink(downloadLink) {
  downloadLink.hidden = true;
}

function handleFileInput(fileInput, compressButton) {
  if (fileInput.files.length === 0) {
    disableButton(compressButton);
    return;
  }

  if (fileInput.files.length > 1) {
    alert("Please select only one file.");
    fileInput.value = "";
    return;
  }

  const file = fileInput.files[0];
  if (file.type !== "application/pdf") {
    alert("Please select a PDF file.");
    fileInput.value = "";
    return;
  }

  enableButton(compressButton);
  prepareFileData(file);
}

function disableButton(button) {
  button.disabled = true;
}

function enableButton(button) {
  button.disabled = false;
}

function prepareFileData(file) {
  const url = window.URL.createObjectURL(file);
  fileData = { url, name: file.name };
}

function setupCompressButton(compressButton) {
  compressButton.addEventListener("click", () => {
    if (!fileData) {
      alert("Please select a file.");
      return;
    }

    compressPDF(fileData.url, fileData.name);
  });
}

async function compressPDF(pdfUrl, filename) {
  try {
    const dataObject = { psDataURL: pdfUrl, filename };
    const response = await _GSPS2PDF(dataObject);
    console.log("PDF successfully compressed:", response);
    const processedPDF = await loadPDFData(response);
    console.log("PDF successfully compressed:", processedPDF);
  } catch (error) {
    console.error("Error during PDF compression:", error);
  }
}

async function loadPDFData(url) {
  const buffer = await fetch(url).then((res) => res.arrayBuffer());
  window.URL.revokeObjectURL(url);

  const blob = new Blob([buffer], { type: "application/pdf" });
  const pdfURL = window.URL.createObjectURL(blob);

  const downloadLink = document.getElementById("download");
  configureDownloadLink(downloadLink, pdfURL, url.fileName);
}

function configureDownloadLink(link, url, filename) {
  link.href = url;
  link.download = filename;
  link.hidden = false;
}

function _GSPS2PDF(dataStruct) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(chrome.runtime.getURL("background-worker.js"), {
      type: "module",
    });

    function onMessage(e) {
      resolve(e.data);
      worker.removeEventListener("message", onMessage);
      setTimeout(() => worker.terminate(), 0);
    }

    worker.addEventListener("message", onMessage);

    worker.postMessage({ data: dataStruct, target: "wasm" });
  });
}
