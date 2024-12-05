import wasmModule from "./gs-wasm.js";

async function GSPS2PDF(dataStruct) {
  try {
    const response = await fetch(dataStruct.psDataURL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();

    chrome.runtime.sendMessage({
      type: "revokeURL",
      url: dataStruct.psDataURL,
    });

    const progressCallback = (isComplete, current, total) => {
      chrome.runtime.sendMessage({
        type: "progress",
        isComplete,
        current,
        total,
      });
    };

    const statusUpdateCallback = (status) => {
      chrome.runtime.sendMessage({
        type: "status",
        status,
      });
    };

    return await runWasmConverter(
      arrayBuffer,
      dataStruct,
      progressCallback,
      statusUpdateCallback
    );
  } catch (error) {
    console.error("Error in GSPS2PDF:", error);
    throw error;
  }
}

function runWasmConverter(
  arrayBuffer,
  dataStruct,
  progressCallback,
  statusUpdateCallback
) {
  return new Promise((resolve, reject) => {
    const Module = {
      preRun: [() => fs.writeFile("input.pdf", new Uint8Array(arrayBuffer))],
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
    const pdfDataURL = URL.createObjectURL(blob);

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
  try {
    Module.setStatus("Loading ghost script...");
    wasmModule(Module);
    console.log("Script loaded successfully");
  } catch (error) {
    reject(new Error("Failed to load script: " + error.message));
  }
}

// Export the function to be accessible from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "GSPS2PDF") {
    console.log("Received GSPS2PDF request");
    console.log(request);
    GSPS2PDF(request.dataStruct)
      .then((result) => {
        sendResponse({ success: true, data: result });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Will respond asynchronously
  }
});
