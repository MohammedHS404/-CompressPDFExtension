function loadScript() {
  import("./gs-wasm.js");
}

var Module;

function _GSPS2PDF(dataStruct, responseCallback) {
  var xhr = new XMLHttpRequest();
  xhr.open("GET", dataStruct.psDataURL);
  xhr.responseType = "arraybuffer";
  xhr.onload = function () {
    console.log("onload");
    // release the URL
    self.URL.revokeObjectURL(dataStruct.psDataURL);
    //set up EMScripten environment
    Module = {
      preRun: [
        function () {
          console.log("preRun writing file");
          self.Module.FS.writeFile("input.pdf", new Uint8Array(xhr.response));
          console.log("preRun wrote file");
        },
      ],
      postRun: [
        function () {
          console.log("postRun");
          var uarray = self.Module.FS.readFile("output.pdf", {
            encoding: "binary",
          });
          var blob = new Blob([uarray], { type: "application/octet-stream" });
          var pdfDataURL = self.URL.createObjectURL(blob);
          responseCallback({ pdfDataURL: pdfDataURL, url: dataStruct.url });
        },
      ],
      arguments: [
        "-sDEVICE=pdfwrite",
        "-dCompatibilityLevel=1.4",
        "-dPDFSETTINGS=/screen",
        "-dNumRenderingThreads=4",
        "-dBandHeight=64",
        "-dBufferSpace=500000000",
        "-dColorConversionStrategy=/Gray",
        "-dProcessColorModel=/DeviceGray",
        "-dDownsampleGrayImages=true",
        "-dGrayImageResolution=92",
        "-dMonoImageResolution=92",
        "-dJPEGQ=40",
        "-dEmbedAllFonts=false",
        "-dSubsetFonts=false",
        "-dNOPAUSE",
        "-dQUIET",
        "-sOutputFile=output.pdf",
        "input.pdf",
      ],
      print: function (text) {
        console.log(text);
      },
      printErr: function (text) {
        console.error(text);
      },
      totalDependencies: 0,
      noExitRuntime: 1,
    };
    if (!self.Module) {
      console.log("no self.Module");
      self.Module = Module;
      loadScript();
    } else {
      console.log("self.Module");
      self.Module["calledRun"] = false;
      self.Module["postRun"] = Module.postRun;
      self.Module["preRun"] = Module.preRun;
      self.Module.callMain();
      console.log("self.Module.callMain()");
    }
  };
  xhr.send();
}

self.addEventListener("message", function ({ data: e }) {
  console.log("message", e);
  // e.data contains the message sent to the worker.
  if (e.target !== "wasm") {
    return;
  }
  console.log("Message received from main script", e.data);
  _GSPS2PDF(e.data, ({ pdfDataURL }) => self.postMessage(pdfDataURL));
});

console.log("Worker ready");
