import QtQuick
import QtQuick.Controls

Rectangle {
    id: root
    height: col.height + 32
    color:        window.sysPal.alternateBase
    border.color: window.sysPal.mid
    border.width: 1
    radius: 6

    property string directory: ""
    property bool   scanReady: false
    property bool   jpgScanDone: false
    property int    jpgCount: 0

    signal jpgScanned(var rows)
    signal jpgCleared()

    Column {
        id: col
        anchors.top:     parent.top
        anchors.left:    parent.left
        anchors.right:   parent.right
        anchors.margins: 16
        spacing: 12

        Text {
            text: "Advanced Tools"
            font.pixelSize: 16; font.bold: true
            color: window.sysPal.windowText; width: parent.width
        }

        // --- Main tools row ---
        Flow {
            width: parent.width; spacing: 8
            Button {
                text: "Organize Stacked Files"
                enabled: root.scanReady && root.directory !== "" && !organizer.running
                ToolTip.visible: hovered; ToolTip.delay: 500
                ToolTip.text: "Move stacked FITS files (detected by header keywords\nor filename prefix) into a 'Stacked' subfolder."
                onClicked: organizer.organizeStacked(root.directory)
            }
            Button {
                text: "Scan for .jpg Files"
                enabled: root.scanReady && root.directory !== "" && !organizer.running
                ToolTip.visible: hovered; ToolTip.delay: 500
                ToolTip.text: "Search for JPG files in the selected directory.\nResults load into the File Details table below."
                onClicked: organizer.scanJpg(root.directory)
            }
            Button {
                text: "Siril Prep"
                enabled: root.scanReady && root.directory !== "" && !organizer.running
                ToolTip.visible: hovered; ToolTip.delay: 500
                ToolTip.text: "Rename and arrange FITS files into the folder\nstructure expected by Siril for preprocessing."
                onClicked: organizer.sirilPrep(root.directory)
            }
            Button {
                text: "Remove Empty Folders"
                enabled: root.scanReady && root.directory !== "" && !organizer.running
                ToolTip.visible: hovered; ToolTip.delay: 500
                ToolTip.text: "Delete any empty folders found within the\nselected directory tree."
                onClicked: organizer.removeEmptyFolders(root.directory)
            }
        }

        // --- JPG action row — only visible after a scan that found files ---
        Row {
            spacing: 8
            visible: root.jpgScanDone

            Text {
                text: root.jpgCount + " JPG file(s) found —"
                color: window.sysPal.windowText; font.pixelSize: 13
                anchors.verticalCenter: parent.verticalCenter
            }
            Button {
                text: "Delete JPG Files"
                enabled: !organizer.running
                ToolTip.visible: hovered; ToolTip.delay: 500
                ToolTip.text: "Permanently delete all " + root.jpgCount + " JPG file(s).\nA confirmation prompt will appear first."
                onClicked: confirmDeleteDialog.open()
            }
            Button {
                text: "Clear JPG Data"
                enabled: !organizer.running
                ToolTip.visible: hovered; ToolTip.delay: 500
                ToolTip.text: "Clear JPG results and restore FITS file data."
                onClicked: {
                    root.jpgScanDone = false
                    root.jpgCount = 0
                    organizerStatus.text = ""
                    root.jpgCleared()
                }
            }
        }

        Text {
            id: organizerStatus
            text: ""
            color: window.sysPal.placeholderText; font.pixelSize: 13
            visible: text !== ""; wrapMode: Text.WordWrap; width: parent.width
        }
        Item { width: 1; height: 4 }
    }

    // --- Confirmation dialog for JPG deletion ---
    Dialog {
        id: confirmDeleteDialog
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
                text: "Permanently delete " + root.jpgCount + " JPG file(s) from:\n" + root.directory
                color: window.sysPal.windowText
                wrapMode: Text.WordWrap; font.pixelSize: 13
            }
            Text {
                text: "This action cannot be undone."
                color: "#cc3300"; font.pixelSize: 13; font.bold: true
            }
        }

        onAccepted: organizer.removeJpg(root.directory)
    }

    Connections {
        target: organizer

        function onOperationCompleted(result) {
            organizerStatus.text = result.message || ""

            if (result.operation === "scanJpg") {
                var rows = result.jpgFiles || []
                var count = rows.length || 0
                root.jpgCount = count
                root.jpgScanDone = count > 0
                if (count === 0) {
                    organizerStatus.text = "No JPG files found."
                } else {
                    root.jpgScanned(rows)
                }
            }

            if (result.operation === "removeJpg") {
                root.jpgScanDone = false
                root.jpgCount = 0
                root.jpgCleared()
            }
        }

        function onOperationError(error) {
            organizerStatus.text = "Error: " + error
        }
    }
}
