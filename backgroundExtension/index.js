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
    const response = await _GSPS2PDF(dataObject, showProgress, updateStatus);
    const processedPDF = await loadPDFData(response);
    console.log("PDF successfully compressed:", processedPDF);
  } catch (error) {
    console.error("Error during PDF compression:", error);
  }
}

function showProgress(isComplete, current, total) {
  console.log(`Progress: ${current} / ${total}`);
}

function updateStatus(status) {
  const statusElement = document.getElementById("status");
  statusElement.textContent = status;
}

async function loadPDFData(response) {
  const buffer = await fetch(response.pdfDataURL).then((res) =>
    res.arrayBuffer()
  );
  window.URL.revokeObjectURL(response.pdfDataURL);

  const blob = new Blob([buffer], { type: "application/pdf" });
  const pdfURL = window.URL.createObjectURL(blob);

  const downloadLink = document.getElementById("download");
  configureDownloadLink(downloadLink, pdfURL, response.fileName);
}

function configureDownloadLink(link, url, filename) {
  link.href = url;
  link.download = filename;
  link.hidden = false;
}

function loadScript(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = url;

    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load script: ${url}`));

    document.head.appendChild(script);
  });
}

// listen for revoke URL callback from worker

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "revokeURL") {
    window.URL.revokeObjectURL(message.url);
  }
});

function _GSPS2PDF(dataStruct, progressCallback, statusUpdateCallback) {
  // listen for progress callback from worker

  chrome.runtime.onMessage.addListener(handleOnProgressListenerCallback);

  function handleOnProgressListenerCallback(message) {
    if (message.type === "progress") {
      progressCallback(message.isComplete, message.current, message.total);
    }
  }

  // listen for status update callback from worker

  chrome.runtime.onMessage.addListener(handleOnStatusUpdateListenerCallback);

  function handleOnStatusUpdateListenerCallback(message) {
    if (message.type === "status") {
      statusUpdateCallback(message.status);
    }
  }

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: "GSPS2PDF",
        dataStruct: dataStruct,
      },
      (response) => {
        if (response.success) {
          resolve(response.data);
        } else {
          reject(new Error(response.error));
        }

        chrome.runtime.onMessage.removeListener(
          handleOnProgressListenerCallback
        );
        
        chrome.runtime.onMessage.removeListener(
          handleOnStatusUpdateListenerCallback
        );
      }
    );
  });
}

var Module;

function runWasmConverter(
  arrayBuffer,
  dataStruct,
  progressCallback,
  statusUpdateCallback
) {
  return new Promise((resolve, reject) => {
    Module = {
      preRun: [() => FS.writeFile("input.pdf", new Uint8Array(arrayBuffer))],
      postRun: [() => resolveOutputFile(dataStruct, resolve, reject)],
      arguments: [
        "-sDEVICE=pdfwrite",
        "-dCompatibilityLevel=1.4",
        "-dPDFSETTINGS=/ebook",
        "-DNOPAUSE",
        "-dQUIET",
        "-dBATCH",
        "-sOutputFile=output.pdf",
        "input.pdf",
      ],
      print: statusUpdateCallback,
      printErr: (text) => {
        console.error("Error:", text);
        statusUpdateCallback("Error: " + text);
      },
      setStatus: createStatusHandler(progressCallback, statusUpdateCallback),
      noExitRuntime: 1,
    };

    loadWasmScript(Module, reject);
  });
}

function resolveOutputFile(dataStruct, resolve, reject) {
  try {
    const outputData = FS.readFile("output.pdf", { encoding: "binary" });
    const blob = new Blob([outputData], { type: "application/octet-stream" });
    const pdfDataURL = window.URL.createObjectURL(blob);

    resolve({ pdfDataURL, fileName: dataStruct.filename });
  } catch (error) {
    reject(new Error("Error reading output file: " + error.message));
  }
}

function createStatusHandler(progressCallback, statusUpdateCallback) {
  return function (text) {
    const match = text.match(/([^(]+)\((\d+(\.\d+)?)\/(\d+)\)/);
    if (match) {
      progressCallback(
        false,
        parseInt(match[2]) * 100,
        parseInt(match[4]) * 100
      );
    } else {
      progressCallback(true, 0, 0);
    }
    statusUpdateCallback(text);
  };
}

function loadWasmScript(Module, reject) {
  Module.setStatus("Loading ghost script...");
  loadScript("gs-worker.js")
    .then(() => console.log("Script loaded successfully"))
    .catch((error) =>
      reject(new Error("Failed to load script: " + error.message))
    );
}
