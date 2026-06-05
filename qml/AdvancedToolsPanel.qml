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
        Flow {
            width: parent.width; spacing: 8
            Button {
                text: "Organize Stacked Files"
                enabled: root.scanReady && root.directory !== "" && !organizer.running
                onClicked: organizer.organizeStacked(root.directory)
            }
            Button {
                text: "Remove .jpg Files"
                enabled: root.scanReady && root.directory !== "" && !organizer.running
                onClicked: organizer.removeJpg(root.directory)
            }
            Button {
                text: "Siril Prep"
                enabled: root.scanReady && root.directory !== "" && !organizer.running
                onClicked: organizer.sirilPrep(root.directory)
            }
            Button {
                text: "Remove Empty Folders"
                enabled: root.scanReady && root.directory !== "" && !organizer.running
                onClicked: organizer.removeEmptyFolders(root.directory)
            }
        }
        Text {
            id: organizerStatus
            text: organizer.statusText
            color: window.sysPal.placeholderText; font.pixelSize: 13
            visible: text !== ""; wrapMode: Text.WordWrap; width: parent.width
        }
        Item { width: 1; height: 4 }
    }

    Connections {
        target: organizer
        function onOperationCompleted(result) {
            if (result.message) organizerStatus.text = result.message
        }
        function onOperationError(error) {
            organizerStatus.text = "Error: " + error
        }
    }
}
