import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Item {
    id: root
    implicitHeight: 24
    implicitWidth: 200

    property bool scannerRunning: false
    property bool organizerRunning: false

    RowLayout {
        anchors.fill: parent
        spacing: 8

        ProgressBar {
            Layout.fillWidth: true
            indeterminate: root.scannerRunning || root.organizerRunning
            value: 0
            from: 0
            to: 1
        }

        Text {
            text: root.scannerRunning
                  ? "Scanning… " + scanner.filesProcessed + " files"
                  : root.organizerRunning
                    ? organizer.statusText
                    : ""
            color: "#b2bac2"
            font.pixelSize: 12
            visible: root.scannerRunning || root.organizerRunning
        }
    }
}
