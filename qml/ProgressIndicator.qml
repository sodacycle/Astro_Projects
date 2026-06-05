import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Item {
    id: root
    implicitHeight: 28
    implicitWidth:  200

    property bool scannerRunning:   false
    property bool organizerRunning: false

    RowLayout {
        anchors.fill: parent
        spacing: 8

        ProgressBar {
            Layout.fillWidth: true
            indeterminate: root.scannerRunning || root.organizerRunning
            from: 0; to: 1; value: 0
        }

        Text {
            text: root.scannerRunning
                  ? (scanner.filesProcessed > 0
                     ? "Scanning… " + scanner.filesProcessed + " files"
                     : "Starting scan…")
                  : root.organizerRunning ? organizer.statusText : ""
            color: window.sysPal.placeholderText
            font.pixelSize: 12
            visible: root.scannerRunning || root.organizerRunning
            elide: Text.ElideRight
            Layout.fillWidth: true
        }
    }
}
