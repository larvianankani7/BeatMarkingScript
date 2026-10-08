//@target aftereffects

(function(thisObj) {

    var PROJECT_ROOT = File($.fileName).parent.parent;
    var PYTHON_SCRIPT = new File(PROJECT_ROOT.fsName + "/python/beat_pipeline.py");
    var TEMP_ROOT = new Folder(PROJECT_ROOT.fsName + "/temp");

    function log(msg) {
        $.writeln("[Beat Marker] " + msg);
    }

    function showError(msg) {
        alert("Beat Marker\n\n" + msg);
    }

    function getSelectedAudioLayer(comp) {
        if (!comp) {
            showError("Open a composition first.");
            return null;
        }

        if (comp.selectedLayers.length !== 1) {
            showError("Select exactly ONE audio layer.");
            return null;
        }

        var layer = comp.selectedLayers[0];

        if (!layer.hasAudio) {
            showError("The selected layer does not contain audio.");
            return null;
        }

        return layer;
    }

    function getUniqueFolder(parentFolder, name) {
        if (!parentFolder.exists) {
            parentFolder.create();
        }

        var folder = new Folder(parentFolder.fsName + "/" + name);

        if (!folder.exists) {
            folder.create();
            return folder;
        }

        var i = 1;

        while (true) {
            var candidate = new Folder(
                parentFolder.fsName + "/" + name + "_" + i
            );

            if (!candidate.exists) {
                candidate.create();
                return candidate;
            }

            i++;
        }
    }

    function renderAudio(comp, layer, outputFile, startTime, duration) {
        var audioStates = [];
        var rqItem = null;
        var renderFolder = outputFile.parent;
        var generatedFile = null;

        try {
            for (var i = 1; i <= comp.numLayers; i++) {
                var currentLayer = comp.layer(i);

                if (currentLayer.hasAudio) {
                    audioStates[i] = currentLayer.audioEnabled;

                    if (currentLayer !== layer) {
                        currentLayer.audioEnabled = false;
                    }
                }
            }

            layer.audioEnabled = true;

            rqItem = app.project.renderQueue.items.add(comp);

            rqItem.timeSpanStart = startTime;
            rqItem.timeSpanDuration = duration;

            var outputModule = rqItem.outputModule(1);

            outputModule.applyTemplate("AIFF 48kHz");
            outputModule.file = outputFile;

            log("Output path: " + outputFile.fsName);
            log("Render start: " + startTime);
            log("Render duration: " + duration);

            app.project.renderQueue.render();

            var files = renderFolder.getFiles();

            for (var j = 0; j < files.length; j++) {
                if (files[j] instanceof File) {
                    var name = files[j].name.toLowerCase();

                    if (
                        name.indexOf(".aiff") !== -1 ||
                        name.indexOf(".aif") !== -1 ||
                        name.indexOf(".wav") !== -1
                    ) {
                        generatedFile = files[j];
                        break;
                    }
                }
            }

        } catch (e) {
            throw new Error(
                "AE audio rendering failed.\n\n" +
                e.toString()
            );

        } finally {
            for (var k = 1; k <= comp.numLayers; k++) {
                var restoreLayer = comp.layer(k);

                if (restoreLayer.hasAudio) {
                    try {
                        restoreLayer.audioEnabled = audioStates[k];
                    } catch (restoreError) {}
                }
            }

            if (rqItem) {
                try {
                    rqItem.remove();
                } catch (removeError) {}
            }
        }

        if (!generatedFile) {
            var folderContents = renderFolder.getFiles();
            var debugList = "";

            for (var n = 0; n < folderContents.length; n++) {
                debugList += folderContents[n].name + "\n";
            }

            throw new Error(
                "AE finished rendering, but no audio file was created.\n\n" +
                "Expected:\n" +
                outputFile.fsName +
                "\n\n" +
                "Files found in temp folder:\n" +
                (debugList || "NONE")
            );
        }

        log("Generated audio: " + generatedFile.fsName);

        return generatedFile;
    }

    function runPython(inputFile, workDir) {
        if (!PYTHON_SCRIPT.exists) {
            throw new Error(
                "beat_pipeline.py was not found:\n\n" +
                PYTHON_SCRIPT.fsName
            );
        }

        var command =
            'cmd /c py "' +
            PYTHON_SCRIPT.fsName +
            '" "' +
            inputFile.fsName +
            '" "' +
            workDir.fsName +
            '"';

        log(command);

        var result = system.callSystem(command);

        log(result);

        return result;
    }

    function readTimestamps(file) {
        if (!file.exists) {
            throw new Error(
                "timestamps.json was not generated.\n\n" +
                file.fsName
            );
        }

        file.open("r");

        var text = file.read();

        file.close();

        var data;

        try {
            data = JSON.parse(text);
        } catch (e) {
            throw new Error(
                "Could not read timestamps.json.\n\n" +
                e.toString()
            );
        }

        if (!data.timestamps_seconds) {
            throw new Error(
                "timestamps.json does not contain timestamps_seconds."
            );
        }

        return data.timestamps_seconds;
    }

    function addMarkers(layer, timestamps, renderStart) {
        var markerProperty = layer.property("Marker");

        if (!markerProperty) {
            throw new Error(
                "Could not access the layer marker property."
            );
        }

        var added = 0;

        for (var i = 0; i < timestamps.length; i++) {
            var timestamp = Number(timestamps[i]);

            if (isNaN(timestamp)) {
                continue;
            }

            var markerTime = renderStart + timestamp;

            if (
                markerTime < layer.inPoint ||
                markerTime > layer.outPoint
            ) {
                continue;
            }

            var marker = new MarkerValue("Drum Beat");

            markerProperty.setValueAtTime(
                markerTime,
                marker
            );

            added++;
        }

        return added;
    }

    function runBeatMarker() {
        var comp = app.project.activeItem;

        if (!(comp instanceof CompItem)) {
            showError("Open a composition first.");
            return;
        }

        var layer = getSelectedAudioLayer(comp);

        if (!layer) {
            return;
        }

        if (!PYTHON_SCRIPT.exists) {
            showError(
                "Python pipeline not found:\n\n" +
                PYTHON_SCRIPT.fsName
            );
            return;
        }

        var renderStart = layer.inPoint;
        var renderDuration = layer.outPoint - layer.inPoint;

        if (renderDuration <= 0) {
            showError(
                "The selected layer has no valid duration."
            );
            return;
        }

        var workDir = getUniqueFolder(
            TEMP_ROOT,
            "beat_" + new Date().getTime()
        );

        var inputAudio = new File(
            workDir.fsName + "/input.aiff"
        );

        var timestampsFile = new File(
            workDir.fsName + "/timestamps.json"
        );

        app.beginUndoGroup("Beat Marker");

        try {
            statusText.text = "Rendering selected audio...";

            inputAudio = renderAudio(
                comp,
                layer,
                inputAudio,
                renderStart,
                renderDuration
            );

            statusText.text = "Running drum separation...";

            runPython(
                inputAudio,
                workDir
            );

            statusText.text = "Reading timestamps...";

            var timestamps = readTimestamps(
                timestampsFile
            );

            statusText.text = "Adding markers...";

            var added = addMarkers(
                layer,
                timestamps,
                renderStart
            );

            statusText.text =
                "Done — " +
                added +
                " markers added.";

            alert(
                "Beat Marker\n\n" +
                "Detected: " +
                timestamps.length +
                " events\n" +
                "Added: " +
                added +
                " markers"
            );

        } catch (e) {
            statusText.text = "Error.";

            showError(e.toString());

        } finally {
            app.endUndoGroup();

            try {
                workDir.remove();
            } catch (cleanupError) {
                log(
                    "Could not remove temp folder: " +
                    cleanupError.toString()
                );
            }
        }
    }

    function buildUI(thisObj) {
        var panel =
            thisObj instanceof Panel
                ? thisObj
                : new Window(
                    "palette",
                    "Beat Marker",
                    undefined,
                    {
                        resizeable: true
                    }
                );

        panel.orientation = "column";
        panel.alignChildren = ["fill", "top"];
        panel.spacing = 8;
        panel.margins = 12;

        var button = panel.add(
            "button",
            undefined,
            "Beat Marker"
        );

        button.preferredSize = [180, 35];

        var status = panel.add(
            "statictext",
            undefined,
            "Select one audio layer."
        );

        status.alignment = ["fill", "top"];

        button.onClick = function() {
            runBeatMarker();
        };

        panel.layout.layout(true);

        return panel;
    }

    var win = buildUI(thisObj);
    var statusText = win.children[1];

    if (win instanceof Window) {
        win.center();
        win.show();
    }

})(this);