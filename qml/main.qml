import QtQuick
import QtQuick.Controls

ApplicationWindow {
    id: window
    title: "FITS Metadata Viewer v1.0 Beta"
    width: 1100
    height: 1000
    minimumWidth: 800
    minimumHeight: 600
    visible: true

    // Use the system window background color — picks up KDE/GTK theme
    color: palette.window

    property string selectedDirectory: ""
    property var    fullMetadataList:  []
    property bool   scanCompleted:     false

    // ── Menu bar ─────────────────────────────────────────────────────────────
    menuBar: MenuBar {

        // ── File ─────────────────────────────────────────────────────────────
        Menu {
            title: "&File"

            Action {
                text: "Open Directory…"
                shortcut: "Ctrl+O"
                onTriggered: {
                    var dir = scanner.selectDirectory()
                    if (dir !== "") {
                        window.selectedDirectory = dir
                        controlsPanel.setStatus("Directory selected. Ready to scan.")
                    }
                }
            }
            Action {
                text: "Scan FITS Files"
                shortcut: "Ctrl+Shift+S"
                enabled: window.selectedDirectory !== "" && !scanner.running && !organizer.running
                onTriggered: {
                    controlsPanel.setStatus("")
                    scanner.scanDirectory(window.selectedDirectory)
                }
            }
            MenuSeparator {}
            Action {
                text: "Stop"
                shortcut: "Ctrl+."
                enabled: scanner.running || organizer.running
                onTriggered: { scanner.cancel(); organizer.cancel() }
            }
            MenuSeparator {}
            Action {
                text: "Exit"
                shortcut: "Ctrl+Q"
                onTriggered: Qt.quit()
            }
        }

        // ── Tools ─────────────────────────────────────────────────────────────
        Menu {
            title: "&Tools"

            Menu {
                title: "Advanced Tools"

                Action {
                    id: advancedToolsAction
                    text: "Show Advanced Tools Panel"
                    checkable: true
                    checked: false
                    onTriggered: controlsPanel.advancedVisible = checked
                }
                Connections {
                    target: controlsPanel
                    function onAdvancedVisibleChanged() {
                        advancedToolsAction.checked = controlsPanel.advancedVisible
                    }
                }

                MenuSeparator {}

                Action {
                    text: "Organize Stacked Files"
                    enabled: window.selectedDirectory !== "" && !scanner.running && !organizer.running
                    onTriggered: {
                        controlsPanel.advancedVisible = true
                        controlsPanel.logToConsole("Organizing stacked files…")
                        organizer.organizeStacked(window.selectedDirectory)
                    }
                }
                Action {
                    text: "Siril Prep"
                    enabled: window.selectedDirectory !== "" && !scanner.running && !organizer.running
                    onTriggered: {
                        controlsPanel.advancedVisible = true
                        controlsPanel.logToConsole("Running Siril prep…")
                        organizer.sirilPrep(window.selectedDirectory)
                    }
                }
                Action {
                    text: "Remove Empty Folders"
                    enabled: window.selectedDirectory !== "" && !scanner.running && !organizer.running
                    onTriggered: {
                        controlsPanel.advancedVisible = true
                        controlsPanel.logToConsole("Removing empty folders…")
                        organizer.removeEmptyFolders(window.selectedDirectory)
                    }
                }

                MenuSeparator {}

                Menu {
                    title: "Scan for JPG Files"

                    Action {
                        text: "Scan for JPG Files"
                        enabled: window.selectedDirectory !== "" && !scanner.running && !organizer.running
                        onTriggered: {
                            controlsPanel.advancedVisible = true
                            controlsPanel.logToConsole("Scanning for JPG files…")
                            organizer.scanJpg(window.selectedDirectory)
                        }
                    }
                    MenuSeparator {}
                    Action {
                        text: "Delete JPG Files…"
                        enabled: controlsPanel.jpgScanDone && !organizer.running
                        onTriggered: menuDeleteJpgDialog.open()
                    }
                    Action {
                        text: "Clear JPG Results"
                        enabled: controlsPanel.jpgScanDone && !organizer.running
                        onTriggered: controlsPanel.clearJpgData()
                    }
                }
            }
        }

        // ── View ──────────────────────────────────────────────────────────────
        Menu {
            title: "&View"

            Action {
                text: "Open in Viewer"
                enabled: fileDetailsView.selectedFilePath !== ""
                onTriggered: viewerManager.openFile(fileDetailsView.selectedFilePath)
            }
            Action {
                text: "Reject Selected File"
                enabled: fileDetailsView.selectedFilePath !== ""
                onTriggered: menuRejectFileDialog.open()
            }
            Action {
                text: "Delete Selected File…"
                enabled: fileDetailsView.selectedFilePath !== ""
                onTriggered: menuDeleteFileDialog.open()
            }
        }

        // ── Help ──────────────────────────────────────────────────────────────
        Menu {
            title: "&Help"

            Action {
                text: "About FITS Metadata Viewer…"
                onTriggered: aboutDialog.open()
            }
        }
    }

    // ── About dialog ──────────────────────────────────────────────────────────
    AboutDialog { id: aboutDialog }

    // ── Reject selected file dialog ───────────────────────────────────────────
    Dialog {
        id: menuRejectFileDialog
        parent: Overlay.overlay
        anchors.centerIn: parent
        modal: true
        title: "Reject File"
        standardButtons: Dialog.Ok | Dialog.Cancel

        Column {
            spacing: 10; width: 420
            Text {
                width: parent.width
                text: "Move to the rejected folder:\n" + fileDetailsView.selectedFileName
                color: window.sysPal.windowText
                wrapMode: Text.WordWrap; font.pixelSize: 13
            }
            Text {
                width: parent.width
                text: fileDetailsView.selectedFilePath
                color: window.sysPal.placeholderText
                font.pixelSize: 11; wrapMode: Text.WrapAnywhere
            }
        }

        onAccepted: {
            var path = fileDetailsView.selectedFilePath
            var newPath = organizer.rejectFile(path)
            if (newPath !== "") {
                fileDetailsView.removeRow(path)
                fileDetailsView.selectedFilePath = ""
                fileDetailsView.selectedFileName  = ""
            }
        }
    }

    // ── Delete selected file dialog ───────────────────────────────────────────
    Dialog {
        id: menuDeleteFileDialog
        parent: Overlay.overlay
        anchors.centerIn: parent
        modal: true
        title: "Delete File"
        standardButtons: Dialog.Ok | Dialog.Cancel

        Column {
            spacing: 10; width: 420
            Text {
                width: parent.width
                text: "Permanently delete:\n" + fileDetailsView.selectedFileName
                color: window.sysPal.windowText
                wrapMode: Text.WordWrap; font.pixelSize: 13
            }
            Text {
                width: parent.width
                text: fileDetailsView.selectedFilePath
                color: window.sysPal.placeholderText
                font.pixelSize: 11; wrapMode: Text.WrapAnywhere
            }
            Text {
                text: "This action cannot be undone."
                color: "#cc3300"; font.pixelSize: 13; font.bold: true
            }
        }

        onAccepted: {
            var path = fileDetailsView.selectedFilePath
            if (organizer.deleteFile(path)) {
                fileDetailsView.removeRow(path)
                fileDetailsView.selectedFilePath = ""
                fileDetailsView.selectedFileName  = ""
            }
        }
    }

    // ── JPG delete dialog (triggered from menu) ───────────────────────────────
    Dialog {
        id: menuDeleteJpgDialog
        parent: Overlay.overlay
        anchors.centerIn: parent
        modal: true
        title: "Delete JPG Files"
        standardButtons: Dialog.Ok | Dialog.Cancel

        Column {
            spacing: 10
            width: 380
            Text {
                width: parent.width
                text: "Permanently delete " + controlsPanel.jpgCount +
                      " JPG file(s) from:\n" + window.selectedDirectory
                color: window.sysPal.windowText
                wrapMode: Text.WordWrap; font.pixelSize: 13
            }
            Text {
                text: "This action cannot be undone."
                color: "#cc3300"; font.pixelSize: 13; font.bold: true
            }
        }

        onAccepted: {
            controlsPanel.logToConsole("Deleting " + controlsPanel.jpgCount + " JPG file(s)…")
            organizer.removeJpg(window.selectedDirectory)
        }
    }

    // Single SystemPalette instance shared by all child panels via window.sysPal
    // Qt automatically updates this when the user changes the desktop theme.
    SystemPalette {
        id: sysPalette
        colorGroup: SystemPalette.Active
    }

    // Expose palette to child QML via the window id so panels don't each
    // need their own SystemPalette object.
    readonly property SystemPalette sysPal: sysPalette

    ScrollView {
        id: scrollView
        anchors.fill: parent
        clip: true
        ScrollBar.horizontal.policy: ScrollBar.AlwaysOff

        Column {
            width: scrollView.width
            spacing: 8
            topPadding: 12
            bottomPadding: 16

            ControlsPanel {
                id: controlsPanel
                anchors.left:    parent.left
                anchors.right:   parent.right
                anchors.margins: 12
                onJpgScanned: function(rows) {
                    fileDetailsView.allRows = rows
                }
                onJpgCleared: {
                    fileDetailsView.allRows = window.fullMetadataList
                    imagingCalendar.activeCatalogFilter = ""
                    imagingCalendar.activeTargetFilter  = ""
                    imagingCalendar.buildCalendar(window.fullMetadataList)
                }
            }
            // Target Summary (fixed width, ends at Total Integration Time) sits
            // to the left; Catalog Breakdown fills the remaining space to its right.
            Item {
                anchors.left:    parent.left
                anchors.right:   parent.right
                anchors.margins: 12
                height: Math.max(targetSummaryView.height, catalogBreakdown.height)

                TargetSummaryView {
                    id: targetSummaryView
                    anchors.top:  parent.top
                    anchors.left: parent.left
                    // width is self-determined by the component (colW sum + margins)
                    onTargetSelected: function(name) {
                        imagingCalendar.activeTargetFilter  = name
                        imagingCalendar.activeCatalogFilter = ""
                        imagingCalendar.buildCalendar(window.fullMetadataList)
                        fileDetailsView.filterByTarget(name)
                    }
                }

                CatalogBreakdown {
                    id: catalogBreakdown
                    anchors.top:         parent.top
                    anchors.left:        targetSummaryView.right
                    anchors.leftMargin:  2
                    anchors.right:       parent.right
                    onCatalogSelected: function(name) {
                        imagingCalendar.activeCatalogFilter = name
                        imagingCalendar.activeTargetFilter  = ""
                        imagingCalendar.buildCalendar(window.fullMetadataList)
                        fileDetailsView.filterByCatalog(name)
                    }
                }
            }
            ImagingCalendar {
                id: imagingCalendar
                anchors.left:    parent.left
                anchors.right:   parent.right
                anchors.margins: 12
            }
            CalibrationSummaryView {
                id: calibrationSummaryView
                anchors.left:    parent.left
                anchors.right:   parent.right
                anchors.margins: 12
            }
            FileDetailsView {
                id: fileDetailsView
                anchors.left:    parent.left
                anchors.right:   parent.right
                anchors.margins: 12
                height: 500
                onShowAllRequested: {
                    imagingCalendar.activeCatalogFilter = ""
                    imagingCalendar.activeTargetFilter  = ""
                    imagingCalendar.buildCalendar(window.fullMetadataList)
                }
                onFileOpenRequested: function(path, name) {
                    viewerManager.openFile(path)
                }
            }
        }
    }

    // Viewer window + rejection session state, extracted to keep main.qml lean.
    FitsViewerManager {
        id: viewerManager
        transientParent:    window
        displayRows:        fileDetailsView.displayRows
        onRemoveRowRequested: function(path) { fileDetailsView.removeRow(path) }
    }

    Connections {
        target: scanner
        function onScanCompleted(metaList, targetList, calList) {
            window.fullMetadataList = metaList
            window.scanCompleted    = true
            controlsPanel.setStatus("Found " + metaList.length + " FITS files.")
            fileDetailsView.allRows = metaList
            imagingCalendar.buildCalendar(metaList)
        }
        function onScanError(error) {
            controlsPanel.setStatus("Scan error: " + error)
        }
    }
}
