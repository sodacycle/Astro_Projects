import QtQuick
import QtQuick.Controls
import "components"

Rectangle {
    id: root
    height: col.height + 32
    color:        window.sysPal.base
    border.color: window.sysPal.mid
    border.width: 1
    radius: 6

    signal jpgScanned(var rows)
    signal jpgCleared()

    // Expose advanced panel state and actions to the menu bar in main.qml
    property alias advancedVisible: advancedPanel.visible
    property alias jpgScanDone:     advancedPanel.jpgScanDone
    property alias jpgCount:        advancedPanel.jpgCount

    function logToConsole(msg) { advancedPanel.log(msg) }
    function clearJpgData()    { advancedPanel.clearJpgData() }

    function setStatus(msg) { statusText.text = msg }

    Column {
        id: col
        anchors.top:     parent.top
        anchors.left:    parent.left
        anchors.right:   parent.right
        anchors.margins: 16
        spacing: 12

        Text {
            text: "FITS Metadata Viewer"
            font.pixelSize: 28; font.bold: true
            color: window.sysPal.windowText
            width: parent.width
        }
        Text {
            text: "Select a directory with .fit files; subdirectories are automatically scanned."
            color: window.sysPal.placeholderText
            font.pixelSize: 14
            wrapMode: Text.WordWrap; width: parent.width
        }
        Row {
            spacing: 8
            Button {
                text: "Select Directory"
                ToolTip.visible: hovered
                ToolTip.delay: 500
                ToolTip.text: "Choose the folder containing your FITS files.\nSubdirectories are scanned automatically."
                onClicked: {
                    var dir = scanner.selectDirectory()
                    if (dir !== "") {
                        window.selectedDirectory = dir
                        statusText.text = "Directory selected. Ready to scan."
                    }
                }
            }
            Button {
                text: "Scan FIT"
                enabled: window.selectedDirectory !== "" && !scanner.running
                ToolTip.visible: hovered
                ToolTip.delay: 500
                ToolTip.text: "Scan the selected directory for FITS files\nand build metadata summaries."
                onClicked: {
                    statusText.text = ""
                    scanner.scanDirectory(window.selectedDirectory)
                }
            }
            Button {
                text: "Stop"
                enabled: scanner.running || organizer.running
                ToolTip.visible: hovered
                ToolTip.delay: 500
                ToolTip.text: "Cancel the current scan or file operation."
                onClicked: { scanner.cancel(); organizer.cancel() }
            }
            Button {
                text: advancedPanel.visible ? "Hide Advanced Tools" : "Advanced Tools"
                ToolTip.visible: hovered
                ToolTip.delay: 500
                ToolTip.text: "Show or hide file organisation tools such as\nSiril prep, stacked file sorting, and cleanup."
                onClicked: advancedPanel.visible = !advancedPanel.visible
            }
        }
        Text {
            text: window.selectedDirectory
            color: window.sysPal.placeholderText; font.pixelSize: 13
            visible: window.selectedDirectory !== ""
            elide: Text.ElideMiddle; width: parent.width
        }
        Text {
            id: statusText
            text: ""
            color: window.sysPal.placeholderText; font.pixelSize: 13
            visible: text !== ""; width: parent.width
            wrapMode: Text.WordWrap
        }
        ProgressIndicator {
            width: parent.width
            visible: scanner.running || organizer.running
            scannerRunning:   scanner.running
            organizerRunning: organizer.running
        }
        AdvancedToolsPanel {
            id: advancedPanel
            width: parent.width
            visible:   false
            directory: window.selectedDirectory
            scanReady: window.scanCompleted
            onJpgScanned: function(rows) { root.jpgScanned(rows) }
            onJpgCleared: root.jpgCleared()
        }
    }
}
