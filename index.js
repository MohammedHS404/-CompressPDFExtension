document.addEventListener("DOMContentLoaded", function () {
  console.log("Content script loaded");

  const fileInput = document.getElementById("file");
  const compressButton = document.getElementById("compress");
  const downloadLink = document.getElementById("download");

  let fileData;

  compressButton.addEventListener("click", () => {
    if (!fileData) {
      alert("Please select a file.");
      return;
    }

    compressPDF(fileData.url, fileData.name);
  });

  fileInput.addEventListener("change", () => {
    downloadLink.hidden = true;

    if (fileInput.files.length === 0) {
      compressButton.disabled = true;
      return false;
    } else {
      compressButton.disabled = false;
    }

    if (fileInput.files.length > 1) {
      alert("Please select only one file.");
      fileInput.value = "";
      return false;
    }

    if (fileInput.files[0].type !== "application/pdf") {
      alert("Please select a PDF file.");
      fileInput.value = "";
      return false;
    }

    const file = fileInput.files[0];

    const url = window.URL.createObjectURL(file);

    fileData = { url: url, name: file.name };
  });
});

async function compressPDF(pdf, filename) {
  const dataObject = { psDataURL: pdf, filename: filename };
  console.log("Sending data to wasm");
  _GSPS2PDF(
    dataObject,
    (response) => {
      console.log("Received response from wasm");
      console.log(response);
      loadPDFData(response);
    },
    (isComplete, current, total) => {
      console.log("Progress: ", current, total);
    },
    (status) => {
      console.log("Status: ", status);
    }
  );
}

function loadPDFData(response) {
  fetch(response.pdfDataURL)
    .then((response) => response.arrayBuffer())
    .then((buffer) => {
      window.URL.revokeObjectURL(response.pdfDataURL);
      var blob = new Blob([buffer], { type: "application/pdf" });
      var pdfURL = window.URL.createObjectURL(blob);
      var filename = response.fileName;

      const downloadLink = document.getElementById("download");

      downloadLink.href = pdfURL;

      downloadLink.download = filename;

      downloadLink.hidden = false;
    });
}

function loadScript(url, onLoadCallback) {
  // Adding the script tag to the head as suggested before
  var head = document.head;
  var script = document.createElement("script");
  script.type = "text/javascript";
  script.src = url;

  // Then bind the event to the callback function.
  // There are several events for cross browser compatibility.
  //script.onreadystatechange = callback;
  script.onload = onLoadCallback;

  // Fire the loading
  head.appendChild(script);
}

var Module;

function _GSPS2PDF(
  dataStruct,
  responseCallback,
  progressCallback,
  statusUpdateCallback
) {
  console.log("Fetch started");
  console.log("dataStruct", dataStruct);

  fetch(dataStruct.psDataURL)
    .then((response) => {
      console.log("First Fetch completed successfully");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.arrayBuffer();
    })
    .then((arrayBuffer) => {
      console.log("Second Fetch completed successfully");

      window.URL.revokeObjectURL(dataStruct.psDataURL);

      Module = {
        preRun: [
          function () {
            console.log("Pre run");
            FS.writeFile("input.pdf", new Uint8Array(arrayBuffer));
          },
        ],
        postRun: [
          function () {
            console.log("Post run");
            var uarray = FS.readFile("output.pdf", {
              encoding: "binary",
            });
            var blob = new Blob([uarray], {
              type: "application/octet-stream",
            });
            var pdfDataURL = window.URL.createObjectURL(blob);
            responseCallback({
              pdfDataURL: pdfDataURL,
              fileName: dataStruct.fileName,
            });
          },
        ],
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
        print: function (text) {
          statusUpdateCallback(text);
        },
        printErr: function (text) {
          statusUpdateCallback("Error: " + text);
          console.error("Error: " + text);
        },
        setStatus: function (text) {
          if (!Module.setStatus.last)
            Module.setStatus.last = { time: Date.now(), text: "" };
          if (text === Module.setStatus.last.text) return;
          var m = text.match(/([^(]+)\((\d+(\.\d+)?)\/(\d+)\)/);
          var now = Date.now();
          if (m && now - Module.setStatus.last.time < 30)
            // if this is a progress update, skip it if too soon
            return;
          Module.setStatus.last.time = now;
          Module.setStatus.last.text = text;
          if (m) {
            text = m[1];
            progressCallback(false, parseInt(m[2]) * 100, parseInt(m[4]) * 100);
          } else {
            progressCallback(true, 0, 0);
          }
          statusUpdateCallback(text);
        },
        totalDependencies: 0,
        noExitRuntime: 1,
      };

      Module.setStatus("Loading Postscript Converter...");

      loadScript("gs-worker.js", null);
    })
    .catch((error) => {
      console.error("Fetch error: ", error);
    });
}
